// Where the cards of your hand go (Kevin, 2026-11-11): a fan, like an arena hand, but snappy like the white-cards reference. Plain numbers in and out, no browser code, so Node tests can
// load it (scripts/test-hand-layout.mjs); frontend/src/hand-view.js puts the numbers on the cards.
//
//   - The cards sit next to each other, edge to edge up to 6 cards; from 7 they overlap like a real hand (the whole row only grows slowly with each card), and when even that is too wide
//     for the room they overlap more, evenly. The row is centred.
//   - Each card is turned a little, more toward the ends (a few degrees, fewer with a few cards), and the ends sit a little lower than the middle, so the row is a shallow arc.
//   - While a card of the hand is dragged a gap opens at the place it would go back to, and the cards next to the gap lean away from it, most for the nearest (as in the reference video).
// Positions are the card's left edge (x), how far it is dropped (y, pixels down) and its turn (angle, degrees, clockwise), for a card of cardWidth by cardHeight in a row width wide.

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
export const MAX_ANGLE = 6; // the turn of the outermost card of a full hand, degrees
export const GAP_TILT = 12; // how far the card beside the gap leans away from it, degrees
export const GAP_REACH = 3; // how many cards on each side of the gap lean
export const EDGE_TO_EDGE = 6; // up to this many cards the hand is edge to edge (when there is room); from one more it overlaps
export const OVERLAP_GROWTH = 0.4; // each card past that adds this fraction of a card's width to the row (a hand of 10 is 7.6 cards wide, not 10)

// The distance from one card's left edge to the next's. Up to EDGE_TO_EDGE cards it is a card wide; with more the row is (EDGE_TO_EDGE + OVERLAP_GROWTH per extra card) cards wide, so the cards overlap;
// and it is squeezed further if even that does not fit slots cards in width. (Continuous at the change: 6 cards is a step of one card, 7 cards a little less.)
export function cardStep({ slots, width, cardWidth }) {
  if (slots <= 1) return 0;
  const natural = slots <= EDGE_TO_EDGE ? cardWidth : cardWidth * (EDGE_TO_EDGE - 1 + (slots - EDGE_TO_EDGE) * OVERLAP_GROWTH) / (slots - 1);
  return Math.max(0, Math.min(natural, (width - cardWidth) / (slots - 1)));
}

// count: how many cards are in the row (not counting a card being dragged). gap: null, or the index (0 to count) of the place a dragged card would go: the row then has count + 1 places and
// the cards after the gap move up by one. Returns { step, slots: [{ x, y, angle }] } with one entry per card, in order.
export function handLayout({ count, width, cardWidth, cardHeight, gap = null }) {
  const n = Number.isInteger(count) && count > 0 ? count : 0;
  const hasGap = Number.isInteger(gap) && n >= 0;
  const gapAt = hasGap ? clamp(gap, 0, n) : null;
  const slots = n + (hasGap ? 1 : 0);
  const step = cardStep({ slots, width, cardWidth });
  const rowWidth = slots > 0 ? cardWidth + step * (slots - 1) : 0;
  const startX = (width - rowWidth) / 2;
  const fan = clamp(slots / 7, 0.25, 1); // a few cards hardly fan, a full hand fans fully
  const out = [];
  for (let k = 0; k < n; k++) {
    const slot = gapAt !== null && k >= gapAt ? k + 1 : k;
    const t = slots > 1 ? (slot - (slots - 1) / 2) / ((slots - 1) / 2) : 0; // -1 at the left end, 1 at the right end
    let angle = t * MAX_ANGLE * fan;
    if (gapAt !== null) {
      const distance = Math.abs(slot - gapAt);
      if (distance <= GAP_REACH) angle += (slot < gapAt ? -1 : 1) * GAP_TILT * (1 - (distance - 1) / GAP_REACH) * (distance >= 1 ? 1 : 0);
    }
    out.push({ x: Math.round((startX + slot * step) * 100) / 100, y: Math.round(t * t * cardHeight * 0.05 * fan * 100) / 100, angle: Math.round(angle * 100) / 100 });
  }
  return { step, slots: out };
}

// Which place in the row (0 to count) a card let go at pointer x would take: the number of cards whose middle is to the left of x. count is the number of cards in the row WITHOUT the dragged one.
export function insertionIndex({ count, width, cardWidth, x }) {
  const n = Number.isInteger(count) && count > 0 ? count : 0;
  if (n === 0) return 0;
  const step = cardStep({ slots: n, width, cardWidth });
  const startX = (width - (cardWidth + step * (n - 1))) / 2;
  let index = 0;
  for (let k = 0; k < n; k++) if (x > startX + k * step + cardWidth / 2) index = k + 1;
  return index;
}
