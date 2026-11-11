// Tests for shared/deck-colors.mjs: the colors of a deck and of its commanders.
import { COLORS, COLOR_TINTS, COLORLESS_TINT, unionOf, identityOfName, deckFace, colorsAsCost, tintGradient } from '../shared/deck-colors.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };

same('the colors and a tint for each', [COLORS, Object.keys(COLOR_TINTS).join(''), /^#[0-9a-f]{6}$/.test(COLORLESS_TINT), Object.values(COLOR_TINTS).every((t) => /^#[0-9a-f]{6}$/.test(t))], [['W', 'U', 'B', 'R', 'G'], 'WUBRG', true, true]);
same('a union is in W U B R G order, without repeats', [unionOf(['G', 'WU', 'UB']), unionOf(['R', 'R']), unionOf([]), unionOf(['', '']), unionOf(undefined), unionOf([5, null, 'X', 'wu'])], ['WUBG', 'R', '', '', '', '']);
const byName = new Map([['Tymna the Weaver', { ci: 'WB' }], ['Thrasios, Triton Hero', { ci: 'UG' }], ['Krenko, Mob Boss', { ci: 'R' }], ['Sol Ring', {}], ['Island', {}], ['Lightning Bolt', { ci: 'R' }], ['Counterspell', { ci: 'U' }]]);
same('the identity of a card by name; a card with none, an unknown name and no list give none', [identityOfName(byName, 'Tymna the Weaver'), identityOfName(byName, 'Sol Ring'), identityOfName(byName, 'Nobody'), identityOfName(null, 'Sol Ring'), identityOfName(new Map([['X', { ci: 'GW' }]]), 'X')], ['WB', '', '', '', 'WG']);
const saved = (format, cards) => ({ format, deck: { cards: cards.map(([n, section]) => ({ n, section, qty: 1, i: 'x' })) } });
same('one commander: its colors, not split', deckFace(saved('commander', [['Krenko, Mob Boss', 'commander'], ['Sol Ring', 'main'], ['Counterspell', 'main']]), byName), { commanders: [{ name: 'Krenko, Mob Boss', colors: 'R' }], colors: 'R', split: false });
same('two commanders: each with its colors, the deck\'s colors their union, split', deckFace(saved('commander', [['Tymna the Weaver', 'commander'], ['Thrasios, Triton Hero', 'commander'], ['Sol Ring', 'main']]), byName), { commanders: [{ name: 'Tymna the Weaver', colors: 'WB' }, { name: 'Thrasios, Triton Hero', colors: 'UG' }], colors: 'WUBG', split: true });
same('a third commander is ignored', deckFace(saved('commander', [['Krenko, Mob Boss', 'commander'], ['Tymna the Weaver', 'commander'], ['Thrasios, Triton Hero', 'commander']]), byName).commanders.length, 2);
same('a Standard deck has no commanders; its colors are the union over its main deck (the sideboard does not count)', deckFace(saved('standard', [['Lightning Bolt', 'main'], ['Counterspell', 'main'], ['Island', 'main'], ['Tymna the Weaver', 'sideboard']]), byName), { commanders: [], colors: 'UR', split: false });
same('a Commander deck with no commander marked falls back to its cards\' colors', deckFace(saved('commander', [['Lightning Bolt', 'main']]), byName), { commanders: [], colors: 'R', split: false });
same('a card list that is not there gives colorless, and bad input a face with nothing', [deckFace(saved('commander', [['Krenko, Mob Boss', 'commander']]), null).colors, deckFace(null, byName), deckFace({}, byName)], ['', { commanders: [], colors: '', split: false }, { commanders: [], colors: '', split: false }]);
same('the pips as a cost string', [colorsAsCost('WU'), colorsAsCost(''), colorsAsCost('GW'), colorsAsCost(5), colorsAsCost(undefined)], ['{W}{U}', '', '{W}{G}', '', '']);
same('the gradient for no color, one color and several', [tintGradient(''), tintGradient('R'), tintGradient('WUB')], [`linear-gradient(135deg, ${COLORLESS_TINT}, ${COLORLESS_TINT})`, `linear-gradient(135deg, ${COLOR_TINTS.R}, ${COLOR_TINTS.R})`, `linear-gradient(135deg, ${COLOR_TINTS.W}, ${COLOR_TINTS.U}, ${COLOR_TINTS.B})`]);

console.log(`All ${checks} deck color checks passed.`);
