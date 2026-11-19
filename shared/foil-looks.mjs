// How a foil is drawn (Kevin, 2026-11-18). The data side (shared/foil-kinds.mjs) knows about 28 kinds of foil; they are drawn with 9 looks, each a set of colours and a pattern in the style sheet
// (`[data-foil="galaxy"]` and so on). A kind goes to the look that is closest to how the real card shines. Plain JavaScript, no browser code, so Node tests can load it (scripts/test-foil-looks.mjs).
import { KIND_IDS, TRADITIONAL } from './foil-kinds.mjs';

export const LOOK_GROUPS = ['traditional', 'rainbow', 'etched', 'surge', 'galaxy', 'oilslick', 'halo', 'gold', 'silver'];

// kind (or 'etched', or 'traditional') to look. Every kind in shared/foil-kinds.mjs is listed (a test checks this), and anything unknown is a traditional foil.
const GROUP_OF = {
  traditional: 'traditional', rainbow: 'rainbow', doublerainbow: 'rainbow', raised: 'rainbow', textured: 'rainbow', embossed: 'rainbow', facet: 'rainbow', dazzle: 'rainbow', chocobotrack: 'rainbow', firstplace: 'rainbow', serialized: 'rainbow', confetti: 'rainbow',
  etched: 'etched',
  surge: 'surge', ripple: 'surge', mana: 'surge',
  galaxy: 'galaxy', cosmic: 'galaxy', singularity: 'galaxy', stepandcompleat: 'galaxy',
  oilslick: 'oilslick', neonink: 'oilslick',
  halo: 'halo', fracture: 'halo',
  gilded: 'gold', dragonscale: 'gold',
  silver: 'silver', silverscroll: 'silver', silveretched: 'silver', retro: 'silver', fromthevault: 'silver', inventions: 'silver',
};

// The look to draw for a foil look from lookOf(): one of LOOK_GROUPS, or null for a card that is not foil.
export function lookGroup(look) {
  if (look === null || look === undefined || look === false) return null;
  return GROUP_OF[look] ?? 'traditional';
}

// Every kind that has no entry (for the test).
export const unmappedKinds = () => [...KIND_IDS, TRADITIONAL, 'etched'].filter((kind) => !Object.hasOwn(GROUP_OF, kind));

// The look of a card as the game and the deck page hold it: `foil` (true) and `look` (a kind or 'etched', absent for a plain foil).
export const cardLookGroup = (card) => (card?.foil === true ? lookGroup(card.look ?? TRADITIONAL) : null);
