// The "Game history" bar of the solo table (Kevin, 2026-11-18): a thin bar that floats like the action bar (drag it by its grip, let go near an edge and it latches on, drag it out and it is free) and
// opens downward when its title is clicked, to show the moves of this game, newest first. The place and whether it is open are kept in this browser. The entries are in shared/game-history.mjs.
import { mountFloatingBar } from './floating-bar.js';
import { addEntry } from '../../shared/game-history.mjs';

const SVG_NS = 'http://www.w3.org/2000/svg';
const make = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const OPEN_KEY = 'overloaded.historyOpen';

// root: an empty <section> that floats (position: absolute in the full-screen table). store: a safe store (get, set).
export function mountHistoryBar({ root, store }) {
  let history = [];
  let open = store?.get(OPEN_KEY) === '1';

  const grip = make('button', 'bar-grip history-grip');
  grip.type = 'button';
  grip.setAttribute('aria-label', 'Move the game history');
  grip.title = 'Drag';
  const dots = document.createElementNS(SVG_NS, 'svg');
  for (const [name, value] of Object.entries({ width: 12, height: 18, viewBox: '0 0 12 18', fill: 'currentColor', 'aria-hidden': 'true' })) dots.setAttribute(name, String(value));
  for (const [cx, cy] of [[3, 3], [9, 3], [3, 9], [9, 9], [3, 15], [9, 15]]) { const dot = document.createElementNS(SVG_NS, 'circle'); dot.setAttribute('cx', String(cx)); dot.setAttribute('cy', String(cy)); dot.setAttribute('r', '1.6'); dots.append(dot); }
  grip.append(dots);

  const toggle = make('button', 'history-toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-controls', 'history-list');
  const title = make('span', 'history-title', 'Game history');
  const count = make('span', 'history-count', '0');
  toggle.append(title, count);
  const head = make('div', 'history-head');
  head.append(grip, toggle);
  const list = make('ol', 'history-list');
  list.id = 'history-list';
  root.replaceChildren(head, list);

  function setOpen(next) {
    open = Boolean(next);
    root.dataset.open = open ? 'true' : 'false';
    toggle.setAttribute('aria-expanded', String(open));
    list.hidden = !open;
    store?.set(OPEN_KEY, open ? '1' : '0');
  }
  function draw() {
    count.textContent = String(history.length);
    const rows = history.slice().reverse().map((entry) => { // newest first
      const row = make('li', 'history-row');
      row.append(make('span', 'history-turn', `T${entry.turn}`), make('span', 'history-text', entry.text));
      return row;
    });
    list.replaceChildren(...(rows.length ? rows : [make('li', 'history-empty', 'No moves yet.')]));
  }
  toggle.addEventListener('click', () => setOpen(!open));
  mountFloatingBar({ bar: root, grip, store, key: 'overloaded.historyBar', defaultPlace: { dock: 'right', fx: 1, fy: 0.14 }, growDown: true });
  setOpen(open);
  draw();
  return {
    add(text, turn) { const next = addEntry(history, text, turn); if (next !== history) { history = next; draw(); } },
    clear() { history = []; draw(); },
    isOpen: () => open,
    count: () => history.length,
  };
}
