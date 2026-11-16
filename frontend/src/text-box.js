// A small box that asks for a short piece of text (Kevin, 2026-11-15: "Custom..." in the "Add counter" menu asks for the name of the counter). The same look and the same ways out as the number box
// (frontend/src/number-box.js): Enter or OK gives the text, Escape, Cancel or a click outside gives null.
// askText({ title, x, y, hint, check, returnFocus }) returns a promise of the text, or null when it is cancelled. check(text) says whether the text will do: { ok: true, value } or { ok: false, message }.
const make = (tag, className, text) => { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; };
let current = null;

export function askText({ title, x = 0, y = 0, hint = '', check = (text) => ({ ok: true, value: text }), returnFocus = null } = {}) {
  current?.close(null);
  return new Promise((resolve) => {
    const box = make('form', 'number-box text-box');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', String(title ?? 'Text'));
    box.noValidate = true;
    const heading = make('div', 'number-box-title', String(title ?? 'Text'));
    const field = make('input', 'number-box-input');
    field.type = 'text';
    field.autocomplete = 'off';
    field.spellcheck = false;
    field.maxLength = 60;
    field.setAttribute('aria-label', String(title));
    const note = make('p', 'number-box-note', hint);
    note.setAttribute('role', 'status');
    note.id = 'text-box-note';
    field.setAttribute('aria-describedby', 'text-box-note');
    const buttons = make('div', 'number-box-buttons');
    const ok = make('button', 'number-box-ok', 'OK'); ok.type = 'submit';
    const cancel = make('button', 'number-box-cancel', 'Cancel'); cancel.type = 'button';
    buttons.append(ok, cancel);
    box.append(heading, field, note, buttons);
    document.body.append(box);

    const place = () => {
      const room = document.documentElement;
      const size = box.getBoundingClientRect();
      box.style.left = `${Math.max(8, Math.min(x, room.clientWidth - size.width - 8))}px`;
      box.style.top = `${Math.max(8, Math.min(y, room.clientHeight - size.height - 8))}px`;
    };
    let done = false;
    const onOutside = (event) => { if (!box.contains(event.target)) close(null); };
    const onKey = (event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(null); } };
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
      const result = check(field.value);
      if (!result.ok) { note.textContent = result.message; note.classList.add('bad'); field.setAttribute('aria-invalid', 'true'); field.focus(); return; }
      close(result.value);
    });
    field.addEventListener('input', () => { note.classList.remove('bad'); field.removeAttribute('aria-invalid'); note.textContent = hint; });
    cancel.addEventListener('click', () => close(null));
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
    current = { close };
    place();
    field.focus({ preventScroll: true });
    requestAnimationFrame(() => { if (!done) field.focus({ preventScroll: true }); }); // (the menu that opened this box gives the focus back to its card as it closes: take it again)
  });
}
