// The solo table: your saved deck, dealt to a table you play alone (goldfishing). The thinking is in shared/zones.mjs (zones
// and moves, tested in Node); this file reads the buttons and draws the result. Pictures come from Scryfall's picture server
// (shared/card-image.mjs) and are only requested when a card is on the page. Card names go into the page as text, never as
// markup. Nothing here is saved: a refresh deals a new game.
import { makeSafeStore } from '../../src/safe-store.js';
import { play, mountSoundSettings } from '../../src/sound.js';
import { mountPileStyle } from '../../src/pile-style.js';
import { mountPileViewer } from '../../src/pile-viewer.js';
import { mountSettingsMenu } from '../../src/settings-menu.js';
import { createHandSort } from '../../src/hand-sort-ui.js';
import { sortHand, anySortOn } from '../../../shared/hand-sort.mjs';
import { mountPileStack } from '../../src/pile-stack.js';
import { mountCommandZone } from '../../src/command-zone.js';
import { taxAction } from '../../../shared/commander-zone.mjs';
import { pileMenuItems, pileAction } from '../../../shared/pile-menu.mjs';
import { mountCardHover } from '../../src/card-hover.js';
import { createSpotlight } from '../../src/spotlight.js';
import { mountBoardDrag } from '../../src/board-drag.js';
import { mountHand } from '../../src/hand-view.js';
import { stepFrom } from '../../../shared/board-grid.mjs';
import { createDealer, SHUFFLE_PAUSE_MS } from '../../../shared/deal-sequence.mjs';
import { loadCardList } from '../../src/card-list.js';
import { LIBRARY_KEY, LEGACY_KEY, readLibrary, selectedEntry } from '../../../shared/deck-library.mjs';
import { makeLookup } from '../../../shared/card-lookup.mjs';
import { cardBackUrl } from '../../../shared/card-image.mjs';
import { makeCardNodes } from '../../src/card-nodes.js';
import { mountMarksPanel } from '../../src/marks-panel.js';
import { openCardMenu } from '../../src/card-menu.js';
import { mountCounterChips } from '../../src/counter-chips.js';
import { mountLifeControl } from '../../src/life-control.js';
import { mountFloatingBar } from '../../src/floating-bar.js';
import { flyAway, flyDraw, shuffleAnimation, gatherIntoPile, reducedMotion } from '../../src/card-fly.js';
import { menuItems, menuAction, turnLabel, turnMessage, playBackLabel, PLAY_BACK_ZONES, noUntapLabel, sickLabel, untapMessage } from '../../../shared/card-menu.mjs';
import { marksSentence, markClick, printedOf } from '../../../shared/marks.mjs';
import { chipEntries, playerMenuItems, playerAction } from '../../../shared/player-counters.mjs';
import { setFaceDown, makeGame, draw, moveCard, shuffleLibrary, mulligan, setTapped, turnOver, untapAll, heldTapped, adjustLife, nextTurn, boardCells, placeCard, placeStack, arrangeBoard, zoneCounts, reorderHand } from '../../../shared/zones.mjs';

const $ = (id) => document.getElementById(id);
const store = makeSafeStore();

let deck = null;
let lookup = null;
let game = null;
let selected = null; // the uid of the selected card
const spotlight = createSpotlight($('spotlight'), { persistent: true, emptyText: 'Select a card to see it here.' });

// ---- the card corner (frontend/src/spotlight.js): the selected card stays there, after you click away, until you select another ----
let cornerUid = null; // the card whose picture the corner shows as the selection
let cornerShown = null; // { card, marks } of the last selected card, so closing a ping brings it back
let cornerMode = 'selected'; // 'selected', or 'ping' while a pinged card is showing
function showInCorner(card, marks, uid) {
  cornerUid = uid;
  cornerMode = 'selected';
  cornerShown = { card, marks };
  spotlight.show({ card, detail: marks, closable: false, key: `${uid}:${card.turned ? 1 : 0}:${card.p ?? card.i}:${marks}` });
}
function clearCorner() { cornerUid = null; cornerShown = null; cornerMode = 'selected'; spotlight.hide(); }
function bringBackSelectionToCorner() { cornerMode = 'selected'; if (cornerShown) spotlight.show({ card: cornerShown.card, detail: cornerShown.marks, closable: false }); }
let modifyOpen = false; // the counters and power/toughness panel is shown (from Modify, in the card menu or the selected-card buttons)
let viewing = null; // the pile being looked at: 'library', 'graveyard', 'exile' or 'sideboard'
let viewTop = null; // when only the top few cards of the library are being looked at: how many

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
// What a player has on them (src/counter-chips.js, shared/player-counters.mjs): chips next to the life total, and a right-click on the life area adds or removes any of them. Commander damage needs opponents, so it is on the live table only.
const lifeChips = mountCounterChips($('life-chips'));
$('life-area').addEventListener('contextmenu', (event) => {
  if (!game) return;
  event.preventDefault();
  const box = event.currentTarget.getBoundingClientRect();
  const fromKeyboard = event.clientX === 0 && event.clientY === 0;
  openCardMenu({ title: 'Your counters', items: playerMenuItems(game), x: fromKeyboard ? box.left + box.width / 2 : event.clientX, y: fromKeyboard ? box.top + box.height / 2 : event.clientY, returnFocus: event.currentTarget, onPick: (id) => { const action = playerAction(id, game); if (action) apply(() => action.run(game), action.message); } });
});

const cardNodes = makeCardNodes({ onSelect: (uid) => select(uid), isSelected: (uid) => uid === selected, onMark: (uid, hit) => markOnCard(uid, hit), onMenu: (uid, where) => openMenuFor(uid, where), onBadge: (uid, kind) => clearBadge(uid, kind), printedStats: (card) => printedOf(card, lookup) });
const place = cardNodes.place;
// The piles as stacks of cards (src/pile-stack.js) and the command zone with its two outlined slots and the commander tax (src/command-zone.js).
const stacks = Object.fromEntries([['library', 'Library'], ['graveyard', 'Graveyard'], ['exile', 'Exile']].map(([zone, label]) => [zone, mountPileStack($(`pile-${zone}`), { zone, label })]));
const commandSlots = new Map(); // uid -> 1 or 2: the slot of the command zone a commander was dragged into (not saved: a refresh puts them in order)
const commandZone = mountCommandZone({ root: $('command'), place, showTax: true, onTax: (uid, delta) => { if (!game) return; const action = taxAction(game, uid, delta); if (action) apply(() => action.run(game), action.message); } });

// The hand is shown one card at a time with the draw sound for each (shared/deal-sequence.mjs). Only what is SHOWN is staged: the game was dealt all at once, so
// what is saved and what other players see never waits for the animation. A refresh in the middle just shows the whole hand.
const dealer = createDealer({
  onChange() {
    if (!game) return;
    const newest = dealer.dealt();
    const dealtCard = newest ? dealer.visible(game.zones.hand)[newest - 1] : null; // (found by its uid: the hand may be shown sorted)
    render();
    if (dealtCard) flyDrawn(dealtCard.uid); // the card comes out of the library and turns face up as it lands
  },
  onCard: () => play('draw'),
  reducedMotion: () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
});

// A card just put in the hand (a draw, a deal) flies out of the library and turns face up on the way (src/card-fly.js); the real card is hidden until it lands.
function flyDrawn(uid) {
  const node = [...$('hand').children].find((child) => child.dataset.uid === uid);
  if (node) flyDraw(node, $('pile-library'), cardBackUrl('small'));
}

function findCard(uid) {
  for (const zone of Object.keys(game.zones)) {
    const card = game.zones[zone].find((c) => c.uid === uid);
    if (card) return { card, zone };
  }
  return null;
}

// The hand as it is shown: the cards dealt so far, in the order of the sorts that are on (a view: the hand's own order is not changed, shared/hand-sort.mjs).
function shownHand() {
  return sortHand(dealer.visible(game.zones.hand), handSort.sorts(), { typeOrder: handSort.typeOrder(), info: (card) => lookup?.(card) ?? null });
}

// ---- drawing the whole table ----
function render() {
  $('turn').textContent = String(game.turn);
  $('life').textContent = String(game.life);
  lifeChips.update(chipEntries(game.pc));
  place($('battlefield'), game.zones.battlefield, { battlefield: true, cells: boardCells(game) });
  place($('hand'), shownHand());
  handView.arrange();
  commandZone.update(game, { slotOf: (uid) => commandSlots.get(uid) ?? null });
  for (const picture of $('command').querySelectorAll('.card .face img')) { // the command zone cards are larger than a battlefield card: the normal size, so they stay sharp
    if (picture.dataset.sharp !== '1' && (picture.getAttribute('src') ?? '').includes('/small/')) { picture.dataset.sharp = '1'; picture.src = picture.getAttribute('src').replace('/small/', '/normal/'); }
  }
  $('hand-count').textContent = String(dealer.visible(game.zones.hand).length);
  $('hand').classList.toggle('is-empty', game.zones.hand.length === 0); // (the hint "Your hand is empty" is for a hand that really is empty, not for one that is being dealt or gathered)
  const counts = zoneCounts(game);
  for (const zone of ['library', 'graveyard', 'exile']) {
    stacks[zone].update({ count: counts[zone] + (zone === 'library' ? dealer.waiting(game.zones.hand) : 0), top: zone === 'library' ? null : game.zones[zone][0] ?? null }); // cards not yet dealt still count as library; the top of the graveyard and exile is the newest card
  }
  $('pile-sideboard').textContent = `Sideboard: ${counts.sideboard}`;
  for (const zone of ['library', 'graveyard', 'exile', 'sideboard']) $(`pile-${zone}`).setAttribute('aria-pressed', String(viewing === zone));
  $('mulligan').textContent = game.mulligans ? `Mulligan (${game.mulligans} so far)` : 'Mulligan';
  renderViewer();
  renderSelected();
}

function renderViewer() {
  if (!viewing) { viewer.hide(); return; }
  const all = game.zones[viewing];
  const cards = viewTop ? all.slice(0, viewTop) : all;
  const label = `${ZONE_WORDS[viewing][0].toUpperCase()}${ZONE_WORDS[viewing].slice(1)}`;
  viewer.show({
    label,
    cards,
    depth: viewing === 'library',
    total: all.length,
    noteText: viewing === 'library' ? 'The top card is first. Right-click a card to move it; right-click the library itself to shuffle, draw or mill.' : viewing === 'graveyard' ? 'The newest card is first. Right-click a card to move it.' : 'Right-click a card to move it.',
  });
}

function renderSelected() {
  const found = selected ? findCard(selected) : null;
  if (!found) {
    selected = null;
    $('selected-line').textContent = 'Click a card to select it; right-click it for what you can do.';
    closeModify();
    return;
  }
  const { card, zone } = found;
  const marks = marksSentence(card, printedOf(card, lookup));
  showInCorner(card, marks, selected); // the corner shows the selected card, and keeps it after you click away until you select another
  // The details of the selected card are for a screen reader (this line is not drawn); the picture on hover is how they are seen, and everything you can do with the card is in its right-click menu.
  $('selected-line').textContent = `${card.n}${card.t ? `: ${card.t}` : ''}, in ${ZONE_WORDS[zone]}${card.turned && !card.tok ? ' (turned over)' : ''}${card.tapped ? ' (tapped)' : ''}.${marks ? ` ${marks}` : ''}`;
  if (zone !== 'battlefield') modifyOpen = false; // counters and the power/toughness change belong to a card on the battlefield
  $('marks').hidden = !modifyOpen;
  if (modifyOpen) placeModify();
}

// The Modify window (counters and power/toughness change, src/marks-panel.js): a small floating panel next to the selected card, opened from "Modify..." in the card's right-click menu.
function closeModify() {
  modifyOpen = false;
  $('marks').hidden = true;
}
function placeModify() {
  const panel = $('marks');
  const card = document.querySelector('.card.selected');
  const box = card ? card.getBoundingClientRect() : { left: 20, right: 20, top: 80, bottom: 80 };
  panel.style.left = '0px';
  panel.style.top = '0px';
  const size = panel.getBoundingClientRect();
  const room = window.innerWidth - box.right - 8 >= size.width;
  panel.style.left = `${Math.max(8, Math.min(room ? box.right + 8 : box.left - size.width - 8, window.innerWidth - size.width - 8))}px`;
  panel.style.top = `${Math.max(8, Math.min(box.top, window.innerHeight - size.height - 8))}px`;
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
  if (uid !== selected) modifyOpen = false;
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
  if (id === 'modify') { modifyOpen = true; render(); $('marks-amount').focus(); return; } // opens the Modify window next to the card
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
  commandSlots.clear();
  cardNodes.clear();
  $('game').hidden = false;
  document.body.classList.add('playing', 'solo'); // the one-screen layout (src/style.css)
  clearCorner();
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
  if (!result.short) flyDrawn(result.drawn[0]);
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
  if (!result.short) flyDrawn(result.drawn[0]);
}

let mulliganing = false; // the animation is running: another click waits
async function doMulligan() {
  if (mulliganing) return;
  mulliganing = true;
  const nodes = [...$('hand').children].filter((child) => child.classList.contains('card'));
  if (nodes.length && !reducedMotion()) { // the hand gathers, goes into the library and the library is shuffled, and then the new hand comes out of it
    $('hand').style.visibility = 'hidden';
    try { await gatherIntoPile(nodes, $('hand').getBoundingClientRect(), $('pile-library'), cardBackUrl('small')); play('shuffle'); await shuffleAnimation($('pile-library'), cardBackUrl('small')); } finally { $('hand').style.visibility = ''; }
  } else play('shuffle');
  mulliganing = false;
  try { game = mulligan(game); } catch (error) { say(error.message, true); render(); return; }
  dealer.start(game.zones.hand.length, { pause: reducedMotion() ? SHUFFLE_PAUSE_MS : 0 }); // (under reduced motion the shuffle sound still gets its pause; otherwise the animation was the pause) then the new hand one card at a time
  say(`Mulligan ${game.mulligans}: a new hand of ${plural(game.zones.hand.length, 'card', 'cards')}. Put ${plural(game.mulligans, 'card', 'cards')} on the bottom of your library with the card buttons.`);
}

function togglePile(zone) {
  if (viewing === zone && !viewTop) { viewer.close(); return; }
  openPile(zone);
}

// ---- starting ----
function showBlocked(message, { link = true, retry = false } = {}) {
  $('game').hidden = true;
  document.body.classList.remove('playing', 'solo');
  clearCorner();
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
{ const close = make('button', 'secondary modify-close', 'Close'); close.type = 'button'; close.addEventListener('click', () => { closeModify(); const card = document.querySelector('.card.selected'); card?.focus(); }); $('marks').prepend(close); }
$('draw').addEventListener('click', drawOne);
$('next-turn').addEventListener('click', goNextTurn);
$('untap-all').addEventListener('click', () => { play('tap'); apply(() => untapAll(game), untapMessage(game)); });
mountSoundSettings($('sound-settings'));
// ---- piles drawn diagonally or horizontally (shared/pile-style.mjs), a double click taps a card, a click on empty space deselects ----
mountPileStyle($('pile-style-settings'));
const viewer = mountPileViewer({ root: $('viewer'), nodeFor: (card) => cardNodes.nodeFor(card, false), onClose: () => { viewing = null; viewTop = null; if (game) render(); } });
viewer.onSearch(() => { if (game && viewing) renderViewer(); });
// ---- the piles: a click opens the viewer (the cards and a search bar), a right-click opens the menu of the pile (search, shuffle, draw, look, mill, move all) ----
function openPile(zone, { look = null, search = false } = {}) {
  viewing = zone;
  viewTop = look;
  if (!search) viewer.clearSearch();
  render();
  if (search) viewer.focusSearch();
}
function pickFromPileMenu(zone, id, amount) {
  if (id === 'search') { openPile(zone, { search: true }); return; }
  if (id === 'look') { openPile(zone, { look: amount ?? 1 }); return; }
  const action = pileAction(id, zone, amount);
  if (!action) return;
  if (id === 'shuffle') { play('shuffle'); if (zone === 'library') shuffleAnimation($('pile-library'), cardBackUrl('small')); } else if (id === 'draw') play('draw');
  apply(() => action.run(game), action.message);
}
function openPileMenu(zone, where) {
  openCardMenu({ title: `${ZONE_WORDS[zone][0].toUpperCase()}${ZONE_WORDS[zone].slice(1)}`, items: pileMenuItems(zone, game.zones[zone].length), x: where.x, y: where.y, returnFocus: where.element, onPick: (id, amount) => pickFromPileMenu(zone, id, amount) });
}
// The name of each pile is above it, like the command zone's, with a small arrow that opens the pile's menu (the same one a right-click opens: search, shuffle, draw, look, mill, move all).
for (const [zone, name] of [['library', 'Library'], ['graveyard', 'Graveyard'], ['exile', 'Exile']]) {
  const pile = $(`pile-${zone}`);
  const slot = document.createElement('div');
  slot.className = 'pile-slot';
  const head = document.createElement('div');
  head.className = 'pile-head';
  const label = document.createElement('span');
  label.className = 'pile-name';
  label.textContent = name;
  const caret = document.createElement('button');
  caret.type = 'button';
  caret.className = 'pile-caret';
  caret.id = `pile-caret-${zone}`;
  caret.setAttribute('aria-haspopup', 'menu');
  caret.setAttribute('aria-label', `${name} options`);
  caret.title = `${name} options`;
  caret.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><path d="M1 3l4 4 4-4z"/></svg>';
  caret.addEventListener('click', () => { if (!game) return; const box = caret.getBoundingClientRect(); openPileMenu(zone, { x: box.left, y: box.bottom + 4, element: caret }); });
  head.append(label, caret);
  pile.before(slot);
  slot.append(head, pile);
}
for (const zone of ['library', 'graveyard', 'exile', 'sideboard']) {
  $(`pile-${zone}`).addEventListener('contextmenu', (event) => {
    event.preventDefault();
    const box = event.currentTarget.getBoundingClientRect();
    const fromKeyboard = event.clientX === 0 && event.clientY === 0;
    openPileMenu(zone, { x: fromKeyboard ? box.left + box.width / 2 : event.clientX, y: fromKeyboard ? box.top + box.height / 2 : event.clientY, element: event.currentTarget });
  });
}
const settings = mountSettingsMenu({ button: $('settings-button'), panel: $('settings-menu') });
// the action buttons are a floating bar you drag by its grip (src/floating-bar.js)
mountFloatingBar({ bar: document.querySelector('.actions-panel'), grip: $('bar-grip'), store });
$('pile-sideboard').addEventListener('click', () => settings.close()); // the viewer opens over the table; the Settings panel would only be in the way

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
  toggleTapped(found);
});
// Press E while the pointer is over a card of yours on the battlefield and it taps or untaps (Kevin, 2026-11-12). The same change as a double click.
function toggleTapped(found) {
  apply(() => { const next = setTapped(game, found.card.uid, !found.card.tapped); play('tap'); return next; }, `${found.card.tapped ? 'Untapped' : 'Tapped'} ${found.card.n}.`);
}
// (where the pointer is, not which card it was over: a tap changes the card under a pointer that has not moved, since the pile it is over has a new top card, so the card is looked up when E is pressed)
let pointerAt = null;
document.addEventListener('pointermove', (event) => { pointerAt = { x: event.clientX, y: event.clientY }; }, { passive: true });
document.documentElement.addEventListener('pointerleave', () => { pointerAt = null; });
const cardUnderPointer = () => (pointerAt ? document.elementFromPoint(pointerAt.x, pointerAt.y)?.closest('#battlefield > .card') ?? null : null);
// F flips the card face down (to the sleeve) or face up again, the same way (Kevin, 2026-11-12)
function flipFaceDown(found) {
  apply(() => setFaceDown(game, found.card.uid, !found.card.faceDown), found.card.faceDown ? `Flipped ${found.card.n} face up.` : `Flipped ${found.card.n} face down.`);
}
document.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if ((key !== 'e' && key !== 'f') || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat) return;
  if (event.target instanceof Element && event.target.closest('input, select, textarea, [contenteditable]')) return; // typing a number or a search is not a tap
  const hovered = cardUnderPointer();
  if (!game || !hovered) return;
  const found = findCard(hovered.dataset.uid);
  if (!found || found.zone !== 'battlefield') return;
  event.preventDefault();
  if (key === 'f') flipFaceDown(found); else toggleTapped(found);
});
document.addEventListener('click', (event) => {
  if (!selected || !game || !event.target.isConnected) return;
  if (event.target.closest('.card, button, a, input, select, textarea, summary, label, details, .side-panels, .card-menu, .spotlight, .marks-popover')) return;
  selected = null;
  render();
});

mountCardHover(); // a larger picture of any card the pointer is on while Alt is held (the cards are small on the one-screen layout)
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
    if (from !== 'battlefield') { apply(() => moveCard(game, uid, 'battlefield', { cell: { col, row } }), from === 'hand' ? `Played ${found.card.n}.` : `Moved ${from === 'library' ? 'the top card of your library' : found.card.n} to the battlefield.`); return; }
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
function dropOnHand({ uid, from, x, picture }) {
  if (!game || from === 'hand') return;
  const found = findCard(uid);
  if (!found || found.zone !== from) return;
  if (from === 'library') play('draw');
  const place = handView.holeFor(uid, x ?? 0, true); // the place that was open in the hand when it was let go
  handView.noteDrop(uid, picture); // the card starts from where its picture was let go and eases into its place
  apply(() => { const moved = moveCard(game, uid, 'hand'); return moved.zones.hand.some((c) => c.uid === uid) && !anySortOn(handSort.sorts()) ? reorderHand(moved, uid, place) : moved; }, // (a token that leaves the battlefield stops existing: there is nothing to put in its place)
     from === 'battlefield' ? `Moved ${found.card.n} back to your hand.` : `Moved ${from === 'library' ? 'the top card of your library' : found.card.n} to your hand.`);
}
// The piles and the command zone are places a card can be taken from (the top card of the library, the graveyard or the exile, or a card of the command zone) and dropped on (frontend/src/board-drag.js).
function zoneSource(target) {
  if (!game || !(target instanceof Element)) return null;
  const stack = target.closest('.pile-stack');
  if (stack) {
    const zone = stack.dataset.zone;
    const top = ['library', 'graveyard', 'exile'].includes(zone) ? game.zones[zone][0] : null; // the top of the library is its first card; of the graveyard and the exile, the newest
    if (!top) return null;
    return { button: stack, uid: top.uid, from: zone, picture: zone === 'library' ? cardBackUrl('small') : null };
  }
  const slot = target.closest('#command .card');
  return slot ? { button: slot, uid: slot.dataset.uid, from: 'command' } : null;
}
function pileAt(x, y) {
  const element = document.elementFromPoint(x, y);
  const stack = element?.closest?.('.pile-stack');
  if (stack?.dataset.zone) return { zone: stack.dataset.zone, element: stack };
  const slot = element?.closest?.('.cmd-slot'); // a commander can be put in either slot of the command zone
  if (slot) return { zone: 'command', slot: Number(slot.dataset.slot), element: slot };
  return element?.closest?.('#command, .command-zone') ? { zone: 'command', element: $('command') } : null;
}
function dropOnPile({ uid, from, to, slot = null, element = null, flying = null }) {
  const found = game ? findCard(uid) : null;
  if (found && to === 'command' && (slot === 1 || slot === 2)) commandSlots.set(uid, slot);
  if (found && from === 'command' && to === 'command') { flying?.remove(); render(); say(slot ? `Put ${found.card.n} in command zone slot ${slot}.` : ''); return; } // (moved from one slot to the other)
  if (!found || found.zone !== from || from === to || !ZONE_WORDS[to]) { flying?.remove(); return; }
  if (flying) flyAway(flying, element ?? $(`pile-${to}`)); // the picture carried flies into the pile

  if (from === 'library' && to === 'hand') play('draw');
  const name = from === 'library' ? 'the top card of your library' : found.card.n;
  apply(() => moveCard(game, uid, to, to === 'command' ? {} : { position: 'top' }), `Moved ${name} to ${ZONE_WORDS[to]}.`);
}
// Your hand as a fan: the page draws the cards, the hand view places them and shows their mana costs; a card of the hand dragged within it opens a gap and is put there when let go.
const handView = mountHand({ container: $('hand'), costOf: (uid) => { const card = game?.zones.hand.find((c) => c.uid === uid); const known = card ? lookup?.(card) : null; return known?.m ?? ''; } });
function reorderInHand({ uid, x, picture }) {
  if (!game || !game.zones.hand.some((c) => c.uid === uid)) return;
  if (anySortOn(handSort.sorts())) { handView.arrange(); say('The hand is sorted: turn the sorts off to arrange it by hand.'); return; } // (what place the card was dropped at has no meaning in a sorted hand)
  const to = handView.holeFor(uid, x); // the place it was last shown over
  handView.noteDrop(uid, picture); // the card starts from where its picture was let go and eases into its place
  const next = reorderHand(game, uid, to);
  if (next === game) { handView.arrange(); return; }
  apply(() => next, '');
}
// The sort buttons are in the bar under the hand, the order of the card types is in Settings (src/hand-sort-ui.js).
const handSort = createHandSort({ onChange: () => { if (game) render(); } });
handSort.mountButtons(handView.bar);
handSort.mountTypeOrder($('type-order-settings'));
mountBoardDrag({ board: () => $('battlefield'), onDrop: dropOnBoard, hand: () => $('hand-section'), onDropHand: dropOnHand, onHandOver: (over) => handView.carry(over), onReorderHand: reorderInHand, handZone: () => handView.zone(), handHit: (x, y) => handView.over(x, y), zoneSource, pileAt, onDropPile: dropOnPile, isEnabled: () => Boolean(game) });

$('mulligan').addEventListener('click', doMulligan);
$('new-game').addEventListener('click', () => { if (confirm('Start a new game? This one will be lost.')) { play('shuffle'); deal({ pause: SHUFFLE_PAUSE_MS }); } });
// the life total is the number itself: click, right-click, Shift for 5, hold to set (src/life-control.js)
mountLifeControl({ button: $('life'), say, onDelta: (delta) => apply(() => adjustLife(game, delta), ''), onSet: (value) => apply(() => adjustLife(game, value - game.life), `Life is ${value}.`) });
for (const zone of ['library', 'graveyard', 'exile', 'sideboard']) $(`pile-${zone}`).addEventListener('click', () => togglePile(zone));
$('retry').addEventListener('click', start);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && selected) { selected = null; if (game) render(); } });

start();
