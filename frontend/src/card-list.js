// Loads the card list the site serves (/data/cards.json, built by scripts/build-card-list.mjs). Shared by the deck page and
// the solo table. Returns the list, or throws if it could not be loaded or is not a card list (pages show their own words;
// the reason is never shown raw). The browser keeps it and revalidates with the ETag, so a repeat visit costs almost nothing.
export const LIST_URL = '/data/cards.json';
export const MIN_CARDS = 1000; // a real list has about 34,000; anything far smaller is not the list

export async function loadCardList(fetchImpl = fetch) {
  const response = await fetchImpl(LIST_URL, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`the card list answered HTTP ${response.status}`);
  const cards = await response.json();
  if (!Array.isArray(cards) || cards.length < MIN_CARDS || typeof cards[0]?.n !== 'string') throw new Error('that is not the card list');
  return cards;
}
