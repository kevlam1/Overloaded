// The only things the table learns about a player's deck (Kevin, 2026-10-30): the commander(s) by card name, the bracket
// (1 to 5, optional) and whether that bracket was only a guess. Nobody sees inside another player's deck and the list is
// never stored in the database. These are the page's checks before it writes; the database rules
// (backend/database.rules.json, the member entry) accept the same values and are the real lock.
// No browser-only or server-only code here, so Node tests can load it.
import { scrubText } from './player-name.mjs';

// The rules accept a commander text of at most this many UTF-16 units. Measured on the card list of 2026-10-30
// (34,172 cards): the longest legendary name is 61 and two legendary names joined with " & " reach 123, but the longest
// name of ANY card is a 141-unit joke card and two such names reach 208, so 220 holds any two real names with a margin.
export const COMMANDER_MAX = 220;
export const COMMANDER_JOINER = ' & ';
export const BRACKETS = [1, 2, 3, 4, 5];

// One commander text from the commander names of a deck: "Name", or "Name & Other Name" for two (a partner pair, or two
// commanders), and an empty text for a deck with none. More than two is refused: no format has three commanders.
export function commanderText(names) {
  if (!Array.isArray(names)) throw new Error('The commanders must be a list of card names.');
  const cleaned = names.map((name) => scrubText(name)).filter((name) => name.length > 0);
  if (cleaned.length > 2) throw new Error('A deck has at most two commanders.');
  return cleaned.join(COMMANDER_JOINER);
}

// What setDeck writes: { commander: text or null, bracket: 1..5 or null, bracketGuess: true or null }. null means "not
// stored" (a deck with no commander stores no commander; the rules accept bracketGuess only as true, and only next to a
// bracket), so "changed" means the same to the page and to the rule that un-readies. Throws a message for people when
// the values are not allowed.
export function cleanDeckFields({ commander = '', bracket = null, bracketGuess = false } = {}) {
  if (typeof commander !== 'string') throw new Error('The commander must be text.');
  const text = scrubText(commander);
  if (text.length > COMMANDER_MAX) throw new Error(`The commander names are too long (${COMMANDER_MAX} characters at most).`);
  const hasBracket = bracket !== null; // (an undefined bracket became null in the parameter list above)
  if (hasBracket && !BRACKETS.includes(bracket)) throw new Error('A bracket is a whole number from 1 to 5.');
  if (typeof bracketGuess !== 'boolean') throw new Error('Whether the bracket is a guess must be true or false.');
  if (bracketGuess && !hasBracket) throw new Error('A guess needs a bracket.');
  return { commander: text === '' ? null : text, bracket: hasBracket ? bracket : null, bracketGuess: bracketGuess ? true : null };
}

// Did the deck fields change? `mine` is the member entry as stored, `next` is what cleanDeckFields returned. A field
// that is not stored is null.
export function deckFieldsChanged(mine, next) {
  return (mine?.commander ?? null) !== next.commander
    || (mine?.bracket ?? null) !== next.bracket
    || (mine?.bracketGuess ?? null) !== next.bracketGuess;
}
