// The sound settings and which file each sound is: plain data, no browser code, so Node tests can load it (the page's frontend/src/sound.js
// plays the files and draws the controls). The settings are kept in the browser only (a small piece of text), never sent to the database.
export const SOUND_KEY = 'overloaded.sound';
export const DEFAULT_SOUND = { on: true, volume: 1 }; // sound is on by default and the slider starts at 100% (Kevin, 2026-11-06)
// The sounds the pages know. The files are in frontend/public/sfx/ and served at /sfx/NAME.mp3 (credits.md there says where each came from).
export const SOUND_FILES = { draw: '/sfx/draw.mp3', shuffle: '/sfx/shuffle.mp3', tap: '/sfx/tap.mp3', yourturn: '/sfx/yourturn.mp3',
  'commander-boom': '/sfx/commander-play-impact-bass-boom.mp3', 'commander-piano': '/sfx/commander-play-piano-hit.mp3', 'commander-smash': '/sfx/commander-play-smash.mp3' };
// How loud each sound is at a slider of 100% (an audio element's volume, 0 to 1). The files differ a lot in loudness, so each has its own gain, chosen so that all
// four have the SAME average level, and quiet: about -51.6 dBFS at a slider of 100% (Kevin, 2026-11-06: even them out and lower them all, draw was still loud).
// Measured in a browser (average level of the whole file, dBFS) on 2026-11-06, after the last file swap (tap 17:42, draw 17:55, yourturn 17:57): draw -31.4, shuffle -31.2, tap -51.6, yourturn -24.9.
// The gain that gives -51.6 is 10 ^ ((-51.6 - average) / 20): draw 0.10, shuffle 0.095, tap 1, yourturn 0.047. A sound cannot have a gain above 1, so the quietest file
// (tap) sets the target; a louder tap file would allow a louder set. RE-MEASURE AND RECOMPUTE whenever a sound file is replaced.
// A short sharp click (draw) can still feel punchier than its average says. Change one number to tune one sound.
// The three commander sounds (Kevin added them 2026-11-26) measured the same way that day: boom -12.8, piano -15.8, smash -19.2 (and the four above measured again: unchanged),
// so they sit at the same level too: 0.0115, 0.0162, 0.024 (four digits: 0.011 put boom over half a dB off the rest).
// LOUDER (2026-11-26 feedback, measured 2026-11-27): the shared level is now -39.6 dBFS, 12 dB above -51.6, so every gain is 10 ^ ((-39.6 - average) / 20). Tap needs 3.98, above 1, so
// frontend/src/sound.js plays through a Web Audio gain node, not the audio element's volume. Peaks measured the same day (dBFS): draw -0.5, shuffle -5.7, tap -29.7, yourturn -4.1, boom -3,
// piano -0.1, smash -3.9; with these gains the loudest peak is draw at -8.7, so nothing clips.
export const SOUND_GAIN = { draw: 0.389, shuffle: 0.38, tap: 3.98, yourturn: 0.184, 'commander-boom': 0.0457, 'commander-piano': 0.0646, 'commander-smash': 0.0955 };
export const SOUND_PEAK_DB = { draw: -0.5, shuffle: -5.7, tap: -29.7, yourturn: -4.1, 'commander-boom': -3, 'commander-piano': -0.1, 'commander-smash': -3.9 };

const cleanVolume = (value) => (typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.min(1, Math.max(0, value)) * 100) / 100 : DEFAULT_SOUND.volume);

// Settings from the text kept in the browser, or from nothing: always a complete, valid { on, volume }. Anything damaged falls back to the default for
// that one field, and fields that are not settings are dropped.
export function readSoundSettings(text) {
  let raw = null;
  try { raw = typeof text === 'string' ? JSON.parse(text) : null; } catch { raw = null; }
  const object = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return { on: typeof object.on === 'boolean' ? object.on : DEFAULT_SOUND.on, volume: cleanVolume(object.volume) };
}

// The text to keep for a settings object (cleaned the same way it is read).
export function writeSoundSettings(settings) {
  const clean = readSoundSettings(JSON.stringify(settings ?? {}));
  return JSON.stringify({ on: clean.on, volume: clean.volume });
}

// How loud a sound plays: 0 when sound is off. At 0 the page plays nothing at all.
export const soundVolume = (settings) => (settings.on ? settings.volume : 0);

// How loud a named sound plays: the slider (or 0 when Sound is off) times that sound's own gain. 0 means play nothing.
export const soundLevel = (settings, name) => soundVolume(settings) * (Object.hasOwn(SOUND_GAIN, name) ? SOUND_GAIN[name] : 1);
