// Reads a mana cost as Scryfall writes it ("{2}{G}{G}", "{1}{R} // {2}{W}" for a card with two costs) into symbols a page can draw. Plain data in, plain data out, no browser
// code, so Node tests can load it (scripts/test-mana-cost.mjs). The symbols are drawn by frontend/src/mana-pips.js.
//
// A symbol is { text, kind, colors, label }:
//   kind    'color' (W U B R G), 'colorless' (C), 'generic' (a number), 'x' (X, Y, Z), 'snow' (S), 'hybrid' ({W/U}, {2/W}), 'phyrexian' ({G/P}, {G/W/P}), or 'other' (anything else, shown as written)
//   colors  the colors in it, as letters in the order written (a hybrid has two, a phyrexian one or two, a generic none)
//   label   the words for a screen reader: "2 generic mana", "green mana", "white or blue mana", "green or 2 life"
// A cost is a list of parts (a split or adventure card has two), each a list of symbols. Anything that is not a {...} symbol is dropped, and a damaged cost gives no symbols.

const COLOR_WORDS = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' };
const SYMBOL = /\{([^{}]{1,10})\}/g;
const MAX_GENERIC = 100; // a generic number above this is not a mana cost (the largest real one is 1,000,000 on a joke card, which the page shows as text)

function describe(text) {
  const upper = text.toUpperCase();
  if (/^[WUBRG]$/.test(upper)) return { text: upper, kind: 'color', colors: [upper], label: `${COLOR_WORDS[upper]} mana` };
  if (upper === 'C') return { text: 'C', kind: 'colorless', colors: [], label: 'colorless mana' };
  if (upper === 'S') return { text: 'S', kind: 'snow', colors: [], label: 'snow mana' };
  if (/^[XYZ]$/.test(upper)) return { text: upper, kind: 'x', colors: [], label: `${upper} mana` };
  if (/^\d{1,3}$/.test(upper) && Number(upper) <= MAX_GENERIC) return { text: String(Number(upper)), kind: 'generic', colors: [], label: `${Number(upper)} generic mana` };
  const parts = upper.split('/');
  if (parts.length >= 2 && parts.length <= 3) {
    const phyrexian = parts.includes('P');
    const rest = parts.filter((part) => part !== 'P');
    if (phyrexian && rest.length >= 1 && rest.every((part) => /^[WUBRG]$/.test(part))) {
      return { text: upper, kind: 'phyrexian', colors: rest, label: `${rest.map((part) => COLOR_WORDS[part]).join(' or ')} or 2 life` };
    }
    if (!phyrexian && parts.length === 2 && parts.every((part) => /^[WUBRG]$/.test(part))) {
      return { text: upper, kind: 'hybrid', colors: parts, label: `${COLOR_WORDS[parts[0]]} or ${COLOR_WORDS[parts[1]]} mana` };
    }
    if (!phyrexian && parts.length === 2 && /^2$/.test(parts[0]) && /^[WUBRG]$/.test(parts[1])) {
      return { text: upper, kind: 'hybrid', colors: [parts[1]], label: `2 generic or ${COLOR_WORDS[parts[1]]} mana` }; // {2/W}
    }
  }
  return { text, kind: 'other', colors: [], label: text };
}

// "{2}{G}{G}" -> the symbols. A string with nothing readable gives [].
export function parseSymbols(text) {
  if (typeof text !== 'string') return [];
  return [...text.matchAll(SYMBOL)].map((match) => describe(match[1]));
}

// A whole cost: the parts split on " // ". Returns [[symbol, ...], ...] with empty parts removed ([] for no cost).
export function parseCost(text) {
  if (typeof text !== 'string') return [];
  return text.split(' // ').map(parseSymbols).filter((part) => part.length > 0);
}

// The cost in words for a screen reader: "2 generic mana, green mana, green mana" and, for two costs, the parts joined with " or ".
export const costWords = (text) => parseCost(text).map((part) => part.map((symbol) => symbol.label).join(', ')).join(' or ');
