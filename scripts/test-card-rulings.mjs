// Tests for shared/card-rulings.mjs: the rulings of a card, as the build writes them and the details window reads them.
import { RULINGS_PATH, MAX_RULING, MAX_ROWS, SOURCE_WORDS, shardOf, shardUrl, shardFileName, rowFromRecord, readRow, rulingsOf, splitRulings, countRulings, validateRulings } from '../shared/card-rulings.mjs';
import { shardOf as rulesShardOf } from '../shared/card-rules.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };
const check = (label, condition, detail = '') => { checks++; if (!condition) fail(label, detail); };

// the addresses: the same 256 files and the same key as the rules
same('the files are under /data/rulings', RULINGS_PATH, '/data/rulings');
same('a card is in the same shard for its rules and its rulings', ['Sol Ring', 'Lightning Bolt', 'Fire // Ice'].map((n) => shardOf(n) === rulesShardOf(n)), [true, true, true]);
same('its address', shardUrl('Sol Ring'), `/data/rulings/${shardOf('Sol Ring')}.json`);
same('no address for a name that is empty, not text or too long', [shardUrl(''), shardUrl(null), shardUrl(5), shardUrl('x'.repeat(201))], [null, null, null, null]);
same('the file name of a shard, and nothing else', [shardFileName('3f'), shardFileName('3F'), shardFileName('abc'), shardFileName('../')], ['3f.json', null, null, null]);

// a row from a Scryfall record
same('a Wizards ruling', rowFromRecord({ object: 'ruling', oracle_id: 'x', source: 'wotc', published_at: '2025-02-07', comment: 'Energy counters are a kind of counter.' }), ['2025-02-07', 'w', 'Energy counters are a kind of counter.']);
same('a Scryfall ruling, and a source it does not know is Scryfall\'s', [rowFromRecord({ source: 'scryfall', published_at: '2020-01-01', comment: 'a' })[1], rowFromRecord({ source: 'somebody', published_at: '2020-01-01', comment: 'a' })[1]], ['s', 's']);
same('spaces and line breaks in the text are cleaned', rowFromRecord({ source: 'wotc', published_at: '2020-01-01', comment: '  A \n\n  ruling   with\tgaps.  ' })[2], 'A ruling with gaps.');
check('a very long ruling is cut, not refused', rowFromRecord({ source: 'wotc', published_at: '2020-01-01', comment: 'a'.repeat(MAX_RULING + 50) })[2].length === MAX_RULING);
same('a record that is not a ruling gives null (no date, a bad date, no text, empty text, not an object)', [rowFromRecord({ source: 'wotc', comment: 'a' }), rowFromRecord({ source: 'wotc', published_at: '2020-1-1', comment: 'a' }), rowFromRecord({ source: 'wotc', published_at: '2020-01-01' }), rowFromRecord({ source: 'wotc', published_at: '2020-01-01', comment: '   ' }), rowFromRecord(null)], [null, null, null, null, null]);
check('what the builder makes the reader accepts', readRow(rowFromRecord({ source: 'wotc', published_at: '2020-01-01', comment: 'ok' })) !== null);

// reading a row (never trust what came over the network)
same('a good row', readRow(['2020-01-01', 'w', 'Text.']), { date: '2020-01-01', source: 'w', words: 'Wizards of the Coast', text: 'Text.' });
same('the words of the two sources', SOURCE_WORDS, { w: 'Wizards of the Coast', s: 'Scryfall' });
const bad = { 'not an array': 5, 'an object': {}, 'two items': ['2020-01-01', 'w'], 'four items': ['2020-01-01', 'w', 't', 'x'], 'a date that is not one': ['yesterday', 'w', 't'], 'a source that is not one': ['2020-01-01', 'x', 't'], 'no text': ['2020-01-01', 'w', ''], 'text that is not text': ['2020-01-01', 'w', 5], 'a text that is too long': ['2020-01-01', 'w', 'a'.repeat(MAX_RULING + 1)], null: null };
for (const [label, value] of Object.entries(bad)) same(`${label} is refused`, readRow(value), null);
const shard = { 'Sol Ring': [['2020-01-01', 'w', 'One.'], ['2020-02-02', 's', 'Two.'], 'junk', ['bad', 'w', 'x']], Many: Array.from({ length: MAX_ROWS + 20 }, (_, i) => ['2020-01-01', 'w', `r${i}`]) };
same('the rulings of a card in a shard (the bad rows dropped)', rulingsOf(shard, 'Sol Ring').map((r) => [r.date, r.source, r.text]), [['2020-01-01', 'w', 'One.'], ['2020-02-02', 's', 'Two.']]);
check('at most the limit of rows are read', rulingsOf(shard, 'Many').length === MAX_ROWS);
same('a card that is not in it, a name that is not text and a shard that is not an object have none', [rulingsOf(shard, 'Nope'), rulingsOf(shard, 5), rulingsOf([], 'Sol Ring'), rulingsOf(null, 'Sol Ring'), rulingsOf({ A: 'x' }, 'A')], [[], [], [], [], []]);
same('a name like an object property has none (nothing comes from the prototype)', ['__proto__', 'constructor', 'toString', 'hasOwnProperty'].map((n) => rulingsOf({}, n)), [[], [], [], []]);

// splitting
const cards = { Alpha: [['2020-01-01', 'w', 'a']], Bravo: [['2020-01-01', 'w', 'b'], ['2020-03-03', 's', 'c']], Charlie: [['2021-01-01', 'w', 'd']] };
const shards = splitRulings({ cards });
check('every card is in the file its name picks, and only there', Object.keys(cards).every((n) => Object.hasOwn(shards[shardOf(n)], n)) && Object.values(shards).reduce((sum, file) => sum + Object.keys(file).length, 0) === 3);
same('how many cards and rulings', countRulings({ cards }), { cards: 3, rows: 4 });

// the checks before publishing
const many = (n, rows = 1) => ({ cards: Object.fromEntries(Array.from({ length: n }, (_, i) => [`Card ${String(i).padStart(6, '0')}`, Array.from({ length: rows }, (__, r) => [`2020-01-0${r + 1}`, 'w', `Ruling ${r}.`])])) });
const ok = { minCards: 5, minRows: 5, mustHave: {} };
same('enough good rulings pass', validateRulings(many(10), ok), []);
check('too few cards or rulings fail', validateRulings(many(3), ok).some((p) => /only 3 cards/.test(p)) && validateRulings(many(3), { minCards: 1, minRows: 5, mustHave: {} }).some((p) => /only 3 rulings/.test(p)));
check('a build that shrank by more than the limit fails, one that did not passes', validateRulings(many(10), { ...ok, previousRows: 12 }).some((p) => /fewer than the last good build/.test(p)) && validateRulings(many(10), { ...ok, previousRows: 10 }).length === 0);
check('a damaged row fails', validateRulings({ cards: { ...many(10).cards, Zed: [['bad', 'w', 'x']] } }, ok).some((p) => /1 rulings are not a \[date, source, text\] row/.test(p)));
check('cards out of order fail', validateRulings({ cards: { B: cards.Alpha, A: cards.Alpha, C: cards.Alpha, D: cards.Alpha, E: cards.Alpha } }, ok).some((p) => /out of order/.test(p)));
check('rulings out of date order fail', validateRulings({ cards: { ...many(10).cards, Zzz: [['2021-01-01', 'w', 'x'], ['2020-01-01', 'w', 'y']] } }, ok).some((p) => /out of date order/.test(p)));
check('a card with an empty list fails', validateRulings({ cards: { ...many(10).cards, Zzz: [] } }, ok).some((p) => /no rulings listed/.test(p)));
check('a name that is empty or too long fails', validateRulings({ cards: { '': cards.Alpha, ...many(9).cards } }, ok).length > 0 && validateRulings({ cards: { ...many(9).cards, ['x'.repeat(201)]: cards.Alpha } }, ok).some((p) => /name that is empty or too long/.test(p)));
check('a card with too many rulings fails', validateRulings({ cards: { ...many(10).cards, Zzz: Array.from({ length: MAX_ROWS + 1 }, () => ['2020-01-01', 'w', 'x']) } }, ok).some((p) => /more than 200 rulings/.test(p)));
check('the real checks insist on Doubling Season and Humility having at least three rulings each (Sol Ring and Lightning Bolt have none in the Scryfall file)', validateRulings(many(20000, 4), { minCards: 5, minRows: 5 }).length === 2 && validateRulings({ cards: { ...many(20000, 4).cards, 'Doubling Season': many(1, 3).cards['Card 000000'], Humility: many(1, 3).cards['Card 000000'] } }, { minCards: 5, minRows: 5 }).length === 0);
same('not { cards } is refused in words', [validateRulings(null), validateRulings([]), validateRulings({}), validateRulings({ cards: [] })].map((p) => p.length), [1, 1, 1, 1]);

// random junk never throws
{
  let seed = 11;
  const random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const junk = () => { const roll = random(); if (roll < 0.2) return null; if (roll < 0.4) return Math.floor(random() * 100); if (roll < 0.6) return [random(), 'w', 3]; if (roll < 0.8) return ['2020-01-01', random() < 0.5 ? 'w' : 'q', random() < 0.5 ? 'ok' : '']; return ['2020-01-01', 'w', 'x'.repeat(Math.floor(random() * 10))]; };
  for (let i = 0; i < 3000; i++) { const value = junk(); let row; try { row = readRow(value); } catch (error) { fail('the reader never throws', String(error)); } if (row !== null && !(Array.isArray(value) && value[1] === 'w' && typeof value[2] === 'string' && value[2].length > 0)) fail('junk is not a row', JSON.stringify(value)); }
  checks++;
}
console.log(`All ${checks} card rulings checks passed.`);
