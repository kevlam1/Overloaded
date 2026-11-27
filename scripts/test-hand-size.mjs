// Checks shared/hand-size.mjs: the hand card size setting.
import assert from 'node:assert/strict';
import { cleanSize, readSize, writeSize, sizeScale, sizeWords, DEFAULT_SIZE, MIN_SIZE, MAX_SIZE } from '../shared/hand-size.mjs';

let checks = 0;
const check = (name, fn) => { fn(); checks += 1; };

check('nothing or junk gives the default', () => { assert.equal(readSize(null), DEFAULT_SIZE); assert.equal(readSize('big'), DEFAULT_SIZE); assert.equal(cleanSize(NaN), DEFAULT_SIZE); });
check('kept in range', () => { assert.equal(cleanSize(10), MIN_SIZE); assert.equal(cleanSize(900), MAX_SIZE); });
check('rounded to the step', () => { assert.equal(cleanSize(124), 120); assert.equal(readSize('136'), 140); });
check('written as it is read', () => { assert.equal(writeSize(133), '130'); assert.equal(readSize(writeSize(133)), 130); });
check('the scale and the words', () => { assert.equal(sizeScale(120), 1.2); assert.equal(sizeWords(80), '80%'); });

console.log(`All hand size checks passed (${checks}).`);
