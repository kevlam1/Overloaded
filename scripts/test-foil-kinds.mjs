// Tests for shared/foil-kinds.mjs: which foil a Scryfall printing has, and the short suffix stored for it. No browser, no network. Run: node scripts/test-foil-kinds.mjs
import { KINDS, KIND_IDS, TRADITIONAL, DEFAULT_FINISHES, RETRO_FROM, RETRO_BEFORE, finishMask, isFoilOnlyMask, foilKindOf, foilSuffixOf, readFoilSuffix, lookOf, foilLabel } from '../shared/foil-kinds.mjs';

let checks = 0;
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) { console.log(`FAILED CHECK: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); process.exit(1); } };
const card = (extra) => ({ set: 'xyz', set_type: 'expansion', released_at: '2020-01-01', finishes: ['nonfoil', 'foil'], promo_types: [], ...extra });

// the table
same('every kind has a different id, a different one-character code that is not a digit, and a label', [new Set(KINDS.map((k) => k[0])).size, new Set(KINDS.map((k) => k[1])).size, KINDS.every((k) => /^[A-Za-z]$/.test(k[1]) && k[2].length > 0)], [KINDS.length, KINDS.length, true]);
same('a Scryfall tag belongs to one kind only, and the three set-derived kinds have none', [new Set(KINDS.filter((k) => k[3]).map((k) => k[3])).size, KINDS.filter((k) => k[3] === null).map((k) => k[0])], [KINDS.filter((k) => k[3]).length, ['retro', 'fromthevault', 'inventions']]);

// finishes
same('finishes as bits: nonfoil 1, foil 2, etched 4; none or a list that is not one is the usual 3', [finishMask(['nonfoil']), finishMask(['foil']), finishMask(['etched']), finishMask(['nonfoil', 'foil', 'etched']), finishMask([]), finishMask(undefined), finishMask(['sparkle'])], [1, 2, 4, 7, 3, 3, 3]);
same('only a printing with no nonfoil finish is foil only', [isFoilOnlyMask(2), isFoilOnlyMask(4), isFoilOnlyMask(6), isFoilOnlyMask(3), isFoilOnlyMask(1)], [true, true, true, false, false]);

// the kind, from the tags
same('a tag gives its kind', [foilKindOf(card({ promo_types: ['surgefoil'] })), foilKindOf(card({ promo_types: ['galaxyfoil'] })), foilKindOf(card({ promo_types: ['halofoil', 'boosterfun'] }))], ['surge', 'galaxy', 'halo']);
same('with two tags the first in priority order wins (serialized over double rainbow, oil-slick over raised)', [foilKindOf(card({ promo_types: ['doublerainbow', 'serialized'] })), foilKindOf(card({ promo_types: ['raisedfoil', 'oilslick'] }))], ['serialized', 'oilslick']);
same('a tag that is not a foil, or one we do not know, is a traditional foil', [foilKindOf(card({ promo_types: ['boosterfun', 'universesbeyond'] })), foilKindOf(card({ promo_types: ['brandnewfoil2030'] })), foilKindOf(card())], [TRADITIONAL, TRADITIONAL, TRADITIONAL]);
same('a tag only counts when the printing has a foil finish (15 tagged printings are nonfoil only)', [foilKindOf(card({ finishes: ['nonfoil'], promo_types: ['serialized'] })), foilKindOf(card({ finishes: ['etched'], promo_types: ['ripplefoil'] }))], [TRADITIONAL, TRADITIONAL]);
same('the Moonlit Lands (etched only, tagged moonlitland) are silver-etched; the tag on a foil printing means nothing', [foilKindOf(card({ finishes: ['etched'], promo_types: ['moonlitland'] })), foilKindOf(card({ finishes: ['foil'], promo_types: ['moonlitland'] }))], ['silveretched', TRADITIONAL]);

// the kind, from the set
same('From the Vault and Kaladesh Inventions are found from the set', [foilKindOf(card({ set_type: 'from_the_vault', set: 'v13', finishes: ['foil'] })), foilKindOf(card({ set_type: 'masterpiece', set: 'mps', finishes: ['foil'] })), foilKindOf(card({ set_type: 'masterpiece', set: 'mp2', finishes: ['foil'] }))], ['fromthevault', 'inventions', TRADITIONAL]);
same('retro foil: expansion and core sets from Urza\'s Legacy up to, not including, 8th Edition (the dates are the edges)', [RETRO_FROM, RETRO_BEFORE, foilKindOf(card({ released_at: '1999-02-15' })), foilKindOf(card({ released_at: '1999-02-14' })), foilKindOf(card({ released_at: '2003-07-27', set_type: 'core' })), foilKindOf(card({ released_at: '2003-07-28' }))], ['1999-02-15', '2003-07-28', 'retro', TRADITIONAL, 'retro', TRADITIONAL]);
same('retro needs a foil finish and an expansion or core set; a tag still comes first', [foilKindOf(card({ released_at: '2001-01-01', finishes: ['nonfoil'] })), foilKindOf(card({ released_at: '2001-01-01', set_type: 'promo' })), foilKindOf(card({ released_at: '2001-01-01', promo_types: ['textured'] }))], [TRADITIONAL, TRADITIONAL, 'textured']);

// the suffix
same('the usual printing (nonfoil and foil, traditional), or one with no finishes listed, has no suffix', [foilSuffixOf(card()), foilSuffixOf(card({ finishes: undefined })), foilSuffixOf(card({ finishes: [] }))], ['', '', '']);
same('finishes only: foil only 2, etched only 4, nonfoil only 1, nonfoil and etched 5, foil and etched 6, all three 7', [['foil'], ['etched'], ['nonfoil'], ['nonfoil', 'etched'], ['foil', 'etched'], ['nonfoil', 'foil', 'etched']].map((finishes) => foilSuffixOf(card({ finishes }))), ['2', '4', '1', '5', '6', '7']);
same('a special foil adds its letter: surge with nonfoil 3s, foil only 2s, silver-etched 4e, retro 3r', [foilSuffixOf(card({ promo_types: ['surgefoil'] })), foilSuffixOf(card({ finishes: ['foil'], promo_types: ['surgefoil'] })), foilSuffixOf(card({ finishes: ['etched'], promo_types: ['moonlitland'] })), foilSuffixOf(card({ released_at: '2000-06-05' }))], ['3s', '2s', '4e', '3r']);

// reading it back
same('a suffix reads back: nothing is the usual, a digit the finishes, a letter the kind', [readFoilSuffix(''), readFoilSuffix('2'), readFoilSuffix('3s'), readFoilSuffix('4e')], [{ finishes: DEFAULT_FINISHES, kind: TRADITIONAL, foilOnly: false }, { finishes: 2, kind: TRADITIONAL, foilOnly: true }, { finishes: 3, kind: 'surge', foilOnly: false }, { finishes: 4, kind: 'silveretched', foilOnly: true }]);
same('anything else is refused: 0, 8, a letter first, an unknown letter, too long, not text', ['0', '8', 's', '3?', '3ss', '3 ', ' 3', 3, null, undefined, {}].map(readFoilSuffix), Array(11).fill(null));
same('every code reads back as its own kind, and the suffix written for that kind is the same text', KINDS.map(([id, code]) => [readFoilSuffix(`3${code}`)?.kind === id, KIND_IDS.includes(id)]).every(([a, b]) => a && b), true);

// the look of a chosen finish and its words
same('the look: foil gives the printing\'s kind, etched gives etched (silver-etched for the Moonlit Lands), nonfoil gives none', [lookOf('surge', 'foil'), lookOf(TRADITIONAL, 'foil'), lookOf(TRADITIONAL, 'etched'), lookOf('silveretched', 'etched'), lookOf('surge', 'nonfoil'), lookOf('not a kind', 'foil')], ['surge', TRADITIONAL, 'etched', 'silveretched', null, TRADITIONAL]);
same('words: Foil, Etched foil, and the kind\'s label', [foilLabel(TRADITIONAL), foilLabel('etched'), foilLabel('surge'), foilLabel('silveretched'), foilLabel('nonsense')], ['Foil', 'Etched foil', 'Surge foil', 'Silver-etched foil', 'Foil']);

console.log(`All ${checks} foil kind checks passed.`);
