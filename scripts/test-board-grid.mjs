// Tests for shared/board-grid.mjs: the grid, the order cells are tried in, settling a board, tidying it, stepping.
import { BOARD_COLS, BOARD_ROWS, BOARD_CAPACITY, validCell, cellKey, cellOf, cellOrder, takenCells, firstEmptyCell, placeAll, arrangeAll, stepFrom, cellAtPoint } from '../shared/board-grid.mjs';

let checks = 0;
const same = (label, actual, expected) => {
  checks++;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) { console.log(`FAILED CHECK: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); process.exit(1); }
};
const is = (card) => card.land === true;
const land = (n, extra = {}) => ({ uid: `c${n}`, n: 'Forest', land: true, ...extra });
const spell = (n, extra = {}) => ({ uid: `c${n}`, n: 'Bear', land: false, ...extra });

same('the grid is 12 by 4 (48 cells)', [BOARD_COLS, BOARD_ROWS, BOARD_CAPACITY], [12, 4, 48]);

// cells
for (const [col, row] of [[0, 0], [11, 3], [5, 2], [0, 3], [11, 0]]) same(`(${col}, ${row}) is a cell`, validCell(col, row), true);
for (const [col, row] of [[-1, 0], [0, -1], [12, 0], [0, 4], [1.5, 0], [0, 2.5], ['1', 1], [1, '1'], [null, 0], [0, undefined], [NaN, 0], [Infinity, 0]]) same(`(${col}, ${row}) is not a cell`, validCell(col, row), false);
same('a card with px and py has that cell', cellOf({ px: 3, py: 2 }), { col: 3, row: 2 });
for (const card of [{}, { px: 3 }, { py: 2 }, { px: 12, py: 0 }, { px: -1, py: 0 }, { px: 1.5, py: 0 }, { px: '3', py: '2' }, null, undefined]) same(`a card with ${JSON.stringify(card)} has no cell`, cellOf(card), null);
same('cellKey is the pair as text', cellKey(3, 2), '3,2');

// the order cells are tried in
const landOrder = cellOrder(true);
const otherOrder = cellOrder(false);
same('there are 48 cells in either order, each once', [landOrder.length, new Set(landOrder.map((c) => cellKey(c.col, c.row))).size, otherOrder.length, new Set(otherOrder.map((c) => cellKey(c.col, c.row))).size], [48, 48, 48, 48]);
same('lands start at the bottom-left and go right', landOrder.slice(0, 3), [{ col: 0, row: 3 }, { col: 1, row: 3 }, { col: 2, row: 3 }]);
same('...then the row above', landOrder.slice(12, 14), [{ col: 0, row: 2 }, { col: 1, row: 2 }]);
same('...and the last cell for a land is the top-right', landOrder.at(-1), { col: 11, row: 0 });
same('other cards start at the top-left and go right', otherOrder.slice(0, 3), [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }]);
same('...then the row below, and the last cell is the bottom-right', [otherOrder[12], otherOrder.at(-1)], [{ col: 0, row: 1 }, { col: 11, row: 3 }]);

// the first empty cell
same('an empty board: a land goes to the bottom-left, another card to the top-left', [firstEmptyCell([], true), firstEmptyCell([], false)], [{ col: 0, row: 3 }, { col: 0, row: 0 }]);
same('the next land goes beside the first', firstEmptyCell([land(1, { px: 0, py: 3 })], true), { col: 1, row: 3 });
same('a land does not take a cell a spell already holds', firstEmptyCell([spell(1, { px: 0, py: 3 })], true), { col: 1, row: 3 });
same('a spell skips a cell a land holds', firstEmptyCell([land(1, { px: 0, py: 0 })], false), { col: 1, row: 0 });
same('a full row of lands moves the next land up a row', firstEmptyCell(Array.from({ length: 12 }, (_, i) => land(i + 1, { px: i, py: 3 })), true), { col: 0, row: 2 });
same('a full board has no empty cell', firstEmptyCell(Array.from({ length: 48 }, (_, i) => spell(i + 1, { px: i % 12, py: Math.floor(i / 12) })), false), null);
same('cards with no cell take no cell', takenCells([land(1), spell(2, { px: 99, py: 0 })]).size, 0);
same('two cards on one cell take it once (the first one holds it)', [...takenCells([land(1, { px: 2, py: 2 }), land(2, { px: 2, py: 2 })]).values()], ['c1']);

// settling a board
{
  const cards = [land(1, { px: 5, py: 1 }), land(2), spell(3), land(4), spell(5, { px: 5, py: 1 })]; // c5 has the same cell as c1
  const placed = placeAll(cards, is);
  same('a card with a good cell keeps it', placed.get('c1'), { col: 5, row: 1 });
  same('a land with none takes the first empty cell for lands', placed.get('c2'), { col: 0, row: 3 });
  same('a spell with none takes the first empty cell for spells', placed.get('c3'), { col: 0, row: 0 });
  same('the next land goes beside the last one', placed.get('c4'), { col: 1, row: 3 });
  same('a second card on a taken cell is moved to the first empty cell for its kind', placed.get('c5'), { col: 1, row: 0 });
  same('every card has its own cell', new Set([...placed.values()].map((c) => cellKey(c.col, c.row))).size, 5);
  same('the cards are not changed', cards.map((c) => [c.px, c.py]), [[5, 1], [undefined, undefined], [undefined, undefined], [undefined, undefined], [5, 1]]);
  same('a card outside the grid is given a cell', placeAll([spell(1, { px: 40, py: 40 })], is).get('c1'), { col: 0, row: 0 });
  same('with nothing it is empty', placeAll([], is).size, 0);
  const crowd = Array.from({ length: 50 }, (_, i) => spell(i + 1));
  const crowded = placeAll(crowd, is);
  same('50 cards: 48 have their own cell and the last two share the last cell so they are still shown', [crowded.size, new Set([...crowded.values()].map((c) => cellKey(c.col, c.row))).size, crowded.get('c50')], [50, 48, { col: 11, row: 3 }]);
}

// tidying
{
  const cards = [spell(1, { n: 'Zebra' }), land(2, { n: 'Island' }), land(3, { n: 'Forest' }), spell(4, { n: 'Ant' }), land(5, { n: 'Forest' }), spell(6, { n: 'Ant' })];
  const arranged = arrangeAll(cards, is);
  same('lands are tidied from the bottom-left, by name, the same name side by side', ['c3', 'c5', 'c2'].map((uid) => arranged.get(uid)), [{ col: 0, row: 3 }, { col: 1, row: 3 }, { col: 2, row: 3 }]);
  same('other cards from the top-left, by name, in the order they came', ['c4', 'c6', 'c1'].map((uid) => arranged.get(uid)), [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }]);
  same('every card has its own cell', new Set([...arranged.values()].map((c) => cellKey(c.col, c.row))).size, 6);
  same('tidying twice gives the same result', [...arrangeAll(cards, is)], [...arranged]);
  same('stored cells are ignored when tidying (everything is placed again)', arrangeAll([land(1, { px: 7, py: 0 })], is).get('c1'), { col: 0, row: 3 });
  const full = Array.from({ length: 48 }, (_, i) => (i % 2 ? land(i + 1) : spell(i + 1)));
  same('48 cards all get their own cell', new Set([...arrangeAll(full, is).values()].map((c) => cellKey(c.col, c.row))).size, 48);
  let refused = false; try { arrangeAll(Array.from({ length: 49 }, (_, i) => spell(i + 1)), is); } catch (error) { refused = /48/.test(error.message); }
  same('49 cards are refused in words', refused, true);
  same('no cards give nothing', arrangeAll([], is).size, 0);
  const sameNames = Array.from({ length: 30 }, (_, i) => spell(i + 1, { n: 'Goblin' }));
  same('30 tokens with one name fill the top rows in the order they came', [...arrangeAll(sameNames, is)].slice(0, 2).map(([uid, cell]) => [uid, cell.col, cell.row]), [['c1', 0, 0], ['c2', 1, 0]]);
}

// stepping
same('a step right', stepFrom({ col: 3, row: 1 }, 'right'), { col: 4, row: 1 });
same('a step left', stepFrom({ col: 3, row: 1 }, 'left'), { col: 2, row: 1 });
same('a step up', stepFrom({ col: 3, row: 1 }, 'up'), { col: 3, row: 0 });
same('a step down', stepFrom({ col: 3, row: 1 }, 'down'), { col: 3, row: 2 });
for (const [cell, direction] of [[{ col: 0, row: 1 }, 'left'], [{ col: 11, row: 1 }, 'right'], [{ col: 3, row: 0 }, 'up'], [{ col: 3, row: 3 }, 'down']]) same(`no step ${direction} from the edge`, stepFrom(cell, direction), null);
same('an unknown direction gives none', [stepFrom({ col: 1, row: 1 }, 'sideways'), stepFrom({ col: 1, row: 1 }, 'toString'), stepFrom({ col: 1, row: 1 }, undefined)], [null, null, null]);

// the cell under a point: a board 1200 wide and 400 high at (100, 50) has cells 100 wide and 100 high
{
  const rect = { left: 100, top: 50, width: 1200, height: 400 };
  same('the top-left corner is the first cell', cellAtPoint(rect, 100, 50), { col: 0, row: 0 });
  same('a point inside a cell', cellAtPoint(rect, 250, 175), { col: 1, row: 1 });
  same('the last cell', cellAtPoint(rect, 1299, 449), { col: 11, row: 3 });
  same('a cell edge belongs to the cell that starts there', [cellAtPoint(rect, 200, 150), cellAtPoint(rect, 199.9, 149.9)], [{ col: 1, row: 1 }, { col: 0, row: 0 }]);
  for (const [label, x, y] of [['left of the board', 99, 100], ['above the board', 200, 49], ['right of the board', 1300, 100], ['below the board', 200, 450], ['far away', 5000, 5000], ['negative', -10, -10]]) same('a point ' + label + ' has no cell', cellAtPoint(rect, x, y), null);
  for (const bad of [null, undefined, {}, { left: 0, top: 0, width: 0, height: 100 }, { left: 0, top: 0, width: 100, height: -5 }, { left: 0, top: 0, width: NaN, height: 100 }]) same('a board with no size (' + JSON.stringify(bad) + ') has no cells', cellAtPoint(bad, 10, 10), null);
  // the last five points have one coordinate inside the board, so only the number check can refuse them
  for (const [x, y] of [[NaN, 10], [10, NaN], [Infinity, 10], [10, -Infinity], ['10', 10], [undefined, 10], [NaN, 175], [250, NaN], [250, '175'], [undefined, undefined], [250, undefined]]) same('a point that is not a number (' + String(x) + ', ' + String(y) + ') has no cell', cellAtPoint(rect, x, y), null);
  same('every cell is found from its own middle', Array.from({ length: 48 }, (_, n) => { const col = n % 12; const row = Math.floor(n / 12); const c = cellAtPoint(rect, 100 + (col + 0.5) * 100, 50 + (row + 0.5) * 100); return c.col === col && c.row === row; }).every(Boolean), true);
}

console.log(`All ${checks} board grid checks passed.`);
