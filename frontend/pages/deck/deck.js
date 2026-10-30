// The deck import page: paste a decklist, see it matched against our card list, confirm the commander, and save it in this
// browser. The thinking is in shared/ (the parser, the matcher and shared/deck-preview.mjs, all tested in Node); this file
// only reads the form and draws the result. Everything typed or pasted is put into the page as text, never as markup.
import { buildCardIndex, matchDeck } from '../../../shared/card-match.mjs';
import { parseDeckText } from '../../../shared/deck-text.mjs';
import { makePreview, buildSavedDeck, printingSetsNeeded, PRINTING_PROBLEM_WORDS } from '../../../shared/deck-preview.mjs';
import { LIBRARY_KEY, LEGACY_KEY, FORMAT_TITLES, emptyLibrary, readLibrary, serializeLibrary, addDeck, removeDeck, selectDeck } from '../../../shared/deck-library.mjs';
import { makeSafeStore } from '../../src/safe-store.js';
import { loadCardList } from '../../src/card-list.js';
import { makePrintingLoader } from '../../src/printings.js';
import { setupCardPeek } from '../../src/card-peek.js';

const $ = (id) => document.getElementById(id);
const store = makeSafeStore();
// The saved decks live in this browser only (shared/deck-library.mjs: up to 20, one of them selected).
const PROBE_KEY = 'overloaded.storage-probe';

let index = null; // the card list, ready to match against
let text = ''; // the text the preview on screen is for
let choices = {}; // names the player settled (an ambiguous name, a "did you mean")
let preview = null;
let mode = 'none'; // 'commander' or 'none'
let modeTouched = false;
let picks = ['', '']; // the chosen commander and partner (card ids)
let picksTouched = false;
let library = emptyLibrary(); // the saved decks
let libraryRead = { source: 'empty', skipped: 0 }; // what reading them found (so the page can say if some could not be read)
let formatTouched = false; // the player chose the format, so it no longer follows the commander choice
const printingLoader = makePrintingLoader();
let printingFiles = new Map(); // the set files the pasted list names (see src/printings.js)
let checkRun = 0; // a newer check makes an older one that is still waiting for printing files stop

function say(message, isError = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', isError);
}

function make(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const totalCards = (deck) => deck.cards.reduce((sum, card) => sum + card.qty, 0);

// ---- the card list ----
async function loadCards() {
  $('check').disabled = true;
  $('retry').hidden = true;
  $('list-state').textContent = 'Loading the card list...';
  try {
    const cards = await loadCardList();
    index = buildCardIndex(cards);
    $('list-state').textContent = `${cards.length.toLocaleString('en-US')} cards loaded. Cards newer than the list show as not found; the list is refreshed every week.`;
    $('check').disabled = false;
  } catch {
    index = null;
    $('list-state').textContent = 'The card list could not be loaded. Check your connection and try again.';
    $('retry').hidden = false;
  }
}

// ---- checking a pasted list ----
// Only a list that names sets and numbers waits for anything: it fetches the printing files of those sets (our own static
// files, one per set, no request to Scryfall). A list without them is checked straight away, as before.
async function runCheck() {
  if (!index) return;
  const pasted = $('deck-text').value;
  if (pasted !== text) { choices = {}; modeTouched = false; picksTouched = false; formatTouched = false; }
  text = pasted;
  const run = ++checkRun;
  if (!text.trim()) { say('Paste a decklist first.', true); $('preview').hidden = true; preview = null; return; }
  const parsed = parseDeckText(text);
  const sets = printingSetsNeeded(matchDeck(index, parsed.entries).results);
  if (sets.length) {
    // The old preview is for the old text, so it goes while the files load: Save must not pair its cards with the new text.
    preview = null;
    $('preview').hidden = true;
    say(`Checking the printings in ${plural(sets.length, 'set', 'sets')}...`);
    const loaded = await printingLoader.load(sets);
    if (run !== checkRun) return; // checked again, cleared or loaded another deck while waiting
    printingFiles = loaded;
  } else {
    printingFiles = new Map();
  }
  refresh();
  const { counts } = preview;
  say(counts.problem === 0 ? `Checked: ${plural(counts.cards, 'card', 'cards')}, all matched.` : `Checked: ${plural(counts.cards, 'card', 'cards')}, ${counts.problem} need attention.`);
  $('preview-heading').focus();
}

// Works the preview out again from the text it is for (so choosing a card does not depend on what is now in the box).
function refresh() {
  const parsed = parseDeckText(text);
  preview = makePreview(parsed, matchDeck(index, parsed.entries), choices, printingFiles);
  renderPreview();
}

function renderPreview() {
  $('preview').hidden = false;
  const { counts } = preview;
  $('summary').textContent = counts.cards === 0 ? 'No cards were found in that.' : `${plural(counts.cards, 'card', 'cards')} on ${plural(counts.unique, 'line', 'lines')}. ${counts.problem === 0 ? 'Every card was matched.' : `${plural(counts.problem, 'card needs', 'cards need')} attention.`}`;

  const notices = $('notices');
  notices.replaceChildren(...preview.notices.map((notice) => make('li', '', notice)));
  notices.hidden = preview.notices.length === 0;

  renderProblems();
  renderSections();
  renderCommander();
  renderSaveBox();
}

function choiceSelect(line, label) {
  const select = make('select');
  select.setAttribute('aria-label', label);
  select.append(new Option('Choose a card...', ''));
  for (const candidate of line.candidates) select.append(new Option(`${candidate.n} (${candidate.t})`, candidate.i));
  select.addEventListener('change', () => {
    if (!select.value) return;
    choices[line.typedKey] = select.value;
    refresh();
    say(`Chose ${preview.lines.find((l) => l.typedKey === line.typedKey)?.name ?? 'the card'}.`);
  });
  return select;
}

function renderProblems() {
  const list = $('problem-list');
  list.replaceChildren();
  const { not_found: missing, ambiguous, suggestion } = preview.problems;
  for (const line of ambiguous) {
    const item = make('li', 'problem');
    item.append(make('span', '', `"${line.typed}" (${line.qty}) matches more than one card. `), choiceSelect(line, `Choose the card for ${line.typed}`));
    list.append(item);
  }
  for (const line of suggestion) {
    const item = make('li', 'problem');
    item.append(make('span', '', `"${line.typed}" (${line.qty}) is not a card, but it is the back of another card. Did you mean: `), choiceSelect(line, `Choose the card for ${line.typed}`));
    list.append(item);
  }
  for (const line of missing) {
    list.append(make('li', 'problem', `"${line.typed}" (${line.qty}) was not found. It may be spelled differently, or newer than our card list.`));
  }
  $('problems').hidden = list.children.length === 0;
}

// The column that says which printing a row shows: the set and number as typed (SLD 916), with "(not found)" or "(not loaded)"
// after one that could not be used, and its words as the tooltip. A row found by a title says "title" when no set was typed.
function printingCell(line) {
  const problems = new Map(line.printingProblems.map((item) => [item.typed, item.problem]));
  const parts = line.printings.map((typed) => (problems.has(typed) ? `${typed} (${problems.get(typed) === 'not_loaded' ? 'not loaded' : 'not found'})` : typed));
  if (line.printingSource === 'title' && parts.length === 0) parts.push('title');
  const cell = make('span', 'printing', parts.join(', '));
  const notes = [];
  if (line.printingSource === 'set') notes.push('Showing the printing you named in your list.');
  if (line.printingSource === 'title') notes.push('Showing the printing that carries the title you typed.');
  for (const [typed, problem] of problems) notes.push(`${typed}: ${PRINTING_PROBLEM_WORDS[problem]}, so the picture is ${line.printingSource === 'title' ? "that of the title's printing" : "the card's default one"}.`);
  if (notes.length) cell.title = notes.join(' ');
  return cell;
}

function renderSections() {
  const container = $('sections');
  container.replaceChildren();
  for (const section of preview.sections) {
    const heading = make('h3', '', `${section.title}: ${section.count}`);
    const list = make('ul', 'deck-list');
    for (const line of section.lines) {
      const item = make('li', line.status === 'matched' ? 'card-line' : 'card-line unmatched');
      const name = make('span', 'name', line.name);
      if (line.viaTitle) name.append(make('span', 'typed-as', ` (typed as "${line.viaTitle}")`)); // a card found by another title it was printed under
      if (line.card) {
        // Hovering the row (or focusing the name with the keyboard) shows the card's picture; see src/card-peek.js. The picture
        // is the printing the line named, or the printing of the title that was typed, or else the card's default one.
        item.dataset.cardId = line.printingId ?? line.card.i;
        item.dataset.printing = line.printingSource ?? 'default';
        item.dataset.cardName = line.name;
        name.tabIndex = 0;
      }
      item.append(make('span', 'qty', String(line.qty)), name);
      item.append(printingCell(line));
      if (line.card) item.append(make('span', 'type', line.card.t), make('span', 'cost', line.card.m));
      else item.append(make('span', 'type', 'not matched'));
      list.append(item);
    }
    container.append(heading, list);
  }
}

const CERTAINTY_NOTES = {
  marked: 'Your list marks this card as the commander.',
  unlabeled: 'This card came after a blank line, which is where Moxfield puts the commander. Please check it.',
  legendary: 'A guess: the first legendary creature in your main deck. Please check it.',
  first: 'A guess: the first card in your main deck. Please check it.',
};

function renderCommander() {
  if (!preview) return; // nothing is checked yet (or the list was cleared), so there is nobody to choose from
  const seen = new Set();
  const options = preview.lines
    .filter((line) => line.status === 'matched' && line.section !== 'maybeboard' && !seen.has(line.card.i) && seen.add(line.card.i))
    .sort((a, b) => a.name.localeCompare(b.name, 'en')); // for people to read: accented names sort with their letter
  $('commander-box').hidden = options.length === 0;
  const first = $('commander-1');
  const second = $('commander-2');
  first.replaceChildren(...options.map((line) => new Option(line.name, line.card.i)));
  second.replaceChildren(new Option('No partner', ''), ...options.map((line) => new Option(line.name, line.card.i)));
  if (!modeTouched) mode = preview.commander.looksLikeCommander ? 'commander' : 'none';
  if (!formatTouched) $('deck-format').value = mode === 'commander' ? 'commander' : 'standard';
  if (!picksTouched) picks = [preview.commander.ids[0] ?? '', preview.commander.ids[1] ?? ''];
  first.value = options.some((line) => line.card.i === picks[0]) ? picks[0] : (options[0]?.card.i ?? '');
  second.value = options.some((line) => line.card.i === picks[1]) ? picks[1] : '';
  $('mode-commander').checked = mode === 'commander';
  $('mode-none').checked = mode === 'none';
  first.disabled = second.disabled = mode === 'none';
  $('commander-note').textContent = mode === 'commander' ? (CERTAINTY_NOTES[preview.commander.certainty] ?? '') : '';
}

function renderSaveBox() {
  const unmatchedLines = preview.lines.filter((line) => line.status !== 'matched' && line.section !== 'maybeboard').length;
  $('missing-box').hidden = unmatchedLines === 0;
  if (unmatchedLines === 0) $('allow-missing').checked = false;
  $('allow-missing-label').textContent = `Save without the ${plural(unmatchedLines, 'line', 'lines')} that ${unmatchedLines === 1 ? 'was' : 'were'} not matched`;
  $('save').disabled = !preview.canSave;
  $('save-note').hidden = library.decks.length === 0;
}

// ---- the saved decks ----
function readSavedLibrary() {
  libraryRead = readLibrary(store.get(LIBRARY_KEY), store.get(LEGACY_KEY));
  library = libraryRead.library;
}

// Writes the library. The old single-deck key goes once the library is written, so a deleted deck cannot come back from it.
function writeLibrary() {
  if (!store.set(LIBRARY_KEY, serializeLibrary(library))) return false;
  store.remove(LEGACY_KEY);
  libraryRead = { source: 'library', skipped: 0 };
  return true;
}

// Makes a change to the library and keeps it; if the browser will not save it, the change is undone and the page says so.
function commit(next, message) {
  const before = library;
  library = next;
  if (!writeLibrary()) {
    library = before;
    say('Your browser would not save that change. Its storage may be full or switched off.', true);
    return false;
  }
  renderSaved();
  say(message);
  return true;
}

function deckSummary(entry) {
  const { deck } = entry;
  const commanders = deck.cards.filter((card) => card.section === 'commander').map((card) => card.n);
  return `${deck.name} (${FORMAT_TITLES[entry.format]}): ${plural(totalCards(deck), 'card', 'cards')}${commanders.length ? `, commander ${commanders.join(' and ')}` : ''}. Saved ${new Date(deck.savedAt).toLocaleDateString()}.${deck.skipped ? ` ${plural(deck.skipped, 'line was', 'lines were')} left out because they were not matched.` : ''}`;
}

function renderSaved() {
  const problem = libraryRead.source === 'damaged'
    ? 'Your saved decks could not be read, so they were ignored. Saving a deck starts a new list.'
    : libraryRead.skipped ? `${plural(libraryRead.skipped, 'saved deck', 'saved decks')} could not be read and ${libraryRead.skipped === 1 ? 'was' : 'were'} left out.` : '';
  $('saved').hidden = library.decks.length === 0 && !problem;
  $('saved-summary').textContent = problem;
  $('saved-summary').hidden = !problem;
  $('saved-list').replaceChildren(...library.decks.map((entry) => {
    const item = make('li', 'saved-deck');
    item.dataset.deckId = entry.id;
    const selected = entry.id === library.selected;
    item.append(make('span', 'saved-text', `${deckSummary(entry)}${selected ? ' Selected for the solo table.' : ''}`));
    const actions = make('span', 'saved-actions');
    const button = (action, label, className) => {
      const element = make('button', className, label);
      element.type = 'button';
      element.dataset.action = action;
      element.setAttribute('aria-label', `${label}: ${entry.deck.name}`);
      return element;
    };
    actions.append(button('load', 'Load it into the box below'), ...(selected ? [] : [button('select', 'Use for the solo table', 'secondary')]), button('delete', 'Delete it', 'secondary'));
    item.append(actions);
    return item;
  }));
  $('save-note').hidden = library.decks.length === 0;
}

async function loadSaved(id) {
  const entry = library.decks.find((candidate) => candidate.id === id);
  if (!entry || !index) return;
  const { deck } = entry;
  $('deck-text').value = deck.text;
  await runCheck();
  if (!preview || $('deck-text').value !== deck.text) return; // another check came in while the printings loaded
  mode = deck.commander.length ? 'commander' : 'none';
  modeTouched = true;
  picks = [deck.commander[0] ?? '', deck.commander[1] ?? ''];
  picksTouched = true;
  renderCommander();
  $('deck-name').value = deck.name;
  $('deck-format').value = entry.format;
  formatTouched = true;
  say(`Loaded "${deck.name}".`);
}

function save() {
  if (!preview) return;
  const ids = mode === 'commander' ? [$('commander-1').value, $('commander-2').value].filter(Boolean) : [];
  const result = buildSavedDeck(preview, { name: $('deck-name').value, text, commanderIds: ids, allowMissing: $('allow-missing').checked });
  if (!result.ok) { say(result.error, true); return; }
  const added = addDeck(library, result.deck, { format: $('deck-format').value });
  if (!added.ok) { say(added.error, true); return; }
  commit(added.library, `${added.replaced ? 'Replaced' : 'Saved'} "${result.deck.name}": ${plural(totalCards(result.deck), 'card', 'cards')}.`);
}

// ---- wiring ----
$('check').addEventListener('click', runCheck);
$('retry').addEventListener('click', loadCards);
$('clear').addEventListener('click', () => {
  $('deck-text').value = '';
  text = ''; choices = {}; preview = null; modeTouched = false; picksTouched = false; formatTouched = false;
  checkRun++; // a check still waiting for printing files must not bring the preview back
  $('preview').hidden = true;
  say('');
  $('deck-text').focus();
});
$('deck-text').addEventListener('keydown', (event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) runCheck(); });
$('mode-commander').addEventListener('change', () => { mode = 'commander'; modeTouched = true; renderCommander(); });
$('mode-none').addEventListener('change', () => { mode = 'none'; modeTouched = true; renderCommander(); });
$('commander-1').addEventListener('change', () => { picks[0] = $('commander-1').value; picksTouched = true; });
$('commander-2').addEventListener('change', () => { picks[1] = $('commander-2').value; picksTouched = true; });
$('save').addEventListener('click', save);
$('deck-format').addEventListener('change', () => { formatTouched = true; });
// The buttons of each saved deck, found by delegation so the list can be drawn again without wiring anything.
$('saved-list').addEventListener('click', (event) => {
  const button = event.target instanceof Element ? event.target.closest('button[data-action]') : null;
  const id = button?.closest('[data-deck-id]')?.dataset.deckId;
  const entry = library.decks.find((candidate) => candidate.id === id);
  if (!button || !entry) return;
  if (button.dataset.action === 'load') loadSaved(id);
  else if (button.dataset.action === 'select') commit(selectDeck(library, id), `"${entry.deck.name}" is now the deck for the solo table.`);
  else if (button.dataset.action === 'delete') commit(removeDeck(library, id), `Deleted "${entry.deck.name}".`);
});

// Can this browser keep anything? If not, the page still works; it just cannot remember a deck.
const canStore = store.set(PROBE_KEY, '1');
store.remove(PROBE_KEY);
$('storage-hint').hidden = canStore;
readSavedLibrary();
renderSaved();
setupCardPeek({ root: $('sections'), peek: $('card-peek'), image: $('card-peek-image'), note: $('card-peek-note') });
loadCards();
