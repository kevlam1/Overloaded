// Tests for the counters, modifier, tokens, notes, face-down and player counters in shared/game-sync.mjs (docs/tokens-counters.md):
// how they are stored, read back, and what a hostile or damaged stored card or player branch cannot make a page build.
import { makeGame, moveCard, changeCounter, changeModifier, setNote, setFaceDown, createToken, copyAsToken, changePlayerCounter, changeCommanderDamage, setTapped, draw, nextTurn, untapAll, adjustLife, checkGame, seededRandom, ZONES, MAX_COUNT, MAX_MODIFIER, COUNTER_KINDS, PLAYER_COUNTERS, COMMANDER_SEATS } from '../shared/zones.mjs';
import { packCard, unpackCard, readCards, splitGame, joinGame, readPublic, gameWrites } from '../shared/game-sync.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
// Key order inside a card depends on its history, so cards are compared with their keys sorted.
const canon = (value) => JSON.stringify(value, (_, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v));
const same = (label, actual, expected) => { checks++; if (canon(actual) !== canon(expected)) fail(label, `expected ${canon(expected)}, got ${canon(actual)}`); };
const check = (label, condition, detail = '') => { checks++; if (!condition) fail(label, detail); };

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const known = { [id(1)]: { t: 'Basic Land - Forest', m: '', k: [] }, [id(3)]: { t: 'Creature - Goblin', m: '{R}', k: ['haste'] } };
const lookup = ({ i }) => known[i] ?? null;
const deck = { cards: [{ i: id(5), n: 'Krenko, Mob Boss', qty: 1, section: 'commander' }, { i: id(1), n: 'Forest', qty: 20, section: 'main' }, { i: id(3), n: 'Goblin Guide', qty: 12, section: 'main' }], commander: [id(5)] };
const start = () => makeGame(deck, (saved) => lookup(saved), { random: seededRandom(7) });
const TOKEN = { n: 'Goblin', i: id(70), tt: 'Token Creature - Goblin', pt: '1/1', cl: 'R' };
const roundTrip = (game) => joinGame(JSON.parse(JSON.stringify(splitGame(game).public)), JSON.parse(JSON.stringify(splitGame(game).private)), lookup);

function loaded() {
  let game = start();
  const ids = game.zones.hand.slice(0, 3).map((card) => card.uid);
  for (const uid of ids) game = moveCard(game, uid, 'battlefield');
  const [a, b] = ids;
  game = changeCounter(changeCounter(game, a, 'p', 3), a, 'l', 2);
  game = changeModifier(changeModifier(game, a, 'power', 2), a, 'toughness', -1);
  game = setFaceDown(setNote(game, a, 'equipped'), b, true);
  const made = createToken(game, TOKEN);
  game = made.game;
  const copy = copyAsToken(game, ids[2]);
  game = copy.game;
  game = changeCommanderDamage(changePlayerCounter(changePlayerCounter(game, 'poison', 3), 'energy', 7), '2', 5);
  return { game, a, b, token: made.uid, copy: copy.uid };
}

// ---- how a card with the new fields is stored ----
{
  const { game, a, b, token } = loaded();
  const find = (g, uid) => ZONES.flatMap((zone) => g.zones[zone]).find((card) => card.uid === uid);
  same('a card with counters, a modifier, a note: stored as ct, mp, mt, nt', packCard(find(game, a)), { u: a, i: find(game, a).i, n: find(game, a).n, e: 1, ct: { p: 3, l: 2 }, mp: 2, mt: -1, nt: 'equipped', sk: 1, px: find(game, a).px, py: find(game, a).py, ...(find(game, a).p ? { p: find(game, a).p } : {}) });
  same('a face-down card: f is 1', packCard(find(game, b)).f, 1);
  const stored = packCard(find(game, token));
  same('a token is stored with tok, its type line, power/toughness and colors', [stored.tok, stored.tt, stored.pt, stored.cl, stored.i, stored.n], [1, 'Token Creature - Goblin', '1/1', 'R', id(70), 'Goblin']);
  check('a plain card gains no new keys at all (nothing is stored for none)', Object.keys(packCard({ uid: 'c1', i: id(1), n: 'Forest', t: 'Basic Land - Forest', m: '', k: [], tapped: false, turnEntered: null })).join() === 'u,i,n');
  check('the type line, cost and keywords of a real card are not stored', !['t', 'm', 'k', 'tt'].some((key) => key in packCard(find(game, a))));
  check('a stored card shares no object with the game (a later change cannot reach back)', (() => { const card = find(game, a); const packed = packCard(card); packed.ct.p = 999; return card.ct.p === 3; })());
}

// ---- reading it back: the whole game survives the trip through JSON, which is what the database does ----
{
  const { game } = loaded();
  const back = roundTrip(game);
  same('a game with counters, tokens and player counters comes back the same', back, game);
  check('and is consistent', checkGame(back).length === 0, checkGame(back).join('; '));
  check('a token comes back as a token with its own type line, without asking the card list', (() => { const tokens = back.zones.battlefield.filter((card) => card.tok); return tokens.length === 2 && tokens.some((card) => card.t === 'Token Creature - Goblin' && card.pt === '1/1' && card.cl === 'R'); })());
  same('the player counters come back', [back.pc, back.cd], [{ poison: 3, energy: 7 }, { 2: 5 }]);
  const plain = roundTrip(start());
  check('a game with none of it has no pc or cd', !('pc' in plain) && !('cd' in plain));
}

// ---- the writes for a move ----
{
  const { game, a, token } = loaded();
  const key = (writes) => Object.keys(writes).sort();
  same('a counter change writes only that one card of the battlefield', key(gameWrites('u', game, changeCounter(game, a, 'c', 1))), [`public/u/battlefield/${game.zones.battlefield.findIndex((c) => c.uid === a)}`]);
  same('a modifier change writes only that one card of the battlefield', key(gameWrites('u', game, changeModifier(game, a, 'power', 1))), [`public/u/battlefield/${game.zones.battlefield.findIndex((c) => c.uid === a)}`]);
  same('a new token writes the battlefield and the next card number', key(gameWrites('u', game, createToken(game, TOKEN).game)), ['public/u/battlefield', 'public/u/next']);
  same('a poison counter writes only pc', key(gameWrites('u', game, changePlayerCounter(game, 'poison', 1))), ['public/u/pc']);
  same('commander damage writes only cd', key(gameWrites('u', game, changeCommanderDamage(game, '3', 1))), ['public/u/cd']);
  same('the value written for pc is the table of counts', gameWrites('u', game, changePlayerCounter(game, 'poison', 1))['public/u/pc'], { poison: 4, energy: 7 });
  check('removing every player counter writes null (deleted)', gameWrites('u', game, changePlayerCounter(changePlayerCounter(game, 'poison', -3), 'energy', -7))['public/u/pc'] === null);
  check('a token that leaves is gone from the battlefield write', !JSON.stringify(gameWrites('u', game, moveCard(game, token, 'hand'))['public/u/battlefield']).includes(token));
  check('nothing changed writes nothing', Object.keys(gameWrites('u', game, game)).length === 0);
  check('the first save writes pc and cd', 'public/u/pc' in gameWrites('u', null, game) && 'public/u/cd' in gameWrites('u', null, game));
  check('the first save of a game with none writes them as null (clears an old match)', gameWrites('u', null, start())['public/u/pc'] === null && gameWrites('u', null, start())['public/u/cd'] === null);
  check('a key order change inside a card (an old history) writes nothing extra', (() => { const g2 = structuredClone(game); g2.zones.battlefield = g2.zones.battlefield.map((card) => Object.fromEntries(Object.entries(card).reverse())); return Object.keys(gameWrites('u', game, g2)).length === 0; })());
}

// ---- a stored card with a damaged new field is not a card ----
{
  const ok = { u: 'c5', i: id(3), n: 'Goblin Guide' };
  check('a plain stored card is fine', unpackCard(ok, lookup) !== null);
  const tok = { u: 'c6', i: id(70), n: 'Goblin', tok: 1, tt: 'Token Creature - Goblin' };
  check('a stored token is fine', unpackCard(tok, lookup) !== null);
  for (const [label, raw] of [
    ['counters that are an empty object', { ...ok, ct: {} }], ['counters that are a list', { ...ok, ct: [1] }], ['counters that are text', { ...ok, ct: 'p' }], ['counters that are null', { ...ok, ct: null }],
    ['an unknown counter kind', { ...ok, ct: { z: 1 } }], ['a counter of 0', { ...ok, ct: { l: 0 } }], ['a counter over the limit', { ...ok, ct: { l: MAX_COUNT + 1 } }], ['a fractional counter', { ...ok, ct: { l: 1.5 } }], ['a text counter', { ...ok, ct: { l: '2' } }], ['a negative counter', { ...ok, ct: { l: -1 } }],
    ['both +1/+1 and -1/-1', { ...ok, ct: { p: 1, m: 1 } }],
    ['a modifier of 0', { ...ok, mp: 0 }], ['a modifier over the limit', { ...ok, mp: MAX_MODIFIER + 1 }], ['a modifier under minus the limit', { ...ok, mt: -MAX_MODIFIER - 1 }], ['a fractional modifier', { ...ok, mt: 0.5 }], ['a text modifier', { ...ok, mp: '1' }],
    ['face-down that is 2', { ...ok, f: 2 }], ['face-down that is true', { ...ok, f: true }],
    ['an empty note', { ...ok, nt: '' }], ['a note of 41 characters', { ...ok, nt: 'x'.repeat(41) }], ['a note that is a number', { ...ok, nt: 5 }],
    ['a token mark that is 2', { ...tok, tok: 2 }], ['a token mark that is true', { ...tok, tok: true }], ['a token mark of 2 on an ordinary card (no token fields)', { ...ok, tok: 2 }], ['a token mark of true on an ordinary card', { ...ok, tok: true }], ['a token mark of 0 on an ordinary card', { ...ok, tok: 0 }], ['a token with no type line', { ...tok, tt: undefined }], ['a token with an empty type line', { ...tok, tt: '' }], ['a token with a type line of 61 characters', { ...tok, tt: 'x'.repeat(61) }], ['a token with a type line that is a number', { ...tok, tt: 5 }],
    ['a token with damaged power and toughness', { ...tok, pt: 'big' }], ['a token with power and toughness of 4 digits', { ...tok, pt: '1000/1' }], ['a token with damaged colors', { ...tok, cl: 'rg' }], ['a token with six colors', { ...tok, cl: 'WUBRGW' }],
    ['a type line on a card that is not a token', { ...ok, tt: 'Creature' }], ['power and toughness on a card that is not a token', { ...ok, pt: '1/1' }], ['colors on a card that is not a token', { ...ok, cl: 'R' }],
    ['a token whose picture id is not an id', { ...tok, i: 'nope' }],
  ]) check(`a stored card with ${label} is not a card`, unpackCard(raw, lookup) === null, canon(unpackCard(raw, lookup)));
  same('a stored token never takes its type line from the card list', unpackCard({ ...tok, tt: 'Token Artifact - Treasure' }, () => ({ t: 'Creature', m: '{9}', k: ['flying'] })).t, 'Token Artifact - Treasure');
  same('a token picture that is not in the card list has no cost and no keywords', [unpackCard(tok, lookup).m, unpackCard(tok, lookup).k], ['', []]);
  same('a copy of a real card (a token that has that card\'s id) keeps its cost and keywords', [unpackCard({ u: 'c8', i: id(3), n: 'Goblin Guide', tok: 1, tt: 'Creature - Goblin' }, lookup).m, unpackCard({ u: 'c8', i: id(3), n: 'Goblin Guide', tok: 1, tt: 'Creature - Goblin' }, lookup).k], ['{R}', ['haste']]);
  const byNameToo = ({ i, n }) => known[i] ?? (n === 'Goblin Guide' ? { t: 'Creature - Goblin', m: '{R}', k: ['haste'] } : null);
  same('a token is never matched by NAME: one that shares a name with a real card gets nothing from it', [unpackCard({ u: 'c9', i: id(71), n: 'Goblin Guide', tok: 1, tt: 'Token Creature - Goblin' }, byNameToo).m, unpackCard({ u: 'c9', i: id(71), n: 'Goblin Guide', tok: 1, tt: 'Token Creature - Goblin' }, byNameToo).k], ['', []]);
  same('...while a real card with an id the list no longer knows still is (by name)', unpackCard({ u: 'c9', i: id(71), n: 'Goblin Guide' }, byNameToo).k, ['haste']);
  same('extra keys on a stored card are still dropped', Object.keys(unpackCard({ ...ok, evil: '<b>', ct: { l: 1 }, junk: 1 }, lookup)).sort(), ['ct', 'i', 'k', 'm', 'n', 't', 'tapped', 'turnEntered', 'uid']);
  check('a stored counters table is copied, not shared', (() => { const raw = { ...ok, ct: { l: 2 } }; const card = unpackCard(raw, lookup); card.ct.l = 9; return raw.ct.l === 2; })());
  check('a zone with some damaged cards keeps the good ones', readCards([ok, { ...ok, u: 'c6', ct: [] }, { ...ok, u: 'c7' }], lookup).map((card) => card.uid).join() === 'c5,c7');
}

// ---- another player's player counters ----
{
  const { game } = loaded();
  const stored = JSON.parse(JSON.stringify(splitGame(game).public));
  const view = readPublic(stored, lookup);
  same('an opponent sees the player counters and commander damage', [view.pc, view.cd], [{ poison: 3, energy: 7 }, { 2: 5 }]);
  same('a view without them has empty tables', [readPublic({ life: 20 }, lookup).pc, readPublic({ life: 20 }, lookup).cd], [{}, {}]);
  same('a life total in the billions is read back whole, one past the limit is not', [readPublic({ life: 8_000_000_000 }, lookup).life, readPublic({ life: -3_000_000_000 }, lookup).life, readPublic({ life: 1_000_000_000_001 }, lookup).life], [8_000_000_000, -3_000_000_000, 0]);
  const hostile = readPublic({ life: 20, pc: { poison: 5, loyalty: 3, monarch: 4, energy: '9', experience: MAX_COUNT + 1, evil: 1 }, cd: { 1: 2, 5: 3, 0: 1, x: 4, 2: 1.5, 3: -1 } }, lookup);
  same('unknown kinds, text, fractions, zero, negatives and over-limit counts are dropped, the good ones kept', [hostile.pc, hostile.cd], [{ poison: 5 }, { 1: 2 }]);
  same('counters that are not tables read as empty', [readPublic({ life: 20, pc: 5, cd: 'x' }, lookup).pc, readPublic({ life: 20, pc: [1, 2], cd: null }, lookup).cd], [{}, {}]);
  same('joinGame drops them the same way', (({ pc, cd }) => [pc, cd])(joinGame({ life: 20, turn: 1, mulligans: 0, next: 5, pc: { poison: 5, loyalty: 3 }, cd: { 9: 1 } }, {}, lookup)), [{ poison: 5 }, undefined]);
  check('joinGame with all of them bad has neither key', (() => { const g = joinGame({ life: 20, pc: { loyalty: 1 }, cd: {} }, {}, lookup); return !('pc' in g) && !('cd' in g); })());
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
  const random = seededRandom(seed * 313);
  const pick = (list) => list[Math.floor(random() * list.length)];
  let current = makeGame(deck, (saved) => lookup(saved), { random: seededRandom(seed) });
  const db = { public: {}, private: {} };
  applyWrites(db, gameWrites('me', null, current));
  for (let step = 0; step < 1500; step++) {
    const before = current;
    const bf = current.zones.battlefield;
    const all = ZONES.flatMap((zone) => current.zones[zone]);
    const op = pick(['move', 'move', 'draw', 'counter', 'modifier', 'note', 'facedown', 'token', 'copy', 'player', 'commander', 'turn', 'tap', 'untap', 'life']);
    if (op === 'move' && all.length) { try { current = moveCard(current, pick(all).uid, pick(ZONES), { position: pick(['top', 'bottom']) }); } catch (error) { if (!/battlefield is full/.test(error.message)) throw error; } } // the grid holds 48 cards
    else if (op === 'draw') current = draw(current, 1).game;
    else if (op === 'counter' && bf.length) current = changeCounter(current, pick(bf).uid, pick(COUNTER_KINDS), (random() < 0.5 ? -1 : 1) * (1 + Math.floor(random() * 3)));
    else if (op === 'modifier' && bf.length) current = changeModifier(current, pick(bf).uid, pick(['power', 'toughness']), (random() < 0.5 ? -1 : 1) * (1 + Math.floor(random() * 20)));
    else if (op === 'note' && bf.length) current = setNote(current, pick(bf).uid, random() < 0.3 ? '' : `n${Math.floor(random() * 99)}`);
    else if (op === 'facedown' && bf.length) current = setFaceDown(current, pick(bf).uid, random() < 0.5);
    else if (op === 'token' && bf.length < 40) current = createToken(current, TOKEN).game; // the grid holds 48 cards
    else if (op === 'copy' && bf.length && bf.length < 40) current = copyAsToken(current, pick(bf).uid).game;
    else if (op === 'player') current = changePlayerCounter(current, pick(PLAYER_COUNTERS), (random() < 0.5 ? -1 : 1) * (1 + Math.floor(random() * 4)));
    else if (op === 'commander') current = changeCommanderDamage(current, pick(COMMANDER_SEATS), (random() < 0.5 ? -1 : 1) * (1 + Math.floor(random() * 4)));
    else if (op === 'turn') current = nextTurn(current).game;
    else if (op === 'tap' && bf.length) { const card = pick(bf); current = setTapped(current, card.uid, !card.tapped); }
    else if (op === 'untap') current = untapAll(current);
    else if (op === 'life') current = adjustLife(current, Math.floor(random() * 9) - 4);
    applyWrites(db, gameWrites('me', before, current));
    const rebuilt = joinGame(db.public.me, db.private.me, lookup);
    if (canon(rebuilt) !== canon(current)) fail(`random game ${seed}, step ${step} (${op})`, 'the stored data did not rebuild the same game');
    if (checkGame(rebuilt).length) fail(`random game ${seed}, step ${step} (${op})`, checkGame(rebuilt).join('; '));
  }
  check(`random game ${seed}: 1,500 moves with counters, tokens and player counters rebuilt exactly from the changed writes alone`, true);
}

console.log(`All ${checks} counter and token storage checks passed.`);
