// The stack window (Kevin, 2026-11-17, solo table only): a panel that slides out from the left edge, with a vertical list of card COPIES (the top of the stack is the highest one) and text boxes between
// them. It is a visual aid: nothing here changes the game. The rules are in shared/stack.mjs (plain logic, tested in Node); this file draws them and takes the clicks and drags.
// The list shows only the cards and the text boxes, no buttons beside them (Kevin, 2026-11-17): a card is moved by dragging it (the others glide aside to open its place, like the cards of the hand and
// the ordering window), and everything else is in the right-click menu of the card or text box. Keyboard: Tab to an item, Alt+Up and Alt+Down move it, Delete takes it off, the Menu key opens its menu.
// Cards are drawn with their own set of card buttons (read-only, keyed by the copy's own uid), so counters, power and toughness and badges look like they do on the battlefield.
import { makeCardNodes, sharpenPicture } from './card-nodes.js';
import { openCardMenu } from './card-menu.js';
import { emptyStack, addCard, addText, setText, moveItem, removeItem, resolveTop, clearStack, undo, canUndo, cardCount, summary, addArrow, removeArrow, removeArrowsOf, arrowsOf, MAX_TEXT } from '../../shared/stack.mjs';
import { arrowPath, overlaps, visible } from '../../shared/arrow-geometry.mjs';
import { mountFloatingBar } from './floating-bar.js';

const make = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const SVG_NS = 'http://www.w3.org/2000/svg';
const svgEl = (name, attributes = {}) => { const element = document.createElementNS(SVG_NS, name); for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value)); return element; };
const nameOfCard = (element) => (element?.getAttribute?.('aria-label') ?? '').split(/[,.]/)[0] || 'a card';
const DRAG_START = 6; // pixels the pointer moves before a press on an item becomes a drag
const GLIDE_MS = 220;
const EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// root: the empty <aside> to draw into. printedStats(card): the printed power and toughness of a card (the page's lookup). say(message, isError): the status line of the page.
// The live table shares one stack (shared/stack-sync.mjs): onChange(stack) is called after every change made here (the page stores it), replace(stack) shows a stack that came from the database, realCard(target)
// finds the element of a real card an arrow points at, and targetOf(element) says which real card an element is ({ card, owner }); on the solo table these are only your own battlefield.
// Moving and folding (2026-11-26 feedback, step 4): with `docking` (src/tool-dock.js dockingFor('stack')) the title is a handle like Game history's: a click folds the window up to its title or opens it
// again, a drag takes it out of the rail to float (src/floating-bar.js, its place kept under `placeKey`), and let go over the rail it docks again. Folded is kept in the browser too.
export function mountStackWindow({ root, printedStats = () => null, say = () => {}, onChange = null, realCard = null, targetOf = null, realCardSelector = '#battlefield .card[data-uid]', store = null, docking = null, room = null, placeKey = 'overloaded.stackPlace' }) {
  let stack = emptyStack();
  // every change made in this window goes through here: it is drawn, and on the live table it is stored
  const set = (next) => { stack = next; draw(); onChange?.(stack); };
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
  const grip = make('button', 'stack-grip');
  grip.type = 'button';
  grip.title = 'Click to fold, drag to move';
  grip.append(make('span', 'stack-title', 'The stack'));
  head.append(grip);
  const buttons = make('div', 'stack-buttons');
  const button = (label, title, onClick) => { const b = make('button', 'secondary stack-button', label); b.type = 'button'; b.title = title; b.addEventListener('click', onClick); return b; };
  const resolveButton = button('Resolve top', 'Remove the top card', () => { const result = resolveTop(stack); if (!result.resolved) return; say(`Resolved ${result.resolved.n}.`); set(result.stack); });
  const undoButton = button('Undo', 'Undo', () => { if (!canUndo(stack)) return; say('Undone.'); set(undo(stack)); });
  const textButton = button('Add note', 'Add a note at the top', () => addNote(0));
  const clearButton = button('Clear', 'Remove everything', () => { say('Cleared.'); set(clearStack(stack)); });
  buttons.append(resolveButton, undoButton, textButton, clearButton);
  head.append(buttons, make('p', 'stack-hint', 'Drag to reorder. Shift+drag to aim.'));
  const live = make('p', 'sr-only');
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  const list = make('ol', 'stack-list');
  // Shift and the wheel over the list scrolls it up and down (Shift makes the wheel scroll sideways in Chrome, and the list does not scroll sideways)
  list.addEventListener('wheel', (event) => { if (!event.shiftKey) return; event.preventDefault(); list.scrollTop += event.deltaY || event.deltaX; }, { passive: false });
  panel.append(head, live, list);
  root.replaceChildren(panel, tab);

  const FOLD_KEY = 'overloaded.stackFolded';
  let folded = store?.get(FOLD_KEY) === '1';
  function setFolded(next) {
    folded = Boolean(next);
    root.dataset.folded = String(folded);
    grip.setAttribute('aria-expanded', String(!folded));
    buttons.hidden = folded; list.hidden = folded;
    for (const hint of head.querySelectorAll('.stack-hint')) hint.hidden = folded;
    store?.set(FOLD_KEY, folded ? '1' : '0');
  }
  grip.addEventListener('click', () => { if (pinned) setFolded(!folded); });

  // ---- the arrows (Kevin, 2026-11-17): one SVG layer over the page, drawn again every animation frame while there is an arrow (or one is being drawn) and the window is out, so an arrow follows its cards
  // when they glide or the list scrolls. The path comes from shared/arrow-geometry.mjs. An arrow whose card is not on screen (scrolled out of the list, or a real card that left the table) is hidden.
  const layer = svgEl('svg', { class: 'stack-arrows', width: window.innerWidth, height: window.innerHeight, fill: 'none', 'aria-hidden': 'true' });
  const defs = svgEl('defs');
  const head2 = svgEl('marker', { id: 'stack-arrowhead', viewBox: '0 0 12 12', markerWidth: 13, markerHeight: 13, refX: 9, refY: 6, orient: 'auto', markerUnits: 'userSpaceOnUse' });
  head2.append(svgEl('path', { d: 'M1 1 L11 6 L1 11 L3.5 6 Z', fill: 'currentColor' }));
  defs.append(head2);
  const dot = svgEl('marker', { id: 'stack-arrowdot', viewBox: '0 0 10 10', markerWidth: 10, markerHeight: 10, refX: 5, refY: 5, orient: 'auto', markerUnits: 'userSpaceOnUse' }); // (a small dot where the arrow starts)
  dot.append(svgEl('circle', { cx: 5, cy: 5, r: 4, fill: 'currentColor' }));
  defs.append(dot);
  layer.append(defs);
  document.body.append(layer);
  window.addEventListener('resize', () => { layer.setAttribute('width', String(window.innerWidth)); layer.setAttribute('height', String(window.innerHeight)); });
  const groups = new Map(); // arrow id -> { g, halo, line, hit }
  let draft = null; // an arrow being drawn: { from, x, y, path }
  let frameId = 0;
  let hoverTarget = null; // the element the arrow being drawn would point at (it gets a mark)
  const draftPath = svgEl('path', { class: 'stack-arrow-draft', fill: 'none', 'marker-start': 'url(#stack-arrowdot)', 'marker-end': 'url(#stack-arrowhead)' });
  draftPath.style.display = 'none';
  layer.append(draftPath);

  const realCardEl = (target) => (realCard ? realCard(target) : document.querySelector(`#battlefield .card[data-uid="${CSS.escape(target.card)}"]`));
  const itemEl = (itemId) => list.querySelector(`li.stack-item[data-id="${CSS.escape(itemId)}"]`);
  // A card partly scrolled out of the list counts only for the part of it that shows, so an arrow never starts or ends over the window's head or below it
  // (Kevin's friends, 2026-11-26: the arrows glitched as cards scrolled in and out).
  const clipTo = (rect, box) => ({ left: rect.left, right: rect.right, width: rect.width, top: Math.max(rect.top, box.top), bottom: Math.min(rect.bottom, box.bottom), height: Math.max(0, Math.min(rect.bottom, box.bottom) - Math.max(rect.top, box.top)) });
  function pathFor(arrow, listBox) {
    const sourceLi = itemEl(arrow.from);
    if (!sourceLi) return null;
    const whole = sourceLi.getBoundingClientRect();
    if (!visible(whole) || !overlaps(whole, listBox)) return null;
    const source = clipTo(whole, listBox);
    if (source.height < 8) return null;
    if (arrow.to.item !== undefined) {
      const full = itemEl(arrow.to.item)?.getBoundingClientRect();
      if (!full || !visible(full) || !overlaps(full, listBox)) return null;
      const rect = clipTo(full, listBox);
      if (rect.height < 8) return null;
      return arrowPath(source, { kind: 'item', rect });
    }
    const rect = realCardEl(arrow.to)?.getBoundingClientRect();
    if (!rect || !visible(rect)) return null;
    return arrowPath(source, { kind: 'card', rect });
  }
  function frame() {
    frameId = 0;
    if (!open) return;
    const listBox = list.getBoundingClientRect();
    for (const arrow of stack.arrows) {
      const parts = groups.get(arrow.id);
      if (!parts) continue;
      const path = pathFor(arrow, listBox);
      parts.g.classList.toggle('arrow-gone', !path); // (fades out and in, rather than popping)
      if (path) for (const element of [parts.halo, parts.line, parts.hit]) element.setAttribute('d', path.d);
    }
    if (draft) {
      // aiming near the list's top or bottom edge scrolls it, faster the closer to the edge (Kevin's friends, 2026-11-26: there was no way to scroll while aiming)
      const EDGE = 40;
      if (draft.x >= listBox.left - 60 && draft.x <= listBox.right + 60) {
        if (draft.y < listBox.top + EDGE && draft.y > listBox.top - 80) list.scrollTop -= Math.ceil((listBox.top + EDGE - draft.y) / 4);
        else if (draft.y > listBox.bottom - EDGE && draft.y < listBox.bottom + 80) list.scrollTop += Math.ceil((draft.y - (listBox.bottom - EDGE)) / 4);
      }
      const sourceLi = itemEl(draft.from);
      const whole = sourceLi?.getBoundingClientRect();
      const path = whole && overlaps(whole, listBox) ? arrowPath(clipTo(whole, listBox), { kind: 'point', x: draft.x, y: draft.y }) : null;
      draftPath.style.display = path ? '' : 'none';
      if (path) draftPath.setAttribute('d', path.d);
    } else draftPath.style.display = 'none';
    if (stack.arrows.length > 0 || draft) frameId = requestAnimationFrame(frame);
  }
  const scheduleFrame = () => { if (!frameId && open) frameId = requestAnimationFrame(frame); };
  function syncArrows() {
    const wanted = new Set(stack.arrows.map((arrow) => arrow.id));
    for (const [arrowId, parts] of groups) if (!wanted.has(arrowId)) { parts.g.remove(); groups.delete(arrowId); }
    for (const arrow of stack.arrows) {
      if (groups.has(arrow.id)) continue;
      const g = svgEl('g', { class: 'stack-arrow' });
      g.dataset.id = arrow.id;
      const halo = svgEl('path', { class: 'stack-arrow-halo', fill: 'none' });
      const line = svgEl('path', { class: 'stack-arrow-line', fill: 'none', 'marker-start': 'url(#stack-arrowdot)', 'marker-end': 'url(#stack-arrowhead)' });
      const hit = svgEl('path', { class: 'stack-arrow-hit', fill: 'none' });
      hit.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        openCardMenu({ title: 'Arrow', items: [{ id: 'remove', label: 'Remove' }], x: event.clientX, y: event.clientY, returnFocus: tab, onPick: () => act((s) => removeArrow(s, arrow.id), 'Arrow removed.') });
      });
      g.append(halo, line, hit);
      layer.insertBefore(g, draftPath);
      groups.set(arrow.id, { g, halo, line, hit });
    }
    scheduleFrame();
  }

  // What an arrow being drawn would point at under the pointer: another card of the stack, or a real card on the battlefield (never the card it starts from).
  function targetAt(x, y, fromId) {
    const element = document.elementFromPoint(x, y);
    if (!element) return null;
    const stackCard = element.closest('#stack-window li.stack-card');
    if (stackCard) return stackCard.dataset.id === fromId ? null : { target: { item: stackCard.dataset.id }, element: stackCard, name: nameOfCard(stackCard.querySelector('.card')) };
    const real = element.closest(realCardSelector);
    if (real) return { target: targetOf ? targetOf(real) : { card: real.dataset.uid }, element: real, name: nameOfCard(real) };
    return null;
  }
  const markTarget = (element) => { if (hoverTarget === element) return; hoverTarget?.classList.remove('stack-target'); hoverTarget = element; hoverTarget?.classList.add('stack-target'); };
  function endDraft() {
    markTarget(null);
    const ended = draft;
    if (ended) itemEl(ended.from)?.classList.remove('stack-arrow-source');
    draft = null;
    document.body.classList.remove('stack-aiming');
    ended?.onEnd?.(); // (whoever started the arrow stops listening for its end)
  }
  // Starts drawing an arrow from a card of the stack. The pointer moves it; the caller ends it with finish(event) (an arrow when the pointer is on a card, nothing otherwise) or cancel(); Escape and a right
  // click cancel it too. Returns { finish, cancel }, or null when there is no such card.
  function startArrow(fromId, x, y, onEnd = null) {
    endDraft();
    const sourceLi = itemEl(fromId);
    if (!sourceLi) return null;
    const box = sourceLi.getBoundingClientRect();
    const mine = { from: fromId, x: x ?? box.right, y: y ?? (box.top + box.bottom) / 2, onEnd };
    draft = mine;
    sourceLi.classList.add('stack-arrow-source');
    document.body.classList.add('stack-aiming');
    scheduleFrame();
    const sourceName = nameOfCard(sourceLi.querySelector('.card'));
    const move = (event) => { if (draft !== mine) return; draft.x = event.clientX; draft.y = event.clientY; markTarget(targetAt(event.clientX, event.clientY, fromId)?.element ?? null); scheduleFrame(); };
    // while aiming, the wheel scrolls the stack's list wherever the pointer is (Shift turns the wheel sideways in Chrome, which scrolled nothing)
    const wheel = (event) => { if (draft !== mine) return; event.preventDefault(); list.scrollTop += event.deltaY || event.deltaX; scheduleFrame(); };
    const stop = () => { document.removeEventListener('wheel', wheel, true); document.removeEventListener('pointermove', move, true); document.removeEventListener('keydown', key, true); document.removeEventListener('contextmenu', cancel, true); };
    const finish = (event) => {
      if (draft !== mine) return false; // (it was cancelled already: Escape, a right click, or the window slid away)
      const hit = targetAt(event.clientX, event.clientY, fromId);
      stop(); endDraft();
      if (!hit) { say('No target.'); return false; }
      try { const made = addArrow(stack, fromId, hit.target); say(`Arrow: ${sourceName} to ${hit.name}.`); set(made.stack); } catch (error) { say(error.message, true); }
      return true;
    };
    const cancel = () => { if (draft !== mine) return; stop(); endDraft(); };
    const key = (event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); say('Cancelled.'); } };
    document.addEventListener('pointermove', move, true);
    document.addEventListener('wheel', wheel, { capture: true, passive: false });
    document.addEventListener('keydown', key, true);
    document.addEventListener('contextmenu', cancel, true);
    return { finish, cancel };
  }

  // The menu line "Point an arrow at...": the arrow follows the pointer from the card, and the next click on a card ends it (a click anywhere else, Escape or a right click draws nothing). That click
  // belongs to the arrow: the page does not also select or drag the card it landed on.
  function aimByClick(fromId) {
    let aim = null;
    const down = (event) => {
      if (event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      // the click that ends this press is the arrow's too: it is swallowed once (or dropped when another press comes first, or after a moment), so the next click on anything works
      const drop = () => { document.removeEventListener('click', swallow, true); document.removeEventListener('pointerdown', drop, true); };
      const swallow = (click) => { click.preventDefault(); click.stopImmediatePropagation(); drop(); };
      document.addEventListener('click', swallow, true);
      document.addEventListener('pointerdown', drop, true);
      setTimeout(drop, 400);
      aim.finish(event);
    };
    aim = startArrow(fromId, null, null, () => document.removeEventListener('pointerdown', down, true));
    if (!aim) return;
    say('Click a target. Esc cancels.');
    document.addEventListener('pointerdown', down, true);
  }

  function setOpen(next, { focus = false } = {}) {
    open = Boolean(next);
    layer.style.display = open ? '' : 'none';
    if (open) scheduleFrame(); else if (draft) endDraft();
    root.dataset.open = open ? 'true' : 'false';
    tab.setAttribute('aria-expanded', String(open));
    tab.title = open ? 'Hide the stack' : 'Show the stack';
    panel.inert = !open; // (hidden from the keyboard and screen readers while it is slid away)
    if (open && focus) (list.querySelector('.stack-item') ?? tab).focus({ preventScroll: true });
  }
  let pinned = false; // (the 4-seat table shows the stack in its left column: always open there, no tab)
  tab.addEventListener('click', () => { if (!pinned) setOpen(!open); });
  root.addEventListener('keydown', (event) => { if (event.key === 'Escape' && open && !pinned && !event.defaultPrevented) { event.preventDefault(); setOpen(false); tab.focus({ preventScroll: true }); } });

  function addNote(index) {
    try { const made = addText(stack, index, ''); focusId = made.id; focusText = true; stack = made.stack; draw(); } catch (error) { say(error.message, true); } // (an empty note is only stored once it has words: see the text box's blur)
  }
  // A change to the stack: the new stack, an optional message, and the item to keep the focus on.
  const act = (run, message = '', keep = null) => { try { const next = run(stack); if (message) say(message); if (keep) { focusId = keep; focusText = false; } set(next); } catch (error) { say(error.message, true); draw(); } };
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
    lines.push({ id: 'text', label: 'Note below' });
    if (item.kind === 'card') {
      lines.push({ id: 'arrow', label: 'Aim arrow...' });
      if (arrowsOf(stack, item.id).length > 0) lines.push({ id: 'unarrow', label: 'Remove arrows' });
    }
    lines.push({ id: 'remove', label: 'Remove' });
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
    else if (choice === 'arrow') aimByClick(item.id);
    else if (choice === 'unarrow') act((s) => removeArrowsOf(s, item.id), 'Arrows removed.');
    else if (choice === 'remove') act((s) => removeItem(s, item.id), item.kind === 'card' ? `Removed ${item.card.n}.` : 'Removed note.');
  }
  function openMenu(item, li, event) {
    event.preventDefault();
    const fromKeyboard = event.clientX === 0 && event.clientY === 0;
    const box = li.getBoundingClientRect();
    openCardMenu({
      title: item.kind === 'card' ? item.card.n : 'Note',
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
    li.setAttribute('aria-label', `${item.card.n}${item.id === topId ? ', top' : ''}. Alt+arrows move, Delete removes.`);
    if (item.id === topId) li.dataset.top = 'true';
    li.append(sharpenPicture(nodes.nodeFor(item.card, true))); // (the normal size of the picture: the small one was blurry at this size)
    li.addEventListener('contextmenu', (event) => openMenu(item, li, event));
    li.addEventListener('keydown', (event) => onItemKey(item, event));
    return li;
  }

  function textItem(item) {
    const li = make('li', 'stack-item stack-text');
    li.dataset.id = item.id;
    li.dataset.kind = 'text';
    li.tabIndex = 0;
    li.setAttribute('aria-label', 'Note. Alt+arrows move, Delete removes.');
    const grip = make('span', 'stack-grip');
    grip.setAttribute('aria-hidden', 'true');
    grip.title = 'Drag';
    const field = make('textarea', 'stack-note');
    field.value = item.text;
    field.rows = 2;
    field.maxLength = MAX_TEXT;
    field.placeholder = 'Note';
    field.setAttribute('aria-label', 'Note');
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
    if (items.length === 0) items.push(make('li', 'stack-empty', 'Right-click a card to add it.'));
    list.replaceChildren(...items);
    const count = cardCount(stack);
    tabCount.textContent = String(count);
    tabCount.hidden = count === 0;
    tab.setAttribute('aria-label', `Stack, ${summary(stack)}`);
    resolveButton.disabled = count === 0;
    undoButton.disabled = !canUndo(stack);
    clearButton.disabled = stack.items.length === 0;
    live.textContent = summary(stack);
    syncArrows();
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
    if (event.shiftKey) { // Shift and a drag from a card: an arrow from it to the card the pointer is let go on (a text box has no arrows)
      if (li.dataset.kind !== 'card') return;
      event.preventDefault();
      const aim = startArrow(li.dataset.id, event.clientX, event.clientY);
      if (!aim) return;
      const stop = () => { document.removeEventListener('pointerup', up, true); document.removeEventListener('pointercancel', up, true); document.removeEventListener('pointermove', lost, true); };
      const up = (done) => { stop(); if (done.type === 'pointerup') aim.finish(done); else aim.cancel(); };
      const lost = (move) => { if ((move.buttons & 1) === 0) { stop(); aim.cancel(); } }; // (the left button is not down any more: its release was lost)
      document.addEventListener('pointerup', up, true);
      document.addEventListener('pointercancel', up, true);
      document.addEventListener('pointermove', lost, true);
      return;
    }
    const items = [...list.children].filter((node) => node.dataset.id);
    const slots = items.map((node) => node.getBoundingClientRect());
    const from = items.indexOf(li);
    const gap = items.length > 1 ? Math.max(0, (slots[from === 0 ? 1 : from].top) - (slots[from === 0 ? 0 : from - 1].bottom)) : 0;
    drag = { li, id: li.dataset.id, items, slots, from, to: from, startY: event.clientY, active: false, pointerId: event.pointerId, height: slots[from].height + gap };
  });
  list.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if ((event.buttons & 1) === 0) { const finished = endDrag(); if (finished?.active) draw(); return; } // the left button is not down any more (its release was lost): the card goes home, it does not keep following the pointer
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
  const cancelDrag = () => { const finished = endDrag(); if (finished?.active) draw(); };
  list.addEventListener('pointercancel', cancelDrag);
  list.addEventListener('lostpointercapture', () => { if (drag?.active) cancelDrag(); });
  document.addEventListener('contextmenu', () => { if (drag?.active) cancelDrag(); }, true); // (a right click while a card is carried puts it back)
  window.addEventListener('blur', cancelDrag);
  document.addEventListener('keydown', (event) => { if (drag?.active && event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); const finished = endDrag(); if (finished) draw(); } }, true);

  setOpen(false);
  setFolded(folded);
  const floating = docking ? mountFloatingBar({ bar: root, grip, store, key: placeKey, defaultPlace: { dock: 'left', fx: 0, fy: 0.2 }, growDown: true, flush: true, clickThrough: true, room, docking }) : null;
  draw();
  return {
    relayout: () => floating?.relayout(),
    fold: (on) => setFolded(on),
    isFolded: () => folded,
    // pin(true): always open, inside a column of the page (root gets data-pinned; the style sheet places it); pin(false): back to the tab that slides it out, closed.
    pin(on) {
      if (pinned === Boolean(on)) return;
      pinned = Boolean(on);
      root.dataset.pinned = String(pinned);
      setOpen(pinned);
    },
    // Puts a copy of the card on top of the stack and slides the window out so the player sees it.
    add(card) {
      try { const next = addCard(stack, card); say(`Stacked ${card.n}.`); setOpen(true); set(next); return true; } catch (error) { say(error.message, true); return false; }
    },
    // A stack that came from the database (another player changed it, or it is what this page stored coming back): shown as it is, keeping this page's own Undo. A note being typed is not interrupted.
    replace(next) {
      if (!next) return;
      const typing = document.activeElement?.closest?.('#stack-window textarea');
      stack = { ...next, past: stack.past };
      if (!typing) draw(); else { tabCount.textContent = String(cardCount(stack)); syncArrows(); }
    },
    open: () => setOpen(true),
    close: () => setOpen(false),
    isOpen: () => open,
    summary: () => summary(stack),
    cardCount: () => cardCount(stack),
  };
}
