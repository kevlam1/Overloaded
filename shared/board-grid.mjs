// The battlefield grid (Kevin, 2026-11-06, docs/layout.md "Phase B"; redone 2026-11-09 as a fine grid). Plain logic with no browser or network code, so Node tests can load it
// (scripts/test-board-grid.mjs).
//
// A battlefield is a grid of BOARD_COLS columns by BOARD_ROWS rows, the same for every player. A card is CARD_COLS cells wide and CARD_ROWS cells tall (an eighth-card step in
// each direction), so there are 12 by 4 card-sized blocks, but a card may sit on ANY cell where it still fits: it stores px (the column of its top-left cell, 0 to MAX_COL) and
// py (the row, 0 at the top, 0 to MAX_ROW). Cards may overlap; the card later in the battlefield list is drawn on top. Positions are stored when a card arrives or is moved, so a
// card never moves because another one was placed. A card with no position (an older game, or a damaged value) is given one when the board is drawn or the game is loaded: the
// first free block, lands from the bottom-left and every other card from the top-left, which keeps a loose order without two labelled sections. If every block is taken the card
// goes on top of the last one tried: nothing is refused.
export const BOARD_COLS = 112; // 14 cards across (it was 12: Kevin, 2026-11-10, "lots of the battlefield seems to be empty space")
export const BOARD_ROWS = 44;
export const CARD_COLS = 8;
export const CARD_ROWS = 11; // a card is 8 cells wide and 11 tall, so a cell is square (a card is 5 by 7)
export const MAX_COL = BOARD_COLS - CARD_COLS; // the last column a card can start in
export const MAX_ROW = BOARD_ROWS - CARD_ROWS; // the last row a card can start in
export const TAP_GAP = 2; // a tapped card steps out of its pile to a place this many cells further than a whole card (Kevin, 2026-11-09: one more cell to the right)
export const BOARD_CAPACITY = (BOARD_COLS / CARD_COLS) * (BOARD_ROWS / CARD_ROWS); // 48 blocks (12 by 4): how many cards fit side by side without overlapping

const whole = (value) => Number.isInteger(value);
export const validCell = (col, row) => whole(col) && whole(row) && col >= 0 && col <= MAX_COL && row >= 0 && row <= MAX_ROW;
export const cellKey = (col, row) => `${col},${row}`;

// The cell a card is stored in, or null when it has none (or a value outside the grid).
export function cellOf(card) {
  return validCell(card?.px, card?.py) ? { col: card.px, row: card.py } : null;
}

// The blocks in the order a new card tries them. Lands: the bottom row of blocks from the left, then the row above, and so on up. Everything else: the top row from the left, then down.
export function cellOrder(land) {
  const order = [];
  const rows = BOARD_ROWS / CARD_ROWS;
  for (let step = 0; step < rows; step++) {
    const row = (land ? rows - 1 - step : step) * CARD_ROWS;
    for (let col = 0; col <= MAX_COL; col += CARD_COLS) order.push({ col, row });
  }
  return order;
}

// Do two cards starting at these cells overlap? (They do unless they are a whole card apart in one direction.)
export const overlaps = (a, b) => Math.abs(a.col - b.col) < CARD_COLS && Math.abs(a.row - b.row) < CARD_ROWS;

// The cells cards are on, from their stored cells (a card with no valid cell is not counted).
export function takenCells(cards) {
  const taken = new Map();
  for (const card of cards) {
    const cell = cellOf(card);
    if (cell && !taken.has(cellKey(cell.col, cell.row))) taken.set(cellKey(cell.col, cell.row), card.uid);
  }
  return taken;
}

const freeBlock = (order, placed) => order.find((block) => !placed.some((cell) => overlaps(block, cell))) ?? null;

// The first block no card covers, for a new card of this kind, or null when every block is covered. cards: the cards already on the battlefield.
export function firstEmptyCell(cards, land) {
  const placed = cards.map(cellOf).filter(Boolean);
  return freeBlock(cellOrder(land), placed);
}

// The cell every card is drawn in: a card keeps its stored cell when it is on the grid (overlapping is allowed); every other card gets the first free block for its kind, in the
// order the cards are listed, or, when every block is covered, the last block tried. Returns a Map from uid to { col, row }.
export function placeAll(cards, isLand) {
  const result = new Map();
  const placed = [];
  for (const card of cards) {
    const cell = cellOf(card);
    if (cell) { placed.push(cell); result.set(card.uid, cell); }
  }
  const orders = { land: cellOrder(true), other: cellOrder(false) };
  for (const card of cards) {
    if (result.has(card.uid)) continue;
    const order = orders[isLand(card) ? 'land' : 'other'];
    const cell = freeBlock(order, placed) ?? order[order.length - 1];
    placed.push(cell);
    result.set(card.uid, cell);
  }
  return result;
}

// Tidying the board: every card is placed again by the rule above, lands from the bottom-left and the rest from the top-left, with cards of the same name side by side (by name,
// then in the order they came). Returns a Map from uid to { col, row }. With more than BOARD_CAPACITY cards the extra ones go on top of the first blocks again.
// keyOf (optional): cards with the same key (the same name and state, shared/stacks.mjs stackKey) are put on one block together, as a stack, instead of one block each.
export function arrangeAll(cards, isLand, keyOf = null) {
  const number = (card) => Number(String(card.uid).slice(1)) || 0;
  const byName = (a, b) => (a.n < b.n ? -1 : a.n > b.n ? 1 : number(a) - number(b));
  const lands = cards.filter((card) => isLand(card)).sort(byName);
  const other = cards.filter((card) => !isLand(card)).sort(byName);
  const result = new Map();
  const placed = [];
  for (const [group, land] of [[lands, true], [other, false]]) {
    const order = cellOrder(land);
    const blockOf = new Map(); // key -> the cell its stack was given
    let count = 0;
    for (const card of group) {
      const key = keyOf ? keyOf(card) : null;
      if (key !== null && blockOf.has(key)) { result.set(card.uid, blockOf.get(key)); continue; }
      const cell = freeBlock(order, placed) ?? order[count % order.length];
      count++;
      placed.push(cell);
      result.set(card.uid, cell);
      if (key !== null) blockOf.set(key, cell);
    }
  }
  return result;
}

// The raw cell under a point, for a board drawn in a rectangle { left, top, width, height } (window coordinates, as getBoundingClientRect gives them); null outside it.
export function cellAtPoint(rect, x, y) {
  if (!rect || !(rect.width > 0) || !(rect.height > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const fx = (x - rect.left) / rect.width;
  const fy = (y - rect.top) / rect.height;
  if (fx < 0 || fx >= 1 || fy < 0 || fy >= 1) return null;
  return { col: Math.floor(fx * BOARD_COLS), row: Math.floor(fy * BOARD_ROWS) };
}

// Where a card dropped with the pointer at (x, y) goes: the cell its top-left corner gets so that the pointer is in the middle of the card, kept on the board. Null outside the board.
export function anchorAtPoint(rect, x, y) {
  const cell = cellAtPoint(rect, x, y);
  if (!cell) return null;
  return { col: Math.min(MAX_COL, Math.max(0, cell.col - Math.floor(CARD_COLS / 2))), row: Math.min(MAX_ROW, Math.max(0, cell.row - Math.floor(CARD_ROWS / 2))) };
}

// Where a card that started on cell `start` goes when the pointer has moved dx and dy pixels since it was grabbed: the same number of cells (rounded), kept on the board. Moving by
// the distance travelled, not to the pointer, keeps the spot where the card was grabbed under the pointer. Null when the board has no size or a number is not finite.
export function shiftedAnchor(rect, start, dx, dy) {
  if (!rect || !(rect.width > 0) || !(rect.height > 0) || !Number.isFinite(dx) || !Number.isFinite(dy) || !start) return null;
  const col = start.col + Math.round(dx / (rect.width / BOARD_COLS));
  const row = start.row + Math.round(dy / (rect.height / BOARD_ROWS));
  return { col: Math.min(MAX_COL, Math.max(0, col)), row: Math.min(MAX_ROW, Math.max(0, row)) };
}

// A free place next to a card at `cell`, for a card that has to step out of a pile: the block to its right (a whole card and TAP_GAP cells away), else to its left, else below, else above (a whole card away); with prefer 'up' the block above comes first, with 'left' the one to the left, with 'down' the one below. The first
// that is on the board and that no card in `cards` covers. Null when there is none. (The pile at `cell` itself never covers a block a whole card away, so it needs no special case.)
export function nearbyFreeBlock(cards, cell, prefer = 'right') {
  const placed = cards.map(cellOf).filter(Boolean);
  const right = { col: cell.col + CARD_COLS + TAP_GAP, row: cell.row };
  const left = { col: cell.col - CARD_COLS - TAP_GAP, row: cell.row };
  const below = { col: cell.col, row: cell.row + CARD_ROWS };
  const above = { col: cell.col, row: cell.row - CARD_ROWS };
  const candidates = prefer === 'up' ? [above, right, left, below] : prefer === 'left' ? [left, right, below, above] : prefer === 'down' ? [below, above, right, left] : [right, left, below, above]; // 'up': the tapped copies go on top of the pile, a whole card higher (the horizontal pile style)
  return candidates.find((c) => validCell(c.col, c.row) && !placed.some((p) => overlaps(c, p))) ?? null;
}

// The cell one step (one eighth of a card) from a cell in a direction ('left', 'right', 'up', 'down'), or null at the edge of the grid.
export function stepFrom(cell, direction) {
  const next = { left: { col: cell.col - 1, row: cell.row }, right: { col: cell.col + 1, row: cell.row }, up: { col: cell.col, row: cell.row - 1 }, down: { col: cell.col, row: cell.row + 1 } }[direction];
  return next && validCell(next.col, next.row) ? next : null;
}
