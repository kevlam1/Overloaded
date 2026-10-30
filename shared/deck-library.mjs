// Several saved decks, kept in this browser. Plain JavaScript with no browser or network code, so Node tests can load it.
// A saved deck keeps the shape and the strict reader of shared/deck-preview.mjs (readSavedDeck); this only wraps up to
// MAX_DECKS of them: each with an id, the format it is for and, if the player chose one, a bracket (1 to 5, the same values the
// table accepts; an entry with no `bracket` has none), and which one is selected (the deck the solo table plays and,
// later, the lobby offers). Saving a deck with the same name replaces that deck. The old single deck (LEGACY_KEY) is read once
// as the first deck of a library that does not exist yet; once the library exists the old key is never read again, so a deck
// that was deleted cannot come back.
import { readSavedDeck } from './deck-preview.mjs';
import { FORMATS, FORMAT_TITLES } from './formats.mjs';
import { BRACKETS } from './deck-fields.mjs';

// The list of formats lives in formats.mjs (the lobby uses it too); re-exported so the deck code keeps one import.
export { FORMATS, FORMAT_TITLES };
export const LIBRARY_KEY = 'overloaded.decks';
export const LEGACY_KEY = 'overloaded.deck';
export const LIBRARY_VERSION = 1;
export const MAX_DECKS = 20;
const ID = /^d[a-z0-9]{10}$/;

function secureBytes(count) {
  const bytes = new Uint8Array(count);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

// A deck's id: "d" and 10 lowercase letters or digits. bytes(n) gives n random bytes (the secure source by default).
export function newDeckId(bytes = secureBytes) {
  return `d${Array.from(bytes(10), (byte) => (byte % 36).toString(36)).join('')}`;
}

// The format a saved deck is for when nobody chose: Commander when it has a commander, otherwise Standard.
export const formatOf = (deck) => (deck.commander.length > 0 ? 'commander' : 'standard');

export const emptyLibrary = () => ({ version: LIBRARY_VERSION, selected: null, decks: [] });

const damaged = (skipped = 0) => ({ library: emptyLibrary(), source: 'damaged', skipped });

// What comes back out of the browser's storage. raw: the text under LIBRARY_KEY, legacyRaw: the text under LEGACY_KEY (null for
// nothing). Returns { library, source, skipped }: source is 'library', 'legacy' (made from the old single deck), 'empty' or
// 'damaged' (something was there and could not be read; the library is empty). One deck that cannot be read is dropped and
// counted in skipped; the others are kept. Anything that is not a deck is never repaired, only dropped.
export function readLibrary(raw, legacyRaw = null, newId = newDeckId) {
  if (raw !== null && raw !== undefined) {
    let parsed;
    try { parsed = JSON.parse(raw); } catch { return damaged(); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || parsed.version !== LIBRARY_VERSION) return damaged();
    if (!Array.isArray(parsed.decks) || parsed.decks.length > MAX_DECKS) return damaged();
    const decks = [];
    const ids = new Set();
    let skipped = 0;
    for (const entry of parsed.decks) {
      const deck = entry && typeof entry === 'object' ? readSavedDeck(JSON.stringify(entry.deck)) : null;
      const bracketOk = entry?.bracket === undefined || BRACKETS.includes(entry.bracket);
      if (!deck || typeof entry.id !== 'string' || !ID.test(entry.id) || ids.has(entry.id) || !FORMATS.includes(entry.format) || !bracketOk) { skipped++; continue; }
      ids.add(entry.id);
      decks.push({ id: entry.id, format: entry.format, ...(entry.bracket === undefined ? {} : { bracket: entry.bracket }), deck });
    }
    const selected = typeof parsed.selected === 'string' && ids.has(parsed.selected) ? parsed.selected : (decks[0]?.id ?? null);
    return { library: { version: LIBRARY_VERSION, selected, decks }, source: 'library', skipped };
  }
  if (legacyRaw !== null && legacyRaw !== undefined) {
    const deck = readSavedDeck(legacyRaw);
    if (!deck) return damaged(1);
    const id = newId();
    return { library: { version: LIBRARY_VERSION, selected: id, decks: [{ id, format: formatOf(deck), deck }] }, source: 'legacy', skipped: 0 };
  }
  return { library: emptyLibrary(), source: 'empty', skipped: 0 };
}

export const serializeLibrary = (library) => JSON.stringify(library);

// The deck that is selected, as { id, format, bracket?, deck }, or null.
export const selectedEntry = (library) => library.decks.find((entry) => entry.id === library.selected) ?? null;
export const decksOfFormat = (library, format) => library.decks.filter((entry) => entry.format === format);

function freshId(library, newId) {
  const taken = new Set(library.decks.map((entry) => entry.id));
  for (let attempt = 0; attempt < 20; attempt++) {
    const id = newId();
    if (!taken.has(id)) return id;
  }
  throw new Error('Could not make a new deck id.');
}

// Saves a deck (a saved deck as built by shared/deck-preview.mjs). A deck with the same name (capitals do not matter) is
// replaced where it is; otherwise the deck is added at the end, unless MAX_DECKS are saved. The saved deck becomes the selected
// one. Returns { ok: true, library, id, replaced } or { ok: false, error } in words for people. Never changes `library`.
export function addDeck(library, deck, { format = formatOf(deck), bracket = null, newId = newDeckId } = {}) {
  if (!FORMATS.includes(format)) return { ok: false, error: 'Choose Commander or Standard for this deck.' };
  if (bracket !== null && !BRACKETS.includes(bracket)) return { ok: false, error: 'A bracket is a whole number from 1 to 5.' };
  const name = deck.name.toLowerCase();
  const at = library.decks.findIndex((entry) => entry.deck.name.toLowerCase() === name);
  if (at < 0 && library.decks.length >= MAX_DECKS) return { ok: false, error: `You can save up to ${MAX_DECKS} decks. Delete one first.` };
  const id = at >= 0 ? library.decks[at].id : freshId(library, newId);
  const entry = { id, format, ...(bracket === null ? {} : { bracket }), deck };
  const decks = at >= 0 ? library.decks.map((existing, index) => (index === at ? entry : existing)) : [...library.decks, entry];
  return { ok: true, library: { ...library, selected: id, decks }, id, replaced: at >= 0 };
}

// Takes a deck away. If it was the selected one, the first deck left is selected (or none).
export function removeDeck(library, id) {
  const decks = library.decks.filter((entry) => entry.id !== id);
  if (decks.length === library.decks.length) return library;
  return { ...library, selected: library.selected === id ? (decks[0]?.id ?? null) : library.selected, decks };
}

// Selects a deck. An id that is not in the library changes nothing.
export function selectDeck(library, id) {
  return library.decks.some((entry) => entry.id === id) ? { ...library, selected: id } : library;
}
