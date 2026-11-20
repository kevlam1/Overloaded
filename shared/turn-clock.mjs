// The turn clock (Kevin, 2026-11-20): how long the turn now on has taken, counting UP from 0 each time the turn is passed. Nothing is enforced and there is no countdown. Plain functions with no browser
// code, so Node tests can load them (scripts/test-turn-clock.mjs).
//
// Every pass is written with the database's own clock (`at`, shared/turn-order.mjs), so every page counts from the same moment and a refresh keeps the time. A pass with no time (turn 1, or one from
// before the clock) is counted from when this page first saw that turn.
export const TURN_CLOCK_KEY = 'overloaded.turnClock'; // "1" or "0" in this browser: whether to show the clock (on until the player turns it off)

export function readTurnClockSetting(text) {
  return text !== '0';
}

// "0:07", "12:34", "1:02:03". Anything that is not a time of 0 or more is 0:00.
export function clockText(ms) {
  const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const two = (number) => String(number).padStart(2, '0');
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${minutes}:${two(seconds)}`;
}

// How long the turn has taken, in milliseconds. at: the database time of the pass (or null). serverOffset: the database's clock minus this computer's (or null until it is known). seenAt: this computer's
// time when the page first saw the turn. now: this computer's time now.
export function turnElapsed({ at = null, serverOffset = null, seenAt = null, now }) {
  if (Number.isSafeInteger(at) && at > 0 && Number.isFinite(serverOffset)) return Math.max(0, now + serverOffset - at);
  if (Number.isFinite(seenAt)) return Math.max(0, now - seenAt);
  return 0;
}

// The page's memory of the turn on: a new key (match and turn number) starts counting from now; a time that arrives later for the same turn (the passer's own page gets it from the database a moment
// after the pass) replaces the page's own count. Returns the new state; the old one is not changed.
export function observeTurn(state, { key, at = null }, now) {
  if (!state || state.key !== key) return { key, at: Number.isSafeInteger(at) && at > 0 ? at : null, seenAt: now };
  if (state.at === null && Number.isSafeInteger(at) && at > 0) return { ...state, at };
  return state;
}
