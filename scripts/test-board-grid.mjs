// Tests for shared/board-grid.mjs: the fine grid (square cells, a card is 8 wide and 11 tall, the board is as many cards across and down as the constants say), the order blocks are
// tried in, settling a board, tidying it, stepping, and where a drop lands. The numbers come from the constants where they can, so changing the size of the board does not mean
// rewriting this file.
import {
  BOARD_COLS, BOARD_ROWS, CARD_COLS, CARD_ROWS, MAX_COL, MAX_ROW, BOARD_CAPACITY, TAP_GAP, validCell, cellKey, cellOf, cellOrder, overlaps, takenCells, firstEmptyCell, placeAll, arrangeAll, stepFrom, cellAtPoint, anchorAtPoint, shiftedAnchor, nearbyFreeBlock,
} from '../shared/board-grid.mjs';

let checks = 0;
const same = (label, actual, expected) => {
  checks++;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) { console.log(`FAILED CHECK: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); process.exit(1); }
};
const is = (card) => card.land === true;
const land = (n, extra = {}) => ({ uid: `c${n}`, n: 'Forest', land: true, ...extra });
const spell = (n, extra = {}) => ({ uid: `c${n}`, n: 'Bear', land: false, ...extra });
const PER_ROW = BOARD_COLS / CARD_COLS; // cards across
const LAND_ROW = MAX_ROW; // the bottom row of blocks starts here
const LAST_COL = MAX_COL;

same('the board is a whole number of cards across and down, a card is 8 by 11 cells, so a cell is square (a card is 5 by 7)', [BOARD_COLS % CARD_COLS, BOARD_ROWS % CARD_ROWS, CARD_COLS, CARD_ROWS], [0, 0, 8, 11]);
same('a card starts in columns 0 to BOARD_COLS - 8 and rows 0 to BOARD_ROWS - 11, and as many fit side by side as there are blocks', [MAX_COL, MAX_ROW, BOARD_CAPACITY], [BOARD_COLS - 8, BOARD_ROWS - 11, PER_ROW * (BOARD_ROWS / CARD_ROWS)]);
same('the board is 14 cards across and 4 down, and a tapped card steps out by 2 cells more than a card', [PER_ROW, BOARD_ROWS / CARD_ROWS, TAP_GAP], [14, 4, 2]);

// cells
for (const [col, row] of [[0, 0], [MAX_COL, MAX_ROW], [5, 2], [0, MAX_ROW], [MAX_COL, 0], [13, 7]]) same(`(${col}, ${row}) is a cell a card can start in`, validCell(col, row), true);
for (const [col, row] of [[-1, 0], [0, -1], [MAX_COL + 1, 0], [0, MAX_ROW + 1], [BOARD_COLS, 0], [0, BOARD_ROWS], [1.5, 0], [0, 2.5], ['1', 1], [1, '1'], [null, 0], [0, undefined], [NaN, 0], [Infinity, 0]]) same(`(${col}, ${row}) is not a cell a card can start in`, validCell(col, row), false);
same('a card with px and py has that cell', cellOf({ px: 3, py: 2 }), { col: 3, row: 2 });
for (const card of [{}, { px: 3 }, { py: 2 }, { px: MAX_COL + 1, py: 0 }, { px: 0, py: MAX_ROW + 1 }, { px: -1, py: 0 }, { px: 1.5, py: 0 }, { px: '3', py: '2' }, null, undefined]) same(`a card with ${JSON.stringify(card)} has no cell`, cellOf(card), null);
same('cellKey is the pair as text', cellKey(3, 2), '3,2');

// overlapping
same('cards a whole card apart do not overlap (in either direction)', [overlaps({ col: 0, row: 0 }, { col: 8, row: 0 }), overlaps({ col: 0, row: 0 }, { col: 0, row: 11 }), overlaps({ col: 16, row: 16 }, { col: 8, row: 27 })], [false, false, false]);
same('cards less than a card apart overlap', [overlaps({ col: 0, row: 0 }, { col: 7, row: 0 }), overlaps({ col: 0, row: 0 }, { col: 0, row: 10 }), overlaps({ col: 10, row: 10 }, { col: 4, row: 19 }), overlaps({ col: 5, row: 5 }, { col: 5, row: 5 })], [true, true, true, true]);

// the order blocks are tried in
const landOrder = cellOrder(true);
const otherOrder = cellOrder(false);
same('there are as many blocks as fit, in either order, each once', [landOrder.length, new Set(landOrder.map((c) => cellKey(c.col, c.row))).size, otherOrder.length, new Set(otherOrder.map((c) => cellKey(c.col, c.row))).size], [BOARD_CAPACITY, BOARD_CAPACITY, BOARD_CAPACITY, BOARD_CAPACITY]);
same('lands start at the bottom-left block and go right, a card apart', landOrder.slice(0, 3), [{ col: 0, row: LAND_ROW }, { col: 8, row: LAND_ROW }, { col: 16, row: LAND_ROW }]);
same('...then the row of blocks above', landOrder.slice(PER_ROW, PER_ROW + 2), [{ col: 0, row: LAND_ROW - 11 }, { col: 8, row: LAND_ROW - 11 }]);
same('...and the last block for a land is the top-right', landOrder.at(-1), { col: LAST_COL, row: 0 });
same('other cards start at the top-left and go right', otherOrder.slice(0, 3), [{ col: 0, row: 0 }, { col: 8, row: 0 }, { col: 16, row: 0 }]);
same('...then the row below, and the last block is the bottom-right', [otherOrder[PER_ROW], otherOrder.at(-1)], [{ col: 0, row: 11 }, { col: LAST_COL, row: LAND_ROW }]);
same('every block is a place a card can start', [...landOrder, ...otherOrder].every((c) => validCell(c.col, c.row)), true);

// the first empty block
same('an empty board: a land goes to the bottom-left, another card to the top-left', [firstEmptyCell([], true), firstEmptyCell([], false)], [{ col: 0, row: LAND_ROW }, { col: 0, row: 0 }]);
same('the next land goes beside the first', firstEmptyCell([land(1, { px: 0, py: LAND_ROW })], true), { col: 8, row: LAND_ROW });
same('a land does not take a block a spell already covers', firstEmptyCell([spell(1, { px: 0, py: LAND_ROW })], true), { col: 8, row: LAND_ROW });
same('a card half over the first two blocks covers both, so the third is chosen', firstEmptyCell([spell(1, { px: 4, py: LAND_ROW - 3 })], true), { col: 16, row: LAND_ROW });
same('a card seven cells to the right still covers the first block, so the next one is chosen', firstEmptyCell([spell(1, { px: 7, py: 0 })], false), { col: 16, row: 0 });
same('a card exactly a block over does not', firstEmptyCell([spell(1, { px: 8, py: 0 })], false), { col: 0, row: 0 });
same('a card ten cells below covers the first block, eleven does not', [firstEmptyCell([spell(1, { px: 0, py: 10 })], false), firstEmptyCell([spell(1, { px: 0, py: 11 })], false)], [{ col: 8, row: 0 }, { col: 0, row: 0 }]);
same('a full row of lands moves the next land up a row', firstEmptyCell(Array.from({ length: PER_ROW }, (_, i) => land(i + 1, { px: i * 8, py: LAND_ROW })), true), { col: 0, row: LAND_ROW - 11 });
same('a full board has no free block', firstEmptyCell(Array.from({ length: BOARD_CAPACITY }, (_, i) => spell(i + 1, { px: (i % PER_ROW) * 8, py: Math.floor(i / PER_ROW) * 11 })), false), null);
same('cards with no cell take no room', firstEmptyCell([land(1), spell(2, { px: 999, py: 0 })], false), { col: 0, row: 0 });
same('cards with no cell take no cell', takenCells([land(1), spell(2, { px: 999, py: 0 })]).size, 0);
same('two cards on one cell take it once (the first one holds it)', [...takenCells([land(1, { px: 2, py: 2 }), land(2, { px: 2, py: 2 })]).values()], ['c1']);

// settling a board
{
  const cards = [land(1, { px: 10, py: 2 }), land(2), spell(3), land(4), spell(5, { px: 10, py: 2 })]; // c5 is on the same cell as c1: that is allowed now
  const placed = placeAll(cards, is);
  same('a card with a good cell keeps it', placed.get('c1'), { col: 10, row: 2 });
  same('a card on the same cell as another keeps it too (cards may overlap)', placed.get('c5'), { col: 10, row: 2 });
  same('a land with none takes the first free block for lands', placed.get('c2'), { col: 0, row: LAND_ROW });
  same('the next land goes beside the last one', placed.get('c4'), { col: 8, row: LAND_ROW });
  same('a spell with none takes the first free block for spells: (0, 0) is 10 columns from the cards at (10, 2), so it is free', placed.get('c3'), { col: 0, row: 0 });
  same('the cards are not changed', cards.map((c) => [c.px, c.py]), [[10, 2], [undefined, undefined], [undefined, undefined], [undefined, undefined], [10, 2]]);
  same('a card outside the grid is given a cell', placeAll([spell(1, { px: 999, py: 999 })], is).get('c1'), { col: 0, row: 0 });
  same('a card that would run off the edge is given a cell too', [placeAll([spell(1, { px: MAX_COL + 1, py: 0 })], is).get('c1'), placeAll([spell(1, { px: 0, py: MAX_ROW + 1 })], is).get('c1')], [{ col: 0, row: 0 }, { col: 0, row: 0 }]);
  same('with nothing it is empty', placeAll([], is).size, 0);
  const crowd = Array.from({ length: BOARD_CAPACITY + 2 }, (_, i) => spell(i + 1));
  const crowded = placeAll(crowd, is);
  same('two more cards than blocks: every block has a card and the last two share the last block, so they are still shown', [crowded.size, new Set([...crowded.values()].map((c) => cellKey(c.col, c.row))).size, crowded.get(`c${BOARD_CAPACITY + 2}`)], [BOARD_CAPACITY + 2, BOARD_CAPACITY, { col: LAST_COL, row: LAND_ROW }]);
}

// tidying
{
  const cards = [spell(1, { n: 'Zebra' }), land(2, { n: 'Island' }), land(3, { n: 'Forest' }), spell(4, { n: 'Ant' }), land(5, { n: 'Forest' }), spell(6, { n: 'Ant' })];
  const arranged = arrangeAll(cards, is);
  same('lands are tidied from the bottom-left, by name, the same name side by side', ['c3', 'c5', 'c2'].map((uid) => arranged.get(uid)), [{ col: 0, row: LAND_ROW }, { col: 8, row: LAND_ROW }, { col: 16, row: LAND_ROW }]);
  same('other cards from the top-left, by name, in the order they came', ['c4', 'c6', 'c1'].map((uid) => arranged.get(uid)), [{ col: 0, row: 0 }, { col: 8, row: 0 }, { col: 16, row: 0 }]);
  same('no two tidied cards overlap', [...arranged.values()].every((a, i, all) => all.every((b, j) => i === j || !overlaps(a, b))), true);
  same('tidying twice gives the same result', [...arrangeAll(cards, is)], [...arranged]);
  same('stored cells are ignored when tidying (everything is placed again)', arrangeAll([land(1, { px: 14, py: 0 })], is).get('c1'), { col: 0, row: LAND_ROW });
  const full = Array.from({ length: BOARD_CAPACITY }, (_, i) => (i % 2 ? land(i + 1) : spell(i + 1)));
  same('as many cards as there are blocks all get a block of their own', new Set([...arrangeAll(full, is).values()].map((c) => cellKey(c.col, c.row))).size, BOARD_CAPACITY);
  const more = arrangeAll(Array.from({ length: BOARD_CAPACITY + 14 }, (_, i) => spell(i + 1)), is);
  same('14 more cards than blocks are all placed, on top of the first 14 blocks', [more.size, new Set([...more.values()].map((c) => cellKey(c.col, c.row))).size, more.get(`c${BOARD_CAPACITY + 1}`), more.get(`c${BOARD_CAPACITY + 14}`)], [BOARD_CAPACITY + 14, BOARD_CAPACITY, { col: 0, row: 0 }, { col: LAST_COL, row: 0 }]);
  same('no cards give nothing', arrangeAll([], is).size, 0);
  const sameNames = Array.from({ length: 30 }, (_, i) => spell(i + 1, { n: 'Goblin' }));
  same('30 tokens with one name fill the top rows in the order they came', [...arrangeAll(sameNames, is)].slice(0, 2).map(([uid, cell]) => [uid, cell.col, cell.row]), [['c1', 0, 0], ['c2', 8, 0]]);
}

// somewhere beside a pile for a card that steps out of it (a whole card plus TAP_GAP = 2 cells to the side)
{
  const pile = { col: 40, row: 11 };
  same('the block to the right plus two cells (TAP_GAP), when it is free', nearbyFreeBlock([spell(1, { px: 40, py: 11 })], pile), { col: 50, row: 11 });
  same('...else to the left, also two cells further than a card', nearbyFreeBlock([spell(1, { px: 40, py: 11 }), spell(2, { px: 50, py: 11 })], pile), { col: 30, row: 11 });
  same('...else below (a whole card, no gap)', nearbyFreeBlock([spell(1, { px: 40, py: 11 }), spell(2, { px: 50, py: 11 }), spell(3, { px: 30, py: 11 })], pile), { col: 40, row: 22 });
  same('...else above', nearbyFreeBlock([spell(1, { px: 40, py: 11 }), spell(2, { px: 50, py: 11 }), spell(3, { px: 30, py: 11 }), spell(4, { px: 40, py: 22 })], pile), { col: 40, row: 0 });
  same('...and none when all four are covered', nearbyFreeBlock([spell(2, { px: 50, py: 11 }), spell(3, { px: 30, py: 11 }), spell(4, { px: 40, py: 22 }), spell(5, { px: 40, py: 0 })], pile), null);
  same('a card half over the right-hand place covers it', nearbyFreeBlock([spell(2, { px: 53, py: 11 })], pile), { col: 30, row: 11 });
  same('one just a card away from the right-hand place does not cover it (50 + 8 = 58)', nearbyFreeBlock([spell(2, { px: 58, py: 11 })], pile), { col: 50, row: 11 });
  same('the cards of the pile itself (on its cell) do not count', nearbyFreeBlock([spell(1, { px: 40, py: 11 }), spell(2, { px: 40, py: 11 })], pile), { col: 50, row: 11 });
  same('at the right edge it goes to the left', nearbyFreeBlock([], { col: MAX_COL, row: 11 }), { col: MAX_COL - 10, row: 11 });
  same('in the corner it goes down or up', [nearbyFreeBlock([], { col: 0, row: 0 }), nearbyFreeBlock([], { col: 0, row: MAX_ROW })], [{ col: 10, row: 0 }, { col: 10, row: MAX_ROW }]);
  // prefer 'up' (the horizontal pile style): on top of the pile, a whole card higher, with no gap; then the sides
  same("with 'up' the block above comes first (a whole card higher, in the same columns)", nearbyFreeBlock([spell(1, { px: 40, py: 11 })], pile, 'up'), { col: 40, row: 0 });
  same('...then to the right, then to the left, then below', [nearbyFreeBlock([spell(2, { px: 40, py: 0 })], pile, 'up'), nearbyFreeBlock([spell(2, { px: 40, py: 0 }), spell(3, { px: 50, py: 11 })], pile, 'up'), nearbyFreeBlock([spell(2, { px: 40, py: 0 }), spell(3, { px: 50, py: 11 }), spell(4, { px: 30, py: 11 })], pile, 'up')], [{ col: 50, row: 11 }, { col: 30, row: 11 }, { col: 40, row: 22 }]);
  same("with 'up' on the top row it goes to the side", nearbyFreeBlock([], { col: 40, row: 0 }, 'up'), { col: 50, row: 0 });
  // prefer 'left' (an untapped card leaving a tapped stack) and 'down' (the same in the horizontal style)
  same("with 'left' the place to the left comes first, then the right", [nearbyFreeBlock([], pile, 'left'), nearbyFreeBlock([spell(2, { px: 30, py: 11 })], pile, 'left')], [{ col: 30, row: 11 }, { col: 50, row: 11 }]);
  same("with 'left' at the left edge it goes to the right", nearbyFreeBlock([], { col: 3, row: 11 }, 'left'), { col: 13, row: 11 });
  same("with 'down' the block below comes first, then the one above, then the sides", [nearbyFreeBlock([], pile, 'down'), nearbyFreeBlock([spell(2, { px: 40, py: 22 })], pile, 'down'), nearbyFreeBlock([spell(2, { px: 40, py: 22 }), spell(3, { px: 40, py: 0 })], pile, 'down')], [{ col: 40, row: 22 }, { col: 40, row: 0 }, { col: 50, row: 11 }]);
  same('an unknown preference is the same as right', nearbyFreeBlock([], pile, 'sideways'), nearbyFreeBlock([], pile, 'right'));
}

// stepping (one cell: an eighth of a card across)
same('a step right', stepFrom({ col: 3, row: 1 }, 'right'), { col: 4, row: 1 });
same('a step left', stepFrom({ col: 3, row: 1 }, 'left'), { col: 2, row: 1 });
same('a step up', stepFrom({ col: 3, row: 1 }, 'up'), { col: 3, row: 0 });
same('a step down', stepFrom({ col: 3, row: 1 }, 'down'), { col: 3, row: 2 });
for (const [cell, direction] of [[{ col: 0, row: 1 }, 'left'], [{ col: MAX_COL, row: 1 }, 'right'], [{ col: 3, row: 0 }, 'up'], [{ col: 3, row: MAX_ROW }, 'down']]) same(`no step ${direction} from the edge`, stepFrom(cell, direction), null);
same('an unknown direction gives none', [stepFrom({ col: 1, row: 1 }, 'sideways'), stepFrom({ col: 1, row: 1 }, 'toString'), stepFrom({ col: 1, row: 1 }, undefined)], [null, null, null]);

// the cell under a point: a board with 10 pixel cells at (100, 50)
{
  const W = BOARD_COLS * 10; const H = BOARD_ROWS * 10;
  const rect = { left: 100, top: 50, width: W, height: H };
  same('the top-left corner is the first cell', cellAtPoint(rect, 100, 50), { col: 0, row: 0 });
  same('a point inside a cell', cellAtPoint(rect, 255, 135), { col: 15, row: 8 });
  same('the last cell', cellAtPoint(rect, 100 + W - 1, 50 + H - 1), { col: BOARD_COLS - 1, row: BOARD_ROWS - 1 });
  same('a cell edge belongs to the cell that starts there', [cellAtPoint(rect, 110, 60), cellAtPoint(rect, 109.9, 59.9)], [{ col: 1, row: 1 }, { col: 0, row: 0 }]);
  for (const [label, x, y] of [['left of the board', 99, 100], ['above the board', 200, 49], ['right of the board', 100 + W, 100], ['below the board', 200, 50 + H], ['far away', 5000, 5000], ['negative', -10, -10]]) same('a point ' + label + ' has no cell', cellAtPoint(rect, x, y), null);
  for (const bad of [null, undefined, {}, { left: 0, top: 0, width: 0, height: 100 }, { left: 0, top: 0, width: 100, height: -5 }, { left: 0, top: 0, width: NaN, height: 100 }]) same('a board with no size (' + JSON.stringify(bad) + ') has no cells', cellAtPoint(bad, 10, 10), null);
  // the last five points have one coordinate inside the board, so only the number check can refuse them
  for (const [x, y] of [[NaN, 10], [10, NaN], [Infinity, 10], [10, -Infinity], ['10', 10], [undefined, 10], [NaN, 135], [255, NaN], [255, '135'], [undefined, undefined], [255, undefined]]) same('a point that is not a number (' + String(x) + ', ' + String(y) + ') has no cell', cellAtPoint(rect, x, y), null);
  same('every cell is found from its own middle', Array.from({ length: BOARD_COLS * BOARD_ROWS }, (_, n) => { const col = n % BOARD_COLS; const row = Math.floor(n / BOARD_COLS); const c = cellAtPoint(rect, 100 + (col + 0.5) * 10, 50 + (row + 0.5) * 10); return c.col === col && c.row === row; }).every(Boolean), true);

  // where a card dropped with the pointer at a point goes: its middle is at the pointer
  same('the pointer in the middle of the board puts the card around it (4 cells left and 5 up of the pointer)', anchorAtPoint(rect, 255, 135), { col: 11, row: 3 });
  same('near the top-left corner the card is kept on the board', anchorAtPoint(rect, 101, 51), { col: 0, row: 0 });
  same('near the bottom-right corner too', anchorAtPoint(rect, 100 + W - 1, 50 + H - 1), { col: MAX_COL, row: MAX_ROW });
  same('the right edge keeps the whole card on the board', anchorAtPoint(rect, 100 + W - 1, 135), { col: MAX_COL, row: 3 });
  same('outside the board there is no place', [anchorAtPoint(rect, 99, 100), anchorAtPoint(rect, 200, 50 + H), anchorAtPoint(null, 1, 1), anchorAtPoint(rect, NaN, 100)], [null, null, null, null]);

  // moving by the distance the pointer travelled
  const start = { col: 40, row: 12 };
  same('no movement keeps the cell', shiftedAnchor(rect, start, 0, 0), start);
  same('a movement of two cells right and one down moves the card two columns and one row', shiftedAnchor(rect, start, 20, 10), { col: 42, row: 13 });
  same('left and up the other way', shiftedAnchor(rect, start, -30, -20), { col: 37, row: 10 });
  same('less than half a cell rounds to no change, half a cell or more to one cell', [shiftedAnchor(rect, start, 4, 0).col, shiftedAnchor(rect, start, 5, 0).col, shiftedAnchor(rect, start, -4, 0).col, shiftedAnchor(rect, start, -6, 0).col], [40, 41, 40, 39]);
  same('the card is kept on the board at every edge', [shiftedAnchor(rect, start, -9999, -9999), shiftedAnchor(rect, start, 9999, 9999), shiftedAnchor(rect, start, 9999, -9999)], [{ col: 0, row: 0 }, { col: MAX_COL, row: MAX_ROW }, { col: MAX_COL, row: 0 }]);
  same('a board with no size, no start or a number that is not a number gives no place', [shiftedAnchor(null, start, 0, 0), shiftedAnchor({ left: 0, top: 0, width: 0, height: 10 }, start, 0, 0), shiftedAnchor(rect, null, 0, 0), shiftedAnchor(rect, start, NaN, 0), shiftedAnchor(rect, start, 0, Infinity), shiftedAnchor(rect, start, '5', 0)], [null, null, null, null, null, null]);
}

console.log(`All ${checks} board grid checks passed.`);
