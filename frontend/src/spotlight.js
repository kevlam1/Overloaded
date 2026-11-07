// The spotlight: the card a player pinged, shown large to everyone at the table (shared/ping.mjs). It stays until a player closes it for themselves or the next ping
// replaces it. Everything shown came from another player's browser: it is put in as text and as a picture address built from a card id (shared/card-image.mjs),
// never as markup. The picture is loaded only when a ping is shown, and falls back to the default printing and then to the name alone.
import { imageUrl } from '../../shared/card-image.mjs';

const make = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

// root: an empty element (hidden). Returns { show({ card, sentence, detail }), hide(), isOpen() }.
export function createSpotlight(root, { onClose = () => {} } = {}) {
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
  root.replaceChildren(picture, text);
  root.classList.add('spotlight');
  root.hidden = true;

  const hide = () => { root.hidden = true; picture.removeAttribute('src'); };
  close.addEventListener('click', () => { hide(); onClose(); });

  return {
    show({ card, sentence, detail: more = '' }) {
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
      name.textContent = card.n;
      type.textContent = card.t || '';
      type.hidden = !card.t;
      detail.textContent = more;
      detail.hidden = !more;
      root.hidden = false;
      // a short entrance (off under prefers-reduced-motion in the style sheet): remove and add the class again so a new ping replays it
      root.classList.remove('enter');
      void root.offsetWidth;
      root.classList.add('enter');
    },
    hide,
    isOpen: () => !root.hidden,
  };
}
