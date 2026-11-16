// Tests for shared/card-rules.mjs: the rules of a card, as the build writes them and the details window reads them.
import { RULES_PATH, LEGALITY_FORMATS, MAX_TEXT, shardOf, shardUrl, shardFileName, entryFromRecord, readEntry, rulesOf, legalitiesOf, splitRules, countRules, validateRules } from '../shared/card-rules.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };
const check = (label, condition, detail = '') => { checks++; if (!condition) fail(label, detail); };

// the addresses
same('the files are under /data/rules', RULES_PATH, '/data/rules');
check('a card name picks a two-character file, the same one every time', /^[0-9a-f]{2}$/.test(shardOf('Sol Ring')) && shardOf('Sol Ring') === shardOf('Sol Ring'));
same('its address', shardUrl('Sol Ring'), `/data/rules/${shardOf('Sol Ring')}.json`);
same('no address for a name that is empty, not text or too long', [shardUrl(''), shardUrl(null), shardUrl(5), shardUrl('x'.repeat(201))], [null, null, null, null]);
same('the file name of a shard, and nothing else', [shardFileName('3f'), shardFileName('3F'), shardFileName('abc'), shardFileName('../'), shardFileName(1)], ['3f.json', null, null, null, null]);

// building an entry from a Scryfall record
const SOL = { name: 'Sol Ring', type_line: 'Artifact', mana_cost: '{1}', oracle_text: '{T}: Add {C}{C}.', cmc: 1, colors: [], legalities: { standard: 'not_legal', pioneer: 'not_legal', modern: 'not_legal', legacy: 'banned', vintage: 'restricted', commander: 'legal', pauper: 'not_legal' } };
same('a plain card: its mana value, no colors, the legality letters in order and one face', entryFromRecord(SOL), { v: 1, g: 'nnnbrln', f: [{ n: 'Sol Ring', t: 'Artifact', m: '{1}', x: '{T}: Add {C}{C}.' }] });
const solved = entryFromRecord(SOL);
same('the legality line names each format', legalitiesOf(solved).map((l) => `${l.format}:${l.word}`), ['standard:Not legal', 'pioneer:Not legal', 'modern:Not legal', 'legacy:Banned', 'vintage:Restricted', 'commander:Legal', 'pauper:Not legal']);
same('a creature: power and toughness together, colors in the order WUBRG whatever order they came in', entryFromRecord({ name: 'Bant Thing', type_line: 'Creature', mana_cost: '{G}{W}{U}', oracle_text: 'Flying', power: '2', toughness: '*', cmc: 3, colors: ['U', 'G', 'W'], legalities: {} }), { v: 3, c: 'WUG', g: 'nnnnnnn', f: [{ n: 'Bant Thing', t: 'Creature', m: '{G}{W}{U}', x: 'Flying', pt: '2/*' }] });
same('a planeswalker has its loyalty and a battle its defense', [entryFromRecord({ name: 'P', type_line: 'Planeswalker', loyalty: '3', cmc: 4, legalities: {} }).f[0].l, entryFromRecord({ name: 'B', type_line: 'Battle', defense: '5', cmc: 4, legalities: {} }).f[0].d], ['3', '5']);
const two = entryFromRecord({ name: 'Front // Back', type_line: 'Creature // Creature', cmc: 3, card_faces: [{ name: 'Front', type_line: 'Creature', mana_cost: '{2}{B}', oracle_text: 'Front text', power: '3', toughness: '3', colors: ['B'] }, { name: 'Back', type_line: 'Creature', oracle_text: 'Back text', power: '5', toughness: '5', colors: ['B'] }], legalities: { standard: 'legal' } });
same('a card with two faces has both, each with its own text, and takes its colors from the front face when the record has none', [two.f.map((f) => [f.n, f.m ?? null, f.x, f.pt]), two.c, two.g], [[['Front', '{2}{B}', 'Front text', '3/3'], ['Back', null, 'Back text', '5/5']], 'B', 'lnnnnnn']);
same('five faces are fine', entryFromRecord({ name: 'A // B // C // D // E', cmc: 13, card_faces: ['A', 'B', 'C', 'D', 'E'].map((n) => ({ name: n, type_line: 'Instant', oracle_text: n })), legalities: {} }).f.length, 5);
same('a legality that is not a known word is "not legal", and a format that is missing too', entryFromRecord({ ...SOL, legalities: { standard: 'weird' } }).g, 'nnnnnnn');
same('a mana value that is not a number is 0, a half is kept', [entryFromRecord({ ...SOL, cmc: 'x' }).v, entryFromRecord({ ...SOL, cmc: 0.5 }).v, entryFromRecord({ ...SOL, cmc: -1 }).v], [0, 0.5, 0]);
check('a rules text longer than the limit is cut, not refused', entryFromRecord({ ...SOL, oracle_text: 'a'.repeat(MAX_TEXT + 500) }).f[0].x.length === MAX_TEXT);
check('a card with no text or cost has neither field', !('x' in entryFromRecord({ name: 'Vanilla', type_line: 'Creature', cmc: 0, legalities: {} }).f[0]) && !('m' in entryFromRecord({ name: 'Vanilla', type_line: 'Creature', cmc: 0, legalities: {} }).f[0]));
check('what the builder makes is always an entry the reader accepts', [SOL, two].every((record) => readEntry(entryFromRecord(record)) !== null));

// reading an entry (never trust what came over the network)
const good = { v: 2, c: 'WU', g: 'lnlnlnl', f: [{ n: 'A', t: 'Instant', m: '{1}{W}', x: 'Text', pt: '1/1', l: '3', d: '4' }] };
same('a good entry is read as it is', readEntry(good), good);
check('...as a copy, with nothing that was not asked for', readEntry(good) !== good && readEntry(good).f[0] !== good.f[0]);
const bad = {
  'not an object': 5, 'an array': [], null: null, 'an extra key': { ...good, x: 1 }, 'no mana value': { ...good, v: undefined }, 'a mana value that is text': { ...good, v: '2' }, 'a negative mana value': { ...good, v: -1 },
  'an infinite mana value': { ...good, v: Infinity }, 'a huge mana value': { ...good, v: 1e9 }, 'colors out of order': { ...good, c: 'UW' }, 'a color that is not one': { ...good, c: 'X' }, 'empty colors': { ...good, c: '' },
  'a legality line that is too short': { ...good, g: 'lnl' }, 'a legality letter that is not one': { ...good, g: 'lnlnlnx' }, 'no faces': { ...good, f: [] }, 'faces that are not a list': { ...good, f: {} }, 'nine faces': { ...good, f: Array(9).fill(good.f[0]) },
  'a face that is not an object': { ...good, f: ['x'] }, 'a face with an extra key': { ...good, f: [{ ...good.f[0], z: 1 }] }, 'a face with no name': { ...good, f: [{ t: 'Instant' }] }, 'a face with no type': { ...good, f: [{ n: 'A' }] },
  'a rules text that is too long': { ...good, f: [{ ...good.f[0], x: 'a'.repeat(MAX_TEXT + 1) }] }, 'an empty rules text': { ...good, f: [{ ...good.f[0], x: '' }] }, 'a power that is a number': { ...good, f: [{ ...good.f[0], pt: 5 }] },
};
for (const [label, value] of Object.entries(bad)) same(`${label} is refused`, readEntry(value), null);
// a shard
const shard = { 'Sol Ring': solved, Broken: { v: 'x' } };
same('the entry of a card in a shard', rulesOf(shard, 'Sol Ring'), solved);
same('a card that is not in it, a damaged entry, a name that is not text, a shard that is not an object', [rulesOf(shard, 'Nope'), rulesOf(shard, 'Broken'), rulesOf(shard, 5), rulesOf([], 'Sol Ring'), rulesOf(null, 'Sol Ring'), rulesOf('x', 'Sol Ring')], [null, null, null, null, null, null]);
same('a name like an object property is not found (nothing comes from the prototype)', ['__proto__', 'constructor', 'toString', 'hasOwnProperty'].map((name) => rulesOf({}, name)), [null, null, null, null]);

// splitting into files
const cards = { 'Alpha': entryFromRecord({ ...SOL, name: 'Alpha' }), 'Bravo': entryFromRecord({ ...SOL, name: 'Bravo' }), 'Charlie': entryFromRecord({ ...SOL, name: 'Charlie' }) };
const shards = splitRules({ cards });
check('every card is in the file its name picks, and only there', Object.keys(cards).every((name) => Object.hasOwn(shards[shardOf(name)], name)) && Object.values(shards).reduce((sum, file) => sum + Object.keys(file).length, 0) === 3);
same('the same cards always give the same files', JSON.stringify(splitRules({ cards })), JSON.stringify(shards));
same('how many cards', countRules({ cards }), 3);

// the checks before publishing
const many = (n, over = {}) => ({ cards: Object.fromEntries(Array.from({ length: n }, (_, i) => [`Card ${String(i).padStart(4, '0')}`, { ...solved, ...over }])) });
const ok = { minCards: 5, mustHave: {} };
same('enough good cards pass', validateRules(many(10), ok), []);
check('too few cards fail', validateRules(many(3), ok).some((p) => /only 3 cards/.test(p)));
check('a list that shrank by more than the limit fails', validateRules(many(10), { ...ok, previousCount: 12 }).some((p) => /fewer than the last good build/.test(p)) && validateRules(many(10), { ...ok, previousCount: 10 }).length === 0);
check('a damaged entry fails', validateRules({ cards: { ...many(10).cards, Zed: { v: 'x' } } }, ok).some((p) => /1 entries are not a rules entry/.test(p)));
check('cards out of order fail', validateRules({ cards: { B: solved, A: solved, C: solved, D: solved, E: solved } }, ok).some((p) => /out of order/.test(p)));
check('a name that is empty or too long fails', validateRules({ cards: { '': solved, ...many(9).cards } }, ok).length > 0 && validateRules({ cards: { ...many(9).cards, ['x'.repeat(201)]: solved } }, ok).some((p) => /name that is empty or too long/.test(p)));
const named = (extra) => ({ cards: { ...many(10).cards, ...extra } });
check('the real checks insist on Sol Ring and Lightning Bolt with the right words', validateRules(named({}), { minCards: 5 }).length === 2 && validateRules(named({ 'Lightning Bolt': { ...solved, f: [{ n: 'Lightning Bolt', t: 'Instant', x: 'Lightning Bolt deals 3 damage to any target.' }] } }), { minCards: 5 }).length === 1);
same('not { cards } is refused in words', [validateRules(null), validateRules([]), validateRules({}), validateRules({ cards: [] })].map((p) => p.length), [1, 1, 1, 1]);
same('every format is named once', [new Set(LEGALITY_FORMATS).size, LEGALITY_FORMATS.length], [7, 7]);

// random junk never throws and is never accepted as an entry unless it really is one
{
  let seed = 7;
  const random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const junk = () => { const roll = random(); if (roll < 0.15) return null; if (roll < 0.3) return Math.floor(random() * 1000); if (roll < 0.45) return 'x'.repeat(Math.floor(random() * 10)); if (roll < 0.6) return [random(), 'a']; return { v: random() < 0.5 ? random() : 'x', g: random() < 0.5 ? 'lllllll' : 3, f: random() < 0.5 ? [{ n: 'a', t: 'b' }] : [null], c: random() < 0.5 ? 'W' : 7 }; };
  for (let i = 0; i < 3000; i++) { const value = junk(); let entry; try { entry = readEntry(value); } catch (error) { fail('the reader never throws', String(error)); } if (entry !== null && !(value && typeof value.v === 'number' && value.g === 'lllllll' && Array.isArray(value.f))) fail('junk is not an entry', JSON.stringify(value)); }
  checks++;
}
console.log(`All ${checks} card rules checks passed.`);
