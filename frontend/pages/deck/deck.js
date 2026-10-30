// The deck import page: paste a decklist, see it matched against our card list, confirm the commander, and save it in this
// browser. The thinking is in shared/ (the parser, the matcher and shared/deck-preview.mjs, all tested in Node); this file
// only reads the form and draws the result. Everything typed or pasted is put into the page as text, never as markup.
import { buildCardIndex, matchDeck } from '../../../shared/card-match.mjs';
import { parseDeckText } from '../../../shared/deck-text.mjs';
import { makePreview, buildSavedDeck, serializeDeck, readSavedDeck } from '../../../shared/deck-preview.mjs';
import { makeSafeStore } from '../../src/safe-store.js';
import { loadCardList } from '../../src/card-list.js';
import { setupCardPeek } from '../../src/card-peek.js';

const $ = (id) => document.getElementById(id);
const store = makeSafeStore();
const DECK_KEY = 'overloaded.deck'; // one saved deck for now, in this browser only
const PROBE_KEY = 'overloaded.storage-probe';

let index = null; // the card list, ready to match against
let text = ''; // the text the preview on screen is for
let choices = {}; // names the player settled (an ambiguous name, a "did you mean")
let preview = null;
let mode = 'none'; // 'commander' or 'none'
let modeTouched = false;
let picks = ['', '']; // the chosen commander and partner (card ids)
let picksTouched = false;

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
function runCheck() {
  if (!index) return;
  const pasted = $('deck-text').value;
  if (pasted !== text) { choices = {}; modeTouched = false; picksTouched = false; }
  text = pasted;
  if (!text.trim()) { say('Paste a decklist first.', true); $('preview').hidden = true; preview = null; return; }
  refresh();
  const { counts } = preview;
  say(counts.problem === 0 ? `Checked: ${plural(counts.cards, 'card', 'cards')}, all matched.` : `Checked: ${plural(counts.cards, 'card', 'cards')}, ${counts.problem} need attention.`);
  $('preview-heading').focus();
}

// Works the preview out again from the text it is for (so choosing a card does not depend on what is now in the box).
function refresh() {
  const parsed = parseDeckText(text);
  preview = makePreview(parsed, matchDeck(index, parsed.entries), choices);
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
        // Hovering the row (or focusing the name with the keyboard) shows the card's picture; see src/card-peek.js.
        item.dataset.cardId = line.card.i;
        item.dataset.cardName = line.name;
        name.tabIndex = 0;
      }
      item.append(make('span', 'qty', String(line.qty)), name);
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
  $('save-note').hidden = store.get(DECK_KEY) === null;
}

// ---- the saved deck ----
function renderSaved() {
  const raw = store.get(DECK_KEY);
  $('saved').hidden = raw === null;
  if (raw === null) return;
  const deck = readSavedDeck(raw);
  $('saved-load').hidden = deck === null;
  if (!deck) { $('saved-summary').textContent = 'A saved deck was found but it could not be read, so it was ignored. You can delete it.'; return; }
  const commanders = deck.cards.filter((card) => card.section === 'commander').map((card) => card.n);
  $('saved-summary').textContent = `${deck.name}: ${plural(totalCards(deck), 'card', 'cards')}${commanders.length ? `, commander ${commanders.join(' and ')}` : ''}. Saved ${new Date(deck.savedAt).toLocaleDateString()}.${deck.skipped ? ` ${plural(deck.skipped, 'line was', 'lines were')} left out because they were not matched.` : ''}`;
}

function loadSaved() {
  const deck = readSavedDeck(store.get(DECK_KEY));
  if (!deck || !index) return;
  $('deck-text').value = deck.text;
  runCheck();
  mode = deck.commander.length ? 'commander' : 'none';
  modeTouched = true;
  picks = [deck.commander[0] ?? '', deck.commander[1] ?? ''];
  picksTouched = true;
  renderCommander();
  $('deck-name').value = deck.name;
  say(`Loaded "${deck.name}".`);
}

function save() {
  if (!preview) return;
  const ids = mode === 'commander' ? [$('commander-1').value, $('commander-2').value].filter(Boolean) : [];
  const result = buildSavedDeck(preview, { name: $('deck-name').value, text, commanderIds: ids, allowMissing: $('allow-missing').checked });
  if (!result.ok) { say(result.error, true); return; }
  if (!store.set(DECK_KEY, serializeDeck(result.deck))) { say('Your browser would not save the deck. Its storage may be full or switched off.', true); return; }
  say(`Saved "${result.deck.name}": ${plural(totalCards(result.deck), 'card', 'cards')}.`);
  renderSaved();
  $('save-note').hidden = false;
}

// ---- wiring ----
$('check').addEventListener('click', runCheck);
$('retry').addEventListener('click', loadCards);
$('clear').addEventListener('click', () => {
  $('deck-text').value = '';
  text = ''; choices = {}; preview = null; modeTouched = false; picksTouched = false;
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
$('saved-load').addEventListener('click', loadSaved);
$('saved-delete').addEventListener('click', () => { store.remove(DECK_KEY); renderSaved(); say('Deleted your saved deck.'); });

// Can this browser keep anything? If not, the page still works; it just cannot remember a deck.
const canStore = store.set(PROBE_KEY, '1');
store.remove(PROBE_KEY);
$('storage-hint').hidden = canStore;
renderSaved();
setupCardPeek({ root: $('sections'), peek: $('card-peek'), image: $('card-peek-image'), note: $('card-peek-note') });
loadCards();
