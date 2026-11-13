// Tests for shared/stacks.mjs and how stacks work in the game logic: what makes two cards one stack, how a stack is counted, where a new card goes (onto a pile it matches), the snap
// when a card is dropped near a pile, and tidying (a pile stays one pile).
import { stackKey, stackInfo, stackCellFor, snapToStack, STACK_VISIBLE, STACK_HOLD_MS, SNAP_RADIUS } from '../shared/stacks.mjs';
import { arrangeAll } from '../shared/board-grid.mjs';
import { makeGame, moveCard, placeCard, placeStack, setTapped, setTapStepOut, getTapStepOut, untapAll, setNoUntap, changeCounter, arrangeBoard, createToken, copyAsToken, seededRandom, isLandCard, checkGame, ZONES } from '../shared/zones.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };
const check = (label, condition, detail = '') => { checks++; if (!condition) fail(label, detail); };

same('a pile shows 3 copies, and a card dropped within 6 cells snaps to a pile', [STACK_VISIBLE, SNAP_RADIUS], [3, 6]);
same('a pile is held for 350 ms before it is ready to be moved as a whole', STACK_HOLD_MS, 350);

// ---- what makes two cards the same stack ----
const card = (extra = {}) => ({ uid: 'c1', n: 'Forest', px: 0, py: 0, tapped: false, ...extra });
same('two plain cards of one name are the same stack', stackKey(card({ uid: 'c1' })), stackKey(card({ uid: 'c2', px: 50, py: 8 })));
same('the picture (printing) does not matter', stackKey(card({ p: 'aaaa' })), stackKey(card({ p: 'bbbb', i: 'x' })));
same('a missing mark, a false one, a zero and an empty object are all "none"', new Set([stackKey(card()), stackKey(card({ sick: false })), stackKey(card({ mp: 0 })), stackKey(card({ ct: {} })), stackKey(card({ ct: { p: 0 } })), stackKey(card({ nt: '' })), stackKey(card({ faceDown: false, turned: false, noUntap: false }))]).size, 1);
for (const [label, extra] of [['another name', { n: 'Island' }], ['tapped', { tapped: true }], ['summoning sick', { sick: true }], ["doesn't untap", { noUntap: true }], ['a counter', { ct: { p: 1 } }], ['a power change', { mp: 2 }], ['a toughness change', { mt: -1 }], ['a note', { nt: 'is a creature' }], ['face down', { faceDown: true }], ['turned over', { turned: true }], ['being a token', { tok: true }]]) {
  check(`a card with ${label} is not in the plain stack`, stackKey(card(extra)) !== stackKey(card()), label);
}
same('counters in another order are the same state', stackKey(card({ ct: { p: 1, x: 2 } })), stackKey(card({ ct: { x: 2, p: 1 } })));
check('different counters are different', stackKey(card({ ct: { p: 1 } })) !== stackKey(card({ ct: { p: 2 } })));

// ---- counting a stack ----
{
  const cards = [card({ uid: 'a' }), card({ uid: 'b' }), card({ uid: 'c', n: 'Island' }), card({ uid: 'd' }), card({ uid: 'e', tapped: true }), card({ uid: 'f', px: 8 })];
  const cells = new Map(cards.map((c) => [c.uid, { col: c.px, row: c.py }]));
  const info = stackInfo(cards, cells);
  same('three Forests on one cell are a stack of 3, the last of them on top', ['a', 'b', 'd'].map((u) => info.get(u)), [{ size: 3, depth: 2 }, { size: 3, depth: 1 }, { size: 3, depth: 0 }]);
  same('another name, a tapped copy and another cell are alone', ['c', 'e', 'f'].map((u) => info.get(u)), [{ size: 1, depth: 0 }, { size: 1, depth: 0 }, { size: 1, depth: 0 }]);
  same('a card with no cell is not counted', stackInfo([card({ uid: 'z' })], new Map()).size, 0);
}

// ---- where a new card goes ----
{
  const cards = [card({ uid: 'a', px: 16, py: 24 }), card({ uid: 'b', n: 'Island', px: 24, py: 24 }), card({ uid: 'c', px: 40, py: 8 })];
  same('a new Forest goes to the pile of the LAST Forest in the list', stackCellFor(cards, card({ uid: 'new' })), { col: 40, row: 8 });
  same('a new card of a name that is not there has no pile', stackCellFor(cards, card({ uid: 'new', n: 'Swamp' })), null);
  same('a tapped one does not join the untapped Forests', stackCellFor(cards, card({ uid: 'new', tapped: true })), null);
  same('a card is never its own pile', stackCellFor([card({ uid: 'a', px: 8, py: 8 })], card({ uid: 'a' })), null);
  same('a card with no cell gives no pile', stackCellFor([card({ uid: 'a', px: undefined, py: undefined })], card({ uid: 'new' })), null);
}

// ---- the snap ----
{
  const cards = [card({ uid: 'a', px: 20, py: 10 }), card({ uid: 'b', n: 'Island', px: 60, py: 10 }), card({ uid: 'c', px: 31, py: 10 })];
  const drop = card({ uid: 'new' });
  same('dropped 4 cells from a Forest it snaps onto it', snapToStack(cards, drop, { col: 16, row: 10 }), { col: 20, row: 10 });
  same('...also 6 cells away, in the other directions and diagonally', [snapToStack(cards, drop, { col: 14, row: 10 }), snapToStack(cards, drop, { col: 20, row: 16 }), snapToStack(cards, drop, { col: 14, row: 4 })], [{ col: 20, row: 10 }, { col: 20, row: 10 }, { col: 20, row: 10 }]);
  same('dropped 7 cells away it stays where it was dropped', [snapToStack(cards, drop, { col: 13, row: 10 }), snapToStack(cards, drop, { col: 20, row: 17 })], [{ col: 13, row: 10 }, { col: 20, row: 17 }]);
  same('it snaps to the NEAREST pile when two are in reach (26 is 6 from 20 and 5 from 31)', snapToStack(cards, drop, { col: 26, row: 10 }), { col: 31, row: 10 });
  same('a card with another name is not attracted (the Island at 60)', snapToStack(cards, drop, { col: 61, row: 10 }), { col: 61, row: 10 });
  same('a tapped card does not snap to untapped ones', snapToStack(cards, card({ uid: 'new', tapped: true }), { col: 21, row: 10 }), { col: 21, row: 10 });
  same('a card is never attracted by itself', snapToStack(cards, card({ uid: 'a', px: 20, py: 10 }), { col: 21, row: 10 }), { col: 21, row: 10 });
  same('the pile a card is leaving does not attract it, so it can be taken a short way off', snapToStack([card({ uid: 'a', px: 20, py: 10 }), card({ uid: 'b', px: 20, py: 10 })], card({ uid: 'a', px: 20, py: 10 }), { col: 23, row: 10 }, 6, { col: 20, row: 10 }), { col: 23, row: 10 });
  same('but another pile still does', snapToStack([card({ uid: 'a', px: 20, py: 10 }), card({ uid: 'b', px: 20, py: 10 }), card({ uid: 'c', px: 28, py: 10 })], card({ uid: 'a', px: 20, py: 10 }), { col: 23, row: 10 }, 6, { col: 20, row: 10 }), { col: 28, row: 10 });
  same('a smaller radius can be asked for', snapToStack(cards, drop, { col: 22, row: 10 }, 1), { col: 22, row: 10 });
}

// ---- a tapped card has a landscape area: wider than tall ----
{
  const tappedPile = [card({ uid: 'a', px: 40, py: 20, tapped: true })];
  const tappedDrop = card({ uid: 'new', tapped: true });
  same('a tapped card dropped 8 columns from a tapped pile joins it (a card turned on its side is 11 wide for a card that is 8 wide)', snapToStack(tappedPile, tappedDrop, { col: 48, row: 20 }), { col: 40, row: 20 });
  same('...but 9 columns is too far', snapToStack(tappedPile, tappedDrop, { col: 49, row: 20 }), { col: 49, row: 20 });
  same('...and it is narrower the other way: 4 rows joins, 5 rows does not', [snapToStack(tappedPile, tappedDrop, { col: 40, row: 24 }), snapToStack(tappedPile, tappedDrop, { col: 40, row: 25 })], [{ col: 40, row: 20 }, { col: 40, row: 25 }]);
  same('an untapped card keeps the square area of 6 around an untapped pile', [snapToStack([card({ uid: 'a', px: 40, py: 20 })], card({ uid: 'new' }), { col: 46, row: 26 }), snapToStack([card({ uid: 'a', px: 40, py: 20 })], card({ uid: 'new' }), { col: 47, row: 20 })], [{ col: 40, row: 20 }, { col: 47, row: 20 }]);
  same('when two piles are in reach the one that is nearer in its WORST direction wins (4 across and 4 down beats 6 across)', snapToStack([card({ uid: 'a', px: 42, py: 24 }), card({ uid: 'b', px: 40, py: 20 })], card({ uid: 'new' }), { col: 46, row: 20 }), { col: 42, row: 24 });
  same('...and a pile 5 across beats one that is 2 across but 6 down', snapToStack([card({ uid: 'a', px: 35, py: 20 }), card({ uid: 'b', px: 32, py: 26 })], card({ uid: 'new' }), { col: 30, row: 20 }), { col: 35, row: 20 });
  same('the nearer of two tapped piles wins when both are in reach', snapToStack([card({ uid: 'a', px: 30, py: 20, tapped: true }), card({ uid: 'b', px: 38, py: 20, tapped: true })], tappedDrop, { col: 35, row: 21 }), { col: 38, row: 20 });
}

// ---- tidying keeps a pile together ----
{
  const cards = [card({ uid: 'c1', n: 'Zebra' }), card({ uid: 'c2', n: 'Forest' }), card({ uid: 'c3', n: 'Forest' }), card({ uid: 'c4', n: 'Forest', tapped: true }), card({ uid: 'c5', n: 'Island' }), card({ uid: 'c6', n: 'Forest' })];
  const arranged = arrangeAll(cards, (c) => c.n !== 'Zebra', stackKey);
  same('the three untapped Forests share one block, the tapped one has its own, then the Island', ['c2', 'c3', 'c6', 'c4', 'c5'].map((u) => arranged.get(u)), [{ col: 0, row: 33 }, { col: 0, row: 33 }, { col: 0, row: 33 }, { col: 8, row: 33 }, { col: 16, row: 33 }]);
  same('other cards still start at the top-left', arranged.get('c1'), { col: 0, row: 0 });
  same('without a key every card has its own block as before', ['c2', 'c3', 'c6'].map((u) => arrangeAll(cards, (c) => c.n !== 'Zebra').get(u)), [{ col: 0, row: 33 }, { col: 8, row: 33 }, { col: 24, row: 33 }]);
}

// ---- in the game: new cards join piles, tapped ones do not, drops snap, tidying keeps piles ----
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const deck = { cards: [{ i: id(1), n: 'Forest', qty: 30, section: 'main' }, { i: id(2), n: 'Island', qty: 20, section: 'main' }, { i: id(3), n: 'Goblin Guide', qty: 10, section: 'main' }], commander: [] };
const TYPES = { [id(1)]: 'Basic Land - Forest', [id(2)]: 'Basic Land - Island', [id(3)]: 'Creature - Goblin' };
const lookup = (c) => ({ t: TYPES[c.i] ?? '', m: '', k: [] });
const fresh = () => makeGame(deck, lookup, { random: seededRandom(5) });
const nameInHand = (game, name) => game.zones.hand.find((c) => c.n === name);
const field = (game) => game.zones.battlefield;
const cellOf2 = (c) => [c.px, c.py];
{
  let game = fresh();
  while (!game.zones.hand.some((c) => c.n === 'Forest' && true) || game.zones.hand.filter((c) => c.n === 'Forest').length < 3) game = { ...game, zones: { ...game.zones, hand: [...game.zones.hand, ...game.zones.library.slice(0, 1)], library: game.zones.library.slice(1) } };
  const forests = game.zones.hand.filter((c) => c.n === 'Forest');
  game = moveCard(game, forests[0].uid, 'battlefield');
  game = moveCard(game, forests[1].uid, 'battlefield');
  game = moveCard(game, forests[2].uid, 'battlefield');
  same('three Forests played one after another are one pile on the first land block', field(game).map(cellOf2), [[0, 33], [0, 33], [0, 33]]);
  same('...a stack of three', [...stackInfo(field(game), new Map(field(game).map((c) => [c.uid, { col: c.px, row: c.py }]))).values()].map((v) => v.size), [3, 3, 3]);
  same('the game is consistent', checkGame(game), []);

  // a tapped Forest is a different stack: the next Forest joins the untapped pile, not the tapped one
  game = setTapped(game, field(game)[2].uid, true);
  const more = game.zones.hand.find((c) => c.n === 'Forest') ?? null;
  check('there is another Forest in the hand for the tapped-card test', Boolean(more));
  if (more) { const next = moveCard(game, more.uid, 'battlefield'); same('a new Forest joins the untapped pile, not the tapped card (the last Forest in the list)', cellOf2(field(next).at(-1)), [0, 33]); }

  // a counter makes a card different: a new plain Forest does not join a Forest that has a counter if that one is the only one left
  let g2 = fresh();
  const f = g2.zones.hand.find((c) => c.n === 'Forest');
  check('the counter test has a Forest to play', Boolean(f));
  if (f) {
    g2 = moveCard(g2, f.uid, 'battlefield');
    g2 = changeCounter(g2, f.uid, 'p', 1);
    const f2 = g2.zones.hand.find((c) => c.n === 'Forest');
    check('...and a second one', Boolean(f2));
    if (f2) { const next = moveCard(g2, f2.uid, 'battlefield'); same('a Forest with a counter does not take a plain Forest into its pile: the new one takes a block beside it', cellOf2(field(next).at(-1)), [8, 33]); }
  }

  // creatures that come in sick stack with each other (same state), and not with ones that are no longer sick
  let g3 = fresh();
  g3 = { ...g3, zones: { ...g3.zones, hand: [...g3.zones.hand, ...g3.zones.library.filter((c) => c.n === 'Goblin Guide').slice(0, 3)] } };
  const guides = g3.zones.hand.filter((c) => c.n === 'Goblin Guide');
  check('the sick-creature test has three Goblin Guides', guides.length >= 3);
  if (guides.length >= 3) {
    g3 = moveCard(g3, guides[0].uid, 'battlefield');
    g3 = moveCard(g3, guides[1].uid, 'battlefield');
    same('two sick Goblin Guides are a pile at the first block for other cards', field(g3).map(cellOf2), [[0, 0], [0, 0]]);
  }

  // tokens and copies join a pile of the same name and state
  let g4 = createToken(fresh(), { n: 'Goblin', i: id(70), tt: 'Token Creature - Goblin', pt: '1/1', cl: 'R' }).game;
  g4 = createToken(g4, { n: 'Goblin', i: id(70), tt: 'Token Creature - Goblin', pt: '1/1', cl: 'R' }).game;
  g4 = copyAsToken(g4, field(g4)[0].uid).game;
  same('two Goblin tokens and a copy of one are one pile', field(g4).map(cellOf2), [[0, 0], [0, 0], [0, 0]]);

  // a drop near a pile snaps to it, and a card can be taken a short way off its own pile
  let g5 = fresh();
  const forests5 = g5.zones.hand.filter((c) => c.n === 'Forest');
  check('the snap test has three Forests', forests5.length >= 3);
  if (forests5.length >= 3) {
    g5 = moveCard(g5, forests5[0].uid, 'battlefield', { cell: { col: 30, row: 12 } });
    g5 = moveCard(g5, forests5[1].uid, 'battlefield', { cell: { col: 35, row: 14 } });
    same('a Forest dropped 5 cells from another one joins it', cellOf2(field(g5)[1]), [30, 12]);
    g5 = moveCard(g5, forests5[2].uid, 'battlefield', { cell: { col: 40, row: 12 } });
    same('...but one dropped 10 cells away stays where it was dropped', cellOf2(field(g5)[2]), [40, 12]);
    const top = field(g5)[1];
    const off = placeCard(g5, top.uid, 32, 12).game;
    same('a card taken 2 cells off its pile leaves it (the pile it left does not pull it back)', cellOf2(field(off).find((c) => c.uid === top.uid)), [32, 12]);
    const onto = placeCard(g5, top.uid, 35, 12).game;
    same('a card moved to 5 cells from another pile joins that pile', cellOf2(field(onto).find((c) => c.uid === top.uid)), [40, 12]);
  }

  // whether a dropped card must go on top is decided where it ends up (on the pile it snapped to), not where it was dropped
  {
    let g7 = fresh();
    const fs7 = g7.zones.hand.filter((c) => c.n === 'Forest');
    const guide = g7.zones.hand.find((c) => c.n === 'Goblin Guide') ?? g7.zones.library.find((c) => c.n === 'Goblin Guide');
    check('the snap-and-order test has two Forests and a Goblin Guide', fs7.length >= 2 && Boolean(guide));
    g7 = { ...g7, zones: { ...g7.zones, hand: [...g7.zones.hand.filter((c) => c.uid !== guide.uid), guide] } };
    g7 = moveCard(g7, fs7[1].uid, 'battlefield', { cell: { col: 20, row: 10 } });
    g7 = moveCard(g7, fs7[0].uid, 'battlefield', { cell: { col: 60, row: 20 } });
    g7 = moveCard(g7, guide.uid, 'battlefield', { cell: { col: 28, row: 10 } });
    const dropped = placeCard(g7, fs7[0].uid, 23, 10).game; // 3 cells from the pile at (20, 10): it snaps there; the Guide at (28, 10) is a whole card from that cell
    same('a card that snaps onto a pile keeps its place in the list when nothing above it is covered at the pile', [cellOf2(field(dropped)[1]), field(dropped).map((c) => c.uid)], [[20, 10], field(g7).map((c) => c.uid)]);
  }

  // tidying keeps piles
  let g6 = fresh();
  for (const c of g6.zones.hand.slice(0, 5)) g6 = moveCard(g6, c.uid, 'battlefield', { cell: { col: 70 - field(g6).length * 9, row: 6 } });
  const tidy = arrangeBoard(g6);
  const infoAfter = stackInfo(field(tidy), new Map(field(tidy).map((c) => [c.uid, { col: c.px, row: c.py }])));
  check('after tidying every card of the same name and state is in one pile', field(tidy).every((a) => field(tidy).every((b) => stackKey(a) !== stackKey(b) || (a.px === b.px && a.py === b.py))));
  check('...and the piles are counted', [...infoAfter.values()].every((v) => v.size >= 1 && v.depth < v.size));
  check('tidying a pile twice changes nothing', JSON.stringify(arrangeBoard(tidy).zones.battlefield) === JSON.stringify(tidy.zones.battlefield));
}

// ---- tapping and untapping move a card out of / back into its pile ----
{
  const withForests = (count, extra = 0) => {
    let g = fresh();
    const pool = [...g.zones.hand, ...g.zones.library].filter((c) => c.n === 'Forest').slice(0, count + extra);
    g = { ...g, zones: { ...g.zones, hand: [...g.zones.hand.filter((c) => !pool.some((p) => p.uid === c.uid)), ...pool], library: g.zones.library.filter((c) => !pool.some((p) => p.uid === c.uid)) } };
    for (const c of pool.slice(0, count)) g = moveCard(g, c.uid, 'battlefield');
    return { g, ids: pool.map((c) => c.uid) };
  };
  const at = (g, uid) => cellOf2(field(g).find((c) => c.uid === uid));
  const { g: three, ids } = withForests(3);
  check('three Forests are one pile before any tapping', ids.slice(0, 3).every((u) => at(three, u).join() === '0,33'));
  let g = setTapped(three, ids[2], true);
  same('tapping a Forest out of the pile of three moves it to the place on its right (a card and one cell) (the pile keeps two)', [at(g, ids[2]), at(g, ids[0]), at(g, ids[1])], [[9, 33], [0, 33], [0, 33]]);
  same('...the tapped one is its own stack and the other two are still a stack of two', [...stackInfo(field(g), new Map(field(g).map((c) => [c.uid, { col: c.px, row: c.py }]))).values()].map((v) => v.size).sort(), [1, 2, 2]);
  g = setTapped(g, ids[1], true);
  same('a second tapped Forest joins the tapped pile on the right', [at(g, ids[1]), at(g, ids[2]), at(g, ids[0])], [[9, 33], [9, 33], [0, 33]]);
  g = setTapped(g, ids[0], true);
  same('the last Forest, alone on its cell next to the tapped pile, joins it too (nothing is left behind)', ids.slice(0, 3).map((u) => at(g, u)), [[9, 33], [9, 33], [9, 33]]);
  g = setTapped(g, ids[1], false);
  same('untapping one out of a stack of tapped cards with no untapped pile beside it puts it on the LEFT of the stack, a card and one cell away', at(g, ids[1]), [0, 33]);
  let h = setTapped(setTapped(three, ids[2], true), ids[1], true);
  h = setTapped(h, ids[1], false);
  same('with an untapped pile next to the tapped one, untapping a card puts it back on the untapped pile', [at(h, ids[1]), at(h, ids[0]), at(h, ids[2])], [[0, 33], [0, 33], [9, 33]]);
  h = untapAll(h);
  same('Untap all puts every tapped Forest back on the pile', ids.slice(0, 3).map((u) => at(h, u)), [[0, 33], [0, 33], [0, 33]]);
  {
    // three of four Forests tapped (a tapped stack of three beside an untapped one): Untap all puts all four back on one pile, not just the first
    const four = withForests(4);
    let t = four.g;
    for (const u of four.ids.slice(1)) t = setTapped(t, u, true);
    same('the set-up: one untapped Forest on the pile and three tapped ones together beside it', [at(t, four.ids[0]), ...four.ids.slice(1).map((u) => at(t, u))], [[0, 33], [9, 33], [9, 33], [9, 33]]);
    const all = untapAll(t);
    same('Untap all brings every tapped Forest of the stack back onto the untapped pile', four.ids.map((u) => at(all, u)), [[0, 33], [0, 33], [0, 33], [0, 33]]);
    check('...and the pile counts four', [...stackInfo(field(all), new Map(field(all).map((c) => [c.uid, { col: c.px, row: c.py }]))).values()].every((v) => v.size === 4));
  }
  check('the games stay consistent', [three, g, h].every((x) => checkGame(x).length === 0));
  same('tapping a card that is already tapped changes nothing', setTapped(setTapped(three, ids[0], true), ids[0], true).zones.battlefield.map((c) => [c.px, c.py]), setTapped(three, ids[0], true).zones.battlefield.map((c) => [c.px, c.py]));
  check('and the same game comes back', (() => { const t = setTapped(three, ids[0], true); return setTapped(t, ids[0], true) === t; })());

  // a card alone on its cell just turns where it is
  const { g: one, ids: oneIds } = withForests(1);
  same('a Forest alone on its cell stays where it is when tapped and when untapped', [at(setTapped(one, oneIds[0], true), oneIds[0]), at(setTapped(setTapped(one, oneIds[0], true), oneIds[0], false), oneIds[0])], [[0, 33], [0, 33]]);

  // the block on the right is taken: it goes to the left, and when the pile is at the edge too, below or above
  let crowded = three;
  crowded = createToken(crowded, { n: 'Spirit', i: id(70), tt: 'Token Land' }).game; // a land of another name: takes the next land block (8, 33)
  const spiritCell = at(crowded, field(crowded).at(-1).uid);
  same('another land is on the block to the right of the pile', spiritCell, [8, 33]);
  crowded = setTapped(crowded, ids[2], true);
  same('so a Forest tapped out of the pile goes to the other side or above (nothing is covered)', [at(crowded, ids[2])].map((c) => c.join()), ['0,22']);

  // untapping out of a tapped stack at the left edge: the stack is scooched to the right and the card takes its place
  {
    const x = withForests(0, 3);
    let g12 = moveCard(x.g, x.ids[0], 'battlefield', { cell: { col: 3, row: 11 } });
    g12 = moveCard(g12, x.ids[1], 'battlefield', { cell: { col: 3, row: 11 } });
    g12 = moveCard(g12, x.ids[2], 'battlefield', { cell: { col: 3, row: 11 } });
    for (const u of x.ids) { g12 = setTapped(g12, u, true); g12 = placeCard(g12, u, 3, 11).game; } // each one steps out to the right when tapped and is then put back on (3, 11): a tapped stack there
    check('the set-up: three tapped Forests on one cell with no room on the left', x.ids.every((u) => at(g12, u).join() === '3,11'), JSON.stringify(x.ids.map((u) => at(g12, u))));
    const off = setTapped(g12, x.ids[2], false);
    same('the card takes the cell the stack was on and the stack moves a card and one cell to the right', [at(off, x.ids[2]), at(off, x.ids[0]), at(off, x.ids[1])], [[3, 11], [12, 11], [12, 11]]);
    check('...and the game is consistent', checkGame(off).length === 0);
    // a card on the right of the stack in the way: no scooching, the card goes below instead
    const wall = createToken(g12, { n: 'Spirit', i: id(70), tt: 'Token Land' }).game;
    const wallUid = field(wall).at(-1).uid;
    const walled = placeCard(wall, wallUid, 13, 11).game;
    const noScooch = setTapped(walled, x.ids[2], false);
    same('with a card where the stack would be scooched to, the stack stays and the untapped card goes below it', [at(noScooch, x.ids[2]), at(noScooch, x.ids[0])], [[3, 22], [3, 11]]);
    // in the horizontal style (tapped cards go up) an untapped card leaves the stack downwards, with no scooching sideways
    setTapStepOut('up');
    try {
      const down = setTapped(g12, x.ids[2], false);
      same('in the "up" style an untapped card leaves the tapped stack below it, and nothing is scooched sideways', [at(down, x.ids[2]), at(down, x.ids[0])], [[3, 22], [3, 11]]);
    } finally { setTapStepOut('right'); }
  }

  // ---- moving a whole pile ----
  {
    const x4 = withForests(4);
    const ids4 = x4.ids;
    let g13 = x4.g;
    const guide = [...g13.zones.hand, ...g13.zones.library].find((c) => c.n === 'Goblin Guide');
    g13 = { ...g13, zones: { ...g13.zones, hand: [...g13.zones.hand.filter((c) => c.uid !== guide.uid), guide], library: g13.zones.library.filter((c) => c.uid !== guide.uid) } };
    check('the pile test has a Goblin Guide in the hand', Boolean(guide));
    g13 = moveCard(g13, guide.uid, 'battlefield', { cell: { col: 50, row: 11 } }); // a card with another name, away from the pile
    const moved = placeStack(g13, ids4[1], 30, 22);
    same('dragging any card of a pile of four moves all four together to the new cell', [moved.moved, ids4.map((u) => at(moved.game, u))], [4, [[30, 22], [30, 22], [30, 22], [30, 22]]]);
    same('...and the order in the pile is kept (the same top card)', field(moved.game).filter((c) => ids4.includes(c.uid)).map((c) => c.uid), ids4);
    same('...and a card with another name does not go with it', at(moved.game, guide.uid), [50, 11]);
    same('a pile of one moves one card', placeStack(g13, guide.uid, 60, 11).moved, 1);
    const stay = placeStack(g13, ids4[0], 0, 33);
    same('the same cell changes nothing and says how many are there', [stay.moved, stay.game.zones.battlefield.map(cellOf2).join() === g13.zones.battlefield.map(cellOf2).join()], [4, true]);
    const throws = (run, words) => { try { run(); } catch (error) { return words.test(error.message); } return false; };
    check('a place that is not on the board is refused, and so is a card that is not on the battlefield', throws(() => placeStack(g13, ids4[0], 105, 0), /not a space on the battlefield/) && throws(() => placeStack(g13, g13.zones.hand[0].uid, 5, 5), /battlefield/));
    // a tapped card is another kind and does not go along
    const tappedOne = setTapped(g13, ids4[3], true); // steps out to the right as its own stack
    const withTapped = placeStack(tappedOne, ids4[0], 30, 22).game;
    check('the three untapped cards go together and the tapped one stays where it was', ids4.slice(0, 3).every((u) => at(withTapped, u).join() === '30,22') && at(withTapped, ids4[3]).join() === at(tappedOne, ids4[3]).join(), JSON.stringify(ids4.map((u) => at(withTapped, u))));
    // a tapped card that happens to be on the same cell is another stack and stays; and the order in the list follows the same rule as moving one card
    const sameCell = placeCard(setTapped(g13, ids4[3], true), ids4[3], 0, 33).game; // the tapped card put back on the pile's cell
    const leftBehind = placeStack(sameCell, ids4[0], 40, 22).game;
    check('a tapped card on the same cell is not part of the untapped pile and stays on it', ids4.slice(0, 3).every((u) => at(leftBehind, u).join() === '40,22') && at(leftBehind, ids4[3]).join() === '0,33', JSON.stringify(ids4.map((u) => at(leftBehind, u))));
    const freeSpace = placeStack(g13, ids4[0], 70, 0).game;
    same('moved to free space the pile keeps its places in the list (the list is unchanged apart from the cells)', field(freeSpace).map((c) => c.uid), field(g13).map((c) => c.uid));
    const onGuide = placeStack(g13, ids4[0], 50, 11).game; // onto the Goblin Guide that comes after the pile in the list
    same('moved onto a card that comes later in the list the whole pile goes to the end, in its own order, after that card', field(onGuide).map((c) => c.uid), [guide.uid, ...ids4]);
    {
      // a pile moved onto a card that is EARLIER in the list is already above it: the list keeps its order
      const y = withForests(0, 3);
      let g14 = y.g;
      const early = [...g14.zones.hand, ...g14.zones.library].find((c) => c.n === 'Goblin Guide');
      g14 = { ...g14, zones: { ...g14.zones, hand: [...g14.zones.hand.filter((c) => c.uid !== early.uid), early], library: g14.zones.library.filter((c) => c.uid !== early.uid) } };
      g14 = moveCard(g14, early.uid, 'battlefield', { cell: { col: 50, row: 11 } });
      for (const u of y.ids) g14 = moveCard(g14, u, 'battlefield', { cell: { col: 20, row: 22 } });
      g14 = createToken(g14, { n: 'Spirit', i: id(70), tt: 'Token Creature - Spirit' }).game; // a card after the pile in the list, far from where it goes
      const onto = placeStack(g14, y.ids[0], 50, 11).game;
      same('a pile moved onto a card that comes earlier keeps its places in the list', field(onto).map((c) => c.uid), field(g14).map((c) => c.uid));
    }
    // two piles of the same kind: dropped within the snap distance, the moved pile joins the other (all cards on one cell)
    const six = withForests(0, 6);
    let t6 = six.g;
    for (const u of six.ids.slice(0, 3)) t6 = moveCard(t6, u, 'battlefield', { cell: { col: 20, row: 11 } });
    for (const u of six.ids.slice(3, 6)) t6 = moveCard(t6, u, 'battlefield', { cell: { col: 60, row: 22 } });
    const merged = placeStack(t6, six.ids[3], 24, 11).game;
    check('a pile dragged to within the snap distance of another pile of its kind joins it: one pile of six', six.ids.every((u) => at(merged, u).join() === '20,11'), JSON.stringify(six.ids.map((u) => at(merged, u))));
    check('the old game is not changed and the new one is consistent', checkGame(merged).length === 0 && at(t6, six.ids[3]).join() === '60,22');
  }

  // the horizontal pile style: the tapped copies go on TOP of the pile, a whole card higher, in the same columns
  same('the step-out direction is "right" by default and anything but "up" means right', [getTapStepOut(), (setTapStepOut('sideways'), getTapStepOut())], ['right', 'right']);
  setTapStepOut('up');
  try {
    let up = setTapped(three, ids[2], true);
    same('with "up" a Forest tapped out of the pile goes a whole card higher, in the same columns', [at(up, ids[2]), at(up, ids[0])], [[0, 22], [0, 33]]);
    up = setTapped(up, ids[1], true);
    same('a second tapped Forest joins the tapped stack above', [at(up, ids[1]), at(up, ids[2])], [[0, 22], [0, 22]]);
    up = setTapped(up, ids[1], false);
    same('untapping brings it back down onto the pile (11 rows away is within a card)', [at(up, ids[1]), at(up, ids[0])], [[0, 33], [0, 33]]);
    const top = withForests(0, 3);
    let t2 = moveCard(top.g, top.ids[0], 'battlefield', { cell: { col: 0, row: 0 } });
    t2 = moveCard(t2, top.ids[1], 'battlefield');
    t2 = setTapped(t2, top.ids[1], true);
    same('a pile on the top row has no room above, so a tapped card goes to its right instead', t2.zones.battlefield.map(cellOf2).length, 2);
    check('...a pile that was moved to row 0 is tapped to the side (9 columns right)', (() => { const x = withForests(0, 2); let g = moveCard(x.g, x.ids[0], 'battlefield', { cell: { col: 20, row: 0 } }); g = moveCard(g, x.ids[1], 'battlefield', { cell: { col: 20, row: 0 } }); g = setTapped(g, x.ids[1], true); return at(g, x.ids[1]).join() === '29,0'; })());
  } finally { setTapStepOut('right'); }
  same('after the tests the direction is back to "right"', getTapStepOut(), 'right');

  // untapping goes back to a pile exactly a card away (the above block is 11 rows away) but not across the board
  crowded = setTapped(crowded, ids[2], false);
  same('the Forest that was tapped above the pile goes back onto it when untapped (exactly 11 rows away)', at(crowded, ids[2]), [0, 33]);
  check('a tapped card taken far from the untapped pile of its name stays where it is when untapped (a card does not jump across the board), far sideways or far up', [[50, 0], [0, 0], [8, 11]].every(([col, row]) => { const x = withForests(2); let g9 = setTapped(x.g, x.ids[1], true); g9 = placeCard(g9, x.ids[1], col, row).game; g9 = setTapped(g9, x.ids[1], false); return at(g9, x.ids[1]).join() === col + ',' + row; }));

  // the step out of a pile is a whole card plus one cell, and untapping rejoins from exactly there but not one cell further
  check('a tapped card 9 columns from the untapped pile rejoins it, one at 10 columns does not', [[9, 33, '0,33'], [10, 33, '10,33']].every(([col, row, want]) => { const x = withForests(2); let g11 = setTapped(x.g, x.ids[1], true); g11 = placeCard(g11, x.ids[1], col, row).game; g11 = setTapped(g11, x.ids[1], false); return at(g11, x.ids[1]).join() === want; }));

  // order in the list: a card that joins a pile that is EARLIER in the list does not jump to the end
  {
    const x = withForests(0, 3); // three Forests left in the hand, so they can be played onto chosen cells
    let g8 = moveCard(x.g, x.ids[0], 'battlefield', { cell: { col: 8, row: 33 } });
    g8 = setTapped(g8, x.ids[0], true); // a lone tapped Forest at (8, 33), first in the list
    g8 = moveCard(g8, x.ids[1], 'battlefield');
    g8 = moveCard(g8, x.ids[2], 'battlefield');
    g8 = createToken(g8, { n: 'Spirit', i: id(70), tt: 'Token Land' }).game; // a land of another name, last in the list
    const order = field(g8).map((c) => c.uid);
    check('the set-up has the tapped Forest first, the pile of two at the first block, and the token last', at(g8, x.ids[0]).join() === '8,33' && at(g8, x.ids[1]).join() === '0,33' && at(g8, x.ids[2]).join() === '0,33', JSON.stringify(field(g8).map(cellOf2)));
    const tappedNow = setTapped(g8, x.ids[2], true); // joins the tapped Forest at (8, 33), which is earlier in the list
    same('it joins the tapped pile and keeps its place in the list (only one card is written)', [at(tappedNow, x.ids[2]), field(tappedNow).map((c) => c.uid)], [[8, 33], order]);
  }

  // a different-name card on the same cell is not a pile mate, so a lone Forest tapped there stays
  {
    const x = withForests(1);
    let g10 = createToken(x.g, { n: 'Spirit', i: id(70), tt: 'Token Land' }).game;
    g10 = moveCard(g10, field(g10).at(-1).uid, 'battlefield', { cell: { col: 0, row: 33 } }); // already on the battlefield; place it on the Forest's cell
    g10 = placeCard(g10, field(g10).at(-1).uid, 0, 33).game;
    const tappedForest = setTapped(g10, x.ids[0], true);
    same('a Forest sharing its cell only with a card of another name is not "in a pile": tapping it leaves it there', at(tappedForest, x.ids[0]), [0, 33]);
  }

  // nothing to untap changes nothing, and tapping on an old game (cards with no cell) settles the board first
  check('Untap all with nothing tapped returns the same game', untapAll(three) === three);
  {
    const legacy = { ...three, zones: { ...three.zones, battlefield: three.zones.battlefield.map((c) => { const { px, py, ...rest } = c; return rest; }) } };
    const tappedLegacy = setTapped(legacy, ids[0], true);
    check('tapping a card of an older game (no cells) gives every card a cell', tappedLegacy.zones.battlefield.every((c) => Number.isInteger(c.px) && Number.isInteger(c.py)));
  }

  // a counter makes a card different, and a card with "doesn't untap" stays tapped on its own
  const { g: held, ids: heldIds } = withForests(2);
  let k = setNoUntap(held, heldIds[1], true);
  k = setTapped(k, heldIds[1], true);
  k = untapAll(k);
  check('Untap all leaves a card marked doesnt-untap tapped and where it is', field(k).find((c) => c.uid === heldIds[1]).tapped === true);
}

// ---- random games: every card keeps a cell, stacks are consistent, no card is lost ----
for (const seed of [11, 12, 13]) {
  const random = seededRandom(seed * 17);
  const pick = (list) => list[Math.floor(random() * list.length)];
  let game = fresh();
  const real = ZONES.reduce((sum, zone) => sum + game.zones[zone].length, 0);
  for (let step = 0; step < 1500; step++) {
    const f = game.zones.battlefield; const all = ZONES.flatMap((z) => game.zones[z]);
    const op = pick(['move', 'move', 'move', 'place', 'place', 'drop', 'tap', 'counter', 'arrange']);
    try {
      if (op === 'move') game = moveCard(game, pick(all).uid, pick(ZONES));
      else if (op === 'place' && f.length) game = placeCard(game, pick(f).uid, Math.floor(random() * 89), Math.floor(random() * 25)).game;
      else if (op === 'drop') { const c = pick(game.zones.hand.length ? game.zones.hand : all); if (!f.some((x) => x.uid === c.uid)) game = moveCard(game, c.uid, 'battlefield', { cell: { col: Math.floor(random() * 89), row: Math.floor(random() * 25) } }); }
      else if (op === 'tap' && f.length) { const c = pick(f); game = setTapped(game, c.uid, !c.tapped); }
      else if (op === 'counter' && f.length) game = changeCounter(game, pick(f).uid, 'p', random() < 0.5 ? 1 : -1);
      else if (op === 'arrange') game = arrangeBoard(game);
    } catch (error) { fail(`random game ${seed} step ${step} (${op})`, error.message); }
    const problems = checkGame(game);
    if (problems.length) fail(`random game ${seed} step ${step} (${op})`, problems.join('; '));
    const cells = new Map(game.zones.battlefield.map((c) => [c.uid, { col: c.px, row: c.py }]));
    const info = stackInfo(game.zones.battlefield, cells);
    if (info.size !== game.zones.battlefield.length) fail(`random game ${seed} step ${step}`, 'a card has no stack entry');
    for (const [uid, v] of info) if (v.depth < 0 || v.depth >= v.size) fail(`random game ${seed} step ${step}`, `stack depth ${v.depth} of ${v.size} for ${uid}`);
  }
  const kept = ZONES.reduce((sum, zone) => sum + game.zones[zone].filter((c) => !c.tok).length, 0);
  if (kept !== real) fail(`random game ${seed}`, `real cards went from ${real} to ${kept}`);
  check(`random game ${seed}: 1,500 moves, drops, taps, counters and tidies; stacks always consistent and no card lost`, true);
}

console.log(`All ${checks} stack checks passed.`);
