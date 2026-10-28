// Tests for shared/table-code.mjs. Run: node scripts/test-table-code.mjs
import { CODE_ALPHABET, CODE_LENGTH, makeTableCode, isValidCode, normalizeCode } from '../shared/table-code.mjs';

let checks = 0;
function check(label, condition) {
  if (!condition) { console.error('FAILED:', label); process.exit(1); }
  checks++;
}

// The alphabet
check('alphabet has 32 characters', CODE_ALPHABET.length === 32);
check('alphabet characters are all different', new Set(CODE_ALPHABET).size === 32);
for (const bad of ['0', 'O', '1', 'I']) check(`alphabet has no look-alike ${bad}`, !CODE_ALPHABET.includes(bad));
check('alphabet is upper-case letters and digits only', /^[A-Z2-9]+$/.test(CODE_ALPHABET));
check('code length is 6', CODE_LENGTH === 6);

// Generated codes (real random source)
const seen = new Set();
const characterCounts = new Map();
for (let i = 0; i < 20000; i++) {
  const code = makeTableCode();
  check('generated code has the right length', code.length === 6);
  check('generated code is valid', isValidCode(code));
  seen.add(code);
  for (const character of code) characterCounts.set(character, (characterCounts.get(character) || 0) + 1);
}
check('20000 codes are almost all different', seen.size > 19990);
check('every alphabet character appears', [...CODE_ALPHABET].every((c) => characterCounts.has(c)));
const expected = (20000 * 6) / 32; // 3750 each
check('characters are spread evenly (each within 15 percent of the expected count)',
  [...characterCounts.values()].every((n) => Math.abs(n - expected) < expected * 0.15));

// With a fixed random source the result is exactly predictable (this is what proves the mapping, not just its shape)
check('bytes 0..5 give the first six characters', makeTableCode(() => new Uint8Array([0, 1, 2, 3, 4, 5])) === 'ABCDEF');
check('only the low 5 bits count (byte 33 is 1 plus 32)', makeTableCode(() => new Uint8Array([33, 33, 33, 33, 33, 33])) === 'BBBBBB');
check('the top of the range maps to the last character', makeTableCode(() => new Uint8Array([31, 255, 31, 255, 31, 255])) === '999999');
check('asks the random source for exactly 6 bytes', (() => { let asked = 0; makeTableCode((n) => { asked = n; return new Uint8Array(n); }); return asked === 6; })());

// Validation
check('a good code is valid', isValidCode('ABC234'));
check('too short is invalid', !isValidCode('ABC23'));
check('too long is invalid', !isValidCode('ABC2345'));
check('lower case is invalid before normalizing', !isValidCode('abc234'));
for (const bad of ['ABC230', 'ABCO34', 'ABC134', 'ABCI34', 'ABC 34', 'ABC-34', 'ABC23\n']) check(`invalid character in ${JSON.stringify(bad)}`, !isValidCode(bad));
check('not a string is invalid', !isValidCode(undefined) && !isValidCode(null) && !isValidCode(123456));
check('empty is invalid', !isValidCode(''));

// Normalizing what a person typed
check('upper-cases', normalizeCode('abc234') === 'ABC234');
check('removes spaces and dashes', normalizeCode(' ab c-23 4 ') === 'ABC234');
check('removes a newline from a paste', normalizeCode('ABC234\n') === 'ABC234');
check('does not turn O into 0 or 0 into O', normalizeCode('abco34') === 'ABCO34' && !isValidCode(normalizeCode('abco34')));
check('handles missing input', normalizeCode(undefined) === '' && normalizeCode(null) === '');
check('a normalized good code is valid', isValidCode(normalizeCode(' abc-234 ')));

console.log(`All ${checks} table code checks passed.`);
