// Tests for shared/game-history.mjs.
import { MAX_ENTRIES, MAX_LENGTH, cleanEntry, addEntry } from '../shared/game-history.mjs';

let checks = 0;
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) { console.log(`FAILED CHECK: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); process.exit(1); } };

same('text is tidied: spaces and control characters become one space', cleanEntry('  Played   Sol\tRing.\n'), 'Played Sol Ring.');
same('text that is not text, or is empty, gives nothing', [cleanEntry(7), cleanEntry(null), cleanEntry('   ')], ['', '', '']);
same('text is cut to 100 letters', cleanEntry('x'.repeat(300)).length, MAX_LENGTH);
const one = Object.freeze(addEntry(Object.freeze([]), 'Drew Island.', 2));
same('an entry is added at the end with its turn, and the old list is not changed', [one, addEntry([], 'a', 1)], [[{ turn: 2, text: 'Drew Island.' }], [{ turn: 1, text: 'a' }]]);
same('a turn that is not a whole number from 1 is turn 1', [0, -2, 1.5, 'x', undefined].map((t) => addEntry([], 'a', t)[0].turn), [1, 1, 1, 1, 1]);
same('an entry with no text is not added (the same list)', (() => { const list = [{ turn: 1, text: 'a' }]; return addEntry(list, '  ', 1) === list; })(), true);
same('the list keeps the newest 200', (() => { let list = []; for (let n = 1; n <= 250; n++) list = addEntry(list, `m${n}`, 1); return [list.length, list[0].text, list.at(-1).text]; })(), [MAX_ENTRIES, 'm51', 'm250']);
console.log(`All ${checks} game history checks passed.`);
