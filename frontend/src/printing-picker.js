// The window for choosing a card's printing (its art): every printing of the card as its picture, three to a row, newest at the top left, with a search box (set name, set code, collector number, year or a Scryfall
// id). Each picture is the small size and is only fetched when it scrolls into view (the browser's own lazy loading), and pointing at one shows the normal-size picture in the page's picture box (found by data-card-id).
// A choice is handed back to the page, which rewrites the card's line in the deck's text. The card list's default printing is marked on its picture; "Use the default" (shown only when a printing was chosen)
// takes the choice off again. Everything shown comes from our own data files and goes in as text.
import { setInfo } from '../../shared/card-prints.mjs';
import { imageUrl } from '../../shared/card-image.mjs';

function make(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

// root: the element the window is put in. name: the card's name. defaultId: the id of the card list's default printing (marked when it is one of the printings). currentId: the printing in use now, or null when the card
// follows the default. loader: from makePrintsLoader(). onPick(row | null): the chosen printing ({ set, number, id }), or null for "use the default". returnFocus: where the focus goes back to.
export async function openPrintingPicker({ root, name, defaultId, currentId, loader, onPick, returnFocus = null }) {
  root.querySelector('.picker-overlay')?.remove();
  const overlay = make('div', 'picker-overlay');
  const dialog = make('div', 'picker');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', `Printings of ${name}`);
  const head = make('div', 'picker-head');
  const title = make('h2', '', name);
  const actions = make('div', 'picker-actions');
  const reset = make('button', 'secondary picker-reset', 'Use the default');
  reset.type = 'button';
  reset.hidden = currentId === null || currentId === undefined;
  const close = make('button', 'secondary picker-close', 'Close');
  close.type = 'button';
  actions.append(reset, close);
  head.append(title, actions);
  const filter = make('input', 'picker-filter');
  filter.type = 'search';
  filter.placeholder = 'Search by set name, set code, number or id';
  filter.setAttribute('aria-label', `Search the printings of ${name} by set name, set code, collector number, year or Scryfall id`);
  filter.autocomplete = 'off';
  filter.spellcheck = false;
  const message = make('p', 'hint picker-message', 'Loading the printings...');
  message.setAttribute('role', 'status');
  const grid = make('ul', 'picker-grid');
  dialog.append(head, filter, message, grid);
  overlay.append(dialog);
  root.append(overlay);

  function closeIt() {
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    if (returnFocus && returnFocus.isConnected) returnFocus.focus();
  }
  function onKey(event) {
    if (event.key === 'Escape') { event.stopImmediatePropagation(); event.preventDefault(); closeIt(); }
  }
  document.addEventListener('keydown', onKey, true);
  close.addEventListener('click', closeIt);
  reset.addEventListener('click', () => { closeIt(); onPick(null); });
  overlay.addEventListener('click', (event) => { if (event.target === overlay) closeIt(); });
  filter.focus();

  const result = await loader.load(name);
  if (!overlay.isConnected) return; // closed while loading
  if (result.state === 'failed') { message.textContent = 'The printings could not be loaded. Check your connection and try again.'; return; }
  message.textContent = result.state === 'none' ? 'There is no list of printings for this card yet, so its art cannot be changed here.' : '';

  const tiles = [];
  for (const printing of result.printings) {
    const info = setInfo(result.sets, printing.set);
    const code = `${printing.set.toUpperCase()} ${printing.number}`;
    const item = make('li');
    const button = make('button', 'picker-tile');
    button.type = 'button';
    button.dataset.cardId = printing.id; // the page's picture box shows the big picture of the printing being pointed at
    button.dataset.cardName = name;
    button.dataset.printing = 'set';
    const year = printing.year; // the year this printing came out (a set's own date is only its first release)
    button.title = `${info.name}, ${code}, ${year}`;
    button.setAttribute('aria-label', `${info.name}, ${code}, ${year}${printing.id === defaultId ? ' (the default)' : ''}`);
    if (printing.id === currentId) button.setAttribute('aria-current', 'true');
    const picture = make('span', 'tile-art');
    picture.setAttribute('aria-hidden', 'true');
    const url = imageUrl(printing.id, 'small');
    const fallback = () => { picture.replaceChildren(make('span', 'tile-name', name)); picture.classList.add('noimage'); };
    if (url) {
      const image = new Image();
      image.alt = '';
      image.loading = 'lazy'; // only the pictures that scroll into view are fetched
      image.decoding = 'async';
      image.draggable = false;
      image.addEventListener('error', fallback);
      image.src = url;
      picture.append(image);
    } else fallback();
    if (printing.id === defaultId) picture.append(make('span', 'tile-default', 'Default'));
    const caption = make('span', 'tile-caption');
    caption.append(make('strong', '', code), make('span', '', `${info.name} · ${year}`));
    button.append(picture, caption);
    button.addEventListener('click', () => { closeIt(); onPick(printing); });
    item.append(button);
    tiles.push({ item, searchText: `${info.name} ${printing.set} ${printing.number} ${year} ${printing.id}`.toLowerCase() });
    grid.append(item);
  }
  filter.addEventListener('input', () => {
    const words = filter.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const tile of tiles) { const match = words.every((word) => tile.searchText.includes(word)); tile.item.hidden = !match; if (match) shown++; }
    message.textContent = shown === 0 ? 'No printing matches that.' : '';
  });
  grid.querySelector('[aria-current]')?.scrollIntoView({ block: 'center' });
}
