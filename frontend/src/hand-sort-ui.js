// Sorting your hand (Kevin, 2026-11-13): four small buttons under the middle of the hand (Color, Type, Cost, A-Z), each with three states (off, one way, the other way round; shared/hand-sort.mjs
// has the logic and the words), and two rows of pills in Settings to put the card types and the colour groups in the order you like (drag a pill, or use the small arrows on it). Only how the hand
// is SHOWN changes: the hand's own order is never touched. The choices are kept in this browser. This module holds the choices and draws the controls; the page calls `sorts()`, `typeOrder()` and
// `colorOrder()` whenever it shows the hand, and `onChange` tells it to show it again.
import { makeSafeStore } from './safe-store.js';
import { SORT_KEYS, SORT_TITLES, TYPE_TITLES, COLOR_TITLES, LAND_TITLES, cleanSorts, noSorts, nextSortState, sortWords, normalizeTypeOrder, normalizeColorOrder, normalizeLandOrder, moveType, moveColor, moveLand } from '../../shared/hand-sort.mjs';

export const SORTS_KEY = 'overloaded.handSort';
export const TYPE_ORDER_KEY = 'overloaded.handTypeOrder';
export const COLOR_ORDER_KEY = 'overloaded.handColorOrder';
export const LAND_ORDER_KEY = 'overloaded.handLandOrder';
export const SORT_ON_KEY = 'overloaded.handSortOn';
const DRAG_START_PX = 4; // a pill pressed and moved this far starts to be dragged (less is a click)

const store = makeSafeStore();
const parse = (text) => { try { return JSON.parse(text); } catch { return null; } };
const make = (tag, className, content) => { const element = document.createElement(tag); if (className) element.className = className; if (content !== undefined) element.textContent = content; return element; };

// A small chevron drawn inline (no icon library): up for the first way, down for the other way round. Width, height and fill are set on the element.
const SVG_NS = 'http://www.w3.org/2000/svg';
const CHEVRON = { 1: 'M2 6.6L5 3.4L8 6.6', 2: 'M2 3.4L5 6.6L8 3.4' };
function chevron(value) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '10');
  svg.setAttribute('height', '10');
  svg.setAttribute('viewBox', '0 0 10 10');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'sort-chevron');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', CHEVRON[value]);
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.9');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('fill', 'none');
  svg.append(path);
  return svg;
}

// A row of pills that can be put in another order: dragged (the pill follows the pointer and the others make way) or moved a place with the arrows on it.
// names: the words for each key in the row; order(): the keys in the order now; move(from, to): asks for the change. Returns { draw() }.
// Which of the cards are folded up (2026-11-26 feedback: each one collapsible), kept in this browser by title.
const FOLDED_KEY = 'overloaded.handSortFolded';
const readFolded = () => { try { const list = JSON.parse(store.get(FOLDED_KEY) ?? '[]'); return Array.isArray(list) ? list.filter((t) => typeof t === 'string') : []; } catch { return []; } };

function pillRow({ host, title, hint, label, names, order, move, reset, isDefault }) {
  const card = make('section', 'sort-card');
  const head = make('div', 'sort-card-head');
  const resetButton = make('button', 'sort-reset secondary', 'Reset');
  resetButton.type = 'button';
  resetButton.addEventListener('click', () => reset());
  const fold = make('button', 'sort-fold', '');
  fold.type = 'button';
  const caret = make('span', 'sort-fold-caret', '▾');
  caret.setAttribute('aria-hidden', 'true');
  fold.append(caret, make('span', 'sort-card-title', title));
  const body = make('div', 'sort-card-body');
  const setFolded = (folded) => { card.classList.toggle('folded', folded); body.hidden = folded; fold.setAttribute('aria-expanded', String(!folded)); };
  setFolded(readFolded().includes(title));
  fold.addEventListener('click', () => {
    const folded = !card.classList.contains('folded');
    setFolded(folded);
    const kept = readFolded().filter((t) => t !== title);
    store.set(FOLDED_KEY, JSON.stringify(folded ? [...kept, title] : kept));
  });
  head.append(fold, resetButton);
  const list = make('ol', 'type-order');
  list.setAttribute('aria-label', label);
  body.append(make('p', 'sort-hint', hint), list);
  card.append(head, body);
  host.append(card);

  // The pills are kept (one element per key) and only put in a new order, so a change can SLIDE: every pill that moved glides from where it was to where it is now (Kevin, 2026-11-21: the old row was
  // drawn again from nothing after every change, so pills jumped, and the pills that made way moved by their OWN width, which left gaps and overlaps when the words differ in length).
  const pills = new Map(); // key -> { item, earlier, later, num }
  const still = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const spot = (pill) => ({ x: pill.offsetLeft, y: pill.offsetTop }); // where the layout puts it (a translate does not change this)
  // Slides each pill except `skip` from where it was (before: key -> spot) to where it is now.
  function slide(before, skip = null) {
    if (still()) return;
    for (const [key, { item }] of pills) {
      const was = before.get(key);
      if (!was || item === skip) continue;
      const now = spot(item);
      const dx = was.x - now.x;
      const dy = was.y - now.y;
      if (!dx && !dy) continue;
      item.style.transition = 'none';
      item.style.translate = `${dx}px ${dy}px`;
      void item.offsetWidth; // (the browser takes the start position before the glide)
      item.style.transition = '';
      item.style.translate = '';
    }
  }
  const spots = () => new Map([...pills].map(([key, { item }]) => [key, spot(item)]));

  function pillFor(key) {
    let entry = pills.get(key);
    if (entry) return entry;
    const item = make('li', 'type-pill');
    item.dataset.type = key;
    const index = () => order().indexOf(key);
    const earlier = make('button', 'type-move', '▲'); // (up and down, stacked on the right: the orders are columns since the 2026-11-26 feedback)
    earlier.type = 'button';
    earlier.setAttribute('aria-label', `Move ${names[key]} earlier`);
    earlier.addEventListener('click', () => { const at = index(); if (at > 0) move(at, at - 1); });
    const later = make('button', 'type-move', '▼');
    later.type = 'button';
    later.setAttribute('aria-label', `Move ${names[key]} later`);
    later.addEventListener('click', () => { const at = index(); if (at >= 0 && at < order().length - 1) move(at, at + 1); });
    const num = make('span', 'type-num', '');
    const moves = make('span', 'type-moves');
    moves.append(earlier, later);
    item.append(num, make('span', 'type-name', names[key]), moves);
    item.addEventListener('pointerdown', (event) => startDrag(event, item));
    entry = { item, earlier, later, num };
    pills.set(key, entry);
    return entry;
  }

  function draw() {
    const keys = order();
    resetButton.disabled = isDefault();
    resetButton.title = resetButton.disabled ? 'Already in the default order' : 'Back to the default order';
    const before = spots();
    for (const key of [...pills.keys()]) if (!keys.includes(key)) { pills.get(key).item.remove(); pills.delete(key); }
    keys.forEach((key, index) => {
      const { item, earlier, later, num } = pillFor(key);
      item.dataset.index = String(index);
      num.textContent = String(index + 1);
      earlier.disabled = index === 0;
      later.disabled = index === keys.length - 1;
      if (list.children[index] !== item) list.insertBefore(item, list.children[index] ?? null);
    });
    slide(before, list.querySelector('.type-pill.dragging'));
  }

  // Dragging: the pill follows the pointer anywhere (the row wraps onto several lines); when the pointer passes the middle of another pill, the dragged pill takes that pill's place in the row and the
  // others slide to their new places. Let go, it glides into its place and the order is kept; Escape or a cancelled pointer puts everything back. The events are heard on the document, so a pointer
  // that leaves the row still drags.
  function startDrag(event, item) {
    if (event.button !== 0 || event.target.closest('button')) return;
    const startOrder = [...list.children];
    const from = startOrder.indexOf(item);
    const box = item.getBoundingClientRect();
    const grab = { x: event.clientX - box.left, y: event.clientY - box.top }; // where on the pill it was taken
    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = false;
    let over = false;
    // the dragged pill is drawn under the pointer: its translate is the pointer's place less where the layout puts it now
    const follow = (x, y) => {
      const origin = list.getBoundingClientRect();
      item.style.translate = `${x - grab.x - origin.left - item.offsetLeft + list.clientLeft}px ${y - grab.y - origin.top - item.offsetTop + list.clientTop}px`;
    };
    const onMove = (e) => {
      if (!dragging && Math.hypot(e.clientX - startX, e.clientY - startY) < DRAG_START_PX) return;
      if (!dragging) { dragging = true; item.classList.add('dragging'); list.classList.add('is-dragging'); }
      const origin = list.getBoundingClientRect();
      const px = e.clientX - origin.left;
      const py = e.clientY - origin.top;
      const children = [...list.children];
      const at = children.indexOf(item);
      const column = getComputedStyle(list).flexDirection === 'column';
      // the pill under the pointer (by its place in the layout, not where it is gliding), and whether the pointer is past its middle in the way the dragged pill would go
      let to = at;
      children.forEach((pill, i) => {
        if (pill === item) return;
        const left = pill.offsetLeft; const top = pill.offsetTop; const w = pill.offsetWidth; const h = pill.offsetHeight;
        if (py < top - 4 || py > top + h + 4 || px < left - 4 || px > left + w + 4) return;
        if (column) { // (a column: past the middle of a pill going down or up)
          if (i > at && py > top + h / 2) to = i;
          if (i < at && py < top + h / 2) to = i;
          return;
        }
        const middle = left + w / 2;
        if (i > at && (px > middle || py > top + h)) to = i;
        if (i < at && (px < middle || py < top)) to = i;
      });
      // beyond the last pill (right of it or under the row) it goes last; before the first, first
      const last = children[children.length - 1];
      if (last !== item && (py > last.offsetTop + last.offsetHeight + 4 || (py >= last.offsetTop - 4 && px > last.offsetLeft + last.offsetWidth + 4))) to = children.length - 1;
      if (to !== at) {
        const before = spots();
        list.insertBefore(item, to > at ? children[to].nextSibling : children[to]);
        slide(before, item);
        [...list.children].forEach((pill, i) => { const num = pill.querySelector('.type-num'); if (num) num.textContent = String(i + 1); }); // (the numbers follow at once)
      }
      follow(e.clientX, e.clientY);
    };
    const finish = (apply) => {
      if (over) return;
      over = true;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
      document.removeEventListener('keydown', onKey, true);
      if (!dragging) return;
      const to = [...list.children].indexOf(item);
      if (!apply && to !== from) { const before = spots(); for (const pill of startOrder) list.append(pill); slide(before, item); } // (Escape: everything back where it was)
      // it glides from under the pointer into its place
      item.classList.remove('dragging');
      list.classList.remove('is-dragging');
      item.style.translate = '';
      if (apply && to !== from) move(from, to);
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

// Two ways to sort (Kevin, 2026-11-13): the Auto button ON keeps the hand sorted all the time (a view, the hand's own order is not touched), OFF leaves the hand alone and shows a "Sort" button that
// sorts it once with the buttons' current choices (onSortNow: the page puts the hand in that order for good; later draws are not sorted until it is pressed again).
export function createHandSort({ onChange = () => {}, onSortNow = () => {} } = {}) {
  let sortState = cleanSorts(parse(store.get(SORTS_KEY)));
  let order = normalizeTypeOrder(parse(store.get(TYPE_ORDER_KEY)));
  let colors = normalizeColorOrder(parse(store.get(COLOR_ORDER_KEY)));
  let lands = normalizeLandOrder(parse(store.get(LAND_ORDER_KEY)));
  let enabled = store.get(SORT_ON_KEY) === '1'; // the on/off switch next to the buttons: off shows the hand as it is, and the buttons keep their states
  let toggle = null;
  let sortNow = null;
  const buttons = new Map();

  function draw() {
    if (toggle) { toggle.setAttribute('aria-checked', String(enabled)); toggle.dataset.state = enabled ? 'on' : 'off'; toggle.textContent = 'Auto'; toggle.title = enabled ? 'Auto is on: the hand is kept sorted all the time. Click to turn it off (the hand stays as it is, and a Sort button appears).' : 'Auto is off: the hand is not sorted by itself. Click to keep it sorted all the time, or use Sort.'; }
    if (sortNow) {
      sortNow.hidden = enabled; // (while the hand is kept sorted there is nothing to press)
      const anyChosen = SORT_KEYS.some((key) => sortState[key] !== 0);
      sortNow.disabled = !anyChosen;
      sortNow.title = anyChosen ? 'Sort the hand once.' : 'Pick a sort first.';
    }
    for (const [key, button] of buttons) {
      const value = sortState[key];
      button.setAttribute('aria-pressed', value === 0 ? 'false' : 'true');
      button.dataset.state = String(value);
      button.title = sortWords(key, value);
      button.setAttribute('aria-label', sortWords(key, value));
      button.firstChild.textContent = SORT_TITLES[key];
      button.querySelector('.sort-chevron')?.remove();
      if (value === 1 || value === 2) button.append(chevron(value));
    }
  }

  // The four buttons, put into `host` (the bar under the hand).
  function mountButtons(host) {
    toggle = make('button', 'hand-sort-toggle', '');
    toggle.type = 'button';
    toggle.setAttribute('role', 'switch');
    toggle.addEventListener('click', () => { enabled = !enabled; store.set(SORT_ON_KEY, enabled ? '1' : '0'); draw(); onChange(); });
    host.append(toggle);
    sortNow = make('button', 'hand-sort-now', 'Sort');
    sortNow.type = 'button';
    sortNow.addEventListener('click', () => onSortNow());
    host.append(sortNow);
    for (const key of SORT_KEYS) {
      const button = make('button', 'hand-sort', '');
      button.type = 'button';
      button.dataset.sort = key;
      button.append(document.createTextNode(SORT_TITLES[key]));
      button.addEventListener('click', () => {
        sortState = nextSortState(sortState, key);
        store.set(SORTS_KEY, JSON.stringify(sortState));
        // (with Auto off a button only chooses how Sort will sort: the hand is left alone)
        draw();
        onChange();
      });
      buttons.set(key, button);
      host.append(button);
    }
    draw();
  }

  // The Hand sorting page of Settings (Kevin, 2026-11-19: it has its own page): how the hand is sorted, then the order of the card types, of the colour groups and of the lands, each in a card of its own with a
  // Reset. Drag a pill, or use the arrows on it. The sort buttons themselves stay under the hand.
  function mountOrders(host) {
    host.replaceChildren();
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const intro = make('p', 'sort-intro', 'Choose the order inside the Type and Color sorts.');
    const columns = make('div', 'sort-columns'); // (the three orders side by side, each a column: 2026-11-26 feedback)
    host.append(intro, columns);
    host = columns;
    const typeRow = pillRow({
      host, title: 'Card types', hint: 'Top first.', label: 'The order of the card types when the hand is sorted by type', names: TYPE_TITLES,
      order: () => order, isDefault: () => same(order, normalizeTypeOrder(null)),
      move: (from, to) => { order = moveType(order, from, to); store.set(TYPE_ORDER_KEY, JSON.stringify(order)); typeRow.draw(); onChange(); },
      reset: () => { order = normalizeTypeOrder(null); store.set(TYPE_ORDER_KEY, JSON.stringify(order)); typeRow.draw(); onChange(); },
    });
    const colorRow = pillRow({
      host, title: 'Colors', hint: 'Top first.', label: 'The order of the colors when the hand is sorted by color', names: COLOR_TITLES,
      order: () => colors, isDefault: () => same(colors, normalizeColorOrder(null)),
      move: (from, to) => { colors = moveColor(colors, from, to); store.set(COLOR_ORDER_KEY, JSON.stringify(colors)); colorRow.draw(); onChange(); },
      reset: () => { colors = normalizeColorOrder(null); store.set(COLOR_ORDER_KEY, JSON.stringify(colors)); colorRow.draw(); onChange(); },
    });
    const landRow = pillRow({
      host, title: 'Lands', hint: 'Basic or other lands first.', label: 'The order of basic and non-basic lands when the hand is sorted', names: LAND_TITLES,
      order: () => lands, isDefault: () => same(lands, normalizeLandOrder(null)),
      move: (from, to) => { lands = moveLand(lands, from, to); store.set(LAND_ORDER_KEY, JSON.stringify(lands)); landRow.draw(); onChange(); },
      reset: () => { lands = normalizeLandOrder(null); store.set(LAND_ORDER_KEY, JSON.stringify(lands)); landRow.draw(); onChange(); },
    });
  }

  // sorts(): the sorts that are in force now (none while the switch is off); buttons(): the states of the buttons whatever the switch says.
  return { sorts: () => (enabled ? sortState : noSorts()), buttons: () => sortState, enabled: () => enabled, typeOrder: () => order, colorOrder: () => colors, landOrder: () => lands, mountButtons, mountOrders };
}
