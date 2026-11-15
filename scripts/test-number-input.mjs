// Tests for shared/number-input.mjs: what is typed into the "X" box of a menu line.
import { parseCount, startingCount, COUNT_LIMIT } from '../shared/number-input.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };

same('a whole number in range is read', parseCount('7'), { ok: true, value: 7 });
same('spaces round it are ignored', parseCount('  12 '), { ok: true, value: 12 });
same('the smallest and the biggest allowed are fine', [parseCount('1').ok, parseCount(String(COUNT_LIMIT)).ok, parseCount('5', { min: 5, max: 9 }).ok, parseCount('9', { min: 5, max: 9 }).ok], [true, true, true, true]);
same('leading zeros are the same number', parseCount('007'), { ok: true, value: 7 });
same('nothing typed asks for a number', [parseCount(''), parseCount('   '), parseCount(null), parseCount(undefined)].map((r) => r.message), ['Type a number.', 'Type a number.', 'Type a number.', 'Type a number.']);
for (const text of ['3.5', '-2', '+3', '1e3', 'abc', '3x', '0x10', '1,000', '٣', '３']) same(`"${text}" is not a whole number`, parseCount(text).ok, false);
same('zero is below the smallest of 1', parseCount('0'), { ok: false, message: 'The smallest number is 1.' });
same('under a larger minimum it says the minimum', parseCount('2', { min: 5 }), { ok: false, message: 'The smallest number is 5.' });
same('over the maximum says the most', parseCount('41', { max: 40 }), { ok: false, message: 'The most is 40.' });
same('over the default limit says the limit', parseCount('1000'), { ok: false, message: 'The most is 999.' });
same('a very long number is refused, not turned into a huge one', parseCount('9'.repeat(30)).ok, false);
same('a maximum below the minimum is treated as the minimum', [parseCount('1', { min: 1, max: 0 }).ok, parseCount('2', { min: 1, max: 0 }).message], [true, 'The most is 1.']);
same('bad limits fall back to 1 and the default', parseCount('3', { min: 'x', max: 'y' }), { ok: true, value: 3 });
same('the starting number is the last one when it fits', startingCount('5', { max: 40 }), 5);
same('it falls back to the smallest when the last one is too big, too small, or not a number', [startingCount(50, { max: 40 }), startingCount(0), startingCount('abc'), startingCount(null), startingCount(2.5), startingCount(undefined, { min: 2 })], [1, 1, 1, 1, 1, 2]);
console.log(`All ${checks} number input checks passed.`);
