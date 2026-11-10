// Tests for playing cards on the battlefield grid in shared/zones.mjs (cells, drops, overlapping, tidying, older games, a crowded board) and for how the cells are stored and written
// (shared/game-sync.mjs): a drag writes one small piece, not the whole battlefield. The grid itself is tested in test-board-grid.mjs.
// The grid is 96 by 32 cells and a card is 8 by 8 (an eighth-card step); cards may overlap and the card later in the battlefield list is drawn on top.
import {
  makeGame, moveCard, draw, createToken, copyAsToken, changeCounter, setTapped, placeCard, arrangeBoard, settleBoard, boardCells, checkGame, seededRandom, ZONES,
} from '../shared/zones.mjs';
import { packCard, unpackCard, gameWrites, joinGame, splitGame, readPublic } from '../shared/game-sync.mjs';
import { BOARD_CAPACITY, validCell, overlaps } from '../shared/board-grid.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const check = (label, condition, detail = '') => { checks++; if (!condition) fail(label, detail); };
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };
const refused = (label, run, words) => {
  checks++;
  try { run(); } catch (error) { if (error instanceof Error && (!words || words.test(error.message))) return; fail(label, `refused with the wrong message: ${error.message}`); }
  fail(label, 'was accepted');
};
const deepFreeze = (value) => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(deepFreeze); } return value; };

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const deck = {
  cards: [
    { i: id(5), n: 'Krenko, Mob Boss', qty: 1, section: 'commander' },
    { i: id(1), n: 'Forest', qty: 24, section: 'main' }, { i: id(2), n: 'Island', qty: 12, section: 'main' }, { i: id(3), n: 'Goblin Guide', qty: 14, section: 'main' }, { i: id(4), n: 'Lightning Bolt', qty: 10, section: 'main' },
  ],
  commander: [id(5)],
};
const TYPES = { [id(1)]: 'Basic Land - Forest', [id(2)]: 'Basic Land - Island', [id(3)]: 'Creature - Goblin', [id(4)]: 'Instant', [id(5)]: 'Legendary Creature - Goblin' };
const lookup = (card) => ({ t: TYPES[card.i] ?? '', m: '', k: [] });
const fresh = () => makeGame(deck, lookup, { random: seededRandom(11) });
const TOKEN = { n: 'Goblin', i: id(70), tt: 'Token Creature - Goblin', pt: '1/1', cl: 'R' };
const LAND_TOKEN = { n: 'Treasure Land', i: id(71), tt: 'Token Land' };
const cardOf = (game, uid) => ZONES.flatMap((zone) => game.zones[zone]).find((card) => card.uid === uid);
const cellOfCard = (card) => (card && validCell(card.px, card.py) ? [card.px, card.py] : null);
// the first card of the hand that is (or is not) a land
const handCard = (game, land) => game.zones.hand.find((card) => /Land/.test(card.t) === land);
const everyCardHasACell = (game) => game.zones.battlefield.every((card) => validCell(card.px, card.py));
const noOverlap = (game) => game.zones.battlefield.every((a, i) => game.zones.battlefield.every((b, j) => i === j || !overlaps({ col: a.px, row: a.py }, { col: b.px, row: b.py })));

// ---- a card entering the battlefield gets a cell ----
{
  let game = fresh();
  const land = handCard(game, true); const spell = handCard(game, false);
  check('the test hand has a land and a spell', Boolean(land && spell));
  check('a card in the hand has no cell', !('px' in land) && !('py' in land));
  game = moveCard(game, land.uid, 'battlefield');
  same('the first land goes to the bottom-left block', cellOfCard(cardOf(game, land.uid)), [0, 24]);
  game = moveCard(game, spell.uid, 'battlefield');
  same('the first other card goes to the top-left block', cellOfCard(cardOf(game, spell.uid)), [0, 0]);
  const land2 = handCard(game, true);
  game = moveCard(game, land2.uid, 'battlefield');
  same('the next land goes beside the first, a whole card away', cellOfCard(cardOf(game, land2.uid)), [8, 24]);
  same('the move leaves a consistent game', checkGame(game), []);
  same('boardCells gives the same cells', [...boardCells(game)].map(([uid, c]) => [uid, c.col, c.row]).sort(), [[land.uid, 0, 24], [land2.uid, 8, 24], [spell.uid, 0, 0]].sort());

  // a drop on a chosen cell
  const spell2 = handCard(game, false);
  const dropped = moveCard(game, spell2.uid, 'battlefield', { cell: { col: 52, row: 12 } });
  same('a card dropped on a cell goes there', cellOfCard(cardOf(dropped, spell2.uid)), [52, 12]);
  const onTop = moveCard(game, spell2.uid, 'battlefield', { cell: { col: 0, row: 24 } });
  same('a card dropped on a card is allowed: both stay, they overlap, and the new one is later in the list (drawn on top)', [cellOfCard(cardOf(onTop, spell2.uid)), cellOfCard(cardOf(onTop, land.uid)), onTop.zones.battlefield.at(-1).uid === spell2.uid], [[0, 24], [0, 24], true]);
  same('a card dropped half over another is allowed too', cellOfCard(cardOf(moveCard(game, spell2.uid, 'battlefield', { cell: { col: 4, row: 22 } }), spell2.uid)), [4, 22]);
  for (const [label, cell] of [['outside the grid (column 89: the card would run off the edge)', { col: 89, row: 0 }], ['outside the grid (row 25)', { col: 0, row: 25 }], ['a negative column', { col: -1, row: 0 }], ['a fraction', { col: 1.5, row: 0 }], ['text', { col: '1', row: '1' }]]) {
    refused(`a drop ${label} is refused, in words`, () => moveCard(game, spell2.uid, 'battlefield', { cell }), /not a space on the battlefield/);
  }
  same('the refused drops changed nothing', game.zones.battlefield.length, 3);

  // leaving the battlefield takes the cell away
  const back = moveCard(game, spell.uid, 'hand');
  check('a card that leaves the battlefield has no cell', !('px' in cardOf(back, spell.uid)) && !('py' in cardOf(back, spell.uid)));
  const again = moveCard(back, spell.uid, 'battlefield');
  same('and takes the first free block when it comes back', cellOfCard(cardOf(again, spell.uid)), [0, 0]);
  check('a block is free again when its card leaves', cellOfCard(cardOf(moveCard(moveCard(game, spell.uid, 'graveyard'), spell2.uid, 'battlefield'), spell2.uid)).join() === '0,0');
  const overlapped = moveCard(game, spell2.uid, 'battlefield', { cell: { col: 4, row: 0 } });
  const third = handCard(overlapped, false);
  same('a new card skips a block that a card half over it covers', cellOfCard(cardOf(moveCard(overlapped, third.uid, 'battlefield'), third.uid)), [16, 0]);
}

// ---- tokens and copies ----
{
  let game = fresh();
  const made = createToken(game, TOKEN);
  same('a token goes to the first free block for other cards', cellOfCard(cardOf(made.game, made.uid)), [0, 0]);
  const landToken = createToken(made.game, LAND_TOKEN);
  same('a land token goes to the bottom-left like a land', cellOfCard(cardOf(landToken.game, landToken.uid)), [0, 24]);
  const copied = copyAsToken(landToken.game, made.uid);
  same('a copy takes the next free block for its kind', cellOfCard(cardOf(copied.game, copied.uid)), [8, 0]);
  check('a token that leaves the battlefield is gone, and its block is free', cardOf(moveCard(copied.game, made.uid, 'hand'), made.uid) === undefined && cellOfCard(cardOf(createToken(moveCard(copied.game, made.uid, 'hand'), TOKEN).game, 'c' + (copied.game.nextUid))) !== null);
  same('everything is consistent', checkGame(copied.game), []);
}

// ---- placing a card that is already on the battlefield ----
{
  let game = fresh();
  const a = handCard(game, false);
  game = moveCard(game, a.uid, 'battlefield');
  game = moveCard(game, handCard(game, false).uid, 'battlefield');
  const second = game.zones.battlefield[1];
  same('two cards start in the first two blocks', [cellOfCard(cardOf(game, a.uid)), cellOfCard(second)], [[0, 0], [8, 0]]);
  let result = placeCard(game, a.uid, 40, 12);
  same('placing a card on an empty cell moves it there', [cellOfCard(cardOf(result.game, a.uid)), result.swapped], [[40, 12], null]);
  check('the other card did not move', cellOfCard(cardOf(result.game, second.uid)).join() === '8,0');
  same('a card moved to free space keeps its place in the list (so only that one card is written)', result.game.zones.battlefield.map((c) => c.uid), [a.uid, second.uid]);
  result = placeCard(game, a.uid, 8, 0);
  same('placing a card exactly on another keeps both there, overlapping, and no swap', [cellOfCard(cardOf(result.game, a.uid)), cellOfCard(cardOf(result.game, second.uid)), result.swapped], [[8, 0], [8, 0], null]);
  same('...with the placed card on top: it covers a card that comes after it, so it goes to the end of the list', result.game.zones.battlefield.at(-1).uid, a.uid);
  result = placeCard(game, second.uid, 8, 0);
  same('a card dropped on a card that comes BEFORE it is already on top and keeps its place', result.game.zones.battlefield.map((c) => c.uid), [a.uid, second.uid]);
  result = placeCard(game, a.uid, 12, 4);
  same('a card that now only touches a later card by a few cells still counts as covering it', result.game.zones.battlefield.map((c) => c.uid), [second.uid, a.uid]);
  result = placeCard(game, a.uid, 16, 0);
  same('...but one a whole card away does not', result.game.zones.battlefield.map((c) => c.uid), [a.uid, second.uid]);
  result = placeCard(game, second.uid, 2, 2);
  same('placing the later card where it half covers the other changes no list order', result.game.zones.battlefield.map((c) => c.uid), [a.uid, second.uid]);
  {
    // three cards: the middle one dropped on the first stays in the middle of the list (it is already above it), and dropped on the last goes to the end
    let three = game; three = moveCard(three, handCard(three, false).uid, 'battlefield');
    const [first, middle, lastOne] = three.zones.battlefield;
    same('the middle card dropped on an earlier card keeps its place in the list', placeCard(three, middle.uid, first.px, first.py).game.zones.battlefield.map((c) => c.uid), [first.uid, middle.uid, lastOne.uid]);
    same('the middle card dropped on a later card goes to the end', placeCard(three, middle.uid, lastOne.px, lastOne.py).game.zones.battlefield.map((c) => c.uid), [first.uid, lastOne.uid, middle.uid]);
  }
  result = placeCard(game, a.uid, 0, 0);
  same('placing a card on its own cell changes nothing', [result.game === game, result.swapped], [true, null]);
  refused('a cell outside the grid is refused', () => placeCard(game, a.uid, 89, 0), /not a space on the battlefield/);
  refused('a card in the hand cannot be placed', () => placeCard(game, handCard(game, true).uid, 0, 0), /battlefield/);
  refused('a card that is not in the game cannot be placed', () => placeCard(game, 'c9999', 0, 0), /not in the game/);
  check('after any placing the game is consistent and every card has a cell', [placeCard(game, a.uid, 6, 6), placeCard(game, a.uid, 8, 0), placeCard(game, second.uid, 0, 0)].every((r) => checkGame(r.game).length === 0 && everyCardHasACell(r.game)));
  const frozen = deepFreeze(structuredClone(game));
  check('the old game is never changed', (() => { placeCard(frozen, a.uid, 18, 2); placeCard(frozen, a.uid, 8, 0); return true; })());
  check('tapping, counters and marks keep a card on its cell', (() => { const placed = placeCard(game, a.uid, 60, 10).game; const tapped = setTapped(placed, a.uid, true); const counted = changeCounter(tapped, a.uid, 'p', 2); return cellOfCard(cardOf(counted, a.uid)).join() === '60,10'; })());
}

// ---- an older game: cards with no cell ----
{
  const game = fresh();
  const hand = game.zones.hand;
  const legacy = { ...game, zones: { ...game.zones, hand: hand.slice(3), battlefield: hand.slice(0, 3).map((card) => ({ ...card, tapped: false, turnEntered: 1 })) } };
  check('the older game has no cells', legacy.zones.battlefield.every((card) => !('px' in card)));
  const settled = settleBoard(legacy);
  check('settling gives every card a cell, none covering another', everyCardHasACell(settled) && noOverlap(settled), JSON.stringify(settled.zones.battlefield.map((c) => [c.px, c.py])));
  check('the same game object comes back when nothing had to change', settleBoard(settled) === settled);
  same('settling twice gives the same cells', settleBoard(settled).zones.battlefield.map((c) => [c.px, c.py]), settled.zones.battlefield.map((c) => [c.px, c.py]));
  const twoOnOne = { ...settled, zones: { ...settled.zones, battlefield: settled.zones.battlefield.map((card) => ({ ...card, px: 8, py: 2 })) } };
  check('cards on one cell stay there (overlapping is allowed)', settleBoard(twoOnOne) === twoOnOne);
  const outside = { ...settled, zones: { ...settled.zones, battlefield: settled.zones.battlefield.map((card) => ({ ...card, px: 99, py: 0 })) } };
  check('cells outside the grid are replaced', everyCardHasACell(settleBoard(outside)) && noOverlap(settleBoard(outside)));
  // a stored cell that is right in the column and wrong in the row is still wrong (and the reverse)
  {
    const spell = handCard(game, false); const land = handCard(game, true);
    const lone = (card, extra) => ({ ...game, zones: { ...game.zones, hand: game.zones.hand.filter((c) => c.uid !== card.uid), battlefield: [{ ...card, tapped: false, turnEntered: 1, ...extra }] } });
    const rowWrong = settleBoard(lone(spell, { px: 0, py: 99 })).zones.battlefield[0];
    same('a card with the right column and an impossible row is moved to the first free block', [rowWrong.px, rowWrong.py], [0, 0]);
    const colWrong = settleBoard(lone(spell, { px: 99, py: 0 })).zones.battlefield[0];
    same('...and so is one with the right row and an impossible column', [colWrong.px, colWrong.py], [0, 0]);
    const nearEdge = settleBoard(lone(spell, { px: 89, py: 0 })).zones.battlefield[0];
    same('...and one that would run off the right edge', [nearEdge.px, nearEdge.py], [0, 0]);
    same('boardCells puts a land that has no cell on the bottom row and a spell on the top row', [...boardCells({ ...game, zones: { ...game.zones, battlefield: [{ ...land, tapped: false, turnEntered: 1 }, { ...spell, tapped: false, turnEntered: 1 }] } })].map(([, c]) => [c.col, c.row]), [[0, 24], [0, 0]]);
    const shared = lone(spell, { px: 4, py: 2 });
    const doubled = { ...shared, zones: { ...shared.zones, hand: shared.zones.hand.filter((c) => c.uid !== land.uid), battlefield: [shared.zones.battlefield[0], { ...land, tapped: false, turnEntered: 1, px: 4, py: 2 }] } };
    same('checkGame accepts two cards on one cell (they overlap)', checkGame(doubled), []);
    check('checkGame reports a cell that is not on the grid', checkGame(lone(spell, { px: 99, py: 0 })).some((p) => /not on the grid/.test(p)) && checkGame(lone(spell, { px: 2 })).some((p) => /not on the grid/.test(p)) && checkGame(lone(spell, { px: 89, py: 0 })).some((p) => /not on the grid/.test(p)));
    same('checkGame accepts a card on a good cell', checkGame(lone(spell, { px: 88, py: 24 })), []);
  }
  check('placing a card on an older game settles it first', (() => { const r = placeCard(legacy, legacy.zones.battlefield[0].uid, 48, 8); return cellOfCard(cardOf(r.game, legacy.zones.battlefield[0].uid)).join() === '48,8' && everyCardHasACell(r.game); })());
}

// ---- tidying ----
{
  let game = fresh();
  for (let i = 0; i < 5; i++) game = moveCard(game, handCard(game, true)?.uid ?? game.zones.hand[0].uid, 'battlefield');
  game = draw(game, 5).game;
  for (let i = 0; i < 4; i++) { const spell = handCard(game, false); if (spell) game = moveCard(game, spell.uid, 'battlefield', { cell: { col: 80 - i * 6, row: 10 } }); } // dropped so that they overlap
  const tidy = arrangeBoard(game);
  check('every card is on its own block afterwards, and the game is consistent', noOverlap(tidy) && everyCardHasACell(tidy) && checkGame(tidy).length === 0);
  const lands = tidy.zones.battlefield.filter((c) => /Land/.test(c.t));
  const others = tidy.zones.battlefield.filter((c) => !/Land/.test(c.t));
  check('lands are in the bottom row from the left, a card apart', lands.every((c) => c.py === 24) && lands.map((c) => c.px).sort((a, b) => a - b).join() === lands.map((_, i) => i * 8).join());
  check('other cards are in the top row from the left, a card apart', others.every((c) => c.py === 0) && others.map((c) => c.px).sort((a, b) => a - b).join() === others.map((_, i) => i * 8).join());
  same('the same lands are next to each other (by name)', lands.slice().sort((a, b) => a.px - b.px).map((c) => c.n).join() === lands.slice().sort((a, b) => a.n < b.n ? -1 : a.n > b.n ? 1 : 0).map((c) => c.n).join(), true);
  check('tidying twice gives the same board', JSON.stringify(arrangeBoard(tidy).zones.battlefield) === JSON.stringify(tidy.zones.battlefield));
  check('tidying changes nothing but the cells', tidy.zones.battlefield.every((c) => { const before = cardOf(game, c.uid); const { px, py, ...rest } = c; const { px: bx, py: by, ...beforeRest } = before; return JSON.stringify(rest) === JSON.stringify(beforeRest); }));
  const frozen = deepFreeze(structuredClone(game));
  check('the old game is never changed', (() => { arrangeBoard(frozen); return true; })());
  check('tidying an empty battlefield is fine', arrangeBoard(fresh()).zones.battlefield.length === 0);
}

// ---- a crowded battlefield: nothing is refused ----
{
  let game = fresh();
  while (game.zones.battlefield.length < BOARD_CAPACITY) game = createToken(game, TOKEN).game;
  same('48 cards fill the 48 blocks', game.zones.battlefield.length, 48);
  check('all 48 are on blocks of their own', noOverlap(game) && checkGame(game).length === 0);
  const card = game.zones.hand[0];
  const more = moveCard(game, card.uid, 'battlefield');
  same('one more card from the hand is still accepted, and goes on the last block it tried', [more.zones.battlefield.length, cellOfCard(cardOf(more, card.uid))], [49, /Land/.test(card.t) ? [88, 0] : [88, 24]]);
  same('one more token is accepted', createToken(game, TOKEN).game.zones.battlefield.length, 49);
  same('one more copy is accepted', copyAsToken(game, game.zones.battlefield[0].uid).game.zones.battlefield.length, 49);
  check('a crowded game is consistent', checkGame(more).length === 0 && everyCardHasACell(more));
  const freed = moveCard(game, game.zones.battlefield[5].uid, 'hand');
  check('after one card leaves, one more takes the freed block', cellOfCard(cardOf(moveCard(freed, card.uid, 'battlefield'), card.uid)).join() === `${game.zones.battlefield[5].px},${game.zones.battlefield[5].py}`);
  check('tidying a full board works, and tidying 49 cards puts the extra one on the first block', noOverlap(arrangeBoard(game)) && everyCardHasACell(arrangeBoard(more)));
}

// ---- stored and read back ----
{
  let game = fresh();
  game = moveCard(game, handCard(game, true).uid, 'battlefield');
  game = moveCard(game, handCard(game, false).uid, 'battlefield', { cell: { col: 62, row: 18 } });
  const card = game.zones.battlefield[1];
  const stored = packCard(card);
  same('a card on the battlefield stores px and py', [stored.px, stored.py], [62, 18]);
  same('a card with a column and no row stores neither (the database refuses an undefined value)', (() => { const half = packCard({ ...card, py: undefined }); return [Object.keys(half).filter((k) => k === 'px' || k === 'py'), Object.values(half).includes(undefined)]; })(), [[], false]);
  same('and a card in the hand stores neither', Object.keys(packCard(game.zones.hand[0])).filter((k) => k === 'px' || k === 'py'), []);
  const back = unpackCard(stored, lookup);
  same('it reads back on the same cell', [back.px, back.py], [62, 18]);
  const joined = joinGame(splitGame(game).public, splitGame(game).private, lookup);
  check('a saved game comes back with every cell', joined.zones.battlefield.every((c, i) => c.px === game.zones.battlefield[i].px && c.py === game.zones.battlefield[i].py));
  same('another player sees the same cells', readPublic(splitGame(game).public, lookup).zones.battlefield.map((c) => [c.px, c.py]), game.zones.battlefield.map((c) => [c.px, c.py]));
  for (const [label, fields] of [['a column of 4001', { px: 4001, py: 0 }], ['a negative row', { px: 0, py: -1 }], ['a fraction', { px: 1.5, py: 0 }], ['text', { px: '3', py: '1' }], ['null', { px: null, py: 0 }], ['true', { px: true, py: 0 }]]) {
    check(`a stored card with ${label} is dropped (it cannot be read as a card)`, unpackCard({ ...stored, ...fields }, lookup) === null);
  }
  check('a stored card with a column and no row reads without a cell', (() => { const { py, ...only } = stored; const read = unpackCard(only, lookup); return read && !('px' in read) && !('py' in read); })());
  check('a cell outside the grid (but within 4000) reads back and is shown on a cell of the grid', (() => { const read = unpackCard({ ...stored, px: 3000, py: 3000 }, lookup); const shown = boardCells({ zones: { battlefield: [read] } }).get(read.uid); return read.px === 3000 && validCell(shown.col, shown.row); })());
}

// ---- what a move writes ----
{
  let game = fresh();
  game = moveCard(game, handCard(game, true).uid, 'battlefield');
  game = moveCard(game, handCard(game, false).uid, 'battlefield');
  game = moveCard(game, handCard(game, true).uid, 'battlefield');
  const key = (writes) => Object.keys(writes).sort();
  const last = game.zones.battlefield.at(-1);
  const dragged = placeCard(game, last.uid, 66, 10).game; // the card already on top: only its cell changes
  const underneath = placeCard(game, game.zones.battlefield[0].uid, 80, 18).game; // a card from underneath moved to free space: it keeps its place in the list
  same('dragging a card from underneath to free space also writes one card', key(gameWrites('u', game, underneath)), ['public/u/battlefield/0']);
  same('dragging the top card to another cell writes ONE card, not the battlefield', key(gameWrites('u', game, dragged)), ['public/u/battlefield/2']);
  same('...and it is that card with its new cell', [gameWrites('u', game, dragged)['public/u/battlefield/2'].px, gameWrites('u', game, dragged)['public/u/battlefield/2'].py], [66, 10]);
  check('that write is small (under 200 bytes)', JSON.stringify(gameWrites('u', game, dragged)).length < 200, String(JSON.stringify(gameWrites('u', game, dragged)).length));
  const first = game.zones.battlefield[0];
  const lifted = placeCard(game, first.uid, game.zones.battlefield[2].px, game.zones.battlefield[2].py).game; // a card from underneath dropped on a card above it goes on top: the others move up one place
  check('putting a card on top of two others writes the places that changed (at most 4 pieces) or the zone', key(gameWrites('u', game, lifted)).every((k) => /^public\/u\/battlefield(\/\d)?$/.test(k)));
  check('tapping writes one card', key(gameWrites('u', game, setTapped(game, first.uid, true))).join() === 'public/u/battlefield/0');
  same('nothing changed writes nothing', key(gameWrites('u', game, game)), []);
  const tidy = arrangeBoard(game);
  check('tidying writes only the cards that moved, as pieces of the zone', key(gameWrites('u', game, tidy)).every((k) => /^public\/u\/battlefield(\/\d)?$/.test(k)));
  same('a card leaving the battlefield writes the whole zone (the cards are no longer in the same places)', key(gameWrites('u', game, moveCard(game, first.uid, 'hand'))).filter((k) => k.startsWith('public/u/battlefield')), ['public/u/battlefield']);
  same('a card arriving writes the whole zone', key(gameWrites('u', game, moveCard(game, handCard(game, false).uid, 'battlefield'))).filter((k) => k.startsWith('public/u/battlefield')), ['public/u/battlefield']);
  same('the first save writes every zone whole', key(gameWrites('u', null, game)).filter((k) => /battlefield/.test(k)), ['public/u/battlefield']);
  // a zone of many cards where every card changed is written whole, not as many pieces
  let crowd = fresh();
  for (let i = 0; i < 8; i++) crowd = createToken(crowd, TOKEN).game;
  const arranged = arrangeBoard(setAllCells(crowd));
  function setAllCells(g) { return { ...g, zones: { ...g.zones, battlefield: g.zones.battlefield.map((c, i) => ({ ...c, px: 80 - i, py: 10 })) } }; }
  same('when more than four places change, the zone is written as one piece', key(gameWrites('u', setAllCells(crowd), arranged)).filter((k) => k.startsWith('public/u/battlefield')), ['public/u/battlefield']);
  // applying the pieces to a stored copy gives the new game
  const apply = (db, writes) => { for (const [path, value] of Object.entries(writes)) { const parts = path.split('/'); let node = db; for (const part of parts.slice(0, -1)) node = node[part] ??= {}; if (value === null) delete node[parts.at(-1)]; else node[parts.at(-1)] = JSON.parse(JSON.stringify(value)); } };
  const db = {};
  apply(db, gameWrites('u', null, game));
  let current = game;
  for (const next of [dragged, setTapped(dragged, last.uid, true), placeCard(setTapped(dragged, last.uid, true), first.uid, 0, 6).game, lifted, arrangeBoard(game), moveCard(game, first.uid, 'hand'), moveCard(game, handCard(game, false).uid, 'battlefield')]) {
    apply(db, gameWrites('u', current, next));
    current = next;
    const rebuilt = joinGame(db.public.u, db.private.u, lookup);
    if (JSON.stringify(rebuilt.zones.battlefield.map((c) => [c.uid, c.px, c.py, c.tapped])) !== JSON.stringify(next.zones.battlefield.map((c) => [c.uid, c.px, c.py, c.tapped]))) fail('the pieces written for a move rebuild the game', JSON.stringify(rebuilt.zones.battlefield.map((c) => [c.uid, c.px, c.py])));
    checks++;
  }
}

// ---- long random games: nothing is lost, every card always has a cell, every game checks out ----
for (const seed of [1, 2, 3, 4, 5]) {
  const random = seededRandom(seed * 313);
  const pick = (list) => list[Math.floor(random() * list.length)];
  let game = fresh();
  const real = ZONES.reduce((sum, zone) => sum + game.zones[zone].length, 0);
  let refusedCount = 0;
  for (let step = 0; step < 2500; step++) {
    const field = game.zones.battlefield;
    const all = ZONES.flatMap((zone) => game.zones[zone]);
    const op = pick(['move', 'move', 'move', 'draw', 'place', 'place', 'place', 'drop', 'arrange', 'token', 'copy', 'tap', 'settle']);
    try {
      if (op === 'move' && all.length) game = moveCard(game, pick(all).uid, pick(ZONES));
      else if (op === 'draw') game = draw(game, 1).game;
      else if (op === 'place' && field.length) game = placeCard(game, pick(field).uid, Math.floor(random() * 89), Math.floor(random() * 25)).game;
      else if (op === 'drop') { const c = pick(game.zones.hand.length ? game.zones.hand : all); if (!field.some((f) => f.uid === c.uid)) game = moveCard(game, c.uid, 'battlefield', { cell: { col: Math.floor(random() * 89), row: Math.floor(random() * 25) } }); }
      else if (op === 'arrange') game = arrangeBoard(game);
      else if (op === 'token') game = createToken(game, random() < 0.2 ? LAND_TOKEN : TOKEN).game;
      else if (op === 'copy' && field.length) game = copyAsToken(game, pick(field).uid).game;
      else if (op === 'tap' && field.length) { const c = pick(field); game = setTapped(game, c.uid, !c.tapped); }
      else if (op === 'settle') game = settleBoard(game);
    } catch (error) {
      if (/type is not known/.test(error.message)) { refusedCount++; continue; }
      fail(`random game ${seed}, step ${step} (${op})`, `an operation that should work threw: ${error.message}`);
    }
    const problems = checkGame(game);
    if (problems.length) fail(`random game ${seed}, step ${step} (${op})`, problems.join('; '));
    if (!everyCardHasACell(game)) fail(`random game ${seed}, step ${step} (${op})`, 'a card on the battlefield has no cell');
  }
  const kept = ZONES.reduce((sum, zone) => sum + game.zones[zone].filter((card) => !card.tok).length, 0);
  if (kept !== real) fail(`random game ${seed}`, `real cards went from ${real} to ${kept}`);
  check(`random game ${seed}: 2,500 moves, drops, overlaps and tidies; every card on the battlefield always had a cell and no real card was lost (${refusedCount} refused in words)`, true);
}

console.log(`All ${checks} board play checks passed.`);
