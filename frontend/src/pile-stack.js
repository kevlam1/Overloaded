// A pile of cards drawn as a stack: your library, graveyard or exile as a few card shapes on top of each other with the number of cards on it. The library shows a plain card back (its
// top card is hidden from everyone, you included); the graveyard and exile show their top card (the newest one, shared/zones.mjs keeps it first). The whole stack is one button: a click
// opens the viewer and a right-click opens the pile's menu (the page wires both). The only TEXT inside the button is a line for a screen reader ("Library: 53"), so the number and the name
// drawn on it are not read twice; they come from data attributes through the style sheet.
import { imageUrl } from '../../shared/card-image.mjs';

function make(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

// button: the pile's button. zone: library, graveyard or exile. label: the word shown under it. Returns { update({ count, top }) }, top being the card to show (not for the library).
export function mountPileStack(button, { zone, label }) {
  button.classList.add('pile-stack');
  button.dataset.zone = zone;
  button.dataset.label = label;
  const face = make('span', 'stack-face');
  const layers = make('span', 'stack-layers');
  layers.setAttribute('aria-hidden', 'true');
  layers.append(make('span', 'stack-layer'), make('span', 'stack-layer'), face);
  const words = make('span', 'sr-only', '');
  button.replaceChildren(layers, words);
  let shown = null; // which picture the face holds now ('' for none)

  function showTop(top) {
    const key = top ? `${top.p ?? top.i}|${top.n}` : '';
    if (key === shown) return;
    shown = key;
    face.replaceChildren();
    delete face.dataset.name;
    if (!top) return;
    const url = imageUrl(top.p ?? top.i, 'normal');
    if (!url) { face.dataset.name = String(top.n ?? ''); return; }
    const picture = new Image();
    picture.alt = '';
    picture.draggable = false;
    picture.decoding = 'async';
    picture.addEventListener('error', () => { picture.remove(); face.dataset.name = String(top.n ?? ''); }); // a picture that cannot be loaded: the name instead
    picture.src = url;
    face.append(picture);
  }

  function update({ count, top = null }) {
    button.dataset.count = String(count);
    button.dataset.empty = String(count === 0);
    words.textContent = `${label}: ${count}`;
    face.classList.toggle('back', zone === 'library' && count > 0);
    showTop(zone === 'library' || count === 0 ? null : top);
  }
  return { update };
}
