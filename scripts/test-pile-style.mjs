// Tests for shared/pile-style.mjs: which pile styles there are and how the saved text is read.
import { PILE_STYLE_KEY, PILE_STYLES, DEFAULT_PILE_STYLE, PILE_STYLE_LABELS, readPileStyle, stepOutFor, TAPPED_PILE_STYLE_KEY, DEFAULT_TAPPED_PILE_STYLE, readTappedPileStyle } from '../shared/pile-style.mjs';

let checks = 0;
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) { console.log(`FAILED CHECK: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); process.exit(1); } };

same('the styles are diagonal (the first way), horizontal and vertical, and diagonal is the default', [PILE_STYLES, DEFAULT_PILE_STYLE], [['diagonal', 'horizontal', 'vertical'], 'diagonal']);
same('every style has a label to show', PILE_STYLES.map((name) => typeof PILE_STYLE_LABELS[name]), ['string', 'string', 'string']);
same('the storage key is in the overloaded namespace', PILE_STYLE_KEY, 'overloaded.pileStyle');
same('a saved style is read back', PILE_STYLES.map((name) => readPileStyle(name)), PILE_STYLES);
for (const bad of [null, undefined, '', 'Diagonal', 'HORIZONTAL', 'Vertical', 'up', ' horizontal', 'horizontal ', '{"style":"horizontal"}', 'toString', '__proto__', 'constructor', 5, true, {}, []]) same(`${JSON.stringify(bad)} is not a style: the default`, readPileStyle(bad), 'diagonal');

same('a tapped card steps out to the side in both styles', PILE_STYLES.map((style) => stepOutFor(style)), ['right', 'right', 'right']);

// piles of tapped cards have a style of their own
same('the style of tapped piles is kept under its own key, in the same namespace, and diagonal is its default', [TAPPED_PILE_STYLE_KEY, TAPPED_PILE_STYLE_KEY !== PILE_STYLE_KEY, DEFAULT_TAPPED_PILE_STYLE], ['overloaded.tappedPileStyle', true, 'diagonal']);
same('a saved style of tapped piles is read back', PILE_STYLES.map((name) => readTappedPileStyle(name)), PILE_STYLES);
for (const bad of [null, undefined, '', 'Diagonal', 'up', 'Vertical', ' vertical', ' horizontal', '{"style":"horizontal"}', 'toString', '__proto__', 5, true, {}, []]) same(`a saved style of tapped piles that is ${JSON.stringify(bad)} is the default`, readTappedPileStyle(bad), DEFAULT_TAPPED_PILE_STYLE);
same('the two choices do not read each other (each has its own default and its own values)', [readPileStyle('horizontal'), readTappedPileStyle('diagonal')], ['horizontal', 'diagonal']);

console.log(`All ${checks} pile style checks passed.`);
