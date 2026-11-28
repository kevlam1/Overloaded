// The window for a table you cannot be at any more (Kevin, 2026-11-26): it closed (the 8-hour limit, or idle), or a link leads to a table that is gone, full or started.
// It offers three ways out: Home, a new table, or another table's code. It forgets the dead table in this browser first, so the Lobby link, Leave and End the match
// can never lead back into it (that was a loop). It cannot be closed without choosing: there is nothing left to do on the page behind it.
// showClosedTable({ reason }): reason 'age' | 'idle' | 'gone' | 'unavailable' | 'missing' | 'removed' (the host took you off it, 2026-11-26 feedback).
import { makeSafeStore } from './safe-store.js';
import { normalizeCode, isValidCode } from '../../shared/table-code.mjs';

const store = makeSafeStore();
const make = (tag, className, text) => { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; };
const WHY = {
  age: 'It reached its 8-hour limit.',
  idle: 'Nobody played for a while.',
  gone: '',
  unavailable: 'It is full, has started, or does not exist.',
  missing: 'You are not at this table, or it has closed.',
  removed: 'The host took you off this table.',
};
let shown = false;

export function showClosedTable({ reason = 'gone' } = {}) {
  store.remove('overloaded.lastTable');
  store.remove('overloaded.tableDeck');
  if (shown) return;
  shown = true;
  const overlay = make('div', 'confirm-overlay closed-table');
  const box = make('div', 'confirm-box');
  box.setAttribute('role', 'alertdialog');
  box.setAttribute('aria-modal', 'true');
  const title = reason === 'removed' ? 'You were removed' : reason === 'unavailable' ? 'Can’t join this table' : reason === 'missing' ? 'Can’t open this table' : 'This table has closed';
  box.setAttribute('aria-label', title);
  box.append(make('h2', 'confirm-title', title));
  if (WHY[reason]) box.append(make('p', 'confirm-message', WHY[reason]));

  const buttons = make('div', 'confirm-buttons');
  const home = make('a', 'button-link quiet', 'Home'); home.href = '/';
  const fresh = make('a', 'button-link', 'New table'); fresh.href = '/?new'; // (the start page makes it: at once with a saved name, else it asks for one)
  buttons.append(home, fresh);

  const form = make('form', 'closed-join');
  const label = make('label', '', 'Join another');
  const input = make('input');
  input.type = 'text'; input.autocomplete = 'off'; input.spellcheck = false; input.maxLength = 12; input.placeholder = 'Table code';
  input.setAttribute('aria-label', 'Table code');
  const join = make('button', 'secondary', 'Join'); join.type = 'submit';
  const error = make('p', 'closed-error'); error.setAttribute('role', 'alert');
  form.append(label, input, join);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const code = normalizeCode(input.value);
    if (!isValidCode(code)) { error.textContent = 'That is not a table code.'; input.focus(); return; }
    location.assign(`/lobby/${code}`);
  });

  box.append(buttons, form, error);
  overlay.append(box);
  document.body.append(overlay);
  fresh.focus();
  // No key reaches the page behind it (its game keys, its Settings key): this listens on the window, before the page's own listeners on the document. Typing in
  // the code box still works (stopping a key's journey does not stop its letter). Tab stays inside the window; Escape does nothing (there is no page to go back to).
  window.addEventListener('keydown', (event) => {
    if (!overlay.isConnected) return;
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); return; }
    if (event.key !== 'Tab') return;
    const stops = [home, fresh, input, join];
    const at = stops.indexOf(document.activeElement);
    event.preventDefault();
    stops[(at + (event.shiftKey ? stops.length - 1 : 1) + stops.length) % stops.length].focus();
  }, true);
}
