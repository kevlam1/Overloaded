// Where the cards of your hand go (Kevin, 2026-11-11): a fan, like an arena hand, but snappy like the white-cards reference. Plain numbers in and out, no browser code, so Node tests can
// load it (scripts/test-hand.mjs); frontend/src/hand-view.js puts the numbers on the cards.
//
//   - The cards sit next to each other, edge to edge up to 6 cards; from 7 they overlap like a real hand (the whole row only grows slowly with each card), and when even that is too wide
//     for the room they overlap more, evenly. The row is centred.
//   - Each card is turned a little, more toward the ends (a few degrees, fewer with a few cards), and the ends sit a little lower than the middle, so the row is a shallow arc.
//   - While a card of the hand is carried, the PLACES DO NOT CHANGE: the hand keeps as many places as it has cards (the carried card's own place counts), so nothing moves under the pointer when
//     the decision changes. The carried card is over one of those places (the hole); the other cards take the remaining places in order, and the ones beside the hole lean a little away from it.
//     Which place the carried card is over is decided from the pointer against the middles of the fixed places, with a dead zone so that a pointer resting on the line between two places
//     does not flip between them (the cause of the jitter an earlier version had, which opened a gap by re-laying out a row with one more place and decided against a different row).
// Positions are the card's left edge (x), how far it is dropped (y, pixels down) and its turn (angle, degrees, clockwise), for a card of cardWidth by cardHeight in a row width wide.

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
export const MAX_ANGLE = 9; // the turn of the outermost card of a full hand, degrees (6 until 2026-11-12: a lowered hand hides the bottom of the cards, where the turn shows most, and looked flat)
export const ARC_DROP = 0.1; // how far the ends of a full hand sit lower than the middle, as a fraction of a card's height (0.05 until 2026-11-12)
export const MIN_FAN = 0.35; // a hand of a few cards fans at least this much of the full fan
export const GAP_TILT = 7; // how far the card beside the hole leans away from it, degrees
export const GAP_REACH = 2; // how many cards on each side of the hole lean
export const EDGE_TO_EDGE = 6; // up to this many cards the hand is edge to edge (when there is room); from one more it overlaps
export const OVERLAP_GROWTH = 0.4; // each card past that adds this fraction of a card's width to the row (a hand of 10 is 7.6 cards wide, not 10)
export const HOLE_DEAD_ZONE = 0.25; // the pointer must be this fraction of a step past the middle of the next place before the hole moves there

// The distance from one card's left edge to the next's. Up to EDGE_TO_EDGE cards it is a card wide; with more the row is (EDGE_TO_EDGE + OVERLAP_GROWTH per extra card) cards wide, so the cards overlap;
// and it is squeezed further if even that does not fit slots cards in width. (Continuous at the change: 6 cards is a step of one card, 7 cards a little less.)
export function cardStep({ slots, width, cardWidth }) {
  if (slots <= 1) return 0;
  const natural = slots <= EDGE_TO_EDGE ? cardWidth : cardWidth * (EDGE_TO_EDGE - 1 + (slots - EDGE_TO_EDGE) * OVERLAP_GROWTH) / (slots - 1);
  return Math.max(0, Math.min(natural, (width - cardWidth) / (slots - 1)));
}

const round2 = (value) => Math.round(value * 100) / 100;

// The places of a hand of `count` cards: { step, slots: [{ x, y, angle }] }, one per card, left to right.
export function handLayout({ count, width, cardWidth, cardHeight }) {
  const n = Number.isInteger(count) && count > 0 ? count : 0;
  const step = cardStep({ slots: n, width, cardWidth });
  const rowWidth = n > 0 ? cardWidth + step * (n - 1) : 0;
  const startX = (width - rowWidth) / 2;
  const fan = clamp(n / 7, MIN_FAN, 1); // a few cards fan a little, a full hand fans fully
  const out = [];
  for (let k = 0; k < n; k++) {
    const t = n > 1 ? (k - (n - 1) / 2) / ((n - 1) / 2) : 0; // -1 at the left end, 1 at the right end
    out.push({ x: round2(startX + k * step), y: round2(t * t * cardHeight * ARC_DROP * fan), angle: round2(t * MAX_ANGLE * fan) });
  }
  return { step, slots: out };
}

// The places for the OTHER cards while one card of a hand of `total` is carried and is over place `hole` (0 to total - 1): total - 1 entries, in order. Card k takes place k if it is before the hole and
// k + 1 after it, so the places are exactly those of the whole hand; the cards within GAP_REACH places of the hole lean away from it, most for the nearest.
export function layoutAround({ total, width, cardWidth, cardHeight, hole }) {
  const all = handLayout({ count: total, width, cardWidth, cardHeight });
  const holeAt = clamp(Number.isInteger(hole) ? hole : 0, 0, Math.max(0, total - 1));
  const out = [];
  for (let k = 0; k < total - 1; k++) {
    const slot = k >= holeAt ? k + 1 : k;
    const place = all.slots[slot];
    const distance = Math.abs(slot - holeAt);
    const lean = distance >= 1 && distance <= GAP_REACH ? (slot < holeAt ? -1 : 1) * GAP_TILT * (1 - (distance - 1) / GAP_REACH) : 0;
    out.push({ x: place.x, y: place.y, angle: round2(place.angle + lean) });
  }
  return { step: all.step, slots: out };
}

// Which place (0 to total - 1) of a hand of `total` cards the carried card is over, for a pointer at x (in the row's coordinates). It is the place whose middle is nearest, but the hole only
// leaves `previous` when the pointer is HOLE_DEAD_ZONE of a step beyond the middle of the next place, so a pointer on the line between two places does not make it flip back and forth.
export function holeAt({ total, width, cardWidth, x, previous = null, deadZone = HOLE_DEAD_ZONE }) {
  const n = Number.isInteger(total) && total > 0 ? total : 0;
  if (n <= 1) return 0;
  const step = cardStep({ slots: n, width, cardWidth });
  const startX = (width - (cardWidth + step * (n - 1))) / 2;
  const middle = (k) => startX + k * step + cardWidth / 2;
  const nearest = () => {
    let best = 0;
    for (let k = 1; k < n; k++) if (Math.abs(x - middle(k)) < Math.abs(x - middle(best))) best = k;
    return best;
  };
  if (!Number.isInteger(previous) || previous < 0 || previous >= n) return nearest();
  // stay on `previous` while the pointer is within (half a step + the dead zone) of its middle
  const reach = step * (0.5 + deadZone);
  if (Math.abs(x - middle(previous)) <= reach) return previous;
  return nearest();
}

// A card of the hand that has been clicked comes up to be read, and the cards beside it move aside to make room (Kevin, 2026-11-12): the places of the others, with the cards within SPREAD_REACH
// places of the clicked one pushed away from it, most for the nearest. spots: the places in order, index: which of them is the clicked card (its own place does not change here: the page lifts it),
// cardWidth: how wide a card is. Returns new places; nothing is changed in place.
export const SPREAD = 0.55; // how far the nearest card moves aside, as a fraction of a card's width
export const SPREAD_REACH = 3; // how many cards on each side move aside
export function spreadAround({ spots, index, cardWidth }) {
  if (!Array.isArray(spots) || !Number.isInteger(index) || index < 0 || index >= spots.length) return Array.isArray(spots) ? spots.map((spot) => ({ ...spot })) : [];
  return spots.map((spot, k) => {
    const distance = Math.abs(k - index);
    if (distance < 1 || distance > SPREAD_REACH) return { ...spot };
    const push = cardWidth * SPREAD * (1 - (distance - 1) / SPREAD_REACH);
    return { ...spot, x: round2(spot.x + (k < index ? -push : push)) };
  });
}
