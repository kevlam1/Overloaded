// Tests for shared/presence.mjs: who is connected, reconnecting or gone, and the words for it. Fake clock, no database.
import { presenceStatus, presenceText, ownConnectionText, hostIsGone, summarize, makeTabId, RECONNECT_WINDOW_MS, HOST_GONE_AFTER_MS, MINUTE_MS } from '../shared/presence.mjs';

let checks = 0;
function same(label, actual, expected) {
  checks++;
  const a = JSON.stringify(actual); const e = JSON.stringify(expected);
  if (a !== e) { console.error(`FAILED: ${label}: expected ${e}, got ${a}`); process.exit(1); }
}
const M = MINUTE_MS;

same('reconnecting lasts 2 minutes', RECONNECT_WINDOW_MS, 2 * M);
same('a host is gone after 5 minutes', HOST_GONE_AFTER_MS, 5 * M);

// ---- summarize: what the database holds ----
same('nothing at all', summarize(null), { tabs: 0, lastSeen: null });
same('undefined', summarize(undefined), { tabs: 0, lastSeen: null });
same('one tab', summarize({ tabs: { abc: true } }), { tabs: 1, lastSeen: null });
same('three tabs', summarize({ tabs: { a: true, b: true, c: true } }), { tabs: 3, lastSeen: null });
same('a last-seen time and no tabs', summarize({ lastSeen: 5000 }), { tabs: 0, lastSeen: 5000 });
same('both', summarize({ tabs: { a: true }, lastSeen: 5000 }), { tabs: 1, lastSeen: 5000 });
same('an empty tabs object is no tabs', summarize({ tabs: {} }), { tabs: 0, lastSeen: null });
same('tabs that is not an object is no tabs', summarize({ tabs: 'x' }), { tabs: 0, lastSeen: null });
same('tabs that is null is no tabs', summarize({ tabs: null }), { tabs: 0, lastSeen: null });
same('a last-seen that is text is ignored', summarize({ lastSeen: 'soon' }), { tabs: 0, lastSeen: null });
same('a last-seen of zero is a real time', summarize({ lastSeen: 0 }), { tabs: 0, lastSeen: 0 });
same('a last-seen of NaN is ignored', summarize({ lastSeen: NaN }), { tabs: 0, lastSeen: null });
same('a last-seen of Infinity is ignored', summarize({ lastSeen: Infinity }), { tabs: 0, lastSeen: null });
same('a number is not a record', summarize(5), { tabs: 0, lastSeen: null });

// ---- presenceStatus ----
const T0 = 1_000_000;
same('a tab is open: connected', presenceStatus({ tabs: 1, lastSeen: null }, T0), { state: 'connected' });
same('a tab is open and a stale last-seen: still connected', presenceStatus({ tabs: 2, lastSeen: T0 - 60 * M }, T0), { state: 'connected' });
same('no tab and no last-seen: unknown, not disconnected', presenceStatus({ tabs: 0, lastSeen: null }, T0), { state: 'unknown' });
same('no entry at all: unknown', presenceStatus(undefined, T0), { state: 'unknown' });
same('null entry: unknown', presenceStatus(null, T0), { state: 'unknown' });
same('just left: reconnecting', presenceStatus({ tabs: 0, lastSeen: T0 }, T0), { state: 'reconnecting', awayMs: 0 });
same('30 seconds away: reconnecting', presenceStatus({ tabs: 0, lastSeen: T0 - 30000 }, T0), { state: 'reconnecting', awayMs: 30000 });
same('1 min 59.999 s away: still reconnecting', presenceStatus({ tabs: 0, lastSeen: T0 - (2 * M - 1) }, T0).state, 'reconnecting');
same('exactly 2 minutes away: disconnected', presenceStatus({ tabs: 0, lastSeen: T0 - 2 * M }, T0), { state: 'disconnected', awayMs: 2 * M, minutes: 2 });
same('2 min 59 s away reads as 2 minutes', presenceStatus({ tabs: 0, lastSeen: T0 - (3 * M - 1000) }, T0).minutes, 2);
same('3 minutes away reads as 3', presenceStatus({ tabs: 0, lastSeen: T0 - 3 * M }, T0).minutes, 3);
same('an hour away reads as 60', presenceStatus({ tabs: 0, lastSeen: T0 - 60 * M }, T0).minutes, 60);
same('a last-seen in the future (clock skew) is just now', presenceStatus({ tabs: 0, lastSeen: T0 + 5000 }, T0), { state: 'reconnecting', awayMs: 0 });
same('a missing now is unknown, not a crash', presenceStatus({ tabs: 0, lastSeen: T0 }, undefined), { state: 'unknown' });
same('a NaN now is unknown', presenceStatus({ tabs: 0, lastSeen: T0 }, NaN), { state: 'unknown' });
same('a returning player is connected the moment a tab opens', presenceStatus({ tabs: 1, lastSeen: T0 - 10 * M }, T0).state, 'connected');

// ---- the words ----
same('connected shows nothing', presenceText({ state: 'connected' }), '');
same('unknown shows nothing', presenceText({ state: 'unknown' }), '');
same('reconnecting', presenceText({ state: 'reconnecting', awayMs: 5000 }), 'Reconnecting...');
same('disconnected, 7 minutes', presenceText({ state: 'disconnected', awayMs: 7 * M, minutes: 7 }), 'Disconnected, last seen 7 min ago');
same('disconnected, 2 minutes', presenceText({ state: 'disconnected', awayMs: 2 * M, minutes: 2 }), 'Disconnected, last seen 2 min ago');
same('the words follow the status end to end', presenceText(presenceStatus({ tabs: 0, lastSeen: T0 - 4 * M - 5000 }, T0)), 'Disconnected, last seen 4 min ago');
same('your own screen: connected shows nothing', ownConnectionText(true), '');
same('your own screen: offline', ownConnectionText(false), "You're offline, reconnecting...");
same('your own screen: not known yet shows nothing', ownConnectionText(undefined) === '' && ownConnectionText(null) === '', true);

// ---- the host gone ----
same('a host with a tab open is not gone', hostIsGone({ tabs: 1, lastSeen: T0 - 60 * M }, T0), false);
same('a host who just left is not gone', hostIsGone({ tabs: 0, lastSeen: T0 }, T0), false);
same('4 min 59.999 s away is not gone', hostIsGone({ tabs: 0, lastSeen: T0 - (5 * M - 1) }, T0), false);
same('exactly 5 minutes away is gone', hostIsGone({ tabs: 0, lastSeen: T0 - 5 * M }, T0), true);
same('an hour away is gone', hostIsGone({ tabs: 0, lastSeen: T0 - 60 * M }, T0), true);
same('a host with no presence record at all is NOT treated as gone (we cannot tell)', hostIsGone({ tabs: 0, lastSeen: null }, T0), false);
same('no entry: not gone', hostIsGone(undefined, T0) || hostIsGone(null, T0), false);
same('a missing now: not gone', hostIsGone({ tabs: 0, lastSeen: 0 }, undefined), false);
same('an infinite now is not gone', hostIsGone({ tabs: 0, lastSeen: 0 }, Infinity), false);
same('a last-seen in the future is not gone', hostIsGone({ tabs: 0, lastSeen: T0 + 10 * M }, T0), false);
same('the 2-minute disconnected window is shorter than the host takeover time (so people see "Disconnected" before anyone can take over)', RECONNECT_WINDOW_MS < HOST_GONE_AFTER_MS, true);

// ---- tab ids ----
{
  const id = makeTabId();
  same('a tab id is 10 letters and digits from the table', /^[a-z2-7]{10}$/.test(id), true);
  const seen = new Set(); for (let i = 0; i < 5000; i++) seen.add(makeTabId());
  same('5,000 tab ids are all different', seen.size, 5000);
  same('the same bytes give the same id (replaceable randomness)', makeTabId(() => new Uint8Array(10).fill(0)), 'aaaaaaaaaa');
  same('only the low 5 bits of each byte are used (no bias)', makeTabId(() => new Uint8Array(10).fill(255)), '7777777777');
  same('byte 33 is the same as byte 1', makeTabId(() => Uint8Array.from([33, 33, 33, 33, 33, 33, 33, 33, 33, 33])), 'bbbbbbbbbb');
  const counts = new Map();
  for (let i = 0; i < 40000; i++) for (const ch of makeTabId()) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  const values = [...counts.values()];
  same('every one of the 32 characters is used', counts.size, 32);
  same('and none is far from its fair share (400,000 characters, 12,500 each)', values.every((n) => n > 11800 && n < 13200), true);
}

console.log(`All ${checks} presence checks passed.`);
