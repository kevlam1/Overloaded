// When does a table close, and when should the page warn about it? Pure logic, no clock and no database: the caller
// passes `now` (the SERVER's time, so a player's wrong clock cannot hide or invent a warning) and the table's numbers.
//
// The database rules refuse every write to a table once EITHER limit is passed (backend/database.rules.json):
//   - 8 hours after it was created (`createdAt + 8 h`), and
//   - its idle limit after the last heartbeat (`lastActive + idleLimit`: 30 minutes in the lobby, 1 hour while playing).
// Banners (decided with Kevin, 2026-10-26):
//   - idle: quiet, in the last 5 minutes of the idle limit. Any activity sends a heartbeat, which clears it.
//   - 8-hour limit: quiet at 30 minutes before, more visible ("urgent") at 10 minutes before. Nothing clears it.
// No browser-only or server-only code here, so Node tests can load it.

export const MINUTE_MS = 60 * 1000;
export const EIGHT_HOURS_MS = 8 * 60 * MINUTE_MS;
export const IDLE_WARNING_MS = 5 * MINUTE_MS;
export const AGE_WARNING_MS = 30 * MINUTE_MS;
export const AGE_URGENT_MS = 10 * MINUTE_MS;

// table: { createdAt, lastActive, idleLimit } (all milliseconds; the first two are server times).
// Returns { closed, closesAt, idleLeft, ageLeft, banner } where banner is null or { kind: 'idle' | 'age', urgent, msLeft }.
export function limitsAt(now, table) {
  const idleLeft = table.lastActive + table.idleLimit - now;
  const ageLeft = table.createdAt + EIGHT_HOURS_MS - now;
  const closesAt = Math.min(table.lastActive + table.idleLimit, table.createdAt + EIGHT_HOURS_MS);
  if (idleLeft <= 0 || ageLeft <= 0) return { closed: true, closesAt, idleLeft, ageLeft, banner: null };

  const idleBanner = idleLeft <= IDLE_WARNING_MS ? { kind: 'idle', urgent: false, msLeft: idleLeft } : null;
  const ageBanner = ageLeft <= AGE_WARNING_MS ? { kind: 'age', urgent: ageLeft <= AGE_URGENT_MS, msLeft: ageLeft } : null;
  // If both apply, the one that closes the table first is the one to show (and the 8-hour one, which cannot be
  // extended, wins a tie).
  const banner = idleBanner && ageBanner ? (ageBanner.msLeft <= idleBanner.msLeft ? ageBanner : idleBanner) : (ageBanner ?? idleBanner);
  return { closed: false, closesAt, idleLeft, ageLeft, banner };
}

const minutesText = (ms) => {
  const minutes = Math.max(1, Math.ceil(ms / MINUTE_MS)); // 4 min 01 s reads as "5 minutes", 20 s as "1 minute"
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
};

// What to say once a table has closed under its players. `state` is what limitsAt returned.
export function closedText(state) {
  const why = state.ageLeft <= 0 ? 'This table reached its 8-hour limit and has closed.' : 'This table was idle for too long and has closed.';
  return `${why} Make a new table or join another.`;
}

// The words for a banner. `formatTime(ms)` turns a time into "3:42 PM" for the page's own locale; it is passed in so
// this file stays free of browser code.
export function bannerText(banner, closesAt, formatTime) {
  if (!banner) return '';
  if (banner.kind === 'idle') {
    return `Nobody has done anything for a while. This table closes in ${minutesText(banner.msLeft)} unless someone does something.`;
  }
  return `This table reaches its 8-hour limit and closes at ${formatTime(closesAt)}, in ${minutesText(banner.msLeft)}. The limit cannot be extended.`;
}
