// The table page, where a started match is played at /table/CODE. It shows who is at the table and plays YOUR game: the same
// moves as the solo table (shared/zones.mjs), but every move is also saved to the live database, only the pieces it changed
// (shared/game-sync.mjs): your hand and library in your private branch (nobody else can read it), the rest in your public one.
// A refresh puts you back at the game you left. Other players' boards are shown beside it, live and read-only (their public
// zones only: shared/game-sync.mjs readPublic). All database calls live in ../../src/db.js.
import { mountLookSettings } from '../../src/look-settings.js';
import { showClosedTable } from '../../src/closed-table.js';
import { setMyColor } from '../../src/accent.js';
import { commanderBurst, sortHop, mountEffectSettings } from '../../src/vfx.js';
import { commanderArrivals } from '../../../shared/effects.mjs';
import { askConfirm } from '../../src/confirm-box.js';
import { rejoinTable, watchMembers, watchMeta, watchPresence, watchServerOffset, watchConnection, startPresence, heartbeat, watchActivity, saveGame, writeShared, loadGame, watchPublic, saveStack, watchStack, savePlaneMove, clearPlaneEntries, watchPlane, setCarry, armCarry, watchCarry, concede, endMatch, leaveTable, takeOverHost } from '../../src/db.js';
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
import { mountCommandZone, drawEmblemCounts, drawOtherSlots } from '../../src/command-zone.js';
import { taxAction, taxEntries, otherCommandSlots, COMMANDER_TAX_PUBLISHED, TAX_PER_CAST } from '../../../shared/commander-zone.mjs';
import { pileMenuItems, pileAction } from '../../../shared/pile-menu.mjs';
import { mountCardHover } from '../../src/card-hover.js';
import { cardNotes } from '../../../shared/card-notes.mjs';
import { mountBoardDrag } from '../../src/board-drag.js';
import { mountHand } from '../../src/hand-view.js';
import { createSpotlight } from '../../src/spotlight.js';
import { canPing, makePing, newPings, pingSentence, readPing, closedPing, seenBy } from '../../../shared/ping.mjs';
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
import { restHidden, mountHandRestSetting } from '../../src/hand-rest.js';
import { mountHandSizeSetting } from '../../src/hand-size.js';
import { createCounterPanel } from '../../src/counter-panel.js';
import { mountFloatingBar } from '../../src/floating-bar.js';
import { mountHistoryBar } from '../../src/history-bar.js';
import { mountStackWindow } from '../../src/stack-window.js';
import { createToolDocks } from '../../src/tool-dock.js';
import { summarizeBoard } from '../../../shared/board-summary.mjs';
import { tableColors, colorValue, inkOn } from '../../../shared/player-colors.mjs';
import { PLANE_COLS, PLANE_ROWS, HOME_COLS, HOME_ROWS, homeOf, facingOf, readPlaneEntry, planeCell, entryFor } from '../../../shared/plane.mjs';
import { mountPlaneCamera } from '../../src/plane-camera.js';
import { mountPlaneDrag } from '../../src/plane-drag.js';
import { emptyUndo, remember, canUndo, takeBack, undoWords } from '../../../shared/undo.mjs';
import { readPhase, phaseIn, phaseRecord, nextStep, PHASES, LAST_PHASE } from '../../../shared/phase.mjs';
import { mountPhaseStrip } from '../../src/phase-strip.js';
import { mountTurnPiece } from '../../src/turn-piece.js';
import { showHelpOnce, mountHelpSettings } from '../../src/view-help.js';
import { showFirstReveal } from '../../src/first-reveal.js';
import { openCardAdder } from '../../src/card-adder.js';
import { mountPlayersPanel } from '../../src/players-panel.js';
import { packStack, readStack } from '../../../shared/stack-sync.mjs';
import { describeMove, makeEntry, slotFor as logSlotFor, lastK, mergeHistory } from '../../../shared/live-history.mjs';
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
import { nextSeatAfter, currentTurn, passAction, takeBackAction, canTakeBack, turnToStart, whoseWords, turnWords } from '../../../shared/turn-order.mjs';
import { chipEntries, playerMenuItems, playerAction, commanderDamageSeatsFor, counterPanelRows } from '../../../shared/player-counters.mjs';
import { presenceStatus, presenceText, ownConnectionText, hostIsGone } from '../../../shared/presence.mjs';
import { tableCodeFromPath } from '../../../shared/lobby-link.mjs';
import { seatDeckText, defaultDeckFor, hasConceded } from '../../../shared/lobby-deck.mjs';
import { LIBRARY_KEY, LEGACY_KEY, readLibrary } from '../../../shared/deck-library.mjs';
import { makeLookup } from '../../../shared/card-lookup.mjs';
import { openCardDetails } from '../../src/card-details.js';
import { makeRulesLoader } from '../../src/card-rules.js';
import { makeRulingsLoader } from '../../src/card-rulings.js';
import { friendlyMessage } from '../../../shared/friendly-error.mjs';
import { addCard, setFaceDown, makeGame, draw, moveCard, shuffleLibrary, mulligan, setTapped, turnOver, untapAll, beginTurn, adjustLife, boardCells, settleBoard, isLandCard, placeCard, placeStack, placeGroup, arrangeBoard, zoneCounts, reorderHand, createToken, createEmblem } from '../../../shared/zones.mjs';
import { gameWrites, joinGame, readPublic, SERVER_TIME, taxToStore } from '../../../shared/game-sync.mjs';
import { placeAll, stepFrom, setBoardSize, CARD_COLS, CARD_ROWS } from '../../../shared/board-grid.mjs';

const $ = (id) => document.getElementById(id);
const store = makeSafeStore();
const TABLE_DECK_KEY = 'overloaded.tableDeck'; // { code, id }: the deck brought to that table (the lobby writes it)
let keepAlive = null; // (startKeepAlive's handle, once this page is at its table)
let closedReason = null; // 'age' or 'idle' once the table has closed
// The news line (hidden during a game) and, once the history bar exists, its Messages tab (Kevin, 2026-11-21)
let noteMessage = null;
const say = (message, isError = false) => { $('status').textContent = message; $('status').classList.toggle('error', isError); noteMessage?.(message, { error: isError }); };
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

let playersPanel = null; // the Players tool (mounted further down, with the other tools)
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
  // A host gone for 5 minutes mid-match can be taken over here too (Kevin, 2026-11-24: it was only on the lobby page, which a match never shows). Same test as the database rule.
  const canTakeOver = meta?.status === 'playing' && Boolean(host) && host !== myUid && Boolean(members[myUid]) && hostIsGone(presence[host], now);
  $('take-over').hidden = !canTakeOver;
  if (canTakeOver && !takeOverSaid) say('The host left. Take over in Settings > Game.', true);
  takeOverSaid = canTakeOver;
  renderStatuses(now);
  renderPlayersPanel();
}
// Other players' connection and concession, shown on their seat and in the Players panel (they were only in the hidden list above); drawn when presence changes and when the seats are drawn
function renderStatuses(now = serverOffset === null ? null : Date.now() + serverOffset) {
  for (const [uid, panel] of opponents) {
    const words = statusWords(uid, now);
    panel.statusTag.textContent = words.short;
    panel.statusTag.title = words.long;
    panel.statusTag.hidden = !words.short;
  }
}
let takeOverSaid = false;
// Short words for another player's state: conceded first, then their connection (the full sentence is the tooltip)
function statusWords(uid, now = serverOffset === null ? null : Date.now() + serverOffset) {
  if (hasConceded(members[uid], meta)) return { short: 'Conceded', long: 'Conceded this match' };
  const status = presenceStatus(presence[uid], now);
  if (status.state === 'reconnecting') return { short: 'Reconnecting...', long: presenceText(status) };
  if (status.state === 'disconnected') return { short: `Away ${status.minutes} min`, long: presenceText(status) };
  return { short: '', long: '' };
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

const cardNodes = makeCardNodes({ onSelect: (uid, event) => { if (!marqueeEnded) select(uid, event); }, isSelected: (uid) => uid === selected || multi.has(uid), onMark: (uid, hit) => markOnCard(uid, hit), onMenu: (uid, where) => openMenuFor(uid, where), onBadge: (uid, kind) => clearBadge(uid, kind), printedStats: (card) => printedOf(card, lookup) });
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
  renderPlayersPanel();
}

function render() {
  if (multi.size > 0 && [...multi].some((each) => findCard(each)?.zone !== multiZone)) multi.clear(); // (a picked card has left the zone it was picked in: the group is over)
  renderTurn();
  renderCounters();
  $('life').textContent = String(game.life);
  $('my-plate-life').textContent = String(game.life); // (the nameplate on your area)
  if (sharedOn) { const cells = myPlaneCells(); place($('battlefield'), byPlaneZ(game.zones.battlefield, mySeatNow()), { battlefield: true, cells, sharp: true }); renderPlane(); }
  else place($('battlefield'), game.zones.battlefield, { battlefield: true, cells: boardCells(game), sharp: true });
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
  renderViewer();
  renderSelected();
}

function renderViewer() {
  for (const tab of document.querySelectorAll('#viewer .viewer-tab')) tab.setAttribute('aria-pressed', String(tab.dataset.view === (viewingOther?.zone ?? viewing)));
  $('viewer-tabs').hidden = !((viewingOther?.zone ?? viewing) === 'graveyard' || (viewingOther?.zone ?? viewing) === 'exile'); // (the graveyard and exile windows switch between each other)
  if (viewingOther) {
    const panel = opponents.get(viewingOther.uid);
    if (!panel?.view) { viewingOther = null; viewer.hide(); return; } // (they left, or their game is gone)
    const cards = panel.view.zones[viewingOther.zone];
    viewer.show({ label: `${viewingOther.zone === 'graveyard' ? 'Graveyard' : 'Exile'} of ${panel.name}`, cards, total: cards.length, noteText: viewingOther.zone === 'graveyard' ? 'Newest first.' : '' });
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
    noteText: viewing === 'library' ? 'Top card first. Right-click a card to move it.' : viewing === 'graveyard' ? 'Newest first. Right-click a card to move it.' : 'Right-click a card to move it.', // (short: Kevin, 2026-11-25)
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
  // the short version in the top bar (the redesign: a failed save shows where you look, not only in Settings)
  const chip = $('save-chip');
  chip.textContent = isError ? 'Not saved' : /^Saving/.test(message) ? 'Saving' : 'Saved';
  chip.dataset.state = isError ? 'error' : /^Saving/.test(message) ? 'saving' : 'saved';
  chip.title = message;
}

// Sends the pieces of your game that differ from what the database has. Saves go one after another, each one sends the newest
// game, and a failed save is simply tried again with the next move (the difference is always taken against what is saved).
let saveFailing = false;
function sync() {
  saving = saving.then(async () => {
    const target = game;
    if (!target || target === lastSaved) return;
    saveState('Saving...');
    try {
      const writes = gameWrites(myUid, lastSaved, target);
      const first = lastSaved === null;
      // which match this game belongs to; a new match starts an empty history and no commander tax (Kevin's friends, 2026-11-26: the last match's tax was still there)
      if (first) { writes[`public/${myUid}/match`] = meta.match; writes[`public/${myUid}/log`] = null; writes[`public/${myUid}/tax`] = null; }
      await saveGame(tableCode, writes);
      if (first) savedTax = 'null';
      lastSaved = target;
      if (game === target) saveState('Saved.');
      if (saveFailing) { saveFailing = false; say('Saved again.'); }
      await saveTax(target);
    } catch (error) {
      saveState(`Your last move could not be saved (${friendlyMessage(error)}). It will be sent with your next move.`, true);
      if (!saveFailing) { saveFailing = true; say(`Not saved: ${friendlyMessage(error)}`, true); } // (said once per run of failures, in the history's Messages tab: Settings alone hid it during play)
    }
  });
}

// The commander tax goes in its OWN write, after the move (shared/game-sync.mjs taxToStore): until the database's rules accept it, only this write is refused and the game itself still saves.
let savedTax; // what the database has, as text (undefined: not written yet this page)
let taxRefusedSaid = false;
async function saveTax(target) {
  const tax = taxToStore(target);
  const text = JSON.stringify(tax);
  if (text === savedTax || (savedTax === undefined && tax === null)) return;
  try { await saveGame(tableCode, { [`public/${myUid}/tax`]: tax }); savedTax = text; } catch {
    if (!taxRefusedSaid) { taxRefusedSaid = true; say('Commander tax not saved: the database rules need updating.', true); }
  }
}

// ---- the shared game history (shared/live-history.mjs): after each move, one short entry on your own public branch, worked out from what changed (never naming a card in a hand or library) ----
let logK = 0; // the number of your last entry (a refresh carries on from the entries already stored)
const seatName = (seat) => Object.values(members).find((member) => String(member.seat) === String(seat))?.name || `seat ${seat}`;
function logMove(before, after, note = null) {
  if (!before || !after || before === after || !myUid || !tableCode) return;
  const text = describeMove(before, after, { note, seatName });
  if (!text) return;
  logK = Math.max(logK, lastK(publicAll[myUid]?.match === meta?.match ? publicAll[myUid]?.log : null)) + 1;
  const entry = makeEntry({ k: logK, text, turn: after.turn, at: SERVER_TIME });
  saving = saving.then(() => saveGame(tableCode, { [`public/${myUid}/log/${logSlotFor(entry.k)}`]: entry })).catch(() => {}); // (after the game's own save, so the first save of a match, which clears the old history, comes first)
}
function renderHistory() {
  const names = Object.fromEntries(Object.entries(members).map(([uid, member]) => [uid, member.name]));
  historyBar.set(mergeHistory(publicAll, { names, me: myUid, match: meta?.match ?? null }));
}

// Runs a move on the game; the old game is never changed, so a refused move leaves everything as it was.
// Returns whether the move was made (a refused move leaves the game as it was). note: what the history should know that the game does not say ('shuffle').
function apply(run, message = '', { note = null } = {}) {
  let made = true;
  const before = game;
  try {
    game = run();
    if (game !== before) undoState = remember(undoState, before, message); // (Undo puts the game from before this move back; a change of turn clears it, in renderTurn)
    if (message) say(message);
  } catch (error) {
    made = false;
    say(error.message, true);
  }
  render();
  sync();
  if (made) logMove(before, game, note);
  if (made && before && game) celebrate(myUid, before.zones, game.zones);
  return made;
}
// A commander came from the command zone onto the battlefield: its effect and sound for everyone at the table (src/vfx.js). My own moves are seen here in apply(); another
// player's are seen when their public branch changes (renderOpponents), by comparing it with the last one this page saw: nothing extra is written, so no rule is needed.
function cardElement(owner, uid) {
  if (owner === myUid) return document.querySelector(`#battlefield > .card[data-uid="${uid}"]`);
  return document.querySelector(`.plane-layer[data-owner="${owner}"] > .card[data-uid="${uid}"]`) // (the Shared view: their cards are on the plane)
    ?? document.querySelector(`.opponent[data-uid="${owner}"] .card[data-uid="${uid}"]`);
}
function celebrate(owner, before, after) {
  for (const uid of commanderArrivals(before, after)) {
    const card = after.battlefield.find((each) => each.uid === uid);
    commanderBurst(cardElement(owner, uid), { color: playerColor(owner), name: card?.n ?? '' });
  }
}
const seenZones = new Map(); // another player's uid -> { match, zones } as last drawn
const hopHand = () => sortHop([...document.querySelectorAll('#hand > .card')]);

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
  openCardMenu({ title: found.card.n, items: menuItems(found.card, found.zone, { live: true, details: true, peek: true, stack: true }), x: where.x, y: where.y, returnFocus: where.element, onPick: (id, amount) => pickFromMenu(uid, id, amount) });
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
  if (id === 'stack') { stackWindow.add(found.card); return; } // a copy of the card as it is now goes on top of the table's stack (every player sees it; the real card does not move)
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
  const before = game;
  const result = draw(game, 1);
  if (!result.short) undoState = remember(undoState, before, 'Drew a card.');
  game = result.game;
  if (!result.short) play('draw');
  say(result.short ? 'Your library is empty.' : `Drew ${game.zones.hand.find((c) => c.uid === result.drawn[0]).n}.`, result.short);
  render();
  sync();
  logMove(before, game);
  if (!result.short) flyDrawn(result.drawn[0]);
}

// Draw X from the library menu: one card after another, each flying out of the library (a small pause between them, shorter every 5 cards after the first 10; under reduced motion at once). Each card is saved as it comes.
let drawing = false;
async function drawCards(n) {
  if (n <= 1) { drawOne(); return; }
  if (drawing || !game) return;
  drawing = true;
  const before = game;
  undoState = remember(undoState, before, `Drew ${n} cards.`); // (one Undo takes all of them back)
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
    if (game) logMove(before, game); // (one entry for the whole draw: "drew 3 cards")
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
  return currentTurn(byUid, members, meta?.opener ?? null);
}
const conceded = (uid) => hasConceded(members[uid], meta);
const baseTitle = document.title;
let turnNote = ''; // what starting my turn did, for the banner
let lastStartTried = null; // the turn my page last tried to start, so a refused start is not tried again in a loop
let lastStartMatch = null; // the match that number belongs to: a new match starts the memory afresh
const capital = (text) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
// A player's color (Kevin, 2026-11-25: picked in the lobby, else their seat's default; shared/player-colors.mjs), as a CSS value.
const playerColor = (uid) => colorValue(tableColors(members)[uid]);

// ---- Undo and the step of the turn (the redesign, step 4: shared/undo.mjs, shared/phase.mjs) ----
let undoState = emptyUndo();
let undoTurn = null; // the table turn the remembered games belong to
let myPhase = null; // my phase record { n, s } (stored on my public branch as its own write, like the commander tax)
// The step of the turn being played: mine from this page, another player's from their branch; a record of an earlier turn is Untap.
const phaseNow = (info) => phaseIn(info.uid === myUid ? myPhase : publicAll[info.uid]?.phase, info.turn);
let phaseRefusedSaid = false;
async function savePhase() {
  try { await saveGame(tableCode, { [`public/${myUid}/phase`]: myPhase }); } catch {
    if (!phaseRefusedSaid) { phaseRefusedSaid = true; say('Step of the turn not saved: the database rules need updating.', true); }
  }
}
function setStep(step) {
  if (!game) return;
  const info = currentTurnInfo();
  if (info.uid !== myUid) return; // (only the player whose turn it is)
  myPhase = phaseRecord(info.turn, step);
  renderTurn();
  savePhase();
}
const phaseStrip = mountPhaseStrip({ root: $('phase-strip'), onPick: setStep });
function doUndo() {
  if (!game) return;
  const back = takeBack(undoState);
  if (!back) { say('Nothing to undo.'); return; }
  const before = game;
  undoState = back.undo;
  game = back.game;
  say(undoWords(back.label));
  render();
  sync();
  logMove(before, game);
}
$('undo').addEventListener('click', doUndo);

// Who goes first, revealed once per match on every page (2026-11-26 feedback; src/first-reveal.js): only while nobody has passed yet, and remembered for this tab so a refresh does not replay it.
function maybeRevealFirst(info) {
  if (!meta?.opener || meta.status !== 'playing' || info.last || !tableCode) return;
  const key = `overloaded.firstShown.${tableCode}.${meta.match}`;
  try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* without storage it may show again after a refresh */ }
  const players = Object.entries(members).filter(([, m]) => ['1', '2', '3', '4'].includes(String(m?.seat))).sort((a, b) => Number(a[1].seat) - Number(b[1].seat))
    .map(([uid, m]) => ({ seat: String(m.seat), name: typeof m.name === 'string' ? m.name : '', color: playerColor(uid) }));
  showFirstReveal({ players, opener: meta.opener, mine: members[myUid]?.seat === meta.opener });
}
function renderTurn() {
  if (!game) return;
  if (lastStartMatch !== (meta?.match ?? null)) { lastStartMatch = meta?.match ?? null; lastStartTried = null; }
  const info = currentTurnInfo();
  maybeRevealFirst(info);
  const mine = Boolean(myUid) && info.uid === myUid;
  const wanted = turnToStart(info, members[myUid]?.seat, game);
  // A player who has conceded does not start turns (a pass can only name them if they conceded after it was written).
  if (wanted !== null && wanted !== lastStartTried && !conceded(myUid)) { lastStartTried = wanted; startMyTurn(wanted); return; } // apply() draws the page again
  $('turn').textContent = String(info.turn);
  $('turn-whose').textContent = capital(whoseWords(info, myUid));
  const nextSeat = nextSeatAfter(members, info.seat, conceded);
  const nextMember = Object.entries(members).find(([, m]) => m.seat === nextSeat);
  $('turn-next').textContent = nextMember ? `Next: ${nextMember[0] === myUid ? 'you' : nextMember[1].name}` : '';
  $('turn-next').hidden = !nextMember || nextSeat === info.seat;
  $('turn-piece').style.setProperty('--turn-color', playerColor(info.uid)); // (the dot before whose turn it is: that player's color; on the turn piece, which can float out of the top bar)
  $('turn-piece').dataset.mine = String(mine);
  $('game-bar').dataset.mine = String(mine);
  if (info.turn !== undoTurn) { undoTurn = info.turn; undoState = emptyUndo(); } // (Undo never crosses a turn, whoever passed it)
  $('undo').disabled = !canUndo(undoState);
  phaseStrip.update({ step: phaseNow(info), mine, whose: capital(whoseWords(info, myUid)) });
  $('next-step').querySelector('.act-label').textContent = `${PHASES[phaseNow(info)].name} »`; // (the step being played; on your turn a click moves to the next)
  $('next-step').disabled = !mine || phaseNow(info) >= LAST_PHASE;
  const pass = $('pass-turn');
  const passWords = mine ? 'Next turn' : `Skip ${whoseWords(info, myUid).replace(/ \(no one is there\)$/, '')}`; // (the label only: the button keeps its icon for the column of icons)
  pass.querySelector('.act-label').textContent = passWords;
  pass.title = passWords;
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
  const beforeMulligan = game;
  try { game = mulligan(game); undoState = emptyUndo(); } catch (error) { say(error.message, true); render(); return; } // (a mulligan cannot be undone: the new hand is dealt)
  logMove(beforeMulligan, game);
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
    myPhase = readPhase(stored.public.phase);
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
    myPhase = null;
    fresh = true;
    logK = 0; // (a new game, a new history: the first save clears the old one)
    lastSaved = null; // nothing is saved for this match yet: the first save writes everything and clears an older match's cards
    $('deck-line').textContent = `${deck.name}: ${plural(deck.cards.reduce((sum, c) => sum + c.qty, 0), 'card', 'cards')}. Your hand is dealt.`;
    say(`Dealt ${plural(game.zones.hand.length, 'card', 'cards')}. Life is ${game.life}.`);
  }
  selected = null;
  viewing = null;
  undoState = emptyUndo();
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
  panel.statusTag = make('span', 'seat-status'); panel.statusTag.hidden = true; // (Reconnecting..., Away N min, Conceded)
  const head = make('div', 'seat-head opp-info'); head.append(make('span', 'plate-dot'), lifeBox, panel.title, panel.statusTag); // (a nameplate: the seat's dot, the name, the life; src/styles/game-shell.css orders them)
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
  const arrivals = []; // [uid, zones before, zones now] of players whose public branch changed
  const turnNow = game !== null ? currentTurnInfo() : null; // worked out once for all the panels, not once per player
  for (const [uid, member] of others) {
    const panel = opponentPanel(uid);
    panel.title.textContent = `Seat ${member.seat}: ${member.name}`; // names are other people's text: put in as text, never as markup
    panel.section.style.setProperty('--seat-color', playerColor(uid));
    panel.section.style.setProperty('--seat-ink', inkOn(playerColor(uid))); // (text on their color: dark or light, whichever reads better)
    const theirTurn = turnNow !== null && turnNow.uid === uid;
    panel.section.classList.toggle('active', theirTurn);
    if (theirTurn) panel.title.append(make('span', 'turn-mark', 'their turn'));
    // A public branch left over from an earlier match does not count: this match's game is the one with this match's number.
    // A player with no game for this match (a test bot, or someone still loading) is drawn as a BLANK game: starting life, an empty battlefield grid, empty piles (Kevin, 2026-11-23: so the
    // grid of every seat can be seen and tested with bots). Nothing is written: it is only how this page draws them.
    const dealt = publicAll[uid]?.match === meta.match ? readPublic(publicAll[uid], known) : null;
    const view = dealt ?? readPublic({ life: meta?.format === 'commander' ? 40 : 20 }, known);
    panel.view = view;
    panel.name = member.name;
    panel.section.toggleAttribute('data-blank', dealt === null);
    panel.waiting.hidden = true;
    panel.body.hidden = false;
    panel.stats.hidden = false;
    panel.life.hidden = false;
    {
      panel.countersBox.hidden = !panel.counterList.update(chipEntries(view.pc, view.cd, commanderDamageSeatsFor(members, view.cd, meta?.format)));
      panel.life.textContent = String(view.life);
      panel.life.setAttribute('aria-label', `Life ${view.life}`);
      panel.stats.textContent = dealt ? `Hand ${view.counts.hand} · Library ${view.counts.library}` : 'No game yet';
      panel.section.dataset.life = String(view.life);
      const theirCols = fitBoard(panel.board).cols; // (their board on my screen: as many columns as it holds here; a card stored further right than that is drawn at its right edge)
      const cells = placeAll(view.zones.battlefield, isLandCard);
      if (theirCols) for (const [uid, cell] of cells) if (cell.col > theirCols - CARD_COLS) cells.set(uid, { ...cell, col: theirCols - CARD_COLS });
      panel.nodes.place(panel.board, view.zones.battlefield, { battlefield: true, cells, sharp: true }); // their battlefield on the same kind of grid, each card on the cell they stored
      watchBoardSize(panel.board);
      panel.nodes.place(panel.command, view.zones.command);
      drawEmblemCounts(panel.command, view.zones.command);
      drawOtherSlots(panel.command, otherCommandSlots(view)); // (two slots, each commander with its own tax, also once it is out: Kevin's friends, 2026-11-26)
      panel.piles.library.stack.update({ count: view.counts.library });
      for (const zone of ['graveyard', 'exile']) panel.piles[zone].stack.update({ count: view.zones[zone].length, top: view.zones[zone][0] ?? null });
      drawBacks(panel, view.counts.hand);
    }
    if (viewingOther?.uid === uid) renderViewer(); // their pile is open in the window: show it as it is now
    panels.push(panel.section);
    if (dealt) { // (only a real game of this match; the first one this page sees is only remembered, so a refresh never replays an old cast)
      const seen = seenZones.get(uid);
      if (seen?.match === meta.match) arrivals.push([uid, seen.zones, dealt.zones]);
      seenZones.set(uid, { match: meta.match, zones: dealt.zones });
    }
  }
  for (const [uid, panel] of opponents) if (!others.some(([other]) => other === uid)) { opponents.delete(uid); panel.section.remove(); }
  renderMyHead(turnNow);
  renderStatuses();
  renderHistory(); // (everyone's entries come with their public branches)
  layoutSeats();
  if (sharedOn && game) renderPlane(); // (the other players' cards on the Shared view's plane come with their public branches)
  for (const [uid, before, after] of arrivals) celebrate(uid, before, after); // (after everything is drawn, so the effect is on the card where it now is)
}

// ---- the size of a battlefield's grid (Kevin, 2026-11-20): it fills its room from the far left to the piles with SQUARE cells, 40 rows (cards one size up from the solo table's 50) and as many columns as
// the room holds. My own board sets the grid used to place and drop my cards (shared/board-grid.mjs setBoardSize); another player's board only sets how many columns it is drawn with. ----
const TABLE_ROWS = 30; // (Grid and Shared views; Sidebar view uses SIDEBAR_ROWS, one card size smaller: Kevin, 2026-11-26)
const SIDEBAR_ROWS = 40;
const tableRows = () => (document.body.dataset.view === 'sidebar' ? SIDEBAR_ROWS : TABLE_ROWS);
// // (40 until 2026-11-23, when Kevin asked for the cards one size up again: 50 on the solo table, then 40, then 30. It must be a whole number of card heights, 10 rows: setBoardSize refuses anything else and the drag would then work in the old size, as 32 did)
setBoardSize({ cols: 112, rows: TABLE_ROWS });
function fitBoard(element, mine = false) {
  if (mine && sharedOn) { // the Shared view: one plane of a fixed size (shared/plane.mjs), moved and zoomed by its camera
    element.style.setProperty('--cols', String(PLANE_COLS)); element.style.setProperty('--rows', String(PLANE_ROWS));
    return { cols: PLANE_COLS, changed: setBoardSize({ cols: PLANE_COLS, rows: PLANE_ROWS }) };
  }
  if (mine) element.style.removeProperty('--rows');
  const width = element?.clientWidth ?? 0; const height = element?.clientHeight ?? 0; // (the size in the layout: a small copy in the Sidebar column is the same size, only scaled)
  if (!width || !height) return { cols: null, changed: false };
  const cols = Math.max(CARD_COLS, Math.floor(width / (height / tableRows()) + 0.001));
  if (element.style.getPropertyValue('--cols') !== String(cols)) element.style.setProperty('--cols', String(cols));
  return { cols, changed: mine ? setBoardSize({ cols, rows: tableRows() }) : false };
}
const watchedBoards = new WeakSet();
let refitFrame = 0;
const boardResized = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
  if (refitFrame) return;
  refitFrame = requestAnimationFrame(() => { refitFrame = 0; if (fitBoard($('battlefield'), true).changed && game) render(); if (meta?.status === 'playing') renderOpponents(); }); // (once a frame at most)
}) : null;
function watchBoardSize(element) { if (boardResized && element && !watchedBoards.has(element)) { watchedBoards.add(element); boardResized.observe(element); } }
watchBoardSize($('battlefield'));

// ---- where the areas are: Grid view (every area at once) or Sidebar view (one large; the seat cards in the rail open the others) ----
// The areas are the same elements in both views; Sidebar view hides the ones that are not shown large (class offstage). Your hand stays yours: when another player is shown large,
// it moves into their area, where their own hand would be.
// Which view is the TABLE's, picked by the host in the lobby (meta/view; Kevin, 2026-11-20): there is no switch on this page.
const seatsView = () => (meta?.view === 'sidebar' || meta?.view === 'shared' ? meta.view : 'grid'); // (Shared: everyone on one plane, 2026-11-25)
let focusUid = null; // in Sidebar view, the player shown large (null: you)
const floatingBars = []; // the history bar and the action bar, once they are mounted (further down)
// The pixels at the right of the window the floating tools keep out of: the rail, while it shows (a tool dragged over it still docks there: the pointer decides that).
const columnRoom = () => ({ right: document.body.classList.contains('rail-on') ? document.querySelector('.tool-dock[data-dock="rail"]')?.offsetWidth ?? 0 : 0 });

// The other players in turn order after you (clockwise from your seat): the first is the one who plays after you.
function othersInOrder() {
  const mine = Number(members[myUid]?.seat ?? 1);
  return [...opponents.keys()].sort((a, b) => ((Number(members[a]?.seat ?? 0) - mine + 8) % 4) - ((Number(members[b]?.seat ?? 0) - mine + 8) % 4));
}
function mySeatTitle() { const me = members[myUid]; return me ? `Seat ${me.seat}: ${me.name} (You)` : 'You'; }
function renderMyHead(turnNow = game !== null ? currentTurnInfo() : null) {
  $('my-name').textContent = mySeatTitle();
  $('my-plate-life').textContent = game ? String(game.life) : '';
  $('seat-me').classList.toggle('active', turnNow !== null && turnNow.uid === myUid);
  $('seat-me').style.setProperty('--seat-color', playerColor(myUid));
}
// ---- the Shared view (Kevin, 2026-11-25; shared/plane.mjs): every battlefield on ONE plane; anyone moves any card ----
// Your cards are your battlefield's own children (the usual drag and menus); another player's are in their own layer (.plane-layer[data-owner]), moved by src/plane-drag.js.
// A card's place is its plane entry (tables/{code}/plane/{seat}/{uid}) when it has one, else its cell in its owner's area. Only the place is shared: tapping, counters and
// moving a card to a pile stay with its owner, and hands and libraries stay private.
let sharedOn = false;
let planeRaw = {};
let planeWatching = false;
const planeLayers = new Map(); // uid -> { layer, nodes }
const PLANE_CELL_PX = 16;
const seatList = () => Object.values(members).map((member) => String(member.seat));
const mySeatNow = () => String(members[myUid]?.seat ?? '1');
const myHomeNow = () => homeOf(mySeatNow(), seatList()) ?? { x: 0, y: 0, w: HOME_COLS, h: HOME_ROWS };
const planeEntry = (seat, uid) => readPlaneEntry(planeRaw?.[seat]?.[uid], meta?.match);
const byPlaneZ = (cards, seat) => [...cards].sort((a, b) => (planeEntry(seat, a.uid)?.z ?? 0) - (planeEntry(seat, b.uid)?.z ?? 0)); // (moved last, drawn on top)
function myPlaneCells() {
  const base = boardCells(game);
  const home = myHomeNow();
  const seat = mySeatNow();
  return new Map(game.zones.battlefield.map((card) => [card.uid, planeCell(base.get(card.uid), planeEntry(seat, card.uid), home)]));
}
const nextPlaneZ = () => 1 + Math.max(0, ...Object.values(planeRaw ?? {}).flatMap((cards) => Object.values(cards ?? {}).map((entry) => (Number.isInteger(entry?.z) ? entry.z : 0))));
let planeRefusedSaid = false;
// Moves one card on the plane: shown at once, stored as its plane entry (any member may write it while the match is on).
function movePlane(seat, uid, cell, { draw = true } = {}) {
  const entry = entryFor(cell, nextPlaneZ(), myUid, meta?.match);
  if (!entry) return;
  planeRaw = { ...planeRaw, [seat]: { ...(planeRaw?.[seat] ?? {}), [uid]: entry } };
  savePlaneMove(tableCode, { seat, uid, entry }).catch(() => { if (!planeRefusedSaid) { planeRefusedSaid = true; say('Not moved for the others: the database rules need updating.', true); } });
  if (draw && game) render();
}
// Your own cards moved on the plane: one, a pile (Shift or held) or the cards you picked, each by the same number of cells.
function dropOnPlane({ uid, col, row, whole, group, name }) {
  const cells = myPlaneCells();
  const start = cells.get(uid);
  if (!start) return;
  let uids = [uid];
  if (group) uids = group.filter((each) => cells.has(each));
  else if (whole) uids = game.zones.battlefield.filter((card) => { const at = cells.get(card.uid); return at && at.col === start.col && at.row === start.row; }).map((card) => card.uid);
  const seat = mySeatNow();
  for (const each of uids) { const at = cells.get(each); movePlane(seat, each, { col: at.col + col - start.col, row: at.row + row - start.row }, { draw: false }); }
  say(uids.length > 1 ? `Moved ${uids.length} cards.` : `Moved ${name}.`);
  render();
}
// ---- the Shared view: anyone taps any card and changes anyone's life (2026-11-26 feedback; the rules allow it only in the Shared view during a match) ----
// Another player's change lands on MY stored branch; my page takes it into my game (it is stored already, so nothing is saved again). My own writes are seen by the
// database's local copy at once, so a stored value that differs from my game is someone else's.
function adoptRemoteChanges() {
  if (!game || !sharedOn || !myUid) return;
  const mine = publicAll[myUid];
  if (!mine || mine.match !== meta?.match) return;
  let changed = false;
  let next = game;
  if (Number.isSafeInteger(mine.life) && mine.life !== game.life) { next = { ...next, life: mine.life }; changed = true; }
  const stored = Object.values(mine.battlefield && typeof mine.battlefield === 'object' ? mine.battlefield : {});
  const battlefield = next.zones.battlefield.map((card) => {
    const there = stored.find((each) => each?.u === card.uid);
    if (!there || (there.x === 1) === Boolean(card.tapped)) return card;
    changed = true;
    return { ...card, tapped: there.x === 1 };
  });
  if (!changed) return;
  game = { ...next, zones: { ...next.zones, battlefield } };
  render();
}
// Taps or untaps another player's card (its place in their stored battlefield), or changes their life by `delta`.
function tapOthersCard(owner, uid) {
  const list = publicAll[owner]?.battlefield;
  const key = list && typeof list === 'object' ? Object.keys(list).find((k) => list[k]?.u === uid) : null;
  if (key === null || key === undefined) return;
  const tapped = list[key].x === 1;
  writeShared(tableCode, { [`public/${owner}/battlefield/${key}/x`]: tapped ? null : 1 }).then(() => say(`${tapped ? 'Untapped' : 'Tapped'} ${members[owner]?.name ?? 'their'}’s ${list[key].n ?? 'card'}.`)).catch((error) => say(`Not tapped (${friendlyMessage(error)}).`, true));
}
function changeOthersLife(owner, delta) {
  const life = publicAll[owner]?.life;
  if (!Number.isSafeInteger(life)) return;
  writeShared(tableCode, { [`public/${owner}/life`]: life + delta }).catch((error) => say(`Not changed (${friendlyMessage(error)}).`, true));
}
// The homes, the commons and the other players' cards, drawn into the plane (under your own cards).
function renderPlane() {
  const board = $('battlefield');
  const seats = seatList();
  let homes = board.querySelector(':scope > .plane-homes');
  if (!homes) { homes = make('div', 'plane-homes plane-keep'); homes.setAttribute('aria-hidden', 'true'); board.prepend(homes); }
  const commons = make('div', 'plane-commons'); // (no word in it: 2026-11-26 feedback)
  commons.style.gridRow = '51 / span 30'; commons.style.gridColumn = '1 / -1';
  const frames = Object.entries(members).map(([uid, member]) => {
    const home = homeOf(String(member.seat), seats);
    if (!home) return null;
    const frame = make('div', `plane-home${uid === myUid ? ' mine' : ''}`);
    frame.style.gridColumn = `${home.x + 1} / span ${home.w}`; frame.style.gridRow = `${home.y + 1} / span ${home.h}`;
    frame.style.setProperty('--seat-color', playerColor(uid));
    const life = uid === myUid ? game?.life : opponents.get(uid)?.view?.life;
    const hand = uid === myUid ? game?.zones.hand.length : opponents.get(uid)?.view?.counts.hand;
    // (2026-11-26 feedback) the player's pill in the middle of their area, turned to face them: their name, life (your own with - and +) and cards in hand;
    // and their hand face down just outside their side of the table
    const facing = facingOf(String(member.seat), seats);
    frame.dataset.facing = String(facing);
    const plate = make('div', 'plane-plate');
    const lifeBox = make('span', 'plane-plate-lifebox');
    // every pill has - and + (2026-11-26 feedback: change anyone's life on the table); yours changes your game, another player's writes their stored life
    for (const [sign, words] of [[-1, '−'], [1, '+']]) {
      const button = make('button', 'plane-life-step', words);
      button.type = 'button';
      button.setAttribute('aria-label', `${sign < 0 ? 'Lose' : 'Gain'} 1 life${uid === myUid ? '' : ` for ${member.name}`} (Shift: 5)`);
      button.addEventListener('click', (event) => {
        const step = sign * (event.shiftKey ? 5 : 1);
        if (uid === myUid) { if (game) apply(() => adjustLife(game, step), ''); } else changeOthersLife(uid, step);
      });
      lifeBox.append(button);
    }
    lifeBox.insertBefore(make('span', 'plane-plate-life num', String(life ?? '')), lifeBox.lastChild);
    plate.append(make('span', 'plate-dot'), make('strong', 'plane-plate-name', uid === myUid ? `${member.name} (you)` : member.name), lifeBox, make('span', 'plane-plate-hand', hand === undefined ? '' : `Hand ${hand}`));
    frame.append(plate);
    const backs = make('div', 'plane-hand');
    for (let n = 0; n < Math.min(Number(hand) || 0, 15); n++) backs.append(make('span', 'plane-back'));
    frame.append(backs);
    return frame;
  }).filter(Boolean);
  homes.replaceChildren(commons, ...frames);
  board.dataset.facing = String(facingOf(mySeatNow(), seats)); // (your own cards face your edge of the table)
  for (const uid of othersInOrder()) {
    const member = members[uid];
    const view = opponents.get(uid)?.view;
    if (!member || !view) continue;
    let entry = planeLayers.get(uid);
    if (!entry) {
      const layer = make('div', 'plane-layer battlefield plane-keep'); // (battlefield: its cards get the battlefield's card rules; src/styles/game-shell.css undoes the board's own look on it)
      layer.dataset.owner = uid;
      entry = { layer, nodes: makeCardNodes({ readOnly: true, printedStats: (card) => printedOf(card, lookup) }) };
      planeLayers.set(uid, entry);
    }
    if (entry.layer.parentElement !== board) homes.after(entry.layer);
    const seat = String(member.seat);
    const home = homeOf(seat, seats);
    const base = placeAll(view.zones.battlefield, isLandCard);
    const cells = new Map(view.zones.battlefield.map((card) => [card.uid, planeCell(base.get(card.uid), planeEntry(seat, card.uid), home)]));
    entry.layer.style.setProperty('--seat-color', playerColor(uid));
    entry.layer.dataset.facing = String(facingOf(seat, seats)); // (their cards face them: 2026-11-26 feedback)
    entry.nodes.place(entry.layer, byPlaneZ(view.zones.battlefield, seat), { battlefield: true, cells, sharp: true });
    for (const button of entry.layer.children) { button.disabled = false; button.tabIndex = -1; button.title = `${member.name}'s. Drag to move it, double-click to tap it.`; } // (another player's card: it can be moved and tapped, nothing else)
  }
  for (const [uid, entry] of planeLayers) if (!opponents.has(uid)) { entry.layer.remove(); planeLayers.delete(uid); }
  // the entries of your cards that left the battlefield are cleared (only by you, the owner)
  const mine = planeRaw?.[mySeatNow()] ?? {};
  const gone = Object.keys(mine).filter((uid) => !game?.zones.battlefield.some((card) => card.uid === uid));
  if (gone.length) { planeRaw = { ...planeRaw, [mySeatNow()]: Object.fromEntries(Object.entries(mine).filter(([uid]) => !gone.includes(uid))) }; clearPlaneEntries(tableCode, mySeatNow(), gone).catch(() => {}); }
  renderCarries();
}
// a double click on another player's card taps or untaps it (2026-11-26 feedback)
$('battlefield').addEventListener('dblclick', (event) => {
  if (!sharedOn || !game) return;
  const button = event.target.closest?.('.plane-layer > .card');
  const owner = button?.closest('.plane-layer')?.dataset.owner;
  if (!button || !owner) return;
  event.preventDefault();
  tapOthersCard(owner, button.dataset.uid);
});
// The Shared view on or off: the plane's size, its camera, the watch of the plane, and its layers taken away again when it goes.
function setShared(on) {
  if (on === sharedOn) return;
  sharedOn = on;
  document.body.classList.toggle('plane-on', on);
  if (on && !planeWatching && tableCode) { planeWatching = true; watchPlane(tableCode, (value) => { planeRaw = value && typeof value === 'object' ? value : {}; if (sharedOn && game) render(); }); watchCarry(tableCode, (value) => { carryRaw = value && typeof value === 'object' ? value : {}; if (sharedOn) renderCarries(); }); }
  if (on && !carryArmed && tableCode) { carryArmed = true; armCarry(tableCode).catch(() => { carryArmed = false; }); }
  if (!on) { for (const element of $('battlefield').querySelectorAll(':scope > .plane-keep')) element.remove(); planeLayers.clear(); delete $('battlefield').dataset.facing; }
  fitBoard($('battlefield'), true);
  planeCamera?.setActive(on);
  if (game) render();
}
const homeBox = (uid) => { const home = homeOf(String(members[uid]?.seat ?? ''), seatList()); return home ? { x: home.x * PLANE_CELL_PX, y: home.y * PLANE_CELL_PX, w: home.w * PLANE_CELL_PX, h: home.h * PLANE_CELL_PX } : null; };
// a click on a player turns the table to their seat and shows their area (2026-11-26 feedback)
function showHomeOf(uid) { const seat = String(members[uid]?.seat ?? ''); const home = homeOf(seat, seatList()); if (home) planeCamera?.turnTo(facingOf(seat, seatList()), home, PLANE_CELL_PX); }
let planeCamera = null;

// ---- a card being carried, seen by the other players (Kevin, 2026-11-26) ----
// While you carry a card on the plane, your page writes where it is (tables/{code}/carry/{you}: its owner's seat, the card, its cell), at most 8 times a second and only when
// the cell changes; the drop removes it, and so does the database if your page disconnects. Every other page lifts that card off the felt, glides it after the carrier, outlines
// the cell it is over with the carrier's name, and refuses to let anyone else pick it up meanwhile. A card from a hand is never reported (it is hidden until it is played).
let carryRaw = {};
let carryArmed = false;
const carryOut = { key: '', last: 0, timer: 0, pending: null };
function flushCarry() {
  carryOut.timer = 0;
  const value = carryOut.pending;
  if (!value) return;
  carryOut.pending = null; carryOut.last = Date.now(); carryOut.key = JSON.stringify(value);
  setCarry(tableCode, value).catch(() => {});
}
function sendCarry(seat, card, cell) {
  if (!sharedOn || !tableCode) return;
  if (!cell) { // dropped, or off the plane: no more record
    clearTimeout(carryOut.timer); carryOut.timer = 0; carryOut.pending = null;
    if (carryOut.key) { carryOut.key = ''; setCarry(tableCode, null).catch(() => {}); }
    return;
  }
  const value = { seat: String(seat), card, x: Math.min(Math.max(cell.col, 0), PLANE_COLS - CARD_COLS), y: Math.min(Math.max(cell.row, 0), PLANE_ROWS - CARD_ROWS), m: meta?.match };
  if (JSON.stringify(value) === carryOut.key) return;
  carryOut.pending = value;
  const wait = 125 - (Date.now() - carryOut.last);
  if (wait <= 0) flushCarry(); else if (!carryOut.timer) carryOut.timer = setTimeout(flushCarry, wait);
}
// the cards other players are carrying right now: lifted, moved to where they are, the cell they are over outlined with the carrier's name
function carriedBy(button) {
  for (const [uid, value] of Object.entries(carryRaw ?? {})) {
    if (uid === myUid || !value || value.m !== meta?.match || value.card !== button.dataset.uid) continue;
    const owner = button.closest('.plane-layer')?.dataset.owner ?? myUid;
    if (String(members[owner]?.seat) === String(value.seat)) return uid;
  }
  return null;
}
function renderCarries() {
  const board = $('battlefield');
  for (const button of board.querySelectorAll('.card.carried-remote')) { button.classList.remove('carried-remote'); button.style.removeProperty('--carry-x'); button.style.removeProperty('--carry-y'); }
  for (const outline of board.querySelectorAll(':scope > .plane-target.remote')) outline.remove();
  if (!sharedOn) return;
  for (const [uid, value] of Object.entries(carryRaw ?? {})) {
    if (uid === myUid || !value || value.m !== meta?.match || !members[uid]) continue;
    const owner = Object.entries(members).find(([, member]) => String(member.seat) === String(value.seat))?.[0];
    if (!owner) continue;
    const scope = owner === myUid ? board : planeLayers.get(owner)?.layer;
    const button = scope?.querySelector(`:scope > .card[data-uid="${value.card}"]`);
    if (!button) continue;
    button.classList.add('carried-remote');
    button.style.setProperty('--carry-x', `${(value.x - Number(button.dataset.col)) * PLANE_CELL_PX}px`);
    button.style.setProperty('--carry-y', `${(value.y - Number(button.dataset.row)) * PLANE_CELL_PX}px`);
    button.style.setProperty('--carrier-color', playerColor(uid));
    const outline = make('div', 'plane-target remote plane-keep');
    outline.style.gridColumnStart = String(value.x + 1); outline.style.gridRowStart = String(value.y + 1);
    outline.style.setProperty('--carrier-color', playerColor(uid));
    outline.append(make('span', 'plane-carrier', members[uid].name));
    board.append(outline);
  }
}

function focusSeat(uid) {
  focusUid = uid === myUid ? null : uid;
  layoutSeats();
}
function layoutSeats() {
  const others = othersInOrder();
  others.forEach((uid, index) => { opponents.get(uid).section.dataset.slot = `o${index + 1}`; });
  const viewNow = game !== null ? seatsView() : 'grid';
  const sidebar = viewNow === 'sidebar';
  const shared = viewNow === 'shared'; // (everyone on one plane: only your area shows, and it holds the plane)
  document.body.dataset.view = viewNow;
  if (game !== null) showHelpOnce(viewNow); // (the first time this view opens in this browser: its main keys and controls, 2026-11-26 feedback)
  const me = $('seat-me');
  const hand = $('hand-section');
  const areaOf = (uid) => (uid === myUid ? me : opponents.get(uid)?.section ?? null);
  if (focusUid !== null && !opponents.has(focusUid)) focusUid = null;
  const focusedArea = sidebar ? areaOf(focusUid ?? myUid) : shared ? me : null;
  const before = { hand: hand.parentElement, focused: focusedArea };
  // the other areas in turn order (the style sheet places them by data-slot); nothing is moved that is already in its place
  // (the redesign: every area stays in the stage; in Sidebar view the ones not shown large are hidden, and the seat cards in the rail take the place of the column of small copies)
  const gridAreas = others.map((uid) => opponents.get(uid).section);
  for (const area of [me, ...gridAreas]) { area.classList.toggle('focused', area === focusedArea); area.classList.remove('mini'); area.classList.toggle('offstage', (sidebar || shared) && area !== focusedArea); }
  placeChildren($('opponent-list'), gridAreas);
  if (me.parentElement !== $('seats-stage')) $('seats-stage').append(me);
  const docked = sidebar && focusedArea !== me;
  if (docked) { if (hand.parentElement !== focusedArea) focusedArea.append(hand); } else if (hand.parentElement !== me) me.append(hand); // (docked: in the large area, where that player's own hand would be)
  hand.classList.toggle('docked', docked);
  $('seats-stage').classList.toggle('hand-docked', docked);
  // The rail (the redesign, Kevin 2026-11-24): the Players section, the history, the stack and your console are docked on the right in both views (src/tool-dock.js);
  // every part can be dragged out to float and back (the console floated by default in Sidebar view until 2026-11-25, over the hand).
  const toolMode = game === null ? 'none' : sidebar || shared ? 'focus' : 'grid';
  setShared(shared);
  const toolsChanged = toolDocks.mode() !== toolMode;
  document.body.classList.toggle('rail-on', toolMode !== 'none');
  toolDocks.layout(toolMode);
  $('players-panel').hidden = toolMode === 'none';
  renderPlayersPanel();
  if (toolsChanged) for (const bar of floatingBars) bar.relayout();
  if (before.hand !== hand.parentElement || before.focused !== focusedArea) handView.arrange();
}

// Puts these children in this parent in this order, touching the page only when they are not already so (moving an element restarts its animations and loses the pointer's hover).
function placeChildren(parent, wanted) {
  const now = [...parent.children];
  if (now.length === wanted.length && now.every((child, index) => child === wanted[index])) return;
  parent.replaceChildren(...wanted);
}

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

// The ping on show ({ uid, k }) and my own last ping record (to close it for everyone). 2026-11-26 feedback: the pinger can close a ping for everyone (the others can still close
// it on their own screen), and the others can say they saw it; the pinger sees who did.
let pingShown = null;
let myPingRecord = null;
const nameOf = (uid) => (typeof members[uid]?.name === 'string' ? members[uid].name : 'A player');
function seenWords() {
  if (!myPingRecord) return '';
  const who = seenBy(publicAll, myUid, myPingRecord.k).map(nameOf);
  return who.length ? `Seen by ${who.join(', ')}` : '';
}
function showPing({ uid, k, card }) {
  const member = members[uid];
  const sentence = pingSentence(nameOf(uid), typeof member?.seat === 'string' ? member.seat : '', card);
  cornerMode = 'ping';
  $('spotlight').dataset.mode = 'ping';
  pingShown = { uid, k };
  const actions = uid === myUid
    ? [{ id: 'ping-close-all', label: 'Close for all', onClick: () => closeMyPing() }]
    : [{ id: 'ping-seen', label: 'Seen', onClick: (button) => ackPing(uid, k, button) }];
  spotlight.show({ card, sentence, detail: marksSentence(card, printedOf(card, lookup)), closable: true, actions, note: uid === myUid ? seenWords() : '' });
  glowCard(uid, card.uid);
}
async function closeMyPing() {
  if (!myPingRecord) return;
  pingShown = null;
  spotlight.hide();
  bringBackSelectionToCorner();
  try { await saveGame(tableCode, { [`public/${myUid}/ping`]: closedPing(myPingRecord) }); say('Ping closed for everyone.'); } catch (error) { say(`Not closed (${friendlyMessage(error)}).`, true); }
}
async function ackPing(uid, k, button) {
  button.disabled = true;
  try { await saveGame(tableCode, { [`public/${myUid}/ack/${uid}`]: k }); button.textContent = 'Seen ✓'; } catch (error) { button.disabled = false; say(`Not sent (${friendlyMessage(error)}).`, true); }
}

// Shows the pings that are new in the table's public branches (this match's branches only: one left over from an earlier match does not count).
function processPings() {
  if (!publicSeen || !meta) return; // nothing is judged until both are known, so the first snapshot is not mistaken for new pings
  const branches = {};
  for (const [uid, branch] of Object.entries(publicAll)) if (branch?.match === meta.match) branches[uid] = branch;
  const result = newPings(branches, pingSeen, lookup ?? (() => null));
  pingSeen = result.seen;
  for (const ping of result.shown) if (ping.uid !== myUid && !readPing(branches[ping.uid]?.ping, () => null)?.closed) showPing(ping); // my own ping was shown when I sent it; one already closed is not shown
  // the ping on show: closed by its pinger (it goes, here too), or mine (who saw it)
  if (pingShown && cornerMode === 'ping') {
    if (pingShown.uid === myUid) spotlight.setNote(seenWords());
    else { const now = readPing(publicAll[pingShown.uid]?.ping, () => null); if (now && now.k === pingShown.k && now.closed) { pingShown = null; spotlight.hide(); bringBackSelectionToCorner(); } }
  }
}

async function sendPing(card, zone) {
  if (!game || !canPing(zone)) return;
  if (Date.now() - lastPingAt < 700) return; // a key held down or a double click is one ping
  let record;
  try { record = makePing(card, zone, { previous: lastPingKey }); } catch (error) { say(error.message, true); return; }
  lastPingAt = Date.now();
  lastPingKey = record.k;
  myPingRecord = record;
  if (pingSeen) pingSeen = { ...pingSeen, [myUid]: record.k }; // so the copy that comes back from the database is not shown a second time
  showPing({ uid: myUid, k: record.k, card });
  try {
    await saveGame(tableCode, { [`public/${myUid}/ping`]: record });
    say(`Pinged ${card.n}.`);
  } catch (error) {
    say(`Ping not sent (${friendlyMessage(error)}).`, true);
  }
}

// ---- starting the page ----
async function start() {
  tableCode = tableCodeFromPath(location.pathname);
  if (!tableCode) { say('Not a table address.', true); return; }
  $('code').textContent = tableCode;
  let mine;
  try {
    mine = await rejoinTable(tableCode);
  } catch (error) {
    say(friendlyMessage(error), true);
    return;
  }
  if (!mine) { showClosedTable({ reason: 'missing' }); return; }
  myUid = mine.uid;

  keepAlive = startKeepAlive({ code: tableCode, document, api: { heartbeat, watchServerOffset, watchMeta, watchActivity }, bannerElement: $('banner'), formatTime, onClosed: (reason) => { closedReason = reason; showClosedTable({ reason }); } });
  startPresence(tableCode, { onProblem: () => {} });
  watchMeta(tableCode, (value) => {
    meta = value ?? null;
    host = value?.host ?? null;
    processPings(); // the first snapshot of the pings is remembered once the match number and the public branches are both known, whichever arrives first
    if (value === null || value === undefined) showClosedTable({ reason: closedReason ?? 'gone' }); // (the table was deleted: its host closed it, or it expired and someone cleaned it up)
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
    const mine = tableColors(members)[myUid];
    if (mine) setMyColor(mine); // (your color is the accent on this page and the others: src/accent.js)
    if (mine) { $('seat-me').style.setProperty('--seat-color', colorValue(mine)); $('seat-me').style.setProperty('--seat-ink', inkOn(colorValue(mine))); } // (your own area's stripe and highlight)
    renderPlayers();
    renderCounters();
    renderTurn();
    renderOpponents();
  });
  watchPublic(tableCode, (value) => { publicAll = value && typeof value === 'object' ? value : {}; publicSeen = true; adoptRemoteChanges(); processPings(); renderTurn(); renderOpponents(); });
  watchStack(tableCode, (value) => { storedStack = value; showStoredStack(); }); // the table's one stack: any player's change shows on every page
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
// A table that has closed answers every action with the closed window (Kevin, 2026-11-26: Leave and End the match on a closed table led back to it, a loop).
async function act(task) {
  if (closedReason || keepAlive?.state().closed) { showClosedTable({ reason: closedReason ?? 'gone' }); return; }
  try { await task(); } catch (error) { if (keepAlive?.state().closed) showClosedTable({ reason: closedReason ?? 'gone' }); else say(friendlyMessage(error), true); }
}
$('concede').addEventListener('click', () => act(async () => {
  if (!(await askConfirm({ title: 'Concede this match?', message: 'It cannot be taken back. The table will see that you conceded, and you can still look at the table.', confirmLabel: 'Concede', returnFocus: $('concede') }))) return;
  await concede(tableCode);
  say('You conceded this match.');
}));
$('take-over').addEventListener('click', () => act(async () => {
  await takeOverHost(tableCode);
  say('You are now the host.');
}));
$('end-match').addEventListener('click', () => act(async () => {
  if (!(await askConfirm({ title: 'End the match for everyone?', message: 'Everyone goes back to the lobby, and the games on the table are not kept.', confirmLabel: 'End the match', returnFocus: $('end-match') }))) return;
  await endMatch(tableCode); // the table's status changes and every table page takes its player back to the lobby
}));
$('leave').addEventListener('click', () => act(async () => {
  if (!(await askConfirm({ title: 'Leave the table?', message: 'During a match your seat is kept for you until it ends, so you can come back with the table code.', confirmLabel: 'Leave', returnFocus: $('leave') }))) return;
  await leaveTable(tableCode);
  location.assign('/');
}));

// ---- wiring ----
mountMarksPanel($('marks'), {
  target: () => { const found = selected && game ? findCard(selected) : null; return found && found.zone === 'battlefield' ? { uid: found.card.uid, name: found.card.n } : null; },
  onChange: (change, message) => { if (game) apply(() => change(game), message); },
  say,
});
{ const close = make('button', 'secondary modify-close', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Close'); close.title = 'Close'; close.addEventListener('click', () => { closeModify(); document.querySelector('.card.selected')?.focus(); }); ($('marks').querySelector('.marks-head') ?? $('marks')).append(close); }
$('draw').addEventListener('click', () => { if (!game) return; const info = currentTurnInfo(); const step = info.uid === myUid ? phaseNow(info) : null; drawOne(); if (step === 2) setStep(3); }); // (on your turn, Draw during the Draw step moves on to Main 1: Kevin's friends, 2026-11-26)
$('draw').addEventListener('contextmenu', (event) => { event.preventDefault(); if (game) drawCards(3); }); // (a right-click draws 3: Kevin's friends, 2026-11-26)
$('draw').title = 'Draw. Right-click: draw 3';
$('pass-turn').addEventListener('click', async () => {
  if (!game) return;
  const info = currentTurnInfo();
  // Anyone may press it: when it is not your turn it skips that player (they have left the table, or cannot play), so it asks first.
  if (info.uid !== myUid && !(await askConfirm({ title: `Skip ${whoseWords(info, myUid)}?`, message: 'Use this when that player has left the table or cannot play.', confirmLabel: 'Skip', returnFocus: $('pass-turn') }))) return;
  try {
    const action = passAction(info, members, conceded, myUid);
    apply(() => action.run(game), action.message);
  } catch (error) {
    say(error.message, true);
  }
});
$('take-back').addEventListener('click', () => { if (game) { const action = takeBackAction(currentTurnInfo()); apply(() => action.run(game), action.message); } });
$('untap-all').addEventListener('click', () => { if (game) { const info = currentTurnInfo(); const step = info.uid === myUid ? phaseNow(info) : null; play('tap'); apply(() => untapAll(game), untapMessage(game)); if (step === 0) setStep(1); } }); // (on your turn, Untap all during Untap moves on to Upkeep)
$('next-step').addEventListener('click', () => { if (!game) return; const info = currentTurnInfo(); if (info.uid === myUid) setStep(nextStep(phaseNow(info))); });
mountLookSettings($('look-settings'));
mountEffectSettings($('look-settings'));
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
  apply(() => action.run(game), action.message, { note: id === 'shuffle' || id === 'intolibrary' ? 'shuffle' : null });
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
  label.dataset.short = { library: 'Library', graveyard: 'GY', exile: 'Exile' }[zone] ?? name; // (the areas of the table are small: the style sheet shows the short name)
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
// The game history: a thin bar that opens downward (src/history-bar.js, as on the solo table), here with everyone's moves (shared/live-history.mjs); it starts at the right edge, over the column above the piles of the top area.
// the docks are made before the tools are mounted (each floating tool asks them where a drag lands); the stack window is pinned by them, once it exists
let stackWindowRef = null;
const toolDocks = createToolDocks({
  elements: { players: $('players-panel'), stack: $('stack-window'), history: $('history-bar'), bar: document.querySelector('.actions-panel') },
  stackWindow: { pin: (on) => stackWindowRef?.pin(on) },
  onFloat: () => { for (const bar of floatingBars) bar.relayout(); },
  store,
});
playersPanel = mountPlayersPanel({ root: $('players-panel'), store, room: columnRoom, docking: toolDocks.dockingFor('players'), onFocus: (uid) => { if (sharedOn) showHomeOf(uid ?? myUid); else focusSeat(uid ?? myUid); } });
floatingBars.push(playersPanel);
// The Players section of the rail (the redesign, Kevin 2026-11-24): a seat card per player in turn order from you, with their life, commanders and tax, cards held,
// counters and a summary of their battlefield. Sidebar view: a click on a card shows that board large; your own card is always there (Kevin, 2026-11-26), marked while your board is large.
function renderPlayersPanel() {
  if (!playersPanel || $('players-panel').hidden || !myUid) return;
  const turnNow = game !== null ? currentTurnInfo() : null;
  const nextSeat = turnNow ? nextSeatAfter(members, turnNow.seat, conceded) : null;
  const sidebar = document.body.dataset.view === 'sidebar';
  const jump = sidebar || sharedOn; // (a click on a seat card: Sidebar shows that area large, Shared glides the camera to it)
  const rows = [];
  if (members[myUid]) rows.push({ uid: myUid, seat: members[myUid].seat, color: playerColor(myUid), mine: true, name: members[myUid].name, life: game?.life, active: turnNow?.uid === myUid, next: turnNow?.uid !== myUid && members[myUid].seat === nextSeat, clickable: jump, focused: sidebar && !sharedOn && focusUid === null, chips: game ? chipEntries(game.pc, game.cd, commanderDamageSeatsFor(members, game.cd, meta?.format)) : [],
    commanders: game ? taxEntries(game).map((entry) => ({ name: entry.name, tax: entry.tax })) : [] });
  for (const uid of othersInOrder()) {
    const member = members[uid]; const view = opponents.get(uid)?.view;
    if (!member || !view) continue;
    const named = new Map(view.zones.command.map((card) => [card.uid, card.n])); // their commanders: the cards in their command zone, and any card out with a commander tax
    for (const zone of ['battlefield', 'graveyard', 'exile']) for (const card of view.zones[zone]) if (view.tax[card.uid] && !named.has(card.uid)) named.set(card.uid, card.n);
    rows.push({ uid, seat: member.seat, color: playerColor(uid), name: member.name, status: statusWords(uid), life: view.life, active: turnNow?.uid === uid, next: turnNow?.uid !== uid && member.seat === nextSeat,
      clickable: jump, focused: !sharedOn && focusUid === uid, hand: view.counts.hand, library: view.counts.library,
      commanders: [...named].map(([uid2, name]) => ({ name, tax: (view.tax[uid2] ?? 0) * TAX_PER_CAST })), chips: chipEntries(view.pc, view.cd, commanderDamageSeatsFor(members, view.cd, meta?.format)), summary: summarizeBoard(view.zones.battlefield) });
  }
  playersPanel.update(rows);
}
const historyBar = mountHistoryBar({ root: $('history-bar'), store, key: 'overloaded.seatsHistoryBar', room: columnRoom, docking: toolDocks.dockingFor('history') });
floatingBars.push(historyBar);
floatingBars.push(mountTurnPiece({ piece: $('turn-piece'), grip: $('turn-grip'), bar: $('game-bar'), before: $('topbar-slot'), floatHost: $('game'), store, key: 'overloaded.seatsTurnPlace', room: columnRoom })); // (the turn and its steps: dragged out of the top bar to float, 2026-11-26 feedback)
noteMessage = (message, options) => { if (document.body.classList.contains('playing')) historyBar.note(message, options); }; // (outside a game the line itself shows)
// The stack window (src/stack-window.js, as on the solo table), shared by the table (shared/stack-sync.mjs): every change here is stored whole, every stored change is shown. Its arrows can point at any
// player's card; every player's cards are numbered from c1, so an arrow to a card says whose it is.
let storedStack = null;
const stackWindow = mountStackWindow({
  root: $('stack-window'), say, printedStats: (card) => printedOf(card, lookup), store, docking: toolDocks.dockingFor('stack'), room: columnRoom, placeKey: 'overloaded.seatsStackPlace',
  realCardSelector: '.battlefield .card[data-uid]',
  targetOf: (element) => ({ card: element.dataset.uid, owner: element.closest('.opponent')?.dataset.uid ?? myUid }),
  realCard: (target) => (!target.owner || target.owner === myUid ? $('battlefield') : opponents.get(target.owner)?.board)?.querySelector(`.card[data-uid="${CSS.escape(target.card)}"]`) ?? null,
  onChange: (stack) => { if (tableCode && myUid && meta) saveStack(tableCode, packStack(stack, myUid, meta.match)).catch((error) => say(`Stack not saved (${friendlyMessage(error)}).`, true)); },
});
stackWindowRef = stackWindow;
floatingBars.push(stackWindow);
function showStoredStack() { stackWindow.replace(readStack(storedStack, lookup ?? (() => null), meta?.match ?? null)); }
mountFacing($('facing-settings'), { store });
mountHandRestSetting($('hand-rest-settings'), { onChange: () => handView.arrange() });
mountHandSizeSetting($('hand-rest-settings'), { onChange: () => handView.arrange() });
mountHelpSettings($('help-settings'), { views: ['grid', 'sidebar', 'shared'] });
mountKeybindSettings($('keybind-settings'), { keybinds, page: 'table' });
$('pile-sideboard').addEventListener('click', () => settings.close()); // the viewer opens over the table; the Settings panel would only be in the way

// Two clicks close together in time and place tap or untap the card under the second one. This is counted here rather than taken from the browser's own double click event, which fires only for
// the second click of a run (a third and fourth quick click are not double clicks) and so made fast tapping unreliable. A pair is used up, so four quick clicks are two taps. No waiting time.
const TAP_PAIR_MS = 450;
const TAP_PAIR_PX = 14;
let lastBoardClick = { at: 0, x: 0, y: 0 };
$('battlefield').addEventListener('click', (event) => {
  if (!game || event.detail === 0 || event.target.closest('[data-mark], [data-badge]')) return; // detail 0: a click made by the keyboard or by a script, not by the mouse
  const button = event.target.closest('#battlefield > .card'); // (only your own cards: on the Shared view another player's cards are in their own layer, numbered like yours)
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
const GAME_KEYS = new Set(['undo', 'nextPhase', 'mulligan', 'shuffle', 'arrange', 'lifeUp', 'lifeDown', 'viewLibrary', 'viewGraveyard', 'viewExile', 'sortType', 'sortColor', 'sortCost', 'sortName', 'autoSort', 'history', 'stack']);
const CLICKS = { history: '#history-bar .history-head', stack: '.stack-tab', viewLibrary: '#pile-library', viewGraveyard: '#pile-graveyard', viewExile: '#pile-exile', sortType: '.hand-sort[data-sort="type"]', sortColor: '.hand-sort[data-sort="color"]', sortCost: '.hand-sort[data-sort="cost"]', sortName: '.hand-sort[data-sort="name"]', autoSort: '.hand-sort-toggle' };
function runGameKey(action) {
  if (action === 'undo') { doUndo(); return true; }
  if (action === 'nextPhase') { const info = currentTurnInfo(); if (info.uid !== myUid) return false; setStep(nextStep(phaseNow(info))); return true; }
  if (action === 'shuffle') { pickFromPileMenu('library', 'shuffle'); return true; }
  if (action === 'mulligan') { doMulligan(); return true; } // (no button: it is in the hand's menu)
  if (action === 'arrange') { arrangeNow(); return true; } // (no button)
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
  if (action === 'toCommand') { // the card under the pointer, from the battlefield or the hand, to the command zone (a key of its own, unbound at first)
    const under = pointerAt ? document.elementFromPoint(pointerAt.x, pointerAt.y)?.closest('#battlefield > .card, #hand > .card') : null;
    const card = under && game ? findCard(under.dataset.uid) : null;
    if (!card || card.zone === 'command') return;
    event.preventDefault();
    apply(() => moveCard(game, card.card.uid, 'command', {}), `${card.card.n} to the command zone.`);
    return;
  }
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
  const handCard = event.shiftKey && event.button === 0 && event.target.closest('#hand > .card'); // (Shift and a drag that starts ON a card of the hand picks cards too: in a fanned hand there is hardly any empty space to start on, 2026-11-26 feedback)
  if (!game || event.button !== 0 || event.pointerType === 'touch' || (!handCard && event.target.closest('.card, button, .stack-hold-ring, .seat-head, .side-panels'))) return;
  const zone = handCard || handView.over(event.clientX, event.clientY) ? 'hand' : event.target.closest('#battlefield') ? 'battlefield' : null;
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
// "Add a card" (2026-11-26 feedback): any card from the card list onto your battlefield, a real card (src/card-adder.js, shared/zones.mjs addCard).
function openAdder() {
  if (!game) return;
  openCardAdder({ returnFocus: $('battlefield'), onAdd: (card) => {
    if (!apply(() => addCard(game, card, lookup ?? (() => null)).game, `Added ${card.n}.`)) throw new Error(`Could not add ${card.n}.`);
    return `Added ${card.n}.`;
  } });
}
async function openTokens(returnFocus, kind = 'token') {
  if (!game) return;
  say(`Loading the ${kind}s...`);
  const data = await loadTokens();
  if (!data) { say('Tokens didn’t load. Check your connection.', true); return; }
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
  openCardMenu({ title: 'Battlefield', items: [{ id: 'token', label: 'Create token...' }, { id: 'emblem', label: 'Create emblem...' }, { id: 'card', label: 'Add a card...' }], x: event.clientX, y: event.clientY, returnFocus: $('battlefield'), onPick: (id) => { if (id === 'token' || id === 'emblem') openTokens($('battlefield'), id); else if (id === 'card') openAdder(); } });
});
// A right click on the command zone (not on a card) offers an emblem too.
$('command-zone').addEventListener('contextmenu', (event) => {
  if (event.defaultPrevented || event.target.closest('.card, button') || !game) return;
  event.preventDefault();
  openCardMenu({ title: 'Command zone', items: [{ id: 'emblem', label: 'Create emblem...' }], x: event.clientX, y: event.clientY, returnFocus: $('command-zone'), onPick: (id) => { if (id === 'emblem') openTokens($('command-zone'), 'emblem'); } });
});

mountCardHover(document, { notesFor: (button) => { // a larger picture of any card the pointer is on while Alt is held, with what its keywords, counters and state mean
  const uid = button.dataset.uid;
  if (!uid) return null;
  const owner = button.closest('.opponent')?.dataset.uid ?? button.closest('.plane-layer')?.dataset.owner; // (every player's cards are numbered from c1: another player's card is found in their own zones)
  if (owner) { const view = opponents.get(owner)?.view; const card = view ? Object.values(view.zones).flat().find((c) => c.uid === uid) : null; return card ? cardNotes(card) : null; }
  const found = game ? findCard(uid) : null;
  return found ? cardNotes(found.card) : null;
} });
// ---- the battlefield grid: drag and drop, Auto-arrange and Alt+arrow keys (shared/board-grid.mjs, src/board-drag.js) ----
// A card dropped on a cell of your battlefield: from the hand it is played there (a taken cell is refused); from the battlefield it moves there, or swaps places with the card that is there.
function dropOnBoard({ uid, from, col, row, whole = false, group = null }) {
  if (!game) return;
  const found = findCard(uid);
  if (!found || found.zone !== from) return;
  if (sharedOn) { // the Shared view: a card on the plane is moved by its plane entry; a card coming into play lands in your area (and stays where it was let go, even outside it)
    if (from === 'battlefield') { dropOnPlane({ uid, col, row, whole, group, name: found.card.n }); return; }
    const home = myHomeNow();
    const rel = { col: Math.min(Math.max(col - home.x, 0), HOME_COLS - CARD_COLS), row: Math.min(Math.max(row - home.y, 0), HOME_ROWS - CARD_ROWS) };
    if (!group && (rel.col !== col - home.x || rel.row !== row - home.y)) movePlane(mySeatNow(), uid, { col, row }, { draw: false });
    col = rel.col; row = rel.row;
  }
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
// Auto-arrange has no button (Kevin, 2026-11-20, as on the solo table since 2026-11-14); a key can still be given to it in Settings > Keybinds.
const arrangeNow = () => { if (!game) return; apply(() => arrangeBoard(game), 'Tidied the battlefield.'); };
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
  if (found && uids && from === 'battlefield' && uids.length > 1 && ZONE_WORDS[to] && to !== 'battlefield') { // a whole pile of the battlefield let go over a pile: every card of it goes there (Kevin, 2026-11-24: only the top card went)
    const moving = uids.filter((each) => game.zones.battlefield.some((card) => card.uid === each));
    if (flying) flyAway(flying, element ?? $(`pile-${to}`));
    selected = null;
    apply(() => moving.reduce((g, each) => moveCard(g, each, to, to === 'command' ? {} : { position: 'top' }), game), `Moved the pile of ${moving.length} ${found.card.n} to ${ZONE_WORDS[to]}.`);
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
  if (!anySortOn(sorts)) { say('Pick a sort first.'); return; }
  const hand = game.zones.hand;
  const sorted = sortHand(hand, sorts, { typeOrder: handSort.typeOrder(), colorOrder: handSort.colorOrder(), landOrder: handSort.landOrder(), info: (card) => lookup?.(card) ?? null });
  if (sorted.every((card, index) => card.uid === hand[index].uid)) { say('The hand is already in that order.'); return; }
  pins.clear();
  apply(() => { let next = game; sorted.forEach((card, index) => { next = reorderHand(next, card.uid, index); }); return next; }, 'Sorted the hand.');
  hopHand();
}
const handSort = createHandSort({ onSortNow: sortNow, onChange: () => { if (!anySortOn(handSort.sorts())) keepShownOrder(); pins.clear(); if (game) { render(); if (anySortOn(handSort.sorts())) hopHand(); } } });
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
  apply(() => action.run(game), action.message, { note: id === 'shuffleinto' ? 'shuffle' : null });
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
planeCamera = mountPlaneCamera({ viewport: $('my-board'), plane: $('battlefield'), controls: $('plane-controls'), key: () => `overloaded.camera.${tableCode}`, mine: () => homeBox(myUid), baseTurn: () => facingOf(mySeatNow(), seatList()) }); // (the table seen from your seat: 2026-11-26 feedback)
const planeFlatten = (x, y) => (sharedOn && planeCamera ? planeCamera.flatten(x, y) : { x, y });
const planeFlatRect = () => (sharedOn && planeCamera ? planeCamera.flatRect() : null);
document.addEventListener('pointerdown', (event) => { // (before the drags: a card another player is carrying cannot be picked up)
  if (!sharedOn) return;
  const button = event.target.closest?.('#battlefield .card.carried-remote');
  if (!button) return;
  const carrier = carriedBy(button);
  if (!carrier) return;
  event.preventDefault(); event.stopImmediatePropagation();
  say(`${members[carrier]?.name ?? 'Someone'} is moving that card.`);
}, true);
mountPlaneDrag({ plane: () => $('battlefield'), isActive: () => sharedOn && Boolean(game), flatten: planeFlatten, flatRect: planeFlatRect, onCarry: (info) => { if (!info) { sendCarry(null, null, null); return; } const member = members[info.owner]; if (member) sendCarry(member.seat, info.uid, info.cell); }, onMove: ({ owner, uid, cell }) => { const member = members[owner]; if (!member) return; movePlane(String(member.seat), uid, cell); say(`Moved ${member.name}'s card.`); } });
mountBoardDrag({ board: () => $('battlefield'), flatten: planeFlatten, flatRect: () => planeFlatRect(), onCarry: (info) => { if (!info) sendCarry(null, null, null); else sendCarry(mySeatNow(), info.uid, info.cell); }, onDrop: dropOnBoard, groupOf: (uid) => (multi.size > 1 && multi.has(uid) ? [...multi] : null), hand: () => $('hand-section'), onDropHand: dropOnHand, onHandOver: (over) => handView.carry(over), onReorderHand: reorderInHand, handZone: () => handView.zone(), handHit: (x, y) => handView.over(x, y), zoneSource, pileAt, onDropPile: dropOnPile, isEnabled: () => Boolean(game), boardFirst: true });

// (Mulligan is in the hand's menu, the arrow next to the hand count: the bar has Draw, Untap all and Next turn only, Kevin 2026-11-20)
// The action bar floats like the solo table's (src/floating-bar.js); it starts as a row in the bottom left corner, in the strip under the battlefield left of the hand (docked to a side it is a column of icons).
floatingBars.push(mountFloatingBar({ bar: document.querySelector('.actions-panel'), grip: $('bar-grip'), store, key: 'overloaded.seatsConsole', defaultPlace: { dock: 'bottom', fx: 0, fy: 1 }, room: columnRoom, docking: toolDocks.dockingFor('bar') }));
// the life total is the number itself: click, right-click, Shift for 5, hold to set (src/life-control.js)
mountLifeControl({ button: $('life'), say, onDelta: (delta) => { if (game) apply(() => adjustLife(game, delta), ''); }, onSet: (value) => { if (game) apply(() => adjustLife(game, value - game.life), `Life is ${value}.`); } });
// (Kevin's friends, 2026-11-26: a mouse click on your library does not open it at a live table, where looking through it by accident is not fair; its menu's Search,
// the View library key and the keyboard still do. A mouse click has a click count in event.detail; a key's or a script's click has 0.)
for (const zone of ['library', 'graveyard', 'exile', 'sideboard']) $(`pile-${zone}`).addEventListener('click', (event) => { if (!game) return; if (zone === 'library' && event.detail > 0 && viewing !== 'library') return; if (viewing === zone && !viewTop) viewer.close(); else openPile(zone); });
$('retry').addEventListener('click', () => { if (meta?.status === 'playing' && !begun) beginGame(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && (selected || multi.size > 0) && game) { selected = null; multi.clear(); render(); } });

start();
