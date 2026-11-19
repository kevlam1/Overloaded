// One saved deck as a card (Kevin, 2026-11-19: moved out of deck-importer.js so the lobby's deck picker draws the same card as the deck page). Plain DOM, no dependencies but the helpers imported here.
import { imageUrl } from '../../shared/card-image.mjs';
import { deckFace, colorsAsCost, tintGradient, COLOR_NAMES } from '../../shared/deck-colors.mjs';
import { manaNode } from './mana-pips.js';

function make(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const totalCards = (deck) => deck.cards.reduce((sum, card) => sum + card.qty, 0);

// One saved deck as a card of CSS: the art of its commander's printing (two commanders split it diagonally, the first on the upper left) over a tint of its colors, with the deck's name, its commanders, its
// colors as the mana symbols, its bracket (and "guess" when it was guessed) and its size. The tint shows until the art has loaded, and stays if it cannot be loaded. The whole card is a button that opens the deck;
// the rest (Play solo, Delete) is in the menu at its corner. The colors come from the card list, so they appear as soon as it has loaded.
export function makeDeckFace(entry, cardsByName, { action = '', label = '' } = {}) {
  const { deck } = entry;
  const face = deckFace(entry, cardsByName);
  const faceElement = make('button', 'deck-face');
  faceElement.type = 'button';
  if (action) faceElement.dataset.action = action;
  faceElement.setAttribute('aria-label', label || deck.name);
  faceElement.dataset.colors = face.colors;
  const half = (className, colors, picture) => {
    const element = make('span', `face-half ${className}`);
    element.style.setProperty('--tint', tintGradient(colors));
    const url = picture ? imageUrl(picture, 'art_crop') : null;
    if (url) {
      const art = new Image();
      art.alt = '';
      art.loading = 'lazy';
      art.decoding = 'async';
      art.draggable = false;
      art.addEventListener('load', () => faceElement.classList.add('has-art')); // light text on the art
      art.addEventListener('error', () => art.remove()); // the tint stays
      art.src = url;
      element.append(art);
    }
    return element;
  };
  if (face.split) {
    faceElement.dataset.split = '1';
    faceElement.append(half('face-a', face.commanders[0].colors, face.commanders[0].picture), half('face-b', face.commanders[1].colors, face.commanders[1].picture));
  } else {
    faceElement.append(half('face-whole', face.colors, face.commanders[0]?.picture ?? null));
  }
  const text = make('span', 'saved-text');
  const top = make('span', 'face-top');
  top.append(make('strong', 'saved-name', deck.name));
  text.append(top);
  const commanders = face.commanders.map((commander) => commander.name);
  if (commanders.length) {
    const line = make('span', 'face-commanders');
    commanders.forEach((commander, index) => line.append(make('span', 'face-commander', commander), ...(index < commanders.length - 1 ? [make('span', 'face-and', ' & ')] : [])));
    text.append(line);
  }
  const bottom = make('span', 'face-bottom');
  const pips = face.colors ? manaNode(colorsAsCost(face.colors)) : make('span', 'cost');
  pips.classList.add('face-colors');
  if (!face.colors) pips.textContent = cardsByName ? 'Colorless' : '';
  bottom.append(pips);
  if (entry.bracket) {
    const bracket = make('span', 'face-bracket', `Bracket ${entry.bracket}`);
    if (entry.bracketGuess === true) { bracket.classList.add('guessed'); bracket.title = 'Guessed from the Game Changers in the deck. Open the deck to choose one.'; }
    bottom.append(bracket);
  }
  bottom.append(make('span', 'face-facts', plural(totalCards(deck), 'card', 'cards'))); // (Kevin, 2026-11-18: only the number of cards of the main deck, nothing else)
  text.append(bottom);
  faceElement.append(text);
  if (face.colors) faceElement.title = `Colors: ${face.colors.split('').map((color) => COLOR_NAMES[color]).join(', ')}`;
  return faceElement;
}
