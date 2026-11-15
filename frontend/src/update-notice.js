// TEMPORARY (Kevin, 2026-11-15): a corner notice on the solo table when a newer build of the site is live, for the Dec 7 demo. Remove it after Monday:
// delete this file, its import and call in pages/solo/solo.js, its block at the end of style.css, and the build-id parts of vite.config.js.
// The build writes /version.json with an id (the commit on Vercel); the page has its own copy of that id. About 13 seconds after the page loads, and then once a minute,
// it asks for /version.json (never from the cache); if the id is different a newer build is live, and the notice shows. Nothing is shown when the ids match or the file can't be read.
const FIRST_CHECK_MS = 13000;
const EVERY_MS = 60000;

export function mountUpdateNotice({ buildId, fetchFn = fetch, doc = document } = {}) {
  if (!buildId || buildId === 'dev') return { stop() {} };
  let shown = false;
  let pointerDown = false;
  let timer = null;
  const down = () => { pointerDown = true; };
  const up = () => { pointerDown = false; };
  doc.addEventListener('pointerdown', down, true);
  doc.addEventListener('pointerup', up, true);
  doc.addEventListener('pointercancel', up, true);

  function show() {
    shown = true;
    const box = doc.createElement('div');
    box.className = 'update-notice';
    box.setAttribute('role', 'status');
    const message = doc.createElement('p');
    message.textContent = 'A significant update has been pushed.';
    const refresh = doc.createElement('button');
    refresh.type = 'button';
    refresh.className = 'update-refresh';
    refresh.textContent = 'Click here to refresh the page';
    refresh.addEventListener('click', () => { location.reload(); });
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

  async function check() {
    timer = null;
    if (shown) return;
    try {
      const response = await fetchFn('/version.json', { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        if (data && typeof data.id === 'string' && data.id !== buildId) {
          if (pointerDown) { timer = setTimeout(check, 3000); return; } // not in the middle of a drag
          show();
          return;
        }
      }
    } catch { /* offline or no file: stay quiet and try again */ }
    timer = setTimeout(check, EVERY_MS);
  }

  timer = setTimeout(check, FIRST_CHECK_MS);
  return { stop() { clearTimeout(timer); doc.removeEventListener('pointerdown', down, true); doc.removeEventListener('pointerup', up, true); doc.removeEventListener('pointercancel', up, true); } };
}
