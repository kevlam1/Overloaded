// Tests for shared/sample-decks.mjs: the sample decks a visitor can load, and what the pasted-list parser makes of them. The
// names are matched against the REAL card list in the browser check (scripts/check-deck-ui.mjs), which needs the built list;
// this test needs nothing but the code. No browser, no network. Run: node scripts/test-sample-decks.mjs
import { SAMPLE_DECKS, sampleById } from '../shared/sample-decks.mjs';
import { parseDeckText, MAX_CARDS } from '../shared/deck-text.mjs';
import { FORMATS } from '../shared/formats.mjs';
import { cleanDeckName, DECK_NAME_MAX } from '../shared/deck-preview.mjs';

let checks = 0;
function check(label, condition, detail = '') {
  checks++;
  if (!condition) { console.error(`FAILED: ${label} ${detail}`); process.exit(1); }
}
const same = (label, actual, expected) => check(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

// ---- the list of samples ----
check('there is at least one sample', Array.isArray(SAMPLE_DECKS) && SAMPLE_DECKS.length >= 1);
same('the ids are different and plain', [new Set(SAMPLE_DECKS.map((s) => s.id)).size === SAMPLE_DECKS.length, SAMPLE_DECKS.every((s) => /^[a-z0-9-]+$/.test(s.id))], [true, true]);
for (const sample of SAMPLE_DECKS) {
  const label = `sample "${sample.id}"`;
  check(`${label} has a name, a format and text`, typeof sample.name === 'string' && typeof sample.format === 'string' && typeof sample.text === 'string' && sample.text.length > 0);
  check(`${label} has a name the deck page accepts (1 to ${DECK_NAME_MAX} characters, nothing to clean)`, cleanDeckName(sample.name) === sample.name && [...sample.name].length <= DECK_NAME_MAX);
  check(`${label} is for a format the lobby knows`, FORMATS.includes(sample.format), sample.format);
  check(`${label} is plain ASCII, so no hidden characters can hide in it`, /^[\n\x20-\x7e]*$/.test(sample.text));

  const parsed = parseDeckText(sample.text);
  const total = parsed.entries.reduce((sum, entry) => sum + entry.qty, 0);
  check(`${label} parses with no errors and no skipped lines`, parsed.errors.length === 0 && parsed.warnings.length === 0, JSON.stringify([parsed.errors, parsed.warnings]));
  check(`${label} is under the card limit`, total <= MAX_CARDS, String(total));
  check(`${label} names a set and a collector number on every line, and has no line that was counted as 1 by default`, parsed.entries.every((e) => e.set && e.number && !e.qtyAssumed));
  const names = parsed.entries.map((e) => e.name.toLowerCase());
  check(`${label} names no card twice`, new Set(names).size === names.length);
  if (sample.format === 'commander') {
    const commanders = parsed.entries.filter((e) => e.section === 'commander');
    same(`${label} marks exactly one commander, and it is the first card`, [commanders.length, commanders[0]?.name, parsed.entries[0].section], [1, parsed.entries[0].name, 'commander']);
    check(`${label} has the 100 cards of a Commander deck (the commander and 99 more)`, total === 100, String(total));
    check(`${label} puts every other card in the main deck`, parsed.entries.slice(1).every((e) => e.section === 'main'));
  } else {
    check(`${label} has at least 60 cards`, total >= 60, String(total));
  }
}

// ---- the first sample, which Kevin gave (2026-10-30) ----
{
  const krenko = SAMPLE_DECKS.find((s) => s.id === 'krenko');
  check('the Krenko sample exists and is a Commander deck', krenko && krenko.format === 'commander');
  const parsed = parseDeckText(krenko.text);
  same('it has 85 lines and 100 cards', [parsed.entries.length, parsed.entries.reduce((s, e) => s + e.qty, 0)], [85, 100]);
  same('the commander is Krenko, Mob Boss', parsed.entries[0].name, 'Krenko, Mob Boss');
  check('the 16 Mountains are one line of 16', parsed.entries.filter((e) => e.name === 'Mountain').length === 1 && parsed.entries.find((e) => e.name === 'Mountain').qty === 16);
  check('the lines that name two faces are kept as typed (" / ")', ['Pinnacle Monk / Mystic Peak', 'Shatterskull Smashing / Shatterskull, the Hammer Pass', 'Valakut Awakening / Valakut Stoneforge'].every((name) => parsed.entries.some((e) => e.name === name)));
  check('a printing with a hyphen in its number is read whole', parsed.entries.some((e) => e.set === 'plst' && e.number === 'M11-153') && parsed.entries.some((e) => e.set === 'plst' && e.number === 'CNS-36'));
  check('a number with a letter after it is read whole (242s)', parsed.entries.some((e) => e.set === 'pwoe' && e.number === '242s'));
  check('foil marks are not part of the card name or the number', parsed.entries.every((e) => !/\*/.test(e.name) && !/\*/.test(e.number)));
}

// ---- sampleById ----
same('an id finds its sample', sampleById('krenko').id, 'krenko');
check('no id (a link like /deck?sample), an unknown id, or text that is not an id gives the first sample', [undefined, null, '', 'nope', 'KRENKO', 5, {}, ['krenko']].every((id) => sampleById(id) === SAMPLE_DECKS[0]));
check('names an object has are not sample ids', ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'length'].every((id) => sampleById(id) === SAMPLE_DECKS[0]));

console.log(`All ${checks} sample deck checks passed.`);
