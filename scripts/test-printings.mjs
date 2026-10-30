// Tests for shared/printings.mjs: the card key, the stored value, the per-set file address, and finding a printing in a set
// file without ever accepting one that belongs to another card. Known answers are written out by hand (the hash values come
// from the FNV-1a definition, not from this code). No browser, no network. Run: node scripts/test-printings.mjs
import { cardKey, printingValue, readPrintingValue, setFileUrl, setFileName, findPrinting, SET_CODE, KEY_LENGTH, PRINTINGS_PATH } from '../shared/printings.mjs';

let checks = 0;
function check(label, condition, detail = '') {
  checks++;
  if (!condition) { console.error(`FAILED: ${label} ${detail}`); process.exit(1); }
}
const same = (label, actual, expected) => check(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// ---- constants ----
check('the key is 4 characters and the path is the one the site serves', KEY_LENGTH === 4 && PRINTINGS_PATH === '/data/printings');

// ---- cardKey ----
// FNV-1a (32 bit) of "" is 0x811c9dc5 and of "a" is 0xe40c292c (the published test vectors); the key is the low 16 bits.
same('the key of nothing is the low half of the FNV offset', cardKey(''), '9dc5');
same('the key of "a" is the low half of its FNV-1a hash', cardKey('a'), '292c');
check('the key is always 4 lowercase hex characters', ['Sol Ring', 'Lim-Dûl\'s Cohort', '\u{1F409} dragon', 'Fire // Ice', '', 'x'.repeat(5000)].every((name) => /^[0-9a-f]{4}$/.test(cardKey(name))));
check('the same name always gives the same key', cardKey('Sol Ring') === cardKey('Sol Ring'));
check('a different name gives a different key (for these)', new Set(['Sol Ring', 'Island', 'Arcane Signet', 'Lightning Bolt', 'Delver of Secrets // Insectile Aberration']).size === new Set(['Sol Ring', 'Island', 'Arcane Signet', 'Lightning Bolt', 'Delver of Secrets // Insectile Aberration'].map(cardKey)).size);
check('case and spaces matter (the list name is used as it is)', cardKey('Sol Ring') !== cardKey('sol ring') && cardKey('Sol Ring') !== cardKey('Sol  Ring'));
check('a name that is not text does not crash', typeof cardKey(undefined) === 'string' && typeof cardKey(5) === 'string');

// ---- printingValue and readPrintingValue ----
const value = printingValue(uuid(1), 'Sol Ring');
check('a value is the id and then the key, 40 characters', value === `${uuid(1)}${cardKey('Sol Ring')}` && value.length === 40);
same('it reads back', readPrintingValue(value), { id: uuid(1), key: cardKey('Sol Ring') });
for (const [label, bad] of [
  ['nothing', undefined], ['null', null], ['a number', 5], ['an object', {}], ['a list', [value]], ['too short', value.slice(1)], ['too long', `${value}0`], ['no key', uuid(1)],
  ['an id with capitals', `ABCDEF01-0000-4000-8000-000000000001${cardKey('x')}`], ['a key with capitals', `${uuid(1)}ABCD`], ['a key that is not hex', `${uuid(1)}zzzz`],
  ['an id with no dashes', `${'0'.repeat(36)}abcd`], ['an id with something after it', `${uuid(1)}ab/d`], ['an address instead', `https://x.example/${'a'.repeat(22)}`],
]) check(`${label} is not a printing value`, readPrintingValue(bad) === null);

// ---- setFileUrl and setFileName ----
same('a set code gives its file', [setFileUrl('cmm'), setFileName('cmm')], ['/data/printings/set-cmm.json', 'set-cmm.json']);
same('a set named like a Windows device still gets a safe file name', [setFileName('con'), setFileName('prn'), setFileName('aux'), setFileName('nul')], ['set-con.json', 'set-prn.json', 'set-aux.json', 'set-nul.json']);
same('digits and six letters are fine', [setFileName('30a'), setFileName('abcdef'), setFileName('p03k')], ['set-30a.json', 'set-abcdef.json', 'set-p03k.json']);
check('anything that is not a set code gives no address', ['', 'ab', 'abcdefg', 'CMM', '../x', 'a/b', 'a.b', 'a b', 'cm\u0000', '%2e%2e', '..', 'cмm', null, undefined, 5, {}, ['cmm']].every((bad) => setFileUrl(bad) === null && setFileName(bad) === null));
check('the set code pattern is anchored (a code with text around it is refused)', !SET_CODE.test('xcmm\n') && !SET_CODE.test('cmm\n') && SET_CODE.test('cmm'));

// ---- findPrinting ----
const file = { 410: printingValue(uuid(11), 'Sol Ring'), 703: printingValue(uuid(12), 'Sol Ring'), '213★': printingValue(uuid(13), 'Island'), 5: 'damaged' };
check('the printing of this card is found by its number', findPrinting(file, '410', 'Sol Ring') === uuid(11) && findPrinting(file, '703', 'Sol Ring') === uuid(12));
check('a number with a star or a letter is matched exactly', findPrinting(file, '213★', 'Island') === uuid(13) && findPrinting(file, '213', 'Island') === null);
check('a number with extra zeros is another number', findPrinting(file, '0410', 'Sol Ring') === null && findPrinting(file, ' 410', 'Sol Ring') === null);
check('a number that is not in the set is not found', findPrinting(file, '999', 'Sol Ring') === null);
check('a printing of another card is refused', findPrinting(file, '410', 'Island') === null && findPrinting(file, '213★', 'Sol Ring') === null);
check('a damaged value is refused', findPrinting(file, '5', 'Sol Ring') === null);
check('no file, a file that is not an object, or no number is just not found', [null, undefined, 'x', 5].every((bad) => findPrinting(bad, '410', 'Sol Ring') === null) && findPrinting(file, undefined, 'Sol Ring') === null && findPrinting(file, 410, 'Sol Ring') === null);
check('property names of objects are not collector numbers', ['toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf'].every((number) => findPrinting(file, number, 'Sol Ring') === null));
check('a file made with a property called __proto__ in its own data still works as data', (() => { const own = JSON.parse(`{"__proto__":"${printingValue(uuid(14), 'Sol Ring')}"}`); return findPrinting(own, '__proto__', 'Sol Ring') === uuid(14); })());
check('the card is compared by the name in the list, exactly', findPrinting(file, '410', 'Sol Ring ') === null && findPrinting(file, '410', 'sol ring') === null);

console.log(`All ${checks} printings checks passed.`);
