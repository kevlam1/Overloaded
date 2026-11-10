// Changing which printing a card in a pasted decklist uses, by rewriting its line(s) in the list's text. The text is the deck's source of truth (it is what is saved and what the exact printings are read from), so
// the choice lives there as an ordinary "(SET) number" the player could have typed. Plain data in, plain data out, no browser code, so Node tests can load it (scripts/test-deck-text-edit.mjs).
import { parseDeckText } from './deck-text.mjs';
import { SET_CODE } from './printings.mjs';

const NEWLINE = /\r\n|\r|\n/;

// text: the pasted list. lineNumbers: the lines (1-based) that hold the card (a preview line knows them, sourceLines). name: the card's real name. printing: { set, number } for a printing, or null for the card's default
// (the set and number are taken off). Every line is rewritten as "quantity name (SET) number" and keeps its quantity and its foil mark; a line that is not a card line is left alone. The rest of the text is untouched.
// Returns { text, changed: how many lines were rewritten }.
export function setPrintingInText(text, lineNumbers, name, printing) {
  if (typeof text !== 'string' || typeof name !== 'string' || !name.trim() || /[\r\n]/.test(name) || !Array.isArray(lineNumbers)) return { text: typeof text === 'string' ? text : '', changed: 0 };
  if (printing !== null && !(printing && SET_CODE.test(printing.set ?? '') && typeof printing.number === 'string' && /^[^\s/\\]{1,30}$/.test(printing.number))) return { text, changed: 0 };
  const lines = text.split(NEWLINE);
  let changed = 0;
  for (const number of new Set(lineNumbers)) {
    if (!Number.isInteger(number) || number < 1 || number > lines.length) continue;
    const entry = parseDeckText(lines[number - 1]).entries[0];
    if (!entry) continue;
    const rewritten = `${entry.qty} ${name.trim()}${printing ? ` (${printing.set.toUpperCase()}) ${printing.number}` : ''}${entry.foil ? ' *F*' : ''}`;
    if (rewritten !== lines[number - 1]) { lines[number - 1] = rewritten; changed++; }
  }
  return { text: changed ? lines.join('\n') : text, changed };
}
