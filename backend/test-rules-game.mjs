// Tests for the shape and size limits on a player's game under tables/CODE/public/UID and private/UID (the batched rules change of
// 2026-11-06, docs/rules-batch-plan.md), run against the local Firebase emulator only.
// Three parts:
//   1. Every field of a stored card, in every one of the seven lists: a good value is accepted and the values on either side of each limit are refused.
//   2. Everything else under public and private: the fixed keys, the numbers, the hidden zones that must never appear under public, the pass record,
//      the match number, and another player's branch.
//   3. THE CHECK THAT MATTERS MOST: long random games played with the pages' own code (shared/zones.mjs, turned into writes by shared/game-sync.mjs
//      gameWrites, exactly what the table page sends). Every one of those writes must be accepted. If a rule is stricter than a page, this fails
//      before a player ever sees a save error.
// Run: npm test   (the runner starts the emulator and runs this with the other test files)
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, get, set, update } from 'firebase/database';
import {
  makeGame, moveCard, draw, setTapped, untapAll, adjustLife, nextTurn, shuffleLibrary, seededRandom, checkGame, ZONES,
  COUNTER_KINDS, MAX_ZONE_CARDS, PLAYER_COUNTERS, COMMANDER_SEATS,
  changeCounter, changeModifier, resetModifier, setNote, setFaceDown, createToken, copyAsToken, changePlayerCounter, changeCommanderDamage,
  turnOver, setSick, setNoUntap,
} from '../shared/zones.mjs';
import { gameWrites, joinGame, PUBLIC_ZONES, PRIVATE_ZONES } from '../shared/game-sync.mjs';

const rulesText = readFileSync(new URL('./database.rules.json', import.meta.url), 'utf8');
const env = await initializeTestEnvironment({ projectId: 'demo-overloaded', database: { host: '127.0.0.1', port: 9000, rules: rulesText } });

let checks = 0;
const ok = async (label, promise) => {
  try { await assertSucceeds(promise); } catch (error) { console.log('FAILED CHECK (expected to succeed):', label); throw error; }
  checks++;
};
const denied = async (label, promise) => {
  try { await assertFails(promise); } catch (error) { console.log('FAILED CHECK (expected to be denied):', label); throw error; }
  checks++;
};
const check = (label, condition, detail = '') => {
  if (!condition) { console.log('FAILED CHECK:', label, detail); throw new Error(`Check failed: ${label} ${detail}`); }
  checks++;
};

const MINUTE = 60 * 1000;
// A playing table with alice (seat 1) and bob (seat 2), created by bypassing the rules. `match` is the table's match number.
async function seedTable(code, match = 1) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    const t = `tables/${code}`;
    await set(ref(db, `${t}/meta`), { host: 'alice', createdAt: Date.now() - 2 * MINUTE, seats: 2, format: 'commander', status: 'playing', idleLimit: 60 * MINUTE, match });
    await set(ref(db, `${t}/activity/lastActive`), Date.now() - 2 * MINUTE);
    for (const [uid, seat] of [['alice', '1'], ['bob', '2']]) {
      await set(ref(db, `${t}/members/${uid}`), { name: uid, seat });
      await set(ref(db, `${t}/seats/${seat}`), uid);
    }
  });
}
const as = (uid) => env.authenticatedContext(uid).database();
const alice = as('alice');
const bob = as('bob');
const carol = as('carol'); // signed in, not at the table

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const aCard = (n, extra = {}) => ({ u: `c${n}`, i: id(1), n: 'Island', ...extra });
const ALL_LISTS = [...PUBLIC_ZONES, ...PRIVATE_ZONES];
const branchOf = (zone) => (PUBLIC_ZONES.includes(zone) ? 'public' : 'private');
const T = 'RULEGM'; // the table the field tests write to
await seedTable(T);
const put = (db, path, value) => set(ref(db, `tables/${T}/${path}`), value);

// ---------------------------------------------------------------- 0. the seven lists are written by one generator: they must be identical
// (run at the END of this file, so that a broken rule is caught by the behavior tests first and this only backs them up)
const structureChecks = () => {
  const rules = JSON.parse(rulesText).rules.tables.$code;
  const blocks = ALL_LISTS.map((zone) => JSON.stringify(rules[branchOf(zone)].$uid[zone]));
  check('the seven list rules exist', blocks.every((block) => block && block.length > 500));
  check('the seven list rules are identical', blocks.every((block) => block === blocks[0]));
  check('a list has only its own object check and the card rule (so nothing else can hide in one)', Object.keys(JSON.parse(blocks[0])).join() === '.validate,$i' && JSON.parse(blocks[0])['.validate'] === 'newData.hasChildren()');
  check('the public branch has exactly the keys the pages write', Object.keys(rules.public.$uid).filter((key) => !key.startsWith('.') && key !== '$other').sort().join() === 'battlefield,cd,command,counts,exile,graveyard,life,match,mulligans,next,pass,pc,turn');
  check('the private branch has exactly the three hidden lists', Object.keys(rules.private.$uid).filter((key) => !key.startsWith('.') && key !== '$other').sort().join() === 'hand,library,sideboard');
  check('both branches refuse any other key', rules.public.$uid.$other['.validate'] === false && rules.private.$uid.$other['.validate'] === false);
};

// ---------------------------------------------------------------- 1. every card field, in every list
const long = (n) => 'A'.repeat(n);
const CARD_CASES = [
  // [label, card fields (merged over a good card), accepted?]
  ['a plain card', {}, true],
  ['a card with every optional field at its maximum', { p: id(2), x: 1, e: 100000, f: 1, bk: 1, sk: 1, nu: 1, nt: long(40), ct: { p: 1000000000000, l: 1, c: 1, t: 1, o: 1 }, mp: 1000000000000, mt: -1000000000000, px: 4000, py: 4000 }, true],
  ['u: c999999', { u: 'c999999' }, true], ['u: c1000000 (7 digits)', { u: 'c1000000' }, false], ['u: c0', { u: 'c0' }, false], ['u: c01', { u: 'c01' }, false],
  ['u: x1', { u: 'x1' }, false], ['u: a number', { u: 5 }, false], ['u: empty', { u: '' }, false],
  ['i: capital letters', { i: '0000000A-0000-4000-8000-00000000000b'.toUpperCase() }, false], ['i: too short', { i: id(1).slice(1) }, false], ['i: a number', { i: 7 }, false], ['i: a name instead of an id', { i: 'Sol Ring' }, false],
  ['i: not hex', { i: '0000000g-0000-4000-8000-000000000001' }, false],
  ['p: a good printing id', { p: id(2) }, true], ['p: capital letters', { p: '0000000a-0000-4000-8000-00000000000B' }, false], ['p: text', { p: 'abc' }, false], ['p: a number', { p: 1 }, false],
  ['n: 200 characters', { n: long(200) }, true], ['n: 201 characters', { n: long(201) }, false], ['n: empty', { n: '' }, false], ['n: a number', { n: 5 }, false],
  ['x: 1', { x: 1 }, true], ['x: 0', { x: 0 }, false], ['x: true', { x: true }, false], ['x: 2', { x: 2 }, false], ['x: "1"', { x: '1' }, false],
  ['e: 0', { e: 0 }, true], ['e: 100000', { e: 100000 }, true], ['e: -1', { e: -1 }, false], ['e: 100001', { e: 100001 }, false], ['e: 1.5', { e: 1.5 }, false], ['e: "5"', { e: '5' }, false],
  ['token: tok and tt', { tok: 1, tt: 'Token Creature - Goblin' }, true],
  ['token with power and toughness and colors', { tok: 1, tt: 'Token Creature', pt: '2/2', cl: 'WUBRG' }, true],
  ['token: */* and +1/-1', { tok: 1, tt: 'T', pt: '*/*' }, true], ['token: +1/-1', { tok: 1, tt: 'T', pt: '+1/-1' }, true],
  ['tok with no tt', { tok: 1 }, false], ['tt with no tok', { tt: 'Token Creature' }, false], ['tok: 2', { tok: 2, tt: 'T' }, false], ['tok: true', { tok: true, tt: 'T' }, false],
  ['tt: 60 characters', { tok: 1, tt: long(60) }, true], ['tt: 61 characters', { tok: 1, tt: long(61) }, false], ['tt: empty', { tok: 1, tt: '' }, false],
  ['pt: 1000/1 (4 characters)', { tok: 1, tt: 'T', pt: '1000/1' }, false], ['pt: 2 (no slash)', { tok: 1, tt: 'T', pt: '2' }, false], ['pt: 2/2x', { tok: 1, tt: 'T', pt: '2/2x' }, false],
  ['pt: 3 characters each side', { tok: 1, tt: 'T', pt: '123/456' }, true], ['pt: a number', { tok: 1, tt: 'T', pt: 2 }, false],
  ['pt on a card that is not a token', { pt: '2/2' }, false],
  ['cl: WUBRG', { tok: 1, tt: 'T', cl: 'WUBRG' }, true], ['cl: 6 letters', { tok: 1, tt: 'T', cl: 'WUBRGW' }, false], ['cl: X', { tok: 1, tt: 'T', cl: 'X' }, false], ['cl: empty', { tok: 1, tt: 'T', cl: '' }, false],
  ['cl on a card that is not a token', { cl: 'W' }, false],
  ['ct: +1/+1 only', { ct: { p: 1 } }, true], ['ct: at the limit', { ct: { p: 1000000000000 } }, true], ['ct: over the limit', { ct: { p: 1000000000001 } }, false],
  ['ct: zero', { ct: { p: 0 } }, false], ['ct: fraction', { ct: { p: 1.5 } }, false], ['ct: text', { ct: { p: '1' } }, false], ['ct: negative', { ct: { l: -1 } }, false],
  ['ct: +1/+1 and -1/-1 together', { ct: { p: 1, m: 1 } }, false], ['ct: every other kind with -1/-1', { ct: { l: 2, t: 3, c: 4, o: 5, m: 1 } }, true],
  ['ct: an unknown kind', { ct: { z: 1 } }, false], ['ct: a number instead of an object', { ct: 5 }, false], ['ct: a string', { ct: 'p' }, false],
  ['mp: 5', { mp: 5 }, true], ['mp: -5', { mp: -5 }, true], ['mp: 0', { mp: 0 }, false], ['mp: the limit', { mp: 1000000000000 }, true], ['mp: over the limit', { mp: 1000000000001 }, false],
  ['mp: under minus the limit', { mp: -1000000000001 }, false], ['mp: 1.5', { mp: 1.5 }, false], ['mp: text', { mp: '5' }, false],
  ['mt: 5', { mt: 5 }, true], ['mt: -5', { mt: -5 }, true], ['mt: 0', { mt: 0 }, false], ['mt: over the limit', { mt: 1000000000001 }, false], ['mt: 1.5', { mt: 1.5 }, false],
  ['f: 1', { f: 1 }, true], ['f: 0', { f: 0 }, false], ['f: true', { f: true }, false],
  ['bk: 1', { bk: 1 }, true], ['bk: 0', { bk: 0 }, false], ['bk: true', { bk: true }, false],
  ['sk: 1', { sk: 1 }, true], ['sk: 0', { sk: 0 }, false], ['sk: true', { sk: true }, false],
  ['nu: 1', { nu: 1 }, true], ['nu: 0', { nu: 0 }, false], ['nu: true', { nu: true }, false],
  ['nt: 40 characters', { nt: long(40) }, true], ['nt: 41 characters', { nt: long(41) }, false], ['nt: empty', { nt: '' }, false], ['nt: a number', { nt: 5 }, false],
  ['px: 0 and py: 4000', { px: 0, py: 4000 }, true], ['px: 4001', { px: 4001 }, false], ['px: -1', { px: -1 }, false], ['py: 4001', { py: 4001 }, false], ['py: 1.5', { py: 1.5 }, false],
  ['an unknown field', { zz: 1 }, false], ['a field that looks like a token field but is not one (a typo)', { tokn: 1 }, false],
  // the patterns must match the WHOLE text, not just part of it
  ['u: text after it', { u: 'c1x' }, false], ['u: text before it', { u: 'xc1' }, false], ['u: a space after it', { u: 'c1 ' }, false],
  ['i: a character after it', { i: `${id(1)}0` }, false], ['i: a character before it', { i: `0${id(1)}` }, false],
  ['p: a character after it', { p: `${id(2)}0` }, false], ['p: a character before it', { p: `0${id(2)}` }, false],
  ['pt: a space after it', { tok: 1, tt: 'T', pt: '2/2 ' }, false], ['pt: a space before it', { tok: 1, tt: 'T', pt: ' 2/2' }, false], ['pt: 4 characters after the slash', { tok: 1, tt: 'T', pt: '1/1000' }, false],
  ['pt: a letter', { tok: 1, tt: 'T', pt: 'a/b' }, false],
  ['cl: a space after it', { tok: 1, tt: 'T', cl: 'W ' }, false], ['cl: a space before it', { tok: 1, tt: 'T', cl: ' W' }, false], ['cl: a letter that is not a color', { tok: 1, tt: 'T', cl: 'WX' }, false],
  ['cl: lowercase', { tok: 1, tt: 'T', cl: 'w' }, false], ['cl: a single color', { tok: 1, tt: 'T', cl: 'G' }, true],
  ['ct: loyalty at the limit', { ct: { l: 1000000000000 } }, true], ['ct: loyalty over the limit', { ct: { l: 1000000000001 } }, false], ['ct: loyalty zero', { ct: { l: 0 } }, false],
  ['ct: charge zero', { ct: { c: 0 } }, false], ['ct: time zero', { ct: { t: 0 } }, false], ['ct: other over the limit', { ct: { o: 1000000000001 } }, false], ['ct: -1/-1 over the limit', { ct: { m: 1000000000001 } }, false],
  ['mt: the limit', { mt: 1000000000000 }, true], ['mt: under minus the limit', { mt: -1000000000001 }, false], ['mp: negative one', { mp: -1 }, true],
  ['py: 0', { py: 0 }, true], ['py: -1', { py: -1 }, false], ['px: 1.5', { px: 1.5 }, false],
  ['e: 99999', { e: 99999 }, true], ['n: 1 character', { n: 'A' }, true], ['nt: 1 character', { nt: 'A' }, true], ['tt: 1 character', { tok: 1, tt: 'A' }, true],
]; // (the lists above are tried on every one of the seven lists)
let caseCount = 0;
for (const zone of ALL_LISTS) {
  const base = `${branchOf(zone)}/alice/${zone}`;
  for (const [label, fields, accepted] of CARD_CASES) {
    const card = { ...aCard(1), ...fields };
    await (accepted ? ok : denied)(`${zone}: ${label}`, put(alice, `${base}/0`, card));
    caseCount++;
  }
  // a card that is missing a required field, or is not a card at all
  for (const field of ['u', 'i', 'n']) {
    const card = aCard(1); delete card[field];
    await denied(`${zone}: a card with no ${field}`, put(alice, `${base}/0`, card));
  }
  await denied(`${zone}: a card that is a string`, put(alice, `${base}/0`, 'Island'));
  await denied(`${zone}: a card that is a number`, put(alice, `${base}/0`, 7));
  await denied(`${zone}: a card that is true`, put(alice, `${base}/0`, true));
  // the key decides how long a list can be (Firebase rules cannot count): 0 to 249 only
  await ok(`${zone}: the last allowed position, 249`, put(alice, `${base}/249`, aCard(1)));
  for (const key of ['250', '251', '999', '-1', '01', '00', 'a']) await denied(`${zone}: position ${key}`, put(alice, `${base}/${key}`, aCard(1)));
  // a whole list of 250 cards and one of 251, as an array the way the pages write
  await ok(`${zone}: a list of 250 cards`, put(alice, base, Array.from({ length: 250 }, (_, n) => aCard(n + 1))));
  await denied(`${zone}: a list of 251 cards`, put(alice, base, Array.from({ length: 251 }, (_, n) => aCard(n + 1))));
  await denied(`${zone}: a list with one bad card among good ones refuses the WHOLE list`, put(alice, base, [aCard(1), aCard(2), { ...aCard(3), n: '' }, aCard(4)]));
  await denied(`${zone}: a list that is a string`, put(alice, base, 'Island'));
  await denied(`${zone}: a list that is a number`, put(alice, base, 5));
  await ok(`${zone}: emptying a list`, put(alice, base, null));
  await ok(`${zone}: a normal list of 3 cards`, put(alice, base, [aCard(1), aCard(2), aCard(3)]));
  // nobody else may write it
  await denied(`${zone}: another player cannot write it`, put(bob, `${base}/0`, aCard(1)));
  await denied(`${zone}: a signed-in stranger cannot write it`, put(carol, `${base}/0`, aCard(1)));
}
console.log(`  ${caseCount} card cases across ${ALL_LISTS.length} lists`);

// ---------------------------------------------------------------- 2. everything else under public and private
const PUBLIC_CASES = [
  ['life: 40', 'life', 40, true], ['life: the limit', 'life', 1e12, true], ['life: minus the limit', 'life', -1e12, true], ['life: 0', 'life', 0, true], ['life: over the limit', 'life', 1e12 + 1, false],
  ['life: under minus the limit', 'life', -1e12 - 1, false], ['life: 1.5', 'life', 1.5, false], ['life: text', 'life', '40', false], ['life: true', 'life', true, false],
  ['turn: 1', 'turn', 1, true], ['turn: 100000', 'turn', 100000, true], ['turn: 0', 'turn', 0, false], ['turn: 100001', 'turn', 100001, false], ['turn: 1.5', 'turn', 1.5, false],
  ['mulligans: 0', 'mulligans', 0, true], ['mulligans: 1000', 'mulligans', 1000, true], ['mulligans: 1001', 'mulligans', 1001, false], ['mulligans: -1', 'mulligans', -1, false],
  ['next: 1', 'next', 1, true], ['next: one billion', 'next', 1e9, true], ['next: 0', 'next', 0, false], ['next: one billion and one', 'next', 1e9 + 1, false], ['next: 1.5', 'next', 1.5, false],
  ['match: the table\'s match number', 'match', 1, true], ['match: another number', 'match', 2, false], ['match: 0', 'match', 0, false], ['match: text', 'match', '1', false],
  ['counts.library: 0', 'counts/library', 0, true], ['counts.library: 250', 'counts/library', 250, true], ['counts.library: 251', 'counts/library', 251, false], ['counts.library: -1', 'counts/library', -1, false], ['counts.library: 1.5', 'counts/library', 1.5, false],
  ['counts.hand: 1.5', 'counts/hand', 1.5, false], ['counts.hand: -1', 'counts/hand', -1, false], ['counts.sideboard: 1.5', 'counts/sideboard', 1.5, false], ['counts.sideboard: -1', 'counts/sideboard', -1, false],
  ['counts.hand: 250', 'counts/hand', 250, true], ['counts.hand: 251', 'counts/hand', 251, false], ['counts.sideboard: 250', 'counts/sideboard', 250, true], ['counts.sideboard: 251', 'counts/sideboard', 251, false],
  ['counts: an unknown zone', 'counts/battlefield', 3, false], ['counts: as a number', 'counts', 5, false],
  ['pc.poison: 1', 'pc/poison', 1, true], ['pc.poison: the limit', 'pc/poison', 1e12, true], ['pc.poison: 0', 'pc/poison', 0, false], ['pc.poison: over the limit', 'pc/poison', 1e12 + 1, false], ['pc.poison: 1.5', 'pc/poison', 1.5, false],
  ['pc.energy: 5', 'pc/energy', 5, true], ['pc.energy: 0', 'pc/energy', 0, false], ['pc.experience: 5', 'pc/experience', 5, true], ['pc.experience: -1', 'pc/experience', -1, false],
  ['pc.energy: the limit', 'pc/energy', 1e12, true], ['pc.energy: over the limit', 'pc/energy', 1e12 + 1, false], ['pc.experience: over the limit', 'pc/experience', 1e12 + 1, false], ['pc.experience: 0', 'pc/experience', 0, false],
  ['cd seat 4: over the limit', 'cd/4', 1e12 + 1, false], ['cd seat 1: 0', 'cd/1', 0, false], ['cd seat 2: 0', 'cd/2', 0, false], ['cd seat 4: 0', 'cd/4', 0, false], ['cd seat 3: the limit', 'cd/3', 1e12, true], ['cd seat 3: over the limit', 'cd/3', 1e12 + 1, false],
  ['cd seat 1: 1.5', 'cd/1', 1.5, false],
  ['pc: an unknown counter', 'pc/rad', 1, false], ['pc: as a number', 'pc', 5, false],
  ['cd seat 1: 21', 'cd/1', 21, true], ['cd seat 4: 1', 'cd/4', 1, true], ['cd seat 2: the limit', 'cd/2', 1e12, true], ['cd seat 3: 0', 'cd/3', 0, false], ['cd seat 1: over the limit', 'cd/1', 1e12 + 1, false],
  ['cd: seat 5', 'cd/5', 1, false], ['cd: seat 0', 'cd/0', 1, false], ['cd: as a number', 'cd', 5, false],
  ['pass: turn 2 to seat 1', 'pass', { n: 2, to: '1' }, true], ['pass: the largest turn', 'pass', { n: 100000, to: '4' }, true], ['pass: turn 1 (needs no pass)', 'pass', { n: 1, to: '1' }, false],
  ['pass: turn 100001', 'pass', { n: 100001, to: '1' }, false], ['pass: turn 2.5', 'pass', { n: 2.5, to: '1' }, false], ['pass: turn as text', 'pass', { n: '2', to: '1' }, false],
  ['pass: seat 5', 'pass', { n: 2, to: '5' }, false], ['pass: seat 0', 'pass', { n: 2, to: '0' }, false], ['pass: seat as a number', 'pass', { n: 2, to: 2 }, false], ['pass: no seat', 'pass', { n: 2 }, false], ['pass: no turn', 'pass', { to: '1' }, false],
  ['pass: an extra key', 'pass', { n: 2, to: '1', x: 1 }, false], ['pass: a number', 'pass', 5, false], ['pass: text', 'pass', 'now', false],
  ['pass with from, an earlier turn', 'pass', { n: 3, to: '2', from: { n: 2, to: '1' } }, true], ['pass with from, the same turn', 'pass', { n: 3, to: '2', from: { n: 3, to: '1' } }, false],
  ['pass with from, a later turn', 'pass', { n: 3, to: '2', from: { n: 4, to: '1' } }, false], ['pass with from, turn 1', 'pass', { n: 3, to: '2', from: { n: 1, to: '1' } }, false],
  ['pass with from, seat 9', 'pass', { n: 3, to: '2', from: { n: 2, to: '9' } }, false], ['pass with from, no seat', 'pass', { n: 3, to: '2', from: { n: 2 } }, false],
  ['pass with from, an extra key', 'pass', { n: 3, to: '2', from: { n: 2, to: '1', y: 1 } }, false], ['pass with from, a number', 'pass', { n: 3, to: '2', from: 2 }, false],
  ['an unknown key under public', 'foo', 1, false], ['an uploaded-picture name that is not designed yet (au)', 'au', 'x.png', false],
  // hidden zones must never appear under public, even with perfectly good cards
  ['the HAND under public', 'hand', [aCard(1)], false], ['the LIBRARY under public', 'library', [aCard(1)], false], ['the SIDEBOARD under public', 'sideboard', [aCard(1)], false],
  ['a hidden zone under public, one card', 'hand/0', aCard(1), false],
];
for (const [label, path, value, accepted] of PUBLIC_CASES) await (accepted ? ok : denied)(`public: ${label}`, put(alice, `public/alice/${path}`, value));
for (const [label, path, value, accepted] of PUBLIC_CASES.slice(0, 6)) await denied(`public, by another player: ${label}`, put(bob, `public/alice/${path}`, value));
const PRIVATE_CASES = [
  ['the battlefield under private', 'battlefield', [aCard(1)]], ['the graveyard under private', 'graveyard', [aCard(1)]], ['the exile under private', 'exile', [aCard(1)]], ['the command zone under private', 'command', [aCard(1)]],
  ['a life total under private', 'life', 40], ['counts under private', 'counts', { hand: 1 }], ['any other key under private', 'foo', 1],
];
for (const [label, path, value] of PRIVATE_CASES) await denied(`private: ${label}`, put(alice, `private/alice/${path}`, value));

// whole branches
await ok('a whole public branch of real fields', put(alice, 'public/alice', { life: 40, turn: 1, mulligans: 0, next: 9, match: 1, counts: { library: 80, hand: 7, sideboard: 0 }, pc: { poison: 1 }, cd: { 2: 5 }, pass: { n: 2, to: '2' }, battlefield: [aCard(1)], command: [aCard(2, { n: 'Krenko, Mob Boss' })] }));
await denied('a whole public branch with one bad field is refused entirely', put(alice, 'public/alice', { life: 40, turn: 0, battlefield: [aCard(1)] }));
await denied('a whole public branch with a bad card is refused entirely', put(alice, 'public/alice', { life: 40, battlefield: [{ ...aCard(1), n: '' }] }));
await denied('a whole public branch holding a hand', put(alice, 'public/alice', { life: 40, hand: [aCard(1)] }));
for (const [label, value] of [['text', 'hello'], ['a number', 5], ['true', true]]) {
  await denied(`a whole public branch written as ${label}`, put(alice, 'public/alice', value));
  await denied(`a whole private branch written as ${label}`, put(alice, 'private/alice', value));
}
await ok('a whole private branch of real fields', put(alice, 'private/alice', { library: [aCard(1), aCard(2)], hand: [aCard(3)], sideboard: [aCard(4)] }));
await denied('a whole private branch with a bad card', put(alice, 'private/alice', { library: [{ ...aCard(1), i: 'x' }] }));
await denied('another player cannot overwrite a whole public branch', put(bob, 'public/alice', { life: 1 }));
await denied('another player cannot overwrite a whole private branch', put(bob, 'private/alice', { hand: [aCard(1)] }));
await denied('a stranger cannot write a public branch under their own id', put(carol, 'public/carol', { life: 40 }));
await ok('a player deletes their own public branch', put(alice, 'public/alice', null));
await ok('a player deletes their own private branch', put(alice, 'private/alice', null));
await ok('bob writes his own public branch', put(bob, 'public/bob', { life: 20 }));
await ok('bob writes his own private branch', put(bob, 'private/bob', { hand: [aCard(1)] }));
await denied('bob cannot read alice\'s private branch', get(ref(bob, `tables/${T}/private/alice`)));
await ok('alice reads her own private branch', get(ref(alice, `tables/${T}/private/alice`)));
await ok('bob reads alice\'s public branch', get(ref(bob, `tables/${T}/public/alice`)));

// one update across both branches is all or nothing
await put(alice, 'public/alice/life', 33);
await denied('one update with a good life and a bad card changes nothing',
  update(ref(alice), { [`tables/${T}/public/alice/life`]: 11, [`tables/${T}/private/alice/hand`]: [{ u: 'bad', i: 'x', n: 'Island' }] }));
{
  const life = (await get(ref(alice, `tables/${T}/public/alice/life`))).val();
  check('...and the good half of it was not applied either', life === 33, `life is ${life}`);
}

// the match number: a table at match 2
{
  await seedTable('RULEM2', 2);
  await denied('match 1 on a table at match 2', set(ref(alice, 'tables/RULEM2/public/alice/match'), 1));
  await ok('match 2 on a table at match 2', set(ref(alice, 'tables/RULEM2/public/alice/match'), 2));
  await ok('a game save of the new match (the first save writes the match number with everything else)', update(ref(alice), { 'tables/RULEM2/public/alice/match': 2, 'tables/RULEM2/public/alice/life': 40, 'tables/RULEM2/public/alice/battlefield': [aCard(1)] }));
  await denied('a save that carries an old match number', update(ref(alice), { 'tables/RULEM2/public/alice/match': 1, 'tables/RULEM2/public/alice/life': 40 }));
  await ok('a save of other fields does not need the match number again', set(ref(alice, 'tables/RULEM2/public/alice/life'), 39));
}

// the last-seen time: a delete is refused (the takeover rule needs it to exist)
await ok('a player writes their last-seen time', set(ref(alice, `tables/${T}/presence/alice/lastSeen`), { '.sv': 'timestamp' }));
await denied('a player cannot delete their last-seen time', set(ref(alice, `tables/${T}/presence/alice/lastSeen`), null));

// ---------------------------------------------------------------- 3. no false rejections: long random games with the pages' own code
const gameDeck = {
  cards: [
    { i: id(5), n: 'Krenko, Mob Boss', qty: 1, section: 'commander' },
    { i: id(1), n: 'Forest', qty: 20, section: 'main' }, { i: id(3), n: 'Goblin Guide', qty: 12, section: 'main' }, { i: id(4), n: 'Lightning Bolt', qty: 8, section: 'main', p: id(99) },
    { i: id(6), n: 'Valakut Awakening // Valakut Stoneforge', qty: 4, section: 'main' }, // two-sided
    { i: id(7), n: long(200), qty: 3, section: 'main' }, // the longest name the rules accept
    { i: id(8), n: 'Mind Stone', qty: 2, section: 'sideboard' },
  ],
  commander: [id(5)],
};
const known = (card) => ({
  t: card.i === id(1) ? 'Basic Land - Forest' : card.i === id(6) ? 'Instant // Land' : 'Creature - Goblin', m: '', k: [],
  ...(card.i === id(6) ? { b: 1, md: 1 } : {}),
});
const pickFrom = (random, list) => list[Math.floor(random() * list.length)];
const TOKEN = { n: 'Goblin', i: id(70), tt: 'Token Creature - Goblin', pt: '1/1', cl: 'R' };
const LONG_TOKEN = { n: long(60), i: id(71), tt: long(60), pt: '123/456', cl: 'WUBRG' };

async function playRandomGame(seed, steps, lookup, code) {
  await seedTable(code);
  const random = seededRandom(seed * 977);
  const pick = (list) => pickFrom(random, list);
  let game = makeGame(gameDeck, lookup, { random: seededRandom(seed) });
  let before = null;
  let sent = 0; let passN = 1; let refusedByPage = 0; let largest = 0;
  const send = async (label) => {
    const writes = gameWrites('alice', before, game);
    if (before === null) writes['public/alice/match'] = 1; // the first save of a match writes its number (table.js)
    const paths = Object.keys(writes);
    if (paths.length) {
      try { await assertSucceeds(update(ref(alice), Object.fromEntries(paths.map((path) => [`tables/${code}/${path}`, writes[path]])))); } catch (error) {
        console.log(`FAILED CHECK: random game ${seed}, ${label}: the rules refused a write the page makes. Paths: ${paths.join(', ')}`);
        console.log(JSON.stringify(Object.fromEntries(paths.map((path) => [path, writes[path]]))).slice(0, 1500));
        throw error;
      }
      sent += paths.length; checks++;
      largest = Math.max(largest, JSON.stringify(writes).length);
    }
    before = game;
  };
  await send('the first save');
  for (let step = 0; step < steps; step++) {
    const battlefield = game.zones.battlefield;
    const all = ZONES.flatMap((zone) => game.zones[zone]);
    const op = pick(['move', 'move', 'move', 'draw', 'counter', 'counter', 'modifier', 'reset', 'note', 'facedown', 'token', 'longtoken', 'copy', 'copy', 'player', 'commander', 'turn', 'tap', 'life', 'untap', 'shuffle', 'turnover', 'sick', 'nountap', 'pass', 'unpass']);
    try {
      if (op === 'move' && all.length) game = moveCard(game, pick(all).uid, pick(ZONES), { position: pick(['top', 'bottom']) });
      else if (op === 'draw') game = draw(game, 1 + Math.floor(random() * 2)).game;
      else if (op === 'counter' && battlefield.length) game = changeCounter(game, pick(battlefield).uid, pick(COUNTER_KINDS), (random() < 0.5 ? -1 : 1) * (1 + Math.floor(random() * 4)));
      else if (op === 'modifier' && battlefield.length) game = changeModifier(game, pick(battlefield).uid, pick(['power', 'toughness']), (random() < 0.5 ? -1 : 1) * (1 + Math.floor(random() * 30)));
      else if (op === 'reset' && battlefield.length) game = resetModifier(game, pick(battlefield).uid);
      else if (op === 'note' && battlefield.length) game = setNote(game, pick(battlefield).uid, random() < 0.3 ? '' : random() < 0.3 ? long(40) : `note ${Math.floor(random() * 1000)}`);
      else if (op === 'facedown' && battlefield.length) game = setFaceDown(game, pick(battlefield).uid, random() < 0.5);
      else if (op === 'token' && battlefield.length < MAX_ZONE_CARDS) game = createToken(game, TOKEN).game;
      else if (op === 'longtoken' && battlefield.length < MAX_ZONE_CARDS) game = createToken(game, LONG_TOKEN).game;
      else if (op === 'copy' && battlefield.length && battlefield.length < MAX_ZONE_CARDS) game = copyAsToken(game, pick(battlefield).uid, { printed: pick([null, '2/2', '3/2', '*/*']) }).game;
      else if (op === 'player') game = changePlayerCounter(game, pick(PLAYER_COUNTERS), (random() < 0.5 ? -1 : 1) * (1 + Math.floor(random() * 5)));
      else if (op === 'commander') game = changeCommanderDamage(game, pick(COMMANDER_SEATS), (random() < 0.5 ? -1 : 1) * (1 + Math.floor(random() * 5)));
      else if (op === 'turn') game = nextTurn(game).game;
      else if (op === 'tap' && battlefield.length) { const card = pick(battlefield); game = setTapped(game, card.uid, !card.tapped); }
      else if (op === 'life') game = adjustLife(game, Math.floor(random() * 11) - 5);
      else if (op === 'untap') game = untapAll(game);
      else if (op === 'shuffle') game = shuffleLibrary(game, random);
      else if (op === 'turnover' && battlefield.some((card) => card.b === 1)) game = turnOver(game, pick(battlefield.filter((card) => card.b === 1)).uid);
      else if (op === 'sick' && battlefield.length) game = setSick(game, pick(battlefield).uid, random() < 0.5);
      else if (op === 'nountap' && battlefield.length) game = setNoUntap(game, pick(battlefield).uid, random() < 0.5);
      else if (op === 'pass') { passN += 1; game = { ...game, pass: { n: passN, to: String(1 + (passN % 4)), ...(game.pass ? { from: { n: game.pass.n, to: game.pass.to } } : {}) } }; }
      else if (op === 'unpass' && game.pass) { const { pass, ...rest } = game; game = rest; }
    } catch (error) {
      if (/type is not known/.test(error.message)) { refusedByPage++; continue; } // the page refuses a copy of a card with no type (zones.mjs copyAsToken)
      throw error;
    }
    const problems = checkGame(game);
    if (problems.length) throw new Error(`the page's own game is inconsistent at step ${step} (${op}): ${problems.join('; ')}`);
    await send(`step ${step} (${op})`);
  }
  // what is stored reads back as the game the page holds
  const stored = await new Promise((resolve, reject) => {
    Promise.all([get(ref(alice, `tables/${code}/public/alice`)), get(ref(alice, `tables/${code}/private/alice`))]).then(([a, b]) => resolve([a.val(), b.val()]), reject);
  });
  const back = joinGame(stored[0], stored[1], lookup);
  check(`random game ${seed}: stored game reads back with the same zone sizes`, back && ZONES.every((zone) => back.zones[zone].length === game.zones[zone].length), JSON.stringify(ZONES.map((zone) => [zone, back?.zones[zone].length, game.zones[zone].length])));
  console.log(`  random game ${seed}: ${steps} moves, ${sent} writes all accepted (largest save ${largest} bytes, ${refusedByPage} operations refused by the page itself)`);
}
for (const seed of [1, 2, 3, 4]) await playRandomGame(seed, 220, known, `RNDG0${seed}`);
// a game whose card list did not load: no card has a type, so copies are refused by the page (never written as a token with no type)
await playRandomGame(5, 150, () => null, 'RNDG05');

structureChecks();
await env.cleanup();
console.log(`All ${checks} game rule checks passed.`);
