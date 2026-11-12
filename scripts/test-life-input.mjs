// Tests for shared/life-input.mjs: what a click, a key or a typed number does to the life total.
import { lifeDelta, lifeKeyDelta, parseLife, HOLD_MS, BIG_STEP, LIFE_HINT } from '../shared/life-input.mjs';
import { NUMBER_LIMIT } from '../shared/zones.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };

// clicks
same('left click gains 1', lifeDelta({ button: 0 }), 1);
same('right click loses 1', lifeDelta({ button: 2 }), -1);
same('shift and left click gains 5', lifeDelta({ button: 0, shiftKey: true }), 5);
same('shift and right click loses 5', lifeDelta({ button: 2, shiftKey: true }), -5);
same('the middle button does nothing', lifeDelta({ button: 1 }), null);
same('a click with no details is a left click', lifeDelta(), 1);
same('the big step is 5', BIG_STEP, 5);

// keys
same('arrow up gains 1', lifeKeyDelta('ArrowUp'), 1);
same('arrow right gains 1', lifeKeyDelta('ArrowRight'), 1);
same('arrow down loses 1', lifeKeyDelta('ArrowDown'), -1);
same('arrow left loses 1', lifeKeyDelta('ArrowLeft'), -1);
same('shift and arrow up gains 5', lifeKeyDelta('ArrowUp', true), 5);
same('shift and arrow down loses 5', lifeKeyDelta('ArrowDown', true), -5);
same('another key is not ours', lifeKeyDelta('a'), null);
same('Enter is not a change (it opens the box to type in)', lifeKeyDelta('Enter'), null);

// typed totals
same('a plain number', parseLife('20'), 20);
same('spaces around it are ignored', parseLife('  40 '), 40);
same('zero is allowed', parseLife('0'), 0);
same('a negative total is allowed (life can go below 0)', parseLife('-3'), -3);
same('the real minus sign is accepted', parseLife('\u22123'), -3);
same('a plus sign is accepted', parseLife('+7'), 7);
same('the limit itself is accepted', parseLife(String(NUMBER_LIMIT)), NUMBER_LIMIT);
same('one past the limit is refused', parseLife(String(NUMBER_LIMIT + 1)), null);
same('the negative limit is accepted', parseLife(String(-NUMBER_LIMIT)), -NUMBER_LIMIT);
same('a decimal is refused', parseLife('1.5'), null);
same('words are refused', parseLife('abc'), null);
same('an empty box is refused', parseLife(''), null);
same('only a sign is refused', parseLife('-'), null);
same('a number with a word after it is refused', parseLife('12 life'), null);
same('exponent notation is refused', parseLife('1e3'), null);
same('hex is refused', parseLife('0x10'), null);
same('nothing is refused', parseLife(undefined), null);
same('a number too long to be safe is refused', parseLife('9'.repeat(16)), null);

// the hold and the hint
same('the hold lasts about half a second', HOLD_MS >= 400 && HOLD_MS <= 1000, true);
same('the hint explains every way', ['Click', 'right-click', 'Shift', 'hold', 'arrow', 'Enter'].every((word) => LIFE_HINT.includes(word)), true);

console.log(`All ${checks} life input checks passed.`);
