// A hand dealt one card at a time, quickly, with a sound for each card (Kevin, 2026-11-06). Plain logic with no browser code: the page gives it a way to
// draw itself (onChange), a way to play the draw sound (onCard) and a timer, so Node tests can drive it with a fake clock.
//
// This is only what is SHOWN. The game itself is dealt all at once and saved all at once (shared/zones.mjs); the page asks this object how many of the hand's
// cards to show right now, and the library count shows the cards not yet dealt, so the cards on the table never disagree with what is saved.
//
// Under prefers-reduced-motion the whole hand shows at once and no card sounds play (the page passes reducedMotion).
export const DEAL_INTERVAL_MS = 120; // between one card and the next
export const SHUFFLE_PAUSE_MS = 800; // after a shuffle sound (it is about a second long) before the first card

export function createDealer({ onChange, onCard, reducedMotion = () => false, schedule = setTimeout, cancelTimer = clearTimeout }) {
  let shown = null; // null: show the whole hand. A number: show only that many cards of it.
  let dealt = null; // the number of the card dealt last (1 for the first), or null when no card has been dealt yet in this deal
  let timers = [];

  const stop = () => { for (const timer of timers) cancelTimer(timer); timers = []; };

  // Starts dealing `total` cards (the size of the hand). pause: how long to wait before the first card. Always calls onChange at least once, so the caller does
  // not draw the table itself after starting a deal. Starting again cancels a deal that is still going and starts over.
  function start(total, { pause = 0 } = {}) {
    stop();
    dealt = null;
    if (!Number.isInteger(total) || total <= 0 || reducedMotion()) { shown = null; onChange(); return; }
    shown = 0;
    onChange(); // the hand is empty on the table while the cards wait to be dealt
    for (let n = 1; n <= total; n++) {
      timers.push(schedule(() => {
        shown = n === total ? null : n; // the last card ends the deal: from then on the whole hand shows
        dealt = n;
        onCard(n);
        onChange();
        if (n === total) timers = [];
      }, pause + (n - 1) * DEAL_INTERVAL_MS));
    }
  }

  // Ends a deal at once and shows the whole hand.
  function finish() {
    stop();
    dealt = null;
    if (shown !== null) { shown = null; onChange(); }
  }

  return {
    start,
    finish,
    // How many cards of the hand to show: a number while dealing, null when the whole hand shows.
    limit: () => shown,
    // The number of the card that was just dealt (1 is the first), for a small entrance animation on that card; null before the first card of a deal.
    dealt: () => dealt,
    // The cards of `hand` to draw now.
    visible: (hand) => (shown === null ? hand : hand.slice(0, shown)),
    // How many cards of `hand` are still waiting to be dealt (0 when not dealing).
    waiting: (hand) => (shown === null ? 0 : Math.max(0, hand.length - shown)),
  };
}
