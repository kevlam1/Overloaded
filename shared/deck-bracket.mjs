// A guess at a Commander deck's bracket, from nothing but how many Game Changers it holds. Plain data in, plain data out, no browser code, so Node tests can load it (scripts/test-deck-bracket.mjs).
//
// Wizards' bracket system limits Game Changers (a list of 53 cards on 2026-11-10, marked `gc` in the card list from Scryfall's own `game_changer` field) like this: brackets 1 and 2 allow none, bracket 3 allows up to three, brackets 4 and 5 allow any
// number. The brackets also depend on things this guess cannot see (mass land destruction, chained extra turns, tutors, and above all what the table intends: a deck with no Game Changers may be bracket 1, 2 or 3, and one with
// many may be 4 or the competitive 5). So the guess is only the lowest bracket the Game Changer count allows, with 0 read as 2 (the usual precon level) and 4 or more as 4. It is a starting point the player can change.
import { PICKABLE_SECTIONS } from './deck-commander.mjs';

export const BRACKETS = [1, 2, 3, 4, 5];
export const MAX_GAME_CHANGERS_BRACKET_3 = 3;

// The bracket guess for a count of Game Changers: 0 is 2, 1 to 3 is 3, 4 or more is 4.
export function guessBracket(count) {
  const n = Number.isInteger(count) && count > 0 ? count : 0;
  return n === 0 ? 2 : n <= MAX_GAME_CHANGERS_BRACKET_3 ? 3 : 4;
}

// The Game Changers in a deck: lines are the lines of a preview (shared/deck-preview.mjs): { section, qty, status, card: { n, gc } }. Only the cards that are in the deck count (the main deck and the commander, not the sideboard,
// the companion or the maybeboard). Returns { count (copies), names (each Game Changer once, sorted) }.
export function gameChangersIn(lines) {
  let count = 0;
  const names = new Set();
  for (const line of Array.isArray(lines) ? lines : []) {
    if (!line || line.status !== 'matched' || !line.card || line.card.gc !== 1 || !PICKABLE_SECTIONS.includes(line.section)) continue;
    count += Number.isInteger(line.qty) && line.qty > 0 ? line.qty : 0;
    names.add(line.card.n);
  }
  return { count, names: [...names].sort((a, b) => a.localeCompare(b, 'en')) };
}

// The words about the guess for the page: "3 Game Changers: A, B, C" or "No Game Changers".
export function bracketNote(found) {
  if (!found || found.count === 0) return 'No Game Changers';
  return `${found.count} Game Changer${found.count === 1 ? '' : 's'}: ${found.names.join(', ')}`;
}
