// Who is at the table right now? Presence logic with no database and no clock of its own: the caller passes the time in.
//
// How it works (decided with Kevin, 2026-10-26; the database side is built separately):
//  - every open tab of a player writes a small "I am here" note and asks the database to remove it if the connection drops;
//  - when the last note goes, the database also records the time as "last seen";
//  - others read both: notes present = connected; no notes yet seen recently = "Reconnecting..."; no notes for about two
//    minutes = "Disconnected, last seen N min ago". A refresh keeps a player connected (the new tab writes its note
//    before the old one's removal matters, and the short gap reads as "Reconnecting...", not as gone).
// All times are in milliseconds and are the SERVER's time.
// No browser-only or server-only code here, so Node tests can load it.

export const MINUTE_MS = 60 * 1000;
export const RECONNECT_WINDOW_MS = 2 * MINUTE_MS; // "Reconnecting..." for this long, then "Disconnected"
export const HOST_GONE_AFTER_MS = 5 * MINUTE_MS; // a host with no open tab for this long can be replaced by another player

const TAB_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'; // 32 characters, like the table code alphabet
const TAB_ID_LENGTH = 10;
const secureBytes = (count) => globalThis.crypto.getRandomValues(new Uint8Array(count));
// A name for one open tab ("tab"). Random, so two tabs of one player never share a note. `randomBytes` is replaceable in tests.
export function makeTabId(randomBytes = secureBytes) {
  const bytes = randomBytes(TAB_ID_LENGTH);
  let id = '';
  for (let i = 0; i < TAB_ID_LENGTH; i++) id += TAB_ID_ALPHABET[bytes[i] & 31];
  return id;
}

// What the database holds for one player: { tabs: { <tabId>: true, ... }, lastSeen: <ms> } (or nothing at all).
// Returns { tabs: <how many are open>, lastSeen: <ms or null> }.
export function summarize(raw) {
  const tabs = raw && typeof raw.tabs === 'object' && raw.tabs !== null ? Object.keys(raw.tabs).length : 0;
  const lastSeen = raw && Number.isFinite(raw.lastSeen) ? raw.lastSeen : null;
  return { tabs, lastSeen };
}

// The state of one player. entry is { tabs, lastSeen } as summarize returns.
//   connected:    at least one tab is open.
//   unknown:      no tab and no last-seen time: they have not written presence yet (just joined) or it is unreadable.
//                 Nothing is shown for this; it is not "disconnected".
//   reconnecting: no tab, last seen less than two minutes ago.
//   disconnected: no tab, last seen two minutes ago or more; `minutes` is how long (at least 1).
export function presenceStatus(entry, now) {
  if (entry && entry.tabs > 0) return { state: 'connected' };
  if (!entry || !Number.isFinite(entry.lastSeen) || !Number.isFinite(now)) return { state: 'unknown' };
  const away = Math.max(0, now - entry.lastSeen); // a last-seen time slightly in the future (clock skew) counts as "just now"
  if (away < RECONNECT_WINDOW_MS) return { state: 'reconnecting', awayMs: away };
  return { state: 'disconnected', awayMs: away, minutes: Math.max(1, Math.floor(away / MINUTE_MS)) };
}

// The words next to a player's name (nothing when they are fine).
export function presenceText(status) {
  if (status.state === 'reconnecting') return 'Reconnecting...';
  if (status.state === 'disconnected') return `Disconnected, last seen ${status.minutes} min ago`;
  return '';
}

// The words on your OWN screen when this computer lost its connection to the database.
export function ownConnectionText(isConnected) {
  return isConnected === false ? "You're offline, reconnecting..." : '';
}

// Has the host been gone long enough for another player to take over? Same test as the database rule will apply.
export function hostIsGone(entry, now) {
  if (!entry || entry.tabs > 0 || !Number.isFinite(entry.lastSeen) || !Number.isFinite(now)) return false;
  return now - entry.lastSeen >= HOST_GONE_AFTER_MS;
}
