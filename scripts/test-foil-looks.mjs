// Tests for shared/foil-looks.mjs: every foil is drawn with the traditional look, or the etched look for etched foil. Run: node scripts/test-foil-looks.mjs
import { LOOK_GROUPS, lookGroup, cardLookGroup } from '../shared/foil-looks.mjs';
import { KIND_IDS, lookOf } from '../shared/foil-kinds.mjs';

let checks = 0;
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) { console.log(`FAILED CHECK: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); process.exit(1); } };

same('there are two looks', LOOK_GROUPS, ['traditional', 'etched']);
same('every kind of foil is a traditional look, except the etched ones', KIND_IDS.map((kind) => [kind, lookGroup(lookOf(kind, kind === 'silveretched' ? 'etched' : 'foil'))]).filter(([, look]) => look !== 'traditional'), [['silveretched', 'etched']]);
same('etched is etched, a plain foil and an unknown kind are traditional, and not foil is no look', [lookGroup('etched'), lookGroup('traditional'), lookGroup('made-up'), lookGroup(null), lookGroup(undefined), lookGroup(false)], ['etched', 'traditional', 'traditional', null, null, null]);
same('a card: not foil none, plain foil traditional, a surge foil traditional, etched etched', [cardLookGroup({ n: 'A' }), cardLookGroup({ foil: true }), cardLookGroup({ foil: true, look: 'surge' }), cardLookGroup({ foil: true, look: 'etched' }), cardLookGroup({ foil: false, look: 'etched' })], [null, 'traditional', 'traditional', 'etched', null]);

console.log(`All ${checks} foil look checks passed.`);
