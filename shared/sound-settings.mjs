// The sound settings and which file each sound is: plain data, no browser code, so Node tests can load it (the page's frontend/src/sound.js
// plays the files and draws the controls). The settings are kept in the browser only (a small piece of text), never sent to the database.
export const SOUND_KEY = 'overloaded.sound';
export const DEFAULT_SOUND = { on: true, volume: 1 }; // sound is on by default and the slider starts at 100% (Kevin, 2026-11-06)
// The sounds the pages know. The files are in frontend/public/sfx/ and served at /sfx/NAME.mp3 (credits.md there says where each came from).
export const SOUND_FILES = { draw: '/sfx/draw.mp3', shuffle: '/sfx/shuffle.mp3', tap: '/sfx/tap.mp3', yourturn: '/sfx/yourturn.mp3' };
// How loud each sound is at a slider of 100%: every sound plays at 50% of the slider (Kevin, 2026-11-06). Change one number to tune one sound.
export const SOUND_GAIN = { draw: 0.5, shuffle: 0.5, tap: 0.5, yourturn: 0.5 };

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
