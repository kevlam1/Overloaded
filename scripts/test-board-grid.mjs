// Tests for shared/board-grid.mjs: the fine grid (96 by 44 square cells, a card is 8 wide and 11 tall), the order blocks are tried in, settling a board, tidying it, stepping, and where a drop lands.
import {
  BOARD_COLS, BOARD_ROWS, CARD_COLS, CARD_ROWS, MAX_COL, MAX_ROW, BOARD_CAPACITY, validCell, cellKey, cellOf, cellOrder, overlaps, takenCells, firstEmptyCell, placeAll, arrangeAll, stepFrom, cellAtPoint, anchorAtPoint, shiftedAnchor, nearbyFreeBlock,
} from '../shared/board-grid.mjs';

let checks = 0;
const same = (label, actual, expected) => {
  checks++;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) { console.log(`FAILED CHECK: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); process.exit(1); }
};
const is = (card) => card.land === true;
const land = (n, extra = {}) => ({ uid: `c${n}`, n: 'Forest', land: true, ...extra });
const spell = (n, extra = {}) => ({ uid: `c${n}`, n: 'Bear', land: false, ...extra });

same('the grid is 96 by 44 cells, a card 8 wide and 11 tall, so a card starts in columns 0 to 88 and rows 0 to 33, and 48 cards fit side by side', [BOARD_COLS, BOARD_ROWS, CARD_COLS, CARD_ROWS, MAX_COL, MAX_ROW, BOARD_CAPACITY], [96, 44, 8, 11, 88, 33, 48]);

// cells
for (const [col, row] of [[0, 0], [88, 33], [5, 2], [0, 33], [88, 0], [13, 7]]) same(`(${col}, ${row}) is a cell a card can start in`, validCell(col, row), true);
for (const [col, row] of [[-1, 0], [0, -1], [89, 0], [0, 34], [96, 0], [0, 44], [1.5, 0], [0, 2.5], ['1', 1], [1, '1'], [null, 0], [0, undefined], [NaN, 0], [Infinity, 0]]) same(`(${col}, ${row}) is not a cell a card can start in`, validCell(col, row), false);
same('a card with px and py has that cell', cellOf({ px: 3, py: 2 }), { col: 3, row: 2 });
for (const card of [{}, { px: 3 }, { py: 2 }, { px: 89, py: 0 }, { px: 0, py: 34 }, { px: -1, py: 0 }, { px: 1.5, py: 0 }, { px: '3', py: '2' }, null, undefined]) same(`a card with ${JSON.stringify(card)} has no cell`, cellOf(card), null);
same('cellKey is the pair as text', cellKey(3, 2), '3,2');

// overlapping
same('cards a whole card apart do not overlap (in either direction)', [overlaps({ col: 0, row: 0 }, { col: 8, row: 0 }), overlaps({ col: 0, row: 0 }, { col: 0, row: 11 }), overlaps({ col: 16, row: 16 }, { col: 8, row: 27 })], [false, false, false]);
same('cards less than a card apart overlap', [overlaps({ col: 0, row: 0 }, { col: 7, row: 0 }), overlaps({ col: 0, row: 0 }, { col: 0, row: 10 }), overlaps({ col: 10, row: 10 }, { col: 4, row: 19 }), overlaps({ col: 5, row: 5 }, { col: 5, row: 5 })], [true, true, true, true]);

// the order blocks are tried in
const landOrder = cellOrder(true);
const otherOrder = cellOrder(false);
same('there are 48 blocks in either order, each once', [landOrder.length, new Set(landOrder.map((c) => cellKey(c.col, c.row))).size, otherOrder.length, new Set(otherOrder.map((c) => cellKey(c.col, c.row))).size], [48, 48, 48, 48]);
same('lands start at the bottom-left block and go right, a card apart', landOrder.slice(0, 3), [{ col: 0, row: 33 }, { col: 8, row: 33 }, { col: 16, row: 33 }]);
same('...then the row of blocks above', landOrder.slice(12, 14), [{ col: 0, row: 22 }, { col: 8, row: 22 }]);
same('...and the last block for a land is the top-right', landOrder.at(-1), { col: 88, row: 0 });
same('other cards start at the top-left and go right', otherOrder.slice(0, 3), [{ col: 0, row: 0 }, { col: 8, row: 0 }, { col: 16, row: 0 }]);
same('...then the row below, and the last block is the bottom-right', [otherOrder[12], otherOrder.at(-1)], [{ col: 0, row: 11 }, { col: 88, row: 33 }]);
same('every block is a place a card can start', [...landOrder, ...otherOrder].every((c) => validCell(c.col, c.row)), true);

// the first empty block
same('an empty board: a land goes to the bottom-left, another card to the top-left', [firstEmptyCell([], true), firstEmptyCell([], false)], [{ col: 0, row: 33 }, { col: 0, row: 0 }]);
same('the next land goes beside the first', firstEmptyCell([land(1, { px: 0, py: 33 })], true), { col: 8, row: 33 });
same('a land does not take a block a spell already covers', firstEmptyCell([spell(1, { px: 0, py: 33 })], true), { col: 8, row: 33 });
same('a card half over the first two blocks covers both, so the third is chosen', firstEmptyCell([spell(1, { px: 4, py: 30 })], true), { col: 16, row: 33 });
same('a card seven cells to the right still covers the first block, so the next one is chosen', firstEmptyCell([spell(1, { px: 7, py: 0 })], false), { col: 16, row: 0 });
same('a card exactly a block over does not', firstEmptyCell([spell(1, { px: 8, py: 0 })], false), { col: 0, row: 0 });
same('a card ten cells below covers the first block, eleven does not', [firstEmptyCell([spell(1, { px: 0, py: 10 })], false), firstEmptyCell([spell(1, { px: 0, py: 11 })], false)], [{ col: 8, row: 0 }, { col: 0, row: 0 }]);
same('a full row of lands moves the next land up a row', firstEmptyCell(Array.from({ length: 12 }, (_, i) => land(i + 1, { px: i * 8, py: 33 })), true), { col: 0, row: 22 });
same('a full board has no free block', firstEmptyCell(Array.from({ length: 48 }, (_, i) => spell(i + 1, { px: (i % 12) * 8, py: Math.floor(i / 12) * 11 })), false), null);
same('cards with no cell take no room', firstEmptyCell([land(1), spell(2, { px: 99, py: 0 })], false), { col: 0, row: 0 });
same('cards with no cell take no cell', takenCells([land(1), spell(2, { px: 99, py: 0 })]).size, 0);
same('two cards on one cell take it once (the first one holds it)', [...takenCells([land(1, { px: 2, py: 2 }), land(2, { px: 2, py: 2 })]).values()], ['c1']);

// settling a board
{
  const cards = [land(1, { px: 10, py: 2 }), land(2), spell(3), land(4), spell(5, { px: 10, py: 2 })]; // c5 is on the same cell as c1: that is allowed now
  const placed = placeAll(cards, is);
  same('a card with a good cell keeps it', placed.get('c1'), { col: 10, row: 2 });
  same('a card on the same cell as another keeps it too (cards may overlap)', placed.get('c5'), { col: 10, row: 2 });
  same('a land with none takes the first free block for lands', placed.get('c2'), { col: 0, row: 33 });
  same('the next land goes beside the last one', placed.get('c4'), { col: 8, row: 33 });
  same('a spell with none takes the first free block for spells: (0, 0) is 10 columns from the cards at (10, 2), so it is free', placed.get('c3'), { col: 0, row: 0 });
  same('the cards are not changed', cards.map((c) => [c.px, c.py]), [[10, 2], [undefined, undefined], [undefined, undefined], [undefined, undefined], [10, 2]]);
  same('a card outside the grid is given a cell', placeAll([spell(1, { px: 90, py: 90 })], is).get('c1'), { col: 0, row: 0 });
  same('a card that would run off the edge (column 89 or row 34) is given a cell too', [placeAll([spell(1, { px: 89, py: 0 })], is).get('c1'), placeAll([spell(1, { px: 0, py: 34 })], is).get('c1')], [{ col: 0, row: 0 }, { col: 0, row: 0 }]);
  same('with nothing it is empty', placeAll([], is).size, 0);
  const crowd = Array.from({ length: 50 }, (_, i) => spell(i + 1));
  const crowded = placeAll(crowd, is);
  same('50 cards: 48 have a block of their own and the last two share the last block, so they are still shown', [crowded.size, new Set([...crowded.values()].map((c) => cellKey(c.col, c.row))).size, crowded.get('c50')], [50, 48, { col: 88, row: 33 }]);
}

// tidying
{
  const cards = [spell(1, { n: 'Zebra' }), land(2, { n: 'Island' }), land(3, { n: 'Forest' }), spell(4, { n: 'Ant' }), land(5, { n: 'Forest' }), spell(6, { n: 'Ant' })];
  const arranged = arrangeAll(cards, is);
  same('lands are tidied from the bottom-left, by name, the same name side by side', ['c3', 'c5', 'c2'].map((uid) => arranged.get(uid)), [{ col: 0, row: 33 }, { col: 8, row: 33 }, { col: 16, row: 33 }]);
  same('other cards from the top-left, by name, in the order they came', ['c4', 'c6', 'c1'].map((uid) => arranged.get(uid)), [{ col: 0, row: 0 }, { col: 8, row: 0 }, { col: 16, row: 0 }]);
  same('no two tidied cards overlap', [...arranged.values()].every((a, i, all) => all.every((b, j) => i === j || !overlaps(a, b))), true);
  same('tidying twice gives the same result', [...arrangeAll(cards, is)], [...arranged]);
  same('stored cells are ignored when tidying (everything is placed again)', arrangeAll([land(1, { px: 14, py: 0 })], is).get('c1'), { col: 0, row: 33 });
  const full = Array.from({ length: 48 }, (_, i) => (i % 2 ? land(i + 1) : spell(i + 1)));
  same('48 cards all get a block of their own', new Set([...arrangeAll(full, is).values()].map((c) => cellKey(c.col, c.row))).size, 48);
  const more = arrangeAll(Array.from({ length: 60 }, (_, i) => spell(i + 1)), is);
  same('60 cards are all placed, the last 12 on top of the first 12 blocks', [more.size, new Set([...more.values()].map((c) => cellKey(c.col, c.row))).size, more.get('c49'), more.get('c60')], [60, 48, { col: 0, row: 0 }, { col: 88, row: 0 }]);
  same('no cards give nothing', arrangeAll([], is).size, 0);
  const sameNames = Array.from({ length: 30 }, (_, i) => spell(i + 1, { n: 'Goblin' }));
  same('30 tokens with one name fill the top rows in the order they came', [...arrangeAll(sameNames, is)].slice(0, 2).map(([uid, cell]) => [uid, cell.col, cell.row]), [['c1', 0, 0], ['c2', 8, 0]]);
}

// somewhere beside a pile for a card that steps out of it
{
  const pile = { col: 40, row: 11 };
  same('the block to the right, when it is free', nearbyFreeBlock([spell(1, { px: 40, py: 11 })], pile), { col: 48, row: 11 });
  same('...else to the left', nearbyFreeBlock([spell(1, { px: 40, py: 11 }), spell(2, { px: 48, py: 11 })], pile), { col: 32, row: 11 });
  same('...else below', nearbyFreeBlock([spell(1, { px: 40, py: 11 }), spell(2, { px: 48, py: 11 }), spell(3, { px: 32, py: 11 })], pile), { col: 40, row: 22 });
  same('...else above', nearbyFreeBlock([spell(1, { px: 40, py: 11 }), spell(2, { px: 48, py: 11 }), spell(3, { px: 32, py: 11 }), spell(4, { px: 40, py: 22 })], pile), { col: 40, row: 0 });
  same('...and none when all four are covered', nearbyFreeBlock([spell(2, { px: 48, py: 11 }), spell(3, { px: 32, py: 11 }), spell(4, { px: 40, py: 22 }), spell(5, { px: 40, py: 0 })], pile), null);
  same('a card half over the right-hand block covers it', nearbyFreeBlock([spell(2, { px: 53, py: 11 })], pile), { col: 32, row: 11 });
  same('the cards of the pile itself (on its cell) do not count', nearbyFreeBlock([spell(1, { px: 40, py: 11 }), spell(2, { px: 40, py: 11 })], pile), { col: 48, row: 11 });
  same('at the right edge it goes to the left', nearbyFreeBlock([], { col: 88, row: 11 }), { col: 80, row: 11 });
  same('in the corner it goes down or up', [nearbyFreeBlock([], { col: 0, row: 0 }), nearbyFreeBlock([], { col: 0, row: 33 })], [{ col: 8, row: 0 }, { col: 8, row: 33 }]);
}

// stepping (one cell: an eighth of a card across)
same('a step right', stepFrom({ col: 3, row: 1 }, 'right'), { col: 4, row: 1 });
same('a step left', stepFrom({ col: 3, row: 1 }, 'left'), { col: 2, row: 1 });
same('a step up', stepFrom({ col: 3, row: 1 }, 'up'), { col: 3, row: 0 });
same('a step down', stepFrom({ col: 3, row: 1 }, 'down'), { col: 3, row: 2 });
for (const [cell, direction] of [[{ col: 0, row: 1 }, 'left'], [{ col: 88, row: 1 }, 'right'], [{ col: 3, row: 0 }, 'up'], [{ col: 3, row: 33 }, 'down']]) same(`no step ${direction} from the edge`, stepFrom(cell, direction), null);
same('an unknown direction gives none', [stepFrom({ col: 1, row: 1 }, 'sideways'), stepFrom({ col: 1, row: 1 }, 'toString'), stepFrom({ col: 1, row: 1 }, undefined)], [null, null, null]);

// the cell under a point: a board 960 wide and 440 high at (100, 50) has cells 10 wide and 10 high
{
  const rect = { left: 100, top: 50, width: 960, height: 440 };
  same('the top-left corner is the first cell', cellAtPoint(rect, 100, 50), { col: 0, row: 0 });
  same('a point inside a cell', cellAtPoint(rect, 255, 135), { col: 15, row: 8 });
  same('the last cell', cellAtPoint(rect, 1059, 489), { col: 95, row: 43 });
  same('a cell edge belongs to the cell that starts there', [cellAtPoint(rect, 110, 60), cellAtPoint(rect, 109.9, 59.9)], [{ col: 1, row: 1 }, { col: 0, row: 0 }]);
  for (const [label, x, y] of [['left of the board', 99, 100], ['above the board', 200, 49], ['right of the board', 1060, 100], ['below the board', 200, 490], ['far away', 5000, 5000], ['negative', -10, -10]]) same('a point ' + label + ' has no cell', cellAtPoint(rect, x, y), null);
  for (const bad of [null, undefined, {}, { left: 0, top: 0, width: 0, height: 100 }, { left: 0, top: 0, width: 100, height: -5 }, { left: 0, top: 0, width: NaN, height: 100 }]) same('a board with no size (' + JSON.stringify(bad) + ') has no cells', cellAtPoint(bad, 10, 10), null);
  // the last five points have one coordinate inside the board, so only the number check can refuse them
  for (const [x, y] of [[NaN, 10], [10, NaN], [Infinity, 10], [10, -Infinity], ['10', 10], [undefined, 10], [NaN, 135], [255, NaN], [255, '135'], [undefined, undefined], [255, undefined]]) same('a point that is not a number (' + String(x) + ', ' + String(y) + ') has no cell', cellAtPoint(rect, x, y), null);
  same('every cell is found from its own middle', Array.from({ length: 96 * 44 }, (_, n) => { const col = n % 96; const row = Math.floor(n / 96); const c = cellAtPoint(rect, 100 + (col + 0.5) * 10, 50 + (row + 0.5) * 10); return c.col === col && c.row === row; }).every(Boolean), true);

  // where a card dropped with the pointer at a point goes: its middle is at the pointer
  same('the pointer in the middle of the board puts the card around it (4 cells left and 5 up of the pointer)', anchorAtPoint(rect, 255, 135), { col: 11, row: 3 });
  same('near the top-left corner the card is kept on the board', anchorAtPoint(rect, 101, 51), { col: 0, row: 0 });
  same('near the bottom-right corner too', anchorAtPoint(rect, 1059, 489), { col: 88, row: 33 });
  same('the right edge keeps the whole card on the board', anchorAtPoint(rect, 1059, 135), { col: 88, row: 3 });
  same('outside the board there is no place', [anchorAtPoint(rect, 99, 100), anchorAtPoint(rect, 200, 490), anchorAtPoint(null, 1, 1), anchorAtPoint(rect, NaN, 100)], [null, null, null, null]);
}

// moving by the distance the pointer travelled: a board 960 wide and 440 high has cells 10 wide and 10 high
{
  const rect = { left: 100, top: 50, width: 960, height: 440 };
  const start = { col: 40, row: 12 };
  same('no movement keeps the cell', shiftedAnchor(rect, start, 0, 0), start);
  same('a movement of two cells right and one down moves the card two columns and one row', shiftedAnchor(rect, start, 20, 10), { col: 42, row: 13 });
  same('left and up the other way', shiftedAnchor(rect, start, -30, -20), { col: 37, row: 10 });
  same('less than half a cell rounds to no change, half a cell or more to one cell', [shiftedAnchor(rect, start, 4, 0).col, shiftedAnchor(rect, start, 5, 0).col, shiftedAnchor(rect, start, -4, 0).col, shiftedAnchor(rect, start, -6, 0).col], [40, 41, 40, 39]);
  same('the card is kept on the board at every edge', [shiftedAnchor(rect, start, -1000, -1000), shiftedAnchor(rect, start, 1000, 1000), shiftedAnchor(rect, start, 1000, -1000)], [{ col: 0, row: 0 }, { col: 88, row: 33 }, { col: 88, row: 0 }]);
  same('a board with no size, no start or a number that is not a number gives no place', [shiftedAnchor(null, start, 0, 0), shiftedAnchor({ left: 0, top: 0, width: 0, height: 10 }, start, 0, 0), shiftedAnchor(rect, null, 0, 0), shiftedAnchor(rect, start, NaN, 0), shiftedAnchor(rect, start, 0, Infinity), shiftedAnchor(rect, start, '5', 0)], [null, null, null, null, null, null]);
}

console.log(`All ${checks} board grid checks passed.`);
