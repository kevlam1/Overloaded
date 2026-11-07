// The table page, where a started match is played at /table/CODE. It shows who is at the table and plays YOUR game: the same
// moves as the solo table (shared/zones.mjs), but every move is also saved to the live database, only the pieces it changed
// (shared/game-sync.mjs): your hand and library in your private branch (nobody else can read it), the rest in your public one.
// A refresh puts you back at the game you left. Other players' boards are shown beside it, live and read-only (their public
// zones only: shared/game-sync.mjs readPublic). All database calls live in ../../src/db.js.
import { rejoinTable, watchMembers, watchMeta, watchPresence, watchServerOffset, watchConnection, startPresence, heartbeat, watchActivity, saveGame, loadGame, watchPublic, concede, endMatch, leaveTable } from '../../src/db.js';
import { startKeepAlive } from '../../src/keep-alive.js';
import { makeSafeStore } from '../../src/safe-store.js';
import { play, mountSoundSettings } from '../../src/sound.js';
import { loadCardList } from '../../src/card-list.js';
import { makeCardNodes } from '../../src/card-nodes.js';
import { mountMarksPanel } from '../../src/marks-panel.js';
import { openCardMenu } from '../../src/card-menu.js';
import { mountPlayerCounters, mountCommanderDamage } from '../../src/player-counters.js';
import { menuItems, menuAction, turnLabel, turnMessage, playBackLabel, PLAY_BACK_ZONES, noUntapLabel, sickLabel, untapMessage } from '../../../shared/card-menu.mjs';
import { marksSentence, markClick, printedOf } from '../../../shared/marks.mjs';
import { currentTurn, passAction, takeBackAction, canTakeBack, turnToStart, whoseWords, turnWords } from '../../../shared/turn-order.mjs';
import { playerCounterEntries, commanderDamageSeatsFor, commanderDamageEntries, counterAction, damageAction } from '../../../shared/player-counters.mjs';
import { presenceStatus, presenceText, ownConnectionText } from '../../../shared/presence.mjs';
import { tableCodeFromPath } from '../../../shared/lobby-link.mjs';
import { seatDeckText, defaultDeckFor, hasConceded } from '../../../shared/lobby-deck.mjs';
import { LIBRARY_KEY, LEGACY_KEY, readLibrary } from '../../../shared/deck-library.mjs';
import { makeLookup } from '../../../shared/card-lookup.mjs';
import { friendlyMessage } from '../../../shared/friendly-error.mjs';
import { makeGame, draw, moveCard, shuffleLibrary, mulligan, setTapped, turnOver, untapAll, beginTurn, adjustLife, battlefieldRows, zoneCounts } from '../../../shared/zones.mjs';
import { gameWrites, joinGame, readPublic } from '../../../shared/game-sync.mjs';

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
// Your counters (src/player-counters.js, shared/player-counters.mjs). Commander damage is a separate mount from the other counters: each
// player's damage is its own node, so a later design can put it in that player's panel instead of in one block.
const playerCounters = mountPlayerCounters($('player-counters'), { onChange: (entry, step) => { if (!game) return; const action = counterAction(game, entry.kind, step); apply(() => action.run(game), action.message); } });
const commanderDamage = mountCommanderDamage($('commander-damage'), { onChange: (entry, step) => { if (!game) return; const action = damageAction(game, entry.seat, step, entry.name); apply(() => action.run(game), action.message); } });

const cardNodes = makeCardNodes({ onSelect: (uid) => select(uid), isSelected: (uid) => uid === selected, onMark: (uid, hit) => markOnCard(uid, hit), onMenu: (uid, where) => openMenuFor(uid, where), onBadge: (uid, kind) => clearBadge(uid, kind), printedStats: (card) => printedOf(card, lookup) });
const place = cardNodes.place;

function showBlocked(message, { link = true, retry = false } = {}) {
  $('game').hidden = true;
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
  playerCounters.update(playerCounterEntries(game.pc));
  const entries = commanderDamageEntries(game.cd, commanderDamageSeatsFor(members, game.cd, meta?.format));
  $('commander-damage-block').hidden = entries.length === 0;
  commanderDamage.update(entries);
}

function render() {
  renderTurn();
  renderCounters();
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
  $('viewer-note').textContent = viewing === 'library' ? 'The top card is first. Only you can look at your library.' : viewing === 'graveyard' ? 'The newest card is first.' : '';
  $('viewer-list').replaceChildren(...cards.map((card, index) => {
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

function select(uid) { selected = uid; render(); }

// The right-click menu of one of your cards (src/card-menu.js, shared/card-menu.mjs). It selects the card too, so the buttons above show it.
function openMenuFor(uid, where) {
  if (!game) return;
  const found = findCard(uid);
  if (!found) return;
  select(uid);
  openCardMenu({ title: found.card.n, items: menuItems(found.card, found.zone), x: where.x, y: where.y, returnFocus: where.element, onPick: (id, amount) => pickFromMenu(uid, id, amount) });
}

function pickFromMenu(uid, id, amount) {
  if (!game) return;
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
  apply(() => beginTurn(game, turn), `Your turn (turn ${turn}). ${turnNote}`);
}

function doMulligan() {
  play('shuffle');
  apply(() => mulligan(game), '');
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
    lastSaved = null; // nothing is saved for this match yet: the first save writes everything and clears an older match's cards
    $('deck-line').textContent = `${deck.name}: ${plural(deck.cards.reduce((sum, c) => sum + c.qty, 0), 'card', 'cards')}. Your hand is dealt.`;
    say(`Dealt ${plural(game.zones.hand.length, 'card', 'cards')}. Life is ${game.life}.`);
  }
  selected = null;
  viewing = null;
  cardNodes.clear();
  $('game').hidden = false;
  render();
  sync();
}

// Called whenever the table's status may have changed: the game is dealt once the match is on, and hidden when it is not.
function checkStart() {
  if (!meta) return;
  if (meta.status === 'playing') { if (!begun) beginGame(); return; }
  begun = false;
  game = null;
  $('game').hidden = true;
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
  const lands = make('div', 'row'); lands.dataset.empty = 'No lands.';
  const other = make('div', 'row'); other.dataset.empty = 'Nothing else.';
  const command = make('div', 'row'); command.dataset.empty = 'Empty.';
  const graveyard = pileDetails('Graveyard');
  const exile = pileDetails('Exile');
  panel = { section, title: make('h3'), stats: make('p', 'hint'), waiting: make('p', 'hint', 'Has not been dealt a game yet.'), body: make('div'), lands, other, command, graveyard, exile, nodes: makeCardNodes({ readOnly: true, printedStats: (card) => printedOf(card, lookup) }) };
  // Another player's counters and the commander damage they have taken: the same nodes as yours, read-only, shown only once something has happened.
  const countersBox = make('div', 'opponent-counters'); countersBox.setAttribute('role', 'group'); countersBox.setAttribute('aria-label', 'Counters'); countersBox.hidden = true;
  const damageBox = make('div', 'opponent-counters'); damageBox.setAttribute('role', 'group'); damageBox.setAttribute('aria-label', 'Commander damage taken'); damageBox.hidden = true;
  panel.countersBox = countersBox; panel.damageBox = damageBox;
  panel.counterList = mountPlayerCounters(countersBox, { readOnly: true });
  panel.damageList = mountCommanderDamage(damageBox, { readOnly: true });
  panel.body.append(make('h4', '', 'Lands'), lands, make('h4', '', 'Other permanents'), other, make('h4', '', 'Command zone'), command, graveyard.details, exile.details);
  section.append(panel.title, panel.stats, countersBox, damageBox, panel.waiting, panel.body);
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
    if (!view) { panel.countersBox.hidden = true; panel.damageBox.hidden = true; }
    if (view) {
      panel.countersBox.hidden = !panel.counterList.update(playerCounterEntries(view.pc));
      panel.damageBox.hidden = !panel.damageList.update(commanderDamageEntries(view.cd, commanderDamageSeatsFor(members, view.cd, meta?.format)));
      panel.stats.textContent = `Life ${view.life}. Hand: ${plural(view.counts.hand, 'card', 'cards')}. Library: ${plural(view.counts.library, 'card', 'cards')}.`;
      panel.section.dataset.life = String(view.life);
      const rows = battlefieldRows({ zones: { battlefield: view.zones.battlefield } });
      panel.nodes.place(panel.lands, rows.lands);
      panel.nodes.place(panel.other, rows.other);
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

// ---- starting the page ----
async function start() {
  tableCode = tableCodeFromPath(location.pathname);
  if (!tableCode) { say('That is not a table address. Go back to the lobby and join with a code.', true); return; }
  $('code').textContent = tableCode;
  $('back').href = `/lobby/${tableCode}`;
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
  watchPublic(tableCode, (value) => { publicAll = value && typeof value === 'object' ? value : {}; renderTurn(); renderOpponents(); });
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
$('untap-all').addEventListener('click', () => { if (game) apply(() => untapAll(game), untapMessage(game)); });
$('shuffle').addEventListener('click', () => { if (game) { play('shuffle'); apply(() => shuffleLibrary(game), 'Shuffled your library.'); } });
mountSoundSettings($('sound-settings'));
$('mulligan').addEventListener('click', () => { if (game) doMulligan(); });
for (const [id, delta] of [['life-minus5', -5], ['life-minus1', -1], ['life-plus1', 1], ['life-plus5', 5]]) {
  $(id).addEventListener('click', () => { if (game) apply(() => adjustLife(game, delta), ''); });
}
for (const zone of ['library', 'graveyard', 'exile', 'sideboard']) $(`pile-${zone}`).addEventListener('click', () => { if (game) { viewing = viewing === zone ? null : zone; render(); } });
$('retry').addEventListener('click', () => { if (meta?.status === 'playing' && !begun) beginGame(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && selected && game) { selected = null; render(); } });

start();
