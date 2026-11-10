// The solo table: your saved deck, dealt to a table you play alone (goldfishing). The thinking is in shared/zones.mjs (zones
// and moves, tested in Node); this file reads the buttons and draws the result. Pictures come from Scryfall's picture server
// (shared/card-image.mjs) and are only requested when a card is on the page. Card names go into the page as text, never as
// markup. Nothing here is saved: a refresh deals a new game.
import { makeSafeStore } from '../../src/safe-store.js';
import { play, mountSoundSettings } from '../../src/sound.js';
import { mountPileStyle } from '../../src/pile-style.js';
import { mountCardHover } from '../../src/card-hover.js';
import { mountBoardDrag } from '../../src/board-drag.js';
import { stepFrom } from '../../../shared/board-grid.mjs';
import { createDealer, SHUFFLE_PAUSE_MS } from '../../../shared/deal-sequence.mjs';
import { loadCardList } from '../../src/card-list.js';
import { LIBRARY_KEY, LEGACY_KEY, readLibrary, selectedEntry } from '../../../shared/deck-library.mjs';
import { makeLookup } from '../../../shared/card-lookup.mjs';
import { makeCardNodes } from '../../src/card-nodes.js';
import { mountMarksPanel } from '../../src/marks-panel.js';
import { openCardMenu } from '../../src/card-menu.js';
import { mountPlayerCounters } from '../../src/player-counters.js';
import { menuItems, menuAction, turnLabel, turnMessage, playBackLabel, PLAY_BACK_ZONES, noUntapLabel, sickLabel, untapMessage } from '../../../shared/card-menu.mjs';
import { marksSentence, markClick, printedOf } from '../../../shared/marks.mjs';
import { playerCounterEntries, counterAction } from '../../../shared/player-counters.mjs';
import { makeGame, draw, moveCard, shuffleLibrary, mulligan, setTapped, turnOver, untapAll, heldTapped, adjustLife, nextTurn, boardCells, placeCard, placeStack, arrangeBoard, zoneCounts } from '../../../shared/zones.mjs';

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
// Poison, energy and experience (src/player-counters.js, shared/player-counters.mjs). Commander damage needs opponents, so it is on the live table only.
const playerCounters = mountPlayerCounters($('player-counters'), { onChange: (entry, step) => { const action = counterAction(game, entry.kind, step); apply(() => action.run(game), action.message); } });

const cardNodes = makeCardNodes({ onSelect: (uid) => select(uid), isSelected: (uid) => uid === selected, onMark: (uid, hit) => markOnCard(uid, hit), onMenu: (uid, where) => openMenuFor(uid, where), onBadge: (uid, kind) => clearBadge(uid, kind), printedStats: (card) => printedOf(card, lookup) });
const place = cardNodes.place;

// The hand is shown one card at a time with the draw sound for each (shared/deal-sequence.mjs). Only what is SHOWN is staged: the game was dealt all at once, so
// what is saved and what other players see never waits for the animation. A refresh in the middle just shows the whole hand.
const dealer = createDealer({
  onChange() {
    if (!game) return;
    render();
    const newest = dealer.dealt();
    const node = newest ? $('hand').children[newest - 1] : null;
    if (node) { node.classList.add('deal-in'); node.addEventListener('animationend', () => node.classList.remove('deal-in'), { once: true }); }
  },
  onCard: () => play('draw'),
  reducedMotion: () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
});

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
  playerCounters.update(playerCounterEntries(game.pc));
  place($('battlefield'), game.zones.battlefield, { battlefield: true, cells: boardCells(game) });
  place($('hand'), dealer.visible(game.zones.hand));
  place($('command'), game.zones.command);
  $('hand-count').textContent = String(dealer.visible(game.zones.hand).length);
  const counts = zoneCounts(game);
  for (const zone of ['library', 'graveyard', 'exile', 'sideboard']) {
    const button = $(`pile-${zone}`);
    button.textContent = `${zone[0].toUpperCase()}${zone.slice(1)}: ${counts[zone] + (zone === 'library' ? dealer.waiting(game.zones.hand) : 0)}`; // cards not yet dealt still count as library
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
  if (zone === 'battlefield') act(card.tapped ? 'Untap' : 'Tap', () => { const next = setTapped(game, card.uid, !card.tapped); play('tap'); return next; }, `${card.tapped ? 'Untapped' : 'Tapped'} ${card.n}.`, false);
  if (zone === 'battlefield' && card.b === 1) act(turnLabel(card), () => turnOver(game, card.uid), turnMessage(card));
  if (zone === 'battlefield') actions.push({ label: 'Modify', secondary: true, modify: true });
  if (zone === 'battlefield') for (const id of ['nountap', 'sick']) { const mark = menuAction(id, card); act(id === 'nountap' ? noUntapLabel(card) : sickLabel(card), () => mark.run(game), mark.message); }
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
    if (made && id === 'tap') play('tap');
    if (made && action.toast) cardNodes.flash(uid, action.toast);
  } catch (error) {
    say(error.message, true);
  }
}

// A click on a badge of one of your cards on the battlefield (SICK or the lock) clears it: the one-click fix when haste, or an untap, comes from
// somewhere the card data cannot see (src/card-nodes.js).
function clearBadge(uid, kind) {
  const found = findCard(uid);
  if (!found || found.zone !== 'battlefield') return;
  const action = menuAction(kind === 'sick' ? 'sick' : 'nountap', found.card);
  if (action) apply(() => action.run(game), action.message);
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

function deal({ pause = 0 } = {}) {
  game = makeGame(deck, lookup);
  selected = null;
  viewing = null;
  cardNodes.clear();
  $('game').hidden = false;
  document.body.classList.add('playing', 'solo'); // the one-screen layout (src/style.css)
  $('blocked').hidden = true;
  dealer.start(game.zones.hand.length, { pause }); // draws the table, and deals the hand one card at a time
  say(`Dealt ${plural(game.zones.hand.length, 'card', 'cards')}. ${game.zones.command.length ? `Your commander is in the command zone. Life is ${game.life}.` : `Life is ${game.life}.`}`);
}

function drawOne() {
  const result = draw(game, 1);
  game = result.game;
  if (!result.short) play('draw');
  say(result.short ? 'Your library is empty.' : `Drew ${game.zones.hand.find((c) => c.uid === result.drawn[0]).n}.`, result.short);
  render();
}

function goNextTurn() {
  const held = heldTapped(game);
  const result = nextTurn(game);
  game = result.game;
  if (!result.short) play('draw');
  const drewName = result.short ? null : game.zones.hand.find((c) => c.uid === result.drawn[0]).n;
  const untapped = held ? `everything untapped except ${held} that do not untap` : 'everything untapped';
  say(`Turn ${game.turn}: ${untapped}${drewName ? ` and you drew ${drewName}` : '. Your library is empty, so nothing was drawn'}.`, result.short);
  render();
}

function doMulligan() {
  play('shuffle');
  try { game = mulligan(game); } catch (error) { say(error.message, true); render(); return; }
  dealer.start(game.zones.hand.length, { pause: SHUFFLE_PAUSE_MS }); // the shuffle sound, then the new hand one card at a time
  say(`Mulligan ${game.mulligans}: a new hand of ${plural(game.zones.hand.length, 'card', 'cards')}. Put ${plural(game.mulligans, 'card', 'cards')} on the bottom of your library with the card buttons.`);
}

function togglePile(zone) {
  viewing = viewing === zone ? null : zone;
  render();
}

// ---- starting ----
function showBlocked(message, { link = true, retry = false } = {}) {
  $('game').hidden = true;
  document.body.classList.remove('playing', 'solo');
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
$('untap-all').addEventListener('click', () => { play('tap'); apply(() => untapAll(game), untapMessage(game)); });
$('shuffle').addEventListener('click', () => { play('shuffle'); apply(() => shuffleLibrary(game), 'Shuffled your library.'); });
mountSoundSettings($('sound-settings'));
// ---- piles drawn diagonally or horizontally (shared/pile-style.mjs), a double click taps a card, a click on empty space deselects ----
mountPileStyle($('pile-style-settings'));
// Two clicks close together in time and place tap or untap the card under the second one. This is counted here rather than taken from the browser's own double click event, which fires only for
// the second click of a run (a third and fourth quick click are not double clicks) and so made fast tapping unreliable. A pair is used up, so four quick clicks are two taps. No waiting time.
const TAP_PAIR_MS = 450;
const TAP_PAIR_PX = 14;
let lastBoardClick = { at: 0, x: 0, y: 0 };
$('battlefield').addEventListener('click', (event) => {
  if (!game || event.detail === 0 || event.target.closest('[data-mark], [data-badge]')) return; // detail 0: a click made by the keyboard or by a script, not by the mouse
  const button = event.target.closest('.card');
  const now = performance.now();
  const pair = button && now - lastBoardClick.at < TAP_PAIR_MS && Math.hypot(event.clientX - lastBoardClick.x, event.clientY - lastBoardClick.y) <= TAP_PAIR_PX;
  if (!pair) { lastBoardClick = { at: button ? now : 0, x: event.clientX, y: event.clientY }; return; }
  lastBoardClick = { at: 0, x: 0, y: 0 };
  const found = findCard(button.dataset.uid);
  if (!found || found.zone !== 'battlefield') return;
  apply(() => { const next = setTapped(game, found.card.uid, !found.card.tapped); play('tap'); return next; }, `${found.card.tapped ? 'Untapped' : 'Tapped'} ${found.card.n}.`);
});
document.addEventListener('click', (event) => {
  if (!selected || !game || !event.target.isConnected) return;
  if (event.target.closest('.card, button, a, input, select, textarea, summary, label, details, .side-panels, .card-menu, .spotlight')) return;
  selected = null;
  render();
});

mountCardHover(); // a larger picture of any card the pointer rests on (the cards are small on the one-screen layout)
// ---- the battlefield grid: drag and drop, Auto-arrange and Alt+arrow keys (shared/board-grid.mjs, src/board-drag.js) ----
// A card dropped on a cell of your battlefield: from the hand it is played there (a taken cell is refused); from the battlefield it moves there, or swaps places with the card that is there.
function dropOnBoard({ uid, from, col, row, whole = false }) {
  if (!game) return;
  const found = findCard(uid);
  if (!found || found.zone !== from) return;
  try {
    if (whole && from === 'battlefield') { // a whole pile (Shift while dragging, or the corner handle)
      const moved = placeStack(game, uid, col, row);
      if (moved.game === game) return;
      apply(() => moved.game, `Moved the pile of ${moved.moved} ${found.card.n}.`);
      return;
    }
    if (from === 'hand') { apply(() => moveCard(game, uid, 'battlefield', { cell: { col, row } }), `Played ${found.card.n}.`); return; }
    const result = placeCard(game, uid, col, row);
    if (result.game === game) return; // dropped on its own cell
    const other = result.swapped ? result.game.zones.battlefield.find((card) => card.uid === result.swapped) : null;
    apply(() => result.game, other ? `Swapped ${found.card.n} with ${other.n}.` : `Moved ${found.card.n}.`);
  } catch (error) {
    say(error.message, true);
  }
}
// The same without a mouse: Alt and an arrow key move the selected card on your battlefield one cell (and swap with the card there).
function nudgeSelected(direction) {
  if (!game || !selected) return false;
  const found = findCard(selected);
  if (!found || found.zone !== 'battlefield') return false;
  const cell = boardCells(game).get(selected);
  const to = cell ? stepFrom(cell, direction) : null;
  if (!to) { say('That is the edge of the battlefield.'); return true; }
  dropOnBoard({ uid: selected, from: 'battlefield', col: to.col, row: to.row });
  return true;
}
document.addEventListener('keydown', (event) => {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.target.closest?.('input, select, textarea')) return;
  const direction = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[event.key];
  if (direction && nudgeSelected(direction)) event.preventDefault();
});
$('arrange').addEventListener('click', () => { apply(() => arrangeBoard(game), 'Tidied the battlefield: lands along the bottom, everything else along the top, cards with the same name side by side.'); });
// A card of yours dragged from the battlefield and let go over your hand goes back into the hand (a token that leaves the battlefield stops existing, like every other way of moving it).
function dropOnHand({ uid, from }) {
  if (!game || from !== 'battlefield') return;
  const found = findCard(uid);
  if (!found || found.zone !== 'battlefield') return;
  apply(() => moveCard(game, uid, 'hand'), `Moved ${found.card.n} back to your hand.`);
}
mountBoardDrag({ board: () => $('battlefield'), onDrop: dropOnBoard, hand: () => $('hand-section'), onDropHand: dropOnHand, isEnabled: () => Boolean(game) });

$('mulligan').addEventListener('click', doMulligan);
$('new-game').addEventListener('click', () => { if (confirm('Start a new game? This one will be lost.')) { play('shuffle'); deal({ pause: SHUFFLE_PAUSE_MS }); } });
for (const [id, delta] of [['life-minus5', -5], ['life-minus1', -1], ['life-plus1', 1], ['life-plus5', 5]]) {
  $(id).addEventListener('click', () => apply(() => adjustLife(game, delta), ''));
}
for (const zone of ['library', 'graveyard', 'exile', 'sideboard']) $(`pile-${zone}`).addEventListener('click', () => togglePile(zone));
$('retry').addEventListener('click', start);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && selected) { selected = null; if (game) render(); } });

start();
