// The right-click menu of a card: the card's name as a heading and a short list of choices (what is offered is decided in
// shared/card-menu.mjs). One menu at a time. It opens at the pointer and stays inside the window; it closes on a choice, Escape,
// Tab, a click elsewhere, a scroll, a resize or when the window loses focus. By keyboard: Up and Down move, Home and End jump, Right
// opens "Move to", Left goes back, Enter and Space choose. "Move to" opens inline under its
// heading instead of flying out, so it works the same with a mouse, a keyboard and a finger. Card names go in as text.
import { askNumber } from './number-box.js';
import { parseCount, startingCount } from '../../shared/number-input.mjs';
import { makeSafeStore } from './safe-store.js';

// The number in a line that has its own box (Scry [1], Mill [1]) is remembered per line (Kevin, 2026-11-15), in this browser.
const NUMBERS_KEY = 'overloaded.menuNumbers';
const numberStore = makeSafeStore();
const rememberedNumbers = () => { try { const data = JSON.parse(numberStore.get(NUMBERS_KEY) ?? '{}'); return data && typeof data === 'object' && !Array.isArray(data) ? data : {}; } catch { return {}; } };
const rememberNumber = (key, value) => numberStore.set(NUMBERS_KEY, JSON.stringify({ ...rememberedNumbers(), [key]: value }));

const ARROW = String.fromCharCode(0x25b8);
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
// the number typed (nothing is called when the box is cancelled).
export function openCardMenu({ title, items, x, y, onPick, returnFocus = null }) {
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
    menu.style.left = `${Math.max(8, Math.min(x, room.clientWidth - box.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, room.clientHeight - box.height - 8))}px`;
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
  const expand = (head, sub, open) => {
    sub.hidden = !open;
    head.setAttribute('aria-expanded', String(open));
    place(); // the menu got taller or shorter: keep it inside the window
  };

  for (const item of items) {
    if (Array.isArray(item.items)) {
      const head = itemButton(item.label, 'card-menu-item has-sub');
      head.setAttribute('aria-haspopup', 'menu');
      head.setAttribute('aria-expanded', 'false');
      const arrow = make('span', 'card-menu-arrow', ARROW);
      arrow.setAttribute('aria-hidden', 'true');
      head.append(arrow);
      const sub = make('div', 'card-menu-sub');
      sub.hidden = true;
      sub.setAttribute('role', 'menu');
      sub.setAttribute('aria-label', item.label);
      for (const child of item.items) {
        const button = itemButton(child.label, 'card-menu-item card-menu-subitem');
        bindChoice(button, child);
        sub.append(button);
      }
      head.addEventListener('click', () => {
        const opening = sub.hidden;
        expand(head, sub, opening);
        if (opening) sub.querySelector('[role="menuitem"]')?.focus({ preventScroll: true });
      });
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
      row.append(main, field);
      menu.append(row);
    } else {
      const button = itemButton(item.label, 'card-menu-item');
      bindChoice(button, item);
      menu.append(button);
    }
  }

  const visibleItems = () => [...menu.querySelectorAll('[role="menuitem"]')].filter((button) => !button.closest('[hidden]'));
  menu.addEventListener('keydown', (event) => {
    const list = visibleItems();
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
        const sub = target.nextElementSibling;
        if (sub.hidden) expand(target, sub, true);
        sub.querySelector('[role="menuitem"]')?.focus({ preventScroll: true });
      } else if (target?.closest('.card-menu-row')) {
        const box = target.parentElement.querySelector('.card-menu-number');
        if (box) { box.focus({ preventScroll: true }); box.select(); }
      }
      event.preventDefault();
    } else if (event.key === 'ArrowLeft') {
      const sub = target?.closest('.card-menu-sub');
      if (sub) {
        const head = sub.previousElementSibling;
        expand(head, sub, false);
        head.focus({ preventScroll: true });
      }
      event.preventDefault();
    } else if (event.key === 'Escape') {
      close({ restore: true });
      event.preventDefault();
      event.stopPropagation(); // the page's own Escape (deselect) must not also run
    } else if (event.key === 'Tab') {
      close({ restore: true });
    }
  });

  const onOutside = (event) => { if (!menu.contains(event.target)) close({ restore: false }); };
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
    if (restore && returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
  }

  document.body.append(menu);
  place();
  visibleItems()[0]?.focus({ preventScroll: true });
  current = { menu, close };
  return () => close({ restore: false });
}
