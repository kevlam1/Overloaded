// The lobby page: make a table or join one by code. All database calls live in ../../src/db.js.
import { createTable, joinTable, rejoinTable, findMyTable, watchMembers, heartbeat, watchActivity, watchMeta, watchServerOffset, startPresence, watchPresence, watchConnection, takeOverHost } from '../../src/db.js';
import { presenceStatus, presenceText, ownConnectionText, hostIsGone } from '../../../shared/presence.mjs';
import { startKeepAlive } from '../../src/keep-alive.js';
import { makeSafeStore } from '../../src/safe-store.js';
import { normalizeCode, isValidCode } from '../../../shared/table-code.mjs';
import { cleanPlayerName } from '../../../shared/player-name.mjs';
import { friendlyMessage } from '../../../shared/friendly-error.mjs';
import { codeFromPath, linkForCode } from '../../../shared/lobby-link.mjs';

const $ = (id) => document.getElementById(id);
const nameInput = $('name');
const seatsSelect = $('seats');
const codeInput = $('join-code');
const createButton = $('create');
const joinButton = $('join');
const statusLine = $('status');

// Remembered in this browser only (never sent anywhere): your name and the last table, so a refresh puts you back.
const NAME_KEY = 'overloaded.name';
const TABLE_KEY = 'overloaded.lastTable';
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
let currentPresence = {};
let serverOffset = null; // until the database's clock is known, no one is judged disconnected
const REDRAW_MS = 10000;

function renderPlayers() {
  const list = $('players');
  list.replaceChildren();
  const now = serverOffset === null ? null : Date.now() + serverOffset;
  // Names come from other people, so they are put in as text, never as markup.
  for (const [uid, member] of Object.entries(currentMembers).sort((a, b) => Number(a[1].seat) - Number(b[1].seat))) {
    const item = document.createElement('li');
    item.textContent = `Seat ${member.seat}: ${member.name}${uid === currentHost ? ' (host)' : ''}`;
    item.dataset.uid = uid;
    const status = presenceStatus(currentPresence[uid], now);
    const words = presenceText(status);
    if (words) {
      const note = document.createElement('span');
      note.className = 'presence';
      note.dataset.state = status.state;
      note.textContent = words;
      item.append(' ', note); // a real space, so a screen reader does not read the name and the status as one word
    }
    list.append(item);
  }
  // Offer the takeover only to someone else at the table, and only when the host has really been gone for 5 minutes
  // (the database makes the same judgement and refuses otherwise).
  const canTakeOver = Boolean(currentHost) && currentHost !== myUid && myUid in currentMembers && hostIsGone(currentPresence[currentHost], now);
  $('take-over').hidden = !canTakeOver;
  $('take-over-note').hidden = !canTakeOver;
}

function stopPresenceParts() {
  for (const stop of [stopPresence, stopPresenceWatch, stopConnectionWatch, stopOffsetWatch, stopHostWatch]) if (stop) stop();
  stopPresence = stopPresenceWatch = stopConnectionWatch = stopOffsetWatch = stopHostWatch = null;
  if (redrawTimer !== null) { clearInterval(redrawTimer); redrawTimer = null; }
  currentMembers = {}; currentPresence = {}; serverOffset = null; currentHost = null;
  $('connection').hidden = true;
  $('take-over').hidden = true;
  $('take-over-note').hidden = true;
}

function startPresenceParts(code, uid) {
  stopPresenceParts();
  currentCode = code;
  myUid = uid;
  stopHostWatch = watchMeta(code, (meta) => { currentHost = meta?.host ?? null; renderPlayers(); });
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

function show(table) {
  $('table').hidden = false;
  $('code').textContent = table.code;
  $('link').textContent = linkForCode(location.origin, table.code);
  $('seat').textContent = table.seat;
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
    renderPlayers();
  });
}

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
  say('Making your table...');
  // A host holds one table at a time. Warn before a LIVE old table is deleted (the popup is a placeholder for a designed
  // one); one that has already expired is replaced without a popup (decided 2026-10-27).
  const mine = await findMyTable();
  if (mine && !mine.expired && !confirm(`You already have a table (code ${mine.code}, ${mine.players} at it). Making a new one closes it. Continue?`)) {
    say('Kept your existing table.');
    return;
  }
  const table = await createTable({ name, seats: Number(seatsSelect.value) });
  say(table.replaced ? `Table ${table.code} is ready. Your old table was closed.` : `Table ${table.code} is ready. Share the code.`);
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

// On load: restore the name, and if this browser was at a table, put it back (a refresh keeps your seat).
nameInput.value = store.get(NAME_KEY) ?? '';

// Arriving by a shared link (/lobby/ABC234): put the code in the box and leave the rest to the person. It never joins
// by itself, so a link cannot put someone at a table they have not looked at.
const linkedCode = codeFromPath(location.pathname);
if (linkedCode) {
  codeInput.value = linkedCode;
  say(`Table ${linkedCode}: ${nameInput.value ? 'press Join.' : 'type your name, then press Join.'}`);
  (nameInput.value ? joinButton : nameInput).focus();
}

(async () => {
  const last = store.get(TABLE_KEY);
  if (!last) return;
  try {
    const table = await rejoinTable(last);
    if (table) { say(`Back at table ${table.code}.`); show(table); } else store.remove(TABLE_KEY);
  } catch {
    say('Could not reach the server to check your last table. Check your connection.', true);
  }
})();
