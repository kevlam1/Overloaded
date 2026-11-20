// Tests for shared/turn-clock.mjs: the clock text, the time a turn has taken, and the page's memory of the turn. Run: node scripts/test-turn-clock.mjs
import { TURN_CLOCK_KEY, readTurnClockSetting, clockText, turnElapsed, observeTurn } from '../shared/turn-clock.mjs';

let checks = 0;
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) { console.log(`FAILED CHECK: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); process.exit(1); } };

same('the setting is on until it is turned off', [readTurnClockSetting(null), readTurnClockSetting(undefined), readTurnClockSetting('1'), readTurnClockSetting('0'), readTurnClockSetting('junk')], [true, true, true, false, true]);
same('the setting is kept under its own key', TURN_CLOCK_KEY, 'overloaded.turnClock');
same('the clock reads minutes and seconds, then hours', [0, 999, 1000, 59999, 60000, 754000, 3599999, 3600000, 3723000].map(clockText), ['0:00', '0:00', '0:01', '0:59', '1:00', '12:34', '59:59', '1:00:00', '1:02:03']);
same('a time that is not a time reads 0:00', [-5, NaN, Infinity, null, undefined, 'x'].map(clockText), Array(6).fill('0:00'));

// the turn started at database time 10000; this computer is 500 ms behind the database
same('with the database time of the pass, the turn has taken now plus the offset minus that time', turnElapsed({ at: 10000, serverOffset: 500, seenAt: 99999, now: 12000 }), 2500);
same('it never reads less than 0 (a computer a little ahead)', turnElapsed({ at: 10000, serverOffset: 0, now: 9000 }), 0);
same('with no database time, it counts from when this page first saw the turn', turnElapsed({ at: null, serverOffset: 500, seenAt: 11000, now: 12000 }), 1000);
same('with a database time but the offset not known yet, it counts from when this page saw the turn', turnElapsed({ at: 10000, serverOffset: null, seenAt: 11000, now: 12000 }), 1000);
same('with nothing to go on it is 0', turnElapsed({ now: 12000 }), 0);
same('a time that is not a whole positive number is not used', [0, -1, 1.5, '10'].map((at) => turnElapsed({ at, serverOffset: 0, seenAt: 11000, now: 12000 })), [1000, 1000, 1000, 1000]);

const first = observeTurn(null, { key: '1:2', at: null }, 5000);
same('a turn seen for the first time starts counting from now', first, { key: '1:2', at: null, seenAt: 5000 });
same('seeing the same turn again changes nothing', observeTurn(first, { key: '1:2', at: null }, 9000), first);
same('the database time of the same turn, when it arrives, is kept (the page counts from it then)', observeTurn(first, { key: '1:2', at: 777 }, 9000), { key: '1:2', at: 777, seenAt: 5000 });
same('...and is not replaced by a later one for the same turn', observeTurn({ key: '1:2', at: 777, seenAt: 5000 }, { key: '1:2', at: 888 }, 9000).at, 777);
same('another turn, or the same number in another match, starts again from now', [observeTurn(first, { key: '1:3', at: null }, 9000), observeTurn(first, { key: '2:2', at: 5 }, 9000)], [{ key: '1:3', at: null, seenAt: 9000 }, { key: '2:2', at: 5, seenAt: 9000 }]);
same('the old state is never changed', (() => { const state = Object.freeze({ key: '1:2', at: null, seenAt: 1 }); observeTurn(state, { key: '1:2', at: 5 }, 2); observeTurn(state, { key: '9:9' }, 2); return state; })(), { key: '1:2', at: null, seenAt: 1 });

console.log(`All ${checks} turn clock checks passed.`);
