// The deck importer: paste a decklist, see it matched against our card list, confirm the commander, and save it in this
// browser. It is a module that two pages use: the /deck page and the lobby's own screen (where a player can import or change a deck
// without leaving the table). Each page holds the importer's markup (the ids must match; scripts/test-importer-markup.mjs checks
// that) and calls mountDeckImporter once. The thinking is in shared/ (the parser, the matcher and shared/deck-preview.mjs, all tested in Node); this file
// only reads the form and draws the result. Everything typed or pasted is put into the page as text, never as markup.
import { buildCardIndex, matchDeck } from '../../shared/card-match.mjs';
import { parseDeckText } from '../../shared/deck-text.mjs';
import { makePreview, buildSavedDeck, printingSetsNeeded, isLegendaryCreature, PRINTING_PROBLEM_WORDS } from '../../shared/deck-preview.mjs';
import { LIBRARY_KEY, LEGACY_KEY, FORMAT_TITLES, emptyLibrary, readLibrary, serializeLibrary, addDeck, removeDeck, selectDeck } from '../../shared/deck-library.mjs';
import { makeSafeStore } from './safe-store.js';
import { loadCardList } from './card-list.js';
import { makePrintingLoader } from './printings.js';
import { sampleById } from '../../shared/sample-decks.mjs';
import { setupCardPeek } from './card-peek.js';
import { isValidCode } from '../../shared/table-code.mjs';

const $ = (id) => document.getElementById(id);
const store = makeSafeStore();
// The saved decks live in this browser only (shared/deck-library.mjs: up to 20, one of them selected).
const PROBE_KEY = 'overloaded.storage-probe';

let index = null; // the card list, ready to match against
let text = ''; // the text the preview on screen is for
let choices = {}; // names the player settled (an ambiguous name, a "did you mean")
let preview = null;
let picks = ['', '']; // the chosen commander and partner (card ids)
let picksTouched = false;
let library = emptyLibrary(); // the saved decks
let libraryRead = { source: 'empty', skipped: 0 }; // what reading them found (so the page can say if some could not be read)
let formatTouched = false; // the player chose the format, so it no longer follows the commander choice
const printingLoader = makePrintingLoader();
let printingFiles = new Map(); // the set files the pasted list names (see src/printings.js)
let checkRun = 0; // a newer check makes an older one that is still waiting for printing files stop

function say(message, isError = false) {
  $(statusId).textContent = message;
  $(statusId).classList.toggle('error', isError);
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
// Set by mountDeckImporter. pendingSample: undefined, or the id of a sample deck to put in the box once the card list has loaded
// ('' is the first one; a /deck?sample address asks for it). statusId: the element that shows messages. onLibraryChange: called
// after the saved decks change, so a page that lists them can look again.
let pendingSample;
let statusId = 'status';
let onLibraryChange = () => {};
let mounted = false;

async function loadCards() {
  $('check').disabled = true;
  $('sample').disabled = true;
  $('retry').hidden = true;
  $('list-state').textContent = 'Loading the card list...';
  try {
    const cards = await loadCardList();
    index = buildCardIndex(cards);
    $('list-state').textContent = `${cards.length.toLocaleString('en-US')} cards loaded. Cards newer than the list show as not found; the list is refreshed every week.`;
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

// Puts a sample deck (shared/sample-decks.mjs) in the paste box with its name, checks it like any pasted list, and offers its
// format. Nothing is saved: the player looks at it and saves it if they like.
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
// Only a list that names sets and numbers waits for anything: it fetches the printing files of those sets (our own static
// files, one per set, no request to Scryfall). A list without them is checked straight away, as before.
async function runCheck() {
  if (!index) return;
  const pasted = $('deck-text').value;
  if (pasted !== text) { choices = {}; picksTouched = false; formatTouched = false; $('deck-bracket').value = ''; }
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
  legendary: 'No commander is marked in your list, so we picked the first legendary creature. Change it if it is wrong.',
  first: 'No commander is marked in your list, so we picked the first card. Change it if it is wrong.',
};

// Commander or not is the format choice: Commander shows the commander pickers, Standard hides them and the deck has no commander.
const isCommander = () => $('deck-format').value === 'commander';

function setFormat(value) {
  $('deck-format').value = value;
  formatTouched = true; // the player (or a loaded deck) chose it, so it no longer follows the guess
  renderCommander();
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
  onLibraryChange(library);
  return true;
}

function deckSummary(entry) {
  const { deck } = entry;
  const commanders = deck.cards.filter((card) => card.section === 'commander').map((card) => card.n);
  return `${deck.name} (${FORMAT_TITLES[entry.format]}${entry.bracket ? `, bracket ${entry.bracket}` : ''}): ${plural(totalCards(deck), 'card', 'cards')}${commanders.length ? `, commander ${commanders.join(' and ')}` : ''}. Saved ${new Date(deck.savedAt).toLocaleDateString()}.${deck.skipped ? ` ${plural(deck.skipped, 'line was', 'lines were')} left out because they were not matched.` : ''}`;
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
  picks = [deck.commander[0] ?? '', deck.commander[1] ?? ''];
  picksTouched = true;
  $('deck-name').value = deck.name;
  setFormat(entry.format);
  $('deck-bracket').value = entry.bracket ? String(entry.bracket) : '';
  say(`Loaded "${deck.name}".`);
}

function save() {
  if (!preview) return;
  const ids = isCommander() ? [$('commander-1').value, $('commander-2').value].filter(Boolean) : [];
  const result = buildSavedDeck(preview, { name: $('deck-name').value, text, commanderIds: ids, allowMissing: $('allow-missing').checked });
  if (!result.ok) { say(result.error, true); return; }
  const bracket = isCommander() && $('deck-bracket').value ? Number($('deck-bracket').value) : null; // brackets are a Commander idea
  const added = addDeck(library, result.deck, { format: $('deck-format').value, bracket });
  if (!added.ok) { say(added.error, true); return; }
  commit(added.library, `${added.replaced ? 'Replaced' : 'Saved'} "${result.deck.name}": ${plural(totalCards(result.deck), 'card', 'cards')}.`);
}

// ---- starting ----
// Options: statusId (the element that shows messages, "status" on the deck page), sampleId (undefined, or the sample deck a
// /deck?sample address asks for: '' is the first), onLibraryChange (called after the saved decks change), backLink (point the
// page's #back link at the table this browser is at). Call it once; a second call does nothing.
export function mountDeckImporter({ statusId: messageId = 'status', sampleId, onLibraryChange: onChange = () => {}, backLink = true } = {}) {
  if (mounted) return;
  mounted = true;
  statusId = messageId;
  pendingSample = sampleId;
  onLibraryChange = onChange;
  // If you are at a table (the lobby remembers the last one in this browser), "Back to the lobby" goes to that table's address, not the start page.
  const lastTable = store.get('overloaded.lastTable');
  if (backLink && $('back') && typeof lastTable === 'string' && isValidCode(lastTable)) $('back').href = `/lobby/${lastTable}`;

  $('check').addEventListener('click', runCheck);
  $('retry').addEventListener('click', loadCards);
  $('sample').addEventListener('click', () => useSample());
  $('clear').addEventListener('click', () => {
    $('deck-text').value = '';
    text = ''; choices = {}; preview = null; picksTouched = false; formatTouched = false; $('deck-bracket').value = '';
    checkRun++; // a check still waiting for printing files must not bring the preview back
    $('preview').hidden = true;
    say('');
    $('deck-text').focus();
  });
  $('deck-text').addEventListener('keydown', (event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) runCheck(); });
  $('commander-1').addEventListener('change', () => { picks[0] = $('commander-1').value; picksTouched = true; });
  $('commander-2').addEventListener('change', () => { picks[1] = $('commander-2').value; picksTouched = true; });
  $('save').addEventListener('click', save);
  $('deck-format').addEventListener('change', () => { formatTouched = true; renderCommander(); });
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
}
