// The battlefield grid (Kevin, 2026-11-06, docs/layout.md "Phase B"). Plain logic with no browser or network code, so Node tests can load it (scripts/test-board-grid.mjs).
//
// A battlefield is one grid of BOARD_COLS columns by BOARD_ROWS rows, the same for every player. A card on the battlefield is in one cell: it stores px (the column, 0 to
// BOARD_COLS - 1) and py (the row, 0 at the top). Positions are stored when a card arrives, so a card never moves because another one was placed. A card with no position
// (an older game, or a damaged value) is given one when the board is drawn or the game is loaded: the first empty cell, lands from the bottom-left and every other card from
// the top-left, which keeps a loose order without two labelled sections.
export const BOARD_COLS = 12;
export const BOARD_ROWS = 4;
export const BOARD_CAPACITY = BOARD_COLS * BOARD_ROWS;

const whole = (value) => Number.isInteger(value);
export const validCell = (col, row) => whole(col) && whole(row) && col >= 0 && col < BOARD_COLS && row >= 0 && row < BOARD_ROWS;
export const cellKey = (col, row) => `${col},${row}`;

// The cell a card is stored in, or null when it has none (or a value outside the grid).
export function cellOf(card) {
  return validCell(card?.px, card?.py) ? { col: card.px, row: card.py } : null;
}

// The cells in the order a new card tries them. Lands: the bottom row from the left, then the row above, and so on up. Everything else: the top row from the left, then down.
export function cellOrder(land) {
  const order = [];
  for (let step = 0; step < BOARD_ROWS; step++) {
    const row = land ? BOARD_ROWS - 1 - step : step;
    for (let col = 0; col < BOARD_COLS; col++) order.push({ col, row });
  }
  return order;
}

// The set of cells that are taken, from the cards' stored cells. A second card on the same cell does not take another one (it will be moved when the board is settled).
export function takenCells(cards) {
  const taken = new Map();
  for (const card of cards) {
    const cell = cellOf(card);
    if (cell && !taken.has(cellKey(cell.col, cell.row))) taken.set(cellKey(cell.col, cell.row), card.uid);
  }
  return taken;
}

// The first empty cell for a new card of this kind, or null when the board is full. cards: the cards already on the battlefield.
export function firstEmptyCell(cards, land) {
  const taken = takenCells(cards);
  return cellOrder(land).find((cell) => !taken.has(cellKey(cell.col, cell.row))) ?? null;
}

// The cell every card is drawn in: a card keeps its stored cell if it is valid and no earlier card has it; every other card gets the first empty cell for its kind, in the
// order the cards are listed. Returns a Map from uid to { col, row }. A card for which there is no room (more than BOARD_CAPACITY cards) is put on the last cell so it is still
// shown; that only happens for a damaged or very old game.
export function placeAll(cards, isLand) {
  const result = new Map();
  const taken = new Set();
  for (const card of cards) {
    const cell = cellOf(card);
    if (cell && !taken.has(cellKey(cell.col, cell.row))) { taken.add(cellKey(cell.col, cell.row)); result.set(card.uid, cell); }
  }
  const orders = { land: cellOrder(true), other: cellOrder(false) };
  for (const card of cards) {
    if (result.has(card.uid)) continue;
    const cell = orders[isLand(card) ? 'land' : 'other'].find((c) => !taken.has(cellKey(c.col, c.row))) ?? { col: BOARD_COLS - 1, row: BOARD_ROWS - 1 };
    taken.add(cellKey(cell.col, cell.row));
    result.set(card.uid, cell);
  }
  return result;
}

// Tidying the board: every card is placed again by the rule above, lands from the bottom-left and the rest from the top-left, with cards of the same name side by side (by name,
// then in the order they came). Returns a Map from uid to { col, row }. Needs at most BOARD_CAPACITY cards.
export function arrangeAll(cards, isLand) {
  if (cards.length > BOARD_CAPACITY) throw new Error(`Only ${BOARD_CAPACITY} cards fit on the battlefield.`);
  const number = (card) => Number(String(card.uid).slice(1)) || 0;
  const byName = (a, b) => (a.n < b.n ? -1 : a.n > b.n ? 1 : number(a) - number(b));
  const lands = cards.filter((card) => isLand(card)).sort(byName);
  const other = cards.filter((card) => !isLand(card)).sort(byName);
  const result = new Map();
  const taken = new Set();
  for (const [group, land] of [[lands, true], [other, false]]) {
    const order = cellOrder(land);
    for (const card of group) {
      const cell = order.find((c) => !taken.has(cellKey(c.col, c.row)));
      taken.add(cellKey(cell.col, cell.row));
      result.set(card.uid, cell);
    }
  }
  return result;
}

// The cell under a point, for a board drawn in a rectangle { left, top, width, height } (window coordinates, as getBoundingClientRect gives them); null outside it.
export function cellAtPoint(rect, x, y) {
  if (!rect || !(rect.width > 0) || !(rect.height > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const fx = (x - rect.left) / rect.width;
  const fy = (y - rect.top) / rect.height;
  if (fx < 0 || fx >= 1 || fy < 0 || fy >= 1) return null;
  return { col: Math.floor(fx * BOARD_COLS), row: Math.floor(fy * BOARD_ROWS) };
}

// The cell one step from a cell in a direction ('left', 'right', 'up', 'down'), or null at the edge of the grid.
export function stepFrom(cell, direction) {
  const next = { left: { col: cell.col - 1, row: cell.row }, right: { col: cell.col + 1, row: cell.row }, up: { col: cell.col, row: cell.row - 1 }, down: { col: cell.col, row: cell.row + 1 } }[direction];
  return next && validCell(next.col, next.row) ? next : null;
}
