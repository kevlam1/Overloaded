// The table page, where a started match is played at /table/CODE. It shows who is at the table and plays YOUR game: the same
// moves as the solo table (shared/zones.mjs), but every move is also saved to the live database, only the pieces it changed
// (shared/game-sync.mjs): your hand and library in your private branch (nobody else can read it), the rest in your public one.
// A refresh puts you back at the game you left. Other players' boards are shown beside it, live and read-only (their public
// zones only: shared/game-sync.mjs readPublic). All database calls live in ../../src/db.js.
import { rejoinTable, watchMembers, watchMeta, watchPresence, watchServerOffset, watchConnection, startPresence, heartbeat, watchActivity, saveGame, loadGame, watchPublic, concede, endMatch, leaveTable } from '../../src/db.js';
import { startKeepAlive } from '../../src/keep-alive.js';
import { makeSafeStore } from '../../src/safe-store.js';
import { play, mountSoundSettings } from '../../src/sound.js';
import { mountPileStyle } from '../../src/pile-style.js';
import { mountPileViewer } from '../../src/pile-viewer.js';
import { mountSettingsMenu } from '../../src/settings-menu.js';
import { mountPileStack } from '../../src/pile-stack.js';
import { mountCommandZone } from '../../src/command-zone.js';
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
import { openCardMenu } from '../../src/card-menu.js';
import { mountCounterChips } from '../../src/counter-chips.js';
import { mountLifeControl } from '../../src/life-control.js';
import { menuItems, menuAction, turnLabel, turnMessage, playBackLabel, PLAY_BACK_ZONES, noUntapLabel, sickLabel, untapMessage } from '../../../shared/card-menu.mjs';
import { marksSentence, markClick, printedOf } from '../../../shared/marks.mjs';
import { currentTurn, passAction, takeBackAction, canTakeBack, turnToStart, whoseWords, turnWords } from '../../../shared/turn-order.mjs';
import { chipEntries, playerMenuItems, playerAction, commanderDamageSeatsFor } from '../../../shared/player-counters.mjs';
import { presenceStatus, presenceText, ownConnectionText } from '../../../shared/presence.mjs';
import { tableCodeFromPath } from '../../../shared/lobby-link.mjs';
import { seatDeckText, defaultDeckFor, hasConceded } from '../../../shared/lobby-deck.mjs';
import { LIBRARY_KEY, LEGACY_KEY, readLibrary } from '../../../shared/deck-library.mjs';
import { makeLookup } from '../../../shared/card-lookup.mjs';
import { friendlyMessage } from '../../../shared/friendly-error.mjs';
import { makeGame, draw, moveCard, shuffleLibrary, mulligan, setTapped, turnOver, untapAll, beginTurn, adjustLife, boardCells, settleBoard, isLandCard, placeCard, placeStack, arrangeBoard, zoneCounts, reorderHand } from '../../../shared/zones.mjs';
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
let lookup = null;
let game = null; // your game as you see it now
let lastSaved = null; // the game as the database has it (null: nothing saved for this match yet)
let begun = false; // the game is being set up or is on
let saving = Promise.resolve();
let selected = null; // the uid of the selected card
let modifyOpen = false; // the counters and power/toughness panel is shown (from Modify, in the card menu or the selected-card buttons)
let viewing = null; // the pile being looked at: 'library', 'graveyard', 'exile' or 'sideboard'
let viewTop = null; // when only the top few cards of the library are being looked at: how many
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

const cardNodes = makeCardNodes({ onSelect: (uid) => select(uid), isSelected: (uid) => uid === selected, onMark: (uid, hit) => markOnCard(uid, hit), onMenu: (uid, where) => openMenuFor(uid, where), onBadge: (uid, kind) => clearBadge(uid, kind), printedStats: (card) => printedOf(card, lookup) });
const place = cardNodes.place;
// The piles as stacks of cards (src/pile-stack.js) and the command zone with its two outlined slots and the commander tax (src/command-zone.js).
const stacks = Object.fromEntries([['library', 'Library'], ['graveyard', 'Graveyard'], ['exile', 'Exile']].map(([zone, label]) => [zone, mountPileStack($(`pile-${zone}`), { zone, label })]));
const commandZone = mountCommandZone({ root: $('command'), place, showTax: COMMANDER_TAX_PUBLISHED, onTax: (uid, delta) => { if (!game) return; const action = taxAction(game, uid, delta); if (action) apply(() => action.run(game), action.message); } });

// The hand is shown one card at a time with the draw sound for each (shared/deal-sequence.mjs). Only what is SHOWN is staged: the game was dealt all at once, so
// what is saved and what other players see never waits for the animation. A refresh in the middle just shows the whole hand.
const dealer = createDealer({
  onChange() {
    if (!game) return;
    render();
    const newest = dealer.dealt();
    const dealtCard = newest ? dealer.visible(game.zones.hand)[newest - 1] : null; // (found by its uid: the hand may be shown sorted)
    const node = dealtCard ? [...$('hand').children].find((child) => child.dataset.uid === dealtCard.uid) ?? null : null;
    if (node) { node.classList.add('deal-in'); node.addEventListener('animationend', () => node.classList.remove('deal-in'), { once: true }); }
  },
  onCard: () => play('draw'),
  reducedMotion: () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
});

function showBlocked(message, { link = true, retry = false } = {}) {
  $('game').hidden = true;
  document.body.classList.remove('playing');
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
}

function render() {
  renderTurn();
  renderCounters();
  $('life').textContent = String(game.life);
  place($('battlefield'), game.zones.battlefield, { battlefield: true, cells: boardCells(game) });
  place($('hand'), dealer.visible(game.zones.hand));
  handView.arrange();
  commandZone.update(game);
  $('hand-count').textContent = String(dealer.visible(game.zones.hand).length);
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

// While a game shows, the list of players sits in the right column under the action buttons; otherwise it is in the page where it was (before the other players' panels).
function dockPlayers(on) {
  const section = $('players-section');
  if (on) $('players-slot').append(section);
  else $('opponents').before(section);
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

function select(uid) { if (uid !== selected) modifyOpen = false; selected = uid; render(); }

// The right-click menu of one of your cards (src/card-menu.js, shared/card-menu.mjs). It selects the card too, so the buttons above show it.
function openMenuFor(uid, where) {
  if (!game) return;
  const found = findCard(uid);
  if (!found) return;
  select(uid);
  openCardMenu({ title: found.card.n, items: menuItems(found.card, found.zone, { live: true }), x: where.x, y: where.y, returnFocus: where.element, onPick: (id, amount) => pickFromMenu(uid, id, amount) });
}

function pickFromMenu(uid, id, amount) {
  if (!game) return;
  const found = findCard(uid);
  if (!found) return;
  if (id === 'modify') { modifyOpen = true; render(); $('marks-amount').focus(); return; }
  if (id === 'ping') { sendPing(found.card, found.zone); return; }
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
}

// ---- whose turn it is (shared/turn-order.mjs) ----
// Passing the turn writes one small record on YOUR branch (a player can only write their own); every page reads everyone's branch, the newest
// record is the turn, and the player it names starts it here: untap (cards marked "doesn't untap" stay tapped), draw, summoning sickness ends.
// My own record comes from my own game, which is always current, not from the round trip through the database.
function currentTurnInfo() {
  const byUid = {};
  for (const [uid, branch] of Object.entries(publicAll)) if (branch?.match === meta?.match) byUid[uid] = branch;
  if (game && myUid) byUid[myUid] = { pass: game.pass };
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

function doMulligan() {
  play('shuffle');
  try { game = mulligan(game); } catch (error) { say(error.message, true); render(); return; }
  dealer.start(game.zones.hand.length, { pause: SHUFFLE_PAUSE_MS }); // the shuffle sound, then the new hand one card at a time (the game is saved at once)
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
  document.body.classList.add('playing'); // the one-screen layout (src/style.css)
  dockPlayers(true);
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
  document.body.classList.remove('playing');
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

function pileDetails(label) {
  const details = make('details');
  const summary = make('summary');
  const list = make('ul', 'pile-list');
  details.append(summary, list);
  return { label, details, summary, list };
}

function opponentPanel(uid) {
  let panel = opponents.get(uid);
  if (panel) return panel;
  const section = make('section', 'opponent');
  section.dataset.uid = uid;
  const board = make('div', 'battlefield');
  const command = make('div', 'row'); command.dataset.empty = 'Empty.';
  const graveyard = pileDetails('Graveyard');
  const exile = pileDetails('Exile');
  panel = { section, title: make('h3'), stats: make('p', 'hint'), waiting: make('p', 'hint', 'Has not been dealt a game yet.'), body: make('div'), board, command, graveyard, exile, nodes: makeCardNodes({ readOnly: true, printedStats: (card) => printedOf(card, lookup) }) };
  // Another player's counters and the commander damage they have taken: the same nodes as yours, read-only, shown only once something has happened.
  const countersBox = make('div', 'opponent-counters counter-chips'); countersBox.setAttribute('role', 'group'); countersBox.setAttribute('aria-label', 'Counters and commander damage'); countersBox.hidden = true;
  panel.countersBox = countersBox;
  panel.counterList = mountCounterChips(countersBox);
  panel.body.append(board, make('h4', '', 'Command zone'), command, graveyard.details, exile.details);
  section.append(panel.title, panel.stats, countersBox, panel.waiting, panel.body);
  opponents.set(uid, panel);
  return panel;
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
    panel.waiting.hidden = view !== null;
    panel.body.hidden = view === null;
    panel.stats.hidden = view === null;
    if (!view) panel.countersBox.hidden = true;
    if (view) {
      panel.countersBox.hidden = !panel.counterList.update(chipEntries(view.pc, view.cd, commanderDamageSeatsFor(members, view.cd, meta?.format)));
      panel.stats.textContent = `Life ${view.life}. Hand: ${plural(view.counts.hand, 'card', 'cards')}. Library: ${plural(view.counts.library, 'card', 'cards')}.`;
      panel.section.dataset.life = String(view.life);
      panel.nodes.place(panel.board, view.zones.battlefield, { battlefield: true, cells: placeAll(view.zones.battlefield, isLandCard) }); // their battlefield on the same grid, each card on the cell they stored
      panel.nodes.place(panel.command, view.zones.command);
      for (const pile of [panel.graveyard, panel.exile]) {
        const cards = view.zones[pile.label.toLowerCase()];
        pile.summary.textContent = `${pile.label}: ${cards.length}`;
        pile.list.replaceChildren(...cards.map((card) => make('li', undefined, card.n)));
      }
    }
    panels.push(panel.section);
  }
  for (const [uid, panel] of opponents) if (!others.some(([other]) => other === uid)) { opponents.delete(uid); panel.section.remove(); }
  $('opponent-list').replaceChildren(...panels);
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
  cornerShown = { card, marks };
  spotlight.show({ card, detail: marks, closable: false, key: `${uid}:${card.turned ? 1 : 0}:${card.p ?? card.i}:${marks}` });
}
function clearCorner() { cornerUid = null; cornerShown = null; cornerMode = 'selected'; spotlight.hide(); }
function bringBackSelectionToCorner() { cornerMode = 'selected'; if (cornerShown) spotlight.show({ card: cornerShown.card, detail: cornerShown.marks, closable: false }); }
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
  if (id === 'shuffle') play('shuffle'); else if (id === 'draw') play('draw');
  apply(() => action.run(game), action.message);
}
function openPileMenu(zone, where) {
  if (!game) return;
  openCardMenu({ title: `${ZONE_WORDS[zone][0].toUpperCase()}${ZONE_WORDS[zone].slice(1)}`, items: pileMenuItems(zone, game.zones[zone].length), x: where.x, y: where.y, returnFocus: where.element, onPick: (id, amount) => pickFromPileMenu(zone, id, amount) });
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
let hoveredCardUid = null;
document.addEventListener('pointermove', (event) => { hoveredCardUid = event.target instanceof Element ? (event.target.closest('#battlefield > .card')?.dataset.uid ?? null) : null; }, { passive: true });
document.documentElement.addEventListener('pointerleave', () => { hoveredCardUid = null; });
document.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() !== 'e' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat) return;
  if (event.target instanceof Element && event.target.closest('input, select, textarea, [contenteditable]')) return; // typing a number or a search is not a tap
  if (!game || !hoveredCardUid) return;
  const found = findCard(hoveredCardUid);
  if (!found || found.zone !== 'battlefield') return;
  event.preventDefault();
  toggleTapped(found);
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
$('arrange').addEventListener('click', () => { if (!game) return; apply(() => arrangeBoard(game), 'Tidied the battlefield: lands along the bottom, everything else along the top, cards with the same name side by side.'); });
// A card of yours dragged from the battlefield and let go over your hand goes back into the hand (a token that leaves the battlefield stops existing, like every other way of moving it).
function dropOnHand({ uid, from, x, picture }) {
  if (!game || from !== 'battlefield') return;
  const found = findCard(uid);
  if (!found || found.zone !== 'battlefield') return;
  const place = handView.holeFor(uid, x ?? 0, true); // the place that was open in the hand when it was let go
  handView.noteDrop(uid, picture); // the card starts from where its picture was let go and eases into its place
  apply(() => { const moved = moveCard(game, uid, 'hand'); return moved.zones.hand.some((c) => c.uid === uid) ? reorderHand(moved, uid, place) : moved; }, // (a token that leaves the battlefield stops existing: there is nothing to put in its place)
     `Moved ${found.card.n} back to your hand.`);
}
// Your hand as a fan: the page draws the cards, the hand view places them and shows their mana costs; a card of the hand dragged within it opens a gap and is put there when let go.
const handView = mountHand({ container: $('hand'), costOf: (uid) => { const card = game?.zones.hand.find((c) => c.uid === uid); const known = card ? lookup?.(card) : null; return known?.m ?? ''; } });
function reorderInHand({ uid, x, picture }) {
  if (!game || !game.zones.hand.some((c) => c.uid === uid)) return;
  const to = handView.holeFor(uid, x); // the place it was last shown over
  handView.noteDrop(uid, picture); // the card starts from where its picture was let go and eases into its place
  const next = reorderHand(game, uid, to);
  if (next === game) { handView.arrange(); return; }
  apply(() => next, '');
}
mountBoardDrag({ board: () => $('battlefield'), onDrop: dropOnBoard, hand: () => $('hand-section'), onDropHand: dropOnHand, onHandOver: (over) => handView.carry(over), onReorderHand: reorderInHand, handZone: () => handView.zone(), handHit: (x, y) => handView.over(x, y), isEnabled: () => Boolean(game) });

$('mulligan').addEventListener('click', () => { if (game) doMulligan(); });
// the life total is the number itself: click, right-click, Shift for 5, hold to set (src/life-control.js)
mountLifeControl({ button: $('life'), say, onDelta: (delta) => { if (game) apply(() => adjustLife(game, delta), ''); }, onSet: (value) => { if (game) apply(() => adjustLife(game, value - game.life), `Life is ${value}.`); } });
for (const zone of ['library', 'graveyard', 'exile', 'sideboard']) $(`pile-${zone}`).addEventListener('click', () => { if (!game) return; if (viewing === zone && !viewTop) viewer.close(); else openPile(zone); });
$('retry').addEventListener('click', () => { if (meta?.status === 'playing' && !begun) beginGame(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && selected && game) { selected = null; render(); } });

start();
