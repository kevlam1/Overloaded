// The solo table: your saved deck, dealt to a table you play alone (goldfishing). The thinking is in shared/zones.mjs (zones
// and moves, tested in Node); this file reads the buttons and draws the result. Pictures come from Scryfall's picture server
// (shared/card-image.mjs) and are only requested when a card is on the page. Card names go into the page as text, never as
// markup. Nothing here is saved: a refresh deals a new game.
import { makeSafeStore } from '../../src/safe-store.js';
import { loadCardList } from '../../src/card-list.js';
import { LIBRARY_KEY, LEGACY_KEY, readLibrary, selectedEntry } from '../../../shared/deck-library.mjs';
import { makeLookup } from '../../../shared/card-lookup.mjs';
import { makeCardNodes } from '../../src/card-nodes.js';
import { mountMarksPanel } from '../../src/marks-panel.js';
import { openCardMenu } from '../../src/card-menu.js';
import { menuItems, menuAction, turnLabel, turnMessage, playBackLabel, PLAY_BACK_ZONES } from '../../../shared/card-menu.mjs';
import { marksSentence, markClick, printedOf } from '../../../shared/marks.mjs';
import { makeGame, draw, moveCard, shuffleLibrary, mulligan, setTapped, turnOver, untapAll, adjustLife, nextTurn, battlefieldRows, zoneCounts } from '../../../shared/zones.mjs';

const $ = (id) => document.getElementById(id);
const store = makeSafeStore();

let deck = null;
let lookup = null;
let game = null;
let selected = null; // the uid of the selected card
let modifyOpen = false; // the counters and power/toughness panel is shown (from Modify, in the card menu or the selected-card buttons)
let viewing = null; // the pile being looked at: 'library', 'graveyard', 'exile' or 'sideboard'

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
// The buttons and pictures are in src/card-nodes.js (the live table draws cards the same way).
const cardNodes = makeCardNodes({ onSelect: (uid) => select(uid), isSelected: (uid) => uid === selected, onMark: (uid, hit) => markOnCard(uid, hit), onMenu: (uid, where) => openMenuFor(uid, where), printedStats: (card) => printedOf(card, lookup) });
const place = cardNodes.place;

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
  place($('row-lands'), rows.lands, { battlefield: true });
  place($('row-other'), rows.other, { battlefield: true });
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
    $('marks').hidden = true;
    modifyOpen = false;
    return;
  }
  const { card, zone } = found;
  const marks = marksSentence(card, printedOf(card, lookup));
  $('selected-line').textContent = `${card.n}${card.t ? `: ${card.t}` : ''}, in ${ZONE_WORDS[zone]}${card.turned && !card.tok ? ' (turned over)' : ''}${card.tapped ? ' (tapped)' : ''}.${marks ? ` ${marks}` : ''}`;
  $('marks').hidden = zone !== 'battlefield' || !modifyOpen; // counters and the power/toughness change belong to a card on the battlefield, and show after Modify
  const actions = [];
  const act = (label, run, message, secondary = true) => actions.push({ label, run, message, secondary, deselect: false });
  if (zone === 'battlefield') act(card.tapped ? 'Untap' : 'Tap', () => setTapped(game, card.uid, !card.tapped), `${card.tapped ? 'Untapped' : 'Tapped'} ${card.n}.`, false);
  if (zone === 'battlefield' && card.b === 1) act(turnLabel(card), () => turnOver(game, card.uid), turnMessage(card));
  if (zone === 'battlefield') actions.push({ label: 'Modify', secondary: true, modify: true });
  if (zone === 'battlefield') { const copy = menuAction('copy', card, 1, { printed: printedOf(card, lookup) }); act('Create copy', () => copy.run(game), copy.message); }
  if (card.md === 1 && card.b === 1 && PLAY_BACK_ZONES.includes(zone)) { const play = menuAction('playback', card); act(playBackLabel(card), () => play.run(game), play.message); }
  for (const [to, label] of [['hand', 'To hand'], ['battlefield', 'To battlefield'], ['graveyard', 'To graveyard'], ['exile', 'To exile'], ['command', 'To command zone'], ['sideboard', 'To sideboard']]) {
    if (to !== zone) act(label, () => moveCard(game, card.uid, to), `Moved ${card.n} to ${ZONE_WORDS[to]}.`);
  }
  act('Top of library', () => moveCard(game, card.uid, 'library', { position: 'top' }), `Put ${card.n} on top of your library.`);
  act('Bottom of library', () => moveCard(game, card.uid, 'library', { position: 'bottom' }), `Put ${card.n} on the bottom of your library.`);
  actions.push({ label: 'Deselect', secondary: true, deselect: true });
  $('selected-actions').replaceChildren(...actions.map((action) => {
    const button = make('button', action.secondary ? 'secondary' : '', action.label);
    button.type = 'button';
    if (action.modify) button.setAttribute('aria-expanded', String(modifyOpen));
    button.addEventListener('click', () => {
      if (action.modify) {
        modifyOpen = !modifyOpen;
        render();
        if (modifyOpen) $('marks-amount').focus();
        else [...$('selected-actions').querySelectorAll('button')].find((b) => b.textContent === 'Modify')?.focus();
        return;
      }
      if (action.deselect) { selected = null; render(); return; }
      apply(action.run, action.message);
    });
    return button;
  }));
}

// ---- doing things ----
// Runs a move on the game; the old game is never changed, so a refused move leaves everything as it was.
// Returns whether the move was made (a refused move leaves the game as it was).
function apply(run, message = '') {
  let made = true;
  try {
    game = run();
    if (message) say(message);
  } catch (error) {
    made = false;
    say(error.message, true);
  }
  render();
  return made;
}

function select(uid) {
  selected = uid;
  render();
}

// The right-click menu of one of your cards (src/card-menu.js, shared/card-menu.mjs). It selects the card too, so the buttons above show it.
function openMenuFor(uid, where) {
  const found = findCard(uid);
  if (!found) return;
  select(uid);
  openCardMenu({ title: found.card.n, items: menuItems(found.card, found.zone), x: where.x, y: where.y, returnFocus: where.element, onPick: (id, amount) => pickFromMenu(uid, id, amount) });
}

function pickFromMenu(uid, id, amount) {
  const found = findCard(uid);
  if (!found) return;
  if (id === 'modify') { modifyOpen = true; render(); $('marks-amount').focus(); return; }
  try {
    const action = menuAction(id, found.card, amount, { printed: printedOf(found.card, lookup) });
    if (!action) return;
    const made = apply(() => action.run(game), action.message);
    if (made && action.toast) cardNodes.flash(uid, action.toast);
  } catch (error) {
    say(error.message, true);
  }
}

// A click on a chip or on the change label of one of your cards on the battlefield (see src/card-nodes.js and shared/marks.mjs).
// Returns false when nothing changed (the card or the click was refused), so the card shows its floating text only for real changes.
function markOnCard(uid, hit) {
  const found = findCard(uid);
  if (!found || found.zone !== 'battlefield') return false;
  try {
    const click = markClick(hit);
    return apply(() => click.run(game, uid), click.message(found.card.n));
  } catch (error) {
    say(error.message, true);
    return false;
  }
}

function deal() {
  game = makeGame(deck, lookup);
  selected = null;
  viewing = null;
  cardNodes.clear();
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
  $('blocked-sample').hidden = !link; // the sample deck is another way to get a deck, so it shows with the import link
  $('retry').hidden = !retry;
}

async function start() {
  // The deck that is selected on the deck page (an older single saved deck counts as the first deck, see shared/deck-library.mjs).
  const saved = readLibrary(store.get(LIBRARY_KEY), store.get(LEGACY_KEY));
  deck = selectedEntry(saved.library)?.deck ?? null;
  if (!deck) {
    $('deck-line').textContent = 'No deck.';
    showBlocked(saved.source === 'damaged' || saved.skipped > 0 ? 'Your saved deck could not be read, so it was ignored. Import it again.' : 'You have no saved deck yet. Import one first, then come back to play it.');
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
mountMarksPanel($('marks'), {
  target: () => { const found = selected ? findCard(selected) : null; return found && found.zone === 'battlefield' ? { uid: found.card.uid, name: found.card.n } : null; },
  onChange: (change, message) => apply(() => change(game), message),
  say,
});
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
