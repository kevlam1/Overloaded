// Tests for scripts/lib/card-list.mjs (the card list build): which records are kept, how an entry is made, what counts as
// online-only, that the output is the same bytes whatever the input order, and every check a list must pass before it is
// published. Hand-made records, plus tiny gzipped files for the readers. No network. Run: node scripts/test-card-list.mjs
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { NOT_IN_DECKS, TOKENISH, MIN_CARDS, oracleIdOf, isDeckCandidate, toEntry, PrintingSummary, buildList, serializeList, validateList, readJsonLines, buildFromFiles } from './lib/card-list.mjs';

let checks = 0;
function check(label, condition, detail = '') {
  checks++;
  if (!condition) { console.error(`FAILED: ${label} ${detail}`); process.exit(1); }
}
const same = (label, actual, expected) => check(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const record = (name, over = {}) => ({ id: uuid(name.length * 1000 + [...name].reduce((s, ch) => s + ch.charCodeAt(0), 0) % 1000), oracle_id: `o-${name}`, name, type_line: 'Creature — Test', mana_cost: '{1}', keywords: [], layout: 'normal', set_type: 'expansion', ...over });

// ---- isDeckCandidate ----
// The expected layouts are written out here on purpose: looping over the library's own sets would shrink the test with them.
for (const layout of ['art_series', 'vanguard', 'planar', 'scheme']) check(`a ${layout} record is not a deck card`, !isDeckCandidate(record('x', { layout })));
for (const layout of ['token', 'double_faced_token', 'emblem']) check(`a ${layout} record is not a deck card`, !isDeckCandidate(record('x', { layout })));
check('the exported sets hold exactly those layouts', [...NOT_IN_DECKS].sort().join() === 'art_series,planar,scheme,vanguard' && [...TOKENISH].sort().join() === 'double_faced_token,emblem,token');
check('a front_card record is not a deck card', !isDeckCandidate(record('x', { layout: 'front_card' })));
check('a memorabilia record is not a deck card', !isDeckCandidate(record('x', { set_type: 'memorabilia' })));
for (const layout of ['normal', 'transform', 'modal_dfc', 'split', 'adventure', 'prepare', 'saga', 'meld', 'flip', 'leveler', 'class', 'case', 'mutate', 'prototype', 'augment', 'host']) check(`a ${layout} record is a deck card`, isDeckCandidate(record('x', { layout })));
check('a record with no layout field is a deck card (nothing says otherwise)', isDeckCandidate({ name: 'x' }));
check('a promo set type is still a deck card', isDeckCandidate(record('x', { set_type: 'promo' })));

// ---- oracleIdOf ----
check('the oracle id comes from the record', oracleIdOf({ oracle_id: 'a', card_faces: [{ oracle_id: 'b' }] }) === 'a');
check('or from the first face when the record has none', oracleIdOf({ card_faces: [{ oracle_id: 'b' }, { oracle_id: 'c' }] }) === 'b');
check('and is undefined when there is none', oracleIdOf({ name: 'x' }) === undefined);

// ---- toEntry ----
same('a plain card', toEntry({ id: 'i1', name: 'Sol Ring', type_line: 'Artifact', mana_cost: '{1}', keywords: [] }), { n: 'Sol Ring', t: 'Artifact', m: '{1}', k: [], i: 'i1' });
check('a double-faced card takes its cost from the front face', toEntry({ id: 'i', name: 'D', type_line: 'T', card_faces: [{ mana_cost: '{U}' }, { mana_cost: '' }] }).m === '{U}');
check('a record cost wins over the faces (split cards keep both costs)', toEntry({ id: 'i', name: 'F // I', type_line: 'T', mana_cost: '{1}{R} // {1}{U}', card_faces: [{ mana_cost: '{1}{R}' }] }).m === '{1}{R} // {1}{U}');
check('a land has an empty cost, not undefined', toEntry({ id: 'i', name: 'Island', type_line: 'Basic Land', mana_cost: '' }).m === '');
check('a missing cost becomes an empty string', toEntry({ id: 'i', name: 'X', type_line: 'T' }).m === '');
check('a missing keywords field becomes an empty list', Array.isArray(toEntry({ id: 'i', name: 'X', type_line: 'T' }).k) && toEntry({ id: 'i', name: 'X', type_line: 'T' }).k.length === 0);
same('keywords are kept as given', toEntry({ id: 'i', name: 'X', type_line: 'T', keywords: ['Flying', 'Flash'] }).k, ['Flying', 'Flash']);
check('the entry holds exactly the five fields', Object.keys(toEntry(record('Y'))).join() === 'n,t,m,k,i');

// ---- PrintingSummary: what counts as online-only ----
{
  const p = new PrintingSummary();
  p.add({ oracle_id: 'all-digital', digital: true }); p.add({ oracle_id: 'all-digital', digital: true });
  p.add({ oracle_id: 'mixed', digital: true }); p.add({ oracle_id: 'mixed', digital: false });
  p.add({ oracle_id: 'paper', digital: false });
  p.add({ card_faces: [{ oracle_id: 'on-faces' }], digital: true });
  p.add({ digital: true }); // no id at all: ignored, must not crash
  check('every printing digital: online-only', p.isOnlineOnly('all-digital'));
  check('one non-digital printing among digital ones: NOT online-only', !p.isOnlineOnly('mixed'));
  check('only paper printings: not online-only', !p.isOnlineOnly('paper'));
  check('an id found on the faces is used', p.isOnlineOnly('on-faces'));
  check('a card with no printings at all is NOT online-only (the printings file may be older than the card file)', !p.isOnlineOnly('never-seen'));
  check('a digital printing with no id at all does not make a card with no id look online-only', !p.isOnlineOnly(undefined) && !p.seen.has(undefined));
  check('a printing with no digital field counts as not digital', (() => { const q = new PrintingSummary(); q.add({ oracle_id: 'z' }); return !q.isOnlineOnly('z'); })());
  check('the order of printings does not matter', (() => { const q = new PrintingSummary(); q.add({ oracle_id: 'm', digital: false }); q.add({ oracle_id: 'm', digital: true }); return !q.isOnlineOnly('m'); })());
}

// ---- buildList ----
const printings = new PrintingSummary();
for (const name of ['Sol Ring', 'Alpha', 'Beta', 'Island']) printings.add({ oracle_id: `o-${name}`, digital: false });
printings.add({ oracle_id: 'o-Alchemy Only', digital: true });
const records = [
  record('Sol Ring', { id: uuid(1) }), record('Island', { id: uuid(2), type_line: 'Basic Land — Island', mana_cost: '' }), record('Beta', { id: uuid(3) }), record('Alpha', { id: uuid(4) }),
  record('Alchemy Only', { id: uuid(5) }), record('Goblin', { id: uuid(6), layout: 'token' }), record('Art', { id: uuid(7), layout: 'art_series' }), record('Memo', { id: uuid(8), set_type: 'memorabilia' }),
  record('Brand New', { id: uuid(9) }), // not in the printings file at all
];
const built = buildList(records, printings);
same('the list is sorted by name and holds only deck cards', built.map((e) => e.n), ['Alpha', 'Beta', 'Brand New', 'Island', 'Sol Ring']);
check('the online-only card, the token, the art card and the collectible are gone', !built.some((e) => ['Alchemy Only', 'Goblin', 'Art', 'Memo'].includes(e.n)));
check('a card missing from the printings file is kept', built.some((e) => e.n === 'Brand New'));
check('the input array is not changed', records[0].name === 'Sol Ring' && records.length === 9);
{
  // Same bytes whatever the order of the input: 40 seeded shuffles.
  const reference = serializeList(buildList(records, printings));
  let seed = 12345;
  const random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let allSame = true;
  for (let round = 0; round < 40; round++) {
    const shuffled = [...records];
    for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
    if (serializeList(buildList(shuffled, printings)) !== reference) allSame = false;
  }
  check('40 shuffles of the input give identical bytes', allSame);
}
{
  const twins = [record('Twin', { id: uuid(20), oracle_id: 'o-t1' }), record('Twin', { id: uuid(10), oracle_id: 'o-t2' })];
  same('two cards with one name are ordered by id, whatever the input order', buildList(twins, new PrintingSummary()).map((e) => e.i), [uuid(10), uuid(20)]);
  same('...in the other input order too', buildList([...twins].reverse(), new PrintingSummary()).map((e) => e.i), [uuid(10), uuid(20)]);
}
check('names sort by code unit, not by locale (an uppercase letter before a lowercase one)', (() => { const b = buildList([record('apple', { id: uuid(31) }), record('Zebra', { id: uuid(32) })], new PrintingSummary()); return b[0].n === 'Zebra' && b[1].n === 'apple'; })());
check('an empty input gives an empty list', buildList([], new PrintingSummary()).length === 0);

// ---- serializeList ----
check('the output has no spaces or line breaks outside the card text', !/\n/.test(serializeList(built)) && serializeList(built).startsWith('[{"n":"Alpha"'));
same('the output reads back to the same list', JSON.parse(serializeList(built)), built);

// ---- validateList: build a good list, then break it one way at a time ----
const good = Array.from({ length: 50 }, (_, index) => ({ n: `Card ${String(index).padStart(3, '0')}`, t: 'Creature', m: '{1}', k: [], i: uuid(100 + index) }));
const opts = { minCards: 10, mustHave: ['Card 000', 'Card 049'] };
same('a good list passes', validateList(good, opts), []);
check('a list that is not an array fails', validateList({}, opts).length > 0 && validateList(null, opts).length > 0);
check('too few cards fails', validateList(good.slice(0, 5), { ...opts, minCards: 10, mustHave: [] }).some((p) => /fewer than the minimum/.test(p)));
check('exactly the minimum passes', validateList(good.slice(0, 10), { ...opts, mustHave: [] }).length === 0);
check('the real minimum is 30,000', MIN_CARDS === 30000);
check('a list 10% smaller than the last good one fails', validateList(good.slice(0, 45), { ...opts, mustHave: [], previousCount: 50 }).some((p) => /more than 5% fewer/.test(p)));
check('a list 4% smaller than the last good one passes', validateList(good.slice(0, 48), { ...opts, mustHave: [], previousCount: 50 }).length === 0);
check('a bigger list than the last one passes', validateList(good, { ...opts, previousCount: 40 }).length === 0);
check('a missing must-have card fails and names it', validateList(good, { ...opts, mustHave: ['Sol Ring'] }).some((p) => /Sol Ring/.test(p)));
for (const [label, mutate, pattern] of [
  ['a bad id', (l) => { l[3] = { ...l[3], i: 'not-an-id' }; }, /not a Scryfall id/],
  ['a missing id', (l) => { l[3] = { ...l[3], i: undefined }; }, /not a Scryfall id/],
  ['an uppercase id', (l) => { l[3] = { ...l[3], i: 'ABCDEF01-0000-4000-8000-000000000103' }; }, /not a Scryfall id/],
  ['an id with something before it', (l) => { l[3] = { ...l[3], i: `x${uuid(103)}` }; }, /not a Scryfall id/],
  ['an id with something after it', (l) => { l[3] = { ...l[3], i: `${uuid(103)}x` }; }, /not a Scryfall id/],
  ['a duplicate id',(l) => { l[4] = { ...l[4], i: l[3].i }; }, /duplicate id/],
  ['an empty name', (l) => { l[0] = { ...l[0], n: '' }; }, /missing a name/],
  ['a missing type', (l) => { l[2] = { ...l[2], t: undefined }; }, /missing a name/],
  ['a missing cost', (l) => { l[2] = { ...l[2], m: undefined }; }, /missing a name/],
  ['keywords that are not a list', (l) => { l[2] = { ...l[2], k: 'Flying' }; }, /missing a name/],
  ['a keyword that is not text', (l) => { l[2] = { ...l[2], k: [5] }; }, /missing a name/],
  ['an entry that is null', (l) => { l[2] = null; }, /missing a name/],
  ['an out-of-order pair', (l) => { [l[5], l[6]] = [l[6], l[5]]; }, /out of order/],
]) {
  const broken = good.map((e) => ({ ...e }));
  mutate(broken);
  check(`${label} fails`, validateList(broken, { ...opts, mustHave: [] }).some((p) => pattern.test(p)), JSON.stringify(validateList(broken, { ...opts, mustHave: [] })));
}
check('the list of problems is capped, so a broken list does not print thousands of lines', (() => {
  const sameIdEverywhere = Array.from({ length: 200 }, (_, index) => ({ n: `Card ${String(index).padStart(3, '0')}`, t: 'T', m: '', k: [], i: uuid(1) }));
  const problems = validateList(sameIdEverywhere, { minCards: 1, mustHave: [] }); // 199 duplicate-id problems, one line each
  return problems.length === 20;
})());

// ---- the file readers, with tiny gzipped files ----
const dir = mkdtempSync(join(tmpdir(), 'card-list-test-'));
try {
  const gz = (name, lines) => { const path = join(dir, name); writeFileSync(path, gzipSync(Buffer.from(lines.join('\n')))); return path; };
  const rows = [];
  for await (const r of readJsonLines(gz('a.jsonl.gz', ['{"a":1}', '', '  ', '{"a":2}\r', '{"a":3}', '']))) rows.push(r.a);
  same('the reader skips blank lines and tolerates a carriage return', rows, [1, 2, 3]);
  let failed = false;
  try { for await (const r of readJsonLines(gz('bad.jsonl.gz', ['{"a":1}', '{nope']))) void r; } catch { failed = true; }
  check('a corrupt line stops the build instead of being skipped', failed);
  failed = false;
  try { for await (const r of readJsonLines(join(dir, 'missing.jsonl.gz'))) void r; } catch { failed = true; }
  check('a missing file stops the build', failed);
  failed = false;
  try { writeFileSync(join(dir, 'notgz.jsonl.gz'), 'plain text, not gzip'); for await (const r of readJsonLines(join(dir, 'notgz.jsonl.gz'))) void r; } catch { failed = true; }
  check('a file that is not gzip stops the build', failed);

  const oracleFile = gz('oracle.jsonl.gz', records.map((r) => JSON.stringify(r)));
  const defaultFile = gz('default.jsonl.gz', [
    ...['Sol Ring', 'Alpha', 'Beta', 'Island'].map((n) => JSON.stringify({ oracle_id: `o-${n}`, digital: false })),
    JSON.stringify({ oracle_id: 'o-Alchemy Only', digital: true }), JSON.stringify({ oracle_id: 'o-Alchemy Only', digital: true }),
  ]);
  const { list, counts } = await buildFromFiles(oracleFile, defaultFile);
  same('files in, the same list as from memory', list, built);
  same('the counts describe every step', counts, { printings: 6, oracleRecords: 9, notCandidates: 3, onlineOnly: 1, noPrintingsKept: 1, kept: 5 });
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`All ${checks} card list checks passed.`);
