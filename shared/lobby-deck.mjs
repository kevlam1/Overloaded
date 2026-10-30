// What the lobby does with decks (Kevin, 2026-10-30): you bring one of your saved decks of the table's format, the table
// learns only the commander(s), the bracket and whether you are ready, and nobody sees inside another player's deck.
// Plain functions with no browser or network code, so Node tests can load them. The page (frontend/pages/lobby/) draws
// what these return, as text, never as markup: everything from other players is untrusted.
import { commanderText, BRACKETS } from './deck-fields.mjs';
import { decksOfFormat, selectedEntry } from './deck-library.mjs';

// The fields setDeck sends for a saved deck entry ({ id, format, bracket?, deck }): the commander names of a Commander deck
// (a Standard deck has none, and no bracket: brackets are a Commander idea). The player picked the bracket, so it is never
// marked as a guess here.
export function deckFieldsOf(entry) {
  if (entry.format !== 'commander') return { commander: '', bracket: null, bracketGuess: false };
  const names = entry.deck.cards.filter((card) => card.section === 'commander').map((card) => card.n);
  return { commander: commanderText(names), bracket: entry.bracket ?? null, bracketGuess: false };
}

// The deck the lobby offers first: the one selected in the library if it is for this table's format, otherwise the first
// deck of that format, otherwise null.
export function defaultDeckFor(library, format) {
  const selected = selectedEntry(library);
  if (selected && selected.format === format) return selected;
  return decksOfFormat(library, format)[0] ?? null;
}

// One line for the picker: the deck's name and, for Commander, its commander and bracket.
export function deckChoiceLabel(entry) {
  const fields = deckFieldsOf(entry);
  const details = [fields.commander, fields.bracket ? `bracket ${fields.bracket}` : ''].filter(Boolean).join(', ');
  return details ? `${entry.deck.name} (${details})` : entry.deck.name;
}

// A member entry comes from another person's browser, so only values of the right kind are trusted for display.
const commanderOf = (member) => (typeof member?.commander === 'string' ? member.commander : '');
const bracketOf = (member) => (BRACKETS.includes(member?.bracket) ? member.bracket : null);

// Ready means ready for THIS match: a mark from an earlier match (a number) does not count.
export const isReady = (member, meta) => Number.isInteger(meta?.match) && member?.ready === meta.match;

// What a seat shows beside the name: the commander(s) and the bracket (with "guess" when the table guessed it), or '' when
// the player has told the table nothing about a deck.
export function seatDeckText(member) {
  const bracket = bracketOf(member);
  return [commanderOf(member), bracket ? `bracket ${bracket}${member.bracketGuess === true ? ' (guess)' : ''}` : ''].filter(Boolean).join(', ');
}
