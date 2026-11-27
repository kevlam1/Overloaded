// The effects settings and when a commander effect is due: plain data, no browser code, so Node tests can load it (frontend/src/vfx.js draws the effects with anime.js).
// Kevin, 2026-11-26: an effect when a commander is played, with one of his three commander sounds, seen by every player at the table, and a hop when the hand is sorted.
// The settings are kept in this browser only, never sent: each player chooses what THEY see and hear.
export const EFFECTS_KEY = 'overloaded.effects';
export const COMMANDER_SOUNDS = { random: 'Random', boom: 'Boom', piano: 'Piano', smash: 'Smash', off: 'None' };
export const DEFAULT_EFFECTS = { on: true, commanderSound: 'random' };

// Settings from the text kept in the browser, or from nothing: always a complete { on, commanderSound }; a damaged field falls back to its default.
export function readEffects(text) {
  let raw = null;
  try { raw = typeof text === 'string' ? JSON.parse(text) : null; } catch { raw = null; }
  const object = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    on: typeof object.on === 'boolean' ? object.on : DEFAULT_EFFECTS.on,
    commanderSound: Object.hasOwn(COMMANDER_SOUNDS, object.commanderSound) ? object.commanderSound : DEFAULT_EFFECTS.commanderSound,
  };
}
export const writeEffects = (settings) => JSON.stringify(readEffects(JSON.stringify(settings ?? {})));

// The sound a commander plays (a name in SOUND_FILES of shared/sound-settings.mjs), or null for none. `random` is a number from 0 up to 1 (Math.random), passed in so tests can choose.
const PICKABLE = ['boom', 'piano', 'smash'];
export function commanderSoundFor(settings, random = Math.random()) {
  const choice = readEffects(JSON.stringify(settings ?? {})).commanderSound;
  if (choice === 'off') return null;
  const name = choice === 'random' ? PICKABLE[Math.min(PICKABLE.length - 1, Math.floor(random * PICKABLE.length))] : choice;
  return `commander-${name}`;
}

// The cards that went from the command zone to the battlefield between two snapshots of one player's zones ({ command: [...], battlefield: [...] }, cards with a uid).
// That is how every page knows a commander was played, its own and the other players' alike: no field is written for it, so the database rules need no change.
// A card that was already on the battlefield, or that comes from anywhere else, is not one. A missing snapshot (the page has just loaded) gives none.
export function commanderArrivals(before, after) {
  if (!before || !after) return [];
  const wasCommand = new Set((before.command ?? []).map((card) => card?.uid));
  const wasField = new Set((before.battlefield ?? []).map((card) => card?.uid));
  return (after.battlefield ?? []).filter((card) => card && wasCommand.has(card.uid) && !wasField.has(card.uid)).map((card) => card.uid);
}
