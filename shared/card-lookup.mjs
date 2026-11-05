// What the card list knows about a card in a saved deck. Plain JavaScript with no browser or network code.
// A saved deck keeps each card's id, name and quantity, but not its type line, cost or keywords, and the id can go stale:
// Scryfall changed the default printing id of 162 cards in 3 days (docs/scryfall.md, 2026-10-29). So a card is found by its
// id first and by its name second. The picture is still made from the SAVED id, which keeps working.
import { normalizeName } from './card-match.mjs';

// cards: the card list ({ n, t, m, k, i } each, and pt for a card with printed power and toughness). Returns (savedCard) => { t, m, k, pt? }
// or null if the list does not know it. pt is the printed power and toughness as text ("2/2"), only for a card that has them.
export function makeLookup(cards) {
  const byId = new Map();
  const byName = new Map();
  for (const card of cards) {
    byId.set(card.i, card);
    const key = normalizeName(card.n);
    if (!byName.has(key)) byName.set(key, card); // the first of two cards with one name (14 such names exist)
  }
  return (saved) => {
    let card = typeof saved?.i === 'string' ? byId.get(saved.i) : undefined;
    if (!card && typeof saved?.n === 'string') card = byName.get(normalizeName(saved.n));
    return card ? { t: card.t, m: card.m, k: card.k, ...(typeof card.pt === 'string' ? { pt: card.pt } : {}) } : null;
  };
}
