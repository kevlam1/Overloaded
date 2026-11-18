// The stack window (Kevin, 2026-11-17, solo table only): a panel that slides out from the left edge, with a vertical list of card COPIES (the top of the stack is the highest one) and text boxes between
// them. It is a visual aid: nothing here changes the game. The rules are in shared/stack.mjs (plain logic, tested in Node); this file draws them and takes the clicks and drags.
// The list shows only the cards and the text boxes, no buttons beside them (Kevin, 2026-11-17): a card is moved by dragging it (the others glide aside to open its place, like the cards of the hand and
// the ordering window), and everything else is in the right-click menu of the card or text box. Keyboard: Tab to an item, Alt+Up and Alt+Down move it, Delete takes it off, the Menu key opens its menu.
// Cards are drawn with their own set of card buttons (read-only, keyed by the copy's own uid), so counters, power and toughness and badges look like they do on the battlefield.
import { makeCardNodes } from './card-nodes.js';
import { openCardMenu } from './card-menu.js';
import { emptyStack, addCard, addText, setText, moveItem, removeItem, resolveTop, clearStack, undo, canUndo, cardCount, summary, MAX_TEXT } from '../../shared/stack.mjs';

const make = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const DRAG_START = 6; // pixels the pointer moves before a press on an item becomes a drag
const GLIDE_MS = 220;
const EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// root: the empty <aside> to draw into. printedStats(card): the printed power and toughness of a card (the page's lookup). say(message, isError): the status line of the page.
export function mountStackWindow({ root, printedStats = () => null, say = () => {} }) {
  let stack = emptyStack();
  let open = false;
  let focusId = null; // an item to give the focus to after the next draw (a text box that was just added, or the item that was moved)
  let focusText = false;
  const nodes = makeCardNodes({ readOnly: true, printedStats });

  const id = 'stack-panel';
  const tab = make('button', 'stack-tab');
  tab.type = 'button';
  tab.setAttribute('aria-controls', id);
  const tabWord = make('span', 'stack-tab-word', 'Stack');
  const tabCount = make('span', 'stack-tab-count', '0');
  tab.append(tabWord, tabCount);

  const panel = make('div', 'stack-panel');
  panel.id = id;
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'The stack');
  const head = make('div', 'stack-head');
  head.append(make('h2', 'stack-title', 'The stack'));
  const buttons = make('div', 'stack-buttons');
  const button = (label, title, onClick) => { const b = make('button', 'secondary stack-button', label); b.type = 'button'; b.title = title; b.addEventListener('click', onClick); return b; };
  const resolveButton = button('Resolve top', 'Take the top card off the stack (and the text boxes above it). Nothing happens to your game.', () => { const result = resolveTop(stack); if (!result.resolved) return; stack = result.stack; say(`Resolved ${result.resolved.n} (it left the stack; your game is unchanged).`); draw(); });
  const undoButton = button('Undo', 'Take back the last change to the stack', () => { if (!canUndo(stack)) return; stack = undo(stack); say('Undid the last change to the stack.'); draw(); });
  const textButton = button('Add text', 'Add a text box at the top of the stack', () => addNote(0));
  const clearButton = button('Clear', 'Take everything off the stack (Undo brings it back)', () => { stack = clearStack(stack); say('Cleared the stack.'); draw(); });
  buttons.append(resolveButton, undoButton, textButton, clearButton);
  head.append(buttons, make('p', 'stack-hint', 'The top of the stack is the highest. Drag a card to move it; right-click a card or a text box for more.'));
  const live = make('p', 'sr-only');
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  const list = make('ol', 'stack-list');
  panel.append(head, live, list);
  root.replaceChildren(panel, tab);

  function setOpen(next, { focus = false } = {}) {
    open = Boolean(next);
    root.dataset.open = open ? 'true' : 'false';
    tab.setAttribute('aria-expanded', String(open));
    tab.title = open ? 'Slide the stack away' : 'Slide the stack out';
    panel.inert = !open; // (hidden from the keyboard and screen readers while it is slid away)
    if (open && focus) (list.querySelector('.stack-item') ?? tab).focus({ preventScroll: true });
  }
  tab.addEventListener('click', () => setOpen(!open));
  root.addEventListener('keydown', (event) => { if (event.key === 'Escape' && open && !event.defaultPrevented) { event.preventDefault(); setOpen(false); tab.focus({ preventScroll: true }); } });

  function addNote(index) {
    try { const made = addText(stack, index, ''); stack = made.stack; focusId = made.id; focusText = true; draw(); } catch (error) { say(error.message, true); }
  }
  // A change to the stack: the new stack, an optional message, and the item to keep the focus on.
  const act = (run, message = '', keep = null) => { try { stack = run(stack); if (message) say(message); if (keep) { focusId = keep; focusText = false; } draw(); } catch (error) { say(error.message, true); draw(); } };
  const indexOf = (itemId) => stack.items.findIndex((entry) => entry.id === itemId);

  // What each item's right-click menu offers (a card and a text box have the same moves; a card also has Move to top and Move to bottom).
  function menuFor(item) {
    const at = indexOf(item.id);
    const last = stack.items.length - 1;
    const lines = [];
    if (at > 0) lines.push({ id: 'up', label: 'Move up' });
    if (at < last) lines.push({ id: 'down', label: 'Move down' });
    if (at > 0) lines.push({ id: 'top', label: 'Move to top' });
    if (at < last) lines.push({ id: 'bottom', label: 'Move to bottom' });
    lines.push({ id: 'text', label: 'Add text below' });
    lines.push({ id: 'remove', label: item.kind === 'card' ? 'Take off the stack' : 'Remove text box' });
    return lines;
  }
  function pick(item, choice) {
    const at = indexOf(item.id);
    if (at < 0) return;
    if (choice === 'up') act((s) => moveItem(s, item.id, at - 1), '', item.id);
    else if (choice === 'down') act((s) => moveItem(s, item.id, at + 1), '', item.id);
    else if (choice === 'top') act((s) => moveItem(s, item.id, 0), '', item.id);
    else if (choice === 'bottom') act((s) => moveItem(s, item.id, s.items.length - 1), '', item.id);
    else if (choice === 'text') addNote(at + 1);
    else if (choice === 'remove') act((s) => removeItem(s, item.id), item.kind === 'card' ? `Took ${item.card.n} off the stack.` : 'Removed a text box.');
  }
  function openMenu(item, li, event) {
    event.preventDefault();
    const fromKeyboard = event.clientX === 0 && event.clientY === 0;
    const box = li.getBoundingClientRect();
    openCardMenu({
      title: item.kind === 'card' ? item.card.n : 'Text box',
      items: menuFor(item),
      x: fromKeyboard ? box.left + box.width / 2 : event.clientX, y: fromKeyboard ? box.top + box.height / 2 : event.clientY,
      returnFocus: li,
      onPick: (choice) => pick(item, choice),
    });
  }
  function onItemKey(item, event) {
    if (event.target !== event.currentTarget) return; // (a key typed in a text box is the text box's)
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) { event.preventDefault(); pick(item, event.key === 'ArrowUp' ? 'up' : 'down'); }
    else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); pick(item, 'remove'); }
    else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); const next = event.currentTarget[event.key === 'ArrowUp' ? 'previousElementSibling' : 'nextElementSibling']; if (next?.classList.contains('stack-item')) next.focus({ preventScroll: true }); }
  }

  function cardItem(item, topId) {
    const li = make('li', 'stack-item stack-card');
    li.dataset.id = item.id;
    li.dataset.kind = 'card';
    li.tabIndex = 0;
    li.setAttribute('aria-label', `${item.card.n}${item.id === topId ? ', top of the stack' : ''}. Alt and the arrow keys move it, Delete takes it off the stack.`);
    if (item.id === topId) li.dataset.top = 'true';
    li.append(nodes.nodeFor(item.card, true));
    li.addEventListener('contextmenu', (event) => openMenu(item, li, event));
    li.addEventListener('keydown', (event) => onItemKey(item, event));
    return li;
  }

  function textItem(item) {
    const li = make('li', 'stack-item stack-text');
    li.dataset.id = item.id;
    li.dataset.kind = 'text';
    li.tabIndex = 0;
    li.setAttribute('aria-label', 'Text box. Alt and the arrow keys move it, Delete removes it.');
    const grip = make('span', 'stack-grip');
    grip.setAttribute('aria-hidden', 'true');
    grip.title = 'Drag to move this text box';
    const field = make('textarea', 'stack-note');
    field.value = item.text;
    field.rows = 2;
    field.maxLength = MAX_TEXT;
    field.placeholder = 'Write a note (for example: target, or what it does)';
    field.setAttribute('aria-label', 'Text box on the stack');
    // The change is kept when the box is left (one step for Undo, not one per letter). A box left empty is taken away: nothing to keep.
    field.addEventListener('blur', () => {
      if (!field.isConnected || indexOf(item.id) < 0) return;
      if (field.value.trim() === '') act((s) => removeItem(s, item.id));
      else if (field.value !== item.text) act((s) => setText(s, item.id, field.value));
    });
    field.addEventListener('keydown', (event) => { if (event.key === 'Escape') { field.value = item.text; field.blur(); event.stopPropagation(); } });
    li.append(grip, field);
    li.addEventListener('contextmenu', (event) => openMenu(item, li, event));
    li.addEventListener('keydown', (event) => onItemKey(item, event));
    return li;
  }

  // The items glide from where they were to where they are now (like the ordering window and the hand): each item's old box is remembered, the list is drawn again, and every item that has moved starts
  // from its old place and eases to the new one; an item that is new fades in from a little above. Under reduced motion they just change places.
  function draw() {
    const before = new Map([...list.children].filter((node) => node.dataset.id).map((node) => [node.dataset.id, node.getBoundingClientRect()]));
    const topId = stack.items.find((item) => item.kind === 'card')?.id ?? null;
    const items = stack.items.map((item) => (item.kind === 'card' ? cardItem(item, topId) : textItem(item)));
    if (items.length === 0) items.push(make('li', 'stack-empty', 'Nothing on the stack. Right-click a card and choose "Add to the stack".'));
    list.replaceChildren(...items);
    const count = cardCount(stack);
    tabCount.textContent = String(count);
    tabCount.hidden = count === 0;
    tab.setAttribute('aria-label', `Stack, ${summary(stack)}`);
    resolveButton.disabled = count === 0;
    undoButton.disabled = !canUndo(stack);
    clearButton.disabled = stack.items.length === 0;
    live.textContent = summary(stack);
    if (!reduced() && before.size > 0 && open) {
      for (const node of items) {
        if (!node.dataset.id) continue;
        const from = before.get(node.dataset.id);
        if (!from) { node.animate([{ opacity: 0, transform: 'translateY(-14px)' }, { opacity: 1, transform: 'none' }], { duration: GLIDE_MS, easing: EASING }); continue; }
        const to = node.getBoundingClientRect();
        const dy = from.top - to.top;
        if (Math.abs(dy) >= 1) node.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: GLIDE_MS, easing: EASING });
      }
    }
    if (focusId) {
      const node = list.querySelector(`li[data-id="${focusId}"]`);
      const wantText = focusText;
      focusId = null; focusText = false;
      if (node) { if (wantText) { setOpen(true); node.querySelector('textarea')?.focus({ preventScroll: true }); } else node.focus({ preventScroll: true }); }
    }
  }

  // ---- drag to reorder (mouse and pen; the Alt and arrow keys and the menu do it for the keyboard and for touch) ----
  // The dragged item follows the pointer (its translate); the place it would take is how many OTHER items have their middle above the middle of the dragged item, judged on the places the items had when the drag
  // began; the items between its old place and that one slide aside by the height of the dragged item (a transition), to open the place. On letting go the list is drawn again and everything glides home.
  let drag = null;
  function arrange() {
    const { items, from, to, height } = drag;
    items.forEach((node, index) => {
      if (index === from) return;
      const shift = from < to && index > from && index <= to ? -height : from > to && index >= to && index < from ? height : 0;
      node.style.transition = reduced() ? 'none' : `translate ${GLIDE_MS}ms ${EASING}`;
      node.style.translate = shift === 0 ? '' : `0 ${shift}px`;
    });
  }
  function endDrag() {
    if (!drag) return;
    drag.li.classList.remove('dragging');
    try { list.releasePointerCapture(drag.pointerId); } catch { /* it was already let go */ }
    const finished = drag;
    drag = null;
    return finished;
  }
  list.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.pointerType === 'touch' || !(event.target instanceof Element)) return;
    const li = event.target.closest('.stack-item');
    if (!li || event.target.closest('textarea')) return;
    const items = [...list.children].filter((node) => node.dataset.id);
    const slots = items.map((node) => node.getBoundingClientRect());
    const from = items.indexOf(li);
    const gap = items.length > 1 ? Math.max(0, (slots[from === 0 ? 1 : from].top) - (slots[from === 0 ? 0 : from - 1].bottom)) : 0;
    drag = { li, id: li.dataset.id, items, slots, from, to: from, startY: event.clientY, active: false, pointerId: event.pointerId, height: slots[from].height + gap };
  });
  list.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dy = event.clientY - drag.startY;
    if (!drag.active) {
      if (Math.abs(dy) < DRAG_START) return;
      drag.active = true;
      drag.li.classList.add('dragging');
      try { list.setPointerCapture(event.pointerId); } catch { /* the drag still works without capture */ }
    }
    drag.li.style.translate = `0 ${dy}px`;
    const center = drag.slots[drag.from].top + drag.slots[drag.from].height / 2 + dy;
    let to = 0;
    drag.slots.forEach((slot, index) => { if (index !== drag.from && center > slot.top + slot.height / 2) to++; });
    if (to !== drag.to) { drag.to = to; arrange(); }
  });
  list.addEventListener('pointerup', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const finished = endDrag();
    if (!finished.active) return;
    if (finished.to !== finished.from) act((s) => moveItem(s, finished.id, finished.to), '', finished.id);
    else draw(); // (it goes home)
  });
  list.addEventListener('pointercancel', () => { const finished = endDrag(); if (finished?.active) draw(); });
  document.addEventListener('keydown', (event) => { if (drag?.active && event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); const finished = endDrag(); if (finished) draw(); } }, true);

  setOpen(false);
  draw();
  return {
    // Puts a copy of the card on top of the stack and slides the window out so the player sees it.
    add(card) {
      try { stack = addCard(stack, card); say(`Added ${card.n} to the stack.`); setOpen(true); draw(); return true; } catch (error) { say(error.message, true); return false; }
    },
    open: () => setOpen(true),
    close: () => setOpen(false),
    isOpen: () => open,
    summary: () => summary(stack),
    cardCount: () => cardCount(stack),
  };
}
