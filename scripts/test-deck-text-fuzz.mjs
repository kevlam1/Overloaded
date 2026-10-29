// Stress and fuzz tests for shared/deck-text.mjs (2026-10-28 edge-case pass). The pasted text comes from strangers, so:
//  - whatever is pasted, the parser must not throw, hang or return something that breaks its own promises;
//  - a crafted line must not make the regular expressions take forever;
//  - the size limits must hold.
// Seeded, so a failure can be repeated. Run: node scripts/test-deck-text-fuzz.mjs
import { parseDeckText, MAX_CARDS, MAX_CHARS, MAX_LINES } from '../shared/deck-text.mjs';

let checks = 0;
function check(label, condition, detail = '') {
  if (!condition) { console.error(`FAILED: ${label}${detail ? ` (${detail})` : ''}`); process.exit(1); }
  checks++;
}
const c = (...codes) => String.fromCodePoint(...codes);
let seed = 20261028;
const next = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const pick = (list) => list[Math.floor(next() * list.length)];
const timed = (fn) => { const start = performance.now(); const value = fn(); return { value, ms: performance.now() - start }; };

// ---- What a result must always look like ----
const SECTIONS = new Set(['main', 'sideboard', 'commander', 'companion', 'maybeboard', 'unlabeled']);
function wellFormed(result, input) {
  if (!result || typeof result !== 'object') return 'no result object';
  for (const key of ['entries', 'warnings', 'errors']) if (!Array.isArray(result[key])) return `${key} is not a list`;
  if (typeof result.total !== 'number' || !Number.isFinite(result.total)) return 'total is not a finite number';
  let sum = 0; let maybe = 0;
  const lineCount = typeof input === 'string' ? input.split(/\r\n|\r|\n/).length : 0;
  for (const e of result.entries) {
    if (!Number.isInteger(e.qty) || e.qty < 1 || e.qty > 9999) return `bad quantity ${e.qty}`;
    if (typeof e.name !== 'string' || !e.name.trim()) return 'empty card name';
    if (e.name !== e.name.trim()) return 'card name not trimmed';
    if (!SECTIONS.has(e.section)) return `unknown section ${e.section}`;
    if (!Number.isInteger(e.line) || e.line < 1 || e.line > lineCount) return `line number out of range ${e.line}`;
    if (e.set !== null && !/^[a-z0-9]{3,6}$/.test(e.set)) return `bad set code ${e.set}`;
    if (typeof e.foil !== 'boolean') return 'foil is not true or false';
    sum += e.qty; if (e.section === 'maybeboard') maybe += e.qty;
  }
  if (result.total !== sum - maybe) return `total ${result.total} is not the sum of the cards outside the maybeboard (${sum - maybe})`;
  const counted = Object.values(result.counts).reduce((a, b) => a + b, 0);
  if (counted !== sum) return 'the section counts do not add up';
  for (const key of Object.keys(result.counts)) if (!SECTIONS.has(key)) return `counts has a key that is not a section: ${key}`;
  if (result.total > MAX_CARDS && !result.errors.some((e) => e.code === 'too_many_cards')) return 'over the card limit with no error';
  if (result.errors.some((e) => e.code === 'too_many_cards') && result.total <= MAX_CARDS) return 'too_many_cards reported under the limit';
  for (const w of result.warnings) if (!Number.isInteger(w.line) || typeof w.reason !== 'string') return 'bad warning';
  return '';
}

// ---- 1. Random messy decklists: never a throw, always well-formed ----
{
  const names = ['Sol Ring', 'Lightning Bolt', 'Kongming, "Sleeping Dragon"', 'Jace, the Mind Sculptor', 'Fire // Ice', 'Brisela, Voice of Nightmares', 'Okaun, Eye of Chaos', 'Island', 'x', 'A', c(0x5C71, 0x7530), c(0x1F40D) + ' Snake', 'Lim-D' + c(0xFB) + 'l' + c(0x27) + 's Vault'];
  const headers = ['SIDEBOARD:', 'Sideboard', 'Commander', 'COMMANDER:', 'Companion', 'Deck', 'Mainboard', 'Maybeboard', 'Maybe Board:', 'maybeboard', 'Sideboard:', 'Tokens'];
  const junk = ['', ' ', '\t', '1', '0 Island', '-1 Island', '99999 Island', '1x', 'x1 Island', '1 ', '1 (abc) 5', '1 Sol Ring (CMM)', '1 Sol Ring (CMM) ', '1 Sol Ring (CMM) 410 *F*', '1 Sol Ring *F*', '1 Sol Ring (toolongset) 1', '   3   Island   ', '2' + c(0xA0) + 'Island', c(0xFEFF) + '1 Island', '1 Island' + c(0x2028) + '1 Forest', '#comment', '// note', '*F*', '()', '1 ()', '1 Sol Ring (a)', c(0xD800) + '1 Island', '1 ' + c(0xD83D), '1 \u0000Island'];
  let throws = 0; let firstBad = '';
  for (let i = 0; i < 4000 && !firstBad; i++) {
    const lines = []; const n = Math.floor(next() * 60);
    for (let j = 0; j < n; j++) {
      const roll = next();
      if (roll < 0.45) lines.push(`${pick(['1', '2', '4', '1x', '10', '100', '1000', '0', '9999'])} ${pick(names)}${next() < 0.3 ? ` (${pick(['CMM', 'a25', 'M21', 'XX', 'ABCDEFG'])}) ${pick(['410', '1a', '*', '12-3', 'Phi'])}` : ''}${next() < 0.1 ? ' *F*' : ''}`);
      else if (roll < 0.6) lines.push(pick(headers));
      else lines.push(pick(junk));
    }
    const text = lines.join(pick(['\n', '\r\n', '\r']));
    let result;
    try { result = parseDeckText(text); } catch (error) { throws++; firstBad = `threw ${error.message}`; }
    if (!firstBad) firstBad = wellFormed(result, text);
    if (firstBad) { console.error('  input that broke it:', JSON.stringify(text).slice(0, 400)); }
  }
  check('4,000 random messy decklists: never a throw, and every result is well-formed', !firstBad, firstBad);
}

// ---- 2. Things that are not text at all ----
{
  for (const value of [undefined, null, 42, {}, [], true, () => 1, Symbol('x'), 10n]) {
    let result; let threw = false;
    try { result = parseDeckText(value); } catch { threw = true; }
    check(`a ${typeof value} instead of text is refused with not_text, not a crash`, !threw && result.errors.some((e) => e.code === 'not_text') && result.entries.length === 0);
  }
}

// ---- 3. The size limits hold ----
{
  const atLimit = parseDeckText('1 Island\n'.repeat(MAX_LINES - 1));
  check('exactly the line limit is accepted', !atLimit.errors.some((e) => e.code === 'too_many_lines') && atLimit.entries.length === MAX_LINES - 1);
  check('one line over the limit is refused', parseDeckText('1 Island\n'.repeat(MAX_LINES + 1)).errors.some((e) => e.code === 'too_many_lines'));
  const longText = 'a'.repeat(MAX_CHARS);
  check('exactly the character limit is accepted (and is just one non-card line)', !parseDeckText(longText).errors.some((e) => e.code === 'too_long'));
  check('one character over the limit is refused', parseDeckText('a'.repeat(MAX_CHARS + 1)).errors.some((e) => e.code === 'too_long'));
  check('a refused paste returns no cards', parseDeckText('1 Island\n'.repeat(MAX_LINES + 1)).entries.length === 0);
  const big = parseDeckText('4 Island\n'.repeat(60));
  check('240 cards is over the card limit and says so, but the cards are still returned', big.errors.some((e) => e.code === 'too_many_cards' && e.total === 240) && big.entries.length === 60);
  check('exactly 200 cards is fine', parseDeckText('4 Island\n'.repeat(50)).errors.length === 0);
  check('201 cards is not', parseDeckText('4 Island\n'.repeat(50) + '1 Forest').errors.some((e) => e.code === 'too_many_cards'));
  const huge = parseDeckText('9999 Island\n'.repeat(900));
  check('a total in the millions is reported as a number, not broken', huge.total === 9999 * 900 && huge.errors.some((e) => e.code === 'too_many_cards'));
  check('a maybeboard does not count toward the limit', !parseDeckText('Maybeboard\n' + '4 Island\n'.repeat(80)).errors.some((e) => e.code === 'too_many_cards'));
}

// ---- 4. Crafted input must not make the parser slow (regular expression blow-ups) ----
{
  const budgetMs = 1500; // generous: a normal parse takes under a millisecond, this only catches a real blow-up
  const cases = {
    'one line of 100,000 spaces and letters': '1 ' + 'ab '.repeat(33000),
    'one line of 100,000 opening brackets': '1 Sol Ring ' + '('.repeat(MAX_CHARS - 20),
    'a card line with 12,000 set-code groups': '1 Sol Ring' + ' (abc) x'.repeat(12000),
    'a card line with 25,000 foil markers': '1 Sol Ring' + ' *F*'.repeat(25000),
    'a card line ending in an almost-valid set code': '1 Sol Ring' + ' (CMM'.repeat(15000),
    'many spaces before a missing end': '1 ' + 'a' + ' '.repeat(50000) + 'b',
    'tab and space soup': ('1\t \tIsland\t \t').repeat(7000),
    '1,000 lines of 99 characters': (('1 ' + 'x'.repeat(97)) + '\n').repeat(MAX_LINES - 1),
    '1,000 lines each ending in a near-match': (('1 Sol Ring (CMM) ' + '4'.repeat(70) + ' *F') + '\n').repeat(MAX_LINES - 1),
    'quantities with 100,000 digits': '1'.repeat(MAX_CHARS - 1),
    'a header with 100,000 colons': 'Sideboard' + ':'.repeat(MAX_CHARS - 20),
    'alternating headers and cards 1,000 lines': ('Commander\n1 Sol Ring\n').repeat(500),
    'only blank lines (1,000)': '\n'.repeat(MAX_LINES - 1),
    'only carriage returns': '\r'.repeat(MAX_LINES - 1),
    'a million-character paste': 'x'.repeat(1_000_000),
  };
  for (const [label, text] of Object.entries(cases)) {
    const { value: result, ms } = timed(() => parseDeckText(text));
    check(`${label}: finishes quickly (${ms.toFixed(1)} ms)`, ms < budgetMs, `${ms.toFixed(0)} ms`);
    check(`${label}: the result is well-formed`, wellFormed(result, text) === '', wellFormed(result, text));
  }
}

// ---- 5. Unusual but real input is handled sensibly ----
{
  const r = parseDeckText('1 ' + c(0x5C71, 0x7530) + '\n2 ' + c(0x1F40D) + ' Snake');
  check('names in other scripts and with emoji are kept whole', r.entries[0].name === c(0x5C71, 0x7530) && r.entries[1].name === c(0x1F40D) + ' Snake');
  const crlf = parseDeckText('1 Island\r\n1 Forest\r\n');
  check('Windows line ends give the right number of cards and lines', crlf.entries.length === 2 && crlf.entries[1].line === 2);
  const mixed = parseDeckText('1 Island\r1 Forest\n1 Swamp\r\n1 Plains');
  check('old Mac, Unix and Windows line ends mixed in one paste', mixed.entries.map((e) => e.name).join() === 'Island,Forest,Swamp,Plains' && mixed.entries.map((e) => e.line).join() === '1,2,3,4');
  const bom = parseDeckText(c(0xFEFF) + '1 Island');
  check('a byte order mark at the start does not break the first card', bom.entries.length === 1 && bom.entries[0].name === 'Island');
  const nbsp = parseDeckText('2' + c(0xA0) + 'Sol Ring');
  check('a no-break space from a web page copy works like a space', nbsp.entries.length === 1 && nbsp.entries[0].qty === 2);
  const ls = parseDeckText('1 Island' + c(0x2028) + '1 Forest');
  check('a Unicode line separator inside a line is treated as a space, so it is one (odd) card line, not two', ls.entries.length === 1);
  const zero = parseDeckText('0 Island\n1 Forest');
  check('a zero quantity is reported, not made into a card', zero.entries.length === 1 && zero.warnings.some((w) => w.reason === 'zero_quantity'));
  const neg = parseDeckText('-1 Island');
  check('a negative quantity is not a card', neg.entries.length === 0 && neg.warnings.length === 1);
  const frac = parseDeckText('1.5 Island');
  check('a fractional quantity is not turned into a card with a wrong name', frac.entries.every((e) => e.name !== '5 Island'), JSON.stringify(frac.entries));
  const proto = parseDeckText('1 __proto__\n1 constructor\n1 toString');
  check('card names that are property names are just names', proto.entries.length === 3 && ({}).polluted === undefined);
  check('and they do not pollute the section counts', Object.keys(proto.counts).join() === 'main' && proto.counts.main === 3);
}

console.log(`All ${checks} deck text stress checks passed.`);
