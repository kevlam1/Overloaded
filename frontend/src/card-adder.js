// "Add a card" (2026-11-26 feedback): a window with a search bar over the whole card list (/data/cards.json, the list the site already serves; no Scryfall request), opened from the
// battlefield's right-click menu. Pressing a card calls onAdd({ i, n }) and the page puts it on your battlefield (shared/zones.mjs addCard). It looks like the token window
// (the same picker classes) and stays open so several can be added; Escape or Close ends it.
import { loadCardList } from './card-list.js';
import { imageUrl } from '../../shared/card-image.mjs';
import { normalizeName } from '../../shared/card-match.mjs';

const make = (tag, className, text) => { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; };
const LIMIT = 60;
let listLoad = null; // (loaded once per page: the list is large)
let names = null; // [normalized name, card] in list order

// The cards whose name starts with the words first, then those whose name has them anywhere, at most LIMIT.
export function findCards(entries, words) {
  const key = normalizeName(words);
  if (!key) return [];
  const starts = []; const inside = [];
  for (const [name, card] of entries) {
    if (name.startsWith(key)) starts.push(card); else if (inside.length < LIMIT && name.includes(key)) inside.push(card);
    if (starts.length >= LIMIT) break;
  }
  return [...starts, ...inside].slice(0, LIMIT);
}

export function openCardAdder({ root = document.body, onAdd, returnFocus = null }) {
  root.querySelector('.adder-overlay')?.remove();
  const overlay = make('div', 'picker-overlay token-overlay adder-overlay');
  const dialog = make('div', 'picker token-picker card-adder');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'Add a card');
  const head = make('div', 'picker-head');
  const close = make('button', 'secondary picker-close', 'Close');
  close.type = 'button';
  const actions = make('div', 'picker-actions');
  actions.append(close);
  head.append(make('h2', '', 'Add a card'), actions);
  const filter = make('input', 'picker-filter');
  filter.type = 'search';
  filter.id = 'card-adder-search';
  filter.placeholder = 'Search every card';
  filter.setAttribute('aria-label', 'Search every card by name');
  filter.autocomplete = 'off';
  filter.spellcheck = false;
  const message = make('p', 'hint picker-message', 'Loading cards...');
  message.setAttribute('role', 'status');
  const grid = make('ul', 'picker-grid token-grid');
  const body = make('div', 'token-body');
  body.append(grid);
  dialog.append(head, filter, message, body);
  overlay.append(dialog);
  root.append(overlay);

  function closeIt() {
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    if (returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
  }
  function onKey(event) { if (event.key === 'Escape') { event.stopImmediatePropagation(); event.preventDefault(); closeIt(); } }
  document.addEventListener('keydown', onKey, true);
  close.addEventListener('click', closeIt);
  overlay.addEventListener('pointerdown', (event) => { if (event.target === overlay) closeIt(); });

  function tile(card) {
    const item = make('li');
    const button = make('button', 'picker-tile token-tile');
    button.type = 'button';
    button.dataset.card = card.i;
    button.title = `${card.n}${card.t ? ': ' + card.t : ''}`;
    button.setAttribute('aria-label', `Add ${card.n}`);
    const art = make('span', 'tile-art');
    art.setAttribute('aria-hidden', 'true');
    const url = imageUrl(card.i, 'small');
    if (url) { const image = new Image(); image.alt = ''; image.loading = 'lazy'; image.decoding = 'async'; image.draggable = false; image.src = url; image.addEventListener('error', () => { art.replaceChildren(make('span', 'tile-name', card.n)); art.classList.add('noimage'); }); art.append(image); }
    const caption = make('span', 'tile-caption');
    caption.append(make('strong', '', card.n), make('span', '', card.t ?? ''));
    button.append(art, caption);
    button.addEventListener('click', () => {
      try { message.textContent = onAdd({ i: card.i, n: card.n }) || `Added ${card.n}.`; message.dataset.error = ''; } catch (error) { message.textContent = error.message; message.dataset.error = '1'; }
    });
    item.append(button);
    return item;
  }
  function show() {
    if (!names) return;
    const words = filter.value.trim();
    const found = findCards(names, words);
    grid.replaceChildren(...found.map(tile));
    message.dataset.error = '';
    message.textContent = !words ? 'Type a card name.' : found.length ? '' : 'No card matches that.';
  }
  filter.addEventListener('input', show);
  listLoad ??= loadCardList().then((cards) => { names = cards.map((card) => [normalizeName(card.n), card]); }).catch((error) => { listLoad = null; throw error; });
  listLoad.then(show, () => { message.textContent = 'Cards didn’t load. Check your connection.'; message.dataset.error = '1'; });
  filter.focus();
  return { close: closeIt };
}
