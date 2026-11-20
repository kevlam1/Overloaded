// The lobby page. It has two screens, chosen by the address: the start page (/) where you make a table or type a code to join one,
// and a table's own screen (/lobby/CODE) with only that table: joining it (one button, or no click at all when this browser has a
// saved name), the seats, your deck, Ready and Start. All database calls live in ../../src/db.js.
import { botClient, createTable, joinTable, rejoinTable, findMyTable, watchMembers, heartbeat, watchActivity, watchMeta, watchServerOffset, startPresence, watchPresence, watchConnection, takeOverHost, setDeck, setName, setFormat, closeIfExpired, setReady, clearReady, startMatch, leaveTable } from '../../src/db.js';
import { presenceStatus, presenceText, ownConnectionText, hostIsGone } from '../../../shared/presence.mjs';
import { startKeepAlive } from '../../src/keep-alive.js';
import { drawDeckTiles } from '../../src/deck-tiles.js';
import { imageUrl } from '../../../shared/card-image.mjs';
import { loadCardList } from '../../src/card-list.js';
import { mountSiteHeader } from '../../src/site-header.js';
import { makeSafeStore } from '../../src/safe-store.js';
import { normalizeCode, isValidCode } from '../../../shared/table-code.mjs';
import { cleanPlayerName } from '../../../shared/player-name.mjs';
import { friendlyMessage } from '../../../shared/friendly-error.mjs';
import { codeFromPath, linkForCode, tablePathForCode } from '../../../shared/lobby-link.mjs';
import { readFormat, formatTitle, FORMATS } from '../../../shared/formats.mjs';
import { LIBRARY_KEY, LEGACY_KEY, readLibrary, decksOfFormat } from '../../../shared/deck-library.mjs';
import { deckFieldsOf, defaultDeckFor, deckChoiceLabel, isReady, seatDeckText, seatBracket, seatCommander } from '../../../shared/lobby-deck.mjs';

const $ = (id) => document.getElementById(id);
const nameInput = $('name');
const seatsSelect = $('seats');
const formatSelect = $('format');
const codeInput = $('join-code');
const createButton = $('create');
const joinButton = $('join');
const statusLine = $('status');

// Remembered in this browser only (never sent anywhere): your name and the last table, so a refresh puts you back.
const NAME_KEY = 'overloaded.name';
const TABLE_KEY = 'overloaded.lastTable';
const LAST_TABLE_KEY = 'overloaded.lastTableInfo'; // { code, seats, format, host }: what your last table was, so the Lobby link can make you a new one when it has closed
const TABLE_DECK_KEY = 'overloaded.tableDeck'; // { code, id }: the saved deck you brought to that table, so a refresh can send it again
// Storage can be unavailable (some privacy settings make it throw); the page must work without it, see src/safe-store.js.
const store = makeSafeStore();

let stopWatching = null;
let stopKeepAlive = null;
const bannerElement = $('banner');
const formatTime = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// Keeps the table alive while someone is using it and warns before it closes: see frontend/src/keep-alive.js (it is
// separate so it can be tested with a fake clock). Only one table is kept alive at a time.
function keepAlive(code) {
  if (stopKeepAlive) stopKeepAlive();
  stopKeepAlive = startKeepAlive({ code, document, api: { heartbeat, watchServerOffset, watchMeta, watchActivity }, bannerElement, formatTime }).stop;
}

// Cleans the typed name (throws a readable message if it is not a name), shows the cleaned version in the box so the
// person sees what the table will see (invisible characters removed), and remembers it in this browser only.
function rememberName() {
  const name = cleanPlayerName(nameInput.value);
  nameInput.value = name;
  store.set(NAME_KEY, name);
  return name;
}

function say(message, isError = false) {
  statusLine.textContent = message;
  statusLine.classList.toggle('error', isError);
}

function busy(isBusy) {
  createButton.disabled = isBusy;
  joinButton.disabled = isBusy;
  $('room-join-button').disabled = isBusy;
}

const START_TITLE = 'Welcome to Overloaded';
// Which screen shows: 'start' (make a table, join by code), 'room-join' (a table's address, you are not at it yet) or 'room' (you are
// at the table). The name box is shared: it is on the start screen and on the join screen, not once you are at the table.
function setScreen(screen) {
  document.body.dataset.screen = screen; // (the style sheet gives the start page its larger title)
  $('page-title').textContent = screen === 'start' ? START_TITLE : 'Lobby';
  $('intro').hidden = screen !== 'start';
  $('who').hidden = screen === 'room';
  $('make-section').hidden = screen !== 'start';
  $('join-section').hidden = screen !== 'start';
  $('room-join').hidden = screen !== 'room-join';
  $('table').hidden = screen !== 'room';
  // The table's screen is wider (the seats, and the deck importer's columns need the room).
  for (const element of [document.querySelector('main'), document.querySelector('footer')]) element.classList.toggle('wide', screen === 'room');
}

// Who has the table open: see shared/presence.mjs. The list is drawn from three things that change on their own (the
// members, their presence notes, and the clock, because "Reconnecting..." turns into "Disconnected" with time), so
// each of them just updates its piece of state and asks for a redraw.
let stopPresence = null;
let stopPresenceWatch = null;
let stopConnectionWatch = null;
let stopOffsetWatch = null;
let stopHostWatch = null;
let redrawTimer = null;
let currentCode = null;
let myUid = null;
let currentHost = null;
let currentMembers = {};
let currentMeta = null;
let chosenDeckId = null; // the saved deck (an id in this browser's library) you brought to this table, or null
let restoringDeck = null; // the promise of putting the remembered deck back (a database write), while it is still going
let restoredFor = null; // the table whose remembered deck has been looked at already
let currentPresence = {};
let deckQuery = ''; // what is typed in the deck search box
let editingName = null; // null, or { draft } while your own name is being changed
let lastFormat; // the table's format the last time its meta was seen (undefined before the first look)
// The host's test bots (Kevin, 2026-11-13): seats held by a second sign-in of this browser so one person can try a full table. botSeats: the seats whose bot this page can act for; botStops: their presence.
const botSeats = new Set();
const botStops = new Map();
const botWorking = new Set();
const botName = (seat) => `Bot ${seat}`;
let serverOffset = null; // until the database's clock is known, no one is judged disconnected
const REDRAW_MS = 10000;

function botButton(action, seat, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary bot-button';
  button.dataset.bot = action;
  button.dataset.seat = seat;
  button.textContent = label;
  button.setAttribute('aria-label', `${label} for seat ${seat}`);
  button.disabled = botWorking.has(seat);
  return button;
}

// A bot seat that this page has not met yet (the page was refreshed): if the member is named for the seat and the account of this browser's bot for that seat is the same account, it is that bot again.
function adoptBots() {
  for (const [uid, member] of Object.entries(currentMembers)) {
    const seat = String(member.seat);
    if (botSeats.has(seat) || botWorking.has(seat) || member.name !== botName(seat) || uid === myUid) continue;
    botWorking.add(seat);
    botClient(seat).uid().then((botUid) => {
      if (botUid === uid && currentCode) { botSeats.add(seat); if (!botStops.has(seat)) botStops.set(seat, botClient(seat).startPresence(currentCode)); }
    }).catch(() => {}).finally(() => { botWorking.delete(seat); renderPlayers(); });
  }
}

// A new match needs everyone ready again, bots too: whenever a bot is not ready for the match the table is on, it readies up.
function readyBots() {
  if (currentMeta?.status !== 'lobby') return;
  for (const [uid, member] of Object.entries(currentMembers)) {
    const seat = String(member.seat);
    if (!botSeats.has(seat) || botWorking.has(seat) || member.ready === currentMeta.match) continue;
    botWorking.add(seat);
    botClient(seat).ready(currentCode).catch(() => {}).finally(() => { botWorking.delete(seat); });
  }
}

async function addBot(seat) {
  botWorking.add(seat);
  renderPlayers();
  try {
    const bot = botClient(seat);
    await bot.join(currentCode, botName(seat));
    botSeats.add(seat);
    botStops.set(seat, bot.startPresence(currentCode));
    await bot.ready(currentCode);
    say(`Bot ${seat} is at seat ${seat}, ready.`);
  } catch (error) {
    say(friendlyMessage(error), true);
  } finally {
    botWorking.delete(seat);
    renderPlayers();
  }
}

async function removeBot(seat) {
  botWorking.add(seat);
  renderPlayers();
  try {
    botStops.get(seat)?.();
    botStops.delete(seat);
    await botClient(seat).leave(currentCode);
    botSeats.delete(seat);
    say(`Bot ${seat} left seat ${seat}.`);
  } catch (error) {
    say(friendlyMessage(error), true);
  } finally {
    botWorking.delete(seat);
    renderPlayers();
  }
}

$('players').addEventListener('click', (event) => {
  const button = event.target instanceof Element ? event.target.closest('button[data-bot]') : null;
  if (!button || button.disabled || !currentCode) return;
  if (button.dataset.bot === 'add') addBot(button.dataset.seat); else removeBot(button.dataset.seat);
});

const piece = (tag, className, text) => { const element = document.createElement(tag); element.className = className; element.textContent = text; return element; };

// The card list by name, for the commander art behind a seat and the colors on the deck cards. It is 1.4 MB, so it is fetched once, when the table first needs it.
let cardsByName = null;
let loadingCards = false;
function ensureCards() {
  if (cardsByName || loadingCards) return;
  loadingCards = true;
  loadCardList().then((cards) => { cardsByName = new Map(cards.map((card) => [card.n, card])); renderPlayers(); drawTiles(); if ($('deck-dialog').open) drawDialogTiles(); }).catch(() => { loadingCards = false; /* seats stay without art; the next table or refresh tries again */ });
}
// The art of the first commander a player named: the whole text first (one name may hold an ampersand), then each name split at " & ". Only our own card list ever gives the picture id.
function seatArt(member) {
  const text = seatCommander(member);
  if (!text || !cardsByName) return null;
  for (const name of [text, ...text.split(' & ')]) { const card = cardsByName.get(name); if (card) return imageUrl(card.i, 'art_crop'); }
  return null;
}

const PENCIL = 'M11.7 1.8a1.6 1.6 0 0 1 2.3 2.3l-8.4 8.4-3.3.9.9-3.3z';
function pencilIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [name, value] of [['viewBox', '0 0 16 16'], ['width', '14'], ['height', '14'], ['fill', 'currentColor'], ['aria-hidden', 'true'], ['focusable', 'false']]) svg.setAttribute(name, value);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', PENCIL);
  path.setAttribute('fill', 'currentColor');
  svg.append(path);
  return svg;
}

// Your own name, with a pencil beside it; while it is being changed the name is a small box with a tick and a cross (Enter saves, Escape cancels).
function nameNode(member, mine) {
  const wrap = piece('span', 'seat-namerow', '');
  if (mine && editingName) {
    const input = document.createElement('input');
    input.className = 'seat-name-input';
    input.type = 'text';
    input.maxLength = 30;
    input.value = editingName.draft;
    input.setAttribute('aria-label', 'Your name at the table');
    input.autocomplete = 'nickname';
    input.spellcheck = false;
    input.addEventListener('input', () => { editingName.draft = input.value; });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); saveName(); }
      else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); editingName = null; renderPlayers(); }
    });
    const save = piece('button', 'seat-save', 'Save');
    save.type = 'button';
    save.addEventListener('click', saveName);
    const cancel = piece('button', 'seat-cancel secondary', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => { editingName = null; renderPlayers(); });
    wrap.append(input, save, cancel);
    return wrap;
  }
  wrap.append(piece('span', 'seat-name', String(member.name)));
  if (mine && currentMeta?.status === 'lobby') {
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'seat-edit';
    edit.title = 'Change your name';
    edit.setAttribute('aria-label', 'Change your name');
    edit.append(pencilIcon());
    edit.addEventListener('click', () => { editingName = { draft: String(member.name) }; renderPlayers(); document.querySelector('.seat-name-input')?.select(); });
    wrap.append(edit);
  }
  return wrap;
}

async function saveName() {
  if (!editingName) return;
  const draft = editingName.draft;
  await run(async () => {
    const { name } = await setName(currentCode, draft); // refused in words (an empty or too long name) before any request
    store.set(NAME_KEY, name);
    nameInput.value = name;
    editingName = null;
    say('');
    renderPlayers();
  });
}

function renderPlayers() {
  const list = $('players');
  const keepEditFocus = document.activeElement instanceof HTMLElement && document.activeElement.classList.contains('seat-name-input');
  list.replaceChildren();
  if (!cardsByName && Object.values(currentMembers).some((member) => seatCommander(member))) ensureCards(); // art for the seats
  const now = serverOffset === null ? null : Date.now() + serverOffset;
  // Names come from other people, so they are put in as text, never as markup. A seat is a card of a fixed size: the commander's art behind it, the player's name and what they bring on two lines that never grow
  // (a long one is cut short with "..."), and the bracket, Ready and connection as pills along the bottom. The number of the seat is drawn by the style sheet.
  for (const [uid, member] of Object.entries(currentMembers).sort((a, b) => Number(a[1].seat) - Number(b[1].seat))) {
    const mine = uid === myUid;
    const item = document.createElement('li');
    item.className = mine ? 'seat mine' : 'seat';
    item.dataset.uid = uid;
    item.dataset.seat = String(member.seat);
    const art = seatArt(member);
    if (art) { item.classList.add('has-art'); item.style.setProperty('--seat-art', `url("${art}")`); }
    item.append(piece('span', 'seat-label', `Seat ${member.seat}: `));
    if (uid === currentHost) item.append(piece('span', 'seat-host', 'Host'));
    const body = piece('span', 'seat-body', '');
    body.append(nameNode(member, mine));
    const commander = seatCommander(member);
    body.append(commander ? piece('span', 'seat-deck', commander) : piece('span', 'seat-deck seat-nodeck', 'No deck yet'));
    item.append(body);
    const pills = piece('span', 'seat-pills', '');
    const bracket = seatBracket(member);
    if (bracket) {
      const pill = piece('span', 'bracket-pill', `Bracket ${bracket.number}`);
      if (bracket.guess) { pill.classList.add('guessed'); pill.title = 'Guessed from the Game Changers in the deck'; }
      pills.append(pill);
    }
    if (isReady(member, currentMeta)) {
      item.dataset.ready = '1';
      pills.append(piece('span', 'ready-mark', 'Ready'));
    }
    const status = presenceStatus(currentPresence[uid], now);
    const words = presenceText(status);
    if (words) {
      const note = piece('span', 'presence', words);
      note.dataset.state = status.state;
      pills.append(note);
    }
    item.append(pills);
    list.append(item);
  }
  // Empty seats and the bots: the host (in the lobby) can add a bot to an empty seat and take a bot away again.
  const seatsTotal = Number(currentMeta?.seats) || 0;
  const canManageBots = Boolean(myUid) && currentHost === myUid && currentMeta?.status === 'lobby';
  const taken = new Set(Object.values(currentMembers).map((member) => String(member.seat)));
  for (let n = 1; n <= seatsTotal; n++) {
    const seat = String(n);
    const member = Object.entries(currentMembers).find(([, m]) => String(m.seat) === seat);
    if (member) {
      const item = [...list.children].find((li) => li.dataset.uid === member[0]);
      if (item && canManageBots && botSeats.has(seat)) item.append(botButton('remove', seat, 'Remove bot'));
    } else if (!taken.has(seat)) {
      const item = document.createElement('li');
      item.className = 'seat empty-seat';
      item.dataset.seat = seat;
      item.append(piece('span', 'seat-label', `Seat ${seat}: `), piece('span', 'seat-empty', 'Empty seat'));
      if (canManageBots) item.append(botButton('add', seat, 'Add bot'));
      list.append(item);
    }
  }
  [...list.children].sort((a, b) => Number(a.dataset.seat) - Number(b.dataset.seat)).forEach((li) => list.append(li)); // (seats in order, the empty ones where they are)
  if (keepEditFocus) { const input = list.querySelector('.seat-name-input'); if (input) { const at = input.value.length; input.focus(); input.setSelectionRange(at, at); } }
  // Offer the takeover only to someone else at the table, and only when the host has really been gone for 5 minutes
  // (the database makes the same judgement and refuses otherwise).
  const canTakeOver = Boolean(currentHost) && currentHost !== myUid && myUid in currentMembers && hostIsGone(currentPresence[currentHost], now);
  $('take-over').hidden = !canTakeOver;
  $('take-over-note').hidden = !canTakeOver;
  $('ready').textContent = isReady(currentMembers[myUid], currentMeta) ? 'Not ready' : 'Ready';
  renderFormat();
  renderStart();
}

// The format switch: the host changes it (Commander or Standard) while the table is in the lobby; everyone else sees which one it is.
function renderFormat() {
  const format = currentMeta?.format;
  const canChange = Boolean(myUid) && currentHost === myUid && currentMeta?.status === 'lobby';
  for (const button of $('format-switch').querySelectorAll('button[data-format]')) {
    button.setAttribute('aria-pressed', String(button.dataset.format === format));
    button.disabled = !canChange && button.dataset.format !== format;
    button.title = canChange ? '' : 'Only the host can change the format.';
  }
}
$('format-switch').addEventListener('click', (event) => {
  const button = event.target instanceof Element ? event.target.closest('button[data-format]') : null;
  if (!button || button.disabled || !currentCode || button.dataset.format === currentMeta?.format) return;
  run(async () => { await setFormat(currentCode, button.dataset.format); say(''); });
});

// Only the host starts the match, and only when there are at least two players and every one of them is ready (the flow's
// own rule in shared/table-ops.mjs, which refuses in words otherwise; the button just says why it waits).
function renderStart() {
  const isHost = Boolean(myUid) && currentHost === myUid && myUid in currentMembers;
  $('start-box').hidden = !isHost;
  if (!isHost) return;
  const everyone = Object.values(currentMembers);
  const ready = everyone.filter((member) => isReady(member, currentMeta)).length;
  const canStart = everyone.length >= 2 && ready === everyone.length;
  $('start').disabled = !canStart;
  $('start-note').textContent = everyone.length < 2
    ? 'You need at least two players to start.'
    : canStart ? 'Everyone is ready. Press Start.' : `${ready} of ${everyone.length} players are ready. The match can start when everyone is.`;
}

function stopPresenceParts() {
  for (const stop of [stopPresence, stopPresenceWatch, stopConnectionWatch, stopOffsetWatch, stopHostWatch]) if (stop) stop();
  stopPresence = stopPresenceWatch = stopConnectionWatch = stopOffsetWatch = stopHostWatch = null;
  if (redrawTimer !== null) { clearInterval(redrawTimer); redrawTimer = null; }
  for (const stop of botStops.values()) stop();
  botStops.clear(); botSeats.clear();
  currentMembers = {}; currentPresence = {}; serverOffset = null; currentHost = null; currentMeta = null; chosenDeckId = null; restoredFor = null; lastFormat = undefined; editingName = null; deckQuery = '';
  $('connection').hidden = true;
  $('take-over').hidden = true;
  $('take-over-note').hidden = true;
  $('start-box').hidden = true;
}

function startPresenceParts(code, uid) {
  stopPresenceParts();
  currentCode = code;
  myUid = uid;
  stopHostWatch = watchMeta(code, (meta) => {
    const formatChanged = meta?.format !== currentMeta?.format;
    const formerFormat = lastFormat;
    if (meta?.format !== undefined) lastFormat = meta.format;
    currentMeta = meta ?? null;
    currentHost = meta?.host ?? null;
    readyBots();
    $('table-format').textContent = formatTitle(meta?.format); // text, never markup: another client could have written any string
    renderPlayers();
    if (myUid && meta?.host === myUid) store.set(LAST_TABLE_KEY, JSON.stringify({ code: currentCode, seats: meta.seats, format: meta.format, host: true }));
    if (formatChanged && formerFormat !== undefined && FORMATS.includes(meta?.format)) { formatSwitched().finally(() => refreshDeckPicker()); } else if (formatChanged || restoredFor !== currentCode) refreshDeckPicker(); // (another format: your deck and your ready mark do not fit it)
    // Once the match is on, everyone at the table is taken to the table page (the host's Start and a refresh both end up here).
    if (meta?.status === 'playing' && currentCode) location.assign(tablePathForCode(currentCode));
  });
  stopPresence = startPresence(code, { onProblem: () => {} });
  stopPresenceWatch = watchPresence(code, (presence) => { if (presence) { currentPresence = presence; renderPlayers(); } });
  stopOffsetWatch = watchServerOffset((offset) => { serverOffset = offset; renderPlayers(); });
  stopConnectionWatch = watchConnection((connected) => {
    const words = ownConnectionText(connected);
    $('connection').textContent = words;
    $('connection').hidden = words === '';
  });
  redrawTimer = setInterval(renderPlayers, REDRAW_MS);
}

// ---- your deck: one of your saved decks of the table's format (shared/lobby-deck.mjs) ----
// The table learns only the commander(s) and the bracket, never the list. Choosing a deck calls setDeck, which also takes your
// ready mark back in the same write; pressing Ready with no deck opens a popup to choose one.
const readMyLibrary = () => readLibrary(store.get(LIBRARY_KEY), store.get(LEGACY_KEY)).library;

function fillDeckSelect(select, decks, selectedId, withPlaceholder) {
  select.replaceChildren(...(withPlaceholder ? [new Option('Choose a deck...', '')] : []), ...decks.map((entry) => new Option(deckChoiceLabel(entry), entry.id)));
  select.value = selectedId ?? (withPlaceholder ? '' : decks[0]?.id ?? '');
}

function drawTiles() {
  const decks = decksOfFormat(readMyLibrary(), currentMeta?.format);
  $('deck-search').hidden = decks.length === 0;
  drawDeckTiles($('deck-tiles'), decks, chosenDeckId, { byName: cardsByName, query: deckQuery, onImport: () => openImporter(), onPick: (id) => { if (id === chosenDeckId) return; $('deck-pick').value = id; $('deck-pick').dispatchEvent(new Event('change')); } });
  if (decks.length > 0) ensureCards(); // (the card list is 1.4 MB: only fetched when there is something it is needed for)
}
function drawDialogTiles() {
  const decks = decksOfFormat(readMyLibrary(), currentMeta?.format);
  drawDeckTiles($('deck-dialog-tiles'), decks, $('deck-dialog-pick').value || null, { byName: cardsByName, onPick: (id) => { $('deck-dialog-pick').value = id; drawDialogTiles(); } });
}
$('deck-search').addEventListener('input', () => { deckQuery = $('deck-search').value; drawTiles(); });

// A format change by the host: a deck of the old format is no longer yours at this table, and nobody is ready for the new format yet. Each player does this for themselves (the database only lets you write your own entry).
async function formatSwitched() {
  const decks = decksOfFormat(readMyLibrary(), currentMeta?.format);
  try {
    if (!decks.some((entry) => entry.id === chosenDeckId)) {
      chosenDeckId = null;
      store.remove(TABLE_DECK_KEY);
      await setDeck(currentCode, {}); // no commander and no bracket (this also takes the ready mark back when there was something to clear)
    }
    if (isReady(currentMembers[myUid], currentMeta)) await clearReady(currentCode);
  } catch { /* the table may have started or closed meanwhile: the picker just redraws */ }
}

// Sends the chosen deck's commander and bracket to the table and remembers the choice for this table (so a refresh can send it again). Returns { entry, changed }.
async function bringDeck(id) {
  const entry = readMyLibrary().decks.find((candidate) => candidate.id === id && candidate.format === currentMeta?.format);
  if (!entry) throw new Error('That deck is not saved in this browser any more. Pick another one.');
  const { changed } = await setDeck(currentCode, deckFieldsOf(entry));
  chosenDeckId = id;
  store.set(TABLE_DECK_KEY, JSON.stringify({ code: currentCode, id }));
  return { entry, changed };
}

function rememberedDeckId() {
  try {
    const saved = JSON.parse(store.get(TABLE_DECK_KEY) ?? 'null');
    return saved && saved.code === currentCode && typeof saved.id === 'string' ? saved.id : null;
  } catch {
    return null;
  }
}

// Draws the picker for the table's format. The first time for a table it also puts back the deck remembered for it (sending it
// again is safe: the same deck writes nothing, so it does not take your ready mark back).
async function refreshDeckPicker() {
  const format = currentMeta?.format;
  const known = FORMATS.includes(format);
  $('deck-pick-field').hidden = !known;
  if (!known) { $('deck-note').textContent = ''; return; }
  const decks = decksOfFormat(readMyLibrary(), format);
  if (restoredFor !== currentCode) {
    restoredFor = currentCode;
    const remembered = rememberedDeckId();
    if (remembered && decks.some((entry) => entry.id === remembered)) {
      // bringDeck waits for a database write before it sets chosenDeckId, so Ready pressed in that gap used to find no deck and open the popup
      // (seen in the two-browser check, one run in about six, 2026-11-06). The Ready button waits for this.
      restoringDeck = bringDeck(remembered).catch(() => { /* the table may have started or closed: the picker just shows no choice */ }).finally(() => { restoringDeck = null; });
      await restoringDeck;
    }
  }
  if (!decks.some((entry) => entry.id === chosenDeckId)) chosenDeckId = null;
  $('deck-pick-field').hidden = decks.length === 0;
  fillDeckSelect($('deck-pick'), decks, chosenDeckId, true);
  drawTiles();
  $('deck-note').textContent = decks.length === 0 ? `You have no saved ${formatTitle(format)} deck.` : '';
}

function openDeckDialog() {
  const dialog = $('deck-dialog');
  if (dialog.open) return;
  const format = currentMeta?.format;
  const library = readMyLibrary();
  const decks = decksOfFormat(library, format);
  if (decks.length === 0) { openImporter(); return; } // nothing to choose from: go straight to importing one
  $('deck-dialog-field').hidden = false;
  fillDeckSelect($('deck-dialog-pick'), decks, defaultDeckFor(library, format)?.id ?? null, false);
  drawDialogTiles();
  dialog.returnValue = ''; // Escape closes without setting one, so an earlier "ok" must not linger
  dialog.showModal();
}

$('deck-dialog').addEventListener('close', () => {
  if ($('deck-dialog').returnValue !== 'ok') return;
  run(async () => {
    await bringDeck($('deck-dialog-pick').value);
    refreshDeckPicker();
    await setReady(currentCode);
    say('You are ready.');
  });
});

$('deck-pick').addEventListener('change', () => run(async () => {
  const id = $('deck-pick').value;
  if (!id) { $('deck-pick').value = chosenDeckId ?? ''; return; } // a deck already sent cannot be un-sent, only replaced
  const wasReady = isReady(currentMembers[myUid], currentMeta);
  try {
    const { changed } = await bringDeck(id);
    say(changed && wasReady ? 'Not ready: press Ready again.' : '');
  } catch (error) {
    $('deck-pick').value = chosenDeckId ?? '';
    throw error;
  }
  refreshDeckPicker();
}));

$('ready').addEventListener('click', () => run(async () => {
  if (isReady(currentMembers[myUid], currentMeta)) {
    await clearReady(currentCode);
    say('You are not ready any more.');
    return;
  }
  if (restoringDeck) await restoringDeck; // the remembered deck is still being sent again: wait for it instead of asking
  if (!decksOfFormat(readMyLibrary(), currentMeta?.format).some((entry) => entry.id === chosenDeckId)) chosenDeckId = null;
  if (!chosenDeckId) { openDeckDialog(); return; }
  await setReady(currentCode);
  say('You are ready.');
}));

$('start').addEventListener('click', () => run(async () => {
  say('Starting the match...');
  await startMatch(currentCode); // the table's status changes, and watchMeta above takes everyone to the table page
}));

// ---- importing a deck without leaving the table ----
// "Import a deck" (the first card of your decks) opens the same importer as the /deck page (frontend/src/deck-importer.js) in a window over the lobby, on its box to paste into, with the table's format. It is loaded only
// when it is first opened, because it brings the card list with it. When the window is closed, a deck that was just imported for this format is the one you bring, and the deck you were already bringing is sent again in case
// it was edited there.
let importerMounted = false;
let libraryBeforeImport = null;
const pageParts = () => [document.querySelector('header.site-header'), document.querySelector('main'), document.querySelector('footer.site-footer')].filter(Boolean);
async function openImporter() {
  if (!currentCode || !FORMATS.includes(currentMeta?.format)) return;
  if ($('deck-dialog').open) $('deck-dialog').close();
  libraryBeforeImport = new Set(readMyLibrary().decks.map((entry) => entry.id));
  $('import-overlay').hidden = false;
  for (const part of pageParts()) part.inert = true;
  if (!importerMounted) {
    importerMounted = true;
    const { mountDeckImporter } = await import('../../src/deck-importer.js');
    mountDeckImporter({ root: $('deck-app'), play: false, startOn: 'paste', format: () => currentMeta?.format, onLibraryChange: () => refreshDeckPicker() });
  } else {
    document.getElementById('new-deck')?.click(); // another import starts on the box to paste into
  }
  ($('deck-text') ?? $('import-close')).focus();
}
async function closeImporter() {
  if ($('import-overlay').hidden) return;
  $('import-overlay').hidden = true;
  for (const part of pageParts()) part.inert = false;
  const before = libraryBeforeImport ?? new Set();
  const added = readMyLibrary().decks.filter((entry) => !before.has(entry.id) && entry.format === currentMeta?.format).at(-1);
  await run(async () => {
    if (added && currentMeta?.status === 'lobby') await bringDeck(added.id);
    else if (chosenDeckId && currentMeta?.status === 'lobby') await bringDeck(chosenDeckId).catch(() => {});
  });
  refreshDeckPicker();
}
$('import-close').addEventListener('click', closeImporter);
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || $('import-overlay').hidden) return;
  if (document.querySelector('.card-menu, .picker-overlay, .confirm-overlay')) return; // those close first
  event.preventDefault();
  closeImporter();
});

// A deck may be imported in another tab while this one is open: look again when this tab comes back.
document.addEventListener('visibilitychange', () => { if (!document.hidden && currentCode && currentMeta) refreshDeckPicker(); });

function show(table) {
  setScreen('room');
  // The address bar shows the table you are at, so it can be copied and shared. Making or joining a table from the start page moves
  // the address to /lobby/CODE without reloading (the Back button then reloads the start page, see the popstate handler below).
  if (codeFromPath(location.pathname) !== table.code) history.pushState(null, '', `/lobby/${table.code}`);
  $('code').textContent = table.code;
  $('link').textContent = linkForCode(location.origin, table.code);
  store.set(TABLE_KEY, table.code);
  keepAlive(table.code);
  startPresenceParts(table.code, table.uid);
  if (stopWatching) stopWatching();
  stopWatching = watchMembers(table.code, (members, error) => {
    if (!members) {
      currentMembers = {};
      renderPlayers();
      say(error ? 'Lost sight of the table. It may have closed.' : '', Boolean(error));
      return;
    }
    currentMembers = members;
    adoptBots();
    renderPlayers();
    readyBots();
  });
}

// Copy buttons: the table code and the invite link. With no clipboard (an insecure page) the text is selected instead, ready for Ctrl+C.
async function copyFrom(button, element, words) {
  const text = element.textContent.trim();
  const label = button.dataset.label ?? (button.dataset.label = button.textContent);
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch { /* no clipboard: select it below */ }
  if (!ok) { const range = document.createRange(); range.selectNodeContents(element); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); }
  button.textContent = ok ? 'Copied' : 'Press Ctrl+C';
  say(ok ? `The ${words} is copied.` : `Press Ctrl+C to copy the ${words}.`);
  setTimeout(() => { button.textContent = label; }, 1800);
}
$('copy-code').addEventListener('click', () => copyFrom($('copy-code'), $('code'), 'table code'));
$('copy-link').addEventListener('click', () => copyFrom($('copy-link'), $('link'), 'invite link'));

$('take-over').addEventListener('click', () => run(async () => {
  say('Taking over the table...');
  await takeOverHost(currentCode);
  say('You are now the host of this table.');
}));

async function run(task) {
  busy(true);
  try {
    await task();
  } catch (error) {
    say(friendlyMessage(error), true);
  } finally {
    busy(false);
  }
}

createButton.addEventListener('click', () => run(async () => {
  const name = rememberName(); // refuse a bad name before any network request
  const format = readFormat(formatSelect.value);
  say('Making your table...');
  // A host holds one table at a time. Warn before a LIVE old table is deleted (the popup is a placeholder for a designed
  // one); one that has already expired is replaced without a popup (decided 2026-10-27).
  const mine = await findMyTable();
  if (mine && !mine.expired && !confirm(`You already have a table (code ${mine.code}, ${mine.players} at it). Making a new one closes it. Continue?`)) {
    say('Kept your existing table.');
    return;
  }
  const table = await createTable({ name, seats: Number(seatsSelect.value), format });
  say(table.replaced ? `Table ${table.code} is ready. Your old table was closed.` : `Table ${table.code} is ready. Share the code.`);
  store.set(LAST_TABLE_KEY, JSON.stringify({ code: table.code, seats: Number(seatsSelect.value), format, host: true }));
  show(table);
}));

joinButton.addEventListener('click', () => run(async () => {
  const code = normalizeCode(codeInput.value);
  if (!isValidCode(code)) throw new Error('That does not look like a table code. Codes are 6 letters and digits.');
  const name = rememberName(); // refuse a bad name before any network request
  say('Joining...');
  const table = await joinTable({ code, name });
  say(table.rejoined ? `Back at table ${table.code}.` : `You joined table ${table.code}.`);
  show(table);
}));

// Pressing Enter in the code box joins, so it does not need the mouse.
codeInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') joinButton.click(); });

// ---- joining from a table's address, leaving ----
const roomCode = codeFromPath(location.pathname); // set on /lobby/CODE, null on the start page

// Joins the table of this address with the name in the box (also remembered for next time). Refused names stop before any request.
async function joinHere(code) {
  const name = rememberName();
  say('Joining...');
  const table = await joinTable({ code, name });
  say(table.rejoined ? `Back at table ${table.code}.` : `You joined table ${table.code}.`);
  show(table);
}
$('room-join-button').addEventListener('click', () => run(() => joinHere(roomCode)));
nameInput.addEventListener('keydown', (event) => { if (event.key === 'Enter' && roomCode && !$('room-join').hidden) $('room-join-button').click(); });

$('leave-table').addEventListener('click', () => run(async () => {
  if (!confirm('Leave this table? Your seat is given up. If you are the host, the table goes to the next player.')) return;
  await leaveTable(currentCode);
  store.remove(TABLE_KEY);
  location.assign('/');
}));

// Back and Forward between the start page and a table only change the address (see show), so reload to show the right screen.
window.addEventListener('popstate', () => location.reload());

// ---- starting ----
mountSiteHeader();
nameInput.value = store.get(NAME_KEY) ?? '';

// The start page: if this browser is at a table, say so and link to it (no redirect: you may want to make or join another).
async function startStart() {
  setScreen('start');
  const last = store.get(TABLE_KEY);
  if (!last) return;
  try {
    const table = await rejoinTable(last);
    if (table) {
      $('resume-code').textContent = table.code;
      $('resume').hidden = false;
    } else {
      store.remove(TABLE_KEY);
    }
  } catch {
    say('Could not reach the server to check your last table. Check your connection.', true);
  }
}

// The table this browser was at has closed (it expired, or its host ended it). It is cleared away, and if you were its host you get a new one with the same seats and format; anyone else is taken to the start page.
function lastTableInfo(code) {
  try { const info = JSON.parse(store.get(LAST_TABLE_KEY) ?? 'null'); return info && info.code === code ? info : null; } catch { return null; }
}
async function reopenMyTable(code) {
  const info = lastTableInfo(code);
  store.remove(TABLE_KEY);
  store.remove(TABLE_DECK_KEY);
  await closeIfExpired(code);
  let saved = null;
  try { saved = store.get(NAME_KEY) ? cleanPlayerName(store.get(NAME_KEY)) : null; } catch { saved = null; }
  if (info?.host && saved && SEAT_CHOICES.includes(info.seats)) {
    await run(async () => {
      say('Making you a new table...');
      const table = await createTable({ name: saved, seats: info.seats, format: FORMATS.includes(info.format) ? info.format : 'commander' });
      store.set(LAST_TABLE_KEY, JSON.stringify({ code: table.code, seats: info.seats, format: info.format, host: true }));
      history.replaceState(null, '', '/');
      show(table);
      say('Your old table closed. This is a new one.');
    });
    return;
  }
  history.replaceState(null, '', '/');
  await startStart();
  say('That table has closed.');
}
const SEAT_CHOICES = [2, 3, 4];

// A table's own screen. Already at this table (a refresh, or the deck page's back link): straight to it. Not yet: join it, with no
// code to type. If this browser has a usable saved name the join happens by itself (Kevin's choice, 2026-10-30, over a one-button
// join); otherwise the person types a name and presses the one button.
async function startRoom(code) {
  $('room-join-code').textContent = code;
  setScreen('room-join');
  say(`Opening table ${code}...`);
  let table;
  try {
    table = await rejoinTable(code);
  } catch {
    say('Could not reach the server. Check your connection and reload.', true);
    return;
  }
  if (table) { say(`Back at table ${table.code}.`); show(table); return; }
  if (store.get(TABLE_KEY) === code) { await reopenMyTable(code); return; } // this is the table this browser was at, and it is not there any more
  let saved = null;
  try { saved = store.get(NAME_KEY) ? cleanPlayerName(store.get(NAME_KEY)) : null; } catch { saved = null; }
  if (saved) { await run(() => joinHere(code)); return; }
  say(`Type your name to join table ${code}.`);
  nameInput.focus();
}

if (roomCode) startRoom(roomCode); else startStart();
