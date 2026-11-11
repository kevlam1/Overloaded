// The card corner: a place on the table that shows one card large. It shows the card you have selected (it stays after you click away, until you select another), and the card a
// player pinged (shared/ping.mjs), which stays until you select another card, another ping replaces it, or you close it. Everything shown came from this page or from another
// player's browser: it is put in as text and as a picture address built from a card id (shared/card-image.mjs), never as markup. The picture is loaded only when a card is shown,
// and falls back to the default printing and then to the name alone.
import { imageUrl } from '../../shared/card-image.mjs';

const make = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

// root: an empty element. Options: persistent (the corner is always there: with nothing to show it shows emptyText, instead of hiding), emptyText, onClose (called after the
// player closes a ping). Returns { show({ card, sentence, detail, closable, key }), hide(), isOpen() }.
//   closable: whether the Close button shows (a ping, yes; the selected card, no). key: if it is the same as the key of the card already shown, nothing changes (so a card
//   that is drawn again by every refresh of the page does not load its picture again).
export function createSpotlight(root, { onClose = () => {}, persistent = false, emptyText = '' } = {}) {
  const picture = make('img', 'spot-picture');
  picture.alt = '';
  picture.decoding = 'async';
  const line = make('p', 'spot-line');
  line.setAttribute('role', 'status');
  line.setAttribute('aria-live', 'polite');
  const name = make('p', 'spot-name');
  const type = make('p', 'spot-type');
  const detail = make('p', 'spot-detail');
  const close = make('button', 'secondary spot-close', 'Close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close the pinged card');
  const text = make('div', 'spot-text');
  text.append(line, name, type, detail, close);
  const empty = make('p', 'spot-empty', emptyText);
  root.replaceChildren(picture, text, empty);
  root.classList.add('spotlight');
  let lastKey = null;

  const showEmpty = () => { root.classList.add('is-empty'); picture.hidden = true; text.hidden = true; empty.hidden = !emptyText; };
  const hide = () => {
    lastKey = null;
    picture.removeAttribute('src');
    if (persistent) { showEmpty(); return; }
    root.hidden = true;
  };
  if (persistent) showEmpty(); else root.hidden = true;
  close.addEventListener('click', () => { hide(); onClose(); });

  return {
    show({ card, sentence = '', detail: more = '', closable = true, key = null }) {
      if (key !== null && key === lastKey) return;
      lastKey = key;
      root.classList.remove('is-empty');
      text.hidden = false;
      empty.hidden = true;
      const side = card.turned ? 'back' : 'front';
      const first = imageUrl(card.p ?? card.i, 'normal', side);
      picture.hidden = false;
      picture.dataset.tried = '';
      picture.alt = card.n;
      picture.onerror = () => {
        const fallback = card.p && !picture.dataset.tried ? imageUrl(card.i, 'normal', side) : null;
        picture.dataset.tried = '1';
        if (fallback) picture.src = fallback; else picture.hidden = true; // no picture at all: the name and the words stay
      };
      if (first) picture.src = first; else picture.hidden = true;
      line.textContent = sentence;
      line.hidden = !sentence;
      name.textContent = card.n;
      type.textContent = card.t || '';
      type.hidden = !card.t;
      detail.textContent = more;
      detail.hidden = !more;
      close.hidden = !closable;
      root.hidden = false;
      // a short entrance (off under prefers-reduced-motion in the style sheet): remove and add the class again so a new card replays it
      root.classList.remove('enter');
      void root.offsetWidth;
      root.classList.add('enter');
    },
    hide,
    isOpen: () => (persistent ? !root.classList.contains('is-empty') : !root.hidden),
  };
}
