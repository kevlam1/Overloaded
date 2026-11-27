// The right-click menu of a card: the card's name as a heading and a short list of choices (what is offered is decided in
// shared/card-menu.mjs). One menu at a time. It opens at the pointer and stays inside the window; it closes on a choice, Escape,
// Tab, a click elsewhere, a scroll, a resize or when the window loses focus. By keyboard: Up and Down move, Home and End jump, Right
// opens a heading's menu, Left goes back, Enter and Space choose. A heading ("View", "Move to") opens its lines in a box of their own beside it
// (Kevin, 2026-11-15, not inside the same box any more): on hover or click with a mouse, Right with a keyboard. Card names go in as text.
import { askNumber } from './number-box.js';
import { manaIcon } from './mana-icon.js';
import { parseCount, startingCount } from '../../shared/number-input.mjs';
import { makeSafeStore } from './safe-store.js';

// The number in a line that has its own box (Scry [1], Mill [1]) is remembered per line (Kevin, 2026-11-15), in this browser.
const NUMBERS_KEY = 'overloaded.menuNumbers';
const numberStore = makeSafeStore();
const rememberedNumbers = () => { try { const data = JSON.parse(numberStore.get(NUMBERS_KEY) ?? '{}'); return data && typeof data === 'object' && !Array.isArray(data) ? data : {}; } catch { return {}; } };
const rememberNumber = (key, value) => numberStore.set(NUMBERS_KEY, JSON.stringify({ ...rememberedNumbers(), [key]: value }));

const SVG_NS = 'http://www.w3.org/2000/svg';
// the arrow on a heading: a chevron pointing at the box that opens beside it, turned round when that box opens on the left (width, height and fill set on the element)
function chevron() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '10'); svg.setAttribute('height', '10'); svg.setAttribute('viewBox', '0 0 10 10'); svg.setAttribute('fill', 'none'); svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'card-menu-arrow');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M3 1.8L6.6 5L3 8.2'); path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-width', '1.8'); path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round'); path.setAttribute('fill', 'none');
  svg.append(path);
  return svg;
}
let current = null; // the menu on screen: { close }

function make(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

export function closeCardMenu() {
  if (current) current.close({ restore: false });
}

// title: the card's name. items: from menuItems(). x, y: where the pointer is (window coordinates). onPick(id, amount) is called
// after the menu has closed. returnFocus: the element to give focus back to when the menu closes (the card).
// An item with `number: { key, min, max }` is a line with its own small number box inside it ("Scry [1]"): click the word and it is done with the number in the box, which starts at 1 or at the last number
// used on that line (key) and can be changed there (Right arrow goes from the word into the box, Enter in the box does it).
// An item with `ask: { min, max, unit }` is a line like "Draw X...": choosing it closes the menu and opens the small number box (src/number-box.js) where the menu was, and onPick(id, number) is called with
// the number typed (nothing is called when the box is cancelled). onClose: called when the menu has closed, however it closed (a caret that turns while its menu is open uses it).
// avoid: the box ({ top }) of that button: when the menu does not fit below y it opens above the button instead of being pushed up over it.
// toggleOn: a button that opens this menu (a caret); a press on it does not count as "a click elsewhere", so the button itself can close the menu with closeCardMenu() instead of the menu closing first and the click opening it again.
export function openCardMenu({ title, items, x, y, onPick, returnFocus = null, onClose = null, toggleOn = null, avoid = null }) {
  closeCardMenu();
  const menu = make('div', 'card-menu');
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', String(title));
  menu.tabIndex = -1;
  menu.append(make('div', 'card-menu-title', String(title)));

  // The room is the window without its scrollbar (clientWidth), not innerWidth, and the menu has its natural width wherever it
  // sits (width: max-content in the style), so placing it near an edge cannot make a line wrap and the menu grow past the edge.
  const place = () => {
    const room = document.documentElement;
    const box = menu.getBoundingClientRect();
    let top = y;
    let left = x;
    if (avoid && y + box.height > room.clientHeight - 8) top = avoid.top - 4 - box.height; // no room below the button that opened it: above it, so the menu never covers the button (it is pressed again to close the menu)
    // No room below or to the right of the pointer: the menu opens above it or to its left, as a menu of the system does, never pushed back under the pointer
    // (the redesign, 2026-11-24: with your life at the bottom of the rail, a right-click on it put the pointer on a line of the menu, which opened that line's own menu by itself).
    else if (y + box.height > room.clientHeight - 8) top = y - box.height;
    if (x + box.width > room.clientWidth - 8) left = x - box.width;
    menu.style.left = `${Math.max(8, Math.min(left, room.clientWidth - box.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(top, room.clientHeight - box.height - 8))}px`;
  };
  const itemButton = (label, className) => {
    const button = make('button', className, label);
    button.type = 'button';
    button.tabIndex = -1;
    button.setAttribute('role', 'menuitem');
    return button;
  };
  const pick = (id, amount) => {
    close({ restore: false });
    onPick(id, amount);
    if (id !== 'modify' && returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
  };
  // What a click on a plain line does: a line that asks for a number closes the menu and opens the number box where the line was; any other line is done at once.
  const bindChoice = (button, item) => {
    if (!item.ask) { button.addEventListener('click', () => pick(item.id, 1)); return; }
    button.addEventListener('click', () => {
      const at = button.getBoundingClientRect();
      close({ restore: false });
      askNumber({ title: item.ask.title ?? item.label.replace(/\.\.\.$/, ''), x: at.left, y: at.top, min: item.ask.min ?? 1, max: item.ask.max ?? 999, unit: item.ask.unit ?? '', returnFocus }).then((number) => { if (number !== null) onPick(item.id, number); });
    });
  };
  const flyouts = []; // the boxes beside the headings: { head, sub }
  const placeFly = (head, sub) => { // beside the heading (on the right, or on the left when there is no room), kept inside the window
    const room = document.documentElement;
    const at = head.getBoundingClientRect();
    const box = sub.getBoundingClientRect();
    const right = at.right - 2;
    const onLeft = right + box.width > room.clientWidth - 8 && at.left - box.width + 2 >= 8;
    sub.style.left = `${Math.max(8, onLeft ? at.left - box.width + 2 : Math.min(right, room.clientWidth - box.width - 8))}px`;
    sub.style.top = `${Math.max(8, Math.min(at.top - 4, room.clientHeight - box.height - 8))}px`;
    sub.dataset.side = onLeft ? 'left' : 'right';
    head.dataset.side = sub.dataset.side;
  };
  const expand = (head, sub, open) => {
    if (open) for (const other of flyouts) if (other.sub !== sub && !other.sub.hidden) { other.sub.hidden = true; other.head.setAttribute('aria-expanded', 'false'); }
    sub.hidden = !open;
    head.setAttribute('aria-expanded', String(open));
    if (open) placeFly(head, sub);
  };
  const closeFlyouts = () => { for (const other of flyouts) if (!other.sub.hidden) expand(other.head, other.sub, false); };

  for (const item of items) {
    if (Array.isArray(item.items)) {
      const head = itemButton(item.label, 'card-menu-item has-sub');
      head.setAttribute('aria-haspopup', 'menu');
      head.setAttribute('aria-expanded', 'false');
      head.append(chevron());
      const sub = make('div', 'card-menu-fly card-menu-sub'); // (inside the menu's element, but drawn at the window with position: fixed, so it is a box of its own beside the heading)
      sub.hidden = true;
      sub.setAttribute('role', 'menu');
      sub.setAttribute('aria-label', item.label);
      sub.tabIndex = -1;
      // A long list (the counters) has a box at the top to type in: the lines that do not contain the letters typed are hidden (Kevin, 2026-11-15).
      let filter = null;
      if (item.searchable) {
        filter = make('input', 'card-menu-filter');
        filter.type = 'search';
        filter.placeholder = 'Type to find one...';
        filter.autocomplete = 'off';
        filter.spellcheck = false;
        filter.setAttribute('aria-label', `Find in ${item.label}`);
        sub.append(filter);
      }
      for (const child of item.items) {
        const button = itemButton(child.label, 'card-menu-item card-menu-subitem');
        bindChoice(button, child);
        if (child.icon) { const icon = manaIcon(child.icon); if (icon) { button.prepend(icon); sub.dataset.icons = '1'; } } // (a line may name a Mana icon to show before its words)
        sub.append(button);
      }
      if (filter) {
        const lines = () => [...sub.querySelectorAll(':scope > [role="menuitem"]')];
        filter.addEventListener('input', () => { const wanted = filter.value.trim().toLowerCase(); for (const line of lines()) line.hidden = wanted !== '' && !line.textContent.toLowerCase().includes(wanted); });
        filter.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); lines().find((line) => !line.hidden)?.click(); }
          else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') event.stopPropagation(); // (the box keeps its own cursor keys)
        });
      }
      flyouts.push({ head, sub, filter });
      head.addEventListener('click', () => { // (a click opens it and keeps it open: it may be open already because the pointer came over the heading)
        expand(head, sub, true);
        (filter ?? sub.querySelector('[role="menuitem"]'))?.focus({ preventScroll: true });
      });
      head.addEventListener('pointerenter', (event) => { if (event.pointerType !== 'touch') expand(head, sub, true); });
      sub.addEventListener('keydown', onKeydown);
      menu.append(head, sub);
    } else if (item.number) {
      const min = item.number.min ?? 1;
      const max = item.number.max ?? 999;
      const row = make('div', 'card-menu-row');
      const main = itemButton(item.label, 'card-menu-item');
      const field = make('input', 'card-menu-number');
      field.type = 'text';
      field.inputMode = 'numeric';
      field.autocomplete = 'off';
      field.spellcheck = false;
      field.value = String(startingCount(rememberedNumbers()[item.number.key], { min, max }));
      field.setAttribute('aria-label', `${item.label}: how many (${min} to ${max})`);
      const run = () => {
        const result = parseCount(field.value, { min, max });
        if (!result.ok) { field.setAttribute('aria-invalid', 'true'); field.title = result.message; field.focus(); field.select(); return; }
        rememberNumber(item.number.key, result.value);
        pick(item.id, result.value);
      };
      main.addEventListener('click', run);
      field.addEventListener('input', () => { field.removeAttribute('aria-invalid'); field.title = ''; });
      field.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); run(); }
        else if (event.key === 'ArrowLeft' && field.selectionStart === 0) { event.preventDefault(); event.stopPropagation(); main.focus({ preventScroll: true }); }
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') event.stopPropagation(); // (the box keeps its own cursor keys)
      });
      // - and + beside the box (Kevin's friends, 2026-11-26: buttons as well as typing)
      const stepper = (text, label, delta) => {
        const button = make('button', 'card-menu-step', text); button.type = 'button'; button.tabIndex = -1; button.setAttribute('aria-label', label);
        button.addEventListener('click', (event) => { event.stopPropagation(); const now = parseCount(field.value, { min, max }); field.value = String(Math.min(max, Math.max(min, (now.ok ? now.value : min) + delta))); field.removeAttribute('aria-invalid'); });
        return button;
      };
      row.append(main, stepper('−', 'One less', -1), field, stepper('+', 'One more', 1));
      row.addEventListener('pointerenter', closeFlyouts);
      menu.append(row);
    } else {
      const button = itemButton(item.label, 'card-menu-item');
      bindChoice(button, item);
      button.addEventListener('pointerenter', closeFlyouts);
      menu.append(button);
    }
  }

  function onKeydown(event) {
    const container = event.currentTarget;
    const list = [...container.querySelectorAll(':scope > [role="menuitem"], :scope > .card-menu-row [role="menuitem"]')].filter((line) => !line.hidden);
    const active = document.activeElement;
    const target = active?.classList?.contains('card-menu-number') ? active.parentElement.querySelector('[role="menuitem"]') : active; // (a number box counts as its line)
    const at = list.indexOf(target);
    const go = (index) => { list[(index + list.length) % list.length].focus({ preventScroll: true }); event.preventDefault(); };
    if (event.key === 'ArrowDown') go(at + 1);
    else if (event.key === 'ArrowUp') go(at < 0 ? -1 : at - 1);
    else if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(list.length - 1);
    else if (event.key === 'ArrowRight') {
      if (target?.classList.contains('has-sub')) {
        const entry = flyouts.find((fly) => fly.head === target);
        if (entry.sub.hidden) expand(target, entry.sub, true);
        (entry.filter ?? entry.sub.querySelector('[role="menuitem"]'))?.focus({ preventScroll: true });
      } else if (target?.closest('.card-menu-row')) {
        const box = target.parentElement.querySelector('.card-menu-number');
        if (box) { box.focus({ preventScroll: true }); box.select(); }
      }
      event.preventDefault();
    } else if (event.key === 'ArrowLeft') {
      const entry = flyouts.find((fly) => fly.sub === container);
      if (entry) {
        expand(entry.head, entry.sub, false);
        entry.head.focus({ preventScroll: true });
      }
      event.preventDefault();
    } else if (event.key === 'Escape') {
      close({ restore: true });
      event.preventDefault();
      event.stopPropagation(); // the page's own Escape (deselect) must not also run
    } else if (event.key === 'Tab') {
      close({ restore: true });
    }
  }
  menu.addEventListener('keydown', onKeydown);

  const onOutside = (event) => { if (!menu.contains(event.target) && !(event.type === 'pointerdown' && toggleOn?.contains(event.target))) close({ restore: false }); };
  const onAway = () => close({ restore: false });
  document.addEventListener('pointerdown', onOutside, true);
  document.addEventListener('contextmenu', onOutside, true);
  window.addEventListener('resize', onAway);
  window.addEventListener('blur', onAway);
  // A right-click selects the card, which can change the height of the selected-card panel above the cards; the browser then moves the
  // scroll position to keep the cards still, and that scroll arrives a frame or two after the menu opens. It is not the player scrolling
  // away, so scrolling is only listened for from the second frame on (found 2026-11-06 with a card whose type line has two lines).
  let closed = false;
  requestAnimationFrame(() => requestAnimationFrame(() => { if (!closed) window.addEventListener('scroll', onAway, true); }));

  function close({ restore }) {
    closed = true;
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('contextmenu', onOutside, true);
    window.removeEventListener('scroll', onAway, true);
    window.removeEventListener('resize', onAway);
    window.removeEventListener('blur', onAway);
    menu.remove();
    if (current && current.menu === menu) current = null;
    if (onClose) onClose();
    if (restore && returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
  }

  document.body.append(menu);
  place();
  menu.querySelector(':scope > [role="menuitem"], :scope > .card-menu-row [role="menuitem"]')?.focus({ preventScroll: true });
  current = { menu, close };
  return () => close({ restore: false });
}
