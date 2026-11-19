// Which foil a printing has, from what Scryfall says about it. Plain JavaScript with no browser or network code, so Node tests can load it (scripts/test-foil-kinds.mjs).
//
// Scryfall tells the foil in three ways (checked on the Default Cards file on 2026-11-18, 120,210 records; Kevin sent the Ponder list of 28 foilings as the reference):
//   - `finishes`: which of "nonfoil", "foil" and "etched" a printing comes in. Etched is a finish of its own (1,218 printings).
//   - `promo_types`: a tag for most special foils ("surgefoil", "galaxyfoil", "oilslick", "halofoil", ...). 5,099 foil printings carry one; 316 carry two ("serialized" with "doublerainbow",
//     "oilslick" with "raisedfoil"), so KINDS is in priority order and the first tag found wins. 15 tagged printings have no foil finish at all, so a tag only counts when the printing is a foil.
//   - nothing: retro foil (Urza's Legacy up to, not including, 8th Edition), From the Vault and Kaladesh Inventions have no tag; they are found from the set (type, release date, code).
// Every other foil is a traditional (rainbow) foil. A tag this list does not know is a traditional foil too, so a new tag from Scryfall never breaks anything.
//
// What is stored per printing is a short suffix: one digit (the finishes as bits: nonfoil 1, foil 2, etched 4; the usual "nonfoil and foil" is 3) and, for a special foil, one letter (its code).
// A printing that is the usual 3 and a traditional foil has no suffix at all. The suffix goes after the card key in the per-set files (shared/printings.mjs) and as the fifth item of a row in the
// per-card files (shared/card-prints.mjs).

export const NONFOIL = 1;
export const FOIL = 2;
export const ETCHED = 4;
export const DEFAULT_FINISHES = NONFOIL | FOIL;

// [id, code, label, Scryfall tag or null]. In priority order for the tags; the kinds with no tag come last.
export const KINDS = [
  ['cosmic', 'u', 'Cosmic foil', 'cosmicfoil'],
  ['singularity', 'y', 'Singularity foil', 'singularityfoil'],
  ['serialized', 'i', 'Serialized foil', 'serialized'],
  ['oilslick', 'o', 'Oil-slick foil', 'oilslick'],
  ['stepandcompleat', 'c', 'Step-and-Compleat foil', 'stepandcompleat'],
  ['mana', 'a', 'Mana foil', 'manafoil'],
  ['dragonscale', 'd', 'Dragonscale foil', 'dragonscalefoil'],
  ['gilded', 'G', 'Gilded foil', 'gilded'],
  ['neonink', 'n', 'Neon ink foil', 'neonink'],
  ['firstplace', 'F', 'First-place foil', 'firstplacefoil'],
  ['halo', 'h', 'Halo foil', 'halofoil'],
  ['fracture', 'z', 'Fracture foil', 'fracturefoil'],
  ['ripple', 'p', 'Ripple foil', 'ripplefoil'],
  ['galaxy', 'g', 'Galaxy foil', 'galaxyfoil'],
  ['surge', 's', 'Surge foil', 'surgefoil'],
  ['confetti', 'C', 'Confetti foil', 'confettifoil'],
  ['silverscroll', 'l', 'Silver scroll foil', 'silverscroll'],
  ['silver', 'S', 'Silver foil', 'silverfoil'],
  ['textured', 't', 'Textured foil', 'textured'],
  ['embossed', 'm', 'Embossed foil', 'embossed'],
  ['raised', 'R', 'Raised foil', 'raisedfoil'],
  ['facet', 'f', 'Facet foil', 'facetfoil'],
  ['rainbow', 'w', 'Rainbow foil', 'rainbowfoil'],
  ['dazzle', 'D', 'Dazzle foil', 'dazzlefoil'],
  ['chocobotrack', 'b', 'Chocobo track foil', 'chocobotrackfoil'],
  ['doublerainbow', 'B', 'Double rainbow foil', 'doublerainbow'],
  ['silveretched', 'e', 'Silver-etched foil', 'moonlitland'], // an etched finish only (the five Moonlit Lands)
  ['retro', 'r', 'Retro foil', null],
  ['fromthevault', 'v', 'From the Vault foil', null],
  ['inventions', 'k', 'Kaladesh Inventions foil', null],
];
export const TRADITIONAL = 'traditional';
export const KIND_IDS = KINDS.map((kind) => kind[0]);
const BY_ID = new Map(KINDS.map((kind) => [kind[0], kind]));
const BY_CODE = new Map(KINDS.map((kind) => [kind[1], kind]));

// The retro foil era: Urza's Legacy came out 1999-02-15 and 8th Edition (the first traditional foil) 2003-07-28. 16 expansion and core sets, checked in the data.
export const RETRO_FROM = '1999-02-15';
export const RETRO_BEFORE = '2003-07-28';

// The finishes of a printing as bits. A printing with no usable list is taken as the usual "nonfoil and foil".
export function finishMask(finishes) {
  if (!Array.isArray(finishes)) return DEFAULT_FINISHES;
  const mask = (finishes.includes('nonfoil') ? NONFOIL : 0) | (finishes.includes('foil') ? FOIL : 0) | (finishes.includes('etched') ? ETCHED : 0);
  return mask || DEFAULT_FINISHES;
}
export const hasFoilFinish = (mask) => (mask & FOIL) !== 0;
export const hasEtchedFinish = (mask) => (mask & ETCHED) !== 0;
// Exists only as foil or etched: no nonfoil finish. (Such a card is a foil card whether or not the list marks it.)
export const isFoilOnlyMask = (mask) => (mask & NONFOIL) === 0;

// The kind of foil a printing's FOIL finish is, from a Scryfall printing record: its `promo_types`, then the set. A printing with no foil finish has no foil kind, except the Moonlit Lands (etched only).
export function foilKindOf(printing) {
  const mask = finishMask(printing?.finishes);
  const tags = Array.isArray(printing?.promo_types) ? printing.promo_types : [];
  if (!hasFoilFinish(mask)) return hasEtchedFinish(mask) && tags.includes('moonlitland') ? 'silveretched' : TRADITIONAL;
  for (const [id, , , tag] of KINDS) if (tag && id !== 'silveretched' && tags.includes(tag)) return id;
  if (printing.set_type === 'from_the_vault') return 'fromthevault';
  if (printing.set === 'mps') return 'inventions';
  if ((printing.set_type === 'expansion' || printing.set_type === 'core') && typeof printing.released_at === 'string' && printing.released_at >= RETRO_FROM && printing.released_at < RETRO_BEFORE) return 'retro';
  return TRADITIONAL;
}

// The suffix to store for a Scryfall printing record: '' for the usual (nonfoil and foil, traditional), else the finishes digit and, for a special foil, its letter.
export function foilSuffixOf(printing) {
  const mask = finishMask(printing?.finishes);
  const kind = foilKindOf(printing);
  if (mask === DEFAULT_FINISHES && kind === TRADITIONAL) return '';
  return `${mask}${kind === TRADITIONAL ? '' : BY_ID.get(kind)[1]}`;
}

// A stored suffix back to its fields, or null when it is not one (never trust what came over the network). '' is the usual printing: { finishes: 3, kind: 'traditional', foilOnly: false }.
export function readFoilSuffix(suffix) {
  if (suffix === '') return { finishes: DEFAULT_FINISHES, kind: TRADITIONAL, foilOnly: false };
  if (typeof suffix !== 'string' || suffix.length < 1 || suffix.length > 2 || !/^[1-7]$/.test(suffix[0])) return null;
  const finishes = Number(suffix[0]);
  let kind = TRADITIONAL;
  if (suffix.length === 2) {
    const found = BY_CODE.get(suffix[1]);
    if (!found) return null;
    kind = found[0];
  }
  return { finishes, kind, foilOnly: isFoilOnlyMask(finishes) };
}

// The look a chosen finish has: 'foil' gives the printing's kind; 'etched' gives 'silveretched' for the Moonlit Lands and 'etched' for every other etched card; anything else has no foil.
export function lookOf(kind, finish) {
  if (finish === 'etched') return kind === 'silveretched' ? 'silveretched' : 'etched';
  if (finish === 'foil') return kind === 'silveretched' ? 'etched' : BY_ID.has(kind) ? kind : TRADITIONAL;
  return null;
}

// Words for a look, for a tooltip or a label: 'Foil' for traditional, 'Etched foil' for etched.
export function foilLabel(look) {
  if (look === 'etched') return 'Etched foil';
  if (look === TRADITIONAL || !BY_ID.has(look)) return 'Foil';
  return BY_ID.get(look)[2];
}
