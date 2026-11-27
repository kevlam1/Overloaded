// The small "X" box (Kevin, 2026-11-15): a menu line such as "Draw X..." opens this next to where the menu was, you type a whole number and press Enter (or OK), and the line is done that many times. It
// replaces the rows of fixed number buttons the menus had. What is accepted is decided in shared/number-input.mjs; the last number used is kept in this browser and offered next time if it fits.
// askNumber({ title, x, y, min, max, unit, returnFocus }) returns a promise of the number, or null when it is cancelled (Escape, Cancel, or a click outside).
import { parseCount, startingCount } from '../../shared/number-input.mjs';
import { makeSafeStore } from './safe-store.js';

const LAST_KEY = 'overloaded.lastNumber';
const store = makeSafeStore();
let current = null; // { close } while a box is open: only one at a time

const make = (tag, className, text) => { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; };

export function askNumber({ title, x = 0, y = 0, min = 1, max = 999, unit = '', returnFocus = null } = {}) {
  current?.close(null);
  return new Promise((resolve) => {
    const hint = () => (max < 999 ? `${min} to ${max}${unit ? ` ${unit}` : ''}` : '');
    const box = make('form', 'number-box');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', String(title ?? 'Number'));
    box.noValidate = true;
    const heading = make('div', 'number-box-title', String(title ?? 'Number'));
    const field = make('input', 'number-box-input');
    field.type = 'text';
    field.inputMode = 'numeric';
    field.autocomplete = 'off';
    field.spellcheck = false;
    field.setAttribute('aria-label', unit ? `${title} (${unit})` : String(title));
    field.value = String(startingCount(store.get(LAST_KEY), { min, max }));
    const note = make('p', 'number-box-note', hint());
    note.setAttribute('role', 'status');
    note.id = 'number-box-note';
    field.setAttribute('aria-describedby', 'number-box-note');
    const buttons = make('div', 'number-box-buttons');
    const ok = make('button', 'number-box-ok', 'OK'); ok.type = 'submit';
    const cancel = make('button', 'number-box-cancel', 'Cancel'); cancel.type = 'button';
    buttons.append(ok, cancel);
    // Buttons as well as typing (Kevin's friends, 2026-11-26): - and + beside the box, and a row of the small numbers, each of which does it at once.
    const step = (delta) => { const now = parseCount(field.value, { min, max }); const base = now.ok ? now.value : min; field.value = String(Math.min(max, Math.max(min, base + delta))); field.dispatchEvent(new Event('input')); };
    const minus = make('button', 'number-box-step', '−'); minus.type = 'button'; minus.setAttribute('aria-label', 'One less'); minus.addEventListener('click', () => step(-1));
    const plus = make('button', 'number-box-step', '+'); plus.type = 'button'; plus.setAttribute('aria-label', 'One more'); plus.addEventListener('click', () => step(1));
    const line = make('div', 'number-box-line'); line.append(minus, field, plus);
    const quick = make('div', 'number-box-quick');
    for (let n = Math.max(1, min); n <= Math.min(7, max); n++) {
      const pickN = make('button', 'number-box-pick', String(n)); pickN.type = 'button';
      pickN.addEventListener('click', () => { store.set(LAST_KEY, String(n)); close(n); });
      quick.append(pickN);
    }
    box.append(heading, line, ...(quick.children.length ? [quick] : []), note, buttons);
    document.body.append(box);

    const place = () => {
      const room = document.documentElement;
      const size = box.getBoundingClientRect();
      box.style.left = `${Math.max(8, Math.min(x, room.clientWidth - size.width - 8))}px`;
      box.style.top = `${Math.max(8, Math.min(y, room.clientHeight - size.height - 8))}px`;
    };
    let done = false;
    const onOutside = (event) => { if (!box.contains(event.target)) close(null); };
    const onKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(null); }
    };
    function close(value) {
      if (done) return;
      done = true;
      current = null;
      document.removeEventListener('pointerdown', onOutside, true);
      document.removeEventListener('keydown', onKey, true);
      box.remove();
      if (value === null && returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
      resolve(value);
    }
    box.addEventListener('submit', (event) => {
      event.preventDefault();
      const result = parseCount(field.value, { min, max });
      if (!result.ok) { note.textContent = result.message; note.classList.add('bad'); field.setAttribute('aria-invalid', 'true'); field.focus(); return; }
      store.set(LAST_KEY, String(result.value));
      close(result.value);
    });
    field.addEventListener('input', () => { note.classList.remove('bad'); field.removeAttribute('aria-invalid'); note.textContent = hint(); });
    cancel.addEventListener('click', () => close(null));
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
    current = { close };
    place();
    field.focus({ preventScroll: true });
    field.select();
  });
}
