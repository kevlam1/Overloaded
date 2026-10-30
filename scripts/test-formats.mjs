// Tests for shared/formats.mjs: the two formats a table can be for, and the check that refuses anything else.
import { FORMATS, FORMAT_TITLES, DEFAULT_FORMAT, readFormat, formatTitle } from '../shared/formats.mjs';
import * as library from '../shared/deck-library.mjs';

let checks = 0;
const same = (label, actual, expected) => {
  checks++;
  if (actual !== expected) { console.log(`FAILED CHECK: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); process.exit(1); }
};
const refused = (label, value) => {
  checks++;
  try { readFormat(value); } catch (error) { if (error instanceof Error && /Commander, Standard/.test(error.message)) return; console.log(`FAILED CHECK: ${label}: refused with the wrong message: ${error.message}`); process.exit(1); }
  console.log(`FAILED CHECK: ${label}: ${JSON.stringify(value)} was accepted`); process.exit(1);
};

// Written out here, not read from the module, so changing the module's list also fails this test.
same('the formats are Commander and Standard, in that order', FORMATS.join(), 'commander,standard');
same('the titles', `${FORMAT_TITLES.commander}|${FORMAT_TITLES.standard}`, 'Commander|Standard');
same('Commander is the default', DEFAULT_FORMAT, 'commander');
same('the deck library uses the same list', library.FORMATS, FORMATS);
same('the deck library uses the same titles', library.FORMAT_TITLES, FORMAT_TITLES);

same('commander is accepted and returned as it is', readFormat('commander'), 'commander');
same('standard is accepted and returned as it is', readFormat('standard'), 'standard');

refused('a capital letter', 'Commander');
refused('all capitals', 'STANDARD');
refused('a trailing space', 'commander ');
refused('a leading space', ' standard');
refused('an empty text', '');
refused('a format that does not exist yet', 'modern');
refused('an inherited name', 'constructor');
refused('another inherited name', '__proto__');
refused('undefined', undefined);
refused('null', null);
refused('a number', 1);
refused('an array holding a format', ['commander']);
refused('an object', { toString: () => 'commander' });

same('the words for commander', formatTitle('commander'), 'Commander');
same('the words for standard', formatTitle('standard'), 'Standard');
same('another client could write any text: it shows as it is', formatTitle('<b>x</b>'), '<b>x</b>');
same('an inherited name is shown as text, not looked up', formatTitle('constructor'), 'constructor');
same('nothing stored shows as nothing', formatTitle(undefined), '');
same('null shows as nothing', formatTitle(null), '');

console.log(`All ${checks} format checks passed.`);
