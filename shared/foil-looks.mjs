// How a foil is drawn (Kevin, 2026-11-18). The data side (shared/foil-kinds.mjs) knows about 28 kinds of foil; they are drawn with 9 looks, each a set of colours and a pattern in the style sheet
// (`[data-foil="galaxy"]` and so on). A kind goes to the look that is closest to how the real card shines. Plain JavaScript, no browser code, so Node tests can load it (scripts/test-foil-looks.mjs).
import { KIND_IDS, TRADITIONAL } from './foil-kinds.mjs';

export const LOOK_GROUPS = ['traditional', 'rainbow', 'etched', 'silver', 'surge', 'galaxy', 'halo', 'fracture', 'ripple', 'confetti', 'textured', 'oilslick', 'neon', 'compleat', 'mana', 'singularity', 'gold', 'scales', 'retro', 'vault'];

// kind (or 'etched', or 'traditional') to look. Every kind in shared/foil-kinds.mjs is listed (a test checks this), and anything unknown is a traditional foil. A kind with its own look in the real world has its own look here;
// a few share one because they shine the same way (raised and embossed foil are a traditional foil with a relief; Cosmic is a scaled-down halo).
const GROUP_OF = {
  traditional: 'traditional', raised: 'traditional', embossed: 'traditional', facet: 'traditional',
  rainbow: 'rainbow', doublerainbow: 'rainbow', dazzle: 'rainbow', chocobotrack: 'rainbow', serialized: 'rainbow',
  etched: 'etched',
  silver: 'silver', silverscroll: 'silver', silveretched: 'silver',
  surge: 'surge', galaxy: 'galaxy', halo: 'halo', cosmic: 'halo', fracture: 'fracture', ripple: 'ripple', confetti: 'confetti', textured: 'textured',
  oilslick: 'oilslick', neonink: 'neon', stepandcompleat: 'compleat', mana: 'mana', singularity: 'singularity',
  gilded: 'gold', firstplace: 'gold', dragonscale: 'scales',
  retro: 'retro', fromthevault: 'vault', inventions: 'vault',
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
