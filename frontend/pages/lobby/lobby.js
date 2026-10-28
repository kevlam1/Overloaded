// The lobby page: make a table or join one by code. All database calls live in ../../src/db.js.
import { createTable, joinTable, rejoinTable, findMyTable, watchMembers, heartbeat, watchActivity, watchMeta, watchServerOffset } from '../../src/db.js';
import { createHeartbeat } from '../../../shared/heartbeat.mjs';
import { renderBanner } from '../../src/banner.js';
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

let stopWatching = null;
let stopKeepAlive = null;
const bannerElement = $('banner');
const formatTime = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// Keeps the table alive while someone is using it, and warns before it closes (decided with Kevin, 2026-10-26):
//  - a tap, key or input in a VISIBLE tab sends a heartbeat (at most one a minute); an idle or hidden tab sends none;
//  - the banner is quiet in the last 5 minutes of the idle limit and in the last 30 minutes before the 8-hour limit,
//    and says so once the table has closed. All of it is judged on the SERVER's time, not this computer's clock.
function keepAlive(code) {
  if (stopKeepAlive) stopKeepAlive();
  let offset = 0;
  let meta = null;
  let lastActive = null;
  let closed = false;
  const beat = createHeartbeat({
    // A refused heartbeat (another player's just landed, or the table closed) is not an error; only a failed send is retried.
    send: () => { heartbeat(code).catch(() => beat.sendFailed()); },
  });
  const draw = () => {
    const table = meta && lastActive !== null ? { createdAt: meta.createdAt, lastActive, idleLimit: meta.idleLimit } : null;
    const state = renderBanner(bannerElement, { now: Date.now() + offset, table, formatTime });
    if (state?.closed) closed = true; // a closed table cannot be revived, so stop sending heartbeats for it
  };
  const onActivity = () => { if (!closed) beat.activity(Date.now()); };
  const onVisibility = () => { if (!closed) beat.setVisible(document.visibilityState === 'visible', Date.now()); draw(); };
  const activityEvents = ['pointerdown', 'keydown', 'input', 'touchstart'];
  for (const name of activityEvents) document.addEventListener(name, onActivity, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  const stops = [
    watchServerOffset((value) => { offset = value; draw(); }),
    watchMeta(code, (value) => { if (value) meta = value; draw(); }),
    watchActivity(code, (value) => { if (value !== null) lastActive = value; draw(); }),
  ];
  const timer = setInterval(() => { if (!closed) beat.tick(Date.now()); draw(); }, 15000);
  beat.activity(Date.now()); // making or joining a table is activity
  stopKeepAlive = () => {
    for (const name of activityEvents) document.removeEventListener(name, onActivity);
    document.removeEventListener('visibilitychange', onVisibility);
    clearInterval(timer);
    for (const stop of stops) stop();
    bannerElement.hidden = true;
    stopKeepAlive = null;
  };
}

function say(message, isError = false) {
  statusLine.textContent = message;
  statusLine.classList.toggle('error', isError);
}

function busy(isBusy) {
  createButton.disabled = isBusy;
  joinButton.disabled = isBusy;
}

function show(table) {
  $('table').hidden = false;
  $('code').textContent = table.code;
  $('link').textContent = linkForCode(location.origin, table.code);
  $('seat').textContent = table.seat;
  localStorage.setItem(TABLE_KEY, table.code);
  keepAlive(table.code);
  if (stopWatching) stopWatching();
  stopWatching = watchMembers(table.code, (members, error) => {
    const list = $('players');
    list.replaceChildren();
    if (!members) {
      say(error ? 'Lost sight of the table. It may have closed.' : '', Boolean(error));
      return;
    }
    // Names come from other people, so they are put in as text, never as markup.
    for (const [uid, member] of Object.entries(members).sort((a, b) => Number(a[1].seat) - Number(b[1].seat))) {
      const item = document.createElement('li');
      item.textContent = `Seat ${member.seat}: ${member.name}`;
      item.dataset.uid = uid;
      list.append(item);
    }
  });
}

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
  cleanPlayerName(nameInput.value); // refuse a bad name before any network request
  localStorage.setItem(NAME_KEY, nameInput.value);
  say('Making your table...');
  // A host holds one table at a time. Warn before the old one is deleted (the popup is a placeholder for a designed one).
  const mine = await findMyTable();
  if (mine && !confirm(`You already have a table (code ${mine.code}, ${mine.players} at it). Making a new one closes it. Continue?`)) {
    say('Kept your existing table.');
    return;
  }
  const table = await createTable({ name: nameInput.value, seats: Number(seatsSelect.value) });
  say(table.replaced ? `Table ${table.code} is ready. Your old table was closed.` : `Table ${table.code} is ready. Share the code.`);
  show(table);
}));

joinButton.addEventListener('click', () => run(async () => {
  const code = normalizeCode(codeInput.value);
  if (!isValidCode(code)) throw new Error('That does not look like a table code. Codes are 6 letters and digits.');
  cleanPlayerName(nameInput.value); // refuse a bad name before any network request
  localStorage.setItem(NAME_KEY, nameInput.value);
  say('Joining...');
  const table = await joinTable({ code, name: nameInput.value });
  say(table.rejoined ? `Back at table ${table.code}.` : `You joined table ${table.code}.`);
  show(table);
}));

// Pressing Enter in the code box joins, so it does not need the mouse.
codeInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') joinButton.click(); });

// On load: restore the name, and if this browser was at a table, put it back (a refresh keeps your seat).
nameInput.value = localStorage.getItem(NAME_KEY) ?? '';

// Arriving by a shared link (/lobby/ABC234): put the code in the box and leave the rest to the person. It never joins
// by itself, so a link cannot put someone at a table they have not looked at.
const linkedCode = codeFromPath(location.pathname);
if (linkedCode) {
  codeInput.value = linkedCode;
  say(`Table ${linkedCode}: ${nameInput.value ? 'press Join.' : 'type your name, then press Join.'}`);
  (nameInput.value ? joinButton : nameInput).focus();
}

(async () => {
  const last = localStorage.getItem(TABLE_KEY);
  if (!last) return;
  try {
    const table = await rejoinTable(last);
    if (table) { say(`Back at table ${table.code}.`); show(table); } else localStorage.removeItem(TABLE_KEY);
  } catch {
    say('Could not reach the server to check your last table. Check your connection.', true);
  }
})();
