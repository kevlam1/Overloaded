// Tests for playing cards on the battlefield grid in shared/zones.mjs (cells, drops, swaps, tidying, older games, a full board) and for how the cells are stored and written
// (shared/game-sync.mjs): a drag writes one small piece, not the whole battlefield. The grid itself is tested in test-board-grid.mjs.
import {
  makeGame, moveCard, draw, createToken, copyAsToken, changeCounter, setTapped, placeCard, arrangeBoard, settleBoard, boardCells, checkGame, seededRandom, ZONES,
} from '../shared/zones.mjs';
import { packCard, unpackCard, gameWrites, joinGame, splitGame, readPublic } from '../shared/game-sync.mjs';
import { BOARD_CAPACITY, validCell } from '../shared/board-grid.mjs';

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
const unique = (game) => new Set(game.zones.battlefield.map((card) => `${card.px},${card.py}`)).size === game.zones.battlefield.length;

// ---- a card entering the battlefield gets a cell ----
{
  let game = fresh();
  const land = handCard(game, true); const spell = handCard(game, false);
  check('the test hand has a land and a spell', Boolean(land && spell));
  check('a card in the hand has no cell', !('px' in land) && !('py' in land));
  game = moveCard(game, land.uid, 'battlefield');
  same('the first land goes to the bottom-left cell', cellOfCard(cardOf(game, land.uid)), [0, 3]);
  game = moveCard(game, spell.uid, 'battlefield');
  same('the first other card goes to the top-left cell', cellOfCard(cardOf(game, spell.uid)), [0, 0]);
  const land2 = handCard(game, true);
  game = moveCard(game, land2.uid, 'battlefield');
  same('the next land goes beside the first', cellOfCard(cardOf(game, land2.uid)), [1, 3]);
  same('the move leaves a consistent game', checkGame(game), []);
  same('boardCells gives the same cells', [...boardCells(game)].map(([uid, c]) => [uid, c.col, c.row]).sort(), [[land.uid, 0, 3], [land2.uid, 1, 3], [spell.uid, 0, 0]].sort());

  // a drop on a chosen cell
  const spell2 = handCard(game, false);
  const dropped = moveCard(game, spell2.uid, 'battlefield', { cell: { col: 6, row: 2 } });
  same('a card dropped on an empty cell goes there', cellOfCard(cardOf(dropped, spell2.uid)), [6, 2]);
  refused('a card dropped on a taken cell is refused, in words', () => moveCard(game, spell2.uid, 'battlefield', { cell: { col: 0, row: 3 } }), /space is taken/);
  for (const [label, cell] of [['outside the grid (column 12)', { col: 12, row: 0 }], ['outside the grid (row 4)', { col: 0, row: 4 }], ['a negative column', { col: -1, row: 0 }], ['a fraction', { col: 1.5, row: 0 }], ['text', { col: '1', row: '1' }]]) {
    refused(`a drop ${label} is refused, in words`, () => moveCard(game, spell2.uid, 'battlefield', { cell }), /not a space on the battlefield/);
  }
  same('the refused drops changed nothing', game.zones.battlefield.length, 3);

  // leaving the battlefield takes the cell away
  const back = moveCard(game, spell.uid, 'hand');
  check('a card that leaves the battlefield has no cell', !('px' in cardOf(back, spell.uid)) && !('py' in cardOf(back, spell.uid)));
  const again = moveCard(back, spell.uid, 'battlefield');
  same('and takes the first empty cell when it comes back', cellOfCard(cardOf(again, spell.uid)), [0, 0]);
  check('a cell is free again when its card leaves', cellOfCard(cardOf(moveCard(moveCard(game, spell.uid, 'graveyard'), spell2.uid, 'battlefield'), spell2.uid)).join() === '0,0');
}

// ---- tokens and copies ----
{
  let game = fresh();
  const made = createToken(game, TOKEN);
  same('a token goes to the first empty cell for other cards', cellOfCard(cardOf(made.game, made.uid)), [0, 0]);
  const landToken = createToken(made.game, LAND_TOKEN);
  same('a land token goes to the bottom-left like a land', cellOfCard(cardOf(landToken.game, landToken.uid)), [0, 3]);
  const copied = copyAsToken(landToken.game, made.uid);
  same('a copy takes the next free cell for its kind', cellOfCard(cardOf(copied.game, copied.uid)), [1, 0]);
  check('a token that leaves the battlefield is gone, and its cell is free', cardOf(moveCard(copied.game, made.uid, 'hand'), made.uid) === undefined && cellOfCard(cardOf(createToken(moveCard(copied.game, made.uid, 'hand'), TOKEN).game, 'c' + (copied.game.nextUid))) !== null);
  same('everything is consistent', checkGame(copied.game), []);
}

// ---- placing a card that is already on the battlefield ----
{
  let game = fresh();
  const [a, b, c] = [handCard(game, false), handCard(moveCard(game, handCard(game, false).uid, 'battlefield'), false), null];
  game = moveCard(game, a.uid, 'battlefield');
  game = moveCard(game, handCard(game, false).uid, 'battlefield');
  const second = game.zones.battlefield[1];
  same('two cards start at the first two cells', [cellOfCard(cardOf(game, a.uid)), cellOfCard(second)], [[0, 0], [1, 0]]);
  let result = placeCard(game, a.uid, 5, 2);
  same('placing a card on an empty cell moves it there', [cellOfCard(cardOf(result.game, a.uid)), result.swapped], [[5, 2], null]);
  check('the other card did not move', cellOfCard(cardOf(result.game, second.uid)).join() === '1,0');
  result = placeCard(game, a.uid, 1, 0);
  same('placing a card on a taken cell swaps the two', [cellOfCard(cardOf(result.game, a.uid)), cellOfCard(cardOf(result.game, second.uid)), result.swapped], [[1, 0], [0, 0], second.uid]);
  result = placeCard(game, a.uid, 0, 0);
  same('placing a card on its own cell changes nothing', [result.game === game, result.swapped], [true, null]);
  refused('a cell outside the grid is refused', () => placeCard(game, a.uid, 12, 0), /not a space on the battlefield/);
  refused('a card in the hand cannot be placed', () => placeCard(game, handCard(game, true).uid, 0, 0), /battlefield/);
  refused('a card that is not in the game cannot be placed', () => placeCard(game, 'c9999', 0, 0), /not in the game/);
  check('after any placing the game is consistent and no cell is shared', [placeCard(game, a.uid, 3, 3), placeCard(game, a.uid, 1, 0), placeCard(game, second.uid, 0, 0)].every((r) => checkGame(r.game).length === 0 && unique(r.game)));
  const frozen = deepFreeze(structuredClone(game));
  check('the old game is never changed', (() => { placeCard(frozen, a.uid, 9, 1); placeCard(frozen, a.uid, 1, 0); return true; })());
  check('tapping, counters and marks keep a card on its cell', (() => { const placed = placeCard(game, a.uid, 7, 1).game; const tapped = setTapped(placed, a.uid, true); const counted = changeCounter(tapped, a.uid, 'p', 2); return cellOfCard(cardOf(counted, a.uid)).join() === '7,1'; })());
}

// ---- an older game: cards with no cell ----
{
  const game = fresh();
  const hand = game.zones.hand;
  const legacy = { ...game, zones: { ...game.zones, hand: hand.slice(3), battlefield: hand.slice(0, 3).map((card) => ({ ...card, tapped: false, turnEntered: 1 })) } };
  check('the older game has no cells', legacy.zones.battlefield.every((card) => !('px' in card)));
  const settled = settleBoard(legacy);
  check('settling gives every card a cell, each its own', settled.zones.battlefield.every((card) => validCell(card.px, card.py)) && unique(settled), JSON.stringify(settled.zones.battlefield.map((c) => [c.px, c.py])));
  check('the same game object comes back when nothing had to change', settleBoard(settled) === settled);
  same('settling twice gives the same cells', settleBoard(settled).zones.battlefield.map((c) => [c.px, c.py]), settled.zones.battlefield.map((c) => [c.px, c.py]));
  const twoOnOne = { ...settled, zones: { ...settled.zones, battlefield: settled.zones.battlefield.map((card) => ({ ...card, px: 4, py: 1 })) } };
  const fixed = settleBoard(twoOnOne);
  check('cards on one cell are separated (the first keeps it)', unique(fixed) && cellOfCard(fixed.zones.battlefield[0]).join() === '4,1');
  const outside = { ...settled, zones: { ...settled.zones, battlefield: settled.zones.battlefield.map((card) => ({ ...card, px: 99, py: 0 })) } };
  check('cells outside the grid are replaced', settleBoard(outside).zones.battlefield.every((card) => validCell(card.px, card.py)) && unique(settleBoard(outside)));
  // a stored cell that is right in the column and wrong in the row is still wrong (and the reverse)
  {
    const spell = handCard(game, false); const land = handCard(game, true);
    const lone = (card, extra) => ({ ...game, zones: { ...game.zones, hand: game.zones.hand.filter((c) => c.uid !== card.uid), battlefield: [{ ...card, tapped: false, turnEntered: 1, ...extra }] } });
    const rowWrong = settleBoard(lone(spell, { px: 0, py: 99 })).zones.battlefield[0];
    same('a card with the right column and an impossible row is moved to the first empty cell', [rowWrong.px, rowWrong.py], [0, 0]);
    const colWrong = settleBoard(lone(spell, { px: 99, py: 0 })).zones.battlefield[0];
    same('...and so is one with the right row and an impossible column', [colWrong.px, colWrong.py], [0, 0]);
    same('boardCells puts a land that has no cell on the bottom row and a spell on the top row', [...boardCells({ ...game, zones: { ...game.zones, battlefield: [{ ...land, tapped: false, turnEntered: 1 }, { ...spell, tapped: false, turnEntered: 1 }] } })].map(([, c]) => [c.col, c.row]), [[0, 3], [0, 0]]);
    const shared = lone(spell, { px: 2, py: 1 });
    const doubled = { ...shared, zones: { ...shared.zones, battlefield: [shared.zones.battlefield[0], { ...land, tapped: false, turnEntered: 1, px: 2, py: 1 }] } };
    check('checkGame reports two cards on one cell', checkGame(doubled).some((p) => /another card is on/.test(p)), JSON.stringify(checkGame(doubled)));
    check('checkGame reports a cell that is not on the grid', checkGame(lone(spell, { px: 99, py: 0 })).some((p) => /not on the grid/.test(p)) && checkGame(lone(spell, { px: 2 })).some((p) => /not on the grid/.test(p)));
    same('checkGame accepts a card on a good cell', checkGame(lone(spell, { px: 11, py: 3 })), []);
  }
  check('placing a card on an older game settles it first', (() => { const r = placeCard(legacy, legacy.zones.battlefield[0].uid, 6, 0); return unique(r.game) && cellOfCard(cardOf(r.game, legacy.zones.battlefield[0].uid)).join() === '6,0' && r.game.zones.battlefield.every((c) => validCell(c.px, c.py)); })());
}

// ---- tidying ----
{
  let game = fresh();
  for (let i = 0; i < 5; i++) game = moveCard(game, handCard(game, true)?.uid ?? game.zones.hand[0].uid, 'battlefield');
  game = draw(game, 5).game;
  for (let i = 0; i < 4; i++) { const spell = handCard(game, false); if (spell) game = moveCard(game, spell.uid, 'battlefield', { cell: { col: 11 - i, row: 1 } }); }
  const tidy = arrangeBoard(game);
  check('every card is on its own cell afterwards, and the game is consistent', unique(tidy) && tidy.zones.battlefield.every((c) => validCell(c.px, c.py)) && checkGame(tidy).length === 0);
  const lands = tidy.zones.battlefield.filter((c) => /Land/.test(c.t));
  const others = tidy.zones.battlefield.filter((c) => !/Land/.test(c.t));
  check('lands are in the bottom row from the left', lands.every((c) => c.py === 3) && lands.map((c) => c.px).sort((a, b) => a - b).join() === lands.map((_, i) => i).join());
  check('other cards are in the top row from the left', others.every((c) => c.py === 0) && others.map((c) => c.px).sort((a, b) => a - b).join() === others.map((_, i) => i).join());
  same('the same lands are next to each other (by name)', lands.slice().sort((a, b) => a.px - b.px).map((c) => c.n).join() === lands.slice().sort((a, b) => a.n < b.n ? -1 : a.n > b.n ? 1 : 0).map((c) => c.n).join(), true);
  check('tidying twice gives the same board', JSON.stringify(arrangeBoard(tidy).zones.battlefield) === JSON.stringify(tidy.zones.battlefield));
  check('tidying changes nothing but the cells', tidy.zones.battlefield.every((c) => { const before = cardOf(game, c.uid); const { px, py, ...rest } = c; const { px: bx, py: by, ...beforeRest } = before; return JSON.stringify(rest) === JSON.stringify(beforeRest); }));
  const frozen = deepFreeze(structuredClone(game));
  check('the old game is never changed', (() => { arrangeBoard(frozen); return true; })());
  check('tidying an empty battlefield is fine', arrangeBoard(fresh()).zones.battlefield.length === 0);
}

// ---- a full battlefield ----
{
  let game = fresh();
  while (game.zones.battlefield.length < BOARD_CAPACITY) game = createToken(game, TOKEN).game;
  same('the grid holds 48 cards', game.zones.battlefield.length, 48);
  check('all 48 cells are used once', unique(game) && checkGame(game).length === 0);
  const card = game.zones.hand[0];
  refused('one more card from the hand is refused, in words', () => moveCard(game, card.uid, 'battlefield'), /battlefield is full \(48 cards fit\)/);
  refused('one more token is refused', () => createToken(game, TOKEN), /battlefield is full/);
  refused('one more copy is refused', () => copyAsToken(game, game.zones.battlefield[0].uid), /battlefield is full/);
  check('a card dropped on a cell of a full board is refused as taken', (() => { try { moveCard(game, card.uid, 'battlefield', { cell: { col: 0, row: 0 } }); return false; } catch (error) { return /space is taken/.test(error.message); } })());
  check('the refused moves left the game as it was', game.zones.hand.some((c) => c.uid === card.uid) && game.zones.battlefield.length === 48);
  const freed = moveCard(game, game.zones.battlefield[5].uid, 'hand');
  check('after one card leaves, one more fits and takes the freed cell', cellOfCard(cardOf(moveCard(freed, card.uid, 'battlefield'), card.uid)).join() === `${game.zones.battlefield[5].px},${game.zones.battlefield[5].py}`);
  check('tidying a full board works', unique(arrangeBoard(game)));
}

// ---- stored and read back ----
{
  let game = fresh();
  game = moveCard(game, handCard(game, true).uid, 'battlefield');
  game = moveCard(game, handCard(game, false).uid, 'battlefield', { cell: { col: 7, row: 2 } });
  const card = game.zones.battlefield[1];
  const stored = packCard(card);
  same('a card on the battlefield stores px and py', [stored.px, stored.py], [7, 2]);
  same('a card with a column and no row stores neither (the database refuses an undefined value)', (() => { const half = packCard({ ...card, py: undefined }); return [Object.keys(half).filter((k) => k === 'px' || k === 'py'), Object.values(half).includes(undefined)]; })(), [[], false]);
  same('and a card in the hand stores neither', Object.keys(packCard(game.zones.hand[0])).filter((k) => k === 'px' || k === 'py'), []);
  const back = unpackCard(stored, lookup);
  same('it reads back on the same cell', [back.px, back.py], [7, 2]);
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
  const a = game.zones.battlefield[1];
  const dragged = placeCard(game, a.uid, 8, 1).game;
  same('dragging a card to an empty cell writes ONE card, not the battlefield', key(gameWrites('u', game, dragged)), ['public/u/battlefield/1']);
  same('...and it is that card with its new cell', [gameWrites('u', game, dragged)['public/u/battlefield/1'].px, gameWrites('u', game, dragged)['public/u/battlefield/1'].py], [8, 1]);
  check('that write is small (under 200 bytes)', JSON.stringify(gameWrites('u', game, dragged)).length < 200, String(JSON.stringify(gameWrites('u', game, dragged)).length));
  const swapped = placeCard(game, a.uid, 0, 3).game;
  same('a swap writes the two cards', key(gameWrites('u', game, swapped)), ['public/u/battlefield/0', 'public/u/battlefield/1']);
  same('tapping writes one card', key(gameWrites('u', game, setTapped(game, a.uid, true))), ['public/u/battlefield/1']);
  same('nothing changed writes nothing', key(gameWrites('u', game, game)), []);
  const tidy = arrangeBoard(game);
  check('tidying writes only the cards that moved', key(gameWrites('u', game, tidy)).every((k) => /^public\/u\/battlefield\/\d$/.test(k)) && key(gameWrites('u', game, tidy)).length <= 3);
  same('a card leaving the battlefield writes the whole zone (the cards are no longer in the same places)', key(gameWrites('u', game, moveCard(game, a.uid, 'hand'))).filter((k) => k.startsWith('public/u/battlefield')), ['public/u/battlefield']);
  same('a card arriving writes the whole zone', key(gameWrites('u', game, moveCard(game, handCard(game, false).uid, 'battlefield'))).filter((k) => k.startsWith('public/u/battlefield')), ['public/u/battlefield']);
  same('the first save writes every zone whole', key(gameWrites('u', null, game)).filter((k) => /battlefield/.test(k)), ['public/u/battlefield']);
  // applying the pieces to a stored copy gives the new game
  const apply = (db, writes) => { for (const [path, value] of Object.entries(writes)) { const parts = path.split('/'); let node = db; for (const part of parts.slice(0, -1)) node = node[part] ??= {}; if (value === null) delete node[parts.at(-1)]; else node[parts.at(-1)] = JSON.parse(JSON.stringify(value)); } };
  const db = {};
  apply(db, gameWrites('u', null, game));
  let current = game;
  for (const next of [dragged, setTapped(dragged, a.uid, true), placeCard(setTapped(dragged, a.uid, true), a.uid, 0, 3).game, arrangeBoard(game), moveCard(game, a.uid, 'hand'), moveCard(game, handCard(game, false).uid, 'battlefield')]) {
    apply(db, gameWrites('u', current, next));
    current = next;
    const rebuilt = joinGame(db.public.u, db.private.u, lookup);
    if (JSON.stringify(rebuilt.zones.battlefield.map((c) => [c.uid, c.px, c.py, c.tapped])) !== JSON.stringify(next.zones.battlefield.map((c) => [c.uid, c.px, c.py, c.tapped]))) fail('the pieces written for a move rebuild the game', JSON.stringify(rebuilt.zones.battlefield.map((c) => [c.uid, c.px, c.py])));
    checks++;
  }
}

// ---- long random games: nothing is lost, every cell is used once, every game checks out ----
for (const seed of [1, 2, 3, 4, 5]) {
  const random = seededRandom(seed * 313);
  const pick = (list) => list[Math.floor(random() * list.length)];
  let game = fresh();
  const real = ZONES.reduce((sum, zone) => sum + game.zones[zone].length, 0);
  let refusedFull = 0;
  for (let step = 0; step < 2500; step++) {
    const field = game.zones.battlefield;
    const all = ZONES.flatMap((zone) => game.zones[zone]);
    const op = pick(['move', 'move', 'move', 'draw', 'place', 'place', 'place', 'drop', 'arrange', 'token', 'copy', 'tap', 'settle']);
    try {
      if (op === 'move' && all.length) game = moveCard(game, pick(all).uid, pick(ZONES));
      else if (op === 'draw') game = draw(game, 1).game;
      else if (op === 'place' && field.length) game = placeCard(game, pick(field).uid, Math.floor(random() * 12), Math.floor(random() * 4)).game;
      else if (op === 'drop') { const c = pick(game.zones.hand.length ? game.zones.hand : all); if (!field.some((f) => f.uid === c.uid)) game = moveCard(game, c.uid, 'battlefield', { cell: { col: Math.floor(random() * 12), row: Math.floor(random() * 4) } }); }
      else if (op === 'arrange') game = arrangeBoard(game);
      else if (op === 'token') game = createToken(game, random() < 0.2 ? LAND_TOKEN : TOKEN).game;
      else if (op === 'copy' && field.length) game = copyAsToken(game, pick(field).uid).game;
      else if (op === 'tap' && field.length) { const c = pick(field); game = setTapped(game, c.uid, !c.tapped); }
      else if (op === 'settle') game = settleBoard(game);
    } catch (error) {
      if (/battlefield is full|space is taken|type is not known/.test(error.message)) { refusedFull++; continue; }
      fail(`random game ${seed}, step ${step} (${op})`, `an operation that should work threw: ${error.message}`);
    }
    const problems = checkGame(game);
    if (problems.length) fail(`random game ${seed}, step ${step} (${op})`, problems.join('; '));
    if (game.zones.battlefield.some((c) => !validCell(c.px, c.py)) || !unique(game)) fail(`random game ${seed}, step ${step} (${op})`, 'a card has no cell, or two cards share one');
  }
  const kept = ZONES.reduce((sum, zone) => sum + game.zones[zone].filter((card) => !card.tok).length, 0);
  if (kept !== real) fail(`random game ${seed}`, `real cards went from ${real} to ${kept}`);
  check(`random game ${seed}: 2,500 moves, drops, swaps and tidies; every card on the battlefield always had its own cell and no real card was lost (${refusedFull} refused in words)`, true);
}

console.log(`All ${checks} board play checks passed.`);
