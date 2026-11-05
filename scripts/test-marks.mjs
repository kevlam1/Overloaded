// Checks shared/marks.mjs: how a typed amount is read and what a card shows about counters and its power/toughness change.
// Run from the repo root:  node scripts/test-marks.mjs
import { parseAmount, shortNumber, changeLabel, counterChips, marksSentence } from '../shared/marks.mjs';
import { NUMBER_LIMIT, COUNTER_KINDS } from '../shared/zones.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };

// ---- a typed amount ----
same('a plain number', parseAmount('5'), 5);
same('spaces around it are ignored', parseAmount('  12  '), 12);
same('commas between digits are allowed', parseAmount('1,500,000'), 1500000);
same('spaces and underscores between digits are allowed', [parseAmount('2 000'), parseAmount('3_000')], [2000, 3000]);
same('the limit itself is allowed', parseAmount('1000000000000'), NUMBER_LIMIT);
same('one past the limit is refused', parseAmount('1000000000001'), null);
same('a number with 16 digits, or 400, is refused (over the limit)', [parseAmount('1000000000000000'), parseAmount('9'.repeat(400))], [null, null]);
same('zero is refused', [parseAmount('0'), parseAmount('000')], [null, null]);
same('leading zeros are read as the number', parseAmount('007'), 7);
for (const bad of ['', '   ', '-1', '+1', '1.5', '1e9', '0x10', 'ten', '1 a', 'NaN', 'Infinity', String.fromCharCode(0x661)]) same(`"${bad}" is refused`, parseAmount(bad), null);
for (const bad of [null, undefined]) same(`${String(bad)} is refused`, parseAmount(bad), null);
same('a number given as a number is read', [parseAmount(7), parseAmount(7.5), parseAmount(-3)], [7, null, null]);

// ---- a number short enough for a label ----
same('below 10,000 it is exact', [shortNumber(0), shortNumber(7), shortNumber(9999), shortNumber(-9999)], ['0', '7', '9999', '-9999']);
same('thousands', [shortNumber(10000), shortNumber(12345), shortNumber(999000)], ['10K', '12.3K', '999K']);
same('millions, billions and a trillion', [shortNumber(4500000), shortNumber(6700000000), shortNumber(NUMBER_LIMIT)], ['4.5M', '6.7B', '1T']);
same('a negative keeps its sign', shortNumber(-4500000), '-4.5M');

// ---- the power and toughness change ----
same('nothing, nothing to show', [changeLabel({}), changeLabel({ ct: {} }), changeLabel(null), changeLabel(undefined)], ['', '', '', '']);
same('+1/+1 counters count for both', changeLabel({ ct: { p: 3 } }), '+3/+3');
same('-1/-1 counters count against both', changeLabel({ ct: { m: 2 } }), '-2/-2');
same('the modifier alone', changeLabel({ mp: 2, mt: -1 }), '+2/-1');
same('three +1/+1 counters and a +2/+0 modifier make +5/+3', changeLabel({ ct: { p: 3 }, mp: 2 }), '+5/+3');
same('a part that is 0 still shows its sign', changeLabel({ mp: 2 }), '+2/+0');
same('loyalty and other counters change nothing', changeLabel({ ct: { l: 4, c: 2, t: 1, o: 9 } }), '');
same('a change that adds up to nothing shows nothing', changeLabel({ ct: { p: 2 }, mp: -2, mt: -2 }), '');
same('the short label shortens big numbers', changeLabel({ mp: 5000000000, mt: 12000 }), '+5B/+12K');
same('the full label keeps every digit', changeLabel({ mp: 5000000000, mt: 12000 }, false), '+5,000,000,000/+12,000');

// ---- the counters ----
same('no counters, no chips', [counterChips({}), counterChips({ ct: {} }), counterChips(null)], [[], [], []]);
same('a chip for each kind in a fixed order, whatever the order stored', counterChips({ ct: { o: 1, p: 3, l: 2 } }).map((chip) => chip.kind), ['p', 'l', 'o']);
same('a chip has the word, the count and the text', counterChips({ ct: { p: 3 } }), [{ kind: 'p', word: '+1/+1', count: 3, text: '+1/+1 3' }]);
same('a big count is short in the text and exact in the count', counterChips({ ct: { c: 2500000000 } }), [{ kind: 'c', word: 'Charge', count: 2500000000, text: 'Charge 2.5B' }]);
same('a zero or missing count shows nothing', counterChips({ ct: { p: 0, m: undefined } }), []);
same('every kind has a chip', counterChips({ ct: Object.fromEntries(COUNTER_KINDS.map((kind) => [kind, 1])) }).length, COUNTER_KINDS.length);

// ---- the sentence ----
same('nothing, no sentence', marksSentence({}), '');
same('counters only', marksSentence({ ct: { l: 4 } }), 'Counters: Loyalty 4.');
same('counters and a change', marksSentence({ ct: { p: 3, o: 1 }, mp: 2 }), 'Counters: +1/+1 3, Other 1. Change: +5/+3.');
same('a change only', marksSentence({ mt: -1 }), 'Change: +0/-1.');
same('big numbers keep every digit in the sentence', marksSentence({ ct: { p: 1500000 } }), 'Counters: +1/+1 1,500,000. Change: +1,500,000/+1,500,000.');

console.log(`All ${checks} marks checks passed.`);
