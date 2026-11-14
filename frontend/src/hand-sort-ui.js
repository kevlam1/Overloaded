// Sorting your hand (Kevin, 2026-11-13): three small buttons under the middle of the hand (Color, Type, Cost), each with three states (off, one way, the other way round; shared/hand-sort.mjs
// has the logic and the words), and a row in Settings to put the card types in the order you like. Only how the hand is SHOWN changes: the hand's own order is never touched. The choices are
// kept in this browser. This module holds the choices and draws the controls; the page calls `sorts()` and `typeOrder()` whenever it shows the hand, and `onChange` tells it to show it again.
import { makeSafeStore } from './safe-store.js';
import { SORT_KEYS, SORT_TITLES, TYPE_TITLES, cleanSorts, nextSortState, sortWords, normalizeTypeOrder, moveType } from '../../shared/hand-sort.mjs';

export const SORTS_KEY = 'overloaded.handSort';
export const TYPE_ORDER_KEY = 'overloaded.handTypeOrder';

const store = makeSafeStore();
const parse = (text) => { try { return JSON.parse(text); } catch { return null; } };
const make = (tag, className, content) => { const element = document.createElement(tag); if (className) element.className = className; if (content !== undefined) element.textContent = content; return element; };

const ARROWS = ['', '↑', '↓']; // off, the first way, the other way round

export function createHandSort({ onChange = () => {} } = {}) {
  let sortState = cleanSorts(parse(store.get(SORTS_KEY)));
  let order = normalizeTypeOrder(parse(store.get(TYPE_ORDER_KEY)));
  const buttons = new Map();

  function draw() {
    for (const [key, button] of buttons) {
      const value = sortState[key];
      button.setAttribute('aria-pressed', value === 0 ? 'false' : 'true');
      button.dataset.state = String(value);
      button.title = sortWords(key, value);
      button.setAttribute('aria-label', sortWords(key, value));
      button.firstChild.textContent = `${SORT_TITLES[key]}${ARROWS[value] ? ` ${ARROWS[value]}` : ''}`;
    }
  }

  // The three buttons, put into `host` (the bar under the hand).
  function mountButtons(host) {
    for (const key of SORT_KEYS) {
      const button = make('button', 'hand-sort', '');
      button.type = 'button';
      button.dataset.sort = key;
      button.append(document.createTextNode(SORT_TITLES[key]));
      button.addEventListener('click', () => {
        sortState = nextSortState(sortState, key);
        store.set(SORTS_KEY, JSON.stringify(sortState));
        draw();
        onChange();
      });
      buttons.set(key, button);
      host.append(button);
    }
    draw();
  }

  // The order of the card types, as a row of pills in Settings, each with a button to move it one place earlier or later.
  function mountTypeOrder(host) {
    host.replaceChildren();
    const heading = make('p', 'type-order-title', 'Hand type order');
    const list = make('ol', 'type-order');
    list.setAttribute('aria-label', 'The order of the card types when the hand is sorted by type');
    const redraw = () => {
      list.replaceChildren(...order.map((type, index) => {
        const item = make('li', 'type-pill');
        item.dataset.type = type;
        const earlier = make('button', 'type-move', '‹');
        earlier.type = 'button';
        earlier.disabled = index === 0;
        earlier.setAttribute('aria-label', `Move ${TYPE_TITLES[type]} earlier`);
        earlier.addEventListener('click', () => change(index, index - 1));
        const later = make('button', 'type-move', '›');
        later.type = 'button';
        later.disabled = index === order.length - 1;
        later.setAttribute('aria-label', `Move ${TYPE_TITLES[type]} later`);
        later.addEventListener('click', () => change(index, index + 1));
        item.append(earlier, make('span', 'type-name', TYPE_TITLES[type]), later);
        return item;
      }));
    };
    const change = (from, to) => {
      order = moveType(order, from, to);
      store.set(TYPE_ORDER_KEY, JSON.stringify(order));
      redraw();
      onChange();
    };
    host.append(heading, list);
    redraw();
  }

  return { sorts: () => sortState, typeOrder: () => order, mountButtons, mountTypeOrder };
}
