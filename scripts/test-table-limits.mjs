// Tests for shared/table-limits.mjs: when a table closes and when the page warns, with exact boundaries.
import { limitsAt, bannerText, MINUTE_MS, EIGHT_HOURS_MS } from '../shared/table-limits.mjs';

let checks = 0;
function same(label, actual, expected) {
  checks++;
  const a = JSON.stringify(actual); const e = JSON.stringify(expected);
  if (a !== e) { console.log(`FAILED CHECK: ${label}: expected ${e}, got ${a}`); process.exit(1); }
}
const M = MINUTE_MS;
const H = 60 * M;
const LOBBY = 30 * M;
const PLAYING = 60 * M;
// A table created at 0 whose last heartbeat was at `active`.
const table = (active, idleLimit = LOBBY, created = 0) => ({ createdAt: created, lastActive: active, idleLimit });
const at = (now, t) => limitsAt(now, t);

same('the 8-hour limit is 8 hours', EIGHT_HOURS_MS, 8 * H);

// A fresh lobby: nothing to say
same('a new table has no banner', at(1000, table(0)).banner, null);
same('a new table is not closed', at(1000, table(0)).closed, false);

// Idle banner in a lobby (limit 30 min, warn in the last 5)
same('24 min 59 s idle: no banner', at(24 * M + 59000, table(0)).banner, null);
same('exactly 25 min idle: the banner appears', at(25 * M, table(0)).banner, { kind: 'idle', urgent: false, msLeft: 5 * M });
same('29 min idle: 1 minute left', at(29 * M, table(0)).banner, { kind: 'idle', urgent: false, msLeft: 1 * M });
same('29 min 59.999 s idle: still open', at(30 * M - 1, table(0)).closed, false);
same('exactly 30 min idle: closed', at(30 * M, table(0)).closed, true);
same('and then there is no banner (it is closed)', at(30 * M, table(0)).banner, null);
same('31 min idle: closed', at(31 * M, table(0)).closed, true);

// A heartbeat resets the idle clock
same('a heartbeat at 20 min makes 25 min idle-free again', at(25 * M, table(20 * M)).banner, null);
same('the next warning is 25 minutes after the heartbeat', at(45 * M, table(20 * M)).banner, { kind: 'idle', urgent: false, msLeft: 5 * M });

// Idle banner while playing (limit 1 hour, warn in the last 5)
same('playing, 54 min idle: no banner', at(54 * M, table(0, PLAYING)).banner, null);
same('playing, 55 min idle: the banner appears', at(55 * M, table(0, PLAYING)).banner, { kind: 'idle', urgent: false, msLeft: 5 * M });
same('playing, 60 min idle: closed', at(60 * M, table(0, PLAYING)).closed, true);

// 8-hour limit (table created at 0; keep it alive with a heartbeat just now so only the age matters)
const alive = (now, idleLimit = PLAYING) => table(now - 1000, idleLimit);
same('7 h 29 min: no banner', at(7 * H + 29 * M, alive(7 * H + 29 * M)).banner, null);
same('7 h 30 min: the quiet banner appears', at(7 * H + 30 * M, alive(7 * H + 30 * M)).banner, { kind: 'age', urgent: false, msLeft: 30 * M });
same('7 h 49 min 59.999 s: still quiet', at(7 * H + 50 * M - 1, alive(7 * H + 50 * M - 1)).banner.urgent, false);
same('7 h 50 min: the banner is urgent', at(7 * H + 50 * M, alive(7 * H + 50 * M)).banner, { kind: 'age', urgent: true, msLeft: 10 * M });
same('7 h 59 min: urgent, 1 minute left', at(7 * H + 59 * M, alive(7 * H + 59 * M)).banner, { kind: 'age', urgent: true, msLeft: 1 * M });
same('8 h minus 1 ms: open', at(8 * H - 1, alive(8 * H - 1)).closed, false);
same('exactly 8 h: closed', at(8 * H, alive(8 * H)).closed, true);
same('a heartbeat cannot extend the 8-hour limit', at(8 * H + 1, table(8 * H, PLAYING)).closed, true);
same('closesAt is the creation time plus 8 hours when that comes first', at(7 * H + 40 * M, alive(7 * H + 40 * M)).closesAt, 8 * H);
same('closesAt is the last heartbeat plus the idle limit when that comes first', at(10 * M, table(5 * M)).closesAt, 35 * M);

// A table created later has its own 8 hours
same('a table created at 3 h reaches its limit at 11 h', at(11 * H, table(11 * H - 1000, PLAYING, 3 * H)).closed, true);
same('and is open a moment before', at(11 * H - 1, table(11 * H - 2000, PLAYING, 3 * H)).closed, false);

// Both limits close together: the one that closes first is shown, the 8-hour one wins a tie
{ const t = table(7 * H + 27 * M, LOBBY); // idle limit ends at 7 h 57 min; age ends at 8 h
  same('idle closes first: the idle banner is shown', at(7 * H + 53 * M, t).banner, { kind: 'idle', urgent: false, msLeft: 4 * M });
  const u = table(7 * H + 55 * M, LOBBY); // idle would end at 8 h 25 min; age ends at 8 h
  same('age closes first: the age banner is shown', at(7 * H + 56 * M, u).banner, { kind: 'age', urgent: true, msLeft: 4 * M });
  const tie = table(7 * H + 30 * M, LOBBY); // both end exactly at 8 h
  same('a tie goes to the 8-hour banner', at(7 * H + 56 * M, tie).banner.kind, 'age'); }

// A table with a heartbeat in the future (clock skew in the data) is just treated as freshly active
same('a heartbeat slightly in the future is not closed', at(1000, table(2000)).closed, false);

// The words
const fmt = (ms) => `T${ms / M}`;
same('no banner, no words', bannerText(null, 0, fmt), '');
same('idle text with 5 minutes left', bannerText({ kind: 'idle', urgent: false, msLeft: 5 * M }, 0, fmt), 'Nobody has done anything for a while. This table closes in 5 minutes unless someone does something.');
same('idle text rounds up (4 min 1 s is 5 minutes)', bannerText({ kind: 'idle', urgent: false, msLeft: 4 * M + 1000 }, 0, fmt), 'Nobody has done anything for a while. This table closes in 5 minutes unless someone does something.');
same('idle text with 1 minute is singular', bannerText({ kind: 'idle', urgent: false, msLeft: 1 * M }, 0, fmt), 'Nobody has done anything for a while. This table closes in 1 minute unless someone does something.');
same('idle text with 20 seconds says 1 minute, never 0', bannerText({ kind: 'idle', urgent: false, msLeft: 20000 }, 0, fmt), 'Nobody has done anything for a while. This table closes in 1 minute unless someone does something.');
same('even a time left of zero never reads "0 minutes"', bannerText({ kind: 'idle', urgent: false, msLeft: 0 }, 0, fmt), 'Nobody has done anything for a while. This table closes in 1 minute unless someone does something.');
same('nor does a negative one', bannerText({ kind: 'idle', urgent: false, msLeft: -5000 }, 0, fmt), 'Nobody has done anything for a while. This table closes in 1 minute unless someone does something.');
same('age text names the time and says it cannot be extended', bannerText({ kind: 'age', urgent: false, msLeft: 28 * M }, 480 * M, fmt), 'This table reaches its 8-hour limit and closes at T480, in 28 minutes. The limit cannot be extended.');
same('age text with 10 minutes left', bannerText({ kind: 'age', urgent: true, msLeft: 10 * M }, 5 * M, fmt), 'This table reaches its 8-hour limit and closes at T5, in 10 minutes. The limit cannot be extended.');

console.log(`All ${checks} table limit checks passed.`);
