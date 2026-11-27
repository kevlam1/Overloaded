// Tests for shared/effects.mjs: the settings, which commander sound plays, and when a commander was played.
import { EFFECTS_KEY, DEFAULT_EFFECTS, readEffects, writeEffects, commanderSoundFor, commanderArrivals } from '../shared/effects.mjs';
import { SOUND_FILES } from '../shared/sound-settings.mjs';

let checks = 0;
const same = (label, actual, expected) => {
  checks++;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) { console.log(`FAILED CHECK: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); process.exit(1); }
};

same('the key', EFFECTS_KEY, 'overloaded.effects');
same('nothing kept: the defaults (on, a random commander sound)', readEffects(null), DEFAULT_EFFECTS);
same('damaged text: the defaults', readEffects('{nope'), DEFAULT_EFFECTS);
same('a bad field falls back alone', readEffects('{"on":false,"commanderSound":"loud"}'), { on: false, commanderSound: 'random' });
same('written and read back', readEffects(writeEffects({ on: false, commanderSound: 'piano', extra: 1 })), { on: false, commanderSound: 'piano' });

same('None plays no sound', commanderSoundFor({ commanderSound: 'off' }), null);
same('a chosen sound', commanderSoundFor({ commanderSound: 'smash' }), 'commander-smash');
same('Random picks each of the three', [0, 0.4, 0.99].map((r) => commanderSoundFor({ commanderSound: 'random' }, r)), ['commander-boom', 'commander-piano', 'commander-smash']);
same('every sound it can pick has a file', ['boom', 'piano', 'smash'].every((name) => Object.hasOwn(SOUND_FILES, commanderSoundFor({ commanderSound: name }))), true);

const card = (uid) => ({ uid, n: uid });
const before = { command: [card('c1'), card('c2')], battlefield: [card('c9')] };
same('a commander moved from the command zone to the battlefield', commanderArrivals(before, { command: [card('c2')], battlefield: [card('c9'), card('c1')] }), ['c1']);
same('a card from the hand is not one', commanderArrivals(before, { command: before.command, battlefield: [card('c9'), card('c5')] }), []);
same('nothing moved: none', commanderArrivals(before, before), []);
same('a commander that went back to the command zone: none', commanderArrivals({ command: [], battlefield: [card('c1')] }, { command: [card('c1')], battlefield: [] }), []);
same('the first snapshot (the page has just loaded): none', commanderArrivals(null, before), []);
same('both partners at once', commanderArrivals(before, { command: [], battlefield: [card('c9'), card('c1'), card('c2')] }), ['c1', 'c2']);

console.log(`All ${checks} effects checks passed.`);
