// The "Game history" bar of the solo table (Kevin, 2026-11-18): a thin bar that floats like the action bar and opens downward when its title is clicked, to show the moves of this game, the newest at the bottom (the list stays scrolled to it).
// The whole top of the bar is the handle: a click opens or closes it, a drag moves it, and let go near an edge it attaches to the edge like the stack window (no gap, square on that side); drag it out and it
// is free. The place, whether it is open and which tab shows are kept in this browser. The entries are in shared/game-history.mjs.
// Two tabs (Kevin, 2026-11-21): Moves (the game's history) and Messages (the lines the page's own news line used to show during a game: what you just did, hints, warnings and errors in red; only on your screen).
import { mountFloatingBar } from './floating-bar.js';
import { addEntry } from '../../shared/game-history.mjs';

const make = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const OPEN_KEY = 'overloaded.historyOpen';
const TAB_KEY = 'overloaded.historyTab';
const MAX_MESSAGES = 100;

// root: an empty <section> that floats (position: absolute in the full-screen table). store: a safe store (get, set).
// key: where its place is kept. set(entries) replaces the whole list (the live table: everyone's moves, merged from the database); entries are { turn, text, mine? }.
// note(text, { error }) adds a line to Messages. room: passed on to the floating bar (the pixels kept free at the right); relayout() places it again after that changes.
export function mountHistoryBar({ root, store, key = 'overloaded.historyBar', room = null, docking = null }) {
  let history = [];
  let messages = []; // { text, error }
  let open = store?.get(OPEN_KEY) === '1';
  let tab = store?.get(TAB_KEY) === 'messages' ? 'messages' : 'moves';

  const head = make('button', 'history-head');
  head.type = 'button';
  head.setAttribute('aria-controls', 'history-body');
  head.title = 'Click to open, drag to move';
  const title = make('span', 'history-title', 'Game history');
  const count = make('span', 'history-count', '0');
  head.append(title, count);
  const body = make('div', 'history-body');
  body.id = 'history-body';
  const tabs = make('div', 'history-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Game history');
  const tabButtons = {};
  for (const [name, words] of [['moves', 'Moves'], ['messages', 'Messages']]) {
    const button = make('button', 'history-tab', words);
    button.type = 'button';
    button.id = `history-tab-${name}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', name === 'moves' ? 'history-list' : 'history-messages');
    button.addEventListener('click', () => showTab(name));
    tabButtons[name] = button;
    tabs.append(button);
  }
  const list = make('ol', 'history-list');
  list.id = 'history-list';
  list.setAttribute('role', 'tabpanel');
  const notes = make('ol', 'history-list history-messages');
  notes.id = 'history-messages';
  notes.setAttribute('role', 'tabpanel');
  body.append(tabs, list, notes);
  root.replaceChildren(head, body);

  const shown = () => (tab === 'moves' ? list : notes);
  function showTab(name) {
    tab = name;
    store?.set(TAB_KEY, name);
    for (const [each, button] of Object.entries(tabButtons)) { button.setAttribute('aria-selected', String(each === name)); button.tabIndex = each === name ? 0 : -1; }
    list.hidden = name !== 'moves';
    notes.hidden = name !== 'messages';
    count.textContent = String(name === 'moves' ? history.length : messages.length);
    shown().scrollTop = shown().scrollHeight;
  }
  function setOpen(next) {
    open = Boolean(next);
    root.dataset.open = open ? 'true' : 'false';
    head.setAttribute('aria-expanded', String(open));
    body.hidden = !open;
    store?.set(OPEN_KEY, open ? '1' : '0');
    if (open) shown().scrollTop = shown().scrollHeight; // (the newest line is at the bottom)
  }
  function draw() {
    const rows = history.map((entry) => { // oldest first: the newest is at the bottom
      const row = make('li', `history-row${entry.mine ? ' mine' : ''}`);
      row.append(make('span', 'history-turn', `T${entry.turn}`), make('span', 'history-text', entry.text));
      return row;
    });
    list.replaceChildren(...(rows.length ? rows : [make('li', 'history-empty', 'No moves yet.')]));
    const lines = messages.map((entry) => { const row = make('li', `message-row${entry.error ? ' error' : ''}`); row.append(make('span', 'history-text', entry.text)); return row; });
    notes.replaceChildren(...(lines.length ? lines : [make('li', 'history-empty', 'No messages yet.')]));
    count.textContent = String(tab === 'moves' ? history.length : messages.length);
    if (open) shown().scrollTop = shown().scrollHeight;
  }
  head.addEventListener('click', () => setOpen(!open));
  const floating = mountFloatingBar({ bar: root, grip: head, store, key, defaultPlace: { dock: 'right', fx: 1, fy: 0.14 }, growDown: true, flush: true, clickThrough: true, room, docking });
  showTab(tab);
  setOpen(open);
  draw();
  return {
    add(text, turn) { const next = addEntry(history, text, turn); if (next !== history) { history = next; draw(); } },
    clear() { history = []; draw(); },
    set(entries) { const next = Array.isArray(entries) ? entries : []; if (JSON.stringify(next) === JSON.stringify(history)) return; history = next; draw(); },
    note(text, { error = false } = {}) {
      const words = String(text ?? '').trim();
      if (!words) return;
      messages = [...messages, { text: words, error: Boolean(error) }].slice(-MAX_MESSAGES);
      draw();
    },
    isOpen: () => open,
    count: () => history.length,
    relayout: () => floating.relayout(),
  };
}
