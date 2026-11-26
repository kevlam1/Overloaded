// The solo table: your saved deck, dealt to a table you play alone (goldfishing). The thinking is in shared/zones.mjs (zones
// and moves, tested in Node); this file reads the buttons and draws the result. Pictures come from Scryfall's picture server
// (shared/card-image.mjs) and are only requested when a card is on the page. Card names go into the page as text, never as
// markup. Nothing here is saved: a refresh deals a new game.
import { mountLookSettings } from '../../src/look-settings.js';
import { askConfirm } from '../../src/confirm-box.js';
import { makeSafeStore } from '../../src/safe-store.js';
import { play, mountSoundSettings } from '../../src/sound.js';
import { mountPileStyle } from '../../src/pile-style.js';
import { restHidden, mountHandRestSetting } from '../../src/hand-rest.js';
import { mountPileViewer } from '../../src/pile-viewer.js';
import { mountStackWindow } from '../../src/stack-window.js';
import { mountHistoryBar } from '../../src/history-bar.js';
import { drawPause } from '../../../shared/draw-pace.mjs';
import { mountSettingsMenu } from '../../src/settings-menu.js';
import { keybinds } from '../../src/keybinds.js';
import { mountKeybindSettings } from '../../src/keybind-settings.js';
import { createHandSort } from '../../src/hand-sort-ui.js';
import { sortHand, anySortOn, applyPins } from '../../../shared/hand-sort.mjs';
import { mountPileStack } from '../../src/pile-stack.js';
import { mountCommandZone } from '../../src/command-zone.js';
import { taxAction } from '../../../shared/commander-zone.mjs';
import { pileMenuItems, pileAction } from '../../../shared/pile-menu.mjs';
import { handMenuItems, handAction, moveAllGroupId } from '../../../shared/hand-menu.mjs';
import { handGroupItems, groupAction, needsOrder } from '../../../shared/group-menu.mjs';
import { openOrderWindow } from '../../src/order-window.js';
import { openCardDetails } from '../../src/card-details.js';
import { askText } from '../../src/text-box.js';
import { slugOf, counterLabel } from '../../../shared/counter-catalog.mjs';
import { makeRulesLoader } from '../../src/card-rules.js';
import { makeRulingsLoader } from '../../src/card-rulings.js';
import { applyScry, topCards } from '../../../shared/scry.mjs';
import { openScryWindow } from '../../src/scry-window.js';
import { mountCardHover } from '../../src/card-hover.js';
import { cardNotes } from '../../../shared/card-notes.mjs';
import { mountBoardDrag } from '../../src/board-drag.js';
import { mountHand } from '../../src/hand-view.js';
import { stepFrom, setBoardSize, CARD_COLS, CARD_ROWS } from '../../../shared/board-grid.mjs';
import { createDealer, SHUFFLE_PAUSE_MS } from '../../../shared/deal-sequence.mjs';
import { loadCardList } from '../../src/card-list.js';
import { LIBRARY_KEY, LEGACY_KEY, readLibrary, selectedEntry } from '../../../shared/deck-library.mjs';
import { makeLookup } from '../../../shared/card-lookup.mjs';
import { cardBackUrl } from '../../../shared/card-image.mjs';
import { makeCardNodes } from '../../src/card-nodes.js';
import { mountMarksPanel } from '../../src/marks-panel.js';
import { openCardMenu, closeCardMenu } from '../../src/card-menu.js';
import { loadTokens } from '../../src/token-data.js';
import { openTokenPicker } from '../../src/token-picker.js';
import { mountCounterChips } from '../../src/counter-chips.js';
import { mountLifeControl } from '../../src/life-control.js';
import { mountFloatingBar } from '../../src/floating-bar.js';
import { flyAway, flyDraw, shuffleAnimation, gatherIntoPile, reducedMotion } from '../../src/card-fly.js';
import { menuItems, menuAction, turnLabel, turnMessage, playBackLabel, PLAY_BACK_ZONES, noUntapLabel, sickLabel, untapMessage } from '../../../shared/card-menu.mjs';
import { marksSentence, markClick, printedOf } from '../../../shared/marks.mjs';
import { chipEntries, playerMenuItems, playerAction, playerAddItems } from '../../../shared/player-counters.mjs';
import { createToken, createEmblem, changeCounter, setFaceDown, makeGame, draw, moveCard, shuffleLibrary, mulligan, setTapped, turnOver, untapAll, heldTapped, adjustLife, nextTurn, boardCells, placeCard, placeStack, placeGroup, zoneCounts, reorderHand } from '../../../shared/zones.mjs';
import { createToolDocks } from '../../src/tool-dock.js';
import { emptyUndo, remember, canUndo, takeBack, undoWords } from '../../../shared/undo.mjs';
import { nextStep } from '../../../shared/phase.mjs';
import { mountPhaseStrip } from '../../src/phase-strip.js';

const $ = (id) => document.getElementById(id);
const store = makeSafeStore();

let deck = null;
let lookup = null;
let game = null;
let selected = null; // the uid of the selected card
let multiZone = null; // the zone the picked cards are in ('battlefield' for a rectangle, 'hand' for Shift and a click): a group is picked in ONE zone and is let go when a card leaves it, so cards moved together are not left looking picked
const multi = new Set(); // the uids of the cards picked up by dragging a rectangle over the battlefield (E, Q and F then act on all of them)
// (The card preview at the right of the screen was taken out of the solo table on 2026-11-14 and will come back for the table page: the card is read from the picture on hover, with Alt.)
let modifyOpen = false; // the counters and power/toughness panel is shown (from Modify, in the card menu or the selected-card buttons)
let viewing = null; // the pile being looked at: 'library', 'graveyard', 'exile' or 'sideboard'
let viewTop = null; // when only the top few cards of the library are being looked at: how many
let viewBottom = false; // the cards shown are the bottom few of the library, not the top
let viewReveal = false; // the cards in the viewer are revealed (Reveal top X): the window says so
const rulingsLoader = makeRulingsLoader(); // (the rulings of a card, the same way: one small file, fetched when its details are opened)
const rulesLoader = makeRulesLoader(); // the rules of a card come from the site's own files, one small file per group of cards, fetched when a card's details are opened
const peeking = new Set(); // uids of two-sided cards in the hand that are shown on their back face (only a look, for you: not saved, nothing changes in the game)
let topRevealed = false; // "Play with top revealed": the top card of the library is shown face up on its pile (not saved; a new game turns it off)

const ZONE_WORDS = { library: 'your library', hand: 'your hand', battlefield: 'the battlefield', graveyard: 'your graveyard', exile: 'exile', command: 'the command zone', sideboard: 'your sideboard' };
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

// The news line (hidden during a game) and, once the history bar exists, its Messages tab (Kevin, 2026-11-21)
let noteMessage = null;
function say(message, isError = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', isError);
  noteMessage?.(message, { error: isError });
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

// The wide "Counters" button under the life (Kevin, 2026-11-18): a dropdown of every counter with what you have, one click adds 1; the chips below show them with their amounts.
{
  const button = $('life-counters');
  button.addEventListener('click', () => {
    if (!game) return;
    const box = button.getBoundingClientRect();
    button.setAttribute('aria-expanded', 'true');
    openCardMenu({ title: 'Add a counter', items: playerAddItems(game), x: box.left, y: box.bottom + 4, returnFocus: button, toggleOn: button, onClose: () => button.setAttribute('aria-expanded', 'false'), onPick: (id) => { const action = playerAction(id, game); if (action) apply(() => action.run(game), action.message); } });
  });
}

const cardNodes = makeCardNodes({ onSelect: (uid, event) => select(uid, event), isSelected: (uid) => uid === selected || multi.has(uid), onMark: (uid, hit) => markOnCard(uid, hit), onMenu: (uid, where) => openMenuFor(uid, where), onBadge: (uid, kind) => clearBadge(uid, kind), printedStats: (card) => printedOf(card, lookup) });
const place = cardNodes.place;
// The piles as stacks of cards (src/pile-stack.js) and the command zone with its two outlined slots and the commander tax (src/command-zone.js).
const stacks = Object.fromEntries([['library', 'Library'], ['graveyard', 'Graveyard'], ['exile', 'Exile']].map(([zone, label]) => [zone, mountPileStack($(`pile-${zone}`), { zone, label })]));
const commandSlots = new Map(); // uid -> 1 or 2: the slot of the command zone a commander was dragged into (not saved: a refresh puts them in order)
const commandZone = mountCommandZone({ root: $('command'), place, showTax: true, keepTaxRoom: true, onTax: (uid, delta) => { if (!game) return; const action = taxAction(game, uid, delta); if (action) apply(() => action.run(game), action.message); } });

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
// A card moved by hand in a sorted hand is pinned where it was put (pins: uid to place) until the sorts are changed: it no longer follows them, the others do.
const pins = new Map();
let shownSorted = null; // the cards of the hand as they were last shown while a sort was in force (null when none was): turning the sort off keeps that order
function shownHand() {
  let cards = dealer.visible(game.zones.hand);
  for (const uid of [...peeking]) if (!game.zones.hand.some((card) => card.uid === uid)) peeking.delete(uid); // (a card that has left the hand shows its front again)
  if (peeking.size) cards = cards.map((card) => (peeking.has(card.uid) && card.b === 1 ? { ...card, turned: true } : card));
  const sorts = handSort.sorts();
  if (!anySortOn(sorts)) { shownSorted = null; return cards; }
  for (const uid of [...pins.keys()]) if (!cards.some((card) => card.uid === uid)) pins.delete(uid); // (a card that has left the hand is not pinned any more)
  const shown = applyPins(sortHand(cards, sorts, { typeOrder: handSort.typeOrder(), colorOrder: handSort.colorOrder(), landOrder: handSort.landOrder(), info: (card) => lookup?.(card) ?? null }), pins);
  shownSorted = shown.map((card) => card.uid);
  return shown;
}
// The sort has been turned off (the switch, or the last button): the hand keeps the order it was shown in, it is not put back the way it was before the sorting (Kevin, 2026-11-13).
function keepShownOrder() {
  if (!game || !shownSorted || shownSorted.length !== game.zones.hand.length) return;
  let next = game;
  shownSorted.forEach((uid, index) => { if (next.zones.hand.some((card) => card.uid === uid)) next = reorderHand(next, uid, index); });
  game = next;
  say('The hand stays in the order it was sorted in.');
}

// ---- drawing the whole table ----
function render() {
  if (multi.size > 0 && [...multi].some((each) => findCard(each)?.zone !== multiZone)) multi.clear(); // (a picked card has left the zone it was picked in, with the others or alone: the group is over)
  $('turn').textContent = String(game.turn);
  $('undo').disabled = !canUndo(undoState);
  phaseStrip.update({ step: phaseStep, mine: true });
  $('life').textContent = String(game.life);
  lifeChips.update(chipEntries(game.pc));
  place($('battlefield'), game.zones.battlefield, { battlefield: true, cells: boardCells(game), sharp: true });
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
    stacks[zone].update({ count: counts[zone] + (zone === 'library' ? dealer.waiting(game.zones.hand) : 0), top: zone === 'library' ? (topRevealed ? game.zones.library[0] ?? null : null) : game.zones[zone][0] ?? null, reveal: zone === 'library' && topRevealed }); // cards not yet dealt still count as library; the top of the graveyard and exile is the newest card
  }
  $('pile-sideboard').textContent = `Sideboard: ${counts.sideboard}`;
  for (const zone of ['library', 'graveyard', 'exile', 'sideboard']) $(`pile-${zone}`).setAttribute('aria-pressed', String(viewing === zone));
  $('mulligan').querySelector('.act-label').textContent = game.mulligans ? `Mulligan (${game.mulligans} so far)` : 'Mulligan'; // (the label only: the button keeps its icon)
  renderViewer();
  renderSelected();
}

function renderViewer() {
  if (!viewing) { viewer.hide(); return; }
  const all = game.zones[viewing];
  const cards = viewTop ? (viewBottom ? all.slice(Math.max(0, all.length - viewTop)) : all.slice(0, viewTop)) : all;
  const label = viewReveal && viewing === 'library' ? 'Revealed' : `${ZONE_WORDS[viewing][0].toUpperCase()}${ZONE_WORDS[viewing].slice(1)}`;
  for (const tab of document.querySelectorAll('#viewer .viewer-tab')) tab.setAttribute('aria-pressed', String(tab.dataset.view === viewing));
  $('viewer-tabs').hidden = !(viewing === 'graveyard' || viewing === 'exile'); // (the graveyard and exile windows switch between each other; the library is only itself)
  viewer.show({
    label,
    cards,
    depth: viewing === 'library',
    total: all.length,
    from: viewBottom ? 'bottom' : 'top',
    offset: viewBottom ? all.length - cards.length : 0,
    noteText: viewing === 'library' ? 'Top card first. Right-click a card to move it.' : viewing === 'graveyard' ? 'Newest first. Right-click a card to move it.' : 'Right-click a card to move it.', // (short: Kevin, 2026-11-25)
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
  const before = game;
  try {
    game = run();
    if (game !== before) undoState = remember(undoState, before, message); // (Undo puts the game from before this move back)
    if (message) { say(message); record(message); }
  } catch (error) {
    made = false;
    say(error.message, true);
  }
  render();
  return made;
}

// Shift and a click on a card of the hand adds it to the picked cards or takes it out again (Kevin, 2026-11-15); a right-click on a picked card then acts on all of them (openGroupMenu). A click without Shift on a card of
// the hand picks just that card. The picked cards of the battlefield (a rectangle) and of the hand are never mixed.
const inHand = (uid) => game.zones.hand.some((card) => card.uid === uid);
function select(uid, event = null) {
  if (event?.shiftKey && inHand(uid)) {
    if ([...multi].some((each) => !inHand(each))) multi.clear();
    multiZone = 'hand';
    if (multi.size === 0 && selected && selected !== uid && inHand(selected)) multi.add(selected);
    if (multi.has(uid)) multi.delete(uid); else multi.add(uid);
    if (multi.size <= 1) { selected = multi.size === 1 ? [...multi][0] : null; multi.clear(); say(''); } else { selected = multi.has(uid) ? uid : [...multi].at(-1); say(`${multi.size} cards picked. Right-click one of them for what to do with all of them.`); }
    modifyOpen = false;
    render();
    return;
  }
  if (uid !== selected) modifyOpen = false;
  if (!multi.has(uid) || inHand(uid)) multi.clear(); // (a click on a card that is not in the group leaves the group; a plain click on a card of the hand picks just that one)
  selected = uid;
  render();
}

// The right-click menu of one of your cards (src/card-menu.js, shared/card-menu.mjs). It selects the card too, so the buttons above show it.
function openMenuFor(uid, where) {
  const found = findCard(uid);
  if (!found) return;
  if (found.zone === 'hand' && multi.size > 1 && multi.has(uid)) { openGroupMenu(where); return; } // (several cards of the hand picked: the menu is for all of them)
  select(uid);
  openCardMenu({ title: found.card.n, items: menuItems(found.card, found.zone, { peek: true, details: true, counters: true, stack: true }), x: where.x, y: where.y, returnFocus: where.element, onPick: (id, amount) => pickFromMenu(uid, id, amount) });
}

// The menu of the picked cards of the hand: Play, Discard, Exile, Top and Bottom of library (each asks for the order first) and Move to. The cards go in the order they have in the hand.
function openGroupMenu(where) {
  const picked = game.zones.hand.filter((card) => multi.has(card.uid));
  if (picked.length < 2) return;
  const uids = picked.map((card) => card.uid);
  openCardMenu({ title: `${picked.length} cards`, items: handGroupItems(), x: where.x, y: where.y, returnFocus: where.element, onPick: (id) => pickFromGroupMenu(id, uids) });
}
function pickFromGroupMenu(id, uids) {
  const run = (order = null) => {
    try {
      const action = groupAction(id, uids, { order });
      if (!action) return;
      if (id === 'group:top' || id === 'group:bottom') play('shuffle');
      multi.clear(); selected = null;
      apply(() => action.run(game), action.message);
    } catch (error) { say(error.message, true); }
  };
  if (!needsOrder(id)) { run(); return; }
  const cards = uids.map((uid) => game.zones.hand.find((card) => card.uid === uid)).filter(Boolean);
  const top = id === 'group:top';
  openOrderWindow({
    title: top ? 'Put on top of your library' : 'Put on the bottom of your library',
    note: top ? 'The left card ends up as the top card. Drag a card to move it, or use its arrows.' : 'The right card ends up as the very bottom card. Drag a card to move it, or use its arrows.',
    cards,
    places: (index, count) => (top ? (index === 0 ? 'Top' : `#${index + 1}`) : (index === count - 1 ? 'Bottom' : `#${index + 1}`)),
    onDone: (order) => run(order),
  });
}

function pickFromMenu(uid, id, amount) {
  const found = findCard(uid);
  if (!found) return;
  if (id === 'stack') { stackWindow.add(found.card); return; } // a copy of the card as it is now goes on top of the stack window
  if (id === 'modify') { modifyOpen = true; render(); $('marks-amount').focus(); return; } // opens the Modify window next to the card
  if (id === 'counteradd:custom') { // a counter with a name of your own: ask for the name, then add one
    const box = document.querySelector(`.card[data-uid="${uid}"]`)?.getBoundingClientRect();
    askText({ title: 'Name of the counter', x: box ? box.left : 100, y: box ? box.top : 100, hint: 'Letters, numbers, spaces and hyphens, up to 24.', returnFocus: document.querySelector(`.card[data-uid="${uid}"]`),
      check: (text) => { const key = slugOf(text); return key ? { ok: true, value: key } : { ok: false, message: 'Use 2 to 24 letters, numbers, spaces or hyphens.' }; } })
      .then((key) => { if (key === null || !findCard(uid)) return; apply(() => changeCounter(game, uid, key, 1), `Added a ${counterLabel(key)} counter to ${found.card.n}.`); });
    return;
  }
  if (id === 'details') { openCardDetails({ card: found.card, info: lookup?.(found.card) ?? null, loader: rulesLoader, rulingsLoader, returnFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null }); return; } // the rules, mana value, type and the rest of the card (frontend/src/card-details.js)
  if (id === 'peek') { // a look at the other face of a two-sided card in the hand
    if (found.zone !== 'hand' || found.card.b !== 1) return;
    if (peeking.has(uid)) peeking.delete(uid); else peeking.add(uid);
    render();
    say(peeking.has(uid) ? `Showing the back of ${found.card.n} (only a look: it is still in your hand as it was).` : `Showing the front of ${found.card.n} again.`);
    return;
  }
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
  undoState = emptyUndo();
  phaseStep = 0;
  topRevealed = false; // a new game: the top card is face down again
  peeking.clear();
  selected = null;
  viewing = null;
  commandSlots.clear();
  cardNodes.clear();
  $('game').hidden = false;
  document.body.classList.add('playing', 'solo'); // the one-screen layout (src/style.css)
  shell(true);
  requestAnimationFrame(() => { if (fitBoard()) requestAnimationFrame(() => { if (fitBoard() && game) render(); }); }); // (the board's place and grid, once the table shows)
  $('blocked').hidden = true;
  dealer.start(game.zones.hand.length, { pause }); // draws the table, and deals the hand one card at a time
  historyBar.clear();
  record(`New game: ${plural(game.zones.hand.length, 'card', 'cards')} dealt.`);
  say(`Dealt ${plural(game.zones.hand.length, 'card', 'cards')}. ${game.zones.command.length ? `Your commander is in the command zone. Life is ${game.life}.` : `Life is ${game.life}.`}`);
}

function drawOne() {
  const result = draw(game, 1);
  if (!result.short) undoState = remember(undoState, game, 'Drew a card.');
  game = result.game;
  if (!result.short) play('draw');
  say(result.short ? 'Your library is empty.' : `Drew ${game.zones.hand.find((c) => c.uid === result.drawn[0]).n}.`, result.short);
  if (!result.short) record(`Drew ${game.zones.hand.find((c) => c.uid === result.drawn[0]).n}.`);
  render();
  if (!result.short) flyDrawn(result.drawn[0]);
}

// Draw X from the library menu: one card after another, each flying out of the library like the Draw button's (a small pause between them, shorter every 5 cards after the first 10; under reduced motion they come at once).
let drawing = false;
async function drawCards(n) {
  if (n <= 1) { drawOne(); return; }
  if (drawing) return;
  drawing = true;
  try {
    let drawn = 0;
    undoState = remember(undoState, game, `Drew ${n} cards.`); // (one Undo takes all of them back)
    for (let i = 0; i < n; i++) {
      const result = draw(game, 1);
      if (result.short) break;
      game = result.game;
      drawn++;
      play('draw');
      render();
      flyDrawn(result.drawn[0]);
      if (i < n - 1 && !reducedMotion()) await new Promise((resolve) => setTimeout(resolve, drawPause(i + 1))); // (faster every 5 cards after the first 10)
    }
    if (drawn > 0) record(`Drew ${plural(drawn, 'card', 'cards')}.`);
    say(drawn === 0 ? 'Your library is empty.' : drawn < n ? `Drew ${drawn} cards: your library ran out.` : `Drew ${drawn} cards.`, drawn < n);
  } finally { drawing = false; }
}

function goNextTurn() {
  const held = heldTapped(game);
  const result = nextTurn(game);
  game = result.game;
  undoState = emptyUndo(); // (Undo never crosses a turn)
  phaseStep = 0; // (a new turn starts at Untap)
  if (!result.short) play('draw');
  const drewName = result.short ? null : game.zones.hand.find((c) => c.uid === result.drawn[0]).n;
  const untapped = held ? `everything untapped except ${held} that do not untap` : 'everything untapped';
  record(`Turn ${game.turn}${drewName ? `: drew ${drewName}` : ''}.`);
  say(`Turn ${game.turn}: ${untapped}${drewName ? ` and you drew ${drewName}` : '. Your library is empty, so nothing was drawn'}.`, result.short);
  render();
  if (!result.short) flyDrawn(result.drawn[0]);
}

let mulliganing = false; // the animation is running: another click waits
async function doMulligan() {
  if (mulliganing) return;
  handView.clearLift();
  mulliganing = true;
  const nodes = [...$('hand').children].filter((child) => child.classList.contains('card'));
  if (nodes.length && !reducedMotion()) { // the hand gathers, goes into the library and the library is shuffled, and then the new hand comes out of it
    $('hand').style.visibility = 'hidden';
    try { await gatherIntoPile(nodes, $('hand').getBoundingClientRect(), $('pile-library'), cardBackUrl('small')); play('shuffle'); await shuffleAnimation($('pile-library'), cardBackUrl('small')); } finally { $('hand').style.visibility = ''; }
  } else play('shuffle');
  mulliganing = false;
  try { game = mulligan(game); undoState = emptyUndo(); } catch (error) { say(error.message, true); render(); return; } // (a mulligan cannot be undone: the new hand is dealt)
  dealer.start(game.zones.hand.length, { pause: reducedMotion() ? SHUFFLE_PAUSE_MS : 0 }); // (under reduced motion the shuffle sound still gets its pause; otherwise the animation was the pause) then the new hand one card at a time
  record(`Mulligan ${game.mulligans}.`);
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
  shell(false);
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
    showBlocked(saved.source === 'damaged' || saved.skipped > 0 ? 'Your saved deck could not be read, so it was ignored. Import it again.' : 'You have no deck yet. Play the sample deck to try the table right away, or import your own.');
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
{ const close = make('button', 'secondary modify-close', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Close'); close.title = 'Close'; close.addEventListener('click', () => { closeModify(); const card = document.querySelector('.card.selected'); card?.focus(); }); ($('marks').querySelector('.marks-head') ?? $('marks')).append(close); }
$('draw').addEventListener('click', drawOne);
$('next-turn').addEventListener('click', goNextTurn);
$('untap-all').addEventListener('click', () => { play('tap'); apply(() => untapAll(game), untapMessage(game)); });
mountLookSettings($('look-settings'));
mountSoundSettings($('sound-settings'));
// ---- piles drawn diagonally or horizontally (shared/pile-style.mjs), a double click taps a card, a click on empty space deselects ----
mountPileStyle($('pile-style-settings'));
// ---- Undo and the step of the turn (the redesign, step 4: shared/undo.mjs, shared/phase.mjs) ----
let undoState = emptyUndo();
let phaseStep = 0; // the step of the turn you are on (solo: kept in the page)
function doUndo() {
  if (!game) return;
  const back = takeBack(undoState);
  if (!back) { say('Nothing to undo.'); return; }
  undoState = back.undo;
  game = back.game;
  say(undoWords(back.label));
  record(undoWords(back.label));
  render();
}
const phaseStrip = mountPhaseStrip({ root: $('phase-strip'), onPick: (step) => { phaseStep = step; if (game) render(); } });
$('undo').addEventListener('click', doUndo);

// The rail on the right (the redesign, 2026-11-25, as on the multiplayer table: src/tool-dock.js): the game history, the stack and your console.
// Each can be dragged out by its header to float, and dropped back on the rail. The floating tools keep out of the rail.
const floatingBars = [];
let stackWindowRef = null;
const toolDocks = createToolDocks({
  elements: { stack: $('stack-window'), history: $('history-bar'), bar: document.querySelector('.actions-panel') },
  stackWindow: { pin: (on) => stackWindowRef?.pin(on) },
  onFloat: () => { for (const bar of floatingBars) bar.relayout(); },
  store,
});
// The battlefield's grid fits its box (the redesign, 2026-11-25): square cells about as wide as the solo table always had (112 across, 16 cards), and as many whole rows of cards
// as the height holds, so a taller window gives more rows instead of bigger cards (and no empty band above the hand). A card stored past the edge of a smaller grid is drawn
// at its edge (shared/board-grid.mjs). Nothing is saved on the solo table, so nothing else changes.
const SOLO_COLS = 112;
// The battlefield ends just above whichever is taller: the part of a resting hand card that shows (your Resting hand setting), or the row of piles (with their names).
// A card on the bottom row is then never under the hand, where a click would reach the hand instead.
function boardBottom() {
  const box = $('hand'); const style = getComputedStyle(box); const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const cardHeight = Math.max(0, box.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - 2.8 * rem); // (from the hand's box, as src/hand-view.js sizes its cards: steady while cards are dealt, picked or carried)
  const handShows = cardHeight * (1 - Number(restHidden()));
  const piles = document.querySelector('.side-panels').getBoundingClientRect();
  const pileRow = piles.height ? window.innerHeight - piles.top : 0;
  return Math.round(Math.max(handShows, pileRow) + 6);
}
// Sets the board's bottom; true when it moved. Called when a size changes (the window, the hand's box, the piles) and when a game starts, never on every drawing (moving the board mid-click lost clicks).
function placeBoardBottom() {
  if (!document.body.classList.contains('playing')) return false;
  const zonesLeft = `${Math.round(document.querySelector('.side-panels').getBoundingClientRect().left)}px`; // (the hand ends where the piles begin)
  if (document.body.style.getPropertyValue('--zones-left') !== zonesLeft) document.body.style.setProperty('--zones-left', zonesLeft);
  const bottom = `${boardBottom()}px`;
  if ($('my-board').style.bottom === bottom) return false;
  $('my-board').style.bottom = bottom;
  document.body.style.setProperty('--tray-h', bottom); // (the tray under the battlefield, in src/styles/game-shell.css)
  return true;
}
function fitBoard() {
  const element = $('battlefield');
  if (placeBoardBottom()) return false; // (the board's size changes: the observer comes back)
  const width = element.clientWidth; const height = element.clientHeight;
  if (!width || !height) return false;
  const rows = Math.max(CARD_ROWS, Math.floor(height / (width / SOLO_COLS) / CARD_ROWS + 0.001) * CARD_ROWS);
  const cols = Math.max(CARD_COLS, Math.floor(width / (height / rows) + 0.001));
  if (element.style.getPropertyValue('--cols') !== String(cols)) element.style.setProperty('--cols', String(cols));
  if (element.style.getPropertyValue('--rows') !== String(rows)) element.style.setProperty('--rows', String(rows));
  return setBoardSize({ cols, rows });
}
if (typeof ResizeObserver === 'function') {
  let frame = 0;
  const observer = new ResizeObserver(() => { if (frame) return; frame = requestAnimationFrame(() => { frame = 0; if (fitBoard() && game) render(); }); });
  for (const id of ['battlefield', 'hand']) observer.observe($(id));
  observer.observe(document.querySelector('.side-panels'));
}
const railRoom = () => ({ right: document.body.classList.contains('rail-on') ? document.querySelector('.tool-dock[data-dock="rail"]')?.offsetWidth ?? 0 : 0 });
// While a game shows: the rail, and the line of news in the top bar (it goes back to the top of the page otherwise).
function shell(on) {
  const mode = on ? 'solo' : 'none';
  const changed = toolDocks.mode() !== mode;
  document.body.classList.toggle('rail-on', on);
  toolDocks.layout(mode);
  const topbar = document.querySelector('.topbar');
  if (on) { if (topbar.parentElement !== $('topbar-slot')) $('topbar-slot').append(topbar); }
  else if (topbar.parentElement === $('topbar-slot')) $('blocked').before(topbar);
  if (changed) for (const bar of floatingBars) bar.relayout();
}
const historyBar = mountHistoryBar({ root: $('history-bar'), store, room: railRoom, docking: toolDocks.dockingFor('history') }); // (Kevin, 2026-11-18: the moves of this game; in the rail since the redesign)
floatingBars.push(historyBar);
const record = (message) => historyBar.add(message, game?.turn);
noteMessage = (message, options) => { if (document.body.classList.contains('playing')) historyBar.note(message, options); }; // (outside a game the line itself shows)
const stackWindow = stackWindowRef = mountStackWindow({ root: $('stack-window'), printedStats: (card) => printedOf(card, lookup), say }); // (Kevin, 2026-11-17: a window that slides out from the left with copies of cards, text boxes and arrows; a visual aid, the game is not touched)
mountHandRestSetting($('hand-rest-settings'), { onChange: () => { handView.arrange(); if (fitBoard() && game) render(); } }); // (the hand is made further down, but the slider only works after it is)
const viewer = mountPileViewer({ root: $('viewer'), nodeFor: (card) => cardNodes.nodeFor(card, false), onClose: () => { viewing = null; viewTop = null; viewBottom = false; viewReveal = false; if (game) render(); } });
for (const tab of document.querySelectorAll('#viewer .viewer-tab')) tab.addEventListener('click', () => { if (game) openPile(tab.dataset.view); });
viewer.onSearch(() => { if (game && viewing) renderViewer(); });
// ---- the piles: a click opens the viewer (the cards and a search bar), a right-click opens the menu of the pile (search, shuffle, draw, look, mill, move all) ----
function openPile(zone, { look = null, search = false, reveal = false, bottom = false } = {}) {
  viewer.peek(false); // (a window hidden with the eye button comes back when a pile is opened)
  viewing = zone;
  viewTop = look;
  viewBottom = bottom;
  viewReveal = reveal;
  if (!search) viewer.clearSearch();
  render();
  if (search) viewer.focusSearch();
}
function pickFromPileMenu(zone, id, amount) {
  if (id === 'search') { openPile(zone, { search: true }); return; }
  if (id === 'look') { openPile(zone, { look: amount ?? 1 }); return; }
  if (id === 'lookbottom') { openPile(zone, { look: amount ?? 1, bottom: true }); return; }
  if (id === 'draw' && zone === 'library') { drawCards(amount ?? 1); return; } // (the same flight of the card out of the library as the Draw button)
  if (id === 'reveal') { openPile(zone, { look: amount ?? 1, reveal: true }); return; }
  if (id === 'scry' || id === 'surveil') {
    openScryWindow({
      kind: id,
      cards: topCards(game, amount ?? 1),
      nodeFor: (card) => cardNodes.nodeFor(card, false),
      onDone: ({ order, choices }) => {
        try { const result = applyScry(game, { kind: id, order, choices }); play('shuffle'); apply(() => result.game, result.message); } catch (error) { say(error.message, true); }
      },
    });
    return;
  }
  if (id === 'toprevealed') { topRevealed = !topRevealed; render(); say(topRevealed ? 'The top card of your library is face up now.' : 'The top card of your library is face down again.'); return; }
  const action = pileAction(id, zone, amount);
  if (!action) return;
  if (id === 'shuffle') { play('shuffle'); if (zone === 'library') shuffleAnimation($('pile-library'), cardBackUrl('small')); } else if (id === 'intolibrary') play('shuffle'); else if (id === 'draw') play('draw');
  apply(() => action.run(game), action.message);
}
function openPileMenu(zone, where) {
  const caret = $(`pile-caret-${zone}`); // the arrow beside the pile's name turns while the menu is open
  caret?.setAttribute('aria-expanded', 'true');
  openCardMenu({ title: `${ZONE_WORDS[zone][0].toUpperCase()}${ZONE_WORDS[zone].slice(1)}`, items: pileMenuItems(zone, game.zones[zone].length, { scry: true, reveal: true, topRevealed, downExile: true }), x: where.x, y: where.y, returnFocus: where.element, toggleOn: caret, avoid: where.avoid ?? null, onPick: (id, amount) => pickFromPileMenu(zone, id, amount), onClose: () => caret?.setAttribute('aria-expanded', 'false') });
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
  caret.setAttribute('aria-expanded', 'false');
  caret.setAttribute('aria-label', `${name} options`);
  caret.title = `${name} options`;
  caret.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><path d="M1 3l4 4 4-4z"/></svg>';
  caret.addEventListener('click', () => { if (!game) return; if (caret.getAttribute('aria-expanded') === 'true') { closeCardMenu(); return; } const box = caret.getBoundingClientRect(); openPileMenu(zone, { x: box.left, y: box.bottom + 4, element: caret, avoid: box }); });
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
mountKeybindSettings($('keybind-settings'), { keybinds, page: 'solo' });
// your console (your life and the action buttons) is in the rail; drag it out by its grip to float it, and back onto the rail (src/floating-bar.js, src/tool-dock.js)
floatingBars.push(mountFloatingBar({ bar: document.querySelector('.actions-panel'), grip: $('bar-grip'), store, key: 'overloaded.soloConsole', defaultPlace: { dock: 'bottom', fx: 0, fy: 1 }, room: railRoom, docking: toolDocks.dockingFor('bar') }));
$('pile-sideboard').addEventListener('click', () => settings.close()); // the viewer opens over the table; the Settings panel would only be in the way

// A right click on empty battlefield offers to make a token (Kevin, 2026-11-19): the window of tokens is src/token-picker.js, the list of them /data/tokens.json (shared/card-tokens.mjs).
async function openTokens(returnFocus, kind = 'token') {
  if (!game) return;
  say(`Loading the ${kind}s...`);
  const data = await loadTokens();
  if (!data) { say('The tokens could not be loaded. Check your connection and try again.', true); return; }
  say('');
  const deckNames = Object.values(game.zones).flat().filter((card) => !card.tok).map((card) => card.n);
  openTokenPicker({ data, deckNames, kind, returnFocus, onCreate: ({ token, printing }) => {
    if (kind === 'emblem') { // an emblem goes in the command zone and stays
      if (!apply(() => createEmblem(game, { n: token.name, tt: token.type, i: printing.id }).game, `Made ${token.name}.`)) throw new Error(`Could not make ${token.name}.`);
      return `Made ${token.name}.`;
    }
    const spec = { n: token.name, tt: token.type, i: printing.id, ...(token.pt ? { pt: token.pt } : {}), ...(token.colors ? { cl: token.colors } : {}) };
    if (!apply(() => createToken(game, spec).game, `Created a ${token.name} token.`)) throw new Error(`Could not make ${token.name}.`);
    return `Made a ${token.name} token.`;
  } });
}
$('battlefield').addEventListener('contextmenu', (event) => {
  if (event.defaultPrevented || event.target.closest('.card, [data-mark], [data-badge]') || !game) return;
  event.preventDefault();
  openCardMenu({ title: 'Battlefield', items: [{ id: 'token', label: 'Create token...' }, { id: 'emblem', label: 'Create emblem...' }], x: event.clientX, y: event.clientY, returnFocus: $('battlefield'), onPick: (id) => { if (id === 'token' || id === 'emblem') openTokens($('battlefield'), id); } });
});
// A right click on the command zone (not on a card) offers an emblem too.
$('command-zone').addEventListener('contextmenu', (event) => {
  if (event.defaultPrevented || event.target.closest('.card, button') || !game) return;
  event.preventDefault();
  openCardMenu({ title: 'Command zone', items: [{ id: 'emblem', label: 'Create emblem...' }], x: event.clientX, y: event.clientY, returnFocus: $('command-zone'), onPick: (id) => { if (id === 'emblem') openTokens($('command-zone'), 'emblem'); } });
});

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
// The cards a key acts on: the group picked with a rectangle when the pointer is on one of them (or on no card), else just the card under the pointer.
function keyTargets(found) {
  if (multi.size > 0 && (!found || multi.has(found.card.uid))) return [...multi].map((uid) => findCard(uid)).filter((entry) => entry && entry.zone === 'battlefield');
  return found ? [found] : [];
}
// What the keys do to picked cards, in the player's own keys ("E or Q taps them, F flips them."), or nothing when those actions have no key.
function keyHint() {
  const part = (id, verb) => { const keys = keybinds.labels(id); return keys.length ? `${keys.join(' or ')} ${verb} them` : ''; };
  const words = [part('tap', 'taps'), part('flip', 'flips')].filter(Boolean);
  return words.length ? ` ${words.join(', ')}.` : '';
}
// Press E or Q while the pointer is over a card of yours on the battlefield and it taps or untaps (Kevin, 2026-11-12 and 13). The same change as a double click. With a group picked it is the whole group,
// all set the way the first one is not.
function toggleTapped(found) {
  const targets = keyTargets(found);
  if (targets.length === 0) return;
  const want = !targets[0].card.tapped;
  apply(() => { const next = targets.reduce((game_, entry) => setTapped(game_, entry.card.uid, want), game); play('tap'); return next; }, targets.length > 1 ? `${want ? 'Tapped' : 'Untapped'} ${targets.length} cards.` : `${want ? 'Tapped' : 'Untapped'} ${targets[0].card.n}.`);
}
// (where the pointer is, not which card it was over: a tap changes the card under a pointer that has not moved, since the pile it is over has a new top card, so the card is looked up when E is pressed)
let pointerAt = null;
document.addEventListener('pointermove', (event) => { pointerAt = { x: event.clientX, y: event.clientY }; }, { passive: true });
document.documentElement.addEventListener('pointerleave', () => { pointerAt = null; });
const cardUnderPointer = () => (pointerAt ? document.elementFromPoint(pointerAt.x, pointerAt.y)?.closest('#battlefield > .card') ?? null : null);
// F flips the card face down (to the sleeve) or face up again, the same way (Kevin, 2026-11-12)
function flipFaceDown(found) {
  const targets = keyTargets(found);
  if (targets.length === 0) return;
  const down = !targets[0].card.faceDown;
  apply(() => targets.reduce((game_, entry) => setFaceDown(game_, entry.card.uid, down), game), targets.length > 1 ? `Flipped ${targets.length} cards face ${down ? 'down' : 'up'}.` : `Flipped ${targets[0].card.n} face ${down ? 'down' : 'up'}.`);
}
// The other actions a key can do (Settings > Keybinds): the same as pressing the button or menu line; false when there is nothing to press.
const GAME_KEYS = new Set(['undo', 'nextPhase', 'mulligan', 'shuffle', 'lifeUp', 'lifeDown', 'viewLibrary', 'viewGraveyard', 'viewExile', 'sortType', 'sortColor', 'sortCost', 'sortName', 'autoSort', 'history', 'stack']);
const CLICKS = { mulligan: '#mulligan', viewLibrary: '#pile-library', viewGraveyard: '#pile-graveyard', viewExile: '#pile-exile', sortType: '.hand-sort[data-sort="type"]', sortColor: '.hand-sort[data-sort="color"]', sortCost: '.hand-sort[data-sort="cost"]', sortName: '.hand-sort[data-sort="name"]', autoSort: '.hand-sort-toggle', history: '#history-bar .history-head', stack: '.stack-tab' };
function runGameKey(action) {
  if (action === 'undo') { doUndo(); return true; }
  if (action === 'nextPhase') { phaseStep = nextStep(phaseStep); render(); return true; }
  if (action === 'shuffle') { pickFromPileMenu('library', 'shuffle'); return true; }
  if (action === 'viewLibrary') { if (!game) return false; openPile('library', { search: true }); return true; } // (a click on the library does nothing here, so the key opens it like the menu's View library; Kevin 2026-11-24)
  if (action === 'lifeUp' || action === 'lifeDown') { apply(() => adjustLife(game, action === 'lifeUp' ? 1 : -1), ''); return true; }
  const target = document.querySelector(CLICKS[action]);
  if (!target || target.disabled) return false;
  target.click();
  return true;
}
// The keys come from the player's own choices (src/keybinds.js, Settings > Keybinds): tap, flip, draw, untap all and next turn. Settings itself is opened by src/settings-menu.js.
document.addEventListener('keydown', (event) => {
  const action = keybinds.match('table', event);
  if (action === null || action === 'settings') return;
  if (event.target instanceof Element && event.target.closest('input, select, textarea, [contenteditable]')) return; // typing a number or a search is not a tap
  if (action === 'draw') { if (game) { event.preventDefault(); drawOne(); } return; }
  if (action === 'untapAll' || action === 'nextTurn') { const button = $(action === 'untapAll' ? 'untap-all' : 'next-turn'); if (game && button && !button.disabled) { event.preventDefault(); button.click(); } return; }
  if (GAME_KEYS.has(action)) { if (game && runGameKey(action)) event.preventDefault(); return; }
  const hovered = cardUnderPointer();
  const found = hovered ? findCard(hovered.dataset.uid) : null;
  if (!game || (!found && multi.size === 0)) return;
  if (found && found.zone !== 'battlefield') return;
  event.preventDefault();
  if (action === 'flip') flipFaceDown(found); else toggleTapped(found);
});
// (Tab opens and closes Settings, and does nothing else: src/settings-menu.js)

// Dragging a rectangle over the empty part of the battlefield picks up every card it touches (Kevin, 2026-11-13). E, Q and F then act on all of them; a click on empty space, Escape or a click on another card lets the group go.
// A rectangle that starts in the area of the hand picks the cards of the HAND it touches instead (Kevin, 2026-11-18); the two are never mixed.
// (Moving the group together is not built.)
let marquee = null;
let marqueeEnded = false;
document.addEventListener('pointerdown', (event) => { // (on the page, not the board: since the redesign the board ends above the hand, and a rectangle can start in the area of the hand too)
  if (!game || event.button !== 0 || event.pointerType === 'touch' || event.target.closest('.card, .stack-hold-ring, button, input, .tool-dock, .actions-panel, .history-panel, .game-bar, .side-panels, .card-menu, #viewer, #settings-menu')) return;
  const zone = handView.over(event.clientX, event.clientY) ? 'hand' : event.target.closest('#battlefield') ? 'battlefield' : null;
  if (!zone) return;
  marquee = { x: event.clientX, y: event.clientY, box: null, zone, hits: new Set(), more: event.shiftKey && multiZone === zone ? new Set(multi) : new Set() };
});
document.addEventListener('pointermove', (event) => {
  if (!marquee) return;
  if (!marquee.box) {
    if (Math.hypot(event.clientX - marquee.x, event.clientY - marquee.y) < 6) return;
    marquee.box = document.createElement('div');
    marquee.box.className = 'marquee';
    document.body.append(marquee.box);
  }
  const left = Math.min(marquee.x, event.clientX); const top = Math.min(marquee.y, event.clientY);
  const right = Math.max(marquee.x, event.clientX); const bottom = Math.max(marquee.y, event.clientY);
  Object.assign(marquee.box.style, { left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px` });
  marquee.hits = new Set(marquee.more);
  for (const card of $(marquee.zone === 'hand' ? 'hand' : 'battlefield').querySelectorAll(':scope > .card')) {
    const r = card.getBoundingClientRect();
    const touches = r.width > 0 && r.left < right && r.right > left && r.top < bottom && r.bottom > top;
    if (touches) marquee.hits.add(card.dataset.uid);
    card.classList.toggle('selected', marquee.hits.has(card.dataset.uid)); // (shown at once; the page draws them again when the rectangle is let go)
  }
});
document.addEventListener('pointerup', () => {
  if (!marquee) return;
  const done = marquee;
  marquee = null;
  if (!done.box) return;
  done.box.remove();
  marqueeEnded = true;
  setTimeout(() => { marqueeEnded = false; }, 0);
  multi.clear();
  multiZone = done.zone;
  for (const uid of done.hits) multi.add(uid);
  selected = null;
  say(multi.size > 1 ? (done.zone === 'hand' ? `${multi.size} cards picked.` : `${multi.size} cards picked.${keyHint()}`) : '');
  render();
});
document.addEventListener('click', (event) => {
  if (marqueeEnded) return;
  if (multi.size > 0 && game && event.target.isConnected && !event.target.closest('.card, button, a, input, select, textarea, summary, label, details, .side-panels, .card-menu, .spotlight, .marks-popover')) { multi.clear(); render(); }
  if (!selected || !game || !event.target.isConnected) return;
  if (event.target.closest('.card, button, a, input, select, textarea, summary, label, details, .side-panels, .card-menu, .spotlight, .marks-popover')) return;
  selected = null;
  render();
});

mountCardHover(document, { notesFor: (button) => { const uid = button.dataset.uid; const found = uid && game ? findCard(uid) : null; return found ? cardNotes(found.card) : null; } }); // a larger picture of any card the pointer is on while Alt is held, with what its keywords, counters and state mean
// ---- the battlefield grid: drag and drop and Alt+arrow keys (the Auto-arrange button was taken out on 2026-11-14) (shared/board-grid.mjs, src/board-drag.js) ----
// A card dropped on a cell of your battlefield: from the hand it is played there (a taken cell is refused); from the battlefield it moves there, or swaps places with the card that is there.
function dropOnBoard({ uid, from, col, row, whole = false, group = null }) {
  if (!game) return;
  const found = findCard(uid);
  if (!found || found.zone !== from) return;
  try {
    if (group && from === 'hand') { // the cards picked with Shift and a click in the hand: the one dragged is put where it was let go, the others on the next free cells
      const ordered = game.zones.hand.filter((card) => group.includes(card.uid)).map((card) => card.uid);
      multi.clear(); selected = null;
      // (the others first, each two columns and a row further up and to the left, so the one dragged is the last and on top: they overlap as the picture carried did)
      const behind = ordered.filter((each) => each !== uid);
      apply(() => moveCard(behind.reduce((next, each, k) => moveCard(next, each, 'battlefield', { cell: { col: Math.max(0, col - 2 * (behind.length - k)), row: Math.max(0, row - (behind.length - k)) } }), game), uid, 'battlefield', { cell: { col, row } }), `Played ${ordered.length} cards.`);
      return;
    }
    if (group && from === 'battlefield') { // the cards picked up with a rectangle, moved together: each keeps its place relative to the others
      const moved = placeGroup(game, group, uid, col, row);
      if (moved.moved === 0) return;
      apply(() => moved.game, `Moved ${moved.moved} cards.`);
      return;
    }
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
// A card of yours dragged from the battlefield and let go over your hand goes back into the hand (a token that leaves the battlefield stops existing, like every other way of moving it).
function dropOnHand({ uid, from, x, picture, uids = null }) {
  if (!game || from === 'hand') return;
  const found = findCard(uid);
  if (!found || found.zone !== from) return;
  if (from === 'library') play('draw');
  const place = handView.holeFor(uid, x ?? 0, true); // the place that was open in the hand when it was let go
  handView.noteDrop(uid, picture); // the card starts from where its picture was let go and eases into its place
  if (from === 'battlefield' && Array.isArray(uids) && uids.length > 1) { // a whole pile or a group of picked cards: every card of it goes into the hand, one place after another from the place that was open
    apply(() => {
      let next = game; let at = place; let count = 0;
      for (const each of uids) {
        if (!next.zones.battlefield.some((c) => c.uid === each)) continue;
        const moved = moveCard(next, each, 'hand');
        count += 1;
        next = moved.zones.hand.some((c) => c.uid === each) && !anySortOn(handSort.sorts()) ? reorderHand(moved, each, at++) : moved; // (a token that leaves the battlefield stops existing)
      }
      if (count === 0) throw new Error('Nothing to move.');
      return next;
    }, `Moved ${uids.length} cards back to your hand.`);
    multi.clear();
    return;
  }
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
  const slot = element?.closest?.('.cmd-slot'); // a commander can be put in either slot of the command zone; each slot is its own place to drop on (there is no larger box round both: Kevin, 2026-11-13)
  return slot ? { zone: 'command', slot: Number(slot.dataset.slot), element: slot } : null;
}
function dropOnPile({ uid, from, to, slot = null, element = null, flying = null, uids = null }) {
  const found = game ? findCard(uid) : null;
  if (found && uids && from === 'hand' && uids.length > 1 && ZONE_WORDS[to]) { // a group of picked cards of the hand let go over a pile: they all go there (to the library: on top, the first card of the hand highest)
    const ordered = game.zones.hand.filter((card) => uids.includes(card.uid)).map((card) => card.uid);
    const action = groupAction(to === 'library' ? 'group:top' : `group:${to}`, ordered, { order: ordered });
    flying?.remove();
    multi.clear(); selected = null;
    if (action) apply(() => action.run(game), action.message);
    return;
  }
  if (found && uids && from === 'battlefield' && uids.length > 1 && ZONE_WORDS[to] && to !== 'battlefield') { // a whole pile of the battlefield let go over a pile: every card of it goes there (Kevin, 2026-11-24: only the top card went)
    const moving = uids.filter((each) => game.zones.battlefield.some((card) => card.uid === each));
    if (flying) flyAway(flying, element ?? $(`pile-${to}`));
    selected = null;
    apply(() => moving.reduce((g, each) => moveCard(g, each, to, to === 'command' ? {} : { position: 'top' }), game), `Moved the pile of ${moving.length} ${found.card.n} to ${ZONE_WORDS[to]}.`);
    return;
  }
  if (found && to === 'command' && (slot === 1 || slot === 2)) commandSlots.set(uid, slot);
  if (found && from === 'command' && to === 'command') { flying?.remove(); render(); say(slot ? `Put ${found.card.n} in command zone slot ${slot}.` : ''); return; } // (moved from one slot to the other)
  if (!found || found.zone !== from || from === to || !ZONE_WORDS[to]) { flying?.remove(); return; }
  if (flying) flyAway(flying, element ?? $(`pile-${to}`)); // the picture carried flies into the pile

  if (from === 'library' && to === 'hand') play('draw');
  const name = from === 'library' ? 'the top card of your library' : found.card.n;
  apply(() => moveCard(game, uid, to, to === 'command' ? {} : { position: 'top' }), `Moved ${name} to ${ZONE_WORDS[to]}.`);
}
// Your hand as a fan: the page draws the cards, the hand view places them and shows their mana costs; a card of the hand dragged within it opens a gap and is put there when let go.
const handView = mountHand({ container: $('hand'), restHidden, costOf: (uid) => { const card = game?.zones.hand.find((c) => c.uid === uid); const known = card ? lookup?.(card) : null; return known?.m ?? ''; } });
function reorderInHand({ uid, x, picture }) {
  if (!game || !game.zones.hand.some((c) => c.uid === uid)) return;
  const to = handView.holeFor(uid, x); // the place it was last shown over
  if (anySortOn(handSort.sorts())) { handView.noteDrop(uid, picture); pins.set(uid, to); render(); say('That card stays where you put it until you change the sorts.'); return; } // (in a sorted hand a card moved by hand is pinned there)
  handView.noteDrop(uid, picture); // the card starts from where its picture was let go and eases into its place
  const next = reorderHand(game, uid, to);
  if (next === game) { handView.arrange(); return; }
  apply(() => next, '');
}
// The sort buttons are in the bar under the hand, the order of the card types is in Settings (src/hand-sort-ui.js).
// "Sort" (the Auto button off): the hand is put in the order the buttons say, once. The cards ease to their new places; cards drawn later are not sorted until it is pressed again.
function sortNow() {
  if (!game) return;
  const sorts = handSort.buttons();
  if (!anySortOn(sorts)) { say('Press Type, Color, Cost or A-Z first, to say how to sort.'); return; }
  const hand = game.zones.hand;
  const sorted = sortHand(hand, sorts, { typeOrder: handSort.typeOrder(), colorOrder: handSort.colorOrder(), landOrder: handSort.landOrder(), info: (card) => lookup?.(card) ?? null });
  if (sorted.every((card, index) => card.uid === hand[index].uid)) { say('The hand is already in that order.'); return; }
  pins.clear();
  apply(() => { let next = game; sorted.forEach((card, index) => { next = reorderHand(next, card.uid, index); }); return next; }, 'Sorted the hand.');
}
const handSort = createHandSort({ onSortNow: sortNow, onChange: () => { if (!anySortOn(handSort.sorts())) keepShownOrder(); pins.clear(); if (game) render(); } }); // (changing the sorts lets the cards moved by hand go back to being sorted)
handSort.mountButtons(handView.bar);
// The menu of the hand (Kevin, 2026-11-15): an arrow next to the hand count, or a right-click on the bar. Mulligan, Shuffle hand into library, Discard X at random, Discard hand (shared/hand-menu.mjs).
function openHandMenu(where) {
  if (!game) return;
  const caret = $('hand-caret');
  caret?.setAttribute('aria-expanded', 'true');
  openCardMenu({ title: 'Your hand', items: handMenuItems(game.zones.hand.length), x: where.x, y: where.y, returnFocus: where.element, toggleOn: caret, avoid: where.avoid ?? null, onPick: pickFromHandMenu, onClose: () => caret?.setAttribute('aria-expanded', 'false') });
}
function pickFromHandMenu(id, amount) {
  handView.clearLift(); // the card under the pointer was lifted: let it go now, the hand is about to change
  if (id === 'mulligan') { doMulligan(); return; }
  const group = moveAllGroupId(id); // "Move all to": the whole hand, like the menu of picked cards (the library lines ask for the order first)
  if (group) { pickFromGroupMenu(group, game.zones.hand.map((card) => card.uid)); return; }
  const action = handAction(id, amount);
  if (!action) return;
  if (id === 'shuffleinto') play('shuffle');
  apply(() => action.run(game), action.message);
}
{
  const handCaret = document.createElement('button');
  handCaret.type = 'button';
  handCaret.className = 'pile-caret hand-caret';
  handCaret.id = 'hand-caret';
  handCaret.setAttribute('aria-haspopup', 'menu');
  handCaret.setAttribute('aria-expanded', 'false');
  handCaret.setAttribute('aria-label', 'Hand options');
  handCaret.title = 'Hand options';
  handCaret.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><path d="M1 3l4 4 4-4z"/></svg>';
  handCaret.addEventListener('click', () => { if (handCaret.getAttribute('aria-expanded') === 'true') { closeCardMenu(); return; } const box = handCaret.getBoundingClientRect(); openHandMenu({ x: box.left, y: box.bottom + 4, element: handCaret, avoid: box }); }); // (the bar is at the bottom of the window: with no room below, the menu opens above it, exactly, and never over the arrow)
  handView.bar.querySelector('.hand-count').after(handCaret);
  handView.bar.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    const fromKeyboard = event.clientX === 0 && event.clientY === 0;
    const box = event.currentTarget.getBoundingClientRect();
    openHandMenu({ x: fromKeyboard ? box.left + box.width / 2 : event.clientX, y: fromKeyboard ? box.top : event.clientY, element: handCaret });
  });
}
handSort.mountOrders($('hand-order-settings'));
mountBoardDrag({ board: () => $('battlefield'), onDrop: dropOnBoard, groupOf: (uid) => (multi.size > 1 && multi.has(uid) ? [...multi] : null), hand: () => $('hand-section'), onDropHand: dropOnHand, onHandOver: (over) => handView.carry(over), onReorderHand: reorderInHand, handZone: () => handView.zone(), handHit: (x, y) => handView.over(x, y), zoneSource, pileAt, onDropPile: dropOnPile, isEnabled: () => Boolean(game) });

$('mulligan').addEventListener('click', doMulligan);
$('new-game').addEventListener('click', async () => { if (await askConfirm({ title: 'Start a new game?', message: 'This one will be lost.', confirmLabel: 'New game', returnFocus: $('new-game') })) { play('shuffle'); deal({ pause: SHUFFLE_PAUSE_MS }); } });
// the life total is the number itself: click, right-click, Shift for 5, hold to set (src/life-control.js)
// (the life sits in your console since the redesign; a - and a + beside the number)
for (const [id, sign] of [['life-minus', -1], ['life-plus', 1]]) $(id).addEventListener('click', (event) => apply(() => adjustLife(game, sign * (event.shiftKey ? 5 : 1)), ''));
mountLifeControl({ button: $('life'), say, onDelta: (delta) => apply(() => adjustLife(game, delta), ''), onSet: (value) => apply(() => adjustLife(game, value - game.life), `Life is ${value}.`) });
for (const zone of ['graveyard', 'exile', 'sideboard']) $(`pile-${zone}`).addEventListener('click', () => togglePile(zone)); // (the library is opened from its menu: View library, Kevin 2026-11-15)
$('retry').addEventListener('click', start);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && (selected || multi.size > 0)) { selected = null; multi.clear(); if (game) render(); } });

start();
