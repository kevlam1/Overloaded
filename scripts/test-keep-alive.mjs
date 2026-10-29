// Tests for frontend/src/keep-alive.js: the heartbeat and warning wiring, driven with a fake clock, a fake document and
// a fake database (no browser, no network). These are the situations the page meets: a slow start, a wrong computer
// clock, a hidden tab, a failed or refused heartbeat, a table that really has closed, and leaving a table.
import { startKeepAlive, TICK_MS, ACTIVITY_EVENTS } from '../frontend/src/keep-alive.js';
import { MINUTE_MS } from '../shared/table-limits.mjs';

let checks = 0;
function same(label, actual, expected) {
  checks++;
  const a = JSON.stringify(actual); const e = JSON.stringify(expected);
  if (a !== e) { console.log(`FAILED CHECK: ${label}: expected ${e}, got ${a}`); process.exit(1); }
}
const M = MINUTE_MS;
const H = 60 * M;
const fmt = (ms) => `T${Math.round(ms / M)}`;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0)); // let the async send() run

// A world: this computer's clock (which can be wrong), the real server time, and everything the module talks to.
function world({ clockSkew = 0, heartbeatResult = 'ok' } = {}) {
  const w = {
    server: 100 * H, // the database's time
    skew: clockSkew, // how far this computer's clock is ahead of the server
    visibility: 'visible',
    listeners: new Map(),
    watchers: {},
    stopped: [],
    heartbeats: [],
    heartbeatResult,
    intervals: [],
    cleared: [],
    levels: [], // the banner's level after every redraw
  };
  w.local = () => w.server + w.skew;
  w.document = {
    get visibilityState() { return w.visibility; },
    addEventListener: (name, fn) => { if (!w.listeners.has(name)) w.listeners.set(name, new Set()); w.listeners.get(name).add(fn); },
    removeEventListener: (name, fn) => { w.listeners.get(name)?.delete(fn); },
  };
  w.emit = (name) => { for (const fn of [...(w.listeners.get(name) ?? [])]) fn({ type: name }); };
  w.api = {
    heartbeat: async (code) => {
      w.heartbeats.push({ code, at: w.server });
      if (w.heartbeatResult === 'refused') return false;
      if (w.heartbeatResult === 'fail') throw new Error('offline');
      return true;
    },
    watchServerOffset: (cb) => { w.watchers.offset = cb; return () => w.stopped.push('offset'); },
    watchMeta: (code, cb) => { w.watchers.meta = cb; return () => w.stopped.push('meta'); },
    watchActivity: (code, cb) => { w.watchers.activity = cb; return () => w.stopped.push('activity'); },
  };
  w.element = { hidden: true, textContent: '', dataset: {} };
  w.timers = {
    setInterval: (fn, ms) => { const id = w.intervals.length + 1; w.intervals.push({ id, fn, ms }); return id; },
    clearInterval: (id) => { w.cleared.push(id); },
  };
  // Move both clocks forward and run the timer as often as the page would (every TICK_MS).
  w.advance = async (ms) => {
    let left = ms;
    while (left > 0) {
      const step = Math.min(TICK_MS, left);
      w.server += step; left -= step;
      for (const timer of w.intervals) if (!w.cleared.includes(timer.id)) timer.fn();
      await settle();
      w.levels.push(w.element.dataset.level ?? 'none');
    }
  };
  w.start = () => {
    w.keepAlive = startKeepAlive({ code: 'ABC234', document: w.document, api: w.api, bannerElement: w.element, formatTime: fmt, now: w.local, timers: w.timers });
    return w.keepAlive;
  };
  // The table as the database holds it.
  w.table = { createdAt: w.server - 5 * M, idleLimit: 30 * M, lastActive: w.server - 5 * M };
  w.deliver = (what = ['offset', 'meta', 'activity']) => {
    if (what.includes('offset')) w.watchers.offset(-w.skew); // server time = local + offset
    if (what.includes('meta')) w.watchers.meta({ createdAt: w.table.createdAt, idleLimit: w.table.idleLimit, status: 'lobby', match: 1 });
    if (what.includes('activity')) w.watchers.activity(w.table.lastActive);
  };
  return w;
}

same('the tick interval is 15 seconds', TICK_MS, 15000);
same('four kinds of activity count', [...ACTIVITY_EVENTS].sort(), ['input', 'keydown', 'pointerdown', 'touchstart']);

// ---- Each kind of activity on its own sends a heartbeat (after a quiet minute) ----
for (const name of ACTIVITY_EVENTS) {
  const w = world(); w.start(); await settle(); w.heartbeats.length = 0;
  await w.advance(2 * M);
  w.heartbeats.length = 0;
  w.emit(name); await settle();
  same(`a ${name} on its own sends a heartbeat`, w.heartbeats.length, 1);
}

// ---- Starting: making or joining a table is activity ----
{ const w = world(); w.start(); await settle();
  same('starting sends one heartbeat (joining is activity)', w.heartbeats.length, 1);
  same('for the right table', w.heartbeats[0].code, 'ABC234');
  same('it listens for taps, keys, input and touches', [...w.listeners.keys()].filter((k) => k !== 'visibilitychange').sort(), [...ACTIVITY_EVENTS].sort());
  same('and for the tab being hidden or shown', w.listeners.has('visibilitychange'), true);
  same('one timer runs, at the tick interval', w.intervals.map((t) => t.ms), [TICK_MS]);
  same('the banner is hidden at the start', w.element.hidden, true); }

// ---- Nothing happens: no heartbeats, and the warning comes at the right time ----
{ const w = world(); w.table.lastActive = w.server; w.start(); w.deliver(); await settle();
  w.heartbeats.length = 0;
  await w.advance(24 * M);
  same('24 minutes of nothing: no heartbeat is sent', w.heartbeats.length, 0);
  same('and no banner yet', w.element.hidden, true);
  await w.advance(1 * M + TICK_MS);
  same('just past 25 minutes idle: the quiet banner is up', w.element.dataset.level, 'quiet');
  same('still no heartbeat (nobody did anything)', w.heartbeats.length, 0);
  await w.advance(5 * M);
  same('past 30 minutes idle: the closed message', w.element.dataset.level, 'closed'); }

// ---- A tap sends a heartbeat, a second one straight after does not ----
{ const w = world(); w.table.lastActive = w.server; w.start(); w.deliver(); await settle();
  w.heartbeats.length = 0;
  await w.advance(26 * M);
  same('banner up after 26 idle minutes', w.element.dataset.level, 'quiet');
  w.emit('pointerdown'); await settle();
  same('a tap sends a heartbeat at once', w.heartbeats.length, 1);
  w.table.lastActive = w.server; w.watchers.activity(w.table.lastActive); // the database reports the new time
  same('and the banner goes away when the new time arrives', w.element.hidden, true);
  w.emit('keydown'); w.emit('input'); await settle();
  same('more activity straight after sends nothing (one a minute)', w.heartbeats.length, 1);
  await w.advance(MINUTE_MS);
  w.emit('touchstart'); await settle();
  same('a minute later activity sends again', w.heartbeats.length, 2); }

// ---- Events the page does not count ----
{ const w = world(); w.start(); await settle(); w.heartbeats.length = 0;
  await w.advance(2 * M);
  w.emit('mousemove'); w.emit('scroll'); w.emit('focus'); await settle();
  same('moving the mouse or scrolling is not activity', w.heartbeats.length, 0); }

// ---- A hidden tab sends nothing; coming back counts ----
{ const w = world(); w.start(); await settle(); w.heartbeats.length = 0;
  w.visibility = 'hidden'; w.emit('visibilitychange');
  await w.advance(5 * M);
  w.emit('pointerdown'); await settle();
  same('activity in a hidden tab sends nothing', w.heartbeats.length, 0);
  await w.advance(2 * M);
  w.visibility = 'visible'; w.emit('visibilitychange'); await settle();
  same('showing the tab again sends one heartbeat', w.heartbeats.length, 1); }

// ---- Failures: a failed send is retried, a refused one is not ----
{ const w = world({ heartbeatResult: 'fail' }); w.start(); await settle();
  same('the first send was attempted (and failed)', w.heartbeats.length, 1);
  await w.advance(TICK_MS); await settle();
  same('the next tick tries again after a failure', w.heartbeats.length, 2);
  w.heartbeatResult = 'ok';
  await w.advance(TICK_MS); await settle();
  same('and once the connection is back it goes through', w.heartbeats.length, 3);
  await w.advance(5 * TICK_MS); await settle();
  same('and then it stops retrying', w.heartbeats.length, 3); }
{ const w = world({ heartbeatResult: 'refused' }); w.start(); await settle();
  await w.advance(10 * TICK_MS); await settle();
  same('a refused heartbeat (someone else just sent one) is not retried', w.heartbeats.length, 1); }

// ---- The server's clock, not this computer's ----
{ const w = world({ clockSkew: 40 * M }); // this computer is 40 minutes ahead
  w.table.lastActive = w.server - 1 * M; // the table was active a minute ago, by the server's time
  w.start();
  // The data arrives BEFORE the clock offset does (the order is not guaranteed)
  w.deliver(['meta', 'activity']); await settle();
  same('a wrong computer clock does not close the table before the server time is known', w.element.dataset.level, undefined);
  w.emit('pointerdown'); await settle();
  w.heartbeats.length = 0;
  w.deliver(['offset']); await settle();
  same('once the server time arrives the banner stays hidden', w.element.hidden, true);
  same('and the state says the table is open', w.keepAlive.state().closed, false);
  await w.advance(2 * M);
  w.emit('keydown'); await settle();
  same('heartbeats keep going for a table that is open (a held-back one on a tick, a new one after a minute)', w.heartbeats.length >= 1, true); }
{ const w = world({ clockSkew: -40 * M }); // this computer is 40 minutes BEHIND
  w.table.lastActive = w.server - 26 * M;
  w.start(); w.deliver(['meta', 'activity']); await settle();
  same('a slow computer clock does not hide a warning it cannot yet judge', w.element.hidden, true);
  w.deliver(['offset']); await settle();
  same('once the server time arrives the warning appears', w.element.dataset.level, 'quiet'); }
{ const w = world({ clockSkew: 40 * M });
  w.table.lastActive = w.server - 1 * M;
  w.start(); w.deliver(['offset', 'meta', 'activity']); await settle();
  same('with the server time known first, a wrong computer clock changes nothing', w.element.hidden, true); }

// ---- A table that really has closed ----
{ const w = world(); w.table.lastActive = w.server - 45 * M; w.start(); w.heartbeats.length = 0; w.deliver(); await settle();
  same('a table idle past its limit shows the closed message', w.element.dataset.level, 'closed');
  await w.advance(2 * M); w.heartbeats.length = 0; // past the one-a-minute throttle, so only "closed" can stop the next one
  w.emit('pointerdown'); await settle();
  same('and no heartbeat is sent for it', w.heartbeats.length, 0); }
// Activity during a closed spell is not forgotten: if newer data shows the table is open, the next tick reports it
{ const w = world(); w.table.lastActive = w.server - 45 * M; w.start(); w.deliver(); await settle();
  await w.advance(2 * M); w.heartbeats.length = 0;
  w.emit('pointerdown'); await settle();
  same('a tap on a table believed closed sends nothing yet', w.heartbeats.length, 0);
  w.watchers.activity(w.server); // someone else kept it alive: the table is open
  await w.advance(TICK_MS);
  same('but the tap is remembered and goes out on the next tick', w.heartbeats.length, 1); }
{ const w = world(); w.table.createdAt = w.server - 9 * H; w.table.lastActive = w.server - 1 * M; w.table.idleLimit = 60 * M; w.start(); w.deliver(); await settle();
  same('past 8 hours the closed message says so', w.element.textContent.startsWith('This table reached its 8-hour limit'), true); }

// ---- Not a one-way door: later data from the database corrects an early judgement ----
{ const w = world(); w.table.lastActive = w.server - 45 * M; w.start(); w.deliver(); await settle();
  same('judged closed on old data', w.keepAlive.state().closed, true);
  w.watchers.activity(w.server); // newer data: the table was kept alive by someone else
  same('a newer heartbeat from the database reopens it in the page', w.keepAlive.state().closed, false);
  same('and the closed message goes away', w.element.hidden, true);
  w.heartbeats.length = 0;
  await w.advance(2 * M);
  w.emit('pointerdown'); await settle();
  same('and heartbeats resume', w.heartbeats.length, 1); }

// ---- Incomplete data never breaks the page ----
{ const w = world(); w.start(); await settle();
  w.watchers.meta(null); w.watchers.activity(null);
  same('an unreadable table (null from the database) shows nothing', w.element.hidden, true);
  w.deliver(['offset', 'meta', 'activity']);
  w.watchers.meta(null);
  w.watchers.activity(null);
  same('and a later null does not erase what is already known', w.keepAlive.state().meta?.idleLimit, 30 * M);
  same('nor the last heartbeat', w.keepAlive.state().lastActive, w.table.lastActive); }

// ---- Leaving with a warning on screen takes it down ----
{ const w = world(); w.table.lastActive = w.server - 26 * M; w.start(); w.deliver(); await settle();
  same('a warning is showing', [w.element.hidden, w.element.dataset.level], [false, 'quiet']);
  w.keepAlive.stop();
  same('leaving the table hides the warning', w.element.hidden, true); }

// ---- Leaving: everything is cleaned up ----
{ const w = world(); w.start(); w.deliver(); await settle();
  w.heartbeats.length = 0;
  w.keepAlive.stop();
  same('the three watchers are stopped', w.stopped.sort(), ['activity', 'meta', 'offset']);
  same('the timer is cleared', w.cleared.length, 1);
  same('no activity listeners are left', [...w.listeners.values()].every((set) => set.size === 0), true);
  same('the banner is hidden', w.element.hidden, true);
  w.emit('pointerdown'); w.emit('visibilitychange'); await settle();
  same('activity after leaving sends nothing', w.heartbeats.length, 0);
  w.watchers.activity(0); w.watchers.meta({ createdAt: 0, idleLimit: 1 }); w.watchers.offset(0);
  same('late callbacks from the database after leaving do not touch the page', w.element.hidden, true); }

console.log(`All ${checks} keep-alive checks passed.`);
