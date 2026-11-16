// A window for putting several cards in an order (Kevin, 2026-11-15): the cards side by side, the first on the left. Drag a card to another place (a pointer: mouse or pen or a finger) and the others move
// aside to open the place it will take, like the cards of the hand; or move it with the two arrows under it (they work from the keyboard). Done gives the order, Cancel or Escape leaves everything as it was.
// It looks like the Scry window and uses its styles (frontend/src/style.css, .scry-*).
// The pictures are drawn here from the cards' own ids, not taken from the table: the card buttons of the table are the same elements wherever they are shown, so using them here let the table take them back
// when it was drawn again (a click outside the window did that) and left the window empty (found 2026-11-15).
// openOrderWindow({ title, note, cards, onDone, places }): cards, the cards in the order to start from (the first is on the left; each has uid, n, and i or p for its picture); onDone(uids) is called with the uids in
// the order chosen; places(index, count) says what to write above a card. Returns { close }.
import { imageUrl } from '../../shared/card-image.mjs';

const SVG_NS = 'http://www.w3.org/2000/svg';
const make = (tag, className, text) => { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; };
const DRAG_START_PX = 6;
const GLIDE_MS = 220;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
// A random order (Fisher-Yates): the same kind of shuffle the library uses.
function shuffled(list) {
  const out = [...list];
  const words = new Uint32Array(out.length);
  globalThis.crypto.getRandomValues(words);
  for (let i = out.length - 1; i > 0; i--) { const j = words[i] % (i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
// The arrows under a card: a chevron pointing the way the card moves (width, height and fill set on the element).
function arrow(direction) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '14'); svg.setAttribute('height', '14'); svg.setAttribute('viewBox', '0 0 14 14'); svg.setAttribute('fill', 'none'); svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', direction === 'left' ? 'M9 2.5L4.5 7L9 11.5' : 'M5 2.5L9.5 7L5 11.5');
  path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-width', '2'); path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round'); path.setAttribute('fill', 'none');
  svg.append(path);
  return svg;
}
let current = null;

export function openOrderWindow({ title, note, cards, onDone, places = null }) {
  current?.close();
  if (!Array.isArray(cards) || cards.length === 0) return { close() {} };
  const order = cards.map((card) => card.uid);
  const byUid = new Map(cards.map((card) => [card.uid, card]));
  const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const overlay = make('div', 'scry-overlay');
  const panel = make('div', 'scry-window order-window');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', title);
  const heading = make('h2', 'scry-title', title);
  const noteLine = make('p', 'scry-note', note ?? '');
  const list = make('ol', 'scry-cards');
  const buttons = make('div', 'scry-buttons');
  const done = make('button', 'scry-done', 'Done'); done.type = 'button';
  const cancel = make('button', 'scry-cancel', 'Cancel'); cancel.type = 'button';
  const random = make('button', 'scry-random', 'Random order'); random.type = 'button';
  buttons.append(random, done, cancel);
  panel.append(heading, noteLine, list, buttons);
  overlay.append(panel);
  // Whatever happens on the dark space around the window is the window's: the table behind must not see a click (it would let go of the picked cards) or open a menu.
  for (const type of ['click', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'dblclick']) overlay.addEventListener(type, (event) => event.stopPropagation());
  overlay.addEventListener('contextmenu', (event) => { event.preventDefault(); event.stopPropagation(); });
  document.body.append(overlay);

  const pictureOf = (card) => {
    const holder = make('div', 'order-card');
    const url = imageUrl(card.p ?? card.i, 'normal');
    if (url) {
      const image = new Image();
      image.alt = card.n ?? '';
      image.decoding = 'async';
      image.draggable = false;
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => { image.replaceWith(make('span', 'order-card-name', card.n ?? '')); });
      image.src = url;
      holder.append(image);
    } else holder.append(make('span', 'order-card-name', card.n ?? ''));
    return holder;
  };

  // The cards glide from where they were to where they are now (Kevin, 2026-11-15: like the cards of the hand): each card's old box is remembered, the list is drawn again, and every card that has moved
  // starts from its old place and eases to the new one. Under reduced motion they just change places.
  function draw(focus = null) {
    const before = new Map([...list.children].map((item) => [item.dataset.uid, item.getBoundingClientRect()]));
    build(focus);
    if (reduced() || before.size === 0) return;
    for (const item of list.children) {
      const from = before.get(item.dataset.uid);
      if (!from) continue;
      const to = item.getBoundingClientRect();
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      item.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: GLIDE_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
    }
  }
  function build(focus = null) {
    list.replaceChildren(...order.map((uid, index) => {
      const item = make('li', 'scry-card');
      item.dataset.uid = uid;
      const place = make('span', 'scry-place', places ? places(index, order.length) : (index === 0 ? 'First' : `#${index + 1}`));
      const picture = make('div', 'scry-picture order-handle');
      picture.title = 'Drag to move this card';
      picture.append(pictureOf(byUid.get(uid)));
      const arrows = make('div', 'scry-arrows');
      const earlier = make('button', 'scry-move', ''); earlier.type = 'button'; earlier.disabled = index === 0; earlier.setAttribute('aria-label', `Move ${byUid.get(uid).n} earlier`); earlier.append(arrow('left'));
      const later = make('button', 'scry-move', ''); later.type = 'button'; later.disabled = index === order.length - 1; later.setAttribute('aria-label', `Move ${byUid.get(uid).n} later`); later.append(arrow('right'));
      const move = (to) => { order.splice(index, 1); order.splice(to, 0, uid); draw({ uid, move: true }); };
      earlier.addEventListener('click', () => move(index - 1));
      later.addEventListener('click', () => move(index + 1));
      arrows.append(earlier, later);
      picture.addEventListener('pointerdown', (event) => startDrag(event, item, uid));
      item.append(place, picture, arrows);
      return item;
    }));
    if (focus) (list.querySelector(`[data-uid="${focus.uid}"]`)?.querySelector('.scry-move:not(:disabled)'))?.focus({ preventScroll: true });
  }

  // Dragging a card: it follows the pointer, and the place it would take is the nearest of the places the cards have now; the cards between its old place and that one slide aside to open it (Kevin, 2026-11-15:
  // "shifting over to the side just like in hand"). Where it lands is that place.
  function startDrag(event, item, uid) {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    const startX = event.clientX;
    const startY = event.clientY;
    const items = [...list.children];
    const slots = items.map((child) => child.getBoundingClientRect()); // the places, in order
    const from = items.indexOf(item);
    let dragging = false;
    let to = from;
    const nearest = (x, y) => { let best = 0; let bestDistance = Infinity; slots.forEach((slot, index) => { const distance = Math.hypot(x - (slot.left + slot.width / 2), y - (slot.top + slot.height / 2)); if (distance < bestDistance) { bestDistance = distance; best = index; } }); return best; };
    const arrange = () => {
      items.forEach((child, index) => {
        if (child === item) return;
        const shifted = from < to && index > from && index <= to ? index - 1 : from > to && index >= to && index < from ? index + 1 : index;
        child.style.transition = reduced() ? 'none' : `translate ${GLIDE_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
        child.style.translate = shifted === index ? '' : `${slots[shifted].left - slots[index].left}px ${slots[shifted].top - slots[index].top}px`;
      });
    };
    const onMove = (move) => {
      const dx = move.clientX - startX;
      const dy = move.clientY - startY;
      if (!dragging && Math.hypot(dx, dy) < DRAG_START_PX) return;
      dragging = true;
      item.classList.add('order-dragging');
      item.style.translate = `${dx}px ${dy}px`;
      const next = nearest(move.clientX, move.clientY);
      if (next !== to) { to = next; arrange(); }
    };
    const onUp = (up) => {
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onUp, true);
      if (!dragging) return;
      if (up.type !== 'pointercancel' && to !== from) { order.splice(from, 1); order.splice(to, 0, uid); }
      draw();
    };
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
    event.preventDefault();
  }

  function close() {
    if (!overlay.isConnected) return;
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
    current = null;
    if (returnTo && returnTo.isConnected) returnTo.focus({ preventScroll: true });
  }
  const onKey = (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation(); // the page's own Escape (it lets go of a card) must not also run
    close();
  };
  random.addEventListener('click', () => { const next = shuffled(order); order.splice(0, order.length, ...next); draw(); });
  done.addEventListener('click', () => { const result = [...order]; close(); onDone(result); });
  cancel.addEventListener('click', close);
  document.addEventListener('keydown', onKey, true);
  current = { close };
  draw();
  done.focus({ preventScroll: true });
  requestAnimationFrame(() => { if (overlay.isConnected) done.focus({ preventScroll: true }); }); // (the menu that opened this window gives the focus back to its own button as it closes: take it again)
  return { close };
}
