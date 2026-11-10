// Searching a pile of cards (Kevin, 2026-11-10): by name, by LETTERS THAT APPEAR IN ORDER (typing "ft" finds Forest: f, then t), and by the card's type line ("creature", "land", "cr dr").
// Several words must ALL match (each one in the name or in the type line). Capitals and accents do not matter. Plain logic with no browser code (scripts/test-card-search.mjs).
const ACCENTS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g');
const norm = (text) => String(text ?? '').normalize('NFD').replace(ACCENTS, '').toLowerCase();

// Do these letters appear in this text in this order, not necessarily next to each other?
export function inOrder(text, letters) {
  if (letters.length === 0) return true;
  let at = 0;
  for (const letter of text) {
    if (letter === letters[at]) at++;
    if (at === letters.length) return true;
  }
  return false;
}

// How well one word matches a card, lower is better; null when it does not match at all:
// 0 the name starts with it, 1 the name contains it, 2 the type line contains it, 3 the letters are in the name in order. (Letters in order are for names only: in a type line they
// would match almost anything, "ft" is in "artifact".)
function wordScore(name, type, word) {
  if (name.startsWith(word)) return 0;
  if (name.includes(word)) return 1;
  if (type.includes(word)) return 2;
  if (inOrder(name, word)) return 3;
  return null;
}

export const words = (query) => norm(query).split(/\s+/).filter(Boolean);

// Does the card match the query? An empty query matches every card.
export function matchesQuery(card, query) {
  const list = words(query);
  if (list.length === 0) return true;
  const name = norm(card?.n);
  const type = norm(card?.t);
  return list.every((word) => wordScore(name, type, word) !== null);
}

// The cards that match, as { card, index } (index is the place in the pile, so a library can still say how deep a card is). With no query that is every card in its own order; with one,
// the best matches come first (the name starts with the word, then the name contains it, then the type line, then letters in order in the name), and cards that match equally well keep the pile's order.
export function searchCards(cards, query) {
  const list = words(query);
  const all = cards.map((card, index) => ({ card, index }));
  if (list.length === 0) return all;
  const scored = [];
  for (const entry of all) {
    const name = norm(entry.card.n);
    const type = norm(entry.card.t);
    let total = 0;
    let ok = true;
    for (const word of list) { const score = wordScore(name, type, word); if (score === null) { ok = false; break; } total += score; }
    if (ok) scored.push({ ...entry, score: total });
  }
  scored.sort((a, b) => a.score - b.score || a.index - b.index);
  return scored.map(({ card, index }) => ({ card, index }));
}
