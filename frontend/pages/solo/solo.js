// The solo table: your saved deck, dealt to a table you play alone (goldfishing). The thinking is in shared/zones.mjs (zones
// and moves, tested in Node); this file reads the buttons and draws the result. Pictures come from Scryfall's picture server
// (shared/card-image.mjs) and are only requested when a card is on the page. Card names go into the page as text, never as
// markup. Nothing here is saved: a refresh deals a new game.
import { makeSafeStore } from '../../src/safe-store.js';
import { loadCardList } from '../../src/card-list.js';
import { readSavedDeck } from '../../../shared/deck-preview.mjs';
import { makeLookup } from '../../../shared/card-lookup.mjs';
import { imageUrl } from '../../../shared/card-image.mjs';
import { makeGame, draw, moveCard, shuffleLibrary, mulligan, setTapped, untapAll, adjustLife, nextTurn, battlefieldRows, zoneCounts } from '../../../shared/zones.mjs';

const $ = (id) => document.getElementById(id);
const store = makeSafeStore();
const DECK_KEY = 'overloaded.deck';

let deck = null;
let lookup = null;
let game = null;
let selected = null; // the uid of the selected card
let viewing = null; // the pile being looked at: 'library', 'graveyard', 'exile' or 'sideboard'
const nodes = new Map(); // uid -> its button, kept so a card that moves does not have to load its picture again

const ZONE_WORDS = { library: 'your library', hand: 'your hand', battlefield: 'the battlefield', graveyard: 'your graveyard', exile: 'exile', command: 'the command zone', sideboard: 'your sideboard' };
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

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

// ---- cards on the page ----
function nodeFor(card) {
  let button = nodes.get(card.uid);
  if (!button) {
    button = make('button', 'card');
    button.type = 'button';
    button.dataset.uid = card.uid;
    const face = make('span', 'face');
    const url = imageUrl(card.i);
    if (url) {
      const picture = document.createElement('img');
      picture.alt = '';
      picture.width = 146;
      picture.height = 204;
      picture.loading = 'lazy';
      picture.decoding = 'async';
      picture.referrerPolicy = 'no-referrer';
      picture.addEventListener('error', () => button.classList.add('noimage')); // a picture that will not load: show the name
      picture.src = url;
      face.append(picture);
    } else {
      button.classList.add('noimage');
    }
    face.append(make('span', 'fallback', card.n));
    button.append(face);
    button.addEventListener('click', () => select(card.uid));
    nodes.set(card.uid, button);
  }
  button.classList.toggle('tapped', card.tapped);
  button.classList.toggle('selected', card.uid === selected);
  button.setAttribute('aria-pressed', String(card.uid === selected));
  button.setAttribute('aria-label', `${card.n}${card.tapped ? ', tapped' : ''}`);
  return button;
}

function place(container, cards) {
  container.replaceChildren(...cards.map(nodeFor));
}

function findCard(uid) {
  for (const zone of Object.keys(game.zones)) {
    const card = game.zones[zone].find((c) => c.uid === uid);
    if (card) return { card, zone };
  }
  return null;
}

// ---- drawing the whole table ----
function render() {
  $('turn').textContent = String(game.turn);
  $('life').textContent = String(game.life);
  const rows = battlefieldRows(game);
  place($('row-lands'), rows.lands);
  place($('row-other'), rows.other);
  place($('hand'), game.zones.hand);
  place($('command'), game.zones.command);
  $('hand-count').textContent = String(game.zones.hand.length);
  const counts = zoneCounts(game);
  for (const zone of ['library', 'graveyard', 'exile', 'sideboard']) {
    const button = $(`pile-${zone}`);
    button.textContent = `${zone[0].toUpperCase()}${zone.slice(1)}: ${counts[zone]}`;
    button.setAttribute('aria-pressed', String(viewing === zone));
  }
  $('mulligan').textContent = game.mulligans ? `Mulligan (${game.mulligans} so far)` : 'Mulligan';
  renderViewer();
  renderSelected();
}

function renderViewer() {
  $('viewer').hidden = viewing === null;
  if (!viewing) return;
  const cards = game.zones[viewing];
  $('viewer-title').textContent = `${ZONE_WORDS[viewing][0].toUpperCase()}${ZONE_WORDS[viewing].slice(1)}: ${plural(cards.length, 'card', 'cards')}`;
  $('viewer-note').textContent = viewing === 'library' ? 'The top card is first. Looking at your library is allowed here; it is your table.' : viewing === 'graveyard' ? 'The newest card is first.' : '';
  const list = $('viewer-list');
  list.replaceChildren(...cards.map((card, index) => {
    const item = make('li');
    const button = make('button', card.uid === selected ? 'pile-card selected' : 'pile-card');
    button.type = 'button';
    button.append(make('span', 'pos', String(index + 1)), make('span', 'name', card.n), make('span', 'type', card.t));
    button.addEventListener('click', () => select(card.uid));
    item.append(button);
    return item;
  }));
}

function renderSelected() {
  const found = selected ? findCard(selected) : null;
  if (!found) {
    selected = null;
    $('selected-line').textContent = 'Click a card to move it, tap it or look at it.';
    $('selected-actions').replaceChildren();
    return;
  }
  const { card, zone } = found;
  $('selected-line').textContent = `${card.n}${card.t ? `: ${card.t}` : ''}, in ${ZONE_WORDS[zone]}${card.tapped ? ' (tapped)' : ''}.`;
  const actions = [];
  const act = (label, run, message, secondary = true) => actions.push({ label, run, message, secondary, deselect: false });
  if (zone === 'battlefield') act(card.tapped ? 'Untap' : 'Tap', () => setTapped(game, card.uid, !card.tapped), `${card.tapped ? 'Untapped' : 'Tapped'} ${card.n}.`, false);
  for (const [to, label] of [['hand', 'To hand'], ['battlefield', 'To battlefield'], ['graveyard', 'To graveyard'], ['exile', 'To exile'], ['command', 'To command zone']]) {
    if (to !== zone) act(label, () => moveCard(game, card.uid, to), `Moved ${card.n} to ${ZONE_WORDS[to]}.`);
  }
  act('Top of library', () => moveCard(game, card.uid, 'library', { position: 'top' }), `Put ${card.n} on top of your library.`);
  act('Bottom of library', () => moveCard(game, card.uid, 'library', { position: 'bottom' }), `Put ${card.n} on the bottom of your library.`);
  actions.push({ label: 'Deselect', secondary: true, deselect: true });
  $('selected-actions').replaceChildren(...actions.map((action) => {
    const button = make('button', action.secondary ? 'secondary' : '', action.label);
    button.type = 'button';
    button.addEventListener('click', () => {
      if (action.deselect) { selected = null; render(); return; }
      apply(action.run, action.message);
    });
    return button;
  }));
}

// ---- doing things ----
// Runs a move on the game; the old game is never changed, so a refused move leaves everything as it was.
function apply(run, message = '') {
  try {
    game = run();
    if (message) say(message);
  } catch (error) {
    say(error.message, true);
  }
  render();
}

function select(uid) {
  selected = uid;
  render();
}

function deal() {
  game = makeGame(deck, lookup);
  selected = null;
  viewing = null;
  nodes.clear();
  $('game').hidden = false;
  $('blocked').hidden = true;
  render();
  say(`Dealt ${plural(game.zones.hand.length, 'card', 'cards')}. ${game.zones.command.length ? `Your commander is in the command zone. Life is ${game.life}.` : `Life is ${game.life}.`}`);
}

function drawOne() {
  const result = draw(game, 1);
  game = result.game;
  say(result.short ? 'Your library is empty.' : `Drew ${game.zones.hand.find((c) => c.uid === result.drawn[0]).n}.`, result.short);
  render();
}

function goNextTurn() {
  const result = nextTurn(game);
  game = result.game;
  const drewName = result.short ? null : game.zones.hand.find((c) => c.uid === result.drawn[0]).n;
  say(`Turn ${game.turn}: everything untapped${drewName ? ` and you drew ${drewName}` : '. Your library is empty, so nothing was drawn'}.`, result.short);
  render();
}

function doMulligan() {
  apply(() => mulligan(game), '');
  say(`Mulligan ${game.mulligans}: a new hand of ${plural(game.zones.hand.length, 'card', 'cards')}. Put ${plural(game.mulligans, 'card', 'cards')} on the bottom of your library with the card buttons.`);
}

function togglePile(zone) {
  viewing = viewing === zone ? null : zone;
  render();
}

// ---- starting ----
function showBlocked(message, { link = true, retry = false } = {}) {
  $('game').hidden = true;
  $('blocked').hidden = false;
  $('blocked-message').textContent = message;
  $('blocked-link').hidden = !link;
  $('retry').hidden = !retry;
}

async function start() {
  const raw = store.get(DECK_KEY);
  deck = readSavedDeck(raw);
  if (!deck) {
    $('deck-line').textContent = 'No deck.';
    showBlocked(raw === null ? 'You have no saved deck yet. Import one first, then come back to play it.' : 'Your saved deck could not be read, so it was ignored. Import it again.');
    return;
  }
  const total = deck.cards.reduce((sum, card) => sum + card.qty, 0);
  $('deck-line').textContent = `${deck.name}: ${plural(total, 'card', 'cards')}. Your hand is dealt, and a refresh deals a new game.`;
  try {
    lookup = makeLookup(await loadCardList());
  } catch {
    showBlocked('The card list could not be loaded, so the table cannot tell lands from other cards. Check your connection and try again.', { link: false, retry: true });
    return;
  }
  deal();
}

// ---- wiring ----
$('draw').addEventListener('click', drawOne);
$('next-turn').addEventListener('click', goNextTurn);
$('untap-all').addEventListener('click', () => apply(() => untapAll(game), 'Untapped everything.'));
$('shuffle').addEventListener('click', () => apply(() => shuffleLibrary(game), 'Shuffled your library.'));
$('mulligan').addEventListener('click', doMulligan);
$('new-game').addEventListener('click', () => { if (confirm('Start a new game? This one will be lost.')) deal(); });
for (const [id, delta] of [['life-minus5', -5], ['life-minus1', -1], ['life-plus1', 1], ['life-plus5', 5]]) {
  $(id).addEventListener('click', () => apply(() => adjustLife(game, delta), ''));
}
for (const zone of ['library', 'graveyard', 'exile', 'sideboard']) $(`pile-${zone}`).addEventListener('click', () => togglePile(zone));
$('retry').addEventListener('click', start);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && selected) { selected = null; if (game) render(); } });

start();
