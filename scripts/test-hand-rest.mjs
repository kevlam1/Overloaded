// Tests for shared/hand-rest.mjs: how much of a card shows when the hand is resting, and the setting that keeps it.
import { REST_KEY, DEFAULT_REST_VISIBLE, MIN_REST_VISIBLE, MAX_REST_VISIBLE, REST_STEP, cleanRestVisible, readRestVisible, writeRestVisible, restHiddenShare, restWords } from '../shared/hand-rest.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };

same('the setting is kept under its own name', REST_KEY, 'overloaded.handRest');
same('the default is half a card showing, in steps of 5 between 20 and 100', [DEFAULT_REST_VISIBLE, REST_STEP, MIN_REST_VISIBLE, MAX_REST_VISIBLE], [50, 5, 20, 100]);

// cleaning
same('a number on a step stays', [20, 35, 50, 75, 100].map(cleanRestVisible), [20, 35, 50, 75, 100]);
same('a number between steps is rounded to the nearest step', [52, 53, 47, 48, 62.4, 62.5].map(cleanRestVisible), [50, 55, 45, 50, 60, 65]);
same('a number too small or too large is brought to the least or the most', [0, 10, 19, -50, 101, 150, 100000].map(cleanRestVisible), [20, 20, 20, 20, 100, 100, 100]);
same('a number written as text works too', ['50', ' 65 ', '72'].map(cleanRestVisible), [50, 65, 70]);
same('anything that is not a number is the default', [null, undefined, '', '  ', 'half', NaN, Infinity, -Infinity, {}, [], true, '5e', '1,5'].map(cleanRestVisible), Array(13).fill(50));

// reading and writing
same('the saved text is read back', [readRestVisible('50'), readRestVisible('100'), readRestVisible('20'), readRestVisible('35')], [50, 100, 20, 35]);
same('nothing saved, or damaged text, reads as the default', [readRestVisible(null), readRestVisible(undefined), readRestVisible(''), readRestVisible('{"visible":80}'), readRestVisible('abc'), readRestVisible(7)], [50, 50, 50, 50, 50, 50]);
same('a saved number outside the range is brought into it', [readRestVisible('5'), readRestVisible('500')], [20, 100]);
same('writing gives plain text of the cleaned number', [writeRestVisible(65), writeRestVisible(63), writeRestVisible(1), writeRestVisible('x'), writeRestVisible(undefined)], ['65', '65', '20', '50', '50']);
same('what is written is read back as the same number', [20, 25, 50, 80, 100].map((v) => readRestVisible(writeRestVisible(v))), [20, 25, 50, 80, 100]);

// the share below the window edge
same('half showing is half below the bottom edge, the old setting (75% showing) a quarter, all showing none, the least showing four fifths', [50, 75, 100, 20].map(restHiddenShare), [0.5, 0.25, 0, 0.8]);
same('the share is cleaned first (a value outside the range is brought into it, junk is the default)', [restHiddenShare(0), restHiddenShare(500), restHiddenShare('x'), restHiddenShare(undefined)], [0.8, 0, 0.5, 0.5]);
same('the shares have no rounding noise (a multiple of 0.05)', [20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100].every((v) => Number.isInteger(Math.round(restHiddenShare(v) * 100)) && Math.abs(restHiddenShare(v) * 100 - Math.round(restHiddenShare(v) * 100)) < 1e-9), true);

// words
same('what the slider says', [restWords(50), restWords(100), restWords(33), restWords('x')], ['50% of a card shows', '100% of a card shows', '35% of a card shows', '50% of a card shows']);

console.log(`All ${checks} hand rest checks passed.`);
