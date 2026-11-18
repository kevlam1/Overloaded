// The game history (Kevin, 2026-11-18): the moves of this game in order, for the "Game history" bar of the solo table. Plain logic with no browser code (scripts/test-game-history.mjs).
// An entry is { turn, text }; the list is oldest first and keeps the newest MAX_ENTRIES. Nothing is saved: a new game starts an empty history.
export const MAX_ENTRIES = 200;
export const MAX_LENGTH = 100; // letters in one entry

// The text of an entry as it is kept: not text gives '', runs of spaces and control characters become one space, and it is cut to MAX_LENGTH.
export function cleanEntry(value) {
  if (typeof value !== 'string') return '';
  let out = '';
  for (const ch of value) { const code = ch.codePointAt(0); out += code < 32 || code === 127 ? ' ' : ch; }
  return out.replace(/\s+/g, ' ').trim().slice(0, MAX_LENGTH);
}

// A new list with the entry at the end (the turn is a whole number from 1, or 1). An entry with no text is not added (the same list).
export function addEntry(history, text, turn) {
  const clean = cleanEntry(text);
  if (!clean) return history;
  const number = Number.isInteger(turn) && turn >= 1 ? turn : 1;
  return [...history, { turn: number, text: clean }].slice(-MAX_ENTRIES);
}
