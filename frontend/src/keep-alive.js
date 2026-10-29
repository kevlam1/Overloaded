// Keeps a table alive while someone is using it, and warns before it closes (decided with Kevin, 2026-10-26):
//  - a tap, key or input in a VISIBLE tab sends a heartbeat (at most one a minute); an idle or hidden tab sends none;
//  - the banner is quiet in the last 5 minutes of the idle limit and in the last 30 minutes before the 8-hour limit,
//    and says so once the table has closed. All of it is judged on the SERVER's time, not this computer's clock.
// Everything the page provides (the document, the clock, the timers, the database functions, the banner element) is
// passed in, so a Node test can drive this with a fake clock and a fake database.
import { createHeartbeat } from '../../shared/heartbeat.mjs';
import { renderBanner } from './banner.js';

export const TICK_MS = 15000; // how often held-back heartbeats are sent and the banner is redrawn
export const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'input', 'touchstart'];

// document: { addEventListener, removeEventListener, visibilityState }
// api: { heartbeat(code), watchServerOffset(cb), watchMeta(code, cb), watchActivity(code, cb) } (the watchers return a stop function)
// timers: { setInterval, clearInterval }. now(): this computer's clock in ms. Returns { stop(), state() }.
// (The default timers are wrappers on purpose: a browser throws "Illegal invocation" if setInterval is called as a
// method of some other object, which `timers.setInterval(...)` would do. Node does not mind, so only a real browser notices.)
const realTimers = { setInterval: (fn, ms) => setInterval(fn, ms), clearInterval: (id) => clearInterval(id) };
export function startKeepAlive({ code, document, api, bannerElement, formatTime, now = () => Date.now(), timers = realTimers }) {
  let offset = null; // the database's clock minus this computer's; null until it has arrived
  let meta = null;
  let lastActive = null;
  let closed = false;
  let stopped = false;

  const beat = createHeartbeat({
    // A refused heartbeat (another player's just landed, or the table closed) is not an error; only a failed send is retried.
    send: async () => {
      // A table the page believes is closed gets no heartbeat, but the activity is kept pending: if newer data shows the
      // table is open after all, the next tick sends it (the page's belief is corrected by the database, never final).
      if (closed) { beat.sendFailed(); return; }
      try { await api.heartbeat(code); } catch { beat.sendFailed(); }
    },
  });

  const draw = () => {
    // Nothing is judged until the server's time is known: with a wrong computer clock, a table that is open would
    // look closed (or a warning would be missed) in the moments before the offset arrives.
    const table = offset !== null && meta && lastActive !== null ? { createdAt: meta.createdAt, lastActive, idleLimit: meta.idleLimit } : null;
    const state = renderBanner(bannerElement, { now: now() + (offset ?? 0), table, formatTime });
    closed = Boolean(state?.closed);
  };
  const onActivity = () => { beat.activity(now()); };
  const onVisibility = () => { beat.setVisible(document.visibilityState === 'visible', now()); draw(); };

  for (const name of ACTIVITY_EVENTS) document.addEventListener(name, onActivity, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  const stops = [
    api.watchServerOffset((value) => { if (!stopped) { offset = value; draw(); } }),
    api.watchMeta(code, (value) => { if (!stopped) { if (value) meta = value; draw(); } }),
    api.watchActivity(code, (value) => { if (!stopped) { if (value !== null) lastActive = value; draw(); } }),
  ];
  const timer = timers.setInterval(() => { beat.tick(now()); draw(); }, TICK_MS);
  beat.activity(now()); // making or joining a table is activity

  return {
    stop() {
      stopped = true;
      for (const name of ACTIVITY_EVENTS) document.removeEventListener(name, onActivity);
      document.removeEventListener('visibilitychange', onVisibility);
      timers.clearInterval(timer);
      for (const stopWatching of stops) stopWatching();
      bannerElement.hidden = true;
    },
    state: () => ({ offset, meta, lastActive, closed }),
  };
}
