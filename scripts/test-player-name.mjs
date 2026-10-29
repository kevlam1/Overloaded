// Tests for shared/player-name.mjs. Run: node scripts/test-player-name.mjs
// This file is plain ASCII on purpose: every special character is built from its number with c(), so nothing invisible
// is hidden in the source.
import { cleanPlayerName, NAME_MAX, LONE_SURROGATE } from '../shared/player-name.mjs';

let checks = 0;
function check(label, condition) {
  if (!condition) { console.error('FAILED:', label); process.exit(1); }
  checks++;
}
const c = (...codes) => String.fromCodePoint(...codes);
const fails = (input) => { try { cleanPlayerName(input); return false; } catch (error) { return error instanceof Error && error.message.length > 0; } };
const cleans = (input, expected) => { try { return cleanPlayerName(input) === expected; } catch { return false; } };

// Names of the characters used below
const ZWSP = c(0x200B); const ZWNJ = c(0x200C); const ZWJ = c(0x200D); const LRM = c(0x200E); const RLM = c(0x200F);
const RLO = c(0x202E); const NBSP = c(0x00A0); const SNAKE = c(0x1F40D); const MAN = c(0x1F468); const WOMAN = c(0x1F469); const GIRL = c(0x1F467);
const E_ACUTE = c(0x00E9); const ACCENT = c(0x0301); const VS16 = c(0xFE0F); const HEART = c(0x2764);

check('limit matches the database rule (30)', NAME_MAX === 30);
check('a plain name is kept', cleanPlayerName('Kevin') === 'Kevin');
check('trims the ends', cleanPlayerName('  Kevin  ') === 'Kevin');
check('collapses runs of spaces and tabs', cleanPlayerName('Ana \t  Maria') === 'Ana Maria');
check('collapses a newline from a paste', cleanPlayerName('Kevin\n') === 'Kevin');
check('30 characters is allowed', cleanPlayerName('x'.repeat(30)) === 'x'.repeat(30));
check('31 characters is refused', fails('x'.repeat(31)));
check('empty is refused', fails(''));
check('only spaces is refused', fails('   \t '));
check('missing is refused', fails(undefined) && fails(null));
check('a number is turned into text, not refused', cleanPlayerName(42) === '42');
// The database counts UTF-16 units: an emoji is two (checked in the emulator, see backend/test-rules.mjs)
check('an emoji counts as two toward the limit: 15 emoji are allowed', cleanPlayerName(SNAKE.repeat(15)) === SNAKE.repeat(15));
check('and 16 emoji are refused, because the database would refuse them', fails(SNAKE.repeat(16)));
check('30 emoji, which the page used to allow, is refused', fails(SNAKE.repeat(30)));
check('14 emoji and 2 letters is exactly 30 units and allowed', cleanPlayerName(SNAKE.repeat(14) + 'ab') === SNAKE.repeat(14) + 'ab');
check('14 emoji and 3 letters is 31 units and refused', fails(SNAKE.repeat(14) + 'abc'));
check('the message for too many emoji says an emoji counts as two', (() => { try { cleanPlayerName(SNAKE.repeat(16)); } catch (e) { return /emoji counts as two/.test(e.message) && e.message.includes('30'); } return false; })());
check('the message for too many plain letters is the ordinary one', (() => { try { cleanPlayerName('x'.repeat(40)); } catch (e) { return !/emoji/.test(e.message) && e.message.includes('30'); } return false; })());
check('other characters outside the basic plane (Gothic, math letters, rare Han) count as two too', fails(c(0x10348).repeat(16)) && fails(c(0x1D400).repeat(16)) && fails(c(0x20000).repeat(16)) && cleanPlayerName(c(0x20000).repeat(15)) === c(0x20000).repeat(15));
check('characters inside the basic plane count as one, in any script', cleanPlayerName(c(0x5C71).repeat(30)) === c(0x5C71).repeat(30) && fails(c(0x5C71).repeat(31)));
check('a family emoji (three emoji joined) is 8 units', cleanPlayerName((MAN + ZWJ + WOMAN + ZWJ + GIRL).repeat(3)) === (MAN + ZWJ + WOMAN + ZWJ + GIRL).repeat(3) && fails((MAN + ZWJ + WOMAN + ZWJ + GIRL).repeat(4)));
check('the message for an empty name says to type one', (() => { try { cleanPlayerName(''); } catch (e) { return /name/i.test(e.message); } return false; })());
check('the message for a long name says the limit', (() => { try { cleanPlayerName('x'.repeat(31)); } catch (e) { return e.message.includes('30'); } return false; })());

// ---- Invisible and direction-changing characters (security pass, 2026-10-28) ----
check('a zero-width space inside a name is removed (it cannot make a name look like another)', cleans('Ke' + ZWSP + 'vin', 'Kevin'));
check('even between every letter', cleans('K' + ZWSP + 'e' + ZWSP + 'v' + ZWSP + 'i' + ZWSP + 'n', 'Kevin'));
check('only zero-width spaces is the same as an empty name', fails(ZWSP + ZWSP + ZWSP));
check('the Hangul fillers cannot make a blank name', fails(c(0x3164)) && fails(c(0x115F, 0x1160)) && fails(c(0xFFA0)));
check('the braille blank cannot make a blank name', fails(c(0x2800, 0x2800)));
check('a soft hyphen cannot make a blank name', fails(c(0x00AD)));
check('the byte order mark cannot make a blank name', fails(c(0xFEFF)));
check('the word joiner and invisible operators cannot make a blank name', fails(c(0x2060, 0x2061, 0x2062, 0x2063, 0x2064)));
check('the combining grapheme joiner cannot make a blank name', fails(c(0x034F)));
check('a right-to-left override is removed', cleans(RLO + 'evil', 'evil'));
check('the other embeddings and overrides are removed', cleans('a' + c(0x202A, 0x202B, 0x202C, 0x202D, 0x202E) + 'b', 'ab'));
check('the isolates are removed', cleans('a' + c(0x2066, 0x2067, 0x2068, 0x2069) + 'b', 'ab'));
check('the deprecated format characters are removed', cleans('a' + c(0x206A, 0x206B, 0x206C, 0x206D, 0x206E, 0x206F) + 'b', 'ab'));
check('left-to-right and right-to-left marks are removed', cleans('a' + LRM + RLM + 'b', 'ab'));
check('the Arabic letter mark is removed', cleans('a' + c(0x061C) + 'b', 'ab'));
check('the interlinear annotation marks are removed', cleans('a' + c(0xFFF9, 0xFFFA, 0xFFFB) + 'b', 'ab'));
check('control characters are removed', cleans('a' + c(0x0000) + 'b' + c(0x0007) + 'c' + c(0x007F) + 'd' + c(0x009F) + 'e', 'abcde'));
check('only control characters is an empty name', fails(c(0x0000, 0x0001, 0x0002)));
check('a no-break space and an ideographic space collapse like a space', cleans('Ana' + NBSP + NBSP + 'Maria', 'Ana Maria') && cleans('Ana' + c(0x3000) + 'Maria', 'Ana Maria'));
check('line and paragraph separators collapse like a space', cleans('Ana' + c(0x2028) + 'Maria' + c(0x2029) + 'Lee', 'Ana Maria Lee'));
check('the emoji joiner is kept (a family emoji stays whole)', cleans(MAN + ZWJ + WOMAN + ZWJ + GIRL, MAN + ZWJ + WOMAN + ZWJ + GIRL));
check('the emoji variation selector is kept', cleans(HEART + VS16, HEART + VS16));
check('the zero-width non-joiner is kept (Persian and other scripts need it)', cleans(c(0x0645, 0x06CC) + ZWNJ + c(0x062E, 0x0648, 0x0627, 0x0647, 0x0645), c(0x0645, 0x06CC) + ZWNJ + c(0x062E, 0x0648, 0x0627, 0x0647, 0x0645)));
check('a name with only an emoji is a name', cleans(SNAKE, SNAKE));
check('punctuation alone is allowed (it is visible)', cleans('!!!', '!!!'));
check('a number alone is allowed', cleans('007', '007'));
check('combining marks alone are not a name', fails(ACCENT + ACCENT) && fails(c(0x0300)));
check('letters from other scripts are fine', cleans(c(0x5C71, 0x7530, 0x20, 0x592A, 0x90CE), c(0x5C71, 0x7530, 0x20, 0x592A, 0x90CE)) && cleans(c(0x0410, 0x043B, 0x0435, 0x043A, 0x0441), c(0x0410, 0x043B, 0x0435, 0x043A, 0x0441)));
check('accents are put in one standard form (e plus a loose accent equals the single letter)', cleans('e' + ACCENT, E_ACUTE) && cleans('Jose' + ACCENT, 'Jos' + E_ACUTE));
check('so a name built from loose accents is counted by what it looks like (30 of them is allowed)', cleans(('e' + ACCENT).repeat(30), E_ACUTE.repeat(30)));
check('invisible characters do not count toward the limit (30 letters and 10 hidden ones is allowed)', cleans('x'.repeat(30) + ZWSP.repeat(10), 'x'.repeat(30)));
check('but 31 visible characters are still too many however many hidden ones are added', fails('x'.repeat(31) + ZWSP));
check('invisible characters hidden between letters cannot push a name past the limit unseen', fails(('x' + ZWSP).repeat(31)));
check('trimming happens after the invisible characters are removed', cleans(ZWSP + '  Kevin ' + ZWSP + ' ', 'Kevin'));
check('half of an emoji with no partner is removed (high half)', cleans('a' + c(0xD83D) + 'b', 'ab'));
check('and the other half too (low half)', cleans('a' + c(0xDC0D) + 'b', 'ab'));
check('but a whole emoji (both halves) is kept', cleans('a' + c(0xD83D, 0xDC0D) + 'b', 'a' + SNAKE + 'b'));
check('a name made only of loose halves is empty', fails(c(0xD800)) && fails(c(0xDC00, 0xD800)));
check('the lone-surrogate pattern is exported and finds a loose half', 'a\uD800'.length === 2 && new RegExp(LONE_SURROGATE.source, 'g').test('a' + c(0xD800)));
check('cleaning twice gives the same name', ['Ke' + ZWSP + 'vin', ' Ana \t Maria ', RLO + 'evil', 'e' + ACCENT, MAN + ZWJ + WOMAN, '!!!'].every((s) => cleanPlayerName(cleanPlayerName(s)) === cleanPlayerName(s)));

// ---- Every character in every removed range, and the characters just outside each edge ----
// This list is written out here separately from the module's, so a mistake in one does not hide in both.
const invisibleRanges = [[0, 8], [0xE, 0x1F], [0x7F, 0x9F], [0xAD, 0xAD], [0x34F, 0x34F], [0x61C, 0x61C], [0x115F, 0x1160], [0x200B, 0x200B], [0x200E, 0x200F], [0x202A, 0x202E], [0x2060, 0x2064], [0x2066, 0x206F], [0x2800, 0x2800], [0x3164, 0x3164], [0xFEFF, 0xFEFF], [0xFFA0, 0xFFA0], [0xFFF9, 0xFFFB]];
const isInvisibleCode = (code) => invisibleRanges.some(([first, last]) => code >= first && code <= last);
{
  let everyInside = true; let firstWrongInside = '';
  let insideCount = 0;
  for (const [first, last] of invisibleRanges) {
    for (let code = first; code <= last; code++) {
      insideCount++;
      if (!cleans('a' + c(code) + 'b', 'ab') && everyInside) { everyInside = false; firstWrongInside = code.toString(16); }
    }
  }
  check(`every one of the ${insideCount} characters in the removed ranges is removed from the middle of a name (first wrong: ${firstWrongInside || 'none'})`, everyInside);
  const outside = new Set();
  for (const [first, last] of invisibleRanges) { outside.add(first - 1); outside.add(last + 1); }
  let outsideCount = 0; let wrong = '';
  for (const code of outside) {
    if (code < 0 || isInvisibleCode(code)) continue;
    outsideCount++;
    const ch = c(code);
    const expected = /\s/.test(ch) ? 'a b' : 'a' + ch + 'b'; // whitespace becomes one space, everything else is left alone
    if (!cleans('a' + ch + 'b', expected) && !wrong) wrong = code.toString(16);
  }
  check(`the ${outsideCount} characters just outside the removed ranges are left alone (or spaced, if whitespace) (first wrong: ${wrong || 'none'})`, !wrong && outsideCount > 15);
  check('a tab or a newline between two words becomes a space and is not removed', cleans('Ana\tMaria', 'Ana Maria') && cleans('Ana\nMaria', 'Ana Maria') && cleans('Ana\r\nMaria', 'Ana Maria') && cleans('Ana\vMaria', 'Ana Maria') && cleans('Ana\fMaria', 'Ana Maria'));
}

// ---- Random strings from a pool of awkward characters: whatever comes in, what comes out is safe ----
{
  const pool = ['a', 'Z', '7', ' ', '\t', '\n', NBSP, ZWSP, ZWNJ, ZWJ, LRM, RLM, RLO, c(0x2066), c(0x2069), c(0x0000), c(0x007F), c(0x00AD), ACCENT, c(0x3164), c(0x2800), c(0xFEFF), VS16, SNAKE, MAN, E_ACUTE, c(0x5C71), '!', c(0xD800), c(0xDC00), c(0x2028)];
  let seed = 20261028;
  const next = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const hasInvisible = (s) => [...s].some((ch) => isInvisibleCode(ch.codePointAt(0)));
  const hasLoneHalf = (s) => { for (let i = 0; i < s.length; i++) { const x = s.charCodeAt(i); if (x >= 0xD800 && x <= 0xDBFF) { const y = s.charCodeAt(i + 1); if (y >= 0xDC00 && y <= 0xDFFF) i++; else return true; } else if (x >= 0xDC00 && x <= 0xDFFF) return true; } return false; };
  let returned = 0; let refused = 0; let bad = '';
  for (let i = 0; i < 20000 && !bad; i++) {
    const length = Math.floor(next() * 50);
    let s = '';
    for (let j = 0; j < length; j++) s += pool[Math.floor(next() * pool.length)];
    try {
      const out = cleanPlayerName(s);
      returned++;
      if (hasInvisible(out)) bad = 'an invisible character survived';
      else if ([...out].length > NAME_MAX) bad = 'longer than the limit';
      else if (out !== out.trim() || /\s\s/.test(out)) bad = 'not trimmed or collapsed';
      else if (!/[\p{L}\p{N}\p{P}\p{S}]/u.test(out)) bad = 'nothing visible';
      else if (out !== out.normalize('NFC')) bad = 'not in standard accent form';
      else if (hasLoneHalf(out)) bad = 'a loose half of an emoji survived';
      else if (cleanPlayerName(out) !== out) bad = 'cleaning twice changed it';
    } catch (error) {
      refused++;
      if (!(error instanceof Error) || !error.message) bad = 'refused without a message';
    }
    if (bad) console.error('  random input that broke it (code points):', [...s].map((ch) => ch.codePointAt(0).toString(16)).join(' '));
  }
  check(`20,000 random awkward strings: every answer is safe (${returned} names, ${refused} refused)`, !bad && returned > 1000 && refused > 1000);
  if (bad) console.error('  reason:', bad);
}

console.log(`All ${checks} player name checks passed.`);
