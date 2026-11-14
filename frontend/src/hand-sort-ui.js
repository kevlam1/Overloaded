// Sorting your hand (Kevin, 2026-11-13): four small buttons under the middle of the hand (Color, Type, Cost, A-Z), each with three states (off, one way, the other way round; shared/hand-sort.mjs
// has the logic and the words), and two rows of pills in Settings to put the card types and the colour groups in the order you like (drag a pill, or use the small arrows on it). Only how the hand
// is SHOWN changes: the hand's own order is never touched. The choices are kept in this browser. This module holds the choices and draws the controls; the page calls `sorts()`, `typeOrder()` and
// `colorOrder()` whenever it shows the hand, and `onChange` tells it to show it again.
import { makeSafeStore } from './safe-store.js';
import { SORT_KEYS, SORT_TITLES, TYPE_TITLES, COLOR_TITLES, cleanSorts, nextSortState, sortWords, normalizeTypeOrder, normalizeColorOrder, moveType, moveColor } from '../../shared/hand-sort.mjs';

export const SORTS_KEY = 'overloaded.handSort';
export const TYPE_ORDER_KEY = 'overloaded.handTypeOrder';
export const COLOR_ORDER_KEY = 'overloaded.handColorOrder';
const DRAG_START_PX = 4; // a pill pressed and moved this far starts to be dragged (less is a click)

const store = makeSafeStore();
const parse = (text) => { try { return JSON.parse(text); } catch { return null; } };
const make = (tag, className, content) => { const element = document.createElement(tag); if (className) element.className = className; if (content !== undefined) element.textContent = content; return element; };

const ARROWS = ['', '↑', '↓']; // off, the first way, the other way round

// A row of pills that can be put in another order: dragged (the pill follows the pointer and the others make way) or moved a place with the arrows on it.
// names: the words for each key in the row; order(): the keys in the order now; move(from, to): asks for the change. Returns { draw() }.
function pillRow({ host, title, label, names, order, move }) {
  const heading = make('p', 'type-order-title', title);
  const list = make('ol', 'type-order');
  list.setAttribute('aria-label', label);
  host.append(heading, list);

  function draw() {
    const keys = order();
    list.replaceChildren(...keys.map((key, index) => {
      const item = make('li', 'type-pill');
      item.dataset.type = key;
      item.dataset.index = String(index);
      const earlier = make('button', 'type-move', '‹');
      earlier.type = 'button';
      earlier.disabled = index === 0;
      earlier.setAttribute('aria-label', `Move ${names[key]} earlier`);
      earlier.addEventListener('click', () => move(index, index - 1));
      const later = make('button', 'type-move', '›');
      later.type = 'button';
      later.disabled = index === keys.length - 1;
      later.setAttribute('aria-label', `Move ${names[key]} later`);
      later.addEventListener('click', () => move(index, index + 1));
      item.append(earlier, make('span', 'type-name', names[key]), later);
      item.addEventListener('pointerdown', (event) => startDrag(event, item, index));
      return item;
    }));
  }

  // Dragging: the pill follows the pointer sideways; the place it would take is the one whose middle the pointer has passed (the pills are measured when the press starts), and the pills between the
  // old and the new place make way. Let go, it is moved there; Escape or a cancelled pointer puts it back. The events are heard on the document, so a pointer that leaves the row still drags.
  function startDrag(event, item, from) {
    if (event.button !== 0 || event.target.closest('button')) return;
    const items = [...list.children];
    const centres = items.map((pill) => { const r = pill.getBoundingClientRect(); return r.left + r.width / 2; });
    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = false;
    let target = from;
    let over = false;
    const onMove = (e) => {
      if (!dragging && Math.hypot(e.clientX - startX, e.clientY - startY) < DRAG_START_PX) return;
      if (!dragging) { dragging = true; item.classList.add('dragging'); list.classList.add('is-dragging'); }
      const dx = e.clientX - startX;
      item.style.translate = `${dx}px 0`;
      const middle = centres[from] + dx;
      target = centres.filter((c, i) => i !== from && c < middle).length; // how many of the other pills are to the left of the dragged pill's middle
      items.forEach((pill, i) => { pill.dataset.shift = String(i > from && i <= target ? -1 : i < from && i >= target ? 1 : 0); });
    };
    const finish = (apply) => {
      if (over) return;
      over = true;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
      document.removeEventListener('keydown', onKey, true);
      if (!dragging) return;
      item.classList.remove('dragging');
      list.classList.remove('is-dragging');
      item.style.translate = '';
      items.forEach((pill) => { delete pill.dataset.shift; });
      if (apply && target !== from) move(from, target);
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); finish(false); } };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
    document.addEventListener('keydown', onKey, true);
  }

  draw();
  return { draw };
}

export function createHandSort({ onChange = () => {} } = {}) {
  let sortState = cleanSorts(parse(store.get(SORTS_KEY)));
  let order = normalizeTypeOrder(parse(store.get(TYPE_ORDER_KEY)));
  let colors = normalizeColorOrder(parse(store.get(COLOR_ORDER_KEY)));
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

  // The four buttons, put into `host` (the bar under the hand).
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

  // The two rows of pills in Settings: the order of the card types, and the order of the colour groups.
  function mountOrders(host) {
    host.replaceChildren();
    const typeRow = pillRow({
      host, title: 'Hand type order (left to right)', label: 'The order of the card types when the hand is sorted by type', names: TYPE_TITLES,
      order: () => order,
      move: (from, to) => { order = moveType(order, from, to); store.set(TYPE_ORDER_KEY, JSON.stringify(order)); typeRow.draw(); onChange(); },
    });
    const colorRow = pillRow({
      host, title: 'Hand color order (left to right)', label: 'The order of the colors when the hand is sorted by color', names: COLOR_TITLES,
      order: () => colors,
      move: (from, to) => { colors = moveColor(colors, from, to); store.set(COLOR_ORDER_KEY, JSON.stringify(colors)); colorRow.draw(); onChange(); },
    });
  }

  return { sorts: () => sortState, typeOrder: () => order, colorOrder: () => colors, mountButtons, mountOrders };
}
