// Tests for shared/mana-cost.mjs: reading a mana cost into symbols.
import { parseSymbols, parseCost, costWords, SYMBOL_HOST } from '../shared/mana-cost.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };

const kinds = (text) => parseSymbols(text).map((s) => `${s.kind}:${s.text}`);
same('a normal cost', kinds('{2}{G}{G}'), ['generic:2', 'color:G', 'color:G']);
same('all five colors, colorless, snow and X', kinds('{W}{U}{B}{R}{G}{C}{S}{X}'), ['color:W', 'color:U', 'color:B', 'color:R', 'color:G', 'colorless:C', 'snow:S', 'x:X']);
same('lower case is read like upper case', kinds('{g}{c}{x}'), ['color:G', 'colorless:C', 'x:X']);
same('hybrid, two-for-one hybrid and Phyrexian symbols', kinds('{W/U}{2/W}{G/P}{G/W/P}'), ['hybrid:W/U', 'hybrid:2/W', 'phyrexian:G/P', 'phyrexian:G/W/P']);
same('a zero and a double digit are generic', kinds('{0}{10}{16}'), ['generic:0', 'generic:10', 'generic:16']);
same('no cost and bad input give no symbols', [parseSymbols(''), parseSymbols(undefined), parseSymbols(null), parseSymbols(7), parseSymbols('2GG'), parseSymbols('{}'), parseSymbols('{')], [[], [], [], [], [], [], []]);
same('an unknown symbol is kept as written, and a huge number is not a mana number', kinds('{HW}{999999}{T}'), ['other:HW', 'other:999999', 'other:T']);
same('labels are plain words', parseSymbols('{2}{G}{W/U}{2/W}{G/P}{C}{S}{X}').map((s) => s.label), ['2 generic mana', 'green mana', 'white or blue mana', '2 generic or white mana', 'green or 2 life', 'colorless mana', 'snow mana', 'X mana']);
same('the colors in a symbol', parseSymbols('{2}{G}{W/U}{B/G/P}').map((s) => s.colors), [[], ['G'], ['W', 'U'], ['B', 'G']]);
same('a card with two costs is two parts', parseCost('{1}{R} // {2}{W}').map((part) => part.map((s) => s.text)), [['1', 'R'], ['2', 'W']]);
same('one part, no part, an empty side', [parseCost('{R}').length, parseCost('').length, parseCost(' // {R}').length], [1, 0, 1]);
same('words for a screen reader', [costWords('{2}{G}{G}'), costWords('{1}{R} // {2}{W}'), costWords('')], ['2 generic mana, green mana, green mana', '1 generic mana, red mana or 2 generic mana, white mana', '']);
same('text around symbols is dropped, never turned into markup', parseSymbols('<b>{R}</b> {G}').map((s) => s.text), ['R', 'G']);

same('where each symbol picture is: its text without the slashes', parseSymbols('{W}{C}{S}{X}{7}{20}{W/U}{2/W}{G/P}{G/W/P}').map((s) => s.url.slice(SYMBOL_HOST.length + 1)), ['W.svg', 'C.svg', 'S.svg', 'X.svg', '7.svg', '20.svg', 'WU.svg', '2W.svg', 'GP.svg', 'GWP.svg']);
same('a symbol Scryfall has no picture for has no address', [parseSymbols('{HW}')[0].url, parseSymbols('{21}')[0].url, parseSymbols('{999}')[0].url], [null, null, null]);
same('the host is the Scryfall symbol server, over https', SYMBOL_HOST, 'https://svgs.scryfall.io/card-symbols');

console.log(`All ${checks} mana cost checks passed.`);
