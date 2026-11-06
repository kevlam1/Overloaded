// Tests for shared/turn-order.mjs: whose turn it is from the passes the players wrote on their own branches, how a turn is passed, skipped and
// taken back, when a player's own game starts their turn, and a whole simulated table. Run from the repo root:  node scripts/test-turn-order.mjs
import {
  validPass, seatOrder, latestPass, currentTurn, nextSeatAfter, nextPass, passAction, canTakeBack, takeBackAction, turnToStart, turnWords, whoseWords,
} from '../shared/turn-order.mjs';
import { makeGame, startTurn, seededRandom, checkGame, MAX_TURN } from '../shared/zones.mjs';
import { splitGame, joinGame, gameWrites, readPublic } from '../shared/game-sync.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const check = (label, condition, detail = '') => { checks++; if (!condition) fail(label, detail); };
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };
const refused = (label, run, words) => {
  checks++;
  try { run(); } catch (error) { if (error instanceof Error && (!words || words.test(error.message))) return; fail(label, `wrong message: ${error.message}`); }
  fail(label, 'was accepted');
};
const deepFreeze = (value) => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(deepFreeze); } return value; };

const members4 = { ua: { name: 'Alice', seat: '1' }, ub: { name: 'Bob', seat: '2' }, uc: { name: 'Cy', seat: '3' }, ud: { name: 'Dee', seat: '4' } };

// ---- a stored record ----
same('a pass is a turn from 2 and a seat from 1 to 4', [validPass({ n: 2, to: '1' }), validPass({ n: MAX_TURN, to: '4' })], [{ n: 2, to: '1' }, { n: MAX_TURN, to: '4' }]);
check('extra fields on a record are dropped, not kept', JSON.stringify(validPass({ n: 3, to: '2', x: 'attack', __proto__: { y: 1 } })) === '{"n":3,"to":"2"}');
for (const bad of [null, undefined, 5, 'x', [], [2, '1'], {}, { n: 1, to: '1' }, { n: 0, to: '1' }, { n: -3, to: '1' }, { n: 2.5, to: '1' }, { n: '2', to: '1' }, { n: MAX_TURN + 1, to: '1' }, { n: 2, to: 1 }, { n: 2, to: '0' }, { n: 2, to: '5' }, { n: 2, to: '' }, { n: 2, to: '__proto__' }, { n: 2 }, { to: '1' }, { n: NaN, to: '1' }, { n: Infinity, to: '1' }]) check(`${JSON.stringify(bad)} is not a pass`, validPass(bad) === null);

// ---- the players at a table ----
same('in seat order, whatever order the table lists them', seatOrder({ uc: { name: 'Cy', seat: '3' }, ua: { name: 'Alice', seat: '1' }, ub: { name: 'Bob', seat: '2' } }).map((p) => [p.seat, p.name, p.uid]), [['1', 'Alice', 'ua'], ['2', 'Bob', 'ub'], ['3', 'Cy', 'uc']]);
same('a table with a gap (seat 2 left) keeps the others in order', seatOrder({ ud: { name: 'Dee', seat: '4' }, ua: { name: 'Alice', seat: '1' } }).map((p) => p.seat), ['1', '4']);
same('members with a seat that is not 1 to 4 or no seat are left out; a number is read as its seat; a name that is not text is empty', [seatOrder({ a: { name: 'A', seat: '9' }, b: { name: 'B', seat: 2 }, c: { name: 'C' }, d: null, e: 'x', f: { name: 5, seat: '3' } }).map((p) => [p.seat, p.name])], [[['2', 'B'], ['3', '']]]);
same('nothing is an empty table', [seatOrder(null), seatOrder(undefined), seatOrder('x'), seatOrder([1]), seatOrder({})], [[], [], [], [], []]);

// ---- the newest pass ----
same('no passes yet', [latestPass({}), latestPass(null), latestPass(undefined), latestPass({ ua: {}, ub: { pass: null } })], [null, null, null, null]);
same('the record with the largest n is the turn', latestPass({ ua: { pass: { n: 2, to: '2' } }, ub: { pass: { n: 3, to: '3' } }, uc: { pass: { n: 5, to: '1' } }, ud: { pass: { n: 4, to: '4' } } }), { uid: 'uc', n: 5, to: '1' });
same('two passes with the same n are settled the same way for everyone (by uid)', [latestPass({ ua: { pass: { n: 3, to: '2' } }, ub: { pass: { n: 3, to: '3' } } }), latestPass({ ub: { pass: { n: 3, to: '3' } }, ua: { pass: { n: 3, to: '2' } } })], [{ uid: 'ub', n: 3, to: '3' }, { uid: 'ub', n: 3, to: '3' }]);
same('a damaged record is ignored, so a hostile or damaged branch cannot take the turn', latestPass({ ua: { pass: { n: 3, to: '2' } }, ub: { pass: { n: 999, to: 'ZZ' } }, uc: { pass: { n: -1, to: '1' } }, ud: { pass: 'turn' } }), { uid: 'ua', n: 3, to: '2' });
check('a record over the turn limit is ignored', latestPass({ ua: { pass: { n: 3, to: '2' } }, ub: { pass: { n: MAX_TURN + 1, to: '1' } } }).uid === 'ua');
check('a branch that is not an object does not crash it', latestPass({ ua: 'x', ub: null, uc: 5, ud: { pass: { n: 2, to: '3' } } }).uid === 'ud');

// ---- whose turn it is ----
{
  const start = currentTurn({}, members4);
  same('at the start it is turn 1 and the first seat', [start.turn, start.seat, start.uid, start.name, start.last], [1, '1', 'ua', 'Alice', null]);
  same('with no seat 1 the first seat there is', currentTurn({}, { ub: { name: 'Bob', seat: '2' }, uc: { name: 'Cy', seat: '3' } }).seat, '2');
  same('an empty table is turn 1 for seat 1, and no one', [currentTurn({}, {}).seat, currentTurn({}, {}).uid, currentTurn({}, null).turn], ['1', null, 1]);
  const after = currentTurn({ ua: { pass: { n: 2, to: '2' } } }, members4);
  same('after one pass it is turn 2, seat 2, Bob', [after.turn, after.seat, after.uid, after.name, after.last.uid], [2, '2', 'ub', 'Bob', 'ua']);
  const gone = currentTurn({ ua: { pass: { n: 3, to: '3' } } }, { ua: { name: 'Alice', seat: '1' }, ub: { name: 'Bob', seat: '2' } });
  same('a turn whose seat has no player (they left) is still that seat, with no one in it', [gone.turn, gone.seat, gone.uid, gone.name], [3, '3', null, null]);
}

// ---- the next seat ----
same('the next seat in order', [nextSeatAfter(members4, '1'), nextSeatAfter(members4, '2'), nextSeatAfter(members4, '3')], ['2', '3', '4']);
same('after the last seat it wraps to the first', nextSeatAfter(members4, '4'), '1');
same('seats that are empty are skipped', [nextSeatAfter({ ua: { name: 'A', seat: '1' }, ud: { name: 'D', seat: '4' } }, '1'), nextSeatAfter({ ua: { name: 'A', seat: '1' }, ud: { name: 'D', seat: '4' } }, '4')], ['4', '1']);
same('a player who conceded is skipped', nextSeatAfter(members4, '1', (uid) => uid === 'ub'), '3');
same('two in a row who conceded are skipped, and it wraps', [nextSeatAfter(members4, '1', (uid) => uid === 'ub' || uid === 'uc'), nextSeatAfter(members4, '3', (uid) => uid === 'ud' || uid === 'ua')], ['4', '2']);
same('the player who passes can be the only one left, and then it is theirs again', nextSeatAfter(members4, '2', (uid) => uid !== 'ub'), '2');
same('if everyone has conceded the turn still goes round', nextSeatAfter(members4, '1', () => true), '2');
same('one player alone gets their own turn back', nextSeatAfter({ ua: { name: 'A', seat: '1' } }, '1'), '1');
same('a seat that is not at the table still has a next seat', [nextSeatAfter(members4, '0'), nextSeatAfter({ ub: { name: 'B', seat: '2' }, ud: { name: 'D', seat: '4' } }, '3')], ['1', '4']);
same('no table at all leaves the seat as it was', nextSeatAfter({}, '3'), '3');

// ---- the record a pass writes ----
{
  const turn1 = currentTurn({}, members4);
  same('the first pass is turn 2, to seat 2', nextPass(turn1, members4), { n: 2, to: '2' });
  same('conceded players are skipped in it', nextPass(turn1, members4, (uid) => uid === 'ub'), { n: 2, to: '3' });
  const last = currentTurn({ ud: { pass: { n: 8, to: '4' } } }, members4);
  same('turn 8 on seat 4 passes to turn 9, seat 1', nextPass(last, members4), { n: 9, to: '1', from: { n: 8, to: '4' } });
  refused('the largest turn cannot be passed', () => nextPass({ turn: MAX_TURN, seat: '1' }, members4), /more turns/);
  check('one before the largest can', nextPass({ turn: MAX_TURN - 1, seat: '1' }, members4).n === MAX_TURN);
}

// ---- passing, skipping and taking back, as changes to your own game ----
{
  const game = deepFreeze(makeGame({ cards: [{ i: '00000000-0000-4000-8000-000000000001', n: 'Forest', qty: 30, section: 'main' }], commander: [] }, () => ({ t: 'Basic Land', m: '', k: [] }), { random: seededRandom(1) }));
  const turn1 = currentTurn({}, members4);
  const mine = passAction(turn1, members4, () => false, 'ua');
  same('the active player passing says what happened', mine.message, "Passed the turn. It is turn 2, and Seat 2: Bob's turn.");
  const passed = mine.run(game);
  same('and the game gets one small record, nothing else changes', [passed.pass, passed.life, passed.turn, passed.zones === game.zones], [{ n: 2, to: '2' }, game.life, game.turn, true]);
  check('the old game is not changed (it is frozen)', !('pass' in game));
  const toSelf = passAction(currentTurn({}, { ua: { name: 'Alice', seat: '1' } }), { ua: { name: 'Alice', seat: '1' } }, () => false, 'ua');
  same('passing to yourself (you are the only one) says your turn', toSelf.message, 'Passed the turn. It is turn 2, and your turn.');
  const skipping = passAction(currentTurn({}, members4), members4, () => false, 'uc');
  same('someone else passing skips the active player, and says so', skipping.message, "Skipped Seat 1: Alice's turn. It is turn 2, and Seat 2: Bob's turn.");
  check('...and writes the same record the active player would have', JSON.stringify(skipping.run(game).pass) === JSON.stringify(mine.run(game).pass));
  same('skipping a seat that has no player says seat', passAction(currentTurn({ ua: { pass: { n: 2, to: '3' } } }, { ua: { name: 'Alice', seat: '1' }, ub: { name: 'Bob', seat: '2' } }), { ua: { name: 'Alice', seat: '1' }, ub: { name: 'Bob', seat: '2' } }, () => false, 'ub').message, "Skipped seat 3's turn. It is turn 3, and Seat 1: Alice's turn.");
  same('a second pass replaces the first record of that player', passAction(currentTurn({ ua: { pass: { n: 2, to: '2' } }, ub: { pass: { n: 3, to: '3' } }, uc: { pass: { n: 4, to: '4' } }, ud: { pass: { n: 5, to: '1' } } }, members4), members4, () => false, 'ua').run(passed).pass, { n: 6, to: '2', from: { n: 5, to: '1' } });
  const done = takeBackAction(currentTurn({ ua: { pass: passed.pass } }, members4));
  same('taking back a pass that replaced turn 1 removes the record, and says so', [done.message, 'pass' in done.run(passed), done.run(passed).life === passed.life], ['Took the pass back.', false, true]);
  check('taking back when there is none changes nothing', 'pass' in done.run(game) === false);
  check('only the writer of the newest pass can take it back', canTakeBack(currentTurn({ ua: { pass: { n: 2, to: '2' } } }, members4), 'ua') && !canTakeBack(currentTurn({ ua: { pass: { n: 2, to: '2' } } }, members4), 'ub') && !canTakeBack(currentTurn({}, members4), 'ua'));
  check('and not once someone newer has passed', !canTakeBack(currentTurn({ ua: { pass: { n: 2, to: '2' } }, ub: { pass: { n: 3, to: '3' } } }, members4), 'ua'));
  const afterTakeBack = currentTurn({ ua: { pass: { n: 6, to: '2' } }, ub: { pass: { n: 3, to: '3' } }, uc: { pass: { n: 4, to: '4' } }, ud: { pass: { n: 5, to: '1' } } }, members4);
  const withoutMine = currentTurn({ ub: { pass: { n: 3, to: '3' } }, uc: { pass: { n: 4, to: '4' } }, ud: { pass: { n: 5, to: '1' } } }, members4);
  same('with the newest record gone the previous pass is the turn again', [afterTakeBack.turn, withoutMine.turn, withoutMine.seat, withoutMine.uid], [6, 5, '1', 'ua']);
}

// ---- when a player's own game starts their turn ----
{
  const game = (turn) => ({ turn });
  const current = currentTurn({ ua: { pass: { n: 6, to: '2' } } }, members4);
  check('the player named, whose game is behind, starts the turn it names', turnToStart(current, '2', game(2)) === 6 && turnToStart(current, '2', game(5)) === 6);
  check('not twice: once their game has that turn number nothing starts (a refresh, or a second page)', turnToStart(current, '2', game(6)) === null && turnToStart(current, '2', game(7)) === null);
  check('not another player', turnToStart(current, '1', game(1)) === null && turnToStart(current, '3', game(1)) === null && turnToStart(current, '4', game(1)) === null);
  check('not at the start of the match (no pass yet): the first player has no turn to start', turnToStart(currentTurn({}, members4), '1', game(1)) === null);
  check('no game yet means nothing to start', turnToStart(current, '2', null) === null && turnToStart(current, '2', undefined) === null && turnToStart(current, '2', {}) === null && turnToStart(current, '2', { turn: '1' }) === null);
}

// ---- taking back after two passes in a row by the same player (the case a first design got wrong) ----
{
  const members = { ua: { name: 'Alice', seat: '1' }, ub: { name: 'Bob', seat: '2' }, uc: { name: 'Cy', seat: '3' } };
  const games = { ua: {}, ub: {}, uc: {} };
  const branches = () => Object.fromEntries(Object.entries(games).map(([uid, game]) => [uid, { pass: game.pass }]));
  const now = () => currentTurn(branches(), members);
  const press = (uid) => { games[uid] = passAction(now(), members, () => false, uid).run(games[uid]); };
  press('ua'); press('ub'); press('ub'); // Alice passes (turn 2, Bob), Bob passes (turn 3, Cy), then Bob presses again, skipping Cy (turn 4, Alice)
  same('Bob\'s second record replaced his first, and remembers the turn it replaced', [now().turn, now().seat, games.ub.pass], [4, '1', { n: 4, to: '1', from: { n: 3, to: '3' } }]);
  games.ub = takeBackAction(now()).run(games.ub);
  same('taking it back is turn 3, Cy (NOT turn 2, which an earlier design gave)', [now().turn, now().seat, now().uid], [3, '3', 'uc']);
  press('uc'); press('ua'); press('ua'); press('ua');
  same('three passes in a row by one player are each remembered', [now().turn, games.ua.pass.from.n], [7, 6]);
  games.ua = takeBackAction(now()).run(games.ua);
  same('and each can be taken back one at a time to the turn before it', [now().turn], [6]);
  const emptyHanded = takeBackAction({ last: null });
  same('taking back with nothing to take back leaves the game as it is', emptyHanded.run({ life: 20 }), { life: 20 });
  same('taking back with no current turn at all does not crash', takeBackAction(undefined).run({ life: 20, pass: { n: 2, to: '2' } }), { life: 20 });
}
same('a record remembers the turn it replaced', validPass({ n: 5, to: '2', from: { n: 4, to: '1' } }), { n: 5, to: '2', from: { n: 4, to: '1' } });
same('a record that replaced turn 1 has none', validPass({ n: 2, to: '2' }), { n: 2, to: '2' });
for (const bad of [null, 5, 'x', [], {}, { n: 5, to: '1' }, { n: 6, to: '1' }, { n: 9, to: '1' }, { n: 1, to: '1' }, { n: 4, to: '9' }, { n: 4.5, to: '1' }, { n: '4', to: '1' }, { n: 4 }, { to: '1' }, { n: MAX_TURN + 1, to: '1' }]) same(`a damaged "from" ${JSON.stringify(bad)} is dropped and the record still counts`, validPass({ n: 5, to: '2', from: bad }), { n: 5, to: '2' });
same('a "from" with extra fields keeps only n and to', validPass({ n: 5, to: '2', from: { n: 4, to: '1', x: 1 } }), { n: 5, to: '2', from: { n: 4, to: '1' } });
{
  const deck = { cards: [{ i: '00000000-0000-4000-8000-000000000001', n: 'Forest', qty: 30, section: 'main' }], commander: [] };
  const lookup = () => ({ t: 'Basic Land', m: '', k: [] });
  const base = makeGame(deck, lookup, { random: seededRandom(2) });
  const withFrom = { ...base, pass: { n: 5, to: '2', from: { n: 4, to: '1' } } };
  same('a record with its from is stored whole', gameWrites('me', base, withFrom), { 'public/me/pass': { n: 5, to: '2', from: { n: 4, to: '1' } } });
  const sides = splitGame(withFrom);
  same('and read back whole, by the game and by another player', [joinGame(sides.public, sides.private, lookup).pass, readPublic(sides.public, lookup).pass], [{ n: 5, to: '2', from: { n: 4, to: '1' } }, { n: 5, to: '2', from: { n: 4, to: '1' } }]);
  check('changing only the from writes the record again', Object.keys(gameWrites('me', withFrom, { ...base, pass: { n: 5, to: '2', from: { n: 3, to: '3' } } })).join() === 'public/me/pass');
}

// ---- the words ----
same('your turn', turnWords(currentTurn({ ua: { pass: { n: 5, to: '1' } } }, members4), 'ua'), 'Turn 5: your turn');
same("someone else's turn", turnWords(currentTurn({ ua: { pass: { n: 2, to: '2' } } }, members4), 'ua'), "Turn 2: Seat 2: Bob's turn");
same('the first turn', turnWords(currentTurn({}, members4), 'ub'), "Turn 1: Seat 1: Alice's turn");
same('a seat with no one in it', turnWords(currentTurn({ ua: { pass: { n: 3, to: '3' } } }, { ua: { name: 'Alice', seat: '1' } }), 'ua'), "Turn 3: seat 3's turn (no one is there)");
check('a name is kept as text (the page puts it in as text, never markup)', turnWords(currentTurn({ ua: { pass: { n: 2, to: '2' } } }, { ub: { name: '<b>x</b>', seat: '2' } }), 'ua').includes('<b>x</b>'));

same('whose turn, on its own', [whoseWords(currentTurn({}, members4), 'ua'), whoseWords(currentTurn({}, members4), 'ub'), whoseWords(currentTurn({ ua: { pass: { n: 3, to: '3' } } }, { ua: { name: 'Alice', seat: '1' } }), 'ua')], ['your turn', "Seat 1: Alice's turn", "seat 3's turn (no one is there)"]);
check('no one is never "your turn", even with no uid asked', whoseWords({ turn: 1, seat: '2', uid: null, name: null }, null) === "seat 2's turn (no one is there)");

// ---- the record goes through storage with the rest of the game ----
{
  const deck = { cards: [{ i: '00000000-0000-4000-8000-000000000001', n: 'Forest', qty: 30, section: 'main' }], commander: [] };
  const lookup = () => ({ t: 'Basic Land', m: '', k: [] });
  const before = makeGame(deck, lookup, { random: seededRandom(2) });
  const after = { ...before, pass: { n: 2, to: '2' } };
  same('passing writes exactly one small piece: the pass record', gameWrites('me', before, after), { 'public/me/pass': { n: 2, to: '2' } });
  same('taking it back writes a delete of that one piece', gameWrites('me', after, before), { 'public/me/pass': null });
  same('a pass that has not changed writes nothing', gameWrites('me', after, after), {});
  same('a new game (no record) clears an old one', gameWrites('me', after, makeGame(deck, lookup, { random: seededRandom(5) })).hasOwnProperty('public/me/pass'), true);
  const sides = splitGame(after);
  same('it is in the public branch, so every player can read it, and not in the private one', [sides.public.pass, JSON.stringify(sides.private).includes('"pass"')], [{ n: 2, to: '2' }, false]);
  same('and it comes back with the game', joinGame(sides.public, sides.private, lookup).pass, { n: 2, to: '2' });
  same('another player reads it as part of their view of this player', readPublic(sides.public, lookup).pass, { n: 2, to: '2' });
  check('a game with no record reads back with none, and the view says null', !('pass' in joinGame(splitGame(before).public, splitGame(before).private, lookup)) && readPublic(splitGame(before).public, lookup).pass === null);
  check('a damaged stored record reads back as none', !('pass' in joinGame({ ...sides.public, pass: { n: 1, to: '2' } }, sides.private, lookup)) && readPublic({ ...sides.public, pass: { n: 2, to: '9' } }, lookup).pass === null && readPublic({ ...sides.public, pass: 'x' }, lookup).pass === null);
  check('the game with a record is consistent', checkGame(after).length === 0);
}

// ---- a whole table: four players, each page running only its own game ----
{
  const deck = { cards: [{ i: '00000000-0000-4000-8000-000000000001', n: 'Forest', qty: 40, section: 'main' }], commander: [] };
  const lookup = () => ({ t: 'Basic Land', m: '', k: [] });
  const games = Object.fromEntries(Object.keys(members4).map((uid, index) => [uid, makeGame(deck, lookup, { random: seededRandom(10 + index) })]));
  const mySeat = (uid) => members4[uid].seat;
  const publicOf = () => Object.fromEntries(Object.entries(games).map(([uid, game]) => [uid, splitGame(game).public]));
  // What every page does after any branch changes: find the turn, and the one player it names starts it.
  const everyPageReacts = () => {
    for (const [uid, game] of Object.entries(games)) {
      const wanted = turnToStart(currentTurn(publicOf(), members4), mySeat(uid), game);
      if (wanted !== null) games[uid] = startTurn(game, wanted).game;
    }
  };
  const passFrom = (uid, isOut = () => false) => {
    const current = currentTurn(publicOf(), members4);
    games[uid] = passAction(current, members4, isOut, uid).run(games[uid]);
    everyPageReacts();
  };
  const active = () => currentTurn(publicOf(), members4);
  check('at the start it is turn 1, Alice, and nothing starts by itself', active().turn === 1 && active().uid === 'ua' && Object.values(games).every((game) => game.turn === 1));
  const order = [];
  for (let round = 0; round < 3; round++) for (const uid of ['ua', 'ub', 'uc', 'ud']) {
    if (active().uid !== uid) fail(`round ${round}: it is ${uid}'s turn`, JSON.stringify(active()));
    order.push(active().turn);
    passFrom(uid);
  }
  same('twelve passes in seat order make turns 1 to 12, the table\'s turn number', order, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  same('each player\'s own turn number is the last turn they started (Alice 13, since Dee\'s twelfth pass began turn 13; Bob 10, Cy 11, Dee 12)', [games.ua.turn, games.ub.turn, games.uc.turn, games.ud.turn], [13, 10, 11, 12]);
  check('turn 13 is Alice again, who started it (her own game says 13) and the others did not', active().turn === 13 && active().uid === 'ua' && games.ua.turn === 13 && games.ub.turn === 10);
  const handBefore = games.ub.zones.hand.length;
  check('starting a turn drew one card for the player who started it (each player has drawn 3 or 4 times)', games.ua.zones.hand.length === 7 + 3 && games.ub.zones.hand.length === 7 + 3 && handBefore === 10);
  check('every game is consistent', Object.values(games).every((game) => checkGame(game).length === 0));
  // A player who conceded is skipped; Cy skips Dee's absent turn.
  passFrom('ua', (uid) => uid === 'ub');
  check('Alice passes and Bob (conceded) is skipped: it is turn 14, Cy', active().turn === 14 && active().uid === 'uc' && games.ub.turn === 10 && games.uc.turn === 14);
  games.ua = takeBackAction(active()).run(games.ua);
  check('Alice takes the pass back: it is turn 13, Alice again (her own game is already on 13, so nothing starts twice)', active().turn === 13 && active().uid === 'ua' && games.ua.turn === 13);
  everyPageReacts(); everyPageReacts();
  check('and several refreshes later nothing changed', active().turn === 13 && games.ua.turn === 13 && games.uc.turn === 14);
  passFrom('ub'); // Bob (not the active player) skips Alice's turn
  check('Bob presses Pass while it is Alice\'s turn: Alice\'s turn is skipped, it is turn 14, Bob\'s own turn', active().turn === 14 && active().uid === 'ub' && games.ub.turn === 14 && games.ua.turn === 13);
}

console.log(`All ${checks} turn order checks passed.`);
