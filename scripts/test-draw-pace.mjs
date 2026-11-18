// Tests for shared/draw-pace.mjs: the pause between the cards of Draw X.
import { drawPause, BASE_PAUSE_MS, MIN_PAUSE_MS } from '../shared/draw-pace.mjs';

let checks = 0;
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) { console.log(`FAILED CHECK: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); process.exit(1); } };

same('the first 10 cards come at the normal pace', [1, 5, 10].map(drawPause), [140, 140, 140]);
same('from the 11th card the pace is faster, and it stays the same for 5 cards', [11, 12, 15].map(drawPause), [98, 98, 98]);
same('and faster again at the 16th, the 21st and the 26th', [16, 20, 21, 26].map(drawPause), [69, 69, 48, 34]);
same('it never gets faster than the least pause', [31, 60, 400].map(drawPause), [MIN_PAUSE_MS, MIN_PAUSE_MS, MIN_PAUSE_MS]);
same('the pause only ever gets shorter', Array.from({ length: 80 }, (_, i) => drawPause(i + 1)).every((v, i, all) => i === 0 || v <= all[i - 1]), true);
same('a number that is not a card number gets the normal pace', [0, -3, 2.5, NaN, undefined, '12'].map(drawPause), Array(6).fill(BASE_PAUSE_MS));
console.log(`All ${checks} draw pace checks passed.`);
