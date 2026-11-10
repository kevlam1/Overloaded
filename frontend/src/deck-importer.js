// The deck manager: your saved decks, pasting a decklist, and one checked deck laid out by card type (as text or as card pictures), with its name, format, bracket and
// commander, saved in this browser. It is one component that two pages use: the /deck page and the lobby's own screen (where a player can import or change a deck without
// leaving the table). It builds its own markup inside the element it is given, so the two pages cannot drift apart. The thinking is in shared/ (the parser, the matcher,
// shared/deck-preview.mjs and shared/deck-view.mjs, all tested in Node); this file reads the form and draws the result. Everything typed or pasted is put into the page as
// text, never as markup.
//
// Three screens, one at a time: "list" (the saved decks), "paste" (the box for a decklist) and "deck" (one checked deck).
import { buildCardIndex, matchDeck } from '../../shared/card-match.mjs';
import { parseDeckText } from '../../shared/deck-text.mjs';
import { makePreview, buildSavedDeck, printingSetsNeeded, isLegendaryCreature, PRINTING_PROBLEM_WORDS } from '../../shared/deck-preview.mjs';
import { groupDeck } from '../../shared/deck-view.mjs';
import { commanderMenuItems, applyCommanderChoice, commanderChoiceMessage } from '../../shared/deck-commander.mjs';
import { openCardMenu } from './card-menu.js';
import { setPrintingInText } from '../../shared/deck-text-edit.mjs';
import { makePrintsLoader } from './card-prints.js';
import { openPrintingPicker } from './printing-picker.js';
import { LIBRARY_KEY, LEGACY_KEY, FORMAT_TITLES, emptyLibrary, readLibrary, serializeLibrary, addDeck, removeDeck, selectDeck } from '../../shared/deck-library.mjs';
import { makeSafeStore } from './safe-store.js';
import { loadCardList } from './card-list.js';
import { makePrintingLoader } from './printings.js';
import { sampleById } from '../../shared/sample-decks.mjs';
import { setupCardPeek } from './card-peek.js';
import { renderGroups, mountViewToggle, VIEWS } from './deck-groups.js';
import { isValidCode } from '../../shared/table-code.mjs';

const store = makeSafeStore();
const PROBE_KEY = 'overloaded.storage-probe';
const VIEW_KEY = 'overloaded.deckView'; // 'text' or 'images', remembered in this browser

let root = null;
const $ = (id) => root.querySelector(`#${id}`);

let index = null; // the card list, ready to match against
let text = ''; // the text the preview on screen is for
let choices = {}; // names the player settled (an ambiguous name, a "did you mean")
let preview = null;
let picks = ['', '']; // the chosen commander and partner (card ids)
let picksTouched = false;
let library = emptyLibrary(); // the saved decks
let libraryRead = { source: 'empty', skipped: 0 }; // what reading them found (so the page can say if some could not be read)
let formatTouched = false; // the player chose the format, so it no longer follows the commander choice
let view = 'text';
let solo = true; // the saved decks have a "Play solo" button (not inside the lobby, where the table has its own deck)
const printingLoader = makePrintingLoader();
const printsLoader = makePrintsLoader(); // the printings of one card, fetched when its printing picker is opened
let printingFiles = new Map(); // the set files the pasted list names (see src/printings.js)
let checkRun = 0; // a newer check makes an older one that is still waiting for printing files stop
let viewToggle = null;
let pendingSample; // undefined, or the id of a sample deck to put in the box once the card list has loaded ('' is the first one; a /deck?sample address asks for it)
let onLibraryChange = () => {};
let mounted = false;

function make(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}
// A button, a field with its label, and the like: small helpers so the markup below reads as a list of what is on the page.
function button(id, label, className = '', attrs = {}) {
  const element = make('button', className, label);
  element.type = 'button';
  if (id) element.id = id;
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
  return element;
}
function field(id, label, control, className = 'field') {
  const wrap = make('div', className);
  const labelElement = make('label', '', label);
  labelElement.htmlFor = id;
  control.id = id;
  control.name = id;
  wrap.append(labelElement, control);
  return wrap;
}
function select(options) {
  const element = make('select');
  for (const [value, label] of options) element.append(new Option(label, value));
  return element;
}

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const totalCards = (deck) => deck.cards.reduce((sum, card) => sum + card.qty, 0);

function say(message, isError = false) {
  $('deck-status').textContent = message;
  $('deck-status').classList.toggle('error', isError);
}

// ---- the markup ----
function build() {
  root.classList.add('deck-app');
  const status = make('p', 'status');
  status.id = 'deck-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  // screen 1: the saved decks
  const saved = make('section');
  saved.id = 'saved';
  saved.setAttribute('aria-labelledby', 'saved-heading');
  const savedHead = make('div', 'screen-head');
  const savedHeading = make('h2', 'sr-only', 'Your decks');
  savedHeading.id = 'saved-heading';
  savedHeading.tabIndex = -1;
  savedHead.append(savedHeading, button('new-deck', 'New deck'));
  const savedSummary = make('p');
  savedSummary.id = 'saved-summary';
  const savedList = make('ul', 'saved-list');
  savedList.id = 'saved-list';
  const savedEmpty = make('p', 'hint', 'No decks saved yet.');
  savedEmpty.id = 'saved-empty';
  saved.append(savedHead, savedSummary, savedList, savedEmpty);

  // screen 2: pasting a list
  const paste = make('section');
  paste.id = 'paste';
  paste.setAttribute('aria-labelledby', 'paste-heading');
  const pasteHeading = make('h2', '', 'Add a deck');
  pasteHeading.id = 'paste-heading';
  pasteHeading.tabIndex = -1;
  const lede = make('p', 'hint', 'Paste a list from Moxfield, Archidekt or ManaBox. It stays in this browser.');
  const textarea = make('textarea');
  textarea.rows = 12;
  textarea.placeholder = ['1 Sol Ring', '1 Lightning Bolt', '...'].join(String.fromCharCode(10));
  textarea.spellcheck = false;
  textarea.setAttribute('autocomplete', 'off');
  textarea.setAttribute('autocapitalize', 'off');
  const pasteActions = make('div', 'actions');
  const check = button('check', 'Check deck');
  check.disabled = true;
  const sample = button('sample', 'Try a sample deck', 'secondary');
  sample.disabled = true;
  pasteActions.append(check, sample, button('cancel-paste', 'Cancel', 'secondary'));
  const listState = make('p', 'hint', 'Loading the card list...');
  listState.id = 'list-state';
  const retry = button('retry', 'Try again', 'secondary');
  retry.hidden = true;
  const storageHint = make('p', 'hint', 'Your browser is not letting this page save anything, so a deck cannot be kept after you leave.');
  storageHint.id = 'storage-hint';
  storageHint.hidden = true;
  const textField = field('deck-text', 'Decklist', textarea);
  textField.firstChild.className = 'sr-only';
  paste.append(pasteHeading, lede, textField, pasteActions, listState, retry, storageHint);

  // screen 3: one checked deck
  const deck = make('section');
  deck.id = 'preview';
  deck.setAttribute('aria-labelledby', 'preview-heading');
  const deckHeading = make('h2', 'sr-only', 'Your deck');
  deckHeading.id = 'preview-heading';
  deckHeading.tabIndex = -1;
  const bar = make('div', 'deck-bar');
  bar.append(button('back-to-decks', 'All decks', 'secondary'), button('edit-list', 'Edit list', 'secondary'));
  const nameInput = make('input');
  nameInput.type = 'text';
  nameInput.maxLength = 60;
  nameInput.autocomplete = 'off';
  nameInput.spellcheck = false;
  const missing = make('div', 'choice');
  missing.id = 'missing-box';
  missing.hidden = true;
  const allow = make('input');
  allow.type = 'checkbox';
  allow.id = 'allow-missing';
  const allowLabel = make('label');
  allowLabel.htmlFor = 'allow-missing';
  allowLabel.id = 'allow-missing-label';
  missing.append(allow, allowLabel);
  const head = make('div', 'deck-head');
  const saveBox = make('div', 'deck-save');
  saveBox.append(missing, button('save', 'Save deck'));
  head.append(field('deck-name', 'Deck name', nameInput, 'field deck-name-field'), saveBox);

  const formatSelect = select([['commander', 'Commander'], ['standard', 'Standard']]);
  const bracketSelect = select([['', 'Not set'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']]);
  const bracketField = field('deck-bracket', 'Bracket', bracketSelect);
  bracketField.id = 'bracket-field';
  bracketField.title = 'How strong the deck is, for the table to see next to your commander.';
  const commanderBox = make('div', 'commander-box');
  commanderBox.id = 'commander-box';
  commanderBox.append(field('commander-1', 'Commander', make('select')), field('commander-2', 'Partner', make('select')));
  const settings = make('div', 'deck-settings');
  settings.append(field('deck-format', 'Format', formatSelect), bracketField, commanderBox);
  const commanderNote = make('p', 'hint');
  commanderNote.id = 'commander-note';

  const summaryRow = make('div', 'deck-summary');
  const summary = make('p');
  summary.id = 'summary';
  const toggle = make('div', 'view-toggle');
  toggle.id = 'view-toggle';
  summaryRow.append(summary, toggle);
  const notices = make('ul', 'notices');
  notices.id = 'notices';
  const problems = make('div');
  problems.id = 'problems';
  problems.hidden = true;
  const problemList = make('ul', 'problems');
  problemList.id = 'problem-list';
  problems.append(make('h3', '', 'Needs attention'), problemList);
  const sections = make('div', 'deck-sections');
  sections.id = 'sections';
  const header = make('div', 'deck-header');
  header.append(head, settings, commanderNote);
  deck.append(deckHeading, bar, header, summaryRow, notices, problems, sections);

  root.replaceChildren(status, saved, paste, deck);
}

// Shows one screen. Moving to the deck puts the keyboard focus on its heading, and to the other two on theirs, so a screen reader says where it is.
function showScreen(name) {
  $('saved').hidden = name !== 'list';
  $('paste').hidden = name !== 'paste';
  $('preview').hidden = name !== 'deck' || !preview;
  root.dataset.screen = name;
  if (name === 'list') $('saved-heading').focus();
  else if (name === 'paste') $('deck-text').focus();
  else if (name === 'deck') $('preview-heading').focus();
  $('cancel-paste').hidden = !(preview || library.decks.length > 0 || libraryRead.source === 'damaged');
}

// ---- the card list ----
async function loadCards() {
  $('check').disabled = true;
  $('sample').disabled = true;
  $('retry').hidden = true;
  $('list-state').textContent = 'Loading the card list...';
  $('list-state').title = '';
  try {
    const cards = await loadCardList();
    index = buildCardIndex(cards);
    $('list-state').textContent = '';
    $('list-state').title = `${cards.length.toLocaleString('en-US')} cards in the card list. Cards newer than the list show as not found; the list is refreshed every week.`;
    $('check').disabled = false;
    $('sample').disabled = false;
    if (pendingSample !== undefined) {
      const id = pendingSample;
      pendingSample = undefined;
      await useSample(id);
    }
  } catch {
    index = null;
    $('list-state').textContent = 'The card list could not be loaded. Check your connection and try again.';
    $('retry').hidden = false;
  }
}

// Puts a sample deck (shared/sample-decks.mjs) in the paste box with its name, checks it like any pasted list, and offers its format. Nothing is saved: the player looks at it and
// saves it if they like.
async function useSample(id) {
  if (!index) return;
  const sample = sampleById(id);
  $('deck-text').value = sample.text;
  $('deck-name').value = sample.name;
  await runCheck();
  if (!preview || $('deck-text').value !== sample.text) return; // another check came in while the printings loaded
  setFormat(sample.format);
}

// ---- checking a pasted list ----
// Only a list that names sets and numbers waits for anything: it fetches the printing files of those sets (our own static files, one per set, no request to Scryfall). A list
// without them is checked straight away.
async function runCheck() {
  if (!index) return;
  const pasted = $('deck-text').value;
  if (pasted !== text) { choices = {}; picksTouched = false; formatTouched = false; $('deck-bracket').value = ''; }
  text = pasted;
  const run = ++checkRun;
  if (!text.trim()) { say('Paste a decklist first.', true); return; }
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
  say('');
  refresh();
  showScreen('deck');
}

// Works the preview out again from the text it is for (so choosing a card does not depend on what is now in the box).
function refresh() {
  const parsed = parseDeckText(text);
  preview = makePreview(parsed, matchDeck(index, parsed.entries), choices, printingFiles);
  renderPreview();
}

function renderPreview() {
  const { counts } = preview;
  $('summary').textContent = counts.cards === 0 ? 'No cards were found in that.' : `${plural(counts.cards, 'card', 'cards')}${counts.problem === 0 ? '' : ` · ${counts.problem} need attention`}`;
  $('summary').classList.toggle('has-problems', counts.problem > 0);
  const notices = $('notices');
  notices.replaceChildren(...preview.notices.map((notice) => make('li', '', notice)));
  notices.hidden = preview.notices.length === 0;
  renderProblems();
  renderCommander();
  renderSections();
  renderSaveBox();
}

function choiceSelect(line, label) {
  const element = make('select');
  element.setAttribute('aria-label', label);
  element.append(new Option('Choose a card...', ''));
  for (const candidate of line.candidates) element.append(new Option(`${candidate.n} (${candidate.t})`, candidate.i));
  element.addEventListener('change', () => {
    if (!element.value) return;
    choices[line.typedKey] = element.value;
    refresh();
    say(`Chose ${preview.lines.find((l) => l.typedKey === line.typedKey)?.name ?? 'the card'}.`);
  });
  return element;
}

function renderProblems() {
  const list = $('problem-list');
  list.replaceChildren();
  const { not_found: missing, ambiguous, suggestion } = preview.problems;
  for (const line of ambiguous) {
    const item = make('li', 'problem');
    item.append(make('span', '', `"${line.typed}" (${line.qty}) matches more than one card: `), choiceSelect(line, `Choose the card for ${line.typed}`));
    list.append(item);
  }
  for (const line of suggestion) {
    const item = make('li', 'problem');
    item.append(make('span', '', `"${line.typed}" (${line.qty}) is the back of another card. Did you mean: `), choiceSelect(line, `Choose the card for ${line.typed}`));
    list.append(item);
  }
  for (const line of missing) {
    const item = make('li', 'problem', `"${line.typed}" (${line.qty}) was not found.`);
    item.title = 'It may be spelled differently, or newer than our card list.';
    list.append(item);
  }
  $('problems').hidden = list.children.length === 0;
}

// The small element that says which printing a text row shows: the set and number as typed (SLD 916), with "(not found)" or "(not loaded)" after one that could not be used, and its
// words as the tooltip. A row found by a title says "title" when no set was typed. Empty (and so left out of the row) for a card with nothing typed about its printing.
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

// The commander ids that count right now: the two pickers in a Commander deck, none otherwise.
const isCommander = () => $('deck-format').value === 'commander';
const commanderIds = () => (isCommander() && !$('commander-box').hidden ? [$('commander-1').value, $('commander-2').value].filter(Boolean) : []);

function renderSections() {
  renderGroups($('sections'), groupDeck(preview.lines, { commanderIds: commanderIds() }), { view, printingCell, menuFor: (line) => menuItemsFor(line).length > 0 });
}

// ---- changing a card's printing: the window of printings (src/printing-picker.js), and the card's line in the text rewritten to name the one that was chosen ----
function openPicker(line, returnFocus) {
  openPrintingPicker({ root, name: line.name, defaultId: line.card.i, currentId: line.printingSource === 'set' || line.printingSource === 'title' ? line.printingId : null, loader: printsLoader, returnFocus, onPick: (row) => applyPrinting(line, row) });
}
async function applyPrinting(line, row) {
  const edited = setPrintingInText(text, line.sourceLines, line.name, row ? { set: row.set, number: row.number } : null);
  if (edited.changed === 0) { say(`${line.name} already uses that printing.`); return; }
  const run = ++checkRun;
  // The preview finds a printing in its set's file, so that file is fetched first (our own static file; a set already loaded is not fetched again).
  const wanted = row ? [row.set] : [];
  const loaded = wanted.length ? await printingLoader.load(wanted) : new Map();
  if (run !== checkRun) return; // another check or change came in while it loaded
  text = edited.text;
  $('deck-text').value = text;
  printingFiles = new Map([...printingFiles, ...loaded]);
  refresh(); // the same cards, with the new printing; the name, format, bracket and commander stay as they were
  say(row ? `${line.name}: ${row.set.toUpperCase()} ${row.number}.` : `${line.name}: default printing.`);
}

// ---- a card's menu: the "..." button on a card, or a right-click on it ----
// What it offers is in shared/deck-commander.mjs (making a card the commander or the partner, or taking it out; the card that was replaced goes back to its type group).
const currentPicks = () => (isCommander() && !$('commander-box').hidden ? [$('commander-1').value, $('commander-2').value] : ['', '']);
function menuItemsFor(line) {
  if (!line || line.status !== 'matched' || !line.card) return [];
  return [{ id: 'printing', label: 'Change printing...' }, ...commanderMenuItems(line, currentPicks(), { commanderFormat: isCommander() && !$('commander-box').hidden })];
}
function lineOf(element) {
  const ref = element instanceof Element ? element.closest('[data-ref]')?.dataset.ref : null;
  const group = element instanceof Element ? element.closest('.deck-group')?.dataset.group : null;
  // a card's line: the one in the group it is shown in (the Commander group holds a copy of its line), else any line of that card
  const candidates = preview.lines.filter((line) => line.card && line.card.i === ref);
  return candidates.find((line) => group !== 'sideboard' && group !== 'maybeboard' && group !== 'companion' && ['main', 'commander', 'unlabeled'].includes(line.section))
    ?? candidates.find((line) => line.section === group) ?? candidates[0] ?? null;
}
function openLineMenu(line, x, y, returnFocus) {
  const items = menuItemsFor(line);
  if (!items.length) return;
  openCardMenu({ title: line.name, items, x, y, returnFocus, onPick: (action) => {
    if (action === 'printing') { openPicker(line, returnFocus); return; }
    picks = applyCommanderChoice(currentPicks(), action, line.card.i);
    picksTouched = true;
    renderCommander();
    renderSections();
    say(commanderChoiceMessage(action, line.name));
  } });
}

const CERTAINTY_NOTES = {
  marked: '',
  unlabeled: 'Taken from after the blank line in your list. Check that it is right.',
  legendary: 'No commander is marked in your list, so the first legendary creature was picked.',
  first: 'No commander is marked in your list, so the first card was picked.',
};

function setFormat(value) {
  $('deck-format').value = value;
  formatTouched = true; // the player (or a loaded deck) chose it, so it no longer follows the guess
  renderCommander();
  renderSections();
}

function renderCommander() {
  if (!preview) return; // nothing is checked yet (or the list was cleared), so there is nobody to choose from
  const seen = new Set();
  const lines = preview.lines
    .filter((line) => line.status === 'matched' && line.section !== 'maybeboard' && !seen.has(line.card.i) && seen.add(line.card.i))
    .sort((a, b) => a.name.localeCompare(b.name, 'en')); // for people to read: accented names sort with their letter
  // The likely commanders (legendary creatures) first, then every other card, each group sorted by name.
  const likely = lines.filter((line) => isLegendaryCreature(line.card));
  const ordered = [...likely, ...lines.filter((line) => !isLegendaryCreature(line.card))];
  const groups = () => {
    const group = (label, list) => {
      const element = document.createElement('optgroup');
      element.label = label;
      element.append(...list.map((line) => new Option(line.name, line.card.i)));
      return element;
    };
    const others = ordered.slice(likely.length);
    return [likely.length ? group('Likely commanders', likely) : null, others.length ? group(likely.length ? 'Other cards' : 'All cards', others) : null].filter(Boolean);
  };
  if (!formatTouched) $('deck-format').value = preview.commander.looksLikeCommander ? 'commander' : 'standard';
  const commander = isCommander();
  $('bracket-field').hidden = !commander;
  $('commander-box').hidden = !commander || lines.length === 0;
  const first = $('commander-1');
  const second = $('commander-2');
  first.replaceChildren(...groups());
  second.replaceChildren(new Option('No partner', ''), ...groups());
  if (!picksTouched) picks = [preview.commander.ids[0] ?? '', preview.commander.ids[1] ?? ''];
  first.value = ordered.some((line) => line.card.i === picks[0]) ? picks[0] : (ordered[0]?.card.i ?? '');
  second.value = ordered.some((line) => line.card.i === picks[1]) ? picks[1] : '';
  $('commander-note').textContent = commander ? (CERTAINTY_NOTES[preview.commander.certainty] ?? '') : '';
}

function renderSaveBox() {
  const unmatchedLines = preview.lines.filter((line) => line.status !== 'matched' && line.section !== 'maybeboard').length;
  $('missing-box').hidden = unmatchedLines === 0;
  if (unmatchedLines === 0) $('allow-missing').checked = false;
  $('allow-missing-label').textContent = `Save without the ${plural(unmatchedLines, 'line', 'lines')} that ${unmatchedLines === 1 ? 'was' : 'were'} not matched`;
  $('save').disabled = !preview.canSave;
  $('save').title = library.decks.length ? 'Saving a deck with the same name replaces that deck. You can keep up to 20 decks.' : '';
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
  if (preview) renderSaveBox(); // its tooltip depends on whether anything is saved
  say(message);
  onLibraryChange(library);
  return true;
}

// One saved deck as two lines: its name, and what it is (format, bracket, size, commander, when it was saved).
function deckMeta(entry) {
  const { deck } = entry;
  const commanders = deck.cards.filter((card) => card.section === 'commander').map((card) => card.n);
  const parts = [FORMAT_TITLES[entry.format] + (entry.bracket ? `, bracket ${entry.bracket}` : ''), plural(totalCards(deck), 'card', 'cards')];
  if (commanders.length) parts.push(commanders.join(' and '));
  parts.push(`saved ${new Date(deck.savedAt).toLocaleDateString()}`);
  if (deck.skipped) parts.push(`${plural(deck.skipped, 'line', 'lines')} left out (not matched)`);
  return parts.join(' · ');
}

function renderSaved() {
  const problem = libraryRead.source === 'damaged'
    ? 'Your saved decks could not be read, so they were ignored. Saving a deck starts a new list.'
    : libraryRead.skipped ? `${plural(libraryRead.skipped, 'saved deck', 'saved decks')} could not be read and ${libraryRead.skipped === 1 ? 'was' : 'were'} left out.` : '';
  $('saved-summary').textContent = problem;
  $('saved-summary').hidden = !problem;
  $('saved-empty').hidden = library.decks.length > 0;
  $('saved-list').replaceChildren(...library.decks.map((entry) => {
    const item = make('li', 'saved-deck');
    item.dataset.deckId = entry.id;
    const text = make('span', 'saved-text');
    const name = make('strong', 'saved-name', entry.deck.name);
    if (solo && entry.id === library.selected) name.append(make('span', 'solo-tag', ' solo deck'));
    text.append(name, make('span', 'saved-meta', deckMeta(entry)));
    const actions = make('span', 'saved-actions');
    const action = (kind, label, className) => {
      const element = button('', label, className);
      element.dataset.action = kind;
      element.setAttribute('aria-label', `${label}: ${entry.deck.name}`);
      return element;
    };
    actions.append(action('load', 'Open'), ...(solo ? [action('play', 'Play solo', 'secondary')] : []), action('delete', 'Delete', 'secondary'));
    item.append(text, actions);
    return item;
  }));
}

async function loadSaved(id) {
  const entry = library.decks.find((candidate) => candidate.id === id);
  if (!entry || !index) return;
  const { deck } = entry;
  $('deck-text').value = deck.text;
  await runCheck();
  if (!preview || $('deck-text').value !== deck.text) return; // another check came in while the printings loaded
  picks = [deck.commander[0] ?? '', deck.commander[1] ?? ''];
  picksTouched = true;
  $('deck-name').value = deck.name;
  $('deck-bracket').value = entry.bracket ? String(entry.bracket) : '';
  setFormat(entry.format);
}

function save() {
  if (!preview) return;
  const ids = commanderIds();
  const result = buildSavedDeck(preview, { name: $('deck-name').value, text, commanderIds: ids, allowMissing: $('allow-missing').checked });
  if (!result.ok) { say(result.error, true); return; }
  const bracket = isCommander() && $('deck-bracket').value ? Number($('deck-bracket').value) : null; // brackets are a Commander idea
  const added = addDeck(library, result.deck, { format: $('deck-format').value, bracket });
  if (!added.ok) { say(added.error, true); return; }
  commit(added.library, `${added.replaced ? 'Replaced' : 'Saved'} "${result.deck.name}": ${plural(totalCards(result.deck), 'card', 'cards')}.`);
}

function setView(next) {
  if (!VIEWS.includes(next) || next === view) return;
  view = next;
  store.set(VIEW_KEY, view);
  viewToggle.set(view);
  if (preview) renderSections();
}

// ---- starting ----
// root: the element to build the manager in. Options: sampleId (undefined, or the sample deck a /deck?sample address asks for: '' is the first), onLibraryChange (called after
// the saved decks change, so a page that lists them can look again), backLink (point the page's #back link at the table this browser is at), play (the saved decks get a
// "Play solo" button; not inside the lobby). Call it once; a second call does nothing.
export function mountDeckImporter({ root: container, sampleId, onLibraryChange: onChange = () => {}, backLink = true, play = true } = {}) {
  if (mounted || !container) return;
  mounted = true;
  root = container;
  solo = play;
  pendingSample = sampleId;
  onLibraryChange = onChange;
  build();
  // If you are at a table (the lobby remembers the last one in this browser), "Back to the lobby" goes to that table's address, not the start page.
  const lastTable = store.get('overloaded.lastTable');
  const back = document.getElementById('back');
  if (backLink && back && typeof lastTable === 'string' && isValidCode(lastTable)) back.href = `/lobby/${lastTable}`;

  const savedView = store.get(VIEW_KEY);
  view = VIEWS.includes(savedView) ? savedView : 'text';
  viewToggle = mountViewToggle($('view-toggle'), { view, onChange: setView });

  $('check').addEventListener('click', runCheck);
  $('retry').addEventListener('click', loadCards);
  $('sample').addEventListener('click', () => useSample());
  $('new-deck').addEventListener('click', () => { $('deck-text').value = ''; text = ''; preview = null; choices = {}; picksTouched = false; formatTouched = false; $('deck-bracket').value = ''; $('deck-name').value = ''; checkRun++; say(''); showScreen('paste'); });
  $('cancel-paste').addEventListener('click', () => { say(''); showScreen(preview ? 'deck' : 'list'); });
  $('back-to-decks').addEventListener('click', () => { say(''); showScreen('list'); });
  $('edit-list').addEventListener('click', () => { say(''); showScreen('paste'); });
  $('deck-text').addEventListener('keydown', (event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) runCheck(); });
  $('commander-1').addEventListener('change', () => { picks[0] = $('commander-1').value; picksTouched = true; renderSections(); });
  $('commander-2').addEventListener('change', () => { picks[1] = $('commander-2').value; picksTouched = true; renderSections(); });
  $('save').addEventListener('click', save);
  $('sections').addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('.row-menu') : null;
    const line = button ? lineOf(button) : null;
    if (!button || !line) return;
    const box = button.getBoundingClientRect();
    openLineMenu(line, box.left, box.bottom + 2, button);
  });
  $('sections').addEventListener('contextmenu', (event) => {
    const line = lineOf(event.target);
    if (!line || menuItemsFor(line).length === 0) return; // nothing to offer: leave the browser's own menu
    event.preventDefault();
    const fromKeyboard = event.clientX === 0 && event.clientY === 0;
    const box = event.target.closest('[data-ref]').getBoundingClientRect();
    openLineMenu(line, fromKeyboard ? box.left + 24 : event.clientX, fromKeyboard ? box.top + box.height / 2 : event.clientY, event.target.closest('[data-ref]'));
  });
  $('deck-format').addEventListener('change', () => { formatTouched = true; renderCommander(); renderSections(); });
  // The buttons of each saved deck, found by delegation so the list can be drawn again without wiring anything.
  $('saved-list').addEventListener('click', (event) => {
    const clicked = event.target instanceof Element ? event.target.closest('button[data-action]') : null;
    const id = clicked?.closest('[data-deck-id]')?.dataset.deckId;
    const entry = library.decks.find((candidate) => candidate.id === id);
    if (!clicked || !entry) return;
    if (clicked.dataset.action === 'load') loadSaved(id);
    else if (clicked.dataset.action === 'play') { if (commit(selectDeck(library, id), `"${entry.deck.name}" is now the deck for the solo table.`)) location.assign('/solo'); }
    else if (clicked.dataset.action === 'delete') commit(removeDeck(library, id), `Deleted "${entry.deck.name}".`);
  });

  // Can this browser keep anything? If not, the page still works; it just cannot remember a deck.
  const canStore = store.set(PROBE_KEY, '1');
  store.remove(PROBE_KEY);
  $('storage-hint').hidden = canStore;
  readSavedLibrary();
  renderSaved();
  setupCardPeek({ root, peek: document.getElementById('card-peek'), image: document.getElementById('card-peek-image'), note: document.getElementById('card-peek-note') });
  // With saved decks (or a message about decks that could not be read) the page starts at the list; with none it starts at the box to paste into.
  const somethingToShow = library.decks.length > 0 || libraryRead.source === 'damaged' || libraryRead.skipped > 0;
  showScreen(somethingToShow && pendingSample === undefined ? 'list' : 'paste');
  loadCards();
}
