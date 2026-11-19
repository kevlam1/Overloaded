// Tests for shared/foil-looks.mjs: every foil kind is drawn with one of the looks. Run: node scripts/test-foil-looks.mjs
import { LOOK_GROUPS, lookGroup, unmappedKinds, cardLookGroup } from '../shared/foil-looks.mjs';
import { KIND_IDS } from '../shared/foil-kinds.mjs';

let checks = 0;
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) { console.log(`FAILED CHECK: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); process.exit(1); } };

same('every kind, traditional and etched has a look', unmappedKinds(), []);
same('every kind maps to one of the looks, and every look is used', [KIND_IDS.every((kind) => LOOK_GROUPS.includes(lookGroup(kind))), LOOK_GROUPS.every((group) => [...KIND_IDS, 'traditional', 'etched'].some((kind) => lookGroup(kind) === group))], [true, true]);
same('some real kinds', ['surge', 'galaxy', 'oilslick', 'etched', 'traditional', 'rainbow', 'retro', 'gilded', 'neonink', 'stepandcompleat', 'dragonscale', 'fromthevault', 'cosmic'].map(lookGroup), ['surge', 'galaxy', 'oilslick', 'etched', 'traditional', 'rainbow', 'retro', 'gold', 'neon', 'compleat', 'scales', 'vault', 'halo']);
same('embossed, raised and facet are traditional, the true rainbows are rainbow, and textured and confetti have their own', ['embossed', 'raised', 'facet', 'rainbow', 'doublerainbow', 'dazzle', 'chocobotrack', 'serialized', 'textured', 'confetti'].map(lookGroup), ['traditional', 'traditional', 'traditional', 'rainbow', 'rainbow', 'rainbow', 'rainbow', 'rainbow', 'textured', 'confetti']);
same('not foil is no look, and an unknown kind is a traditional foil', [lookGroup(null), lookGroup(undefined), lookGroup('made-up')], [null, null, 'traditional']);
same('a card: not foil none, plain foil traditional, a look from its look', [cardLookGroup({ n: 'A' }), cardLookGroup({ foil: true }), cardLookGroup({ foil: true, look: 'galaxy' }), cardLookGroup({ foil: false, look: 'galaxy' })], [null, 'traditional', 'galaxy', null]);

console.log(`All ${checks} foil look checks passed.`);
