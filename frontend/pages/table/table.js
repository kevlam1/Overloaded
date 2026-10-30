// The table page, where a started match is played at /table/CODE. This first version only shows who is at the table and
// keeps it alive; the game itself comes next. All database calls live in ../../src/db.js.
import { rejoinTable, watchMembers, watchMeta, watchPresence, watchServerOffset, watchConnection, startPresence, heartbeat, watchActivity } from '../../src/db.js';
import { startKeepAlive } from '../../src/keep-alive.js';
import { presenceStatus, presenceText, ownConnectionText } from '../../../shared/presence.mjs';
import { tableCodeFromPath } from '../../../shared/lobby-link.mjs';
import { seatDeckText } from '../../../shared/lobby-deck.mjs';
import { friendlyMessage } from '../../../shared/friendly-error.mjs';

const $ = (id) => document.getElementById(id);
const say = (message, isError = false) => { $('status').textContent = message; $('status').classList.toggle('error', isError); };
const formatTime = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

let members = {};
let presence = {};
let meta = null;
let host = null;
let serverOffset = null; // until the database's clock is known, no one is judged disconnected

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
    item.textContent = `Seat ${member.seat}: ${member.name}${uid === host ? ' (host)' : ''}${deckText ? `, ${deckText}` : ''}`;
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
}

async function start() {
  const code = tableCodeFromPath(location.pathname);
  if (!code) { say('That is not a table address. Go back to the lobby and join with a code.', true); return; }
  $('code').textContent = code;
  $('back').href = `/lobby/${code}`;
  let mine;
  try {
    mine = await rejoinTable(code);
  } catch (error) {
    say(friendlyMessage(error), true);
    return;
  }
  if (!mine) { say('You are not at this table, or it has closed. Go back to the lobby to join it.', true); return; }

  startKeepAlive({ code, document, api: { heartbeat, watchServerOffset, watchMeta, watchActivity }, bannerElement: $('banner'), formatTime });
  startPresence(code, { onProblem: () => {} });
  watchMeta(code, (value) => {
    meta = value ?? null;
    host = value?.host ?? null;
    if (value === null || value === undefined) say('This table has closed.', true); else say('');
    renderMatchState();
    renderPlayers();
  });
  watchMembers(code, (value, error) => {
    if (!value) { members = {}; renderPlayers(); if (error) say('Lost sight of the table. It may have closed.', true); return; }
    members = value;
    renderPlayers();
  });
  watchPresence(code, (value) => { if (value) { presence = value; renderPlayers(); } });
  watchServerOffset((offset) => { serverOffset = offset; renderPlayers(); });
  watchConnection((connected) => {
    const words = ownConnectionText(connected);
    $('connection').textContent = words;
    $('connection').hidden = words === '';
  });
  setInterval(renderPlayers, 10000); // "Reconnecting..." turns into "Disconnected" with time
}

start();
