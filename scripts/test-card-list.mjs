// Tests for scripts/lib/card-list.mjs (the card list build): which records are kept, how an entry is made, what counts as
// online-only, that the output is the same bytes whatever the input order, and every check a list must pass before it is
// published. Hand-made records, plus tiny gzipped files for the readers. No network. Run: node scripts/test-card-list.mjs
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { NOT_IN_DECKS, TOKENISH, MIN_CARDS, MIN_PRINTINGS, MIN_PRINTING_SETS, oracleIdOf, isDeckCandidate, toEntry, PrintingSummary, buildList, serializeList, serializePrintings, validateList, validatePrintings, countPrintings, readJsonLines, buildFromFiles } from './lib/card-list.mjs';
import { printingValue } from '../shared/printings.mjs';

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

// ---- alternate titles (Scryfall's flavor_name) ----
same('an entry with alternate titles has them in f, after the five fields', toEntry({ id: 'i', name: 'Arcane Signet', type_line: 'Artifact' }, ['Heart of the Mountain']), { n: 'Arcane Signet', t: 'Artifact', m: '', k: [], i: 'i', f: ['Heart of the Mountain'] });
check('an entry without them has no f field at all (so the list stays small)', !('f' in toEntry({ id: 'i', name: 'X', type_line: 'T' }, [])) && !('f' in toEntry({ id: 'i', name: 'X', type_line: 'T' })));
{
  const p = new PrintingSummary();
  p.add({ oracle_id: 'signet', digital: false, name: 'Arcane Signet', flavor_name: 'Heart of the Mountain', lang: 'en' });
  p.add({ oracle_id: 'signet', digital: false, name: 'Arcane Signet', flavor_name: 'Heart of the Mountain', lang: 'en' }); // the same title on another printing
  p.add({ oracle_id: 'signet', digital: false, name: 'Arcane Signet' }); // a printing with no other title
  p.add({ oracle_id: 'denial', digital: false, name: 'Arcane Denial', lang: 'ja', printed_name: 'printed in Japanese', flavor_name: 'Fatalism-in-Japanese' });
  p.add({ card_faces: [{ oracle_id: 'dfc', flavor_name: 'Back Title' }, { flavor_name: 'Front Title' }], digital: false });
  p.add({ oracle_id: 'alchemy', digital: true, flavor_name: 'Only Online' });
  p.add({ oracle_id: 'blank', digital: false, flavor_name: '   ' }); p.add({ oracle_id: 'blank', digital: false, flavor_name: 5 });
  p.add({ oracle_id: 'order', digital: false, flavor_name: 'b title' }); p.add({ oracle_id: 'order', digital: false, flavor_name: 'B title' }); p.add({ oracle_id: 'order', digital: false, flavor_name: 'a title' });
  same('a title is found, once, however many printings have it', p.alternateNames('signet'), ['Heart of the Mountain']);
  same('a printing in another language gives its title to the card it is a printing of (the real name is the oracle id\'s)', p.alternateNames('denial'), ['Fatalism-in-Japanese']);
  same('titles on the faces of a double-faced card are found, under the id on the faces', p.alternateNames('dfc'), ['Back Title', 'Front Title']);
  same('a title only on a digital printing is ignored', p.alternateNames('alchemy'), []);
  same('a blank or non-text title is ignored', p.alternateNames('blank'), []);
  same('titles are sorted by code unit, not by locale', p.alternateNames('order'), ['B title', 'a title', 'b title']);
  same('a card with no titles, or never seen, gives an empty list', [p.alternateNames('nothing'), p.alternateNames(undefined)], [[], []]);
  check('asking for titles does not change them', p.alternateNames('order').length === 3 && p.alternateNames('order').length === 3);
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
{
  const withTitles = new PrintingSummary();
  withTitles.add({ oracle_id: 'o-Sol Ring', digital: false });
  withTitles.add({ oracle_id: 'o-Alpha', digital: false, flavor_name: 'Alpha Two' }); withTitles.add({ oracle_id: 'o-Alpha', digital: false, flavor_name: 'Alpha One' });
  const list = buildList([record('Sol Ring', { id: uuid(1) }), record('Alpha', { id: uuid(4) })], withTitles);
  same('buildList gives a card its titles and leaves the others without f', list.map((e) => [e.n, e.f]), [['Alpha', ['Alpha One', 'Alpha Two']], ['Sol Ring', undefined]]);
  const reversed = new PrintingSummary();
  reversed.add({ oracle_id: 'o-Alpha', digital: false, flavor_name: 'Alpha One' }); reversed.add({ oracle_id: 'o-Alpha', digital: false, flavor_name: 'Alpha Two' }); reversed.add({ oracle_id: 'o-Sol Ring', digital: false });
  check('the bytes are the same whichever order the printings came in', serializeList(buildList([record('Sol Ring', { id: uuid(1) }), record('Alpha', { id: uuid(4) })], reversed)) === serializeList(list));
}

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
  ['alternate titles that are not a list', (l) => { l[2] = { ...l[2], f: 'Heart of the Mountain' }; }, /missing a name/],
  ['an empty list of alternate titles', (l) => { l[2] = { ...l[2], f: [] }; }, /missing a name/],
  ['an alternate title that is not text', (l) => { l[2] = { ...l[2], f: ['Fine', 7] }; }, /missing a name/],
  ['an empty alternate title', (l) => { l[2] = { ...l[2], f: [''] }; }, /missing a name/],
  ['alternate titles set to undefined', (l) => { l[2] = { ...l[2], f: undefined }; }, /missing a name/],
]) {
  const broken = good.map((e) => ({ ...e }));
  mutate(broken);
  check(`${label} fails`, validateList(broken, { ...opts, mustHave: [] }).some((p) => pattern.test(p)), JSON.stringify(validateList(broken, { ...opts, mustHave: [] })));
}
same('a list with good alternate titles passes', validateList(good.map((e, index) => (index === 2 ? { ...e, f: ['Heart of the Mountain', 'Other'] } : e)), opts), []);
check('the list of problems is capped, so a broken list does not print thousands of lines', (() => {
  const sameIdEverywhere = Array.from({ length: 200 }, (_, index) => ({ n: `Card ${String(index).padStart(3, '0')}`, t: 'T', m: '', k: [], i: uuid(1) }));
  const problems = validateList(sameIdEverywhere, { minCards: 1, mustHave: [] }); // 199 duplicate-id problems, one line each
  return problems.length === 20;
})());

// ---- the title's printing id (fp) ----
same('an entry with titles and their printing ids has fp, after f', toEntry({ id: 'i', name: 'Arcane Signet', type_line: 'Artifact' }, ['Heart of the Mountain'], [uuid(7)]), { n: 'Arcane Signet', t: 'Artifact', m: '', k: [], i: 'i', f: ['Heart of the Mountain'], fp: [uuid(7)] });
check('ids that do not line up with the titles are not written', !('fp' in toEntry({ id: 'i', name: 'X', type_line: 'T' }, ['a', 'b'], [uuid(7)])));
check('an id that is missing from a printing is not written as a hole', !('fp' in toEntry({ id: 'i', name: 'X', type_line: 'T' }, ['a'], [undefined])));
check('ids with no titles are ignored', !('fp' in toEntry({ id: 'i', name: 'X', type_line: 'T' }, [], [uuid(7)])));
same('a list with titles and their printing ids passes', validateList(good.map((e, index) => (index === 2 ? { ...e, f: ['A', 'B'], fp: [uuid(7), uuid(8)] } : e)), opts), []);
for (const [label, entry] of [
  ['an fp with no f', { fp: [uuid(7)] }],
  ['an fp shorter than f', { f: ['A', 'B'], fp: [uuid(7)] }],
  ['an fp longer than f', { f: ['A'], fp: [uuid(7), uuid(8)] }],
  ['an fp that is not a list', { f: ['A'], fp: uuid(7) }],
  ['an fp id that is not an id', { f: ['A'], fp: ['not-an-id'] }],
  ['an fp that is empty', { f: ['A'], fp: [] }],
]) {
  const broken = good.map((e, index) => (index === 2 ? { ...e, ...entry } : e));
  check(`${label} fails`, validateList(broken, opts).some((p) => /missing a name/.test(p)), JSON.stringify(validateList(broken, opts)));
}

// ---- validatePrintings: a good set of files, then broken one way at a time ----
{
  const sets = Array.from({ length: 6 }, (_, index) => `s${String(index).padStart(2, '0')}`);
  const goodFiles = () => Object.fromEntries(sets.map((set, s) => [set, Object.fromEntries(Array.from({ length: 5 }, (_, n) => [String(n + 1), printingValue(uuid(s * 10 + n + 1), 'Card')]))]));
  const popts = { minPrintings: 30, minSets: 6 };
  same('good printing files pass', validatePrintings(goodFiles(), popts), []);
  same('how many sets and printings', countPrintings(goodFiles()), { sets: 6, printings: 30 });
  check('the real minimums are 80,000 printings and 500 sets', MIN_PRINTINGS === 80000 && MIN_PRINTING_SETS === 500);
  check('not an object fails', validatePrintings(null, popts).length > 0 && validatePrintings([], popts).length > 0 && validatePrintings('x', popts).length > 0);
  check('too few sets fails', validatePrintings(goodFiles(), { ...popts, minSets: 7 }).some((p) => /fewer than the minimum of 7/.test(p)));
  check('too few printings fails', validatePrintings(goodFiles(), { ...popts, minPrintings: 31 }).some((p) => /only 30 printings/.test(p)));
  check('exactly the minimum passes', validatePrintings(goodFiles(), popts).length === 0);
  check('10% fewer printings than the last build fails', validatePrintings(goodFiles(), { ...popts, minPrintings: 1, previousCount: 34 }).some((p) => /more than 5% fewer/.test(p)));
  check('4% fewer passes', validatePrintings(goodFiles(), { ...popts, previousCount: 31 }).length === 0);
  for (const [label, mutate, pattern] of [
    ['a set code that is too short', (f) => { f.ab = f.s00; delete f.s00; }, /not a set code/],
    ['a set code in capitals', (f) => { f.S00 = f.s00; delete f.s00; }, /not a set code/],
    ['a set code with a slash', (f) => { f['s/0'] = f.s01; delete f.s01; }, /not a set code/],
    ['a set that is a list', (f) => { f.s00 = []; }, /not a set code/],
    ['a set that is null', (f) => { f.s00 = null; }, /not a set code/],
    ['an empty collector number', (f) => { f.s00[''] = f.s00['1']; }, /collector number/],
    ['a collector number with a space', (f) => { f.s00['1 2'] = f.s00['1']; }, /collector number/],
    ['a collector number with a slash', (f) => { f.s00['1/2'] = f.s00['1']; }, /collector number/],
    ['a collector number that is far too long', (f) => { f.s00['9'.repeat(31)] = f.s00['1']; }, /collector number/],
    ['a value that is not text', (f) => { f.s00['1'] = 5; }, /card key/],
    ['a value with no card key', (f) => { f.s00['1'] = uuid(1); }, /card key/],
    ['a value with an uppercase key', (f) => { f.s00['1'] = `${uuid(1)}ABCD`; }, /card key/],
    ['a value whose id is not an id', (f) => { f.s00['1'] = `${'x'.repeat(36)}abcd`; }, /card key/],
    ['sets out of order', (f) => { const first = f.s00; delete f.s00; f.s00 = first; }, /out of order/],
  ]) {
    const broken = goodFiles();
    mutate(broken);
    check(`${label} fails`, validatePrintings(broken, { ...popts, minPrintings: 1, minSets: 1 }).some((p) => pattern.test(p)), JSON.stringify(validatePrintings(broken, { ...popts, minPrintings: 1, minSets: 1 })));
  }
  check('a collector number with a star or a letter passes', (() => { const f = goodFiles(); f.s00['213★'] = f.s00['1']; f.s00['268p'] = f.s00['1']; f.s00['XLN-217'] = f.s00['1']; return validatePrintings(f, { ...popts, minPrintings: 1 }).length === 0; })());
}

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
  same('the counts describe every step', counts, { printings: 6, oracleRecords: 9, notCandidates: 3, onlineOnly: 1, noPrintingsKept: 1, kept: 5, withAlternateNames: 0, printingSets: 0, printingsKept: 0 });

  // The same files with two printings that carry another title, one of them in Japanese: read from files, they reach the list.
  const titledFile = gz('titled.jsonl.gz', [
    ...['Sol Ring', 'Alpha', 'Beta', 'Island'].map((n) => JSON.stringify({ oracle_id: `o-${n}`, digital: false })),
    JSON.stringify({ oracle_id: 'o-Alchemy Only', digital: true }),
    JSON.stringify({ oracle_id: 'o-Sol Ring', digital: false, name: 'Sol Ring', lang: 'en', flavor_name: 'Heart of the Mountain' }),
    JSON.stringify({ oracle_id: 'o-Beta', digital: false, name: 'Beta', lang: 'ja', printed_name: 'x', flavor_name: 'フェイタリズム' }),
  ]);
  const titled = await buildFromFiles(oracleFile, titledFile);
  same('from files, the cards with another title carry it', titled.list.filter((e) => e.f).map((e) => [e.n, e.f]), [['Beta', ['フェイタリズム']], ['Sol Ring', ['Heart of the Mountain']]]);
  check('and the count says how many', titled.counts.withAlternateNames === 2);
  same('with no titles the list is exactly what it was', titled.list.map((e) => e.n), built.map((e) => e.n));

  // Printings with a set, a number and an id: read from files, they become per-set files and the titles' printing ids.
  const printed = (n, set, number, id, over = {}) => JSON.stringify({ oracle_id: `o-${n}`, name: n, digital: false, layout: 'normal', set_type: 'expansion', set, collector_number: number, id: uuid(id), ...over });
  const printedFile = gz('printed.jsonl.gz', [
    printed('Sol Ring', 'cmm', '410', 501), printed('Sol Ring', 'cmm', '703', 502), printed('Sol Ring', 'lea', '269', 503),
    printed('Sol Ring', 'sld', '916', 599, { flavor_name: 'Heart of the Mountain' }), printed('Sol Ring', 'ltr', '1', 590, { flavor_name: 'Heart of the Mountain' }),
    printed('Island', 'znr', '266', 504), printed('Island', 'pnum', '12★', 505, { digital: true }),
    printed('Alchemy Only', 'y22', '5', 506, { digital: true }), // every printing digital: the card is not in the list, so its printing is not kept
    printed('Goblin', 'tznr', '3', 507, { layout: 'token', oracle_id: 'o-Goblin' }), // not a deck card
    printed('Memo', 'ame', '1', 508, { set_type: 'memorabilia', oracle_id: 'o-Memo' }),
    JSON.stringify({ oracle_id: 'o-Alpha', digital: false, id: uuid(509) }), // no set or number: no printing to keep
    printed('Beta', 'lea', 'has space', 510),
    printed('Sol Ring', '30a', '556', 511, { set_type: 'memorabilia' }), // a collectors' printing of a card that IS in the list: kept (same card, other art)
    JSON.stringify({ oracle_id: 'o-Sol Ring', name: 'Sol Ring', digital: false, layout: 'normal', set_type: 'expansion', set: 'cmm', id: uuid(512) }), // a set but no collector number: nothing to look it up by
    printed('Island', 'znr', 'S3', 513), printed('Island', 'znr', '268p', 514), // two numbers that are not whole numbers, typed in the wrong order
  ]);
  const withPrintings = await buildFromFiles(oracleFile, printedFile);
  const files = withPrintings.printingFiles;
  same('the sets are in order', Object.keys(files), ['30a', 'cmm', 'lea', 'ltr', 'pnum', 'sld', 'znr']);
  same('a set file maps each collector number to the printing id and the card key', files.cmm, { 410: printingValue(uuid(501), 'Sol Ring'), 703: printingValue(uuid(502), 'Sol Ring') });
  check('a printing with a star in its number is kept as typed, and a digital printing of a paper card is kept', files.pnum['12★'] === printingValue(uuid(505), 'Island'));
  check('the printing of a card that is not in the list, a token and a collectible card are left out', !files.y22 && !files.tznr && !files.ame);
  check('but a collectors\' printing of a card that is in the list is kept, with the card\'s own name as its key', files['30a']?.['556'] === printingValue(uuid(511), 'Sol Ring'));
  check('a printing with a set but no collector number is left out (it has nothing to be found by)', !JSON.stringify(files).includes(uuid(512)) && Object.keys(files.cmm).join() === '410,703');
  same('numbers that are not whole numbers are in code unit order (whole numbers come first, as in any object)', Object.keys(files.znr), ['266', '268p', 'S3']);
  check('a printing with no set and number is left out', JSON.stringify(files).indexOf(uuid(509)) === -1);
  check('a number with a space is still written here (validatePrintings is what refuses it)', files.lea['has space'] === printingValue(uuid(510), 'Beta'));
  same('the counts say how many sets and printings', [withPrintings.counts.printingSets, withPrintings.counts.printingsKept], [7, 11]);
  same('a title is paired with the printing that carries it, the smallest id when there are several', withPrintings.list.find((e) => e.n === 'Sol Ring').fp, [uuid(590)]);
  same('the title and its printing id are the same length', withPrintings.list.filter((e) => e.f).every((e) => e.f.length === e.fp.length), true);
  check('a card with no title has no fp', !('fp' in withPrintings.list.find((e) => e.n === 'Island')));
  const printedRows = [];
  for await (const row of readJsonLines(printedFile)) printedRows.push(JSON.stringify(row));
  const reversedFile = gz('printed-reversed.jsonl.gz', printedRows.reverse());
  const reversedBuild = await buildFromFiles(oracleFile, reversedFile);
  check('the same printings in the reverse order give identical bytes', serializePrintings(reversedBuild.printingFiles) === serializePrintings(files) && serializeList(reversedBuild.list) === serializeList(withPrintings.list));
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`All ${checks} card list checks passed.`);
