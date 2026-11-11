// Draws a checked deck, group by group (shared/deck-view.mjs decides the groups), either as a text list or as card pictures, and the two buttons that choose between them.
// Everything typed or pasted (a card name, a title the player typed) goes in as text, never as markup. Both views put the data the card picture box needs on every card
// (data-card-id and friends, see src/card-peek.js), so pointing at a line or at a picture shows the big picture in the card display beside the deck.
import { imageUrl } from '../../shared/card-image.mjs';
import { manaNode } from './mana-pips.js';

export const VIEWS = ['text', 'images', 'stacks'];

function make(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
// The icons of the view buttons: three lines (the text list), four cards side by side (the pictures) and three cards overlapping one below the other, each a little lower and to the right
// (the stacks). Width, height and fill are set on the element itself.
function icon(kind) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (kind === 'text') {
    for (const [x, y, width, height] of [[3, 5, 18, 2.5], [3, 10.75, 18, 2.5], [3, 16.5, 18, 2.5]]) { // three lines
      const rect = document.createElementNS(SVG_NS, 'rect');
      for (const [name, value] of [['x', x], ['y', y], ['width', width], ['height', height], ['rx', 1], ['fill', 'currentColor']]) rect.setAttribute(name, String(value));
      svg.append(rect);
    }
  } else if (kind === 'images') {
    for (const [x, y] of [[3, 2], [13, 2], [3, 12.5], [13, 12.5]]) { // four cards, two by two
      const rect = document.createElementNS(SVG_NS, 'rect');
      for (const [name, value] of [['x', x], ['y', y], ['width', 8], ['height', 9.5], ['rx', 1.5], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', 1.8]]) rect.setAttribute(name, String(value));
      svg.append(rect);
    }
  } else {
    // three cards cascading down and to the right; only the edges that show are drawn, so the cards read as lying on top of each other
    for (const d of ['M2 15V2h9v3', 'M2 15h5', 'M7 18V5h9v3', 'M7 18h5', 'M12 8h9v13h-9z']) {
      const path = document.createElementNS(SVG_NS, 'path');
      for (const [name, value] of [['d', d], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', 1.8], ['stroke-linejoin', 'round'], ['stroke-linecap', 'round']]) path.setAttribute(name, String(value));
      svg.append(path);
    }
  }
  return svg;
}

// The two buttons that choose the view. Returns { element, set(view) }. onChange(view) is called when a button is pressed.
export function mountViewToggle(container, { view, onChange }) {
  container.replaceChildren();
  container.setAttribute('role', 'group');
  container.setAttribute('aria-label', 'How to show the deck');
  const buttons = new Map();
  for (const [name, label] of [['text', 'Text list'], ['images', 'Card pictures'], ['stacks', 'Stacks']]) {
    const button = make('button', 'view-button');
    button.type = 'button';
    button.dataset.view = name;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.append(icon(name));
    button.addEventListener('click', () => onChange(name));
    buttons.set(name, button);
    container.append(button);
  }
  function set(next) { for (const [name, button] of buttons) button.setAttribute('aria-pressed', String(name === next)); }
  set(view);
  return { set };
}

// The card display beside the deck (src/stack-preview.js) looks these up on whatever is pointed at: which picture, the name, whether the card has a back face.
function describeCard(element, line) {
  if (!line.card) return;
  element.dataset.ref = line.card.i; // which card (the menu and the commander choice work on this)
  element.dataset.previewId = line.printingId ?? line.card.i;
  element.dataset.printing = line.printingSource ?? 'default'; // 'set', 'title' or 'default': where the picture's printing came from
  element.dataset.cardName = line.name;
  if (line.card.b === 1) element.dataset.twoSided = '1'; // a card with a back face: the display shows both faces
}

// The "..." button that opens a card's menu (the page decides what the menu holds). A right-click on the card does the same.
function menuButton(line) {
  const button = make('button', 'row-menu', '\u2026');
  button.type = 'button';
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-label', `Options for ${line.name}`);
  button.title = 'Options';
  return button;
}

function textRow(line, printingCell, withMenu) {
  const item = make('li', line.status === 'matched' ? 'card-line' : 'card-line unmatched');
  const name = make('span', 'name', line.name);
  if (line.viaTitle) name.append(make('span', 'typed-as', ` (typed as "${line.viaTitle}")`)); // a card found by another title it was printed under
  describeCard(item, line);
  if (line.card) { name.tabIndex = 0; name.title = line.card.t; }
  item.append(make('span', 'qty', String(line.qty)), name);
  const printing = printingCell(line);
  if (printing.textContent) item.append(printing);
  item.append(line.card ? manaNode(line.card.m) : make('span', 'cost', 'not matched'));
  if (withMenu) item.append(menuButton(line));
  return item;
}

function tile(line, withMenu) {
  const item = make('li', line.status === 'matched' ? 'deck-tile' : 'deck-tile unmatched');
  item.append(make('span', 'sr-only', `${line.qty} ${line.name}`));
  if (line.card) item.dataset.ref = line.card.i; // (also for a picture that cannot be shown, so its menu still works)
  const picture = make('span', 'tile-picture');
  picture.setAttribute('aria-hidden', 'true');
  const fallback = () => { picture.replaceChildren(make('span', 'tile-name', line.name)); picture.classList.add('noimage'); };
  const url = line.card ? imageUrl(line.printingId ?? line.card.i, 'small') : null;
  if (url) {
    describeCard(item, line);
    item.tabIndex = 0;
    const image = new Image();
    image.alt = '';
    image.loading = 'lazy'; // only the pictures that scroll into view are fetched
    image.decoding = 'async';
    image.draggable = false;
    image.addEventListener('error', fallback);
    // The small picture (146 px wide, 12 KB) serves a tile up to 190 px wide (stretched at most 1.3 times); a wider tile gets the normal one (488 px, 71 KB), chosen by the browser from the width the tile will have. So the pictures are sharp on a large window and cost the least on a smaller one. (The 190w is the width the small picture is allowed to stand for, not its real width.)
    const normal = imageUrl(line.printingId ?? line.card.i, 'normal');
    if (normal) {
      image.srcset = `${url} 160w, ${normal} 488w`;
      image.sizes = '(max-width: 520px) calc((100vw - 3rem) / 3), (max-width: 800px) calc((100vw - 3rem) / 4), (max-width: 1500px) calc((100vw - 4rem - 22rem) / 6), calc((100vw - 4rem - 22rem) / 8)';
    }
    image.src = url;
    picture.append(image);
  } else {
    fallback();
  }
  item.append(picture);
  if (withMenu) item.append(menuButton(line));
  if (line.qty > 1) { const count = make('span', 'tile-qty', `x${line.qty}`); count.setAttribute('aria-hidden', 'true'); item.append(count); }
  return item;
}

// groups: from groupDeck(). view: 'text' or 'images'. printingCell(line): the small element that says which printing a text row shows (the importer builds it).
// menuFor(line): whether the line has a "..." menu (true when the page has something to offer for it).
export function renderGroups(container, groups, { view, printingCell, menuFor = () => false }) {
  container.replaceChildren();
  container.dataset.view = view;
  for (const group of groups) {
    const section = make('section', 'deck-group');
    section.dataset.group = group.key;
    section.append(make('h3', '', `${group.title} (${group.count})`));
    const list = make('ul', view === 'images' ? 'deck-tiles' : view === 'stacks' ? 'deck-stack' : 'deck-list');
    list.append(...group.lines.map((line) => (view === 'text' ? textRow(line, printingCell, menuFor(line)) : tile(line, menuFor(line)))));
    section.append(list);
    container.append(section);
  }
}
