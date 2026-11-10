// The viewer of a pile (your library, graveyard, exile or sideboard): a large window over the table that shows the CARDS (not a list of names), with a search bar. The search finds cards by
// name, by letters that appear in the name in order ("ft" finds Forest) and by words of the type line (shared/card-search.mjs). The cards are the same card buttons as everywhere else
// (nodeFor), so clicking one selects it and right-clicking it opens its menu: that is how a card is taken out of the pile.
// The page asks for a redraw (show) after every change of the game; the search text is kept across redraws, so searching and then moving a card leaves the search where it was.
import { searchCards } from '../../shared/card-search.mjs';

function make(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

// root: the overlay element (#viewer) holding #viewer-title, #viewer-search, #viewer-close, #viewer-note and #viewer-list.
// nodeFor(card): the card button for a card. onClose(): the page's word that the viewer closed (Esc, the Close button, a click outside the window).
export function mountPileViewer({ root, nodeFor, onClose = () => {} }) {
  const title = root.querySelector('#viewer-title');
  const search = root.querySelector('#viewer-search');
  const closeButton = root.querySelector('#viewer-close');
  const note = root.querySelector('#viewer-note');
  const list = root.querySelector('#viewer-list');
  let returnTo = null;

  const isOpen = () => !root.hidden;
  function close() {
    if (!isOpen()) return;
    root.hidden = true;
    onClose();
    if (returnTo && returnTo.isConnected) returnTo.focus();
    returnTo = null;
  }

  // label: the name of the pile ("Library"). cards: what to show (all of the pile, or only its top few). depth: whether to number the cards by their place from the top (a library).
  // total: how many cards the pile has (when only some are shown). noteText: a short line under the title.
  function show({ label, cards, depth = false, total = cards.length, noteText = '' }) {
    const opening = !isOpen();
    if (opening) { returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null; root.hidden = false; }
    const results = searchCards(cards, search.value);
    const filtering = search.value.trim() !== '';
    title.textContent = filtering ? `${label}: ${results.length} of ${cards.length}` : cards.length === total ? `${label}: ${cards.length} ${cards.length === 1 ? 'card' : 'cards'}` : `${label}: the top ${cards.length} of ${total}`;
    note.textContent = noteText;
    if (results.length === 0) {
      list.replaceChildren(make('p', 'viewer-empty', filtering ? 'No card matches that.' : 'No cards.'));
      return;
    }
    list.replaceChildren(...results.map(({ card, index }) => {
      const cell = make('div', 'viewer-card');
      cell.append(nodeFor(card, false));
      if (depth) cell.append(make('span', 'viewer-depth', `#${index + 1}`));
      return cell;
    }));
  }

  function focusSearch() { search.focus(); search.select(); }
  function clearSearch() { search.value = ''; }
  closeButton.addEventListener('click', close);
  root.addEventListener('click', (event) => { if (event.target === root) close(); }); // a click on the dim space around the window
  // Escape closes the viewer, and only the viewer: it is handled first and the page's own Escape (which takes the highlight off a card) does not see it.
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !isOpen() || document.querySelector('.card-menu')) return; // an open menu takes the Escape first
    event.stopImmediatePropagation();
    event.preventDefault();
    close();
  }, true);

  return { show, hide: () => { if (isOpen()) { root.hidden = true; returnTo = null; } }, isOpen, focusSearch, clearSearch, onSearch: (callback) => search.addEventListener('input', callback), close };
}
