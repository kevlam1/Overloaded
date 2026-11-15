// TEMPORARY (Kevin, 2026-11-15), for the Dec 7 demo. This runs only in the frozen old copy of the solo page (public/classic): 13 seconds after it loads a corner notice
// says there is a significant update, and clicking it opens the new solo page (/solo-new). A visitor who already clicked goes straight to the new page next time.
// Remove after Monday: delete public/classic, the two solo rewrites in vercel.json, and this file.
const SHOW_AFTER_MS = 13000;
const NEW_PAGE = '/solo-new';
const FLAG = 'overloaded.seenUpdate';

const read = () => { try { return localStorage.getItem(FLAG) === '1'; } catch { return false; } };
const write = () => { try { localStorage.setItem(FLAG, '1'); } catch { /* blocked storage: the notice just shows again next time */ } };

export function mountUpdateNotice({ doc = document, go = (url) => location.assign(url), replace = (url) => location.replace(url) } = {}) {
  if (read()) { replace(NEW_PAGE); return { stop() {} }; }
  let pointerDown = false;
  let timer = null;
  const down = () => { pointerDown = true; };
  const up = () => { pointerDown = false; };
  doc.addEventListener('pointerdown', down, true);
  doc.addEventListener('pointerup', up, true);
  doc.addEventListener('pointercancel', up, true);

  function show() {
    const box = doc.createElement('div');
    box.className = 'update-notice';
    box.setAttribute('role', 'status');
    const message = doc.createElement('p');
    message.textContent = 'A significant update has been pushed.';
    const refresh = doc.createElement('button');
    refresh.type = 'button';
    refresh.className = 'update-refresh';
    refresh.textContent = 'Click here to refresh the page';
    refresh.addEventListener('click', () => { write(); go(NEW_PAGE); });
    const note = doc.createElement('p');
    note.className = 'update-note';
    note.textContent = 'Your current game will be lost.';
    const close = doc.createElement('button');
    close.type = 'button';
    close.className = 'update-close';
    close.setAttribute('aria-label', 'Dismiss this notice');
    close.textContent = 'x';
    close.addEventListener('click', () => { box.remove(); });
    box.append(close, message, refresh, note);
    doc.body.append(box);
  }

  function tick() {
    timer = null;
    if (pointerDown) { timer = setTimeout(tick, 3000); return; } // not in the middle of a drag
    show();
  }

  timer = setTimeout(tick, SHOW_AFTER_MS);
  return { stop() { clearTimeout(timer); doc.removeEventListener('pointerdown', down, true); doc.removeEventListener('pointerup', up, true); doc.removeEventListener('pointercancel', up, true); } };
}
