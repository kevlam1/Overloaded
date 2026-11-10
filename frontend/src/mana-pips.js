// Draws a mana cost as small round symbols ("pips") instead of the text {2}{G}{G}: a colored circle with the color's letter for W U B R G, a grey circle with a number for generic mana, and so
// on. They are plain shapes made for this site (a circle, a letter, a color), not Wizards' symbols. What each symbol means is in shared/mana-cost.mjs; the colors are in the style sheet
// (.pip), through classes, so nothing here needs an inline style. The whole cost carries its written form in data-cost and its words in aria-label; the pips themselves are hidden from a
// screen reader.
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
  symbol.colors.slice(0, 2).forEach((color, index) => element.classList.add(`p${index + 1}-${color}`));
  if (symbol.kind === 'color' || symbol.kind === 'colorless' || symbol.kind === 'generic' || symbol.kind === 'x' || symbol.kind === 'snow' || symbol.kind === 'other') element.textContent = symbol.text;
  else if (symbol.kind === 'phyrexian') element.textContent = 'Φ'; // a phi, for "or 2 life"
  else if (symbol.kind === 'hybrid' && symbol.text.startsWith('2/')) element.textContent = '2';
  return element;
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
    element.lastChild.append(...part.map(pip));
  });
  return element;
}
