// The table page, where a started match is played at /table/CODE. It shows who is at the table and plays YOUR game: the same
// moves as the solo table (shared/zones.mjs), but every move is also saved to the live database, only the pieces it changed
// (shared/game-sync.mjs): your hand and library in your private branch (nobody else can read it), the rest in your public one.
// A refresh puts you back at the game you left. Other players' boards are shown beside it, live and read-only (their public
// zones only: shared/game-sync.mjs readPublic). All database calls live in ../../src/db.js.
import { rejoinTable, watchMembers, watchMeta, watchPresence, watchServerOffset, watchConnection, startPresence, heartbeat, watchActivity, saveGame, loadGame, watchPublic, concede, endMatch, leaveTable } from '../../src/db.js';
import { startKeepAlive } from '../../src/keep-alive.js';
import { makeSafeStore } from '../../src/safe-store.js';
import { cardBackUrl } from '../../../shared/card-image.mjs';
import { play, mountSoundSettings } from '../../src/sound.js';
import { mountTurnClock } from '../../src/turn-clock.js';
import { mountPileStyle } from '../../src/pile-style.js';
import { mountPileViewer } from '../../src/pile-viewer.js';
import { mountSettingsMenu } from '../../src/settings-menu.js';
import { keybinds } from '../../src/keybinds.js';
import { mountKeybindSettings } from '../../src/keybind-settings.js';
import { mountPileStack } from '../../src/pile-stack.js';
import { mountCommandZone, drawEmblemCounts } from '../../src/command-zone.js';
import { taxAction, COMMANDER_TAX_PUBLISHED } from '../../../shared/commander-zone.mjs';
import { pileMenuItems, pileAction } from '../../../shared/pile-menu.mjs';
import { mountCardHover } from '../../src/card-hover.js';
import { mountBoardDrag } from '../../src/board-drag.js';
import { mountHand } from '../../src/hand-view.js';
import { createSpotlight } from '../../src/spotlight.js';
import { canPing, makePing, newPings, pingSentence } from '../../../shared/ping.mjs';
import { createDealer, SHUFFLE_PAUSE_MS } from '../../../shared/deal-sequence.mjs';
import { loadCardList } from '../../src/card-list.js';
import { makeCardNodes } from '../../src/card-nodes.js';
import { mountMarksPanel } from '../../src/marks-panel.js';
import { openCardMenu, closeCardMenu } from '../../src/card-menu.js';
import { mountFacing } from '../../src/facing.js';
import { loadTokens } from '../../src/token-data.js';
import { openTokenPicker } from '../../src/token-picker.js';
import { mountCounterChips } from '../../src/counter-chips.js';
import { mountLifeControl } from '../../src/life-control.js';
import { mountFloatingBar } from '../../src/floating-bar.js';
import { restHidden, mountHandRestSetting } from '../../src/hand-rest.js';
import { createCounterPanel } from '../../src/counter-panel.js';
import { drawPause } from '../../../shared/draw-pace.mjs';
import { createHandSort } from '../../src/hand-sort-ui.js';
import { sortHand, anySortOn, applyPins } from '../../../shared/hand-sort.mjs';
import { handMenuItems, handAction, moveAllGroupId } from '../../../shared/hand-menu.mjs';
import { handGroupItems, groupAction, needsOrder } from '../../../shared/group-menu.mjs';
import { openOrderWindow } from '../../src/order-window.js';
import { applyScry, topCards } from '../../../shared/scry.mjs';
import { openScryWindow } from '../../src/scry-window.js';
import { flyAway, flyDraw, shuffleAnimation, gatherIntoPile, reducedMotion } from '../../src/card-fly.js';
import { menuItems, menuAction, turnLabel, turnMessage, playBackLabel, PLAY_BACK_ZONES, noUntapLabel, sickLabel, untapMessage } from '../../../shared/card-menu.mjs';
import { marksSentence, markClick, printedOf } from '../../../shared/marks.mjs';
import { currentTurn, passAction, takeBackAction, canTakeBack, turnToStart, whoseWords, turnWords } from '../../../shared/turn-order.mjs';
import { chipEntries, playerMenuItems, playerAction, commanderDamageSeatsFor, counterPanelRows } from '../../../shared/player-counters.mjs';
import { presenceStatus, presenceText, ownConnectionText } from '../../../shared/presence.mjs';
import { tableCodeFromPath } from '../../../shared/lobby-link.mjs';
import { seatDeckText, defaultDeckFor, hasConceded } from '../../../shared/lobby-deck.mjs';
import { LIBRARY_KEY, LEGACY_KEY, readLibrary } from '../../../shared/deck-library.mjs';
import { makeLookup } from '../../../shared/card-lookup.mjs';
import { openCardDetails } from '../../src/card-details.js';
import { makeRulesLoader } from '../../src/card-rules.js';
import { makeRulingsLoader } from '../../src/card-rulings.js';
import { friendlyMessage } from '../../../shared/friendly-error.mjs';
import { setFaceDown, makeGame, draw, moveCard, shuffleLibrary, mulligan, setTapped, turnOver, untapAll, beginTurn, adjustLife, boardCells, settleBoard, isLandCard, placeCard, placeStack, placeGroup, arrangeBoard, zoneCounts, reorderHand, createToken, createEmblem } from '../../../shared/zones.mjs';
import { gameWrites, joinGame, readPublic } from '../../../shared/game-sync.mjs';
import { placeAll, stepFrom } from '../../../shared/board-grid.mjs';

const $ = (id) => document.getElementById(id);
const store = makeSafeStore();
const TABLE_DECK_KEY = 'overloaded.tableDeck'; // { code, id }: the deck brought to that table (the lobby writes it)
const say = (message, isError = false) => { $('status').textContent = message; $('status').classList.toggle('error', isError); };
const formatTime = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const ZONE_WORDS = { library: 'your library', hand: 'your hand', battlefield: 'the battlefield', graveyard: 'your graveyard', exile: 'exile', command: 'the command zone', sideboard: 'your sideboard' };

function make(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

let tableCode = null;
let myUid = null;
let members = {};
let presence = {};
let meta = null;
let host = null;
let serverOffset = null; // until the database's clock is known, no one is judged disconnected

// ---- who is at the table ----
function renderMatchState() {
  if (meta === null) { $('match-state').textContent = ''; return; }
  $('match-state').textContent = meta.status === 'playing'
    ? 'The match is on.'
    : 'The match has not started, or the host ended it. Go back to the lobby to get ready.';
}

function renderPlayers() {
  const list = $('players');
  list.replaceChildren();
  const now = serverOffset === null ? null : Date.now() + serverOffset;
  // Names and commanders come from other people's browsers, so they are put in as text, never as markup.
  for (const [uid, member] of Object.entries(members).sort((a, b) => Number(a[1].seat) - Number(b[1].seat))) {
    const item = document.createElement('li');
    const deckText = seatDeckText(member);
    item.textContent = `Seat ${member.seat}: ${member.name}${uid === host ? ' (host)' : ''}${deckText ? `, ${deckText}` : ''}${hasConceded(member, meta) ? ' (conceded)' : ''}`;
    item.dataset.uid = uid;
    const words = presenceText(presenceStatus(presence[uid], now));
    if (words) {
      const note = document.createElement('span');
      note.className = 'presence';
      note.textContent = words;
      item.append(' ', note);
    }
    list.append(item);
  }
  // The match buttons: only while the match is on; only the host can end it; a concession cannot be taken back.
  $('match-actions').hidden = meta?.status !== 'playing' || myUid === null;
  $('end-match').hidden = host !== myUid;
  $('concede').disabled = hasConceded(members[myUid], meta);
}

// ---- your game ----
// The card list (what the table knows of a card's type) is loaded once and shared by your game and the other players' boards.
let lookupLoad = null;
function lookupReady() {
  lookupLoad ??= loadCardList().then((cards) => makeLookup(cards)).catch((error) => { lookupLoad = null; throw error; });
  return lookupLoad;
}
const rulingsLoader = makeRulingsLoader();
const rulesLoader = makeRulesLoader();
let lookup = null;
let game = null; // your game as you see it now
let lastSaved = null; // the game as the database has it (null: nothing saved for this match yet)
let begun = false; // the game is being set up or is on
let saving = Promise.resolve();
let selected = null; // the uid of the selected card
let modifyOpen = false; // the counters and power/toughness panel is shown (from Modify, in the card menu or the selected-card buttons)
let viewing = null; // the pile being looked at: 'library', 'graveyard', 'exile' or 'sideboard'
let viewBottom = false; // the cards shown are the bottom few of the library, not the top
let viewTop = null; // when only the top few cards of the library are being looked at: how many
let viewReveal = false; // the cards in the viewer are the top cards of the library being revealed (Reveal top X): the window says so (only you see them: a reveal to the table is not built)
let multiZone = null; // the zone the picked cards are in ('battlefield' for a rectangle, 'hand' for Shift and a click), as on the solo table
const multi = new Set(); // the uids of the picked cards (E, Q and F act on all of them; a right-click on picked hand cards opens the group menu; dragging one carries all)
const peeking = new Set(); // uids of two-sided cards in the hand shown on their back face (only a look, for you: nothing changes in the game)
let topRevealed = false; // "Play with top revealed": the top card of your library is shown face up on YOUR pile (only for you: the others see a library, not its top card)
const commandSlots = new Map(); // uid -> 1 or 2: the command slot a commander was dragged into (not saved)
// What a player has on them (src/counter-chips.js, shared/player-counters.mjs): chips next to the life total, and a right-click on the life area adds or removes any counter the database accepts, and commander damage from each seat that has a commander.
const lifeChips = mountCounterChips($('life-chips'));
const damageSeats = () => commanderDamageSeatsFor(members, game?.cd, meta?.format);
const seatNames = () => Object.fromEntries(damageSeats().map(({ seat, name }) => [seat, name]));
$('life-area').addEventListener('contextmenu', (event) => {
  if (!game) return;
  event.preventDefault();
  const box = event.currentTarget.getBoundingClientRect();
  const fromKeyboard = event.clientX === 0 && event.clientY === 0;
  openCardMenu({ title: 'Your counters', items: playerMenuItems(game, { live: true, seats: damageSeats() }), x: fromKeyboard ? box.left + box.width / 2 : event.clientX, y: fromKeyboard ? box.top + box.height / 2 : event.clientY, returnFocus: event.currentTarget, onPick: (id) => { if (!game) return; const action = playerAction(id, game, { live: true, names: seatNames() }); if (action) apply(() => action.run(game), action.message); } });
});

// The arrow under the life total opens the counters panel (src/counter-panel.js): commander damage from each seat's commander, then poison and the other counters, each with a minus and a plus.
const counterPanel = createCounterPanel({
  anchor: $('life-counters'),
  groups: () => (game ? counterPanelRows(game, { live: true, seats: damageSeats(), me: myUid }) : []),
  onStep: (id, delta) => { if (!game) return; const action = playerAction(`${id}:${delta < 0 ? '-' : '+'}${Math.abs(delta)}`, game, { live: true, names: seatNames() }); if (action) apply(() => action.run(game), action.message); },
});
for (const [id, sign] of [['life-minus', -1], ['life-plus', 1]]) $(id).addEventListener('click', (event) => { if (game) apply(() => adjustLife(game, sign * (event.shiftKey ? 5 : 1)), ''); });

const cardNodes = makeCardNodes({ onSelect: (uid, event) => select(uid, event), isSelected: (uid) => uid === selected || multi.has(uid), onMark: (uid, hit) => markOnCard(uid, hit), onMenu: (uid, where) => openMenuFor(uid, where), onBadge: (uid, kind) => clearBadge(uid, kind), printedStats: (card) => printedOf(card, lookup) });
const place = cardNodes.place;
// The piles as stacks of cards (src/pile-stack.js) and the command zone with its two outlined slots and the commander tax (src/command-zone.js).
const stacks = Object.fromEntries([['library', 'Library'], ['graveyard', 'Graveyard'], ['exile', 'Exile']].map(([zone, label]) => [zone, mountPileStack($(`pile-${zone}`), { zone, label })]));
const commandZone = mountCommandZone({ root: $('command'), place, showTax: COMMANDER_TAX_PUBLISHED, onTax: (uid, delta) => { if (!game) return; const action = taxAction(game, uid, delta); if (action) apply(() => action.run(game), action.message); } });

// The hand is shown one card at a time with the draw sound for each (shared/deal-sequence.mjs). Only what is SHOWN is staged: the game was dealt all at once, so
// what is saved and what other players see never waits for the animation. A refresh in the middle just shows the whole hand.
const dealer = createDealer({
  onChange() {
    if (!game) return;
    const newest = dealer.dealt();
    const dealtCard = newest ? dealer.visible(game.zones.hand)[newest - 1] : null; // (found by its uid: the hand may be shown sorted)
    render();
    if (dealtCard) flyDrawn(dealtCard.uid); // the card comes out of the library and turns face up as it lands (src/card-fly.js), as on the solo table
  },
  onCard: () => play('draw'),
  reducedMotion: () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
});

// A card just put in the hand (a draw, a deal) flies out of the library and turns face up on the way; the real card is hidden until it lands.
function flyDrawn(uid) {
  const node = [...$('hand').children].find((child) => child.dataset.uid === uid);
  if (node) flyDraw(node, $('pile-library'), cardBackUrl('small'));
}

// The hand as it is shown: the cards dealt so far, in the order of the sorts that are on (a view: the hand's own order is not changed, shared/hand-sort.mjs), as on the solo table.
// A card moved by hand in a sorted hand is pinned where it was put until the sorts are changed.
const pins = new Map();
let shownSorted = null; // the cards of the hand as they were last shown while a sort was on (null when none was): turning the sort off keeps that order
function shownHand() {
  let cards = dealer.visible(game.zones.hand);
  for (const uid of [...peeking]) if (!game.zones.hand.some((card) => card.uid === uid)) peeking.delete(uid);
  if (peeking.size) cards = cards.map((card) => (peeking.has(card.uid) && card.b === 1 ? { ...card, turned: true } : card));
  const sorts = handSort.sorts();
  if (!anySortOn(sorts)) { shownSorted = null; return cards; }
  for (const uid of [...pins.keys()]) if (!cards.some((card) => card.uid === uid)) pins.delete(uid);
  const shown = applyPins(sortHand(cards, sorts, { typeOrder: handSort.typeOrder(), colorOrder: handSort.colorOrder(), landOrder: handSort.landOrder(), info: (card) => lookup?.(card) ?? null }), pins);
  shownSorted = shown.map((card) => card.uid);
  return shown;
}
// The sort has been turned off: the hand keeps the order it was shown in (saved, like any change of the hand's order).
function keepShownOrder() {
  if (!game || !shownSorted || shownSorted.length !== game.zones.hand.length) return;
  let next = game;
  shownSorted.forEach((uid, index) => { if (next.zones.hand.some((card) => card.uid === uid)) next = reorderHand(next, uid, index); });
  game = next;
  sync();
  say('The hand stays in the order it was sorted in.');
}

function showBlocked(message, { link = true, retry = false } = {}) {
  $('game').hidden = true;
  document.body.classList.remove('playing', 'seats');
  dockPlayers(false);
  clearCorner();
  $('blocked').hidden = false;
  $('blocked-message').textContent = message;
  $('blocked-link').hidden = !link;
  $('retry').hidden = !retry;
}

function findCard(uid) {
  for (const zone of Object.keys(game.zones)) {
    const card = game.zones[zone].find((c) => c.uid === uid);
    if (card) return { card, zone };
  }
  return null;
}

function renderCounters() {
  if (!game) return;
  lifeChips.update(chipEntries(game.pc, game.cd, commanderDamageSeatsFor(members, game.cd, meta?.format)));
  if (counterPanel.isOpen()) counterPanel.update();
}

function render() {
  if (multi.size > 0 && [...multi].some((each) => findCard(each)?.zone !== multiZone)) multi.clear(); // (a picked card has left the zone it was picked in: the group is over)
  renderTurn();
  renderCounters();
  $('life').textContent = String(game.life);
  place($('battlefield'), game.zones.battlefield, { battlefield: true, cells: boardCells(game), sharp: true });
  place($('hand'), shownHand());
  handView.arrange();
  commandZone.update(game, { slotOf: (uid) => commandSlots.get(uid) ?? null });
  for (const picture of $('command').querySelectorAll('.card .face img')) { // the command zone cards are larger than a battlefield card: the normal size, so they stay sharp
    if (picture.dataset.sharp !== '1' && (picture.getAttribute('src') ?? '').includes('/small/')) { picture.dataset.sharp = '1'; picture.src = picture.getAttribute('src').replace('/small/', '/normal/'); }
  }
  $('hand-count').textContent = String(dealer.visible(game.zones.hand).length);
  $('hand').classList.toggle('is-empty', game.zones.hand.length === 0);
  const counts = zoneCounts(game);
  for (const zone of ['library', 'graveyard', 'exile']) {
    stacks[zone].update({ count: counts[zone] + (zone === 'library' ? dealer.waiting(game.zones.hand) : 0), top: zone === 'library' ? (topRevealed ? game.zones.library[0] ?? null : null) : game.zones[zone][0] ?? null, reveal: zone === 'library' && topRevealed }); // cards not yet dealt still count as library; the top of the graveyard and exile is the newest card
  }
  $('pile-sideboard').textContent = `Sideboard: ${counts.sideboard}`;
  for (const zone of ['library', 'graveyard', 'exile', 'sideboard']) $(`pile-${zone}`).setAttribute('aria-pressed', String(viewing === zone));
  $('mulligan').textContent = game.mulligans ? `Mulligan (${game.mulligans} so far)` : 'Mulligan';
  renderViewer();
  renderSelected();
  if (document.body.dataset.view === 'sidebar') layoutSeats(); // (your life in the column)
}

function renderViewer() {
  for (const tab of document.querySelectorAll('#viewer .viewer-tab')) tab.setAttribute('aria-pressed', String(tab.dataset.view === (viewingOther?.zone ?? viewing)));
  $('viewer-tabs').hidden = !((viewingOther?.zone ?? viewing) === 'graveyard' || (viewingOther?.zone ?? viewing) === 'exile'); // (the graveyard and exile windows switch between each other)
  if (viewingOther) {
    const panel = opponents.get(viewingOther.uid);
    if (!panel?.view) { viewingOther = null; viewer.hide(); return; } // (they left, or their game is gone)
    const cards = panel.view.zones[viewingOther.zone];
    viewer.show({ label: `${viewingOther.zone === 'graveyard' ? 'Graveyard' : 'Exile'} of ${panel.name}`, cards, total: cards.length, noteText: viewingOther.zone === 'graveyard' ? 'The newest card is first.' : '' });
    return;
  }
  if (!viewing) { viewer.hide(); return; }
  const all = game.zones[viewing];
  const cards = viewTop ? (viewBottom ? all.slice(Math.max(0, all.length - viewTop)) : all.slice(0, viewTop)) : all;
  const label = viewReveal && viewing === 'library' ? 'Revealed' : `${ZONE_WORDS[viewing][0].toUpperCase()}${ZONE_WORDS[viewing].slice(1)}`;
  viewer.show({
    label,
    cards,
    depth: viewing === 'library',
    total: all.length,
    from: viewBottom ? 'bottom' : 'top',
    offset: viewBottom ? all.length - cards.length : 0,
    noteText: viewing === 'library' ? 'The top card is first. Right-click a card to move it; right-click the library itself to shuffle, draw or mill.' : viewing === 'graveyard' ? 'The newest card is first. Right-click a card to move it.' : 'Right-click a card to move it.',
  });
}

// While a game shows, the list of players sits in the right column under the action buttons; otherwise it is in the page where it was (before the other players' panels).
// The line of news (the topbar) sits in the head of your own area while you play, and at the top of the page otherwise.
function dockPlayers(on) {
  const section = $('players-section');
  const topbar = document.querySelector('.topbar');
  if (on) { $('players-slot').append(section); $('topbar-slot').append(topbar); }
  else { $('blocked').before(section); section.before(topbar); }
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
  // The corner shows the selected card (a ping in it is left alone while the same card stays selected: a new selection replaces it).
  if (selected !== cornerUid || cornerMode === 'selected') showInCorner(card, marks, selected);
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

// ---- saving: only what a move changed, one move after another ----
function saveState(message, isError = false) {
  $('save-state').textContent = message;
  $('save-state').classList.toggle('error', isError);
}

// Sends the pieces of your game that differ from what the database has. Saves go one after another, each one sends the newest
// game, and a failed save is simply tried again with the next move (the difference is always taken against what is saved).
function sync() {
  saving = saving.then(async () => {
    const target = game;
    if (!target || target === lastSaved) return;
    saveState('Saving...');
    try {
      const writes = gameWrites(myUid, lastSaved, target);
      if (lastSaved === null) writes[`public/${myUid}/match`] = meta.match; // which match this game belongs to
      await saveGame(tableCode, writes);
      lastSaved = target;
      if (game === target) saveState('Saved.');
    } catch (error) {
      saveState(`Your last move could not be saved (${friendlyMessage(error)}). It will be sent with your next move.`, true);
    }
  });
}

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
  sync();
  return made;
}

// Shift and a click on a card of the hand adds it to the picked cards or takes it out again; a right-click on a picked card then acts on all of them (openGroupMenu). A click without Shift picks just that card.
// The picked cards of the battlefield (a rectangle) and of the hand are never mixed. (As on the solo table.)
const inHand = (uid) => game.zones.hand.some((card) => card.uid === uid);
function select(uid, event = null) {
  if (!game) return;
  if (event?.shiftKey && inHand(uid)) {
    if ([...multi].some((each) => !inHand(each))) multi.clear();
    multiZone = 'hand';
    if (multi.size === 0 && selected && selected !== uid && inHand(selected)) multi.add(selected);
    if (multi.has(uid)) multi.delete(uid); else multi.add(uid);
    if (multi.size <= 1) { selected = multi.size === 1 ? [...multi][0] : null; multi.clear(); say(''); } else { selected = multi.has(uid) ? uid : [...multi].at(-1); say(`${multi.size} cards picked. Right-click one for all of them.`); }
    modifyOpen = false;
    render();
    return;
  }
  if (uid !== selected) modifyOpen = false;
  if (!multi.has(uid) || inHand(uid)) multi.clear();
  selected = uid;
  render();
}

// The right-click menu of one of your cards (src/card-menu.js, shared/card-menu.mjs). It selects the card too, so the buttons above show it.
function openMenuFor(uid, where) {
  if (!game) return;
  const found = findCard(uid);
  if (!found) return;
  if (found.zone === 'hand' && multi.size > 1 && multi.has(uid)) { openGroupMenu(where); return; } // (several cards of the hand picked: the menu is for all of them)
  select(uid);
  openCardMenu({ title: found.card.n, items: menuItems(found.card, found.zone, { live: true, details: true, peek: true }), x: where.x, y: where.y, returnFocus: where.element, onPick: (id, amount) => pickFromMenu(uid, id, amount) });
}

// The menu of the picked cards of the hand (shared/group-menu.mjs): Play, Discard, Exile, Top and Bottom of library (each asks for the order first) and Move to. The cards go in the order they have in the hand.
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
  if (!game) return;
  const found = findCard(uid);
  if (!found) return;
  if (id === 'peek') { // a look at the other face of a two-sided card in the hand (only for you)
    if (found.zone !== 'hand' || found.card.b !== 1) return;
    if (peeking.has(uid)) peeking.delete(uid); else peeking.add(uid);
    render();
    say(peeking.has(uid) ? `Showing the back of ${found.card.n}.` : `Showing the front of ${found.card.n}.`);
    return;
  }
  if (id === 'modify') { modifyOpen = true; render(); $('marks-amount').focus(); return; }
  if (id === 'ping') { sendPing(found.card, found.zone); return; }
  if (id === 'details') { openCardDetails({ card: found.card, info: lookup?.(found.card) ?? null, loader: rulesLoader, rulingsLoader, returnFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null }); return; }
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
  if (!game) return;
  const found = findCard(uid);
  if (!found || found.zone !== 'battlefield') return;
  const action = menuAction(kind === 'sick' ? 'sick' : 'nountap', found.card);
  if (action) apply(() => action.run(game), action.message);
}

// A click on a chip or on the change label of one of your cards on the battlefield (see src/card-nodes.js and shared/marks.mjs).
// Returns false when nothing changed (the card or the click was refused), so the card shows its floating text only for real changes.
function markOnCard(uid, hit) {
  if (!game) return false;
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

function drawOne() {
  const result = draw(game, 1);
  game = result.game;
  if (!result.short) play('draw');
  say(result.short ? 'Your library is empty.' : `Drew ${game.zones.hand.find((c) => c.uid === result.drawn[0]).n}.`, result.short);
  render();
  sync();
  if (!result.short) flyDrawn(result.drawn[0]);
}

// Draw X from the library menu: one card after another, each flying out of the library (a small pause between them, shorter every 5 cards after the first 10; under reduced motion at once). Each card is saved as it comes.
let drawing = false;
async function drawCards(n) {
  if (n <= 1) { drawOne(); return; }
  if (drawing || !game) return;
  drawing = true;
  try {
    let drawn = 0;
    for (let i = 0; i < n; i++) {
      if (!game) break;
      const result = draw(game, 1);
      if (result.short) break;
      game = result.game;
      drawn++;
      play('draw');
      render();
      sync();
      flyDrawn(result.drawn[0]);
      if (i < n - 1 && !reducedMotion()) await new Promise((resolve) => setTimeout(resolve, drawPause(i + 1)));
    }
    say(drawn === 0 ? 'Your library is empty.' : drawn < n ? `Drew ${drawn} cards: your library ran out.` : `Drew ${drawn} cards.`, drawn < n);
  } finally { drawing = false; }
}

// ---- whose turn it is (shared/turn-order.mjs) ----
// Passing the turn writes one small record on YOUR branch (a player can only write their own); every page reads everyone's branch, the newest
// record is the turn, and the player it names starts it here: untap (cards marked "doesn't untap" stay tapped), draw, summoning sickness ends.
// My own record comes from my own game, which is always current, not from the round trip through the database.
function currentTurnInfo() {
  const byUid = {};
  for (const [uid, branch] of Object.entries(publicAll)) if (branch?.match === meta?.match) byUid[uid] = branch;
  if (game && myUid) {
    const echoed = publicAll[myUid]?.pass;
    byUid[myUid] = { pass: game.pass && echoed && echoed.n === game.pass.n && echoed.to === game.pass.to && game.pass.at === undefined ? { ...game.pass, at: echoed.at } : game.pass }; // (the database time of my pass, once it has come back)
  }
  return currentTurn(byUid, members);
}
const conceded = (uid) => hasConceded(members[uid], meta);
const baseTitle = document.title;
let turnNote = ''; // what starting my turn did, for the banner
let lastStartTried = null; // the turn my page last tried to start, so a refused start is not tried again in a loop
let lastStartMatch = null; // the match that number belongs to: a new match starts the memory afresh
const capital = (text) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

function renderTurn() {
  if (!game) return;
  if (lastStartMatch !== (meta?.match ?? null)) { lastStartMatch = meta?.match ?? null; lastStartTried = null; }
  const info = currentTurnInfo();
  const mine = Boolean(myUid) && info.uid === myUid;
  const wanted = turnToStart(info, members[myUid]?.seat, game);
  // A player who has conceded does not start turns (a pass can only name them if they conceded after it was written).
  if (wanted !== null && wanted !== lastStartTried && !conceded(myUid)) { lastStartTried = wanted; startMyTurn(wanted); return; } // apply() draws the page again
  $('turn').textContent = String(info.turn);
  $('turn-whose').textContent = capital(whoseWords(info, myUid));
  const pass = $('pass-turn');
  pass.textContent = mine ? 'Pass turn' : `Skip ${whoseWords(info, myUid).replace(/ \(no one is there\)$/, '')}`;
  pass.classList.toggle('secondary', !mine);
  pass.hidden = meta?.status !== 'playing';
  $('take-back').hidden = !canTakeBack(info, myUid);
  turnClock.update({ key: `${meta?.match ?? 0}:${info.turn}`, at: info.last?.at ?? null });
  const banner = $('turn-banner');
  banner.hidden = false; // always during a match: whose turn it is, and louder when it is yours
  banner.classList.toggle('mine', mine);
  banner.textContent = mine ? `It is your turn (turn ${info.turn}).${turnNote ? ` ${turnNote}` : ''}` : turnWords(info, myUid);
  if (!mine) turnNote = '';
  document.title = mine ? `Your turn - ${baseTitle}` : baseTitle;
}

// Your turn begins: the turn number is set and summoning sickness ends. Drawing and untapping are NOT done for you (some turns have
// exceptions, Kevin 2026-11-06): the Draw and Untap all buttons are there when you are ready.
function startMyTurn(turn) {
  turnNote = 'Summoning sickness ended. Draw and untap when you are ready.';
  if (apply(() => beginTurn(game, turn), `Your turn (turn ${turn}). ${turnNote}`)) play('yourturn'); // may be blocked by the browser until the page has been clicked once: then it is silent
}

let mulliganing = false; // the animation is running: another click waits
async function doMulligan() {
  if (mulliganing || !game) return;
  handView.clearLift();
  mulliganing = true;
  const nodes = [...$('hand').children].filter((child) => child.classList.contains('card'));
  if (nodes.length && !reducedMotion()) { // the hand gathers, goes into the library and the library is shuffled, then the new hand comes out of it (as on the solo table)
    $('hand').style.visibility = 'hidden';
    try { await gatherIntoPile(nodes, $('hand').getBoundingClientRect(), $('pile-library'), cardBackUrl('small')); play('shuffle'); await shuffleAnimation($('pile-library'), cardBackUrl('small')); } finally { $('hand').style.visibility = ''; }
  } else play('shuffle');
  mulliganing = false;
  if (!game) return;
  try { game = mulligan(game); } catch (error) { say(error.message, true); render(); return; }
  dealer.start(game.zones.hand.length, { pause: reducedMotion() ? SHUFFLE_PAUSE_MS : 0 }); // then the new hand one card at a time (the game is saved at once)
  sync();
  say(`Mulligan ${game.mulligans}: a new hand of ${plural(game.zones.hand.length, 'card', 'cards')}. Put ${plural(game.mulligans, 'card', 'cards')} on the bottom of your library with the card buttons.`);
}

// ---- starting: put back the game saved for this match, or deal a new one ----
// The deck brought to this table: the one the lobby remembered for it, else the first deck of the table's format.
function deckForThisTable() {
  const library = readLibrary(store.get(LIBRARY_KEY), store.get(LEGACY_KEY)).library;
  try {
    const remembered = JSON.parse(store.get(TABLE_DECK_KEY) ?? 'null');
    const entry = remembered && remembered.code === tableCode ? library.decks.find((d) => d.id === remembered.id && d.format === meta.format) : null;
    if (entry) return entry.deck;
  } catch { /* an unreadable note: fall through to the default */ }
  return defaultDeckFor(library, meta.format)?.deck ?? null;
}

async function beginGame() {
  begun = true;
  $('blocked').hidden = true;
  try {
    lookup = await lookupReady();
  } catch {
    begun = false;
    showBlocked('The card list could not be loaded, so the table cannot tell lands from other cards. Check your connection and try again.', { link: false, retry: true });
    return;
  }
  let stored;
  let fresh = false;
  try {
    stored = await loadGame(tableCode);
  } catch (error) {
    begun = false;
    showBlocked(`Your game could not be loaded (${friendlyMessage(error)}). Try again.`, { link: false, retry: true });
    return;
  }
  const matchNow = meta.match;
  if (stored.public && stored.public.match === matchNow) {
    game = joinGame(stored.public, stored.private, lookup);
    lastSaved = game;
    game = settleBoard(game); // an older game has no cells: every card gets one (what changed is saved by the sync below)
    $('deck-line').textContent = 'Your game from before is back.';
    say('Back at your game.');
  } else {
    const deck = deckForThisTable();
    if (!deck) {
      begun = false;
      showBlocked(`You have no saved ${meta.format === 'standard' ? 'Standard' : 'Commander'} deck in this browser, so there is nothing to deal. Import one, then come back to this table.`, { retry: true });
      return;
    }
    game = makeGame(deck, lookup);
    fresh = true;
    lastSaved = null; // nothing is saved for this match yet: the first save writes everything and clears an older match's cards
    $('deck-line').textContent = `${deck.name}: ${plural(deck.cards.reduce((sum, c) => sum + c.qty, 0), 'card', 'cards')}. Your hand is dealt.`;
    say(`Dealt ${plural(game.zones.hand.length, 'card', 'cards')}. Life is ${game.life}.`);
  }
  selected = null;
  viewing = null;
  cardNodes.clear();
  $('game').hidden = false;
  document.body.classList.add('playing', 'seats'); // the Seats table: every player's area looks like the solo table (src/style.css)
  dockPlayers(true);
  renderMyHead();
  layoutSeats();
  clearCorner();
  if (fresh) dealer.start(game.zones.hand.length); // a new hand is dealt one card at a time; a game put back after a refresh shows whole
  else render();
  sync();
}

// Called whenever the table's status may have changed: the game is dealt once the match is on, and hidden when it is not.
function checkStart() {
  if (!meta) return;
  if (meta.status === 'playing') { if (!begun) beginGame(); return; }
  begun = false;
  game = null;
  $('game').hidden = true;
  document.body.classList.remove('playing', 'seats');
  dockPlayers(false);
  clearCorner();
  $('blocked').hidden = true;
  // The match is over (the host ended it): everyone goes back to the lobby to get ready for the next one.
  if (meta.status === 'lobby') location.assign(`/lobby/${tableCode}`);
}

// ---- other players' boards ----
// Each other player's PUBLIC branch, drawn read-only: life, how many cards they hold, battlefield, command zone, graveyard and exile.
// Their hand and library are not here to draw: only their counts are stored in the public branch, and the private branch is not readable.
// Everything comes through readPublic, which drops anything that is not exactly a card (another player's browser wrote it).
let publicAll = {}; // uid -> what that player's public branch holds now
const opponents = new Map(); // uid -> the panel for that player, kept so card pictures are not loaded again

// Another player's library, graveyard and exile, drawn as stacks like your own (src/pile-stack.js): the library shows its back and its count, the graveyard and the exile their top card. A click on the
// graveyard or the exile opens it in the pile window, read-only. Only your own piles take a dropped card (pileAt looks only in #piles-section).
function otherPile(uid, zone, label) {
  const button = make('button', 'opp-pile');
  button.type = 'button';
  const stack = mountPileStack(button, { zone, label });
  if (zone === 'library') button.disabled = true; // (nobody may look at it)
  else button.addEventListener('click', () => openOtherPile(uid, zone));
  return { button, stack };
}

function opponentPanel(uid) {
  let panel = opponents.get(uid);
  if (panel) return panel;
  const section = make('section', 'opponent');
  section.dataset.uid = uid;
  const board = make('div', 'battlefield');
  const command = make('div', 'row opp-command'); command.dataset.empty = 'Empty.';
  const piles = { library: otherPile(uid, 'library', 'Library'), graveyard: otherPile(uid, 'graveyard', 'Graveyard'), exile: otherPile(uid, 'exile', 'Exile') };
  section.className = 'opponent seat-area';
  panel = { section, title: make('h3', 'seat-name'), life: make('strong', 'opp-life'), stats: make('p', 'hint opp-stats'), waiting: make('p', 'hint opp-waiting', 'Has not been dealt a game yet.'), body: make('div', 'opp-body'), board, command, piles, backs: make('div', 'opp-backs'), handPill: make('span', 'hand-pill opp-hand-pill'), view: null, nodes: makeCardNodes({ readOnly: true, printedStats: (card) => printedOf(card, lookup) }) };
  // Another player's counters and the commander damage they have taken: the same nodes as yours, read-only, shown only once something has happened.
  const countersBox = make('div', 'opponent-counters counter-chips'); countersBox.setAttribute('role', 'group'); countersBox.setAttribute('aria-label', 'Counters and commander damage'); countersBox.hidden = true;
  panel.countersBox = countersBox;
  panel.counterList = mountCounterChips(countersBox);
  // The area is laid out like your own (the solo table's look): life at the top left and the name at the top in the middle, their battlefield (wrapped so the style sheet can turn it to face you),
  // their hand as a fan of card backs along the bottom with its count, and their piles and command zone at the bottom right. Their stats line is for a screen reader.
  const field = make('div', 'opp-field'); field.append(board);
  const commandBox = make('div', 'opp-command-zone'); commandBox.append(command, make('span', 'opp-zone-label', 'CMD'));
  const zones = make('div', 'opp-zones'); zones.append(piles.library.button, piles.graveyard.button, piles.exile.button, commandBox);
  const hand = make('div', 'opp-hand'); hand.setAttribute('aria-hidden', 'true'); hand.append(panel.backs);
  panel.body.append(field, hand, panel.handPill, zones);
  panel.life.title = 'Life';
  const lifeBox = make('div', 'opp-life-box'); lifeBox.append(panel.life, countersBox);
  const head = make('div', 'seat-head opp-info'); head.append(lifeBox, panel.title);
  section.append(head, panel.stats, panel.waiting, panel.body);
  opponents.set(uid, panel);
  return panel;
}

// Their hand: as many card backs as they hold (at most 12 drawn; the count says the rest), in a fan. Only the number is known: the cards themselves are in their private branch.
const MAX_BACKS = 12;
function drawBacks(panel, count) {
  const shown = Math.min(count, MAX_BACKS);
  while (panel.backs.children.length > shown) panel.backs.lastElementChild.remove();
  while (panel.backs.children.length < shown) panel.backs.append(make('span', 'opp-back'));
  [...panel.backs.children].forEach((back, index) => { back.style.setProperty('--i', String(index - (shown - 1) / 2)); });
  panel.backs.style.setProperty('--n', String(shown));
  panel.handPill.textContent = `Hand ${count}`;
}

async function renderOpponents() {
  const on = meta?.status === 'playing' && myUid !== null;
  $('opponents').hidden = !on;
  if (!on) return;
  let known;
  try { known = await lookupReady(); } catch { known = () => null; } // without the list every permanent shows in the "other" row
  lookup ??= known; // the same list answers for your own cards and the printed numbers on theirs
  const others = Object.entries(members).filter(([uid]) => uid !== myUid).sort((a, b) => Number(a[1].seat) - Number(b[1].seat));
  document.querySelector('main').dataset.opponents = String(Math.min(others.length, 3)); // how the boards are placed on the one-screen layout
  $('opponents').style.setProperty('--opp-n', String(Math.max(1, Math.min(others.length, 3)))); // (the Seats table: one area per other player, side by side)
  document.body.dataset.seats = String(Math.min(others.length, 3) + 1); // 2, 3 or 4: the layout of the Seats table
  const panels = [];
  const turnNow = game !== null ? currentTurnInfo() : null; // worked out once for all the panels, not once per player
  for (const [uid, member] of others) {
    const panel = opponentPanel(uid);
    panel.title.textContent = `Seat ${member.seat}: ${member.name}`; // names are other people's text: put in as text, never as markup
    const theirTurn = turnNow !== null && turnNow.uid === uid;
    panel.section.classList.toggle('active', theirTurn);
    if (theirTurn) panel.title.append(make('span', 'turn-mark', 'their turn'));
    // A public branch left over from an earlier match does not count: this match's game is the one with this match's number.
    const view = publicAll[uid]?.match === meta.match ? readPublic(publicAll[uid], known) : null;
    panel.view = view;
    panel.name = member.name;
    panel.waiting.hidden = view !== null;
    panel.body.hidden = view === null;
    panel.stats.hidden = view === null;
    panel.life.hidden = view === null;
    if (!view) panel.countersBox.hidden = true;
    if (view) {
      panel.countersBox.hidden = !panel.counterList.update(chipEntries(view.pc, view.cd, commanderDamageSeatsFor(members, view.cd, meta?.format)));
      panel.life.textContent = String(view.life);
      panel.life.setAttribute('aria-label', `Life ${view.life}`);
      panel.stats.textContent = `Hand ${view.counts.hand} · Library ${view.counts.library}`;
      panel.section.dataset.life = String(view.life);
      panel.nodes.place(panel.board, view.zones.battlefield, { battlefield: true, cells: placeAll(view.zones.battlefield, isLandCard) }); // their battlefield on the same grid, each card on the cell they stored
      panel.nodes.place(panel.command, view.zones.command);
      drawEmblemCounts(panel.command, view.zones.command); // (an emblem with a count shows it on the other players' panels too)
      panel.piles.library.stack.update({ count: view.counts.library });
      for (const zone of ['graveyard', 'exile']) panel.piles[zone].stack.update({ count: view.zones[zone].length, top: view.zones[zone][0] ?? null });
      drawBacks(panel, view.counts.hand);
    }
    if (viewingOther?.uid === uid) renderViewer(); // their pile is open in the window: show it as it is now
    panels.push(panel.section);
  }
  for (const [uid, panel] of opponents) if (!others.some(([other]) => other === uid)) { opponents.delete(uid); panel.section.remove(); slots.get(uid)?.slot.remove(); slots.delete(uid); }
  renderMyHead(turnNow);
  layoutSeats();
}

// ---- where the areas are: Grid view (every area at once) or Sidebar view (one large, the others small in a column on the right) ----
// The areas are the same elements in both views; Sidebar view moves the ones that are not shown large into the column, where each is drawn at the size of the large one and shrunk (a scale), so it
// looks exactly like a small copy and nothing is laid out twice. Your hand stays yours: when another player is shown large, it moves out of your area and stays along the bottom of the window.
const VIEW_KEY = 'overloaded.seatsView';
let seatsView = store.get(VIEW_KEY) === 'sidebar' ? 'sidebar' : 'grid';
let focusUid = null; // in Sidebar view, the player shown large (null: you)
const slots = new Map(); // uid -> { slot, head, name, life, body } in the sidebar column

// The other players in turn order after you (clockwise from your seat): the first is the one who plays after you.
function othersInOrder() {
  const mine = Number(members[myUid]?.seat ?? 1);
  return [...opponents.keys()].sort((a, b) => ((Number(members[a]?.seat ?? 0) - mine + 8) % 4) - ((Number(members[b]?.seat ?? 0) - mine + 8) % 4));
}
function mySeatTitle() { const me = members[myUid]; return me ? `Seat ${me.seat}: ${me.name} (You)` : 'You'; }
function renderMyHead(turnNow = game !== null ? currentTurnInfo() : null) {
  $('my-name').textContent = mySeatTitle();
  $('seat-me').classList.toggle('active', turnNow !== null && turnNow.uid === myUid);
}
function slotFor(uid) {
  let entry = slots.get(uid);
  if (entry) return entry;
  const slot = make('div', 'seat-slot');
  slot.dataset.uid = uid;
  const head = make('button', 'slot-head');
  head.type = 'button';
  const name = make('span', 'slot-name');
  const life = make('span', 'slot-life');
  head.append(name, life);
  const body = make('div', 'slot-body');
  body.addEventListener('click', () => focusSeat(uid));
  head.addEventListener('click', () => focusSeat(uid));
  slot.append(head, body);
  entry = { slot, head, name, life, body };
  slots.set(uid, entry);
  return entry;
}
function focusSeat(uid) {
  focusUid = uid === myUid ? null : uid;
  layoutSeats();
}
function setView(next) {
  seatsView = next;
  store.set(VIEW_KEY, next);
  layoutSeats();
}
$('view-toggle').addEventListener('click', () => setView(seatsView === 'grid' ? 'sidebar' : 'grid'));

function layoutSeats() {
  const others = othersInOrder();
  others.forEach((uid, index) => { opponents.get(uid).section.dataset.slot = `o${index + 1}`; });
  const sidebar = seatsView === 'sidebar' && game !== null;
  document.body.dataset.view = sidebar ? 'sidebar' : 'grid';
  const toggle = $('view-toggle');
  toggle.setAttribute('aria-pressed', String(sidebar));
  toggle.setAttribute('aria-label', sidebar ? 'Grid view' : 'Sidebar view');
  toggle.title = sidebar ? 'Grid view: every player at once' : 'Sidebar view: one player large';
  const me = $('seat-me');
  const hand = $('hand-section');
  const areaOf = (uid) => (uid === myUid ? me : opponents.get(uid)?.section ?? null);
  if (focusUid !== null && !opponents.has(focusUid)) focusUid = null;
  const focusedArea = sidebar ? areaOf(focusUid ?? myUid) : null;
  // every area back where the grid wants it, in turn order (the style sheet places them by data-slot)
  const order = [myUid, ...others];
  const before = { hand: hand.parentElement, focused: focusedArea };
  // an area that is not shown small goes back to the grid, in turn order (the style sheet places them by data-slot); nothing is moved that is already in its place
  const gridAreas = others.map((uid) => opponents.get(uid).section).filter((area) => !(sidebar && area !== focusedArea));
  for (const area of [me, ...others.map((uid) => opponents.get(uid).section)]) { area.classList.toggle('focused', area === focusedArea); if (!sidebar || area === focusedArea) area.classList.remove('mini'); }
  placeChildren($('opponent-list'), gridAreas);
  if ((!sidebar || focusedArea === me) && me.parentElement !== $('seats-stage')) $('seats-stage').append(me);
  const docked = sidebar && focusedArea !== me;
  if (docked) { if (hand.parentElement !== focusedArea) focusedArea.append(hand); } else if (hand.parentElement !== me) me.append(hand); // (docked: in the large area, where that player's own hand would be)
  hand.classList.toggle('docked', docked);
  $('seats-stage').classList.toggle('hand-docked', docked);
  const side = $('seats-side');
  side.hidden = !sidebar;
  if (!sidebar) { side.replaceChildren(); if (before.hand !== hand.parentElement) handView.arrange(); return; }
  placeChildren(side, order.map((uid) => slotFor(uid).slot));
  for (const uid of order) {
    const entry = slotFor(uid);
    const area = areaOf(uid);
    const member = members[uid];
    entry.name.textContent = uid === myUid ? 'You' : `${member?.name ?? ''}`;
    const life = uid === myUid ? game?.life : opponents.get(uid)?.view?.life;
    entry.life.textContent = life === undefined || life === null ? '' : `♥ ${life}`;
    const isFocused = area === focusedArea;
    entry.slot.classList.toggle('viewing', isFocused);
    entry.slot.classList.toggle('active', area?.classList.contains('active') ?? false);
    entry.head.setAttribute('aria-pressed', String(isFocused));
    entry.head.setAttribute('aria-label', `${uid === myUid ? 'Your area' : `${member?.name ?? 'This player'}'s area`}${isFocused ? ' (shown large)' : ': show it large'}`);
    if (isFocused) { if (!entry.body.querySelector(':scope > .slot-eye')) entry.body.replaceChildren(eyeMark()); }
    else if (area) { area.classList.add('mini'); if (area.parentElement !== entry.body) entry.body.replaceChildren(area); }
  }
  sizeMinis();
  if (before.hand !== hand.parentElement || before.focused !== focusedArea) handView.arrange();
}
// The mark in the column for the area that is shown large: an eye (an inline SVG with its size and fill set on it).
function eyeMark() {
  const mark = make('span', 'slot-eye');
  mark.setAttribute('aria-hidden', 'true');
  mark.innerHTML = '<svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5c5 0 9 4.2 10 7-1 2.8-5 7-10 7S3 14.8 2 12c1-2.8 5-7 10-7Zm0 2.2A4.8 4.8 0 1 0 12 16.8 4.8 4.8 0 0 0 12 7.2Zm0 2.3a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z"/></svg>';
  return mark;
}
// Puts these children in this parent in this order, touching the page only when they are not already so (moving an element restarts its animations and loses the pointer's hover).
function placeChildren(parent, wanted) {
  const now = [...parent.children];
  if (now.length === wanted.length && now.every((child, index) => child === wanted[index])) return;
  parent.replaceChildren(...wanted);
}
// The small copies are the large area's size, scaled to the column's width.
function sizeMinis() {
  const stage = $('seats-stage');
  const game_ = $('game');
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  if (!width || !height) return;
  const slotWidth = $('seats-side').clientWidth - 16;
  game_.style.setProperty('--stage-w', `${width}px`);
  game_.style.setProperty('--stage-h', `${height}px`);
  game_.style.setProperty('--mini', String(Math.max(0.05, slotWidth / width)));
}
if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (document.body.dataset.view === 'sidebar') sizeMinis(); }).observe($('seats-stage'));

// ---- pinging a card (shared/ping.mjs) ----
// A ping is one record on the pinger's own public branch; every page shows a ping whose number differs from the last one it saw for that player. The first snapshot after the
// page loads is only remembered, so an old ping does not come back after a refresh.
const spotlight = createSpotlight($('spotlight'), { persistent: true, emptyText: 'Select a card to see it here.', onClose: () => bringBackSelectionToCorner() });
// ---- the card corner (frontend/src/spotlight.js): the selected card stays there, after you click away, until you select another; a pinged card replaces it until you select another card, another ping comes or you close it ----
let cornerUid = null; // the card whose picture the corner shows as the selection
let cornerShown = null; // { card, marks } of the last selected card, so closing a ping brings it back
let cornerMode = 'selected'; // 'selected', or 'ping' while a pinged card is showing
function showInCorner(card, marks, uid) {
  cornerUid = uid;
  cornerMode = 'selected';
  $('spotlight').dataset.mode = 'selected';
  cornerShown = { card, marks };
  spotlight.show({ card, detail: marks, closable: false, key: `${uid}:${card.turned ? 1 : 0}:${card.p ?? card.i}:${marks}` });
}
function clearCorner() { cornerUid = null; cornerShown = null; cornerMode = 'selected'; $('spotlight').dataset.mode = 'selected'; spotlight.hide(); }
function bringBackSelectionToCorner() { cornerMode = 'selected'; $('spotlight').dataset.mode = 'selected'; if (cornerShown) spotlight.show({ card: cornerShown.card, detail: cornerShown.marks, closable: false }); }
let pingSeen = null; // uid -> the number of the last ping seen; null until the first snapshot of the table's public branches (and its match number) has arrived
let publicSeen = false;
let lastPingKey = 0; // the number of my own last ping
let lastPingAt = 0;

// The card's glow: for a few seconds the card shows a ring, in its owner's row on every screen (my own cards are in my rows, another player's in their panel).
function glowCard(ownerUid, cardUid) {
  const root = ownerUid === myUid ? $('game') : opponents.get(ownerUid)?.section;
  const node = root ? [...root.querySelectorAll('.card')].find((button) => button.dataset.uid === cardUid) : null;
  if (!node) return;
  node.classList.add('pinged');
  setTimeout(() => node.classList.remove('pinged'), 4000);
}

function showPing({ uid, card }) {
  const member = members[uid];
  const sentence = pingSentence(typeof member?.name === 'string' ? member.name : 'A player', typeof member?.seat === 'string' ? member.seat : '', card);
  cornerMode = 'ping';
  $('spotlight').dataset.mode = 'ping';
  spotlight.show({ card, sentence, detail: marksSentence(card, printedOf(card, lookup)), closable: true });
  glowCard(uid, card.uid);
}

// Shows the pings that are new in the table's public branches (this match's branches only: one left over from an earlier match does not count).
function processPings() {
  if (!publicSeen || !meta) return; // nothing is judged until both are known, so the first snapshot is not mistaken for new pings
  const branches = {};
  for (const [uid, branch] of Object.entries(publicAll)) if (branch?.match === meta.match) branches[uid] = branch;
  const result = newPings(branches, pingSeen, lookup ?? (() => null));
  pingSeen = result.seen;
  for (const ping of result.shown) if (ping.uid !== myUid) showPing(ping); // my own ping was shown when I sent it
}

async function sendPing(card, zone) {
  if (!game || !canPing(zone)) return;
  if (Date.now() - lastPingAt < 700) return; // a key held down or a double click is one ping
  let record;
  try { record = makePing(card, zone, { previous: lastPingKey }); } catch (error) { say(error.message, true); return; }
  lastPingAt = Date.now();
  lastPingKey = record.k;
  if (pingSeen) pingSeen = { ...pingSeen, [myUid]: record.k }; // so the copy that comes back from the database is not shown a second time
  showPing({ uid: myUid, k: record.k, card });
  try {
    await saveGame(tableCode, { [`public/${myUid}/ping`]: record });
    say(`Pinged ${card.n}.`);
  } catch (error) {
    say(`The ping could not be sent to the other players (${friendlyMessage(error)}).`, true);
  }
}

// ---- starting the page ----
async function start() {
  tableCode = tableCodeFromPath(location.pathname);
  if (!tableCode) { say('That is not a table address. Go back to the lobby and join with a code.', true); return; }
  $('code').textContent = tableCode;
  let mine;
  try {
    mine = await rejoinTable(tableCode);
  } catch (error) {
    say(friendlyMessage(error), true);
    return;
  }
  if (!mine) { say('You are not at this table, or it has closed. Go back to the lobby to join it.', true); return; }
  myUid = mine.uid;

  startKeepAlive({ code: tableCode, document, api: { heartbeat, watchServerOffset, watchMeta, watchActivity }, bannerElement: $('banner'), formatTime });
  startPresence(tableCode, { onProblem: () => {} });
  watchMeta(tableCode, (value) => {
    meta = value ?? null;
    host = value?.host ?? null;
    processPings(); // the first snapshot of the pings is remembered once the match number and the public branches are both known, whichever arrives first
    if (value === null || value === undefined) say('This table has closed.', true);
    renderMatchState();
    renderPlayers();
    checkStart();
    renderCounters();
    renderTurn();
    renderOpponents();
  });
  watchMembers(tableCode, (value, error) => {
    if (!value) { members = {}; renderPlayers(); if (error) say('Lost sight of the table. It may have closed.', true); return; }
    members = value;
    renderPlayers();
    renderCounters();
    renderTurn();
    renderOpponents();
  });
  watchPublic(tableCode, (value) => { publicAll = value && typeof value === 'object' ? value : {}; publicSeen = true; processPings(); renderTurn(); renderOpponents(); });
  watchPresence(tableCode, (value) => { if (value) { presence = value; renderPlayers(); } });
  watchServerOffset((offset) => { serverOffset = offset; renderPlayers(); });
  watchConnection((connected) => {
    const words = ownConnectionText(connected);
    $('connection').textContent = words;
    $('connection').hidden = words === '';
  });
  setInterval(renderPlayers, 10000); // "Reconnecting..." turns into "Disconnected" with time
}

// ---- the match: concede, end it (host), leave ----
async function act(task) {
  try { await task(); } catch (error) { say(friendlyMessage(error), true); }
}
$('concede').addEventListener('click', () => act(async () => {
  if (!confirm('Concede this match? It cannot be taken back. The table will see that you conceded, and you can still look at the table.')) return;
  await concede(tableCode);
  say('You conceded this match.');
}));
$('end-match').addEventListener('click', () => act(async () => {
  if (!confirm('End the match for everyone? Everyone goes back to the lobby, and the games on the table are not kept.')) return;
  await endMatch(tableCode); // the table's status changes and every table page takes its player back to the lobby
}));
$('leave').addEventListener('click', () => act(async () => {
  if (!confirm('Leave the table? During a match your seat is kept for you until it ends, so you can come back with the table code.')) return;
  await leaveTable(tableCode);
  location.assign('/');
}));

// ---- wiring ----
mountMarksPanel($('marks'), {
  target: () => { const found = selected && game ? findCard(selected) : null; return found && found.zone === 'battlefield' ? { uid: found.card.uid, name: found.card.n } : null; },
  onChange: (change, message) => { if (game) apply(() => change(game), message); },
  say,
});
{ const close = make('button', 'secondary modify-close', 'Close'); close.type = 'button'; close.addEventListener('click', () => { closeModify(); document.querySelector('.card.selected')?.focus(); }); $('marks').prepend(close); }
$('draw').addEventListener('click', () => { if (game) drawOne(); });
$('pass-turn').addEventListener('click', () => {
  if (!game) return;
  const info = currentTurnInfo();
  // Anyone may press it: when it is not your turn it skips that player (they have left the table, or cannot play), so it asks first.
  if (info.uid !== myUid && !confirm(`Skip ${whoseWords(info, myUid)}? Use this when that player has left the table or cannot play.`)) return;
  try {
    const action = passAction(info, members, conceded, myUid);
    apply(() => action.run(game), action.message);
  } catch (error) {
    say(error.message, true);
  }
});
$('take-back').addEventListener('click', () => { if (game) { const action = takeBackAction(currentTurnInfo()); apply(() => action.run(game), action.message); } });
$('untap-all').addEventListener('click', () => { if (game) { play('tap'); apply(() => untapAll(game), untapMessage(game)); } });
mountSoundSettings($('sound-settings'));
const turnClock = mountTurnClock({ element: $('turn-clock'), store, serverOffset: () => serverOffset });
turnClock.mountSetting($('turn-clock-settings'));
// ---- piles drawn diagonally or horizontally (shared/pile-style.mjs), a double click taps a card, a click on empty space deselects ----
mountPileStyle($('pile-style-settings'));
let viewingOther = null; // { uid, zone }: another player's graveyard or exile is open in the pile window (read-only)
const viewer = mountPileViewer({ root: $('viewer'), nodeFor: (card) => (viewingOther ? opponents.get(viewingOther.uid)?.nodes.nodeFor(card, false) ?? cardNodes.nodeFor(card, false) : cardNodes.nodeFor(card, false)), onClose: () => { viewing = null; viewingOther = null; viewTop = null; viewBottom = false; viewReveal = false; if (game) render(); } });
viewer.onSearch(() => { if (game && (viewing || viewingOther)) renderViewer(); });
// the Graveyard and Exile buttons at the top of the window switch between the two (yours, or the other player's being looked at)
for (const tab of document.querySelectorAll('#viewer .viewer-tab')) tab.addEventListener('click', () => { if (!game) return; if (viewingOther) { viewingOther = { uid: viewingOther.uid, zone: tab.dataset.view }; viewer.clearSearch(); render(); } else openPile(tab.dataset.view); });
function openOtherPile(uid, zone) {
  if (!game) return;
  if (viewingOther?.uid === uid && viewingOther.zone === zone) { viewer.close(); return; } // a second click closes it
  viewer.peek(false);
  viewing = null; viewTop = null; viewBottom = false;
  viewingOther = { uid, zone };
  viewer.clearSearch();
  render();
}
// ---- the piles: a click opens the viewer (the cards and a search bar), a right-click opens the menu of the pile (search, shuffle, draw, look, mill, move all) ----
function openPile(zone, { look = null, search = false, bottom = false } = {}) {
  viewer.peek(false); // (a window hidden with the eye button comes back when a pile is opened)
  viewingOther = null;
  viewing = zone;
  viewTop = look;
  viewBottom = bottom;
  viewReveal = false;
  if (!search) viewer.clearSearch();
  render();
  if (search) viewer.focusSearch();
}
// The pile menu as on the solo table, less the lines that would SHOW cards to the other players (Reveal top X, Play with top revealed: only you would see them, which is not a reveal; they need the
// table to be told, a later step) and Exile face down (the database does not keep "face down in exile" yet).
function pickFromPileMenu(zone, id, amount) {
  if (!game) return;
  if (id === 'search') { openPile(zone, { search: true }); return; }
  if (id === 'look') { openPile(zone, { look: amount ?? 1 }); return; }
  if (id === 'lookbottom') { openPile(zone, { look: amount ?? 1, bottom: true }); return; }
  if (id === 'draw' && zone === 'library') { drawCards(amount ?? 1); return; } // (the same flight out of the library as the Draw button, one card at a time)
  if (id === 'scry' || id === 'surveil') {
    openScryWindow({
      kind: id,
      cards: topCards(game, amount ?? 1),
      nodeFor: (card) => cardNodes.nodeFor(card, false),
      onDone: ({ order, choices }) => {
        if (!game) return;
        try { const result = applyScry(game, { kind: id, order, choices }); play('shuffle'); apply(() => result.game, result.message); } catch (error) { say(error.message, true); }
      },
    });
    return;
  }
  const action = pileAction(id, zone, amount);
  if (!action) return;
  if (id === 'shuffle') { play('shuffle'); if (zone === 'library') shuffleAnimation($('pile-library'), cardBackUrl('small')); } else if (id === 'intolibrary') play('shuffle'); else if (id === 'draw') play('draw');
  apply(() => action.run(game), action.message);
}
function openPileMenu(zone, where) {
  if (!game) return;
  openCardMenu({ title: `${ZONE_WORDS[zone][0].toUpperCase()}${ZONE_WORDS[zone].slice(1)}`, items: pileMenuItems(zone, game.zones[zone].length, { scry: true }), x: where.x, y: where.y, returnFocus: where.element, toggleOn: where.toggleOn ?? null, avoid: where.avoid ?? null, onClose: where.onClose ?? null, onPick: (id, amount) => pickFromPileMenu(zone, id, amount) });
}
for (const [zone, name] of [['library', 'Library'], ['graveyard', 'Graveyard'], ['exile', 'Exile']]) {
  const pile = $(`pile-${zone}`);
  const slot = make('div', 'pile-slot');
  const head = make('div', 'pile-head');
  const caret = make('button', 'pile-caret');
  caret.type = 'button';
  caret.id = `pile-caret-${zone}`;
  caret.setAttribute('aria-haspopup', 'menu');
  caret.setAttribute('aria-expanded', 'false');
  caret.setAttribute('aria-label', `${name} options`);
  caret.title = `${name} options`;
  caret.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><path d="M1 3l4 4 4-4z"/></svg>';
  caret.addEventListener('click', () => { if (!game) return; if (caret.getAttribute('aria-expanded') === 'true') { closeCardMenu(); return; } const box = caret.getBoundingClientRect(); caret.setAttribute('aria-expanded', 'true'); openPileMenu(zone, { x: box.left, y: box.bottom + 4, element: caret, toggleOn: caret, avoid: box, onClose: () => caret.setAttribute('aria-expanded', 'false') }); });
  const label = make('span', 'pile-name', name);
  label.dataset.short = { library: 'Lib', graveyard: 'GY', exile: 'Exile' }[zone] ?? name; // (the areas of the table are small: the style sheet shows the short name)
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
mountFacing($('facing-settings'), { store });
mountHandRestSetting($('hand-rest-settings'), { onChange: () => handView.arrange() });
// The action bar floats like the solo table's (src/floating-bar.js): drag it by its grip; it starts docked at the bottom of the left edge, beside your own area.
mountFloatingBar({ bar: document.querySelector('.actions-panel'), grip: $('bar-grip'), store, key: 'overloaded.seatsBar2', defaultPlace: { dock: 'left', fx: 0, fy: 1 } });
mountKeybindSettings($('keybind-settings'), { keybinds, page: 'table' });
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
// The cards a key acts on: the picked group when the pointer is on one of them (or on no card), else just the card under the pointer.
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
// Press E or Q while the pointer is over a card of yours on the battlefield and it taps or untaps; with a group picked it is the whole group, all set the way the first one is not.
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
const GAME_KEYS = new Set(['mulligan', 'shuffle', 'arrange', 'lifeUp', 'lifeDown', 'viewLibrary', 'viewGraveyard', 'viewExile', 'sortType', 'sortColor', 'sortCost', 'sortName', 'autoSort']);
const CLICKS = { mulligan: '#mulligan', arrange: '#arrange', viewLibrary: '#pile-library', viewGraveyard: '#pile-graveyard', viewExile: '#pile-exile', sortType: '.hand-sort[data-sort="type"]', sortColor: '.hand-sort[data-sort="color"]', sortCost: '.hand-sort[data-sort="cost"]', sortName: '.hand-sort[data-sort="name"]', autoSort: '.hand-sort-toggle' };
function runGameKey(action) {
  if (action === 'shuffle') { pickFromPileMenu('library', 'shuffle'); return true; }
  if (action === 'lifeUp' || action === 'lifeDown') { apply(() => adjustLife(game, action === 'lifeUp' ? 1 : -1), ''); return true; }
  const target = document.querySelector(CLICKS[action]);
  if (!target || target.disabled) return false;
  target.click();
  return true;
}
// The keys come from the player's own choices (src/keybinds.js, Settings > Keybinds): tap, flip, draw, untap all and pass turn. Settings itself is opened by src/settings-menu.js.
document.addEventListener('keydown', (event) => {
  const action = keybinds.match('table', event);
  if (action === null || action === 'settings') return;
  if (event.target instanceof Element && event.target.closest('input, select, textarea, [contenteditable]')) return; // typing a number or a search is not a tap
  if (action === 'draw') { if (game) { event.preventDefault(); drawOne(); } return; }
  if (action === 'untapAll' || action === 'nextTurn') { const button = $(action === 'untapAll' ? 'untap-all' : 'pass-turn'); if (game && button && !button.disabled) { event.preventDefault(); button.click(); } return; }
  if (GAME_KEYS.has(action)) { if (game && runGameKey(action)) event.preventDefault(); return; }
  const hovered = cardUnderPointer();
  const found = hovered && game ? findCard(hovered.dataset.uid) : null;
  if (!game || (!found && multi.size === 0)) return;
  if (found && found.zone !== 'battlefield') return;
  event.preventDefault();
  if (action === 'flip') flipFaceDown(found); else toggleTapped(found);
});
// Dragging a rectangle over the empty part of your battlefield picks every card it touches; one that starts in the area of your hand picks the cards of the hand instead (never mixed). E, Q and F then act on
// all of them, a drag carries all of them, a right-click on picked hand cards opens the group menu; a click on empty space or Escape lets the group go. (As on the solo table.)
let marquee = null;
let marqueeEnded = false;
$('seat-me').addEventListener('pointerdown', (event) => {
  if (!game || event.button !== 0 || event.pointerType === 'touch' || event.target.closest('.card, button, .stack-hold-ring, .seat-head, .side-panels')) return;
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
    if (r.width > 0 && r.left < right && r.right > left && r.top < bottom && r.bottom > top) marquee.hits.add(card.dataset.uid);
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
  if (game) render();
});
document.addEventListener('click', (event) => {
  if (marqueeEnded) return;
  if (multi.size > 0 && game && event.target.isConnected && !event.target.closest('.card, button, a, input, select, textarea, summary, label, details, .side-panels, .card-menu, .spotlight, .marks-popover, .counter-panel')) { multi.clear(); render(); }
  if (!selected || !game || !event.target.isConnected) return;
  if (event.target.closest('.card, button, a, input, select, textarea, summary, label, details, .side-panels, .card-menu, .spotlight, .marks-popover')) return;
  selected = null;
  render();
});

// A right click on empty battlefield offers to make a token (Kevin, 2026-11-19; on the live table 2026-11-20): the window is src/token-picker.js and the list /data/tokens.json. A token is saved like any card (it
// carries its own type line, power and toughness and colors), so the other players see it. An emblem is saved with its type line and a count (em) and sits in the command zone.
async function openTokens(returnFocus, kind = 'token') {
  if (!game) return;
  say(`Loading the ${kind}s...`);
  const data = await loadTokens();
  if (!data) { say('The tokens could not be loaded. Check your connection and try again.', true); return; }
  say('');
  const deckNames = Object.values(game.zones).flat().filter((card) => !card.tok).map((card) => card.n);
  openTokenPicker({ data, deckNames, kind, returnFocus, onCreate: ({ token, printing }) => {
    if (kind === 'emblem') { // an emblem goes in the command zone and stays (several of one are a count)
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

mountCardHover(); // a larger picture of any card the pointer is on while Alt is held (the cards are small on the one-screen layout)
// ---- the battlefield grid: drag and drop, Auto-arrange and Alt+arrow keys (shared/board-grid.mjs, src/board-drag.js) ----
// A card dropped on a cell of your battlefield: from the hand it is played there (a taken cell is refused); from the battlefield it moves there, or swaps places with the card that is there.
function dropOnBoard({ uid, from, col, row, whole = false, group = null }) {
  if (!game) return;
  const found = findCard(uid);
  if (!found || found.zone !== from) return;
  try {
    if (group && from === 'hand') { // the cards picked in the hand: the one dragged is put where it was let go, the others each two columns and a row further up and to the left (as on the solo table)
      const ordered = game.zones.hand.filter((card) => group.includes(card.uid)).map((card) => card.uid);
      multi.clear(); selected = null;
      const behind = ordered.filter((each) => each !== uid);
      apply(() => moveCard(behind.reduce((next, each, k) => moveCard(next, each, 'battlefield', { cell: { col: Math.max(0, col - 2 * (behind.length - k)), row: Math.max(0, row - (behind.length - k)) } }), game), uid, 'battlefield', { cell: { col, row } }), `Played ${ordered.length} cards.`);
      return;
    }
    if (group && from === 'battlefield') { // the cards picked with a rectangle, moved together: each keeps its place relative to the others
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
$('arrange').addEventListener('click', () => { if (!game) return; apply(() => arrangeBoard(game), 'Tidied the battlefield: lands along the bottom, everything else along the top, cards with the same name side by side.'); });
// A card of yours dragged from the battlefield and let go over your hand goes back into the hand (a token that leaves the battlefield stops existing, like every other way of moving it).
function dropOnHand({ uid, from, x, picture, uids = null }) {
  if (!game || from === 'hand') return;
  const found = findCard(uid);
  if (!found || found.zone !== from) return;
  if (from === 'library') play('draw');
  const place = handView.holeFor(uid, x ?? 0, true); // the place that was open in the hand when it was let go
  handView.noteDrop(uid, picture); // the card starts from where its picture was let go and eases into its place
  const sorted = anySortOn(handSort.sorts());
  if (from === 'battlefield' && Array.isArray(uids) && uids.length > 1) { // a whole pile or a group of picked cards: every card of it goes into the hand, one place after another from the place that was open
    apply(() => {
      let next = game; let at = place; let count = 0;
      for (const each of uids) {
        if (!next.zones.battlefield.some((c) => c.uid === each)) continue;
        const moved = moveCard(next, each, 'hand');
        count += 1;
        next = moved.zones.hand.some((c) => c.uid === each) && !sorted ? reorderHand(moved, each, at++) : moved; // (a token that leaves the battlefield stops existing)
      }
      if (count === 0) throw new Error('Nothing to move.');
      return next;
    }, `Moved ${uids.length} cards back to your hand.`);
    multi.clear();
    return;
  }
  apply(() => { const moved = moveCard(game, uid, 'hand'); return moved.zones.hand.some((c) => c.uid === uid) && !sorted ? reorderHand(moved, uid, place) : moved; }, // (a token that leaves the battlefield stops existing: there is nothing to put in its place)
     from === 'battlefield' ? `Moved ${found.card.n} back to your hand.` : `Moved ${from === 'library' ? 'the top card of your library' : found.card.n} to your hand.`);
}
// Your piles and the command zone are places to take a card from (the top of the library, the graveyard or the exile, or a card of the command zone) and to drop one on (frontend/src/board-drag.js),
// as on the solo table. Only YOUR piles count: the other players' areas show piles too, and a card dropped there must not land in your own.
function zoneSource(target) {
  if (!game || !(target instanceof Element)) return null;
  const stack = target.closest('#piles-section .pile-stack');
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
  const stack = element?.closest?.('#piles-section .pile-stack');
  if (stack?.dataset.zone) return { zone: stack.dataset.zone, element: stack };
  const slot = element?.closest?.('#command .cmd-slot');
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
  if (found && to === 'command' && (slot === 1 || slot === 2)) commandSlots.set(uid, slot);
  if (found && from === 'command' && to === 'command') { flying?.remove(); render(); say(slot ? `Put ${found.card.n} in command slot ${slot}.` : ''); return; } // (moved from one slot to the other)
  if (!found || found.zone !== from || from === to || !ZONE_WORDS[to]) { flying?.remove(); return; }
  if (flying) flyAway(flying, element ?? $(`pile-${to}`)); // the picture carried flies into the pile
  if (from === 'library' && to === 'hand') play('draw');
  const name = from === 'library' ? 'the top card of your library' : found.card.n;
  apply(() => moveCard(game, uid, to, to === 'command' ? {} : { position: 'top' }), `Moved ${name} to ${ZONE_WORDS[to]}.`);
}
// Your hand as a fan: the page draws the cards, the hand view places them and shows their mana costs; a card of the hand dragged within it opens a gap and is put there when let go.
const handView = mountHand({ container: $('hand'), restHidden, raiseFloor: () => ($('hand-section').classList.contains('docked') ? null : $('battlefield').getBoundingClientRect().bottom), costOf: (uid) => { const card = game?.zones.hand.find((c) => c.uid === uid); const known = card ? lookup?.(card) : null; return known?.m ?? ''; } });
function reorderInHand({ uid, x, picture }) {
  if (!game || !game.zones.hand.some((c) => c.uid === uid)) return;
  const to = handView.holeFor(uid, x); // the place it was last shown over
  if (anySortOn(handSort.sorts())) { handView.noteDrop(uid, picture); pins.set(uid, to); render(); say('That card stays there until you change the sorts.'); return; } // (in a sorted hand a card moved by hand is pinned there)
  handView.noteDrop(uid, picture); // the card starts from where its picture was let go and eases into its place
  const next = reorderHand(game, uid, to);
  if (next === game) { handView.arrange(); return; }
  apply(() => next, '');
}
// The sort buttons are in the bar under the hand, the orders of types, colors and lands in Settings > Hand sorting (src/hand-sort-ui.js), as on the solo table.
// "Sort" (the Auto button off): the hand is put in the order the buttons say, once.
function sortNow() {
  if (!game) return;
  const sorts = handSort.buttons();
  if (!anySortOn(sorts)) { say('Press Type, Color, Cost or A-Z first.'); return; }
  const hand = game.zones.hand;
  const sorted = sortHand(hand, sorts, { typeOrder: handSort.typeOrder(), colorOrder: handSort.colorOrder(), landOrder: handSort.landOrder(), info: (card) => lookup?.(card) ?? null });
  if (sorted.every((card, index) => card.uid === hand[index].uid)) { say('The hand is already in that order.'); return; }
  pins.clear();
  apply(() => { let next = game; sorted.forEach((card, index) => { next = reorderHand(next, card.uid, index); }); return next; }, 'Sorted the hand.');
}
const handSort = createHandSort({ onSortNow: sortNow, onChange: () => { if (!anySortOn(handSort.sorts())) keepShownOrder(); pins.clear(); if (game) render(); } });
handSort.mountButtons(handView.bar);
handSort.mountOrders($('hand-order-settings'));
// The menu of the hand: an arrow next to the hand count, or a right-click on the bar under the hand. Mulligan, Shuffle hand into library, Move all to, Discard X at random, Discard hand (shared/hand-menu.mjs).
function openHandMenu(where) {
  if (!game) return;
  const caret = $('hand-caret');
  caret?.setAttribute('aria-expanded', 'true');
  openCardMenu({ title: 'Your hand', items: handMenuItems(game.zones.hand.length), x: where.x, y: where.y, returnFocus: where.element, toggleOn: caret, avoid: where.avoid ?? null, onPick: pickFromHandMenu, onClose: () => caret?.setAttribute('aria-expanded', 'false') });
}
function pickFromHandMenu(id, amount) {
  if (!game) return;
  handView.clearLift();
  if (id === 'mulligan') { doMulligan(); return; }
  const group = moveAllGroupId(id); // "Move all to": the whole hand, like the menu of picked cards (the library lines ask for the order first)
  if (group) { pickFromGroupMenu(group, game.zones.hand.map((card) => card.uid)); return; }
  const action = handAction(id, amount);
  if (!action) return;
  if (id === 'shuffleinto') play('shuffle');
  apply(() => action.run(game), action.message);
}
{
  const handCaret = make('button', 'pile-caret hand-caret');
  handCaret.type = 'button';
  handCaret.id = 'hand-caret';
  handCaret.setAttribute('aria-haspopup', 'menu');
  handCaret.setAttribute('aria-expanded', 'false');
  handCaret.setAttribute('aria-label', 'Hand options');
  handCaret.title = 'Hand options';
  handCaret.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><path d="M1 3l4 4 4-4z"/></svg>';
  handCaret.addEventListener('click', () => { if (handCaret.getAttribute('aria-expanded') === 'true') { closeCardMenu(); return; } const box = handCaret.getBoundingClientRect(); openHandMenu({ x: box.left, y: box.bottom + 4, element: handCaret, avoid: box }); });
  handView.bar.querySelector('.hand-count').after(handCaret);
  handView.bar.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    const fromKeyboard = event.clientX === 0 && event.clientY === 0;
    const box = event.currentTarget.getBoundingClientRect();
    openHandMenu({ x: fromKeyboard ? box.left + box.width / 2 : event.clientX, y: fromKeyboard ? box.top : event.clientY, element: handCaret });
  });
}
mountBoardDrag({ board: () => $('battlefield'), onDrop: dropOnBoard, groupOf: (uid) => (multi.size > 1 && multi.has(uid) ? [...multi] : null), hand: () => $('hand-section'), onDropHand: dropOnHand, onHandOver: (over) => handView.carry(over), onReorderHand: reorderInHand, handZone: () => handView.zone(), handHit: (x, y) => handView.over(x, y), zoneSource, pileAt, onDropPile: dropOnPile, isEnabled: () => Boolean(game), boardFirst: true });

$('mulligan').addEventListener('click', () => { if (game) doMulligan(); });
// the life total is the number itself: click, right-click, Shift for 5, hold to set (src/life-control.js)
mountLifeControl({ button: $('life'), say, onDelta: (delta) => { if (game) apply(() => adjustLife(game, delta), ''); }, onSet: (value) => { if (game) apply(() => adjustLife(game, value - game.life), `Life is ${value}.`); } });
for (const zone of ['library', 'graveyard', 'exile', 'sideboard']) $(`pile-${zone}`).addEventListener('click', () => { if (!game) return; if (viewing === zone && !viewTop) viewer.close(); else openPile(zone); });
$('retry').addEventListener('click', () => { if (meta?.status === 'playing' && !begun) beginGame(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && (selected || multi.size > 0) && game) { selected = null; multi.clear(); render(); } });

start();
