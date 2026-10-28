// The lobby page: make a table or join one by code. All database calls live in ../../src/db.js.
import { createTable, joinTable, rejoinTable, findMyTable, watchMembers } from '../../src/db.js';
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
