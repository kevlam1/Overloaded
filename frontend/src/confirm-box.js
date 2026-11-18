// A small window that asks "are you sure?" before something that cannot be undone (Kevin, 2026-11-18: deleting a deck). It is centred over a dimmed page; Cancel has the focus, so Enter does nothing
// by accident, and Escape, Cancel or a click on the dark space around it answer no. The text is short on purpose.
// askConfirm({ title, message, confirmLabel, returnFocus }) returns a promise of true (the button was pressed) or false.
const make = (tag, className, text) => { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; };
let current = null;

export function askConfirm({ title, message = '', confirmLabel = 'Delete', returnFocus = null } = {}) {
  current?.close(false);
  return new Promise((resolve) => {
    const overlay = make('div', 'confirm-overlay');
    const box = make('div', 'confirm-box');
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', String(title ?? 'Are you sure?'));
    const heading = make('h2', 'confirm-title', String(title ?? 'Are you sure?'));
    const note = make('p', 'confirm-message', message);
    const buttons = make('div', 'confirm-buttons');
    const cancel = make('button', 'confirm-no secondary', 'Cancel'); cancel.type = 'button';
    const yes = make('button', 'confirm-yes', confirmLabel); yes.type = 'button';
    buttons.append(cancel, yes);
    box.append(heading, ...(message ? [note] : []), buttons);
    overlay.append(box);
    document.body.append(overlay);
    cancel.focus();

    let done = false;
    function close(value) {
      if (done) return;
      done = true;
      current = null;
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
      resolve(value);
    }
    const onKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(false); }
      else if (event.key === 'Tab') { // (the two buttons are the only places to go)
        event.preventDefault();
        (document.activeElement === cancel ? yes : cancel).focus();
      }
    };
    cancel.addEventListener('click', () => close(false));
    yes.addEventListener('click', () => close(true));
    overlay.addEventListener('pointerdown', (event) => { if (event.target === overlay) close(false); });
    document.addEventListener('keydown', onKey, true);
    current = { close };
  });
}
