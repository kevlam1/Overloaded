// Tests for shared/card-prints.mjs: where a card's printings are, reading them safely, and the checks a build makes.
import { shardOf, shardUrl, shardFileName, setsUrl, readRow, printingsOf, setInfo, validatePrints, countPrints, splitPrints, PRINTS_PATH, MAX_NAME } from '../shared/card-prints.mjs';
import { cardKey } from '../shared/printings.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };
const check = (label, condition, detail = '') => { checks++; if (!condition) fail(label, detail); };

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// where things are
same('a card is in the file named by the first two characters of its key', [shardOf('Sol Ring'), shardOf('Sol Ring') === cardKey('Sol Ring').slice(0, 2), shardUrl('Sol Ring')], [cardKey('Sol Ring').slice(0, 2), true, `${PRINTS_PATH}/${cardKey('Sol Ring').slice(0, 2)}.json`]);
same('there are at most 256 files and a name always gets one', new Set(['Sol Ring', 'Lightning Bolt', 'Island', 'Valakut Awakening // Valakut Stoneforge', 'Éowyn, Lady of Rohan', '_____'].map(shardOf)).size <= 6 && /^[0-9a-f]{2}$/.test(shardOf('anything')), true);
same('no address for a name that is empty, too long or not text', [shardUrl(''), shardUrl('x'.repeat(MAX_NAME + 1)), shardUrl(5), shardUrl(null)], [null, null, null, null]);
same('file names', [shardFileName('0a'), shardFileName('ff'), shardFileName('0A'), shardFileName('abc'), shardFileName('../'), shardFileName(5)], ['0a.json', 'ff.json', null, null, null, null]);
same('the sets file', setsUrl(), '/data/prints/sets.json');

// reading rows
same('a good row', readRow(['cmm', '410', id(1)]), { set: 'cmm', number: '410', id: id(1) });
same('bad rows are refused', [readRow(null), readRow([]), readRow(['cmm', '410']), readRow(['CMM', '410', id(1)]), readRow(['cmm', '', id(1)]), readRow(['cmm', '4 10', id(1)]), readRow(['cmm', '4/10', id(1)]), readRow(['cmm', '410', 'not-an-id']), readRow(['cmm', 410, id(1)]), readRow(['../x', '1', id(1)]), readRow(['cmm', 'x'.repeat(31), id(1)])], Array(11).fill(null));
const shard = { 'Sol Ring': [['cmm', '410', id(1)], ['bad'], ['c21', '263', id(2)]], 'Island': 'nope' };
same('the printings of a card, newest first as stored, bad rows dropped', printingsOf(shard, 'Sol Ring'), [{ set: 'cmm', number: '410', id: id(1) }, { set: 'c21', number: '263', id: id(2) }]);
same('a card that is not there, a damaged entry and bad input give none', [printingsOf(shard, 'Mox Pearl'), printingsOf(shard, 'Island'), printingsOf(null, 'Sol Ring'), printingsOf([], 'Sol Ring'), printingsOf(shard, 5), printingsOf(shard, '__proto__'), printingsOf(shard, 'constructor')], [[], [], [], [], [], [], []]);
const sets = { cmm: ['Commander Masters', '2023-08-04'], bad: ['', '2020-01-01'] };
same('a set\'s name and year, or its code when it is not known', [setInfo(sets, 'cmm'), setInfo(sets, 'zzz'), setInfo(sets, 'bad'), setInfo(null, 'cmm'), setInfo({ cmm: ['X', 'nope'] }, 'cmm')], [{ name: 'Commander Masters', year: '2023' }, { name: 'ZZZ', year: '' }, { name: 'BAD', year: '' }, { name: 'CMM', year: '' }, { name: 'X', year: '' }]);

// the build's checks
const good = { sets: { c21: ['Commander 2021', '2021-04-23'], cmm: ['Commander Masters', '2023-08-04'] }, cards: { 'Island': [['c21', '1', id(3)]], 'Sol Ring': [['cmm', '410', id(1)], ['c21', '263', id(2)]] } };
const small = { minCards: 2, minRows: 3 };
same('a good set of printings passes', validatePrints(good, small), []);
const problem = (mutate, options = small) => { const copy = structuredClone(good); mutate(copy); return validatePrints(copy, options); };
check('too few cards or rows are refused', validatePrints(good, { minCards: 3, minRows: 3 }).length > 0 && validatePrints(good, { minCards: 2, minRows: 4 }).length > 0);
check('a shrink of more than 5% is refused, a smaller one is not', validatePrints(good, { ...small, previousRows: 4 }).length > 0 && validatePrints(good, { ...small, previousRows: 3 }).length === 0);
check('a bad row, an empty list, an unknown set, a bad set, a bad name and an unordered list are each refused', problem((p) => { p.cards['Island'][0][2] = 'x'; }).length > 0 && problem((p) => { p.cards['Island'] = []; }).length > 0 && problem((p) => { p.cards['Island'][0][0] = 'zzz'; }).length > 0 && problem((p) => { p.sets.cmm = ['', '2023-08-04']; }).length > 0 && problem((p) => { p.sets.cmm = ['Commander Masters', 'sometime']; }).length > 0 && problem((p) => { p.cards[''] = [['cmm', '1', id(5)]]; }).length > 0 && problem((p) => { const c = p.cards; p.cards = { 'Sol Ring': c['Sol Ring'], 'Island': c['Island'] }; }).length > 0);
same('input that is not the shape is refused', [validatePrints(null).length > 0, validatePrints({}).length > 0, validatePrints({ sets: [], cards: {} }).length > 0, validatePrints({ sets: {}, cards: [] }).length > 0], [true, true, true, true]);
same('the counts', countPrints(good), { cards: 2, rows: 3, sets: 2 });
const split = splitPrints(good);
same('the files: each card in the file its name picks, names kept in order, the sets file whole', [Object.keys(split.shards).every((s) => /^[0-9a-f]{2}$/.test(s)), Object.values(split.shards).reduce((n, f) => n + Object.keys(f).length, 0), split.shards[shardOf('Sol Ring')]['Sol Ring'].length, split.sets === good.sets], [true, 2, 2, true]);

console.log(`All ${checks} card prints checks passed.`);
