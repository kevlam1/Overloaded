// The right-click menu of a card: the card's name as a heading and a short list of choices (what is offered is decided in
// shared/card-menu.mjs). One menu at a time. It opens at the pointer and stays inside the window; it closes on a choice, Escape,
// Tab, a click elsewhere, a scroll, a resize or when the window loses focus. By keyboard: Up and Down move, Home and End jump, Right
// opens "Move to" (or moves along a row of amounts), Left goes back, Enter and Space choose. "Move to" opens inline under its
// heading instead of flying out, so it works the same with a mouse, a keyboard and a finger. Card names go in as text.
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
        button.addEventListener('click', () => pick(child.id, 1));
        sub.append(button);
      }
      head.addEventListener('click', () => {
        const opening = sub.hidden;
        expand(head, sub, opening);
        if (opening) sub.querySelector('[role="menuitem"]')?.focus({ preventScroll: true });
      });
      menu.append(head, sub);
    } else if (Array.isArray(item.amounts)) {
      const row = make('div', 'card-menu-row');
      const main = itemButton(item.label, 'card-menu-item');
      main.addEventListener('click', () => pick(item.id, 1));
      row.append(main);
      for (const amount of item.amounts) {
        const button = itemButton(String(amount), 'card-menu-amount');
        button.setAttribute('aria-label', `${item.label}, ${amount}`);
        button.addEventListener('click', () => pick(item.id, amount));
        row.append(button);
      }
      menu.append(row);
    } else {
      const button = itemButton(item.label, 'card-menu-item');
      button.addEventListener('click', () => pick(item.id, 1));
      menu.append(button);
    }
  }

  const visibleItems = () => [...menu.querySelectorAll('[role="menuitem"]')].filter((button) => !button.closest('[hidden]'));
  menu.addEventListener('keydown', (event) => {
    const list = visibleItems();
    const target = document.activeElement;
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
        target.nextElementSibling?.focus({ preventScroll: true });
      }
      event.preventDefault();
    } else if (event.key === 'ArrowLeft') {
      const sub = target?.closest('.card-menu-sub');
      if (sub) {
        const head = sub.previousElementSibling;
        expand(head, sub, false);
        head.focus({ preventScroll: true });
      } else if (target?.closest('.card-menu-row')) {
        target.previousElementSibling?.focus({ preventScroll: true });
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
  window.addEventListener('scroll', onAway, true);
  window.addEventListener('resize', onAway);
  window.addEventListener('blur', onAway);

  function close({ restore }) {
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
