// Tests for shared/deal-sequence.mjs with a fake clock: the order, the timing, what is shown at each moment, the sounds, restarting, reduced motion.
import { createDealer, DEAL_INTERVAL_MS, SHUFFLE_PAUSE_MS } from '../shared/deal-sequence.mjs';

let checks = 0;
const same = (label, actual, expected) => {
  checks++;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) { console.log(`FAILED CHECK: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); process.exit(1); }
};

// A clock the test moves by hand. schedule(fn, ms) runs fn when the clock reaches now + ms; timers at the same time run in the order they were made.
function fakeClock() {
  let now = 0; let nextId = 1; let timers = [];
  return {
    now: () => now,
    schedule(fn, ms) { const id = nextId++; timers.push({ id, at: now + ms, fn }); return id; },
    cancelTimer(id) { timers = timers.filter((t) => t.id !== id); },
    pending: () => timers.length,
    advance(ms) {
      const target = now + ms;
      for (;;) {
        const due = timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at || a.id - b.id)[0];
        if (!due) break;
        timers = timers.filter((t) => t !== due);
        now = due.at;
        due.fn();
      }
      now = target;
    },
  };
}

function setup({ reduced = false, size = 7 } = {}) {
  const clock = fakeClock();
  const log = [];
  const hand = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].slice(0, size);
  let dealer;
  dealer = createDealer({
    onChange: () => log.push({ t: clock.now(), kind: 'draw', shown: dealer.visible(hand).length, waiting: dealer.waiting(hand) }),
    onCard: (n) => log.push({ t: clock.now(), kind: 'sound', n }),
    reducedMotion: () => reduced,
    schedule: clock.schedule,
    cancelTimer: clock.cancelTimer,
  });
  return { clock, log, hand, dealer };
}
const shownAt = (log) => log.filter((e) => e.kind === 'draw').map((e) => e.shown);

same('the numbers', [DEAL_INTERVAL_MS, SHUFFLE_PAUSE_MS], [120, 800]);

// a normal deal of 7 cards
{
  const { clock, log, hand, dealer } = setup();
  same('nothing happens before a deal starts', [log.length, dealer.limit(), dealer.visible(hand).length, dealer.waiting(hand)], [0, null, 7, 0]);
  dealer.start(7);
  same('starting draws the table once with an empty hand and all 7 waiting', log, [{ t: 0, kind: 'draw', shown: 0, waiting: 7 }]);
  same('while it waits the hand shows nothing and the 7 are still to come', [dealer.limit(), dealer.visible(hand), dealer.waiting(hand)], [0, [], 7]);
  same('before the first card nothing has been dealt', dealer.dealt(), null);
  clock.advance(0);
  same('the first card comes at once: one sound, one card shown', log.slice(1), [{ t: 0, kind: 'sound', n: 1 }, { t: 0, kind: 'draw', shown: 1, waiting: 6 }]);
  clock.advance(DEAL_INTERVAL_MS - 1);
  same('no second card before the interval has passed', shownAt(log), [0, 1]);
  clock.advance(1);
  same('the second card comes after one interval', shownAt(log), [0, 1, 2]);
  clock.advance(5 * DEAL_INTERVAL_MS);
  same('then one card each interval until all 7 are shown, the last showing the whole hand', shownAt(log), [0, 1, 2, 3, 4, 5, 6, 7]);
  same('each card made exactly one sound, in order, at its own time', log.filter((e) => e.kind === 'sound').map((e) => [e.n, e.t]), [[1, 0], [2, 120], [3, 240], [4, 360], [5, 480], [6, 600], [7, 720]]);
  same('each sound comes together with its card (the sound, then the draw, at the same moment)', log.slice(1).map((e, i) => e.kind), ['sound', 'draw', 'sound', 'draw', 'sound', 'draw', 'sound', 'draw', 'sound', 'draw', 'sound', 'draw', 'sound', 'draw']);
  same('after the last card the dealt number is 7', dealer.dealt(), 7);
  same('when it is done the whole hand shows and nothing waits', [dealer.limit(), dealer.visible(hand).length, dealer.waiting(hand), clock.pending()], [null, 7, 0, 0]);
  clock.advance(10000);
  same('nothing more happens afterwards', shownAt(log).length, 8);
}

// a deal after a shuffle waits first
{
  const { clock, log, dealer } = setup();
  dealer.start(7, { pause: SHUFFLE_PAUSE_MS });
  same('the hand is empty during the pause', shownAt(log), [0]);
  clock.advance(SHUFFLE_PAUSE_MS - 1);
  same('no card during the pause', [shownAt(log), log.filter((e) => e.kind === 'sound').length], [[0], 0]);
  clock.advance(1);
  same('the first card comes when the pause ends', log.filter((e) => e.kind === 'sound').map((e) => [e.n, e.t]), [[1, 800]]);
  clock.advance(6 * DEAL_INTERVAL_MS);
  same('the last card comes 6 intervals after the first', log.filter((e) => e.kind === 'sound').at(-1), { t: 800 + 720, kind: 'sound', n: 7 });
}

// a hand of any other size
{
  const { clock, log, dealer } = setup({ size: 3 });
  dealer.start(3);
  clock.advance(1000);
  same('a hand of 3 deals 3 cards', [shownAt(log), log.filter((e) => e.kind === 'sound').length], [[0, 1, 2, 3], 3]);
  const one = setup({ size: 1 });
  one.dealer.start(1);
  one.clock.advance(1000);
  same('a hand of 1 deals 1 card', [shownAt(one.log), one.log.filter((e) => e.kind === 'sound').length], [[0, 1], 1]);
  for (const [label, total] of [['0', 0], ['negative', -3], ['a fraction', 2.5], ['text', '7'], ['nothing', undefined], ['NaN', NaN]]) {
    const s = setup();
    s.dealer.start(total);
    s.clock.advance(5000);
    same(`a hand of ${label} is not dealt: the table is drawn once, no sounds, the whole hand shows`, [shownAt(s.log), s.log.filter((e) => e.kind === 'sound').length, s.dealer.limit(), s.clock.pending()], [[7], 0, null, 0]);
  }
}

// restarting in the middle of a deal (a second mulligan, a new game)
{
  const { clock, log, dealer } = setup();
  dealer.start(7);
  clock.advance(DEAL_INTERVAL_MS * 3);
  same('three cards in', shownAt(log).at(-1), 4);
  log.length = 0;
  dealer.start(7, { pause: SHUFFLE_PAUSE_MS });
  same('starting again empties the hand and cancels the old timers', [shownAt(log), clock.pending()], [[0], 7]);
  clock.advance(SHUFFLE_PAUSE_MS - 1);
  same('no card from the old deal arrives late', log.filter((e) => e.kind === 'sound').length, 0);
  clock.advance(1 + 6 * DEAL_INTERVAL_MS);
  same('the new deal deals all 7 once', [log.filter((e) => e.kind === 'sound').map((e) => e.n), shownAt(log).at(-1), clock.pending()], [[1, 2, 3, 4, 5, 6, 7], 7, 0]);
}

// finishing a deal early
{
  const { clock, log, hand, dealer } = setup();
  dealer.start(7);
  clock.advance(DEAL_INTERVAL_MS * 2);
  log.length = 0;
  dealer.finish();
  same('finishing shows the whole hand at once and cancels the rest', [shownAt(log), dealer.limit(), dealer.visible(hand).length, clock.pending()], [[7], null, 7, 0]);
  clock.advance(5000);
  same('no sound comes after finishing', log.filter((e) => e.kind === 'sound').length, 0);
  log.length = 0;
  dealer.finish();
  same('finishing when nothing is being dealt does nothing', log, []);
}

// prefers-reduced-motion: the whole hand at once, no card sounds, no timers
{
  const { clock, log, hand, dealer } = setup({ reduced: true });
  dealer.start(7, { pause: SHUFFLE_PAUSE_MS });
  same('reduced motion: the table is drawn once with the whole hand', [shownAt(log), dealer.limit(), dealer.visible(hand).length, dealer.waiting(hand)], [[7], null, 7, 0]);
  clock.advance(5000);
  same('reduced motion: no sound and no timer', [log.filter((e) => e.kind === 'sound').length, clock.pending()], [0, 0]);
  const live = setup();
  const flag = { reduced: false };
  let d2;
  const log2 = [];
  d2 = createDealer({ onChange: () => log2.push(d2.limit()), onCard: () => {}, reducedMotion: () => flag.reduced, schedule: live.clock.schedule, cancelTimer: live.clock.cancelTimer });
  flag.reduced = true;
  d2.start(7);
  same('the setting is asked each time a deal starts, not once', [log2, live.clock.pending()], [[null], 0]);
  flag.reduced = false;
  d2.start(7);
  same('...so turning it off makes the next deal animate', [log2.at(-1), live.clock.pending()], [0, 7]);
}

// visible() and waiting() while dealing, for a hand that changes size under it
{
  const { clock, dealer } = setup();
  dealer.start(7);
  clock.advance(DEAL_INTERVAL_MS * 2);
  same('three of seven shown', [dealer.visible(['a', 'b', 'c', 'd', 'e', 'f', 'g']).join(''), dealer.waiting(['a', 'b', 'c', 'd', 'e', 'f', 'g'])], ['abc', 4]);
  same('a shorter hand than the count shown shows all of it and nothing waits', [dealer.visible(['a', 'b']).join(''), dealer.waiting(['a', 'b'])], ['ab', 0]);
  same('an empty hand shows nothing and nothing waits', [dealer.visible([]).length, dealer.waiting([])], [0, 0]);
}

console.log(`All ${checks} deal sequence checks passed.`);
