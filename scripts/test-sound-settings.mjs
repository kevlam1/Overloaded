// Tests for shared/sound-settings.mjs: the defaults, reading damaged text, and what each setting means for the volume.
import { SOUND_KEY, DEFAULT_SOUND, SOUND_FILES, SOUND_GAIN, readSoundSettings, writeSoundSettings, soundVolume, soundLevel } from '../shared/sound-settings.mjs';

let checks = 0;
const same = (label, actual, expected) => {
  checks++;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) { console.log(`FAILED CHECK: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); process.exit(1); }
};

same('the key', SOUND_KEY, 'overloaded.sound');
same('sound is on by default at a volume of 1', DEFAULT_SOUND, { on: true, volume: 1 });
same('the four sounds and their files', SOUND_FILES, { draw: '/sfx/draw.mp3', shuffle: '/sfx/shuffle.mp3', tap: '/sfx/tap.mp3', yourturn: '/sfx/yourturn.mp3' });
same('every sound plays at half of the slider', SOUND_GAIN, { draw: 0.5, shuffle: 0.5, tap: 0.5, yourturn: 0.5 });
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
same('at the default slider (100%) a sound plays at 0.5', soundLevel(DEFAULT_SOUND, 'draw'), 0.5);
same('every sound plays at 0.5 at the default', Object.keys(SOUND_FILES).map((name) => soundLevel(DEFAULT_SOUND, name)), [0.5, 0.5, 0.5, 0.5]);
same('a slider at 30% plays at 0.15', soundLevel({ on: true, volume: 0.3 }, 'tap'), 0.15);
same('a slider at 0 plays nothing', soundLevel({ on: true, volume: 0 }, 'tap'), 0);
same('Sound off plays nothing at any slider', soundLevel({ on: false, volume: 1 }, 'yourturn'), 0);
same('an unknown sound name has no gain of its own: the slider as it is', soundLevel({ on: true, volume: 0.4 }, 'nothing'), 0.4);
same('a name from the prototype is not a gain', soundLevel({ on: true, volume: 1 }, 'toString'), 1);
same('a slider at 33% plays at 0.165', soundLevel({ on: true, volume: 0.33 }, 'draw'), 0.165);

console.log(`All ${checks} sound settings checks passed.`);
