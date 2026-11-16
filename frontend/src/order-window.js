// A window for putting several cards in an order (Kevin, 2026-11-15): the cards side by side, the first on the left. Drag a card to another place (a pointer: mouse or pen or a finger), or move it with the two arrows
// under it (they work from the keyboard). Done gives the order, Cancel or Escape leaves everything as it was. It looks like the Scry window and uses its styles (frontend/src/style.css, .scry-*).
// openOrderWindow({ title, note, cards, nodeFor, onDone }): cards, the cards in the order to start from (the first is on the left); nodeFor(card), the card button; onDone(uids) is called with the uids in the order
// chosen. Returns { close }.
const make = (tag, className, text) => { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; };
const DRAG_START_PX = 6;
let current = null;

export function openOrderWindow({ title, note, cards, nodeFor, onDone, places = null }) {
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
  buttons.append(done, cancel);
  panel.append(heading, noteLine, list, buttons);
  overlay.append(panel);
  document.body.append(overlay);

  function draw(focus = null) {
    list.replaceChildren(...order.map((uid, index) => {
      const item = make('li', 'scry-card');
      item.dataset.uid = uid;
      const place = make('span', 'scry-place', places ? places(index, order.length) : (index === 0 ? 'First' : `#${index + 1}`));
      const picture = make('div', 'scry-picture order-handle');
      picture.title = 'Drag to move this card';
      picture.append(nodeFor(byUid.get(uid)));
      const arrows = make('div', 'scry-arrows');
      const earlier = make('button', 'scry-move', '◀'); earlier.type = 'button'; earlier.disabled = index === 0; earlier.setAttribute('aria-label', `Move ${byUid.get(uid).n} earlier`);
      const later = make('button', 'scry-move', '▶'); later.type = 'button'; later.disabled = index === order.length - 1; later.setAttribute('aria-label', `Move ${byUid.get(uid).n} later`);
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

  // dragging a card: it follows the pointer sideways, and where it lands is decided by how many of the other cards have their middle to the left of the pointer
  function startDrag(event, item, uid) {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = false;
    const others = () => [...list.children].filter((child) => child !== item);
    const target = (x) => others().filter((child) => { const r = child.getBoundingClientRect(); return r.left + r.width / 2 < x; }).length;
    const onMove = (move) => {
      const dx = move.clientX - startX;
      if (!dragging && Math.hypot(dx, move.clientY - startY) < DRAG_START_PX) return;
      dragging = true;
      item.classList.add('order-dragging');
      item.style.translate = `${dx}px ${move.clientY - startY}px`;
    };
    const onUp = (up) => {
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onUp, true);
      if (!dragging) return;
      const to = target(up.clientX);
      const from = order.indexOf(uid);
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
  done.addEventListener('click', () => { const result = [...order]; close(); onDone(result); });
  cancel.addEventListener('click', close);
  document.addEventListener('keydown', onKey, true);
  current = { close };
  draw();
  done.focus({ preventScroll: true });
  requestAnimationFrame(() => { if (overlay.isConnected) done.focus({ preventScroll: true }); }); // (the menu that opened this window gives the focus back to its own button as it closes: take it again)
  return { close };
}
