// Tests for placeGroup in shared/zones.mjs: the cards picked up by a rectangle move together (Kevin, 2026-11-14).
import { makeGame, moveCard, placeGroup, setTapped, checkGame, seededRandom } from '../shared/zones.mjs';
import { MAX_COL, MAX_ROW, BOARD_COLS, CARD_ROWS } from '../shared/board-grid.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };
const check = (label, condition, detail = '') => { checks++; if (!condition) fail(label, detail); };

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const deck = { cards: [{ i: id(1), n: 'Forest', qty: 30, section: 'main' }, { i: id(2), n: 'Island', qty: 20, section: 'main' }, { i: id(3), n: 'Goblin Guide', qty: 10, section: 'main' }], commander: [] };
const TYPES = { [id(1)]: 'Basic Land - Forest', [id(2)]: 'Basic Land - Island', [id(3)]: 'Creature - Goblin' };
const lookup = (c) => ({ t: TYPES[c.i] ?? '', m: '', k: [] });
const fresh = () => makeGame(deck, lookup, { random: seededRandom(11) });
// a game whose battlefield holds the cards of these names at these cells (taken from the library, so every card is somewhere exactly once)
function table(spec) {
  let game = fresh();
  const uids = [];
  for (const [name, col, row] of spec) {
    const card = game.zones.library.find((c) => c.n === name && !uids.includes(c.uid));
    game = moveCard(game, card.uid, 'battlefield', { cell: { col, row } });
    uids.push(card.uid);
  }
  return { game, uids };
}
const cells = (game, uids) => uids.map((u) => { const c = game.zones.battlefield.find((x) => x.uid === u); return [c.px, c.py]; });
const problems = (game) => { const found = checkGame(game); return Array.isArray(found) ? found : found ? [found] : []; };

// ---- the group keeps its shape ----
{
  const { game, uids } = table([['Island', 8, 4], ['Goblin Guide', 24, 4], ['Island', 16, 22]]);
  const moved = placeGroup(game, uids, uids[0], 48, 15);
  same('the anchor goes where it was put and the others move by as much: 40 across and 11 down', cells(moved.game, uids), [[48, 15], [64, 15], [56, 33]]);
  same('it says how many cards moved', moved.moved, 3);
  same('the cards are the same cards, only their places changed', moved.game.zones.battlefield.map((c) => ({ ...c, px: 0, py: 0 })), game.zones.battlefield.map((c) => ({ ...c, px: 0, py: 0 })));
  same('no card is lost or copied', problems(moved.game), []);
  same('the game that was given is not changed', cells(game, uids), [[8, 4], [24, 4], [16, 22]]);
}
// ---- nothing to do ----
{
  const { game, uids } = table([['Island', 8, 4], ['Goblin Guide', 24, 4]]);
  const unchanged = placeGroup(game, uids, uids[0], 8, 4);
  same('put back where it is, nothing moves', [unchanged.moved, cells(unchanged.game, uids)], [0, [[8, 4], [24, 4]]]);
}
// ---- the board edge cuts the move short for the whole group ----
{
  const { game, uids } = table([['Island', 8, 4], ['Goblin Guide', 96, 4]]);
  const right = placeGroup(game, uids, uids[0], 40, 4);
  same('the card at 96 can only go 8 more cells, so the whole group goes 8 and keeps its shape', cells(right.game, uids), [[16, 4], [MAX_COL, 4]]);
  const some = table([['Island', 8, 4], ['Goblin Guide', 90, 4]]);
  const part = placeGroup(some.game, some.uids, some.uids[0], 40, 4);
  same('the card at 90 can go 14 cells, so the whole group goes 14', cells(part.game, some.uids), [[22, 4], [MAX_COL, 4]]);
  const up = placeGroup(game, uids, uids[0], 8, 0);
  same('up to row 0 is fine (it was 4 rows down)', cells(up.game, uids), [[8, 0], [96, 0]]);
  const low = table([['Island', 8, 4], ['Goblin Guide', 24, 30]]);
  const down = placeGroup(low.game, low.uids, low.uids[0], 8, 33);
  same('a card low on the board stops the group from going lower than the last row (it can go 3 rows)', cells(down.game, low.uids), [[8, 7], [24, MAX_ROW]]);
  const left = placeGroup(game, uids, uids[0], 0, 4);
  same('to the left edge: the anchor reaches column 0 and the other keeps its distance', cells(left.game, uids), [[0, 4], [88, 4]]);
}
// ---- a tapped card needs the room of its landscape shape ----
{
  let { game, uids } = table([['Island', 8, 4], ['Goblin Guide', 80, 4]]);
  game = setTapped(game, uids[1], true);
  const moved = placeGroup(game, uids, uids[0], 100, 4);
  same('a tapped card cannot start in the last 3 columns: the group stops there', cells(moved.game, uids), [[8 + (BOARD_COLS - CARD_ROWS - 80), 4], [BOARD_COLS - CARD_ROWS, 4]]);
}
// ---- a pile moves whole ----
{
  const { game, uids } = table([['Forest', 0, 33], ['Forest', 0, 33], ['Forest', 0, 33], ['Island', 16, 33]]);
  const moved = placeGroup(game, [uids[2], uids[3]], uids[2], 24, 22);
  same('picking the top card of a pile and an Island moves the pile and the Island: all four', cells(moved.game, uids), [[24, 22], [24, 22], [24, 22], [40, 22]]);
  same('four cards moved', moved.moved, 4);
}
// ---- the group goes on top only when it lands on a card that comes after it ----
{
  const { game, uids } = table([['Island', 8, 4], ['Goblin Guide', 40, 4], ['Island', 64, 4]]);
  const group = [uids[0], uids[1]];
  const onTop = placeGroup(game, group, uids[0], 60, 4); // the first card lands on the third one (4 cells from it)
  same('landing on a card that comes later puts the group at the end of the list (drawn on top)', onTop.game.zones.battlefield.map((c) => c.uid).slice(-2), group);
  const away = placeGroup(game, group, uids[0], 8, 20);
  same('landing on nothing keeps the order of the list', away.game.zones.battlefield.map((c) => c.uid).filter((u) => uids.includes(u)), uids);
}
// ---- bad input ----
{
  const { game, uids } = table([['Island', 8, 4]]);
  let message = '';
  try { placeGroup(game, uids, uids[0], -1, 4); } catch (error) { message = error.message; }
  same('a place that is not on the board is refused in words', message, 'That is not a space on the battlefield.');
  message = '';
  try { placeGroup(game, uids, game.zones.hand[0].uid, 8, 4); } catch (error) { message = error.message; }
  check('an anchor that is not on the battlefield is refused in words', /battlefield/.test(message), message);
  same('cards of the group that are not on the battlefield are left out', placeGroup(game, [...uids, game.zones.hand[0].uid, 'nope'], uids[0], 16, 4).moved, 1);
}
// ---- random groups never lose or copy a card ----
{
  let seed = 7; const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const start = table([['Island', 0, 0], ['Island', 16, 0], ['Goblin Guide', 32, 0], ['Island', 48, 11], ['Goblin Guide', 64, 22], ['Forest', 80, 33], ['Forest', 80, 33]]);
  let game = start.game; const uids = start.uids;
  for (let n = 0; n < 400; n++) {
    const group = uids.filter(() => random() < 0.5);
    const anchor = group.length ? group[Math.floor(random() * group.length)] : uids[0];
    const col = Math.floor(random() * (MAX_COL + 1)); const row = Math.floor(random() * (MAX_ROW + 1));
    const before = game.zones.battlefield.map((c) => c.uid).sort().join();
    game = placeGroup(game, group, anchor, col, row).game;
    if (random() < 0.1) game = setTapped(game, uids[Math.floor(random() * uids.length)], random() < 0.5);
    if (game.zones.battlefield.map((c) => c.uid).sort().join() !== before) fail('random group moves keep every card', `step ${n}`);
    if (!game.zones.battlefield.every((c) => c.px >= 0 && c.px <= MAX_COL && c.py >= 0 && c.py <= MAX_ROW)) fail('random group moves keep every card on the board', `step ${n}`);
    if (problems(game).length) fail('random group moves leave a game that checks out', `${n}: ${problems(game)}`);
  }
  checks++;
}
console.log(`All ${checks} group move checks passed.`);
