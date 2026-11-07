// The sound settings and which file each sound is: plain data, no browser code, so Node tests can load it (the page's frontend/src/sound.js
// plays the files and draws the controls). The settings are kept in the browser only (a small piece of text), never sent to the database.
export const SOUND_KEY = 'overloaded.sound';
export const DEFAULT_SOUND = { on: true, volume: 0.7 }; // sound is on by default (Kevin, 2026-11-06)
// The sounds the pages know. The files are in frontend/public/sfx/ and served at /sfx/NAME.mp3 (credits.md there says where each came from).
export const SOUND_FILES = { draw: '/sfx/draw.mp3', shuffle: '/sfx/shuffle.mp3' };

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
