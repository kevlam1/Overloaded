// Stress, fuzz and comparison tests for shared/card-match.mjs (2026-10-28 edge-case pass).
//  - normalizeName must be fast on any input (an earlier version took time growing with the square of the length on long
//    runs of spaces) and must give the SAME answers as that earlier version on everything that version could handle;
//  - the matcher must treat awkward names (like __proto__) as ordinary names;
//  - the batch lookup list must keep its promises (each spelling once, never more than 75).
// Seeded, so a failure can be repeated. Run: node scripts/test-card-match-fuzz.mjs
import { normalizeName, buildCardIndex, matchEntry, matchDeck, MAX_FALLBACK } from '../shared/card-match.mjs';

let checks = 0;
function check(label, condition, detail = '') {
  if (!condition) { console.error(`FAILED: ${label}${detail ? ` (${detail})` : ''}`); process.exit(1); }
  checks++;
}
const c = (...codes) => String.fromCodePoint(...codes);
let seed = 20261028;
const next = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const pick = (list) => list[Math.floor(next() * list.length)];
const timed = (fn) => { const start = performance.now(); const value = fn(); return { value, ms: performance.now() - start }; };

// The earlier normalizer, kept here only to compare answers (it is slow on long runs of spaces, which is why it was replaced).
const MARKS = new RegExp('[' + c(0x300) + '-' + c(0x36f) + ']', 'g');
const oldNormalizeName = (name) => name
  .normalize('NFD').replace(MARKS, '').replaceAll(c(0xc6), 'Ae').replaceAll(c(0xe6), 'ae')
  .replace(new RegExp('[' + c(0x2018, 0x2019) + ']', 'g'), "'").replace(new RegExp('[' + c(0x201c, 0x201d) + ']', 'g'), '"')
  .replaceAll(c(0xa789), ':').replace(/\s*\/\/?\s*/g, ' // ').replace(/\s+/g, ' ').trim().toLowerCase();

// ---- 1. Same answers as before, on 40,000 random short strings from a pool of awkward pieces ----
{
  const pool = ['a', 'B', 'x', ' ', '  ', '\t', '\n', c(0xA0), '/', '//', '///', ' // ', ' / ', '/ ', ' /', c(0xC6), c(0xE6), c(0x2019), c(0x201C), c(0xE9), 'e' + c(0x301), c(0xA789), '-', ',', "'", '"', '1', c(0x1F40D), c(0x2028), c(0xFEFF), c(0x3000)];
  let different = ''; let count = 0;
  for (let i = 0; i < 40000 && !different; i++) {
    let s = ''; const n = Math.floor(next() * 14);
    for (let j = 0; j < n; j++) s += pick(pool);
    count++;
    if (normalizeName(s) !== oldNormalizeName(s)) different = JSON.stringify(s) + ' -> new ' + JSON.stringify(normalizeName(s)) + ' old ' + JSON.stringify(oldNormalizeName(s));
  }
  check(`the new normalizer gives the same answer as the old one on ${count} random strings`, !different, different);
  // And on the names that matter: every kind of real name the audits found
  const real = ['Sol Ring', 'Fire // Ice', 'Fire/Ice', 'Fire / Ice', 'Fire //Ice', "Lim-D" + c(0xFB) + "l" + c(0x2019) + "s Vault", 'J' + c(0xE4) + 'ger', c(0xC6) + 'ther Vial', 'B' + c(0xFB) + 'rn', 'Kongming, ' + c(0x201C) + 'Sleeping Dragon' + c(0x201D), 'Brisela, Voice of Nightmares // Brisela, Voice of Nightmares', 'Who' + c(0xA789) + ' What', 'Bind // Liberate'];
  check('and on the kinds of real card names the audits found', real.every((name) => normalizeName(name) === oldNormalizeName(name)));
}

// ---- 2. Properties that must always hold ----
{
  const pool = ['a', 'Z', ' ', '\t', '/', '//', c(0xC6), c(0x2019), c(0xE9), 'e' + c(0x301), '-', '1', c(0x1F40D), c(0xA0)];
  let bad = '';
  for (let i = 0; i < 20000 && !bad; i++) {
    let s = ''; const n = Math.floor(next() * 20);
    for (let j = 0; j < n; j++) s += pick(pool);
    const out = normalizeName(s);
    if (normalizeName(out) !== out) bad = 'not idempotent: ' + JSON.stringify(s);
    else if (out !== out.trim() || /\s\s/.test(out) || /\t|\n/.test(out)) bad = 'not trimmed or collapsed: ' + JSON.stringify(s);
    else if (out !== out.toLowerCase()) bad = 'not lower case: ' + JSON.stringify(s);
    else if (/ \/ (?!\/)/.test(out.replace(/ \/\/ /g, '|'))) bad = 'a lone slash survived: ' + JSON.stringify(s);
  }
  check('20,000 random names: normalizing twice changes nothing, and the result is trimmed, collapsed and lower case', !bad, bad);
  check('Fire/Ice, Fire / Ice and Fire // Ice are one key', normalizeName('Fire/Ice') === normalizeName('Fire / Ice') && normalizeName('Fire / Ice') === normalizeName('Fire // Ice'));
  check('accents, ligatures and curly quotes fold to plain letters', normalizeName('J' + c(0xE4) + 'ger') === 'jager' && normalizeName(c(0xC6) + 'ther') === 'aether' && normalizeName("Lim-D" + c(0xFB) + "l" + c(0x2019) + "s") === "lim-dul's");
  check('a name that is only spaces and slashes does not crash', typeof normalizeName(' / // / ') === 'string');
  check('an empty name is an empty key', normalizeName('') === '' && normalizeName('   ') === '');
}

// ---- 3. Crafted names must not make it slow ----
{
  const budgetMs = 500; // generous: normal names take a microsecond; this only catches a real blow-up
  const cases = {
    '100,000 spaces between two letters': 'x' + ' '.repeat(100000) + 'y',
    '100,000 tabs and spaces alternating': ' \t'.repeat(50000),
    '100,000 slashes': '/'.repeat(100000),
    '100,000 spaced slashes': ' / '.repeat(33000),
    '100,000 letters': 'a'.repeat(100000),
    '100,000 combining accents': 'e' + c(0x301).repeat(100000),
    '100,000 ligatures': c(0xC6).repeat(100000),
    'spaces around slashes, 30,000 times': ' '.repeat(5) + ('a   /   ').repeat(12000),
    'a million spaces': ' '.repeat(1_000_000),
  };
  for (const [label, text] of Object.entries(cases)) {
    const { ms } = timed(() => normalizeName(text));
    check(`${label}: ${ms.toFixed(1)} ms`, ms < budgetMs, `${ms.toFixed(0)} ms`);
  }
}

// ---- 4. The matcher with awkward names ----
{
  const cards = [
    { n: 'Sol Ring', i: '1' }, { n: 'Fire // Ice', i: '2' }, { n: 'Bind // Liberate', i: '3' }, { n: 'Bind', i: '4' },
    { n: 'Island', i: '5' }, { n: 'Island', i: '6' }, { n: 'Who' + c(0xA789) + ' What', i: '7' },
  ];
  const index = buildCardIndex(cards);
  const entry = (name) => ({ qty: 1, name, section: 'main', line: 1, block: 0, set: null, number: null, foil: false });
  for (const name of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf', 'prototype', '__defineGetter__']) {
    const r = matchEntry(index, entry(name));
    check(`the name "${name}" is just a name: not found, and nothing strange happens`, r.status === 'not_found' && r.card === null && r.candidates.length === 0);
  }
  check('the whole name wins over a front face (Bind is the card Bind)', matchEntry(index, entry('Bind')).card.i === '4');
  check('a front face alone matches a two-faced card', matchEntry(index, entry('Fire')).method === 'front' && matchEntry(index, entry('Fire')).card.i === '2');
  check('a back face alone is only a suggestion', matchEntry(index, entry('Ice')).status === 'suggestion');
  check('a name shared by two cards is ambiguous and lists both', (() => { const r = matchEntry(index, entry('Island')); return r.status === 'ambiguous' && r.candidates.length === 2; })());
  check('the modifier colon matches the ordinary colon', matchEntry(index, entry('Who: What')).card?.i === '7');
  check('upper case, accents and extra spaces still match', matchEntry(index, entry('  SOL   ring ')).card?.i === '1' && matchEntry(index, entry('sol ring')).status === 'matched');
  check('an empty name is not found, not a crash', matchEntry(index, entry('')).status === 'not_found');
  check('a name that is only slashes is not found, not a crash', matchEntry(index, entry('////')).status === 'not_found');
  check('an index built from no cards matches nothing', matchEntry(buildCardIndex([]), entry('Sol Ring')).status === 'not_found');
}

// ---- 5. The batch lookup list keeps its promises ----
{
  const index = buildCardIndex([{ n: 'Sol Ring', i: '1' }]);
  const make = (names) => names.map((name, i) => ({ qty: 1, name, section: 'main', line: i + 1, block: 0, set: null, number: null, foil: false }));
  const many = make(Array.from({ length: 300 }, (_, i) => `Unknown Card ${i}`));
  const deck = matchDeck(index, many);
  check('300 unknown names: at most 75 are sent for the batch lookup', deck.fallbackNames.length === MAX_FALLBACK && MAX_FALLBACK === 75);
  check('and it says some were left out', deck.fallbackOverflow === true);
  check('exactly 75 unknown names is not an overflow', matchDeck(index, make(Array.from({ length: 75 }, (_, i) => `U ${i}`))).fallbackOverflow === false);
  const repeated = matchDeck(index, make(['Zzz Card', 'zzz card', 'ZZZ  CARD', 'Zzz  Card ']));
  check('the same unknown name spelled four ways is sent once', repeated.fallbackNames.length === 1 && repeated.counts.not_found === 4);
  check('the first spelling is the one sent', repeated.fallbackNames[0] === 'Zzz Card');
  const mixed = matchDeck(index, make(['Sol Ring', 'Nope', 'Sol Ring']));
  check('known cards are never sent for lookup', mixed.fallbackNames.join() === 'Nope' && mixed.counts.matched === 2 && mixed.counts.not_found === 1);
  const none = matchDeck(index, []);
  check('an empty deck gives empty results', none.results.length === 0 && none.fallbackNames.length === 0 && !none.fallbackOverflow);
}

console.log(`All ${checks} card match stress checks passed.`);
