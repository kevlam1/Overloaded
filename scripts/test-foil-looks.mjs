// Tests for shared/foil-looks.mjs: every foil kind is drawn with one of the 8 looks. Run: node scripts/test-foil-looks.mjs
import { LOOK_GROUPS, lookGroup, unmappedKinds, cardLookGroup } from '../shared/foil-looks.mjs';
import { KIND_IDS } from '../shared/foil-kinds.mjs';

let checks = 0;
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) { console.log(`FAILED CHECK: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); process.exit(1); } };

same('every kind, traditional and etched has a look', unmappedKinds(), []);
same('every kind maps to one of the 8 looks, and every look is used', [KIND_IDS.every((kind) => LOOK_GROUPS.includes(lookGroup(kind))), LOOK_GROUPS.every((group) => [...KIND_IDS, 'traditional', 'etched'].some((kind) => lookGroup(kind) === group))], [true, true]);
same('some real kinds', ['surge', 'galaxy', 'oilslick', 'etched', 'traditional', 'retro', 'gilded'].map(lookGroup), ['surge', 'galaxy', 'oilslick', 'etched', 'rainbow', 'silver', 'gold']);
same('not foil is no look, and an unknown kind is a rainbow', [lookGroup(null), lookGroup(undefined), lookGroup('made-up')], [null, null, 'rainbow']);
same('a card: not foil none, plain foil rainbow, a look from its look', [cardLookGroup({ n: 'A' }), cardLookGroup({ foil: true }), cardLookGroup({ foil: true, look: 'galaxy' }), cardLookGroup({ foil: false, look: 'galaxy' })], [null, 'rainbow', 'galaxy', null]);

console.log(`All ${checks} foil look checks passed.`);
