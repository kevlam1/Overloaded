// Tests for shared/zones.mjs: the zones of one player's game and every move between them. The important properties:
// no card is ever lost or copied, nothing is changed in place (the games are deep-frozen), the shuffle is fair, and each
// move leaves the cards where the rules of a paper table say. No browser, no network. Run: node scripts/test-zones.mjs
import { ZONES, HAND_SIZE, DEFAULT_LIFE, COMMANDER_LIFE, MAX_DRAW, MAX_LIFE_STEP, secureRandom, seededRandom, shuffled, isLandCard, makeGame, moveCard, draw, shuffleLibrary, mulligan, setTapped, untapAll, adjustLife, nextTurn, battlefieldRows, zoneCounts, checkGame } from '../shared/zones.mjs';

let checks = 0;
function check(label, condition, detail = '') {
  checks++;
  if (!condition) { console.error(`FAILED: ${label} ${detail}`); process.exit(1); }
}
const same = (label, actual, expected) => check(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
const throws = (label, fn, pattern = /./) => { let message = null; try { fn(); } catch (error) { message = error.message; } check(label, message !== null && pattern.test(message), `message: ${message}`); };
const deepFreeze = (value) => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const key of Object.keys(value)) deepFreeze(value[key]); } return value; };
const EM = ' ' + String.fromCharCode(0x2014) + ' ';

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const saved = (name, n, qty, section = 'main') => ({ i: uuid(n), n: name, qty, section });
const types = { Forest: 'Basic Land' + EM + 'Forest', 'Sol Ring': 'Artifact', 'Llanowar Elves': 'Creature' + EM + 'Elf Druid', 'Éowyn': 'Legendary Creature' + EM + 'Human Noble' };
const lookup = (card) => (types[card.n] ? { t: types[card.n], m: card.n === 'Forest' ? '' : '{1}', k: [] } : null);
// 60 cards: 24 Forest, 4 Sol Ring, 32 elves; plus a commander, a sideboard card and a companion.
function deck(over = {}) {
  return { cards: [saved('Éowyn', 1, 1, 'commander'), saved('Forest', 2, 24), saved('Sol Ring', 3, 4), saved('Llanowar Elves', 4, 32), saved('Sol Ring', 3, 1, 'sideboard'), saved('Forest', 2, 1, 'companion')], ...over };
}
const fresh = (seed = 1, over) => makeGame(deck(over), lookup, { random: seededRandom(seed) });
const total = (game) => ZONES.reduce((n, zone) => n + game.zones[zone].length, 0);
const uidsOf = (game) => ZONES.flatMap((zone) => game.zones[zone].map((card) => card.uid)).sort();

// ---- constants ----
check('the zones, in the order the live data model lists them', ZONES.join() === 'library,hand,battlefield,graveyard,exile,command,sideboard');
check('the sizes are what the notes say', HAND_SIZE === 7 && DEFAULT_LIFE === 20 && COMMANDER_LIFE === 40 && MAX_DRAW === 100 && MAX_LIFE_STEP === 1000);

// ---- isLandCard ----
check('a basic land is a land', isLandCard({ t: 'Basic Land' + EM + 'Forest' }));
check('an artifact land is a land', isLandCard({ t: 'Artifact Land' }));
check('a land creature is a land', isLandCard({ t: 'Land Creature' + EM + 'Forest Dryad' }));
check('a snow land is a land', isLandCard({ t: 'Basic Snow Land' + EM + 'Island' }));
check('a creature is not a land', !isLandCard({ t: 'Creature' + EM + 'Elf' }));
check('an artifact is not a land', !isLandCard({ t: 'Artifact' }));
check('a card with Land in its subtype only is not a land', !isLandCard({ t: 'Creature' + EM + 'Landwalker Land' }));
check('a two-faced card with a land back and a spell front is NOT a land (the front shows)', !isLandCard({ t: 'Instant // Land' }));
check('a two-faced card with a land front is a land', isLandCard({ t: 'Land // Creature' + EM + 'Elf' }));
check('a card with no type is not a land', !isLandCard({}) && !isLandCard(null) && !isLandCard({ t: '' }) && !isLandCard({ t: null }));
check('a word that only contains Land (Landmark, Landfall) does not count', !isLandCard({ t: 'Landmark' }) && !isLandCard({ t: 'Landfall Creature' }) && !isLandCard({ t: 'Wasteland' }));
check('a word that only contains Land does not count',!isLandCard({ t: 'Creature' + EM + 'Landlord' }) && !isLandCard({ t: 'Planeswalker' }));

// ---- randomness ----
{
  const a = seededRandom(42); const b = seededRandom(42); const c = seededRandom(43);
  const first = Array.from({ length: 5 }, () => a()); const again = Array.from({ length: 5 }, () => b()); const other = Array.from({ length: 5 }, () => c());
  check('the same seed gives the same numbers', JSON.stringify(first) === JSON.stringify(again));
  check('a different seed gives different numbers', JSON.stringify(first) !== JSON.stringify(other));
  const many = Array.from({ length: 20000 }, seededRandom(7));
  check('numbers are from 0 up to but not including 1', many.every((x) => x >= 0 && x < 1));
  const mean = many.reduce((s, x) => s + x, 0) / many.length;
  check('and spread evenly (the mean is near one half)', Math.abs(mean - 0.5) < 0.01, String(mean));
  const real = Array.from({ length: 2000 }, secureRandom);
  check('the secure random source gives numbers in range and not all the same', real.every((x) => x >= 0 && x < 1) && new Set(real).size > 1900);
}

// ---- shuffled ----
{
  const list = [1, 2, 3, 4, 5, 6, 7, 8];
  const frozen = Object.freeze(list.slice());
  const out = shuffled(frozen, seededRandom(5));
  check('a shuffle keeps every item once', [...out].sort().join() === list.join());
  check('and does not change what it was given', frozen.join() === list.join() && out !== frozen);
  check('the same random sequence gives the same order', JSON.stringify(shuffled(list, seededRandom(9))) === JSON.stringify(shuffled(list, seededRandom(9))));
  check('different sequences give different orders (for 8 items, 40,000 times out of 40,320 it differs)', JSON.stringify(shuffled(list, seededRandom(9))) !== JSON.stringify(shuffled(list, seededRandom(10))));
  same('an empty list stays empty', shuffled([], seededRandom(1)), []);
  same('one item stays', shuffled(['x'], seededRandom(1)), ['x']);
  // A fair shuffle of 4 items gives each of the 24 orders about 1/24 of the time: 48,000 shuffles, 2,000 each, sd about 44.
  const counts = new Map();
  const random = seededRandom(2026);
  for (let n = 0; n < 48000; n++) { const key = shuffled([0, 1, 2, 3], random).join(''); counts.set(key, (counts.get(key) ?? 0) + 1); }
  check('all 24 orders of 4 items occur', counts.size === 24, String(counts.size));
  check('and each about equally often (within 5 standard deviations of 2,000)', [...counts.values()].every((c) => Math.abs(c - 2000) < 220), JSON.stringify([...counts.values()].map((c) => c - 2000)));
  // And an item ends in each place equally often, for 10 items.
  const place = Array.from({ length: 10 }, () => new Array(10).fill(0));
  for (let n = 0; n < 30000; n++) shuffled([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], random).forEach((item, spot) => { place[item][spot]++; });
  check('with 10 items, each one lands in each place about 3,000 times', place.every((row) => row.every((c) => Math.abs(c - 3000) < 5 * Math.sqrt(3000 * 0.9))));
  check('a broken random source (always 0) gives one fixed order, not a shuffle', JSON.stringify(shuffled([1, 2, 3, 4], () => 0)) === JSON.stringify(shuffled([1, 2, 3, 4], () => 0)) && JSON.stringify(shuffled([1, 2, 3, 4], () => 0)) !== JSON.stringify([1, 2, 3, 4]));
}

// ---- makeGame ----
{
  const game = fresh();
  deepFreeze(game);
  same('the zones after the opening hand', zoneCounts(game), { library: 53, hand: 7, battlefield: 0, graveyard: 0, exile: 0, command: 1, sideboard: 2 });
  check('the commander is in the command zone and the sideboard holds the sideboard and the companion', game.zones.command[0].n === 'Éowyn' && game.zones.sideboard.map((c) => c.n).sort().join() === 'Forest,Sol Ring');
  check('life is 40 with a commander', game.life === 40);
  check('it is turn 1 with no mulligans', game.turn === 1 && game.mulligans === 0);
  check('every copy has its own uid, none repeated', new Set(uidsOf(game)).size === 63 && total(game) === 63);
  check('the game is consistent', checkGame(game).length === 0);
  check('the card list fills in type, cost and keywords', game.zones.command[0].t.startsWith('Legendary Creature') && game.zones.sideboard.find((c) => c.n === 'Sol Ring').m === '{1}' && Array.isArray(game.zones.command[0].k));
  const all = ZONES.flatMap((z) => game.zones[z]);
  check('copies of one card share its picture id but not its uid', all.filter((c) => c.n === 'Forest').every((c) => c.i === uuid(2)) && new Set(all.filter((c) => c.n === 'Forest').map((c) => c.uid)).size === 25);
  check('nothing starts tapped or on the battlefield', all.every((c) => !c.tapped && c.turnEntered === null));
  const library = [...game.zones.hand, ...game.zones.library].map((c) => c.n);
  check('the library and hand hold exactly the main deck (24 Forest, 4 Sol Ring, 32 Llanowar Elves)', library.filter((n) => n === 'Forest').length === 24 && library.filter((n) => n === 'Sol Ring').length === 4 && library.filter((n) => n === 'Llanowar Elves').length === 32);
  const same2 = fresh(1); const diff = fresh(2);
  check('the same seed deals the same game', JSON.stringify(game) === JSON.stringify(same2));
  check('a different seed deals a different one', JSON.stringify(game.zones.hand) !== JSON.stringify(diff.zones.hand));
  check('the library is shuffled, not in the order of the deck list', game.zones.library.slice(0, 10).map((c) => c.n).join() !== Array(10).fill('Forest').join());
  const noCommander = makeGame({ cards: [saved('Forest', 2, 30)] }, lookup, { random: seededRandom(3) });
  check('without a commander life is 20 and the command zone is empty', noCommander.life === 20 && noCommander.zones.command.length === 0);
  const unknown = makeGame({ cards: [saved('Mystery', 9, 10)] }, lookup, { random: seededRandom(3) });
  check('a card the list does not know still plays, with no type', unknown.zones.hand[0].t === '' && unknown.zones.hand[0].m === '' && unknown.zones.hand[0].k.length === 0 && checkGame(unknown).length === 0);
  const short = makeGame({ cards: [saved('Forest', 2, 3)] }, lookup, { random: seededRandom(3) });
  check('a deck shorter than a hand deals what it has', short.zones.hand.length === 3 && short.zones.library.length === 0);
  check('the hand size can be chosen', makeGame({ cards: [saved('Forest', 2, 30)] }, lookup, { random: seededRandom(3), handSize: 5 }).zones.hand.length === 5);
  throws('no deck is refused', () => makeGame(null), /not a deck/);
  throws('a deck without cards is refused', () => makeGame({}), /not a deck/);
  throws('a section it does not know is refused', () => makeGame({ cards: [saved('Forest', 2, 1, 'maybeboard')] }), /does not know/);
  check('the lookup is optional', makeGame({ cards: [saved('Forest', 2, 10)] }, undefined, { random: seededRandom(1) }).zones.hand.length === 7);
  check('the real random source works too', checkGame(makeGame(deck(), lookup)).length === 0);
  // the library is a fair shuffle of the deck: the top card is each kind about as often as its share of the 60 cards
  let forestOnTop = 0;
  for (let seed = 0; seed < 3000; seed++) if (makeGame({ cards: [saved('Forest', 2, 24), saved('Sol Ring', 3, 36)] }, lookup, { random: seededRandom(seed), handSize: 1 }).zones.hand[0].n === 'Forest') forestOnTop++;
  check('the top card is a Forest about 40% of the time (24 of 60)', Math.abs(forestOnTop / 3000 - 0.4) < 0.04, String(forestOnTop / 3000));
}

// ---- draw ----
{
  const game = deepFreeze(fresh());
  const top3 = game.zones.library.slice(0, 3).map((c) => c.uid);
  const result = draw(game, 3);
  check('drawing takes the top cards, in order, onto the end of the hand', JSON.stringify(result.drawn) === JSON.stringify(top3) && JSON.stringify(result.game.zones.hand.slice(7).map((c) => c.uid)) === JSON.stringify(top3));
  check('the library is shorter by that many and the rest is untouched', result.game.zones.library.length === 50 && result.game.zones.library[0].uid === game.zones.library[3].uid);
  check('it was not short', result.short === false);
  check('the card count is unchanged', total(result.game) === total(game) && checkGame(result.game).length === 0);
  check('drawing one by default', draw(game).drawn.length === 1);
  check('the old game is untouched (it is frozen, and it still has 53 cards in the library)', game.zones.library.length === 53 && game.zones.hand.length === 7);
  const tiny = makeGame({ cards: [saved('Forest', 2, 9)] }, lookup, { random: seededRandom(1) });
  const empty = draw(tiny, 5);
  check('drawing more than is left draws what is there and says it was short', empty.short === true && empty.drawn.length === 2 && empty.game.zones.library.length === 0 && empty.game.zones.hand.length === 9);
  const none = draw(empty.game, 1);
  check('drawing from an empty library draws nothing and says so', none.short === true && none.drawn.length === 0 && none.game.zones.hand.length === 9);
  for (const bad of [0, -1, 1.5, '2', NaN, null, undefined === 1, MAX_DRAW + 1]) throws(`drawing ${String(bad)} is refused`, () => draw(game, bad), /Draw between/);
  check('drawing exactly 100 is allowed', draw(makeGame({ cards: [saved('Forest', 2, 150)] }, lookup, { random: seededRandom(1) }), MAX_DRAW).drawn.length === 100);
}

// ---- moveCard ----
{
  const base = deepFreeze(fresh());
  // put one card in every zone to test every pair of zones
  let game = base;
  const pick = {};
  const take = (zone, n) => game.zones[zone][n];
  for (const zone of ZONES) pick[zone] = take(zone === 'library' ? 'library' : zone, 0)?.uid;
  // the starting game has no card on the battlefield, graveyard or exile: move some there
  for (const zone of ['battlefield', 'graveyard', 'exile']) game = moveCard(game, game.zones.library[0].uid, zone);
  deepFreeze(game);
  const one = Object.fromEntries(ZONES.map((zone) => [zone, game.zones[zone][0].uid]));
  for (const from of ZONES) {
    for (const to of ZONES) {
      const result = moveCard(game, one[from], to);
      const inTo = result.zones[to].some((c) => c.uid === one[from]);
      const inOthers = ZONES.filter((z) => z !== to).some((z) => result.zones[z].some((c) => c.uid === one[from]));
      check(`${from} to ${to}: the card arrives, and is nowhere else`, inTo && !inOthers && total(result) === total(game) && checkGame(result).length === 0);
      check(`${from} to ${to}: only that card moved`, JSON.stringify(uidsOf(result)) === JSON.stringify(uidsOf(game)) && (from === to || result.zones[from].length === game.zones[from].length - 1));
    }
  }
  const a = game.zones.hand[0].uid; const b = game.zones.hand[1].uid;
  check('to the library goes on top by default', moveCard(game, a, 'library').zones.library[0].uid === a);
  check('to the graveyard goes on top by default (the newest first)', moveCard(moveCard(game, a, 'graveyard'), b, 'graveyard').zones.graveyard[0].uid === b);
  check('to the hand goes at the end by default', moveCard(game, game.zones.exile[0].uid, 'hand').zones.hand.at(-1).uid === game.zones.exile[0].uid);
  check('to the battlefield, exile, command and sideboard go at the end by default', ['battlefield', 'exile', 'command', 'sideboard'].every((zone) => moveCard(game, a, zone).zones[zone].at(-1).uid === a));
  check('the bottom of the library on request', moveCard(game, a, 'library', { position: 'bottom' }).zones.library.at(-1).uid === a);
  check('the top of the hand on request', moveCard(game, game.zones.exile[0].uid, 'hand', { position: 'top' }).zones.hand[0].uid === game.zones.exile[0].uid);
  check('a card can go from the top of the library to the bottom', moveCard(game, game.zones.library[0].uid, 'library', { position: 'bottom' }).zones.library.at(-1).uid === game.zones.library[0].uid && moveCard(game, game.zones.library[0].uid, 'library', { position: 'bottom' }).zones.library.length === game.zones.library.length);
  throws('a position that is not top or bottom is refused', () => moveCard(game, a, 'hand', { position: 'middle' }), /top.*bottom/);
  throws('a zone that does not exist is refused', () => moveCard(game, a, 'stack'), /no zone called stack/);
  throws('a card that is not in the game is refused', () => moveCard(game, 'c9999', 'hand'), /not in the game/);
  throws('and so is a missing uid', () => moveCard(game, undefined, 'hand'), /not in the game/);
  const onField = game.zones.battlefield[0];
  check('arriving on the battlefield remembers the turn', moveCard(game, a, 'battlefield').zones.battlefield.at(-1).turnEntered === 1);
  const turn3 = { ...game, turn: 3 };
  check('on a later turn it remembers that turn', moveCard(turn3, a, 'battlefield').zones.battlefield.at(-1).turnEntered === 3);
  const tapped = setTapped(game, onField.uid, true);
  check('leaving the battlefield untaps the card and clears its turn', (() => { const c = moveCard(tapped, onField.uid, 'graveyard').zones.graveyard[0]; return c.tapped === false && c.turnEntered === null; })());
  check('moving within the battlefield keeps it tapped and keeps its turn', (() => { const c = moveCard(setTapped({ ...game, turn: 5 }, onField.uid, true), onField.uid, 'battlefield', { position: 'top' }).zones.battlefield[0]; return c.tapped === true && c.turnEntered === 1; })());
  check('a card keeps its name, picture and type whatever zone it goes to', (() => { const c = moveCard(game, a, 'exile').zones.exile.at(-1); const o = game.zones.hand[0]; return c.n === o.n && c.i === o.i && c.t === o.t; })());
}

// ---- tapping ----
{
  const start = fresh();
  let game = moveCard(moveCard(start, start.zones.hand[0].uid, 'battlefield'), start.zones.hand[1].uid, 'battlefield');
  deepFreeze(game);
  const [x, y] = game.zones.battlefield.map((c) => c.uid);
  const t = setTapped(game, x, true);
  check('a card on the battlefield can be tapped', t.zones.battlefield[0].tapped === true && t.zones.battlefield[1].tapped === false);
  const onlySecond = setTapped(game, y, true);
  check('tapping the second card taps only the second card', onlySecond.zones.battlefield[0].tapped === false && onlySecond.zones.battlefield[1].tapped === true);
  check('and untapping the second leaves a tapped first one alone', (() => { const g = setTapped(setTapped(game, x, true), y, true); const u = setTapped(g, y, false); return u.zones.battlefield[0].tapped === true && u.zones.battlefield[1].tapped === false; })());
  check('and untapped', setTapped(t, x, false).zones.battlefield[0].tapped === false);
  check('tapping twice is the same as once', JSON.stringify(setTapped(t, x, true)) === JSON.stringify(t));
  check('a truthy value taps and a falsy value untaps', setTapped(game, x, 1).zones.battlefield[0].tapped === true && setTapped(t, x, 0).zones.battlefield[0].tapped === false);
  throws('a card in the hand cannot be tapped', () => setTapped(game, game.zones.hand[0].uid, true), /battlefield/);
  throws('a card that is not in the game cannot be tapped', () => setTapped(game, 'nope', true), /not in the game/);
  const both = setTapped(t, y, true);
  const un = untapAll(both);
  check('untap all untaps every card on the battlefield', un.zones.battlefield.every((c) => !c.tapped) && both.zones.battlefield.every((c) => c.tapped));
  check('untap all with nothing tapped changes nothing', JSON.stringify(untapAll(game)) === JSON.stringify(game));
  check('untap all does not touch other zones or the counts', zoneCounts(un).hand === 5 && total(un) === total(both));
}

// ---- mulligan ----
{
  const game = deepFreeze(fresh(11));
  const m1 = mulligan(game, { random: seededRandom(3) });
  check('a mulligan draws a new hand of 7', m1.zones.hand.length === 7 && m1.zones.library.length === 53);
  check('and counts itself', m1.mulligans === 1 && mulligan(m1, { random: seededRandom(4) }).mulligans === 2);
  check('and loses no card', JSON.stringify(uidsOf(m1)) === JSON.stringify(uidsOf(game)) && checkGame(m1).length === 0);
  check('and the new hand is different from the old one (with this seed)', JSON.stringify(m1.zones.hand.map((c) => c.uid)) !== JSON.stringify(game.zones.hand.map((c) => c.uid)));
  check('the same seed gives the same new hand', JSON.stringify(mulligan(game, { random: seededRandom(3) })) === JSON.stringify(m1));
  const field = moveCard(game, game.zones.hand[0].uid, 'battlefield');
  check('a mulligan leaves the battlefield and the other zones alone', mulligan(field, { random: seededRandom(3) }).zones.battlefield.length === 1 && mulligan(field, { random: seededRandom(3) }).zones.command.length === 1);
  check('the hand size can be chosen', mulligan(game, { random: seededRandom(3), handSize: 6 }).zones.hand.length === 6);
  check('the old hand really goes back into the library (every old hand card is in the new library or hand)', game.zones.hand.every((c) => [...m1.zones.library, ...m1.zones.hand].some((x) => x.uid === c.uid)));
  const mixed = mulligan(game, { random: seededRandom(99) });
  check('and is mixed in, not left on top', JSON.stringify(mixed.zones.library.slice(0, 7).map((c) => c.uid)) !== JSON.stringify(game.zones.hand.map((c) => c.uid)));
}

// ---- shuffleLibrary ----
{
  const game = deepFreeze(fresh(5));
  const s = shuffleLibrary(game, seededRandom(8));
  check('shuffling the library keeps its cards and changes their order', s.zones.library.length === 53 && JSON.stringify(s.zones.library.map((c) => c.uid).sort()) === JSON.stringify(game.zones.library.map((c) => c.uid).sort()) && JSON.stringify(s.zones.library.map((c) => c.uid)) !== JSON.stringify(game.zones.library.map((c) => c.uid)));
  check('and leaves every other zone alone', JSON.stringify(s.zones.hand) === JSON.stringify(game.zones.hand) && s.life === game.life && s.turn === game.turn);
  check('the real random source works', checkGame(shuffleLibrary(game)).length === 0);
}

// ---- life ----
{
  const game = deepFreeze(fresh());
  check('life goes up and down', adjustLife(game, -3).life === 37 && adjustLife(game, 5).life === 45);
  check('life can go below zero (casual play does not end the game for you)', adjustLife(adjustLife(game, -40), -5).life === -5);
  check('and nothing else changes', JSON.stringify(adjustLife(game, 1).zones) === JSON.stringify(game.zones));
  for (const bad of [1.5, NaN, Infinity, '3', null, MAX_LIFE_STEP + 1, -MAX_LIFE_STEP - 1]) throws(`life change ${String(bad)} is refused`, () => adjustLife(game, bad), /whole number/);
  check('a change of exactly 1000 is allowed', adjustLife(game, 1000).life === 1040 && adjustLife(game, -1000).life === -960);
}

// ---- the next turn ----
{
  const start = fresh();
  let game = moveCard(start, start.zones.hand[0].uid, 'battlefield');
  game = setTapped(game, game.zones.battlefield[0].uid, true);
  deepFreeze(game);
  const next = nextTurn(game);
  check('the next turn: the turn number goes up, a card is drawn, everything untaps', next.game.turn === 2 && next.drawn.length === 1 && next.game.zones.hand.length === game.zones.hand.length + 1 && next.game.zones.battlefield.every((c) => !c.tapped));
  check('and it was not short', next.short === false && checkGame(next.game).length === 0);
  check('a card that arrived on turn 1 keeps saying turn 1', next.game.zones.battlefield[0].turnEntered === 1);
  const tiny = makeGame({ cards: [saved('Forest', 2, 1)] }, lookup, { random: seededRandom(1) });
  check('with an empty library the turn still passes, and it says it was short', nextTurn(tiny).game.turn === 2 && nextTurn(tiny).short === true && nextTurn(tiny).drawn.length === 0);
}

// ---- the two battlefield rows ----
{
  const start = fresh(21);
  let game = start;
  for (const card of [...start.zones.library].slice(0, 12)) game = moveCard(game, card.uid, 'battlefield');
  const rows = battlefieldRows(game);
  check('lands go in one row and everything else in the other', rows.lands.every((c) => c.t.includes('Land')) && rows.other.every((c) => !c.t.includes('Land')) && rows.lands.length + rows.other.length === 12);
  check('each row keeps the order the cards came in', (() => { const order = game.zones.battlefield.map((c) => c.uid); return [rows.lands, rows.other].every((row) => row.map((c) => order.indexOf(c.uid)).every((n, i, all) => i === 0 || all[i - 1] < n)); })());
  check('with an empty battlefield both rows are empty', JSON.stringify(battlefieldRows(start)) === JSON.stringify({ lands: [], other: [] }));
  const mdfc = { ...start, zones: { ...start.zones, battlefield: [{ uid: 'x1', i: uuid(50), n: 'Spell // Land', t: 'Instant // Land', m: '', k: [], tapped: false, turnEntered: 1 }, { uid: 'x2', i: uuid(51), n: 'Unknown', t: '', m: '', k: [], tapped: false, turnEntered: 1 }] } };
  check('a spell with a land back goes in the other row, and a card with no type does too', battlefieldRows(mdfc).lands.length === 0 && battlefieldRows(mdfc).other.length === 2);
}

// ---- checkGame: every kind of damage is noticed ----
{
  const game = fresh();
  check('a good game has no problems', checkGame(game).length === 0);
  const clone = () => JSON.parse(JSON.stringify(game));
  const damage = [
    ['a card in two places', (g) => { g.zones.exile.push({ ...g.zones.hand[0] }); }, /two places/],
    ['a card with no uid', (g) => { delete g.zones.hand[0].uid; }, /missing a field/],
    ['a card with no picture id', (g) => { g.zones.hand[0].i = 5; }, /missing a field/],
    ['a card with no name', (g) => { g.zones.hand[0].n = undefined; }, /missing a field/],
    ['a null card', (g) => { g.zones.hand[0] = null; }, /missing a field/],
    ['a tapped card in the hand', (g) => { g.zones.hand[0].tapped = true; }, /tapped or has an entry turn/],
    ['an entry turn on a card in the library', (g) => { g.zones.library[0].turnEntered = 1; }, /tapped or has an entry turn/],
    ['a battlefield card with no entry turn', (g) => { g.zones.battlefield.push({ ...g.zones.hand.pop(), turnEntered: null }); }, /no entry turn/],
    ['a zone that is not a list', (g) => { g.zones.graveyard = {}; }, /not a list/],
    ['a zone that is missing', (g) => { delete g.zones.exile; }, /not a list/],
    ['an extra zone', (g) => { g.zones.stack = []; }, /unknown zone/],
    ['life that is a fraction', (g) => { g.life = 20.5; }, /life/],
    ['life that is text', (g) => { g.life = '20'; }, /life/],
    ['turn 0', (g) => { g.turn = 0; }, /turn/],
    ['a turn that is a fraction', (g) => { g.turn = 1.5; }, /turn/],
    ['mulligans below 0', (g) => { g.mulligans = -1; }, /mulligans/],
  ];
  for (const [label, change, pattern] of damage) { const g = clone(); change(g); const problems = checkGame(g); check(`${label} is noticed`, problems.some((p) => pattern.test(p)), JSON.stringify(problems)); }
  check('not a game at all is noticed', checkGame(null)[0] === 'not a game' && checkGame({})[0] === 'not a game' && checkGame('x')[0] === 'not a game' && checkGame(5)[0] === 'not a game');
  const wreck = clone(); wreck.zones.hand = wreck.zones.hand.map(() => null); wreck.zones.library = wreck.zones.library.map(() => null);
  check('the list of problems is capped at 20', checkGame(wreck).length === 20);
  const battlefield = clone(); battlefield.zones.battlefield.push({ ...battlefield.zones.hand.pop(), turnEntered: 2, tapped: true });
  check('a tapped battlefield card with an entry turn is fine', checkGame(battlefield).length === 0);
}

// ---- a long random game: nothing is ever lost or copied ----
{
  const operations = ['draw', 'move', 'tap', 'untapAll', 'shuffle', 'mulligan', 'life', 'nextTurn'];
  const run = (seed) => {
    const random = seededRandom(seed);
    const pickInt = (n) => Math.floor(random() * n);
    let game = deepFreeze(makeGame(deck(), lookup, { random }));
    const cards = total(game);
    const original = uidsOf(game);
    let moves = 0;
    for (let step = 0; step < 3000; step++) {
      const kind = operations[pickInt(operations.length)];
      const everyone = ZONES.flatMap((zone) => game.zones[zone]);
      const some = everyone[pickInt(everyone.length)];
      try {
        if (kind === 'draw') game = draw(game, 1 + pickInt(3)).game;
        else if (kind === 'move') game = moveCard(game, some.uid, ZONES[pickInt(ZONES.length)], { position: random() < 0.5 ? 'top' : 'bottom' });
        else if (kind === 'tap') game = setTapped(game, some.uid, random() < 0.5);
        else if (kind === 'untapAll') game = untapAll(game);
        else if (kind === 'shuffle') game = shuffleLibrary(game, random);
        else if (kind === 'mulligan') game = mulligan(game, { random });
        else if (kind === 'life') game = adjustLife(game, pickInt(21) - 10);
        else game = nextTurn(game).game;
        moves++;
      } catch (error) {
        if (!/battlefield/.test(error.message)) throw error; // the only refusal here: tapping a card that is not on the battlefield
      }
      deepFreeze(game);
      const problems = checkGame(game);
      if (problems.length || total(game) !== cards) return { ok: false, step, kind, problems };
    }
    return { ok: JSON.stringify(uidsOf(game)) === JSON.stringify(original), moves, json: JSON.stringify(game) };
  };
  for (const seed of [1, 2, 3, 4, 5]) { const r = run(seed); check(`random game ${seed}: 3,000 operations, every card still exactly once, always consistent`, r.ok && r.moves > 2000, JSON.stringify(r).slice(0, 300)); }
  check('the same seed plays out the same way', run(7).json === run(7).json);
  check('a different seed plays out differently', run(7).json !== run(8).json);
}

// ---- the printing of a card (p): only its picture differs ----
{
  const withPrinting = (name, n, qty, p, section = 'main') => ({ ...saved(name, n, qty, section), p });
  const printed = () => deepFreeze({ cards: [saved('Éowyn', 1, 1, 'commander'), withPrinting('Sol Ring', 3, 3, uuid(903)), saved('Sol Ring', 3, 2), withPrinting('Forest', 2, 20, uuid(902)), withPrinting('Forest', 2, 1, uuid(904), 'sideboard')] });
  const game = makeGame(printed(), lookup, { random: seededRandom(5) });
  const cardsOf = (g) => ZONES.flatMap((zone) => g.zones[zone]);
  check('every copy of a card carries the printing its saved card named', cardsOf(game).filter((c) => c.n === 'Sol Ring' && c.p === uuid(903)).length === 3 && cardsOf(game).filter((c) => c.n === 'Forest' && c.p === uuid(902)).length === 20, JSON.stringify(cardsOf(game).filter((c) => c.n === 'Sol Ring').map((c) => c.p ?? null)));
  check('a card with no printing has no p field at all (the shape is what it was)', cardsOf(game).filter((c) => c.n === 'Sol Ring' && !('p' in c)).length === 2 && cardsOf(game).filter((c) => c.n === 'Éowyn').every((c) => !('p' in c)));
  check('the card is still the card in the list: its id, name and type are the same whatever the printing', cardsOf(game).filter((c) => c.n === 'Sol Ring').every((c) => c.i === uuid(3) && c.t === 'Artifact' && c.m === '{1}'));
  check('a sideboard copy keeps its own printing', game.zones.sideboard.length === 1 && game.zones.sideboard[0].p === uuid(904));
  check('the game is consistent', checkGame(game).length === 0, JSON.stringify(checkGame(game)));
  // Moves, draws, shuffles and turns neither lose a printing nor give it to another card.
  const key = (g) => cardsOf(g).map((c) => `${c.uid}:${c.p ?? ''}`).sort().join();
  let g = game;
  const before = key(game);
  for (let step = 0; step < 300; step++) {
    const all = cardsOf(g);
    const card = all[step * 7 % all.length];
    const to = ZONES[(step * 3) % ZONES.length];
    g = moveCard(g, card.uid, to, { position: step % 2 ? 'bottom' : 'top' });
    if (step % 5 === 0) g = shuffleLibrary(g, seededRandom(step));
    if (step % 11 === 0) g = nextTurn(g).game;
    if (step % 13 === 0) g = untapAll(g);
    if (step % 17 === 0) g = mulligan(g, { random: seededRandom(step) });
  }
  check('after 300 moves, shuffles, turns and mulligans every card still has exactly its own printing', key(g) === before && checkGame(g).length === 0, `${key(g) === before} ${JSON.stringify(checkGame(g))}`);
  const first = game.zones.hand[0];
  check('a moved card keeps its printing in the new zone', moveCard(game, first.uid, 'graveyard').zones.graveyard.find((c) => c.uid === first.uid).p === first.p);
  for (const [label, bad] of [['text that is not an id', 'not-an-id'], ['an uppercase id', 'ABCDEF01-0000-4000-8000-000000000903'], ['a number', 7], ['null', null], ['an empty text', '']]) {
    const broken = JSON.parse(JSON.stringify(game));
    broken.zones.hand[0].p = bad;
    check(`checkGame refuses ${label} as a printing`, checkGame(broken).some((p) => /printing that is not an id/.test(p)), JSON.stringify(checkGame(broken)));
  }
  const noPrinting = JSON.parse(JSON.stringify(game));
  delete noPrinting.zones.hand[0].p;
  check('and accepts a card that has none', checkGame(noPrinting).length === 0);
  check('a saved card whose printing is empty text gets no p', !('p' in makeGame({ cards: [{ ...saved('Forest', 2, 5), p: '' }] }, lookup, { random: seededRandom(3) }).zones.hand[0]));
}

console.log(`All ${checks} zone checks passed.`);
