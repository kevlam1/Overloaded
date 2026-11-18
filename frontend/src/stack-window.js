// The stack window (Kevin, 2026-11-17, solo table only): a panel that slides out from the left edge, with a vertical list of card COPIES (the top of the stack is the highest one) and text boxes between
// them. It is a visual aid: nothing here changes the game. The rules are in shared/stack.mjs (plain logic, tested in Node); this file draws them and takes the clicks and drags.
// Cards are drawn with their own set of card buttons (read-only, keyed by the copy's own uid), so counters, power and toughness and badges look like they do on the battlefield.
import { makeCardNodes } from './card-nodes.js';
import { openCardMenu } from './card-menu.js';
import { emptyStack, addCard, addText, setText, moveItem, removeItem, resolveTop, clearStack, undo, canUndo, cardCount, summary, MAX_TEXT } from '../../shared/stack.mjs';

const make = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const DRAG_START = 6; // pixels the pointer moves before a press on an item becomes a drag

// root: the empty <aside> to draw into. printedStats(card): the printed power and toughness of a card (the page's lookup). say(message, isError): the status line of the page.
export function mountStackWindow({ root, printedStats = () => null, say = () => {} }) {
  let stack = emptyStack();
  let open = false;
  let focusId = null; // a text box to focus after the next draw (one that was just added)
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
  const button = (label, title, onClick, extra = '') => { const b = make('button', `secondary stack-button ${extra}`.trim(), label); b.type = 'button'; b.title = title; b.addEventListener('click', onClick); return b; };
  const resolveButton = button('Resolve top', 'Take the top card off the stack (and the text boxes above it). Nothing happens to your game.', () => { const result = resolveTop(stack); if (!result.resolved) return; stack = result.stack; say(`Resolved ${result.resolved.n} (it left the stack; your game is unchanged).`); draw(); });
  const undoButton = button('Undo', 'Take back the last change to the stack', () => { if (!canUndo(stack)) return; stack = undo(stack); say('Undid the last change to the stack.'); draw(); });
  const textButton = button('Add text', 'Add a text box at the top of the stack', () => addNote(0));
  const clearButton = button('Clear', 'Take everything off the stack (Undo brings it back)', () => { stack = clearStack(stack); say('Cleared the stack.'); draw(); });
  buttons.append(resolveButton, undoButton, textButton, clearButton);
  head.append(buttons);
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
    if (open && focus) (list.querySelector('button, textarea') ?? tab).focus({ preventScroll: true });
  }
  tab.addEventListener('click', () => setOpen(!open));
  root.addEventListener('keydown', (event) => { if (event.key === 'Escape' && open && !event.defaultPrevented) { event.preventDefault(); setOpen(false); tab.focus({ preventScroll: true }); } });

  function addNote(index) {
    try { const made = addText(stack, index, ''); stack = made.stack; focusId = made.id; draw(); } catch (error) { say(error.message, true); }
  }
  const act = (run, message) => { try { stack = run(stack); if (message) say(message); draw(); } catch (error) { say(error.message, true); draw(); } };

  function cardItem(item, index, last, topId) {
    const li = make('li', 'stack-item stack-card');
    li.dataset.id = item.id;
    li.dataset.kind = 'card';
    if (item.id === topId) li.dataset.top = 'true';
    if (item.id === topId) li.append(make('span', 'stack-label', 'Top of the stack'));
    const box = make('div', 'stack-card-box');
    const card = nodes.nodeFor(item.card, true);
    box.append(card);
    const controls = make('div', 'stack-controls');
    const small = (label, title, onClick, disabled = false) => { const b = make('button', 'stack-small', label); b.type = 'button'; b.title = title; b.setAttribute('aria-label', `${title}: ${item.card.n}`); b.disabled = disabled; b.addEventListener('click', onClick); return b; };
    controls.append(
      small('Up', 'Move up', () => act((s) => moveItem(s, item.id, index - 1)), index === 0),
      small('Down', 'Move down', () => act((s) => moveItem(s, item.id, index + 1)), last),
      small('Text below', 'Add a text box below', () => addNote(index + 1)),
      small('Remove', 'Take off the stack', () => act((s) => removeItem(s, item.id), `Took ${item.card.n} off the stack.`)),
    );
    li.append(box, controls);
    li.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      openCardMenu({
        title: item.card.n,
        items: [{ id: 'top', label: 'Move to top' }, { id: 'bottom', label: 'Move to bottom' }, { id: 'text', label: 'Add text below' }, { id: 'remove', label: 'Take off the stack' }],
        x: event.clientX, y: event.clientY, returnFocus: tab,
        onPick: (pick) => {
          const at = stack.items.findIndex((entry) => entry.id === item.id);
          if (at < 0) return;
          if (pick === 'top') act((s) => moveItem(s, item.id, 0));
          else if (pick === 'bottom') act((s) => moveItem(s, item.id, s.items.length - 1));
          else if (pick === 'text') addNote(at + 1);
          else if (pick === 'remove') act((s) => removeItem(s, item.id), `Took ${item.card.n} off the stack.`);
        },
      });
    });
    return li;
  }

  function textItem(item) {
    const li = make('li', 'stack-item stack-text');
    li.dataset.id = item.id;
    li.dataset.kind = 'text';
    const field = make('textarea', 'stack-note');
    field.value = item.text;
    field.rows = 2;
    field.maxLength = MAX_TEXT;
    field.placeholder = 'Write a note (for example: target, or what it does)';
    field.setAttribute('aria-label', 'Text box on the stack');
    // The change is kept when the box is left (one step for Undo, not one per letter).
    field.addEventListener('change', () => act((s) => setText(s, item.id, field.value)));
    field.addEventListener('keydown', (event) => { if (event.key === 'Escape') { field.value = item.text; field.blur(); } });
    const controls = make('div', 'stack-controls');
    const index = stack.items.findIndex((entry) => entry.id === item.id);
    const small = (label, title, onClick, disabled = false) => { const b = make('button', 'stack-small', label); b.type = 'button'; b.title = title; b.setAttribute('aria-label', title); b.disabled = disabled; b.addEventListener('click', onClick); return b; };
    controls.append(
      small('Up', 'Move the text up', () => act((s) => moveItem(s, item.id, index - 1)), index === 0),
      small('Down', 'Move the text down', () => act((s) => moveItem(s, item.id, index + 1)), index === stack.items.length - 1),
      small('Remove', 'Remove the text box', () => act((s) => removeItem(s, item.id))),
    );
    li.append(field, controls);
    return li;
  }

  function draw() {
    const topId = stack.items.find((item) => item.kind === 'card')?.id ?? null;
    const items = stack.items.map((item, index) => (item.kind === 'card' ? cardItem(item, index, index === stack.items.length - 1, topId) : textItem(item)));
    if (items.length === 0) { const empty = make('li', 'stack-empty', 'Nothing on the stack. Right-click a card and choose "Add to the stack".'); items.push(empty); }
    list.replaceChildren(...items);
    const count = cardCount(stack);
    tabCount.textContent = String(count);
    tabCount.hidden = count === 0;
    tab.setAttribute('aria-label', `Stack, ${summary(stack)}`);
    resolveButton.disabled = count === 0;
    undoButton.disabled = !canUndo(stack);
    clearButton.disabled = stack.items.length === 0;
    live.textContent = summary(stack);
    if (focusId) { const field = list.querySelector(`li[data-id="${focusId}"] textarea`); focusId = null; if (field) { setOpen(true); field.focus({ preventScroll: true }); } }
  }

  // ---- drag to reorder (mouse and pen; the Up and Down buttons do it for the keyboard and for touch) ----
  let drag = null;
  const clearMarks = () => { for (const node of list.children) { node.classList.remove('drop-before', 'drop-end'); } };
  function placeFor(clientY) { // where the dragged item would land: how many OTHER items have their middle above the pointer
    const others = [...list.children].filter((node) => node !== drag.li && node.dataset.id);
    let index = 0;
    for (const node of others) { const box = node.getBoundingClientRect(); if (clientY > box.top + box.height / 2) index++; }
    return { index, others };
  }
  function endDrag() {
    if (!drag) return;
    drag.li.classList.remove('dragging'); drag.li.style.transform = ''; clearMarks();
    try { list.releasePointerCapture(drag.pointerId); } catch { /* it was already let go */ }
    drag = null;
  }
  list.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.pointerType === 'touch' || !(event.target instanceof Element)) return;
    const li = event.target.closest('.stack-item');
    if (!li || event.target.closest('button, textarea')) return;
    drag = { li, id: li.dataset.id, startY: event.clientY, active: false, pointerId: event.pointerId };
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
    drag.li.style.transform = `translateY(${dy}px)`;
    const { index, others } = placeFor(event.clientY);
    clearMarks();
    if (index < others.length) others[index].classList.add('drop-before'); else others.at(-1)?.classList.add('drop-end');
    drag.index = index;
  });
  list.addEventListener('pointerup', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { id: moving, active, index } = drag;
    endDrag();
    if (active && Number.isInteger(index)) act((s) => moveItem(s, moving, index));
  });
  list.addEventListener('pointercancel', endDrag);
  document.addEventListener('keydown', (event) => { if (drag?.active && event.key === 'Escape') { event.stopPropagation(); endDrag(); } }, true);

  setOpen(false);
  draw();
  return {
    // Puts a copy of the card on top of the stack and slides the window out so the player sees it.
    add(card) {
      try { stack = addCard(stack, card); say(`Added ${card.n} to the stack.`); draw(); setOpen(true); return true; } catch (error) { say(error.message, true); return false; }
    },
    open: () => setOpen(true),
    close: () => setOpen(false),
    isOpen: () => open,
    summary: () => summary(stack),
    cardCount: () => cardCount(stack),
  };
}
