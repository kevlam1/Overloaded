// How a foil is drawn (Kevin, 2026-11-18). The data side (shared/foil-kinds.mjs) knows about 28 kinds of foil and etched, but they are ALL drawn with ONE traditional foil: the 20 looks made from photos of the real
// cards were scrapped the same day (they are in git history, commit 69cde4c), and etched foil was given the traditional look too. Plain JavaScript, no browser code, so Node tests can load it (scripts/test-foil-looks.mjs).
export const LOOK_GROUPS = ['traditional'];

// The look to draw for a foil look from lookOf() (or a card's `look`): 'traditional' for every foil, null for a card that is not foil.
export function lookGroup(look) {
  if (look === null || look === undefined || look === false) return null;
  return 'traditional';
}

// The look of a card as the game and the deck page hold it: `foil` (true) and `look` (a kind or 'etched', absent for a plain foil).
export const cardLookGroup = (card) => (card?.foil === true ? lookGroup(card.look ?? 'traditional') : null);
