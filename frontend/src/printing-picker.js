// The window for choosing a card's printing (its art): every printing of the card, newest first, as a list of the set's name, its code and number and its year, with a box to filter by set. Pointing at a row shows
// that printing's picture (the page's picture box finds the rows by their data-card-id, so nothing here loads a picture). A choice is handed back to the page, which rewrites the card's line in the deck's text.
// Everything shown comes from our own data files and goes in as text.
import { setInfo } from '../../shared/card-prints.mjs';

function make(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

// root: the element the window is put in. name: the card's name. defaultId: the id of the card's default printing (for the first row and its picture). currentId: the printing in use now, or null for the default.
// loader: from makePrintsLoader(). onPick(row | null): called with the chosen printing ({ set, number, id }), or null for the default one. returnFocus: where the focus goes back to.
export async function openPrintingPicker({ root, name, defaultId, currentId, loader, onPick, returnFocus = null }) {
  root.querySelector('.picker-overlay')?.remove();
  const overlay = make('div', 'picker-overlay');
  const dialog = make('div', 'picker');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', `Printings of ${name}`);
  const head = make('div', 'picker-head');
  const title = make('h2', '', name);
  const close = make('button', 'secondary picker-close', 'Close');
  close.type = 'button';
  head.append(title, close);
  const filter = make('input', 'picker-filter');
  filter.type = 'search';
  filter.placeholder = 'Filter by set';
  filter.setAttribute('aria-label', `Filter the printings of ${name} by set name or code`);
  filter.autocomplete = 'off';
  const message = make('p', 'hint picker-message', 'Loading the printings...');
  message.setAttribute('role', 'status');
  const list = make('ul', 'picker-list');
  dialog.append(head, filter, message, list);
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
  overlay.addEventListener('click', (event) => { if (event.target === overlay) closeIt(); });
  filter.focus();

  const result = await loader.load(name);
  if (!overlay.isConnected) return; // closed while loading
  if (result.state === 'failed') { message.textContent = 'The printings could not be loaded. Check your connection and try again.'; return; }
  if (result.state === 'none') { message.textContent = 'There is no list of printings for this card yet, so its art cannot be changed here.'; }
  else message.textContent = '';

  const rows = [];
  const add = (label, meta, id, picked, row, searchText) => {
    const item = make('li');
    const button = make('button', 'picker-row');
    button.type = 'button';
    if (id) { button.dataset.cardId = id; button.dataset.cardName = name; button.dataset.printing = row ? 'set' : 'default'; }
    if (picked) button.setAttribute('aria-current', 'true');
    button.append(make('span', 'pr-set', label), make('span', 'pr-meta', meta));
    button.addEventListener('click', () => { closeIt(); onPick(row); });
    item.append(button);
    rows.push({ item, searchText: searchText.toLowerCase() });
    list.append(item);
  };
  add('Default printing', 'the card list’s own picture', defaultId, currentId === null || currentId === undefined, null, 'default');
  for (const printing of result.printings) {
    const info = setInfo(result.sets, printing.set);
    add(info.name, `${printing.set.toUpperCase()} ${printing.number}${info.year ? ` · ${info.year}` : ''}`, printing.id, printing.id === currentId, printing, `${info.name} ${printing.set} ${printing.number} ${info.year}`);
  }
  filter.addEventListener('input', () => {
    const words = filter.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const row of rows) { const match = words.every((word) => row.searchText.includes(word)); row.item.hidden = !match; if (match) shown++; }
    message.textContent = shown === 0 ? 'No printing matches that.' : '';
  });
  list.querySelector('[aria-current]')?.scrollIntoView({ block: 'center' });
}
