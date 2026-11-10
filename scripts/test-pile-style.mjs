// Tests for shared/pile-style.mjs: which pile styles there are and how the saved text is read.
import { PILE_STYLE_KEY, PILE_STYLES, DEFAULT_PILE_STYLE, PILE_STYLE_LABELS, readPileStyle, stepOutFor } from '../shared/pile-style.mjs';

let checks = 0;
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) { console.log(`FAILED CHECK: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); process.exit(1); } };

same('the two styles are diagonal (the first way) and horizontal, and diagonal is the default', [PILE_STYLES, DEFAULT_PILE_STYLE], [['diagonal', 'horizontal'], 'diagonal']);
same('every style has a label to show', PILE_STYLES.map((name) => typeof PILE_STYLE_LABELS[name]), ['string', 'string']);
same('the storage key is in the overloaded namespace', PILE_STYLE_KEY, 'overloaded.pileStyle');
same('a saved style is read back', PILE_STYLES.map((name) => readPileStyle(name)), PILE_STYLES);
for (const bad of [null, undefined, '', 'Diagonal', 'HORIZONTAL', 'vertical', ' horizontal', 'horizontal ', '{"style":"horizontal"}', 'toString', '__proto__', 'constructor', 5, true, {}, []]) same(`${JSON.stringify(bad)} is not a style: the default`, readPileStyle(bad), 'diagonal');

same('a tapped card steps out to the side in both styles', PILE_STYLES.map((style) => stepOutFor(style)), ['right', 'right']);

console.log(`All ${checks} pile style checks passed.`);
