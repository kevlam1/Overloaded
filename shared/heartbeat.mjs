// When should the page tell the database "this table is still in use"? (The heartbeat, activity/lastActive.)
// Pure decision logic with no timers and no database: the caller passes the current time in and supplies `send`.
//
// Rules (Kevin, 2026-10-26, like a banking app: activity keeps a table alive, with no popup):
//  - only while someone is looking at a visible tab, and only if they did something (a tap, a key, a move);
//  - at most one heartbeat per `intervalMs` (default one minute). The database's own cap is 30 seconds for the whole
//    table, so the page stays well under it and several players' heartbeats rarely collide;
//  - an idle or hidden tab sends nothing, so an abandoned table really does go idle.
// No browser-only or server-only code here, so Node tests can load it.

export const HEARTBEAT_INTERVAL_MS = 60 * 1000;

export function createHeartbeat({ send, intervalMs = HEARTBEAT_INTERVAL_MS }) {
  let lastSentAt = -Infinity;
  let pending = false; // something happened since the last heartbeat that has not been reported yet
  let visible = true;

  function maybeSend(now) {
    if (!visible || !pending) return false;
    if (now - lastSentAt < intervalMs) return false;
    lastSentAt = now;
    pending = false;
    send();
    return true;
  }

  return {
    // The person did something (tap, key, move). Returns true if a heartbeat was sent right now.
    activity(now) { pending = true; return maybeSend(now); },
    // Called regularly (a timer): sends the heartbeat that was held back by the interval, if one is due.
    tick(now) { return maybeSend(now); },
    // The tab was hidden or shown. Coming back to the tab counts as activity.
    setVisible(isVisible, now) {
      visible = isVisible;
      if (isVisible) { pending = true; return maybeSend(now); }
      return false;
    },
    // A send did not get through (offline): keep it pending so the next tick tries again. Do NOT call this when the
    // database refused it for being too soon after someone else's heartbeat: that heartbeat already kept the table alive.
    sendFailed() { pending = true; lastSentAt = -Infinity; },
    // For tests and the page's own checks.
    state() { return { lastSentAt, pending, visible }; },
  };
}
