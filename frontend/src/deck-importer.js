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
import { groupDeck, SORTS, SORT_TITLES, DIRECTIONS, directionWords, GROUPINGS, GROUPING_TITLES } from '../../shared/deck-view.mjs';
import { deckStats } from '../../shared/deck-stats.mjs';
import { mountStackPreview } from './stack-preview.js';
import { renderDeckInfo, renderDeckFacts } from './deck-stats.js';
import { commanderMenuItems, applyCommanderChoice, commanderChoiceMessage } from '../../shared/deck-commander.mjs';
import { openCardMenu } from './card-menu.js';
import { setPrintingInText } from '../../shared/deck-text-edit.mjs';
import { makePrintsLoader } from './card-prints.js';
import { openPrintingPicker } from './printing-picker.js';
import { LIBRARY_KEY, LEGACY_KEY, FORMAT_TITLES, emptyLibrary, readLibrary, serializeLibrary, addDeck, replaceDeck, uniqueName, removeDeck, selectDeck } from '../../shared/deck-library.mjs';
import { makeSafeStore } from './safe-store.js';
import { loadCardList } from './card-list.js';
import { makePrintingLoader } from './printings.js';
import { sampleById } from '../../shared/sample-decks.mjs';
import { setupCardPeek } from './card-peek.js';
import { renderGroups, mountViewToggle, VIEWS } from './deck-groups.js';
import { guessBracket, gameChangersIn } from '../../shared/deck-bracket.mjs';
import { deckFace, colorsAsCost, tintGradient, COLOR_NAMES } from '../../shared/deck-colors.mjs';
import { manaNode } from './mana-pips.js';
import { imageUrl } from '../../shared/card-image.mjs';

const store = makeSafeStore();
const PROBE_KEY = 'overloaded.storage-probe';
const VIEW_KEY = 'overloaded.deckView'; // 'text', 'images' or 'stacks', remembered in this browser
const SORT_KEY = 'overloaded.deckSort'; // 'name', 'value' or 'color', remembered in this browser
const GROUPING_KEY = 'overloaded.deckGrouping'; // 'type', 'color' or 'value'
const SORT_DIRECTION_KEY = 'overloaded.deckSortDirection'; // 'asc' or 'desc'

let root = null;
const $ = (id) => root.querySelector(`#${id}`);

let index = null; // the card list, ready to match against
let cardsByName = null; // the card list by name, for the colors of a saved deck (null until it has loaded)
let bracketGuessNow = null; // the bracket guessed for the deck on screen from its Game Changers (null: none, a Standard deck)
let text = ''; // the text the preview on screen is for
let choices = {}; // names the player settled (an ambiguous name, a "did you mean")
let preview = null;
let picks = ['', '']; // the chosen commander and partner (card ids)
let picksTouched = false;
let library = emptyLibrary(); // the saved decks
let libraryRead = { source: 'empty', skipped: 0 }; // what reading them found (so the page can say if some could not be read)
let formatTouched = false; // the player chose the format, so it no longer follows the commander choice
let view = 'text';
let sort = 'name';
let grouping = 'type';
let stackPreview = null;
let direction = 'asc';
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
  const nameInput = make('input');
  nameInput.type = 'text';
  nameInput.maxLength = 60;
  nameInput.autocomplete = 'off';
  nameInput.spellcheck = false;
  const head = make('div', 'deck-head');
  // A deck saves itself after every change; this says so, or says why it could not.
  const saveState = make('p', 'save-state');
  saveState.id = 'save-state';
  saveState.setAttribute('role', 'status');
  saveState.setAttribute('aria-live', 'polite');
  head.append(field('deck-name', 'Deck name', nameInput, 'field deck-name-field'), saveState);

  const formatSelect = select([['commander', 'Commander'], ['standard', 'Standard']]);
  const bracketSelect = select([['', 'Auto'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']]);
  const bracketField = field('deck-bracket', 'Bracket', bracketSelect);
  bracketField.id = 'bracket-field';
  bracketField.title = 'How strong the deck is, for the table to see next to your commander. Auto guesses it from the Game Changers in the deck; pick a number to say it yourself.';
  // The Game Changers are not listed in the header: a small (i) beside Bracket opens a panel that holds them, tidily.
  const infoButton = button('bracket-info', 'i', 'info-button', { 'aria-label': 'About the bracket', 'aria-expanded': 'false', 'aria-controls': 'bracket-pop', title: 'About the bracket' });
  const bracketPop = make('div', 'bracket-pop');
  bracketPop.id = 'bracket-pop';
  bracketPop.hidden = true;
  bracketPop.setAttribute('role', 'group');
  bracketPop.setAttribute('aria-label', 'Bracket information');
  bracketField.classList.add('has-info');
  bracketField.append(infoButton, bracketPop);
  const settings = make('div', 'deck-settings');
  settings.append(field('deck-format', 'Format', formatSelect), bracketField);
  const commanderNote = make('p', 'hint');
  commanderNote.id = 'commander-note';

  const summaryRow = make('div', 'deck-summary');
  const deckNav = make('div', 'deck-nav');
  // On the deck page the header's Decks link goes back to the list; inside the lobby (which has no such link) a small button does.
  if (!solo) deckNav.append(button('back-to-decks', '\u2039 All decks', 'link-button'));
  deckNav.append(button('edit-list', 'Edit list', 'link-button'));
  if (solo) deckNav.append(button('deck-play-solo', 'Play solo', 'link-button')); // (Kevin, 2026-11-14: the deck being looked at can be used for the solo table from here too)
  const summary = make('p');
  summary.id = 'summary';
  const toggle = make('div', 'view-toggle');
  toggle.id = 'view-toggle';
  const sortSelect = select(SORTS.map((key) => [key, SORT_TITLES[key]]));
  const sortLabel = make('label', 'deck-sort', 'Sort by');
  sortLabel.htmlFor = 'deck-sort';
  sortSelect.id = 'deck-sort';
  sortSelect.name = 'deck-sort';
  const groupSelect = select(GROUPINGS.map((key) => [key, GROUPING_TITLES[key]]));
  const groupLabel = make('label', 'deck-sort', 'Group by');
  groupLabel.htmlFor = 'deck-grouping';
  groupSelect.id = 'deck-grouping';
  groupSelect.name = 'deck-grouping';
  const controls = make('div', 'deck-controls');
  const directionButton = button('deck-sort-direction', String.fromCharCode(0x2191) + ' Ascending', 'secondary sort-direction', { title: 'Ascending' });
  controls.append(groupLabel, groupSelect, sortLabel, sortSelect, directionButton, toggle);
  summaryRow.append(deckNav, summary, controls);
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
  const previewBox = make('aside', 'stack-preview');
  previewBox.id = 'stack-preview';
  previewBox.setAttribute('aria-label', 'The card the pointer is on');
  const body = make('div', 'deck-body');
  body.id = 'deck-body';
  body.append(previewBox, sections);
  const facts = make('div', 'deck-facts');
  facts.id = 'deck-facts';
  const info = make('section', 'deck-info');
  info.id = 'deck-info';
  const header = make('div', 'deck-header');
  header.append(head, settings, commanderNote, facts);
  deck.append(deckHeading, header, summaryRow, notices, problems, body, info);

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
    cardsByName = new Map(cards.map((card) => [card.n, card]));
    renderSaved(); // the saved decks now get their colors
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
  // Opened before: the saved copy opens (no second copy is made each time).
  const again = library.decks.find((entry) => entry.deck.name === sample.name && entry.deck.text === sample.text);
  if (again) { await loadSaved(again.id); return; }
  $('deck-text').value = sample.text;
  $('deck-name').value = sample.name;
  currentId = null;
  suppressAutosave = true;
  try {
    await runCheck();
    if (!preview || $('deck-text').value !== sample.text) return; // another check came in while the printings loaded
    setFormat(sample.format);
  } finally { suppressAutosave = false; }
  autosave();
}

// ---- checking a pasted list ----
// Only a list that names sets and numbers waits for anything: it fetches the printing files of those sets (our own static files, one per set, no request to Scryfall). A list
// without them is checked straight away.
async function runCheck() {
  if (!index) return;
  const pasted = $('deck-text').value;
  if (pasted !== text) {
    choices = {};
    // A new deck starts again from the guesses; a saved deck that is being edited keeps its format, bracket and commander (they save with it).
    if (!currentId) { picksTouched = false; formatTouched = false; $('deck-bracket').value = ''; }
  }
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
  autosave();
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
  $('summary').classList.toggle('sr-only', counts.problem === 0); // the cards are counted in the facts strip, so the visible line is only for problems
  const notices = $('notices');
  notices.replaceChildren(...preview.notices.map((notice) => make('li', '', notice)));
  notices.hidden = preview.notices.length === 0;
  renderProblems();
  renderCommander();
  renderBracket();
  renderSections();
  const stats = deckStats(preview.lines);
  renderDeckFacts($('deck-facts'), stats);
  renderDeckInfo($('deck-info'), stats);
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
    autosave();
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
// The commander and the partner are chosen from a card's right-click menu ("Make commander", "Make partner"); picks holds them (ids), and only a Commander deck has any.
const currentPicks = () => (isCommander() && preview ? [picks[0] ?? '', picks[1] ?? ''] : ['', '']);
const commanderIds = () => currentPicks().filter(Boolean);

function renderSections() {
  const groups = groupDeck(preview.lines, { commanderIds: commanderIds(), sort, direction, grouping });
  renderGroups($('sections'), groups, { view, printingCell, menuFor: (line) => menuItemsFor(line).length > 0 });
  $('deck-body').dataset.view = view;
  // Every view has the card display beside it: the commander until the player clicks another card (or the first card when there is none).
  const first = (groups.find((entry) => entry.key === 'commander') ?? groups.find((entry) => entry.lines.some((line) => line.card)))?.lines.find((line) => line.card);
  stackPreview?.refresh(first ? { id: first.printingId ?? first.card.i, name: first.name } : null, true);
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
  autosave();
  say(row ? `${line.name}: ${row.set.toUpperCase()} ${row.number}.` : `${line.name}: default printing.`);
}

// ---- a card's menu: the "..." button on a card, or a right-click on it ----
// What it offers is in shared/deck-commander.mjs (making a card the commander or the partner, or taking it out; the card that was replaced goes back to its type group).
function menuItemsFor(line) {
  if (!line || line.status !== 'matched' || !line.card) return [];
  return [{ id: 'printing', label: 'Change printing...' }, ...commanderMenuItems(line, currentPicks(), { commanderFormat: isCommander() && Boolean(preview) })];
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
    autosave();
    say(commanderChoiceMessage(action, line.name));
  } });
}

const CERTAINTY_NOTES = {
  marked: '',
  unlabeled: 'Taken from after the blank line in your list. Right-click a card to change the commander.',
  legendary: 'No commander is marked in your list, so the first legendary creature was picked. Right-click a card to change it.',
  first: 'No commander is marked in your list, so the first card was picked. Right-click a card to change it.',
};

// The bracket: "Auto" is the guess from the Game Changers (shared/deck-bracket.mjs), and says what it would be; picking a number says it yourself. A Standard deck has no bracket.
function renderBracket() {
  if (!preview) return;
  const found = gameChangersIn(preview.lines);
  bracketGuessNow = isCommander() ? guessBracket(found.count) : null;
  $('deck-bracket').options[0].textContent = bracketGuessNow === null ? 'Auto' : `Auto (${bracketGuessNow})`;
  renderBracketPanel(found);
}

// The panel behind the (i) beside Bracket: what the guess is and the Game Changers it came from, as a list (not a sentence in the header).
function renderBracketPanel(found) {
  const pop = $('bracket-pop');
  pop.dataset.count = String(found.count);
  const parts = [make('p', 'bracket-pop-title', 'Bracket information')];
  if (bracketGuessNow !== null) parts.push(make('p', 'bracket-pop-line', `Auto picks bracket ${bracketGuessNow}, from the Game Changers in this deck. Choose a number yourself to override it.`));
  parts.push(make('p', 'bracket-pop-heading', `Game Changers (${found.count})`));
  if (found.count === 0) parts.push(make('p', 'bracket-pop-none', 'None in this deck.'));
  else {
    const list = make('ul', 'gc-list');
    list.append(...found.names.map((name) => make('li', 'gc-name', name)));
    parts.push(list);
  }
  parts.push(make('p', 'bracket-pop-foot', 'Mass land denial, extra turns and combos are not counted: the card list does not know them.'));
  pop.replaceChildren(...parts);
}
function closeBracketPanel(returnFocus = false) {
  if ($('bracket-pop').hidden) return;
  $('bracket-pop').hidden = true;
  $('bracket-info').setAttribute('aria-expanded', 'false');
  if (returnFocus) $('bracket-info').focus();
}

function setFormat(value) {
  $('deck-format').value = value;
  formatTouched = true; // the player (or a loaded deck) chose it, so it no longer follows the guess
  renderBracket();
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
  if (!formatTouched) $('deck-format').value = preview.commander.looksLikeCommander ? 'commander' : 'standard';
  const commander = isCommander();
  $('bracket-field').hidden = !commander;
  if (!picksTouched) picks = [preview.commander.ids[0] ?? '', preview.commander.ids[1] ?? ''];
  // A pick that is no longer in the deck is dropped; a Commander deck always has a commander (the likeliest card when none is picked).
  if (!ordered.some((line) => line.card.i === picks[0])) picks[0] = ordered[0]?.card.i ?? '';
  if (!ordered.some((line) => line.card.i === picks[1]) || picks[1] === picks[0]) picks[1] = '';
  $('commander-note').textContent = commander ? (CERTAINTY_NOTES[preview.commander.certainty] ?? '') : '';
}

// ---- autosave: the deck saves itself after every change ----
// currentId is the saved deck this one is (null for a new deck, which is added the first time it is saved, under a name no other deck has). suppressAutosave is on while a saved deck or the sample is being
// opened, so opening a deck never writes it back with a guess.
let currentId = null;
let suppressAutosave = false;
function setSaveState(message, isError = false) {
  $('save-state').textContent = message;
  $('save-state').classList.toggle('error', isError);
}
function autosave() {
  if (!preview || !index || suppressAutosave) return;
  const ids = commanderIds();
  const typed = $('deck-name').value.trim();
  const known = library.decks.find((entry) => entry.id === currentId);
  // A blank name is not saved: an existing deck keeps its name, and a new one is named after its commander.
  const name = typed || known?.deck.name || (preview.lines.find((line) => line.card && ids.includes(line.card.i))?.name ?? 'New deck');
  const built = buildSavedDeck(preview, { name, text, commanderIds: ids, allowMissing: true });
  if (!built.ok) { setSaveState(`Not saved: ${built.error}`, true); return; }
  // Brackets are a Commander idea. A number the player picked is saved as chosen; with Auto the guess is saved, marked as a guess, so it can be guessed again.
  const chosen = isCommander() && $('deck-bracket').value ? Number($('deck-bracket').value) : null;
  const bracket = chosen ?? (isCommander() ? bracketGuessNow : null);
  const options = { format: $('deck-format').value, bracket, bracketGuess: chosen === null && bracket !== null };
  let result;
  if (known) {
    result = replaceDeck(library, known.id, built.deck, options);
  } else {
    const unique = uniqueName(library, built.deck.name);
    result = addDeck(library, { ...built.deck, name: unique }, options);
  }
  if (!result.ok) { setSaveState(`Not saved: ${result.error}`, true); return; }
  if (!commit(result.library, '')) { setSaveState('Not saved: your browser would not keep it.', true); return; }
  currentId = result.id;
  const savedName = result.library.decks.find((entry) => entry.id === result.id).deck.name;
  if ($('deck-name').value !== savedName) $('deck-name').value = savedName;
  setSaveState('Saved');
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
  onLibraryChange(library);
  return true;
}

// One saved deck as a card of CSS: the art of its commander's printing (two commanders split it diagonally, the first on the upper left) over a tint of its colors, with the deck's name, its commanders, its
// colors as the mana symbols, its bracket (and "guess" when it was guessed) and its size. The tint shows until the art has loaded, and stays if it cannot be loaded. The whole card is a button that opens the deck;
// the rest (Play solo, Delete) is in the menu at its corner. The colors come from the card list, so they appear as soon as it has loaded.
function deckCard(entry) {
  const { deck } = entry;
  const face = deckFace(entry, cardsByName);
  const faceElement = make('button', 'deck-face');
  faceElement.type = 'button';
  faceElement.dataset.action = 'load';
  faceElement.setAttribute('aria-label', `Open: ${deck.name}`);
  faceElement.dataset.colors = face.colors;
  const half = (className, colors, picture) => {
    const element = make('span', `face-half ${className}`);
    element.style.setProperty('--tint', tintGradient(colors));
    const url = picture ? imageUrl(picture, 'art_crop') : null;
    if (url) {
      const art = new Image();
      art.alt = '';
      art.loading = 'lazy';
      art.decoding = 'async';
      art.draggable = false;
      art.addEventListener('load', () => faceElement.classList.add('has-art')); // light text on the art
      art.addEventListener('error', () => art.remove()); // the tint stays
      art.src = url;
      element.append(art);
    }
    return element;
  };
  if (face.split) {
    faceElement.dataset.split = '1';
    faceElement.append(half('face-a', face.commanders[0].colors, face.commanders[0].picture), half('face-b', face.commanders[1].colors, face.commanders[1].picture));
  } else {
    faceElement.append(half('face-whole', face.colors, face.commanders[0]?.picture ?? null));
  }
  const text = make('span', 'saved-text');
  const top = make('span', 'face-top');
  top.append(make('strong', 'saved-name', deck.name));
  text.append(top);
  const commanders = face.commanders.map((commander) => commander.name);
  if (commanders.length) {
    const line = make('span', 'face-commanders');
    commanders.forEach((commander, index) => line.append(make('span', 'face-commander', commander), ...(index < commanders.length - 1 ? [make('span', 'face-and', ' & ')] : [])));
    text.append(line);
  }
  const bottom = make('span', 'face-bottom');
  const pips = face.colors ? manaNode(colorsAsCost(face.colors)) : make('span', 'cost');
  pips.classList.add('face-colors');
  if (!face.colors) pips.textContent = cardsByName ? 'Colorless' : '';
  bottom.append(pips);
  if (entry.bracket) {
    const bracket = make('span', 'face-bracket', `Bracket ${entry.bracket}`);
    if (entry.bracketGuess === true) { bracket.classList.add('guessed'); bracket.title = 'Guessed from the Game Changers in the deck. Open the deck to choose one.'; }
    bottom.append(bracket);
  }
  const facts = [FORMAT_TITLES[entry.format], plural(totalCards(deck), 'card', 'cards')];
  if (deck.skipped) facts.push(`${plural(deck.skipped, 'line', 'lines')} left out (not matched)`);
  bottom.append(make('span', 'face-facts', facts.join(' \u00b7 ')));
  text.append(bottom);
  faceElement.append(text);
  if (face.colors) faceElement.title = `Colors: ${face.colors.split('').map((color) => COLOR_NAMES[color]).join(', ')}`;
  return faceElement;
}

// A small round button with a drawn icon (a path in a 16 by 16 box), for a saved deck's card: Play solo and Delete. Width, height and fill are set on the element.
function iconButton(action, label, title, path) {
  const element = button('', '', 'deck-action', { 'aria-label': label, title });
  element.dataset.action = action;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [name, value] of [['viewBox', '0 0 16 16'], ['width', '16'], ['height', '16'], ['fill', 'currentColor'], ['aria-hidden', 'true'], ['focusable', 'false']]) svg.setAttribute(name, value);
  const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  shape.setAttribute('d', path);
  shape.setAttribute('fill', 'currentColor');
  svg.append(shape);
  element.append(svg);
  return element;
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
    const actions = make('span', 'deck-actions');
    if (solo) actions.append(iconButton('play', `Play solo: ${entry.deck.name}`, 'Play solo', 'M5 3.5v9l7.5-4.5z'));
    actions.append(iconButton('delete', `Delete: ${entry.deck.name}`, 'Delete', 'M5.5 2h5l.5 1.5H14V5H2V3.5h3zM3.5 6h9l-.7 8H4.2z'));
    item.append(deckCard(entry), actions);
    return item;
  }));
}

async function loadSaved(id) {
  const entry = library.decks.find((candidate) => candidate.id === id);
  if (!entry || !index) return;
  const { deck } = entry;
  $('deck-text').value = deck.text;
  currentId = id;
  suppressAutosave = true; // opening a deck must not write it back before its commander, bracket and format are put back
  try {
    await runCheck();
    if (!preview || $('deck-text').value !== deck.text) return; // another check came in while the printings loaded
    picks = [deck.commander[0] ?? '', deck.commander[1] ?? ''];
    picksTouched = true;
    $('deck-name').value = deck.name;
    $('deck-bracket').value = entry.bracket && entry.bracketGuess !== true ? String(entry.bracket) : ''; // a guessed bracket comes back as Auto, guessed again from today's list
    setFormat(entry.format);
    setSaveState('Saved');
  } finally { suppressAutosave = false; }
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
// the saved decks change, so a page that lists them can look again), play (the saved decks get a "Play solo" button; not inside the lobby). Call it once; a second call does nothing.
export function mountDeckImporter({ root: container, sampleId, onLibraryChange: onChange = () => {}, play = true } = {}) {
  if (mounted || !container) return;
  mounted = true;
  root = container;
  solo = play;
  pendingSample = sampleId;
  onLibraryChange = onChange;
  build();
  const savedView = store.get(VIEW_KEY);
  view = VIEWS.includes(savedView) ? savedView : 'text';
  viewToggle = mountViewToggle($('view-toggle'), { view, onChange: setView });
  const savedSort = store.get(SORT_KEY);
  sort = SORTS.includes(savedSort) ? savedSort : 'name';
  $('deck-sort').value = sort;
  const savedDirection = store.get(SORT_DIRECTION_KEY);
  direction = DIRECTIONS.includes(savedDirection) ? savedDirection : 'asc';
  // The button is an arrow: up for the usual way (A to Z, low to high, W to G), down for the other way round. Its words (for the tooltip and a screen reader) say which.
  const showDirection = () => {
    const words = directionWords(sort, direction);
    const arrow = String.fromCharCode(direction === 'desc' ? 0x2193 : 0x2191);
    const now = direction === 'desc' ? 'Descending' : 'Ascending';
    const other = direction === 'desc' ? 'ascending' : 'descending';
    $('deck-sort-direction').textContent = `${arrow} ${now}`;
    $('deck-sort-direction').title = `${now} ${arrow} (${words}). Press for ${other}.`;
    $('deck-sort-direction').setAttribute('aria-label', `Sort order: ${now.toLowerCase()}, ${words}. Press for ${other}.`);
  };
  const savedGrouping = store.get(GROUPING_KEY);
  grouping = GROUPINGS.includes(savedGrouping) ? savedGrouping : 'type';
  $('deck-grouping').value = grouping;
  $('deck-grouping').addEventListener('change', () => { grouping = GROUPINGS.includes($('deck-grouping').value) ? $('deck-grouping').value : 'type'; store.set(GROUPING_KEY, grouping); if (preview) renderSections(); });
  showDirection();
  $('deck-sort').addEventListener('change', () => { sort = SORTS.includes($('deck-sort').value) ? $('deck-sort').value : 'name'; store.set(SORT_KEY, sort); showDirection(); if (preview) renderSections(); });
  $('deck-sort-direction').addEventListener('click', () => { direction = direction === 'asc' ? 'desc' : 'asc'; store.set(SORT_DIRECTION_KEY, direction); showDirection(); if (preview) renderSections(); });

  $('check').addEventListener('click', runCheck);
  $('retry').addEventListener('click', loadCards);
  $('sample').addEventListener('click', () => useSample());
  $('new-deck').addEventListener('click', () => { currentId = null; setSaveState(''); $('deck-text').value = ''; text = ''; preview = null; choices = {}; picksTouched = false; formatTouched = false; $('deck-bracket').value = ''; $('deck-name').value = ''; checkRun++; say(''); showScreen('paste'); });
  $('cancel-paste').addEventListener('click', () => { say(''); showScreen(preview ? 'deck' : 'list'); });
  $('back-to-decks')?.addEventListener('click', () => { say(''); showScreen('list'); });
  // The header's Decks link, on the deck page: from a deck or the box to paste into it shows the list at once, without loading the page again.
  if (solo) {
    document.querySelector('header.site-header .site-nav a[href="/deck"]')?.addEventListener('click', (event) => {
      event.preventDefault();
      if (root.dataset.screen !== 'list') { say(''); showScreen('list'); }
    });
  }
  $('edit-list').addEventListener('click', () => { say(''); showScreen('paste'); });
  $('deck-play-solo')?.addEventListener('click', () => {
    const entry = library.decks.find((candidate) => candidate.id === currentId);
    if (!entry) { say('This deck is not saved yet: fix what needs attention in the list first.', true); return; }
    if (commit(selectDeck(library, entry.id), `"${entry.deck.name}" is now the deck for the solo table.`)) location.assign('/solo');
  });
  $('deck-text').addEventListener('keydown', (event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) runCheck(); });
  $('deck-bracket').addEventListener('change', autosave);
  $('bracket-info').addEventListener('click', () => {
    const open = $('bracket-pop').hidden;
    $('bracket-pop').hidden = !open;
    $('bracket-info').setAttribute('aria-expanded', String(open));
  });
  $('bracket-pop').addEventListener('keydown', (event) => { if (event.key === 'Escape') closeBracketPanel(true); });
  $('bracket-info').addEventListener('keydown', (event) => { if (event.key === 'Escape') closeBracketPanel(true); });
  document.addEventListener('click', (event) => { if (event.target instanceof Element && !event.target.closest('#bracket-field')) closeBracketPanel(); });
  $('deck-name').addEventListener('change', () => { if (!$('deck-name').value.trim()) { $('deck-name').value = library.decks.find((entry) => entry.id === currentId)?.deck.name ?? ''; } autosave(); });
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
  $('deck-format').addEventListener('change', () => { formatTouched = true; renderCommander(); renderBracket(); renderSections(); autosave(); });
  // The card of each saved deck opens it; the two buttons on it play it at the solo table or delete it. Found by delegation so the list can be drawn again without wiring anything.
  $('saved-list').addEventListener('click', (event) => {
    const clicked = event.target instanceof Element ? event.target.closest('button[data-action]') : null;
    const item = clicked?.closest('[data-deck-id]');
    const entry = item ? library.decks.find((candidate) => candidate.id === item.dataset.deckId) : null;
    if (!clicked || !entry) return;
    if (clicked.dataset.action === 'load') loadSaved(entry.id);
    else if (clicked.dataset.action === 'play') { if (commit(selectDeck(library, entry.id), `"${entry.deck.name}" is now the deck for the solo table.`)) location.assign('/solo'); }
    else if (clicked.dataset.action === 'delete') commit(removeDeck(library, entry.id), `Deleted "${entry.deck.name}".`);
  });

  // Can this browser keep anything? If not, the page still works; it just cannot remember a deck.
  const canStore = store.set(PROBE_KEY, '1');
  store.remove(PROBE_KEY);
  $('storage-hint').hidden = canStore;
  readSavedLibrary();
  renderSaved();
  stackPreview = mountStackPreview({ aside: $('stack-preview'), sections: $('sections') });
  setupCardPeek({ root, peek: document.getElementById('card-peek'), image: document.getElementById('card-peek-image'), note: document.getElementById('card-peek-note') });
  // With saved decks (or a message about decks that could not be read) the page starts at the list; with none it starts at the box to paste into.
  const somethingToShow = library.decks.length > 0 || libraryRead.source === 'damaged' || libraryRead.skipped > 0;
  showScreen(somethingToShow && pendingSample === undefined ? 'list' : 'paste');
  loadCards();
}
