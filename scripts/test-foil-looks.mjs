// Tests for shared/foil-looks.mjs: every foil, etched too, is drawn with the one traditional look. Run: node scripts/test-foil-looks.mjs
import { LOOK_GROUPS, lookGroup, cardLookGroup } from '../shared/foil-looks.mjs';
import { KIND_IDS, lookOf } from '../shared/foil-kinds.mjs';

let checks = 0;
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) { console.log(`FAILED CHECK: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); process.exit(1); } };

same('there is one look', LOOK_GROUPS, ['traditional']);
same('every kind of foil, and etched, is the traditional look', [...new Set([...KIND_IDS.map((kind) => lookGroup(lookOf(kind, kind === 'silveretched' ? 'etched' : 'foil'))), lookGroup('etched'), lookGroup('traditional'), lookGroup('made-up')])], ['traditional']);
same('not foil is no look', [lookGroup(null), lookGroup(undefined), lookGroup(false)], [null, null, null]);
same('a card: not foil none, a plain, a surge and an etched foil traditional', [cardLookGroup({ n: 'A' }), cardLookGroup({ foil: true }), cardLookGroup({ foil: true, look: 'surge' }), cardLookGroup({ foil: true, look: 'etched' }), cardLookGroup({ foil: false, look: 'etched' })], [null, 'traditional', 'traditional', 'traditional', null]);

console.log(`All ${checks} foil look checks passed.`);
