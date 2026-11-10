// Stacks on the battlefield (Kevin, 2026-11-09, docs/layout.md "Planned next"). A stack is NOT stored: it is cards that have the same name and the same state on the same cell, drawn as
// one pile (up to STACK_VISIBLE copies, offset, with a count). Every card stays its own record with its own uid, so nothing in the game logic changes. Plain logic with no browser or
// network code (scripts/test-stacks.mjs).
//
// "The same state" means the same name and the same tapped, summoning-sick and doesn't-untap marks, counters, power and toughness change, note, face-down and turned-over state, so a
// land that has become a creature, a card with a counter, or a tapped copy does not join the untapped plain ones (Kevin: "stuff to differentiate"). The picture (printing) is not part
// of it: the pile shows the top card.
import { cellOf, CARD_COLS, CARD_ROWS } from './board-grid.mjs';

export const STACK_VISIBLE = 4; // how many copies of a pile are drawn
export const SNAP_RADIUS = 6; // a card dropped within this many cells of a card it could stack with goes onto it (three quarters of a card wide)

// A plain-text form with the object keys in order, so the same state always gives the same text.
const stable = (value) => {
  if (value === null || value === undefined) return 'n';
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${key}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
// A mark that is absent, false, 0 or empty counts as "none", so a card that never had a counter and one whose counters were all taken off look the same.
const mark = (value) => {
  if (value && typeof value === 'object') { const kept = Object.fromEntries(Object.entries(value).filter(([, v]) => v)); return Object.keys(kept).length ? kept : null; }
  return value ? value : null;
};
const STATE_KEYS = ['tok', 'tapped', 'sick', 'noUntap', 'ct', 'mp', 'mt', 'nt', 'faceDown', 'turned', 'bk'];

// What two cards must share to be in one stack (apart from being on the same cell).
export const stackKey = (card) => stable([card.n, ...STATE_KEYS.map((key) => mark(card[key]))]);

// For the cards of a battlefield and the cell each is drawn in (a Map from uid to { col, row }): a Map from uid to { size, depth } where size is how many cards are in its pile and
// depth is how far down it is (0 is the top card: the last of the pile in the list, which is drawn on top).
export function stackInfo(cards, cells) {
  const groups = new Map();
  for (const card of cards) {
    const cell = cells.get(card.uid);
    if (!cell) continue;
    const key = `${cell.col},${cell.row}|${stackKey(card)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(card.uid);
  }
  const info = new Map();
  for (const uids of groups.values()) uids.forEach((uid, index) => info.set(uid, { size: uids.length, depth: uids.length - 1 - index }));
  return info;
}

// The cell of the pile a new card would join: the last card in the list that has the same name and state and a cell. Null when there is none.
export function stackCellFor(cards, candidate) {
  const key = stackKey(candidate);
  for (let i = cards.length - 1; i >= 0; i--) {
    if (cards[i].uid === candidate.uid) continue;
    const cell = cellOf(cards[i]);
    if (cell && stackKey(cards[i]) === key) return cell;
  }
  return null;
}

// Where a card dropped on `cell` really goes: onto the nearest card it could stack with that is within SNAP_RADIUS cells (both ways; a tapped card is turned on its side, so its area is
// wider than tall in the same proportion as the card: 8 cells across and 4 up and down), else where it was dropped. `leaving` (optional)
// is the cell the card is being taken from: the cards still there are its old pile, which it must be able to leave by a short drag, so they do not attract it.
export function snapToStack(cards, candidate, cell, radius = SNAP_RADIUS, leaving = null) {
  const key = stackKey(candidate);
  const reachX = candidate.tapped ? Math.round((radius * CARD_ROWS) / CARD_COLS) : radius; // a tapped card is a landscape card: 11 across and 8 up and down for a card that is 8 by 11
  const reachY = candidate.tapped ? Math.round((radius * CARD_COLS) / CARD_ROWS) : radius;
  let best = null;
  let bestDistance = Infinity;
  for (const other of cards) {
    if (other.uid === candidate.uid) continue;
    const at = cellOf(other);
    if (!at || stackKey(other) !== key) continue;
    if (leaving && at.col === leaving.col && at.row === leaving.row) continue;
    const across = Math.abs(at.col - cell.col);
    const down = Math.abs(at.row - cell.row);
    const distance = Math.max(reachX ? across / reachX : Infinity, reachY ? down / reachY : Infinity); // how far out of its area the card is: 1 or less is inside
    if (across <= reachX && down <= reachY && distance < bestDistance) { best = at; bestDistance = distance; }
  }
  return best ?? cell;
}
