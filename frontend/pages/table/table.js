// The table page, where a started match is played at /table/CODE. It shows who is at the table and plays YOUR game: the same
// moves as the solo table (shared/zones.mjs), but every move is also saved to the live database, only the pieces it changed
// (shared/game-sync.mjs): your hand and library in your private branch (nobody else can read it), the rest in your public one.
// A refresh puts you back at the game you left. Other players' boards are shown beside it, live and read-only (their public
// zones only: shared/game-sync.mjs readPublic). All database calls live in ../../src/db.js.
import { rejoinTable, watchMembers, watchMeta, watchPresence, watchServerOffset, watchConnection, startPresence, heartbeat, watchActivity, saveGame, loadGame, watchPublic, concede, endMatch, leaveTable } from '../../src/db.js';
import { startKeepAlive } from '../../src/keep-alive.js';
import { makeSafeStore } from '../../src/safe-store.js';
import { loadCardList } from '../../src/card-list.js';
import { makeCardNodes } from '../../src/card-nodes.js';
import { presenceStatus, presenceText, ownConnectionText } from '../../../shared/presence.mjs';
import { tableCodeFromPath } from '../../../shared/lobby-link.mjs';
import { seatDeckText, defaultDeckFor, hasConceded } from '../../../shared/lobby-deck.mjs';
import { LIBRARY_KEY, LEGACY_KEY, readLibrary } from '../../../shared/deck-library.mjs';
import { makeLookup } from '../../../shared/card-lookup.mjs';
import { friendlyMessage } from '../../../shared/friendly-error.mjs';
import { makeGame, draw, moveCard, shuffleLibrary, mulligan, setTapped, untapAll, adjustLife, nextTurn, battlefieldRows, zoneCounts } from '../../../shared/zones.mjs';
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
let viewing = null; // the pile being looked at: 'library', 'graveyard', 'exile' or 'sideboard'
const cardNodes = makeCardNodes({ onSelect: (uid) => select(uid), isSelected: (uid) => uid === selected });
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

function render() {
  $('turn').textContent = String(game.turn);
  $('life').textContent = String(game.life);
  const rows = battlefieldRows(game);
  place($('row-lands'), rows.lands);
  place($('row-other'), rows.other);
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
    return;
  }
  const { card, zone } = found;
  $('selected-line').textContent = `${card.n}${card.t ? `: ${card.t}` : ''}, in ${ZONE_WORDS[zone]}${card.tapped ? ' (tapped)' : ''}.`;
  const actions = [];
  const act = (label, run, message, secondary = true) => actions.push({ label, run, message, secondary, deselect: false });
  if (zone === 'battlefield') act(card.tapped ? 'Untap' : 'Tap', () => setTapped(game, card.uid, !card.tapped), `${card.tapped ? 'Untapped' : 'Tapped'} ${card.n}.`, false);
  for (const [to, label] of [['hand', 'To hand'], ['battlefield', 'To battlefield'], ['graveyard', 'To graveyard'], ['exile', 'To exile'], ['command', 'To command zone'], ['sideboard', 'To sideboard']]) {
    if (to !== zone) act(label, () => moveCard(game, card.uid, to), `Moved ${card.n} to ${ZONE_WORDS[to]}.`);
  }
  act('Top of library', () => moveCard(game, card.uid, 'library', { position: 'top' }), `Put ${card.n} on top of your library.`);
  act('Bottom of library', () => moveCard(game, card.uid, 'library', { position: 'bottom' }), `Put ${card.n} on the bottom of your library.`);
  actions.push({ label: 'Deselect', secondary: true, deselect: true });
  $('selected-actions').replaceChildren(...actions.map((action) => {
    const button = make('button', action.secondary ? 'secondary' : '', action.label);
    button.type = 'button';
    button.addEventListener('click', () => {
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
function apply(run, message = '') {
  try {
    game = run();
    if (message) say(message);
  } catch (error) {
    say(error.message, true);
  }
  render();
  sync();
}

function select(uid) { selected = uid; render(); }

function drawOne() {
  const result = draw(game, 1);
  game = result.game;
  say(result.short ? 'Your library is empty.' : `Drew ${game.zones.hand.find((c) => c.uid === result.drawn[0]).n}.`, result.short);
  render();
  sync();
}

function goNextTurn() {
  const result = nextTurn(game);
  game = result.game;
  const drewName = result.short ? null : game.zones.hand.find((c) => c.uid === result.drawn[0]).n;
  say(`Turn ${game.turn}: everything untapped${drewName ? ` and you drew ${drewName}` : '. Your library is empty, so nothing was drawn'}.`, result.short);
  render();
  sync();
}

function doMulligan() {
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
  panel = { section, title: make('h3'), stats: make('p', 'hint'), waiting: make('p', 'hint', 'Has not been dealt a game yet.'), body: make('div'), lands, other, command, graveyard, exile, nodes: makeCardNodes({ readOnly: true }) };
  panel.body.append(make('h4', '', 'Lands'), lands, make('h4', '', 'Other permanents'), other, make('h4', '', 'Command zone'), command, graveyard.details, exile.details);
  section.append(panel.title, panel.stats, panel.waiting, panel.body);
  opponents.set(uid, panel);
  return panel;
}

async function renderOpponents() {
  const on = meta?.status === 'playing' && myUid !== null;
  $('opponents').hidden = !on;
  if (!on) return;
  let known;
  try { known = await lookupReady(); } catch { known = () => null; } // without the list every permanent shows in the "other" row
  const others = Object.entries(members).filter(([uid]) => uid !== myUid).sort((a, b) => Number(a[1].seat) - Number(b[1].seat));
  const panels = [];
  for (const [uid, member] of others) {
    const panel = opponentPanel(uid);
    panel.title.textContent = `Seat ${member.seat}: ${member.name}`; // names are other people's text: put in as text, never as markup
    // A public branch left over from an earlier match does not count: this match's game is the one with this match's number.
    const view = publicAll[uid]?.match === meta.match ? readPublic(publicAll[uid], known) : null;
    panel.waiting.hidden = view !== null;
    panel.body.hidden = view === null;
    panel.stats.hidden = view === null;
    if (view) {
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
    renderOpponents();
  });
  watchMembers(tableCode, (value, error) => {
    if (!value) { members = {}; renderPlayers(); if (error) say('Lost sight of the table. It may have closed.', true); return; }
    members = value;
    renderPlayers();
    renderOpponents();
  });
  watchPublic(tableCode, (value) => { publicAll = value && typeof value === 'object' ? value : {}; renderOpponents(); });
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
$('draw').addEventListener('click', () => { if (game) drawOne(); });
$('next-turn').addEventListener('click', () => { if (game) goNextTurn(); });
$('untap-all').addEventListener('click', () => { if (game) apply(() => untapAll(game), 'Untapped everything.'); });
$('shuffle').addEventListener('click', () => { if (game) apply(() => shuffleLibrary(game), 'Shuffled your library.'); });
$('mulligan').addEventListener('click', () => { if (game) doMulligan(); });
for (const [id, delta] of [['life-minus5', -5], ['life-minus1', -1], ['life-plus1', 1], ['life-plus5', 5]]) {
  $(id).addEventListener('click', () => { if (game) apply(() => adjustLife(game, delta), ''); });
}
for (const zone of ['library', 'graveyard', 'exile', 'sideboard']) $(`pile-${zone}`).addEventListener('click', () => { if (game) { viewing = viewing === zone ? null : zone; render(); } });
$('retry').addEventListener('click', () => { if (meta?.status === 'playing' && !begun) beginGame(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && selected && game) { selected = null; render(); } });

start();
