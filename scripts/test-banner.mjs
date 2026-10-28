// Tests for frontend/src/banner.js (what is put on the page for each situation) and closedText, with a plain object
// standing in for the page element.
import { renderBanner } from '../frontend/src/banner.js';
import { closedText, limitsAt, MINUTE_MS } from '../shared/table-limits.mjs';

let checks = 0;
function same(label, actual, expected) {
  checks++;
  const a = JSON.stringify(actual); const e = JSON.stringify(expected);
  if (a !== e) { console.log(`FAILED CHECK: ${label}: expected ${e}, got ${a}`); process.exit(1); }
}
const M = MINUTE_MS; const H = 60 * M;
const fmt = (ms) => `T${ms / M}`;
const el = () => ({ hidden: true, textContent: '', dataset: {} });
const show = (now, table) => { const e = el(); const r = renderBanner(e, { now, table, formatTime: fmt }); return { e, r, view: { hidden: e.hidden, level: e.dataset.level, text: e.textContent } }; };
const T = (active, idleLimit = 30 * M, created = 0) => ({ createdAt: created, lastActive: active, idleLimit });

// Nothing to show
same('a fresh table: hidden, empty, no level', show(1000, T(0)).view, { hidden: true, level: undefined, text: '' });
same('a table whose data has not all arrived yet shows nothing (no table)', show(1000, null).view, { hidden: true, level: undefined, text: '' });
same('nor with no heartbeat yet', show(1000, { createdAt: 0, idleLimit: 30 * M }).view, { hidden: true, level: undefined, text: '' });
same('nor with no idle limit yet', show(1000, { createdAt: 0, lastActive: 0 }).view, { hidden: true, level: undefined, text: '' });
same('nor with text where a time should be', show(1000, { createdAt: 'x', lastActive: 0, idleLimit: 30 * M }).view, { hidden: true, level: undefined, text: '' });
same('and it reports nothing for an incomplete table', show(1000, null).r, null);

// The idle banner is quiet
same('25 minutes idle: a quiet banner', show(25 * M, T(0)).view, { hidden: false, level: 'quiet', text: 'Nobody has done anything for a while. This table closes in 5 minutes unless someone does something.' });

// The 8-hour banners
same('7 h 30: a quiet 8-hour banner', show(7 * H + 30 * M, T(7 * H + 30 * M - 1000, 60 * M)).view, { hidden: false, level: 'quiet', text: 'This table reaches its 8-hour limit and closes at T480, in 30 minutes. The limit cannot be extended.' });
same('7 h 50: an urgent 8-hour banner', show(7 * H + 50 * M, T(7 * H + 50 * M - 1000, 60 * M)).view, { hidden: false, level: 'urgent', text: 'This table reaches its 8-hour limit and closes at T480, in 10 minutes. The limit cannot be extended.' });

// Closed
same('idle past the limit: closed, with the idle reason', show(31 * M, T(0)).view, { hidden: false, level: 'closed', text: 'This table was idle for too long and has closed. Make a new table or join another.' });
same('past 8 hours: closed, with the 8-hour reason', show(8 * H, T(8 * H - 1000, 60 * M)).view, { hidden: false, level: 'closed', text: 'This table reached its 8-hour limit and has closed. Make a new table or join another.' });
same('both limits passed: the 8-hour reason (it could not have been extended)', show(9 * H, T(0, 30 * M)).view.text, 'This table reached its 8-hour limit and has closed. Make a new table or join another.');

// A banner clears itself when the table is refreshed by a heartbeat (the same element, later state)
{ const e = el();
  renderBanner(e, { now: 26 * M, table: T(0), formatTime: fmt });
  same('the quiet banner is up', [e.hidden, e.dataset.level], [false, 'quiet']);
  renderBanner(e, { now: 26 * M, table: T(26 * M), formatTime: fmt });
  same('a heartbeat takes it away again: hidden, empty, no level', [e.hidden, e.textContent, e.dataset.level], [true, '', undefined]); }

// Quiet turns urgent as the 8-hour limit nears, on the same element
{ const e = el();
  renderBanner(e, { now: 7 * H + 40 * M, table: T(7 * H + 40 * M - 1000, 60 * M), formatTime: fmt });
  same('quiet at 20 minutes before', e.dataset.level, 'quiet');
  renderBanner(e, { now: 7 * H + 51 * M, table: T(7 * H + 51 * M - 1000, 60 * M), formatTime: fmt });
  same('urgent at 9 minutes before', e.dataset.level, 'urgent');
  renderBanner(e, { now: 8 * H + 1, table: T(8 * H, 60 * M), formatTime: fmt });
  same('closed after', e.dataset.level, 'closed'); }

// The return value is what the limits module says
same('the returned state matches limitsAt', JSON.stringify(show(25 * M, T(0)).r), JSON.stringify(limitsAt(25 * M, T(0))));

// closedText on its own
same('closedText, idle', closedText({ ageLeft: 5 * H, idleLeft: -1 }), 'This table was idle for too long and has closed. Make a new table or join another.');
same('closedText, age', closedText({ ageLeft: 0, idleLeft: 5 * M }), 'This table reached its 8-hour limit and has closed. Make a new table or join another.');

console.log(`All ${checks} banner checks passed.`);
