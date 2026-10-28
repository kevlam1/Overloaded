// Tests for shared/heartbeat.mjs with a fake clock (no timers, no database).
import { createHeartbeat, HEARTBEAT_INTERVAL_MS } from '../shared/heartbeat.mjs';

let checks = 0;
function same(label, actual, expected) {
  checks++;
  if (actual !== expected) { console.log(`FAILED CHECK: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); process.exit(1); }
}
const MINUTE = 60 * 1000;
function make(intervalMs) {
  let sent = 0;
  return { beat: createHeartbeat({ send: () => { sent++; }, intervalMs }), sent: () => sent };
}

same('the default interval is one minute', HEARTBEAT_INTERVAL_MS, MINUTE);

// Nothing happens, nothing is sent
{ const { beat, sent } = make();
  for (let t = 0; t <= 10 * MINUTE; t += 1000) beat.tick(t);
  same('an idle tab sends nothing in ten minutes', sent(), 0); }

// The first activity is sent at once
{ const { beat, sent } = make();
  same('the first activity sends right away', beat.activity(5000), true);
  same('and that was one heartbeat', sent(), 1); }

// Throttled to the interval
{ const { beat, sent } = make();
  beat.activity(0);
  same('more activity 1 second later is held back', beat.activity(1000), false);
  same('and 59.999 seconds later still', beat.activity(MINUTE - 1), false);
  same('only one heartbeat so far', sent(), 1);
  same('the held-back heartbeat goes out on the next tick at one minute', beat.tick(MINUTE), true);
  same('two heartbeats now', sent(), 2);
  same('and nothing more without new activity', beat.tick(2 * MINUTE), false);
  same('still two', sent(), 2); }

// A busy table never sends faster than the interval
{ const { beat, sent } = make();
  for (let t = 0; t < 10 * MINUTE; t += 100) { beat.activity(t); beat.tick(t); }
  same('ten minutes of constant activity is at most one heartbeat a minute (10 sent)', sent(), 10); }

// Activity exactly at the interval counts
{ const { beat, sent } = make();
  beat.activity(0);
  same('activity exactly one interval later is sent', beat.activity(MINUTE), true);
  same('two heartbeats', sent(), 2); }

// A hidden tab sends nothing, even with activity pending
{ const { beat, sent } = make();
  beat.setVisible(false, 0);
  same('activity in a hidden tab is not sent', beat.activity(10 * MINUTE), false);
  same('nor on a tick', beat.tick(20 * MINUTE), false);
  same('nothing sent while hidden', sent(), 0);
  same('coming back to the tab counts as activity and sends', beat.setVisible(true, 21 * MINUTE), true);
  same('one heartbeat', sent(), 1); }

// Coming back to a tab counts as activity even when nothing was pending (someone returns from another window)
{ const { beat, sent } = make();
  beat.activity(0);
  beat.setVisible(false, 1000);
  same('nothing is pending after a heartbeat and a hide', beat.state().pending, false);
  same('showing the tab again after the interval sends a heartbeat', beat.setVisible(true, 5 * MINUTE), true);
  same('two heartbeats in all', sent(), 2); }

// Hiding a tab does not lose what happened before it
{ const { beat, sent } = make();
  beat.activity(0);
  beat.activity(1000); // held back
  beat.setVisible(false, 2000);
  same('the held-back heartbeat is not sent while hidden', beat.tick(2 * MINUTE), false);
  same('but it is sent when the tab is shown again', beat.setVisible(true, 3 * MINUTE), true);
  same('two heartbeats in all', sent(), 2); }

// Showing an already visible tab again is just activity, still throttled
{ const { beat, sent } = make();
  beat.activity(0);
  same('showing the tab again within the interval is held back', beat.setVisible(true, 1000), false);
  same('one heartbeat', sent(), 1); }

// A failed send (offline) is retried on the next tick
{ const { beat, sent } = make();
  beat.activity(0);
  beat.sendFailed();
  same('after a failure the next tick retries at once, even inside the interval', beat.tick(1000), true);
  same('two attempts', sent(), 2);
  same('and then it waits the interval again', beat.activity(2000), false); }

// A refused-as-too-soon send is NOT reported as a failure: the caller does not call sendFailed(), so it just waits
{ const { beat, sent } = make();
  beat.activity(0);
  same('with no failure reported nothing is retried inside the interval', beat.tick(30 * 1000), false);
  same('one attempt', sent(), 1); }

// A custom interval
{ const { beat, sent } = make(10 * 1000);
  beat.activity(0);
  same('a ten-second interval holds back at 9.999 s', beat.activity(9999), false);
  same('and sends at ten seconds', beat.activity(10000), true);
  same('two heartbeats', sent(), 2); }

// state() reports what the page may want to show
{ const { beat } = make();
  same('state starts visible and not pending', JSON.stringify(beat.state()), JSON.stringify({ lastSentAt: null, pending: false, visible: true }));
}

console.log(`All ${checks} heartbeat checks passed.`);
