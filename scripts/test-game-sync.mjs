// Tests for shared/game-sync.mjs: a game split into its public and private branches, the writes a move needs, and reading it
// all back (including what a hostile or damaged branch can and cannot make a page build).
import { makeGame, draw, moveCard, setTapped, untapAll, adjustLife, nextTurn, shuffleLibrary, mulligan, seededRandom, checkGame, ZONES } from '../shared/zones.mjs';
import { PUBLIC_ZONES, PRIVATE_ZONES, MAX_CARDS_PER_ZONE, packCard, unpackCard, readCards, splitGame, joinGame, readPublic, gameWrites } from '../shared/game-sync.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const same = (label, actual, expected) => {
  checks++;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const check = (label, condition, detail = '') => { checks++; if (!condition) fail(label, detail); };

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TYPES = { 1: 'Basic Land - Forest', 2: 'Basic Land - Island', 3: 'Creature - Goblin', 4: 'Instant', 5: 'Legendary Creature - Goblin Noble', 6: 'Artifact' };
const known = (n) => ({ t: TYPES[n] ?? '', m: n === 1 || n === 2 ? '' : '{1}{R}', k: n === 3 ? ['haste'] : [] });
const byId = new Map(Object.keys(TYPES).map((n) => [id(Number(n)), known(Number(n))]));
const lookup = ({ i }) => byId.get(i) ?? null;
const deck = {
  cards: [
    { i: id(5), n: 'Krenko, Mob Boss', qty: 1, section: 'commander' },
    { i: id(1), n: 'Forest', qty: 20, section: 'main' }, { i: id(2), n: 'Island', qty: 15, section: 'main' },
    { i: id(3), n: 'Goblin Guide', qty: 12, section: 'main' }, { i: id(4), n: 'Lightning Bolt', qty: 8, section: 'main', p: id(99) },
    { i: id(6), n: 'Sol Ring', qty: 1, section: 'main' }, { i: id(4), n: 'Lightning Bolt', qty: 2, section: 'sideboard' },
  ],
  commander: [id(5)],
};
const start = () => makeGame(deck, (saved) => lookup(saved), { random: seededRandom(7) });

// ---- cards ----
const sample = { uid: 'c12', i: id(4), p: id(99), n: 'Lightning Bolt', t: 'Instant', m: '{R}', k: [], tapped: true, turnEntered: 3 };
same('a card is packed to u, i, p, n, x, e and nothing else (no type, cost or keywords)', packCard(sample), { u: 'c12', i: id(4), p: id(99), n: 'Lightning Bolt', x: 1, e: 3 });
same('an untapped card with no printing and no entry turn is only u, i and n', packCard({ uid: 'c1', i: id(1), n: 'Forest', t: 'Basic Land - Forest', m: '', k: [], tapped: false, turnEntered: null }), { u: 'c1', i: id(1), n: 'Forest' });
same('a card entered on turn 0 keeps e: 0', packCard({ uid: 'c1', i: id(1), n: 'Forest', tapped: false, turnEntered: 0 }).e, 0);
same('a packed card comes back as it was, with type, cost and keywords from the list', unpackCard(packCard({ ...sample, ...known(4), t: TYPES[4], m: '{1}{R}', k: [] }), lookup), { uid: 'c12', i: id(4), p: id(99), n: 'Lightning Bolt', t: 'Instant', m: '{1}{R}', k: [], tapped: true, turnEntered: 3 });
same('a card the list does not know has no type, but is still a card', unpackCard({ u: 'c1', i: id(77), n: 'New Card' }, lookup), { uid: 'c1', i: id(77), n: 'New Card', t: '', m: '', k: [], tapped: false, turnEntered: null });

// What cannot be a card
const good = { u: 'c5', i: id(1), n: 'Forest' };
for (const [label, raw] of [
  ['null', null], ['a number', 5], ['a list', []], ['text', 'c5'], ['no uid', { i: id(1), n: 'Forest' }], ['a uid that is not one', { ...good, u: 'x5' }], ['a uid with a leading zero', { ...good, u: 'c05' }],
  ['a uid of 7 digits', { ...good, u: 'c1234567' }], ['a uid that is a number', { ...good, u: 5 }], ['no card id', { u: 'c5', n: 'Forest' }], ['a card id that is not a Scryfall id', { ...good, i: 'not-an-id' }],
  ['a card id in capitals', { ...good, i: id(1).toUpperCase().replace(/^0+/, '0') }], ['a card id that could carry markup', { ...good, i: '"><script>' }], ['a printing that is not an id', { ...good, p: 'nope' }],
  ['a printing that is a number', { ...good, p: 5 }], ['no name', { u: 'c5', i: id(1) }], ['an empty name', { ...good, n: '' }], ['a name of 201 characters', { ...good, n: 'x'.repeat(201) }], ['a name that is a number', { ...good, n: 5 }],
  ['x that is not 1', { ...good, x: 2 }], ['x that is true', { ...good, x: true }], ['e that is negative', { ...good, e: -1 }], ['e that is fractional', { ...good, e: 1.5 }], ['e that is text', { ...good, e: '3' }], ['e that is huge', { ...good, e: 1e9 }],
]) check(`a stored card with ${label} is not a card`, unpackCard(raw, lookup) === null, JSON.stringify(unpackCard(raw, lookup)));
check('a name of 200 characters is fine', unpackCard({ ...good, n: 'x'.repeat(200) }, lookup) !== null);
same('extra fields on a stored card are dropped', Object.keys(unpackCard({ ...good, evil: '<b>', t: 'Land' }, lookup)).sort(), ['i', 'k', 'm', 'n', 't', 'tapped', 'turnEntered', 'uid']);
same('the type line comes from the list, never from the stored card', unpackCard({ ...good, t: 'Creature' }, lookup).t, 'Basic Land - Forest');
check('a list that returns something odd is not trusted', (() => { const c = unpackCard(good, () => ({ t: 5, m: {}, k: 'haste' })); return c.t === '' && c.m === '' && Array.isArray(c.k) && c.k.length === 0; })());

// ---- zones as stored ----
same('a stored zone that is a list reads as cards', readCards([good, { ...good, u: 'c6' }], lookup).map((c) => c.uid), ['c5', 'c6']);
same('an object with numeric keys (how the database may give a list back) reads in numeric order', readCards({ 10: { ...good, u: 'c10' }, 2: { ...good, u: 'c2' }, 0: good }, lookup).map((c) => c.uid), ['c5', 'c2', 'c10']);
same('a missing, null or odd zone reads as empty', [readCards(undefined, lookup), readCards(null, lookup), readCards(5, lookup), readCards('x', lookup)], [[], [], [], []]);
same('cards that are not cards are dropped and the rest are kept', readCards([good, 5, null, { u: 'c9' }, { ...good, u: 'c7' }], lookup).map((c) => c.uid), ['c5', 'c7']);
check(`a zone is cut at ${MAX_CARDS_PER_ZONE} cards`, readCards(Array.from({ length: 5000 }, (_, n) => ({ ...good, u: `c${n + 1}` })), lookup).length === MAX_CARDS_PER_ZONE);

// ---- a whole game ----
const game = start();
check('the test game is consistent to begin with', checkGame(game).length === 0, JSON.stringify(checkGame(game)));
const parts = splitGame(game);
same('the public branch holds life, turn, mulligans, next, hidden counts and the four public zones', Object.keys(parts.public).sort(), ['battlefield', 'command', 'counts', 'exile', 'graveyard', 'life', 'mulligans', 'next', 'turn']);
same('the private branch holds exactly library, hand and sideboard', Object.keys(parts.private).sort(), ['hand', 'library', 'sideboard']);
same('the hidden zones are counted in public and their cards are not there', [parts.public.counts, JSON.stringify(parts.public).includes('"hand":[')], [{ library: game.zones.library.length, hand: game.zones.hand.length, sideboard: game.zones.sideboard.length }, false]);
check('no hidden card id appears anywhere in the public branch', game.zones.library.concat(game.zones.hand, game.zones.sideboard).every((card) => !JSON.stringify(parts.public).includes(`"u":"${card.uid}"`)));
same('the command zone (the commander) is public', parts.public.command.map((c) => c.n), ['Krenko, Mob Boss']);
same('splitGame then joinGame gives the same game back', joinGame(parts.public, parts.private, lookup), game);
same('and so does the same trip through JSON, which is what the database does', joinGame(JSON.parse(JSON.stringify(parts.public)), JSON.parse(JSON.stringify(parts.private)), lookup), game);
same('with no public branch there is no game', [joinGame(null, null, lookup), joinGame(undefined, {}, lookup), joinGame('x', {}, lookup)], [null, null, null]);
same('a missing private branch gives a game with empty hidden zones', ['library', 'hand', 'sideboard'].map((z) => joinGame(parts.public, null, lookup).zones[z].length), [0, 0, 0]);
same('life, turn and mulligans that are not whole numbers fall back to safe values', (({ life, turn, mulligans }) => [life, turn, mulligans])(joinGame({ ...parts.public, life: 'x', turn: 1.5, mulligans: -2 }, parts.private, lookup)), [20, 1, 0]);
check('the next card number is never lower than a card already in play', (() => { const g = joinGame({ ...parts.public, next: 1 }, parts.private, lookup); return g.nextUid >= 1 + Math.max(...ZONES.flatMap((z) => g.zones[z].map((c) => Number(c.uid.slice(1))))); })());

// ---- the writes for a move ----
const key = (writes) => Object.keys(writes).sort();
same('the first save writes every piece, and the empty zones as null (deleted)', ['battlefield', 'exile', 'graveyard'].map((zone) => gameWrites('u1', null, game)[`public/u1/${zone}`]), [null, null, null]);
same('...and the zones that have cards as lists of cards', ['public/u1/command', 'private/u1/library', 'private/u1/hand', 'private/u1/sideboard'].map((path) => Array.isArray(gameWrites('u1', null, game)[path])), [true, true, true, true]);
same('nothing changed means nothing to write', gameWrites('u1', game, game), {});
{
  const { game: after } = draw(game, 1);
  same('a draw writes the library, the hand and their two counts, and nothing else', key(gameWrites('u1', game, after)), ['private/u1/hand', 'private/u1/library', 'public/u1/counts/hand', 'public/u1/counts/library']);
}
{
  const card = game.zones.hand[0];
  const played = moveCard(game, card.uid, 'battlefield');
  same('playing a card writes the hand, the battlefield and the hand count', key(gameWrites('u1', game, played)), ['private/u1/hand', 'public/u1/battlefield', 'public/u1/counts/hand']);
  const tapped = setTapped(played, card.uid, true);
  same('tapping writes only the battlefield', key(gameWrites('u1', played, tapped)), ['public/u1/battlefield']);
  same('a life change writes only the life', key(gameWrites('u1', game, adjustLife(game, -3))), ['public/u1/life']);
  same('the new life is the value written', gameWrites('u1', game, adjustLife(game, -3))['public/u1/life'], game.life - 3);
  const emptied = moveCard(played, card.uid, 'hand');
  same('putting the only battlefield card back deletes the battlefield (null)', gameWrites('u1', played, emptied)['public/u1/battlefield'], null);
  check('a move to a hidden zone puts nothing about the card in a public path', Object.entries(gameWrites('u1', game, moveCard(game, card.uid, 'library'))).every(([path, value]) => !path.startsWith('public/') || !JSON.stringify(value).includes(card.uid)));
}
check('writes only ever name this player\'s own paths', Object.keys(gameWrites('abc123', null, game)).every((p) => p.startsWith('public/abc123/') || p.startsWith('private/abc123/')));

// ---- what another player sees ----
{
  const view = readPublic(JSON.parse(JSON.stringify(parts.public)), lookup);
  same('an opponent view has life, turn, counts and the four public zones', [Object.keys(view).sort(), Object.keys(view.zones).sort()], [['counts', 'life', 'turn', 'zones'], [...PUBLIC_ZONES].sort()]);
  same('and the hidden zones only as counts', view.counts, { library: game.zones.library.length, hand: game.zones.hand.length, sideboard: game.zones.sideboard.length });
  same('the commander shows in the command zone', view.zones.command.map((c) => c.n), ['Krenko, Mob Boss']);
  same('nothing stored gives no view', [readPublic(null, lookup), readPublic(undefined, lookup), readPublic(5, lookup)], [null, null, null]);
  const hostile = readPublic({ life: '<b>', turn: -4, counts: { library: 'lots', hand: -1, sideboard: 1e9 }, battlefield: [good, { u: 'c9', i: '"><img src=x onerror=alert(1)>', n: 'x' }, { ...good, u: 'c8', n: '<script>' }], command: 'nope' }, lookup);
  same('a hostile public branch reads as safe numbers and only well-shaped cards', [hostile.life, hostile.turn, hostile.counts, hostile.zones.battlefield.map((c) => c.uid), hostile.zones.command], [0, 1, { library: 0, hand: 0, sideboard: 0 }, ['c5', 'c8'], []]);
  same('a name with markup is kept as plain text for the page to show as text', hostile.zones.battlefield[1].n, '<script>');
}

// ---- long random games: every move's writes, applied to a fake database, rebuild exactly the same game ----
function applyWrites(db, writes) {
  for (const [path, value] of Object.entries(writes)) {
    const steps = path.split('/');
    let node = db;
    for (const step of steps.slice(0, -1)) node = node[step] ??= {};
    if (value === null) delete node[steps.at(-1)]; else node[steps.at(-1)] = JSON.parse(JSON.stringify(value));
  }
}
for (const seed of [1, 2, 3, 4, 5]) {
  const random = seededRandom(seed * 101);
  const pick = (list) => list[Math.floor(random() * list.length)];
  let current = makeGame(deck, (saved) => lookup(saved), { random: seededRandom(seed) });
  const db = { public: {}, private: {} };
  applyWrites(db, gameWrites('me', null, current));
  let maxWrites = 0;
  for (let step = 0; step < 1500; step++) {
    const before = current;
    const all = ZONES.flatMap((zone) => current.zones[zone]);
    const op = pick(['move', 'move', 'move', 'draw', 'tap', 'untap', 'life', 'turn', 'shuffle', 'mulligan']);
    if (op === 'move' && all.length) current = moveCard(current, pick(all).uid, pick(ZONES), { position: pick(['top', 'bottom']) });
    else if (op === 'draw') current = draw(current, 1 + Math.floor(random() * 3)).game;
    else if (op === 'tap' && current.zones.battlefield.length) { const card = pick(current.zones.battlefield); current = setTapped(current, card.uid, !card.tapped); }
    else if (op === 'untap') current = untapAll(current);
    else if (op === 'life') current = adjustLife(current, Math.floor(random() * 11) - 5);
    else if (op === 'turn') current = nextTurn(current).game;
    else if (op === 'shuffle') current = shuffleLibrary(current, random);
    else if (op === 'mulligan') current = mulligan(current, { random });
    const writes = gameWrites('me', before, current);
    maxWrites = Math.max(maxWrites, Object.keys(writes).length);
    applyWrites(db, writes);
    const rebuilt = joinGame(db.public.me, db.private.me, lookup);
    if (JSON.stringify(rebuilt) !== JSON.stringify(current)) fail(`random game ${seed}, step ${step} (${op})`, 'the stored data did not rebuild the same game');
    if (checkGame(rebuilt).length) fail(`random game ${seed}, step ${step}`, JSON.stringify(checkGame(rebuilt)));
  }
  check(`random game ${seed}: 1,500 moves, each one's writes touched at most 9 paths (the biggest was ${maxWrites})`, maxWrites <= 9, String(maxWrites));
  check(`random game ${seed}: the database never held a hidden zone in the public branch, only its count`, ['library', 'hand', 'sideboard'].every((z) => !(z in db.public.me) && Number.isInteger(db.public.me.counts[z])) && [...current.zones.library, ...current.zones.hand, ...current.zones.sideboard].every((card) => !JSON.stringify(db.public.me).includes(`"u":"${card.uid}"`)));
}

console.log(`All ${checks} game sync checks passed.`);
