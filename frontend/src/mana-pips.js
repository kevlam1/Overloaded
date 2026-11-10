// Draws a mana cost as the mana symbols instead of the text {2}{G}{G}: Scryfall's own picture of each symbol (the SVGs at svgs.scryfall.io, which the card pictures' host also serves for this site's
// content policy). What each symbol means and where its picture is are in shared/mana-cost.mjs. If a picture cannot load (or Scryfall has none for that symbol) a plain round "pip" is drawn instead: a circle
// in the color with its letter or number (the colors are in the style sheet, through classes, so nothing here needs an inline style). The whole cost carries its written form in data-cost and its
// words in aria-label; the symbols themselves are hidden from a screen reader.
import { parseCost, costWords } from '../../shared/mana-cost.mjs';

function make(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

function pip(symbol) {
  const element = make('span', `pip pip-${symbol.kind}`);
  element.title = symbol.label;
  return fillPip(element, symbol);
}

function fillPip(element, symbol) {
  symbol.colors.slice(0, 2).forEach((color, index) => element.classList.add(`p${index + 1}-${color}`));
  if (symbol.kind === 'color' || symbol.kind === 'colorless' || symbol.kind === 'generic' || symbol.kind === 'x' || symbol.kind === 'snow' || symbol.kind === 'other') element.textContent = symbol.text;
  else if (symbol.kind === 'phyrexian') element.textContent = 'Φ'; // a phi, for "or 2 life"
  else if (symbol.kind === 'hybrid' && symbol.text.startsWith('2/')) element.textContent = '2';
  return element;
}

// The symbol's picture, with the plain pip as its fallback.
function symbolNode(symbol) {
  if (!symbol.url) return pip(symbol);
  const image = new Image();
  image.className = 'pip-img';
  image.alt = '';
  image.title = symbol.label;
  image.width = 20;
  image.height = 20;
  image.decoding = 'async';
  image.draggable = false;
  image.addEventListener('error', () => image.replaceWith(pip(symbol)));
  image.src = symbol.url;
  return image;
}

// text: a cost as Scryfall writes it. Returns a span.cost, empty (and with no label) for a card with no cost.
export function manaNode(text) {
  const element = make('span', 'cost');
  element.dataset.cost = typeof text === 'string' ? text : '';
  const parts = parseCost(text);
  if (parts.length === 0) return element;
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', costWords(text));
  parts.forEach((part, index) => {
    if (index > 0) element.append(make('span', 'cost-or', '//'));
    element.append(make('span', 'pips', '')); // filled below, so the row of one cost stays together
    element.lastChild.append(...part.map(symbolNode));
  });
  return element;
}
