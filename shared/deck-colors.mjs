// The colors of a deck and of its commanders, for the saved decks' cards. Plain data in, plain data out, no browser code, so Node tests can load it (scripts/test-deck-colors.mjs).
// A color is one of the letters W U B R G; an identity is a string of them in that order ("WUB"), or '' for none (the card list's \`ci\`, Scryfall's color identity).
export const COLORS = ['W', 'U', 'B', 'R', 'G'];
export const COLOR_NAMES = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' };
// The tint each color gives a deck's card (soft, so dark text reads on all of them), and the tint of no color.
export const COLOR_TINTS = { W: '#f4f1d0', U: '#acd4f1', B: '#9a8e96', R: '#f0a98f', G: '#aed5b4' };
export const COLORLESS_TINT = '#cdc9c6';

import { parseCost } from './mana-cost.mjs';

const clean = (identity) => (typeof identity === 'string' ? COLORS.filter((color) => identity.includes(color)).join('') : '');

// The union of some identities, in W U B R G order.
export function unionOf(identities) {
  const found = new Set();
  for (const identity of Array.isArray(identities) ? identities : []) for (const color of clean(identity)) found.add(color);
  return COLORS.filter((color) => found.has(color)).join('');
}

// The identity of a card by its name in the card list (byName: a Map from name to entry), or '' when it is not there.
// The card's own identity (its `ci`), together with the colors in its cost. The cost is always inside the identity, so with a current card list nothing changes; with an older list that has no `ci` at all
// (a red commander showed as colorless) the colors still come from the cost.
export function identityOfName(byName, name) {
  const card = byName?.get?.(name);
  if (!card) return '';
  return unionOf([card.ci, parseCost(card.m).flat().flatMap((symbol) => symbol.colors).join('')]);
}

// What a saved deck's card shows: { commanders: [{ name, colors, picture }], colors, split } (picture: the id of the printing the deck uses for that commander, its chosen printing or else its card id). A Commander deck has its commanders (one or two) and its colors are theirs together; any other deck has no commanders and its colors are the union
// over every card in the deck (not the sideboard). split is true for two commanders (the card is split diagonally, the first commander's colors on the upper left). entry is a saved library entry { format, deck }.
export function deckFace(entry, byName) {
  const cards = Array.isArray(entry?.deck?.cards) ? entry.deck.cards : [];
  if (entry?.format === 'commander') {
    const commanders = cards.filter((card) => card.section === 'commander').slice(0, 2).map((card) => ({ name: card.n, colors: identityOfName(byName, card.n), picture: card.p ?? card.i ?? null }));
    if (commanders.length) return { commanders, colors: unionOf(commanders.map((commander) => commander.colors)), split: commanders.length === 2 };
  }
  const deckCards = cards.filter((card) => card.section === 'main' || card.section === 'commander');
  return { commanders: [], colors: unionOf(deckCards.map((card) => identityOfName(byName, card.n))), split: false };
}

// The pips for a set of colors as a cost string the page already knows how to draw ("WU" is "{W}{U}"), or '' for none.
export const colorsAsCost = (colors) => clean(colors).split('').map((color) => `{${color}}`).join('');

// The CSS for the face of a card with these colors: a gradient across the tints of its colors (one tint for one color, the colorless tint for none). The page sets it as a custom property.
export function tintGradient(colors) {
  const tints = clean(colors).split('').map((color) => COLOR_TINTS[color]);
  if (tints.length === 0) return `linear-gradient(135deg, ${COLORLESS_TINT}, ${COLORLESS_TINT})`;
  if (tints.length === 1) return `linear-gradient(135deg, ${tints[0]}, ${tints[0]})`;
  return `linear-gradient(135deg, ${tints.join(', ')})`;
}
