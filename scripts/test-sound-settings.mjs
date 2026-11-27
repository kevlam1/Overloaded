// Tests for shared/sound-settings.mjs: the defaults, reading damaged text, and what each setting means for the volume.
import { SOUND_KEY, DEFAULT_SOUND, SOUND_FILES, SOUND_GAIN, SOUND_PEAK_DB, readSoundSettings, writeSoundSettings, soundVolume, soundLevel } from '../shared/sound-settings.mjs';

let checks = 0;
const same = (label, actual, expected) => {
  checks++;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) { console.log(`FAILED CHECK: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); process.exit(1); }
};

same('the key', SOUND_KEY, 'overloaded.sound');
same('sound is on by default at a volume of 1', DEFAULT_SOUND, { on: true, volume: 1 });
same('the sounds and their files', SOUND_FILES, { draw: '/sfx/draw.mp3', shuffle: '/sfx/shuffle.mp3', tap: '/sfx/tap.mp3', yourturn: '/sfx/yourturn.mp3', 'commander-boom': '/sfx/commander-play-impact-bass-boom.mp3', 'commander-piano': '/sfx/commander-play-piano-hit.mp3', 'commander-smash': '/sfx/commander-play-smash.mp3' });
same('the gain of each sound (chosen so all have the same average level, see the note in sound-settings.mjs)', SOUND_GAIN, { draw: 0.389, shuffle: 0.38, tap: 3.98, yourturn: 0.184, 'commander-boom': 0.0457, 'commander-piano': 0.0646, 'commander-smash': 0.0955 });
same('no sound clips at 100%: every peak stays under -3 dBFS', Object.keys(SOUND_PEAK_DB).every((name) => SOUND_PEAK_DB[name] + 20 * Math.log10(SOUND_GAIN[name]) < -3), true);
// the files' measured average levels in dBFS (decoded in a browser on 2026-11-06): with each gain the four come out within half a dB of each other
const AVERAGE_DB = { draw: -31.4, shuffle: -31.2, tap: -51.6, yourturn: -24.9, 'commander-boom': -12.8, 'commander-piano': -15.8, 'commander-smash': -19.2 }; // (the commander sounds measured 2026-11-26)
const atFull = Object.keys(AVERAGE_DB).map((name) => AVERAGE_DB[name] + 20 * Math.log10(SOUND_GAIN[name]));
same('at a slider of 100% all four sounds have the same average level to within half a dB', Math.max(...atFull) - Math.min(...atFull) < 0.5, true);
same('...and that level is -39.6 dBFS, 12 dB louder than before', Math.abs(Math.max(...atFull) + 39.6) < 0.3, true);
same('every sound with a file has a gain and the other way round', Object.keys(SOUND_GAIN).sort(), Object.keys(SOUND_FILES).sort());

// nothing stored, or text that is not settings, gives the defaults
for (const [label, text] of [['nothing', undefined], ['null', null], ['empty text', ''], ['not JSON', 'hello'], ['broken JSON', '{"on":'], ['a number', '5'], ['an array', '[1,2]'], ['the word null', 'null'], ['a string', '"on"'], ['a number as text', 5]]) {
  same(`${label} gives the defaults`, readSoundSettings(text), { on: true, volume: 1 });
}
same('good settings are read', readSoundSettings('{"on":false,"volume":0.3}'), { on: false, volume: 0.3 });
same('off stays off', readSoundSettings('{"on":false}'), { on: false, volume: 1 });
same('a missing on is the default (on)', readSoundSettings('{"volume":0.2}'), { on: true, volume: 0.2 });
same('on as text is damaged: the default', readSoundSettings('{"on":"false","volume":0.4}'), { on: true, volume: 0.4 });
same('on as a number is damaged: the default', readSoundSettings('{"on":0,"volume":0.4}'), { on: true, volume: 0.4 });
same('volume 0 is kept (a silent setting)', readSoundSettings('{"on":true,"volume":0}'), { on: true, volume: 0 });
same('volume 1 is kept', readSoundSettings('{"volume":1}'), { on: true, volume: 1 });
same('a volume over 1 is cut to 1', readSoundSettings('{"volume":7}'), { on: true, volume: 1 });
same('a negative volume is cut to 0', readSoundSettings('{"volume":-3}'), { on: true, volume: 0 });
same('a volume as text is damaged: the default', readSoundSettings('{"volume":"0.2"}'), { on: true, volume: 1 });
same('a volume of null is damaged: the default', readSoundSettings('{"volume":null}'), { on: true, volume: 1 });
same('a volume of true is damaged: the default', readSoundSettings('{"volume":true}'), { on: true, volume: 1 });
same('a volume with many decimals is rounded to two', readSoundSettings('{"volume":0.123456}'), { on: true, volume: 0.12 });
same('other fields are dropped', readSoundSettings('{"on":true,"volume":0.5,"evil":"<img>","__proto__":{"on":false}}'), { on: true, volume: 0.5 });

// writing: cleaned the same way, and reading it back gives the same settings
same('writing good settings', writeSoundSettings({ on: false, volume: 0.35 }), '{"on":false,"volume":0.35}');
same('writing nothing writes the defaults', writeSoundSettings(undefined), '{"on":true,"volume":1}');
same('writing a bad volume writes the default volume', writeSoundSettings({ on: true, volume: 'loud' }), '{"on":true,"volume":1}');
same('writing a volume over 1 writes 1', writeSoundSettings({ on: true, volume: 9 }), '{"on":true,"volume":1}');
same('writing extra fields drops them', writeSoundSettings({ on: true, volume: 0.5, extra: 1 }), '{"on":true,"volume":0.5}');
for (const settings of [{ on: true, volume: 0.7 }, { on: false, volume: 0 }, { on: true, volume: 1 }, { on: false, volume: 0.45 }]) {
  same(`written then read gives the same settings (${JSON.stringify(settings)})`, readSoundSettings(writeSoundSettings(settings)), settings);
}

// what the settings mean for the volume
same('on at 0.7 plays at 0.7', soundVolume({ on: true, volume: 0.7 }), 0.7);
same('off plays at 0 whatever the volume', soundVolume({ on: false, volume: 1 }), 0);
same('on at volume 0 plays at 0', soundVolume({ on: true, volume: 0 }), 0);

// how loud a named sound plays: the slider times the sound's own gain
same('at the default slider (100%) a sound plays at its gain', soundLevel(DEFAULT_SOUND, 'draw'), 0.389);
same('every sound plays at its own gain at the default', Object.keys(SOUND_FILES).map((name) => soundLevel(DEFAULT_SOUND, name)), [0.389, 0.38, 3.98, 0.184, 0.0457, 0.0646, 0.0955]);
same('a slider at 50% plays a sound at half its gain', soundLevel({ on: true, volume: 0.5 }, 'tap'), 1.99);
same('a slider at 0 plays nothing', soundLevel({ on: true, volume: 0 }, 'tap'), 0);
same('Sound off plays nothing at any slider', soundLevel({ on: false, volume: 1 }, 'yourturn'), 0);
same('an unknown sound name has no gain of its own: the slider as it is', soundLevel({ on: true, volume: 0.4 }, 'nothing'), 0.4);
same('a name from the prototype is not a gain', soundLevel({ on: true, volume: 1 }, 'toString'), 1);
same('a slider at 50% plays draw at half its gain', soundLevel({ on: true, volume: 0.5 }, 'draw'), 0.1945);

console.log(`All ${checks} sound settings checks passed.`);
