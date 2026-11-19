// The exact printings of cards: the format of the per-set files (/data/printings/set-CODE.json) that the card list build
// writes and the deck page reads. Plain JavaScript with no browser or network code, so Node tests can load it.
//
// A set file maps a collector number to one printing: { "410": "<printing id><card key>" }. The id is Scryfall's id of that
// printing (its picture address is built from it, see shared/card-image.mjs). The card key is 4 hex characters made from the
// card's NAME, so the page can refuse a printing that belongs to a different card (a set and number that point at another
// card would otherwise show the wrong picture). It uses the name, not an id: the list's default ids change from week to week
// (162 changed in three days), names almost never do. Set files are named "set-CODE.json" and not "CODE.json" because
// Windows cannot create a file called con.json (Scryfall has a set with the code "con").
import { readFoilSuffix, DEFAULT_FINISHES, TRADITIONAL } from './foil-kinds.mjs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const SET_CODE = /^[a-z0-9]{3,6}$/; // Scryfall set codes, checked on 119,203 printings on 2026-10-26
export const KEY_LENGTH = 4;
export const PRINTINGS_PATH = '/data/printings';

// FNV-1a over the name's UTF-16 code units, the low 16 bits as 4 hex characters.
export function cardKey(name) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < String(name).length; index++) {
    hash ^= String(name).charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash & 0xffff).toString(16).padStart(KEY_LENGTH, '0');
}

// A printing that is not the usual "nonfoil and foil, traditional" has a foil suffix of one or two characters after the key (shared/foil-kinds.mjs): the finishes it comes in and, for a special foil, its kind.
export const printingValue = (id, name, suffix = '') => `${id}${cardKey(name)}${suffix}`;

// A stored value back to { id, key } plus, when it has a suffix, { finishes (bits), foilOnly: true when it has no nonfoil finish, kind (only for a special foil) }; or null when it is not one (never trust what came over the network).
export function readPrintingValue(value) {
  if (typeof value !== 'string' || value.length < 36 + KEY_LENGTH || value.length > 36 + KEY_LENGTH + 2) return null;
  const id = value.slice(0, 36);
  const key = value.slice(36, 36 + KEY_LENGTH);
  const suffix = value.slice(36 + KEY_LENGTH);
  const foil = readFoilSuffix(suffix);
  if (!foil || !UUID.test(id) || !/^[0-9a-f]{4}$/.test(key)) return null;
  return { id, key, ...(suffix ? { finishes: foil.finishes, ...(foil.foilOnly ? { foilOnly: true } : {}), ...(foil.kind !== TRADITIONAL ? { kind: foil.kind } : {}) } : {}) };
}

// Where a set's file is, or null for anything that is not a set code (so no other address can be built from typed text).
export const setFileUrl = (set) => (typeof set === 'string' && SET_CODE.test(set) ? `${PRINTINGS_PATH}/set-${set}.json` : null);
export const setFileName = (set) => (typeof set === 'string' && SET_CODE.test(set) ? `set-${set}.json` : null);

// The printing a typed set code and number name for this card, or null: no file for the set, no such number, a value that
// is not well formed, or a printing of another card. `file` is the parsed set file (or null when there is none).
// Set codes are lowercase in Scryfall's data and in the files; collector numbers are matched exactly as text.
export function findPrintingInfo(file, number, cardName) {
  if (!file || typeof file !== 'object' || typeof number !== 'string' || !Object.hasOwn(file, number)) return null;
  const printing = readPrintingValue(file[number]);
  return printing && printing.key === cardKey(cardName) ? { id: printing.id, foilOnly: printing.foilOnly === true, finishes: printing.finishes ?? DEFAULT_FINISHES, kind: printing.kind ?? TRADITIONAL } : null;
}
// The finishes and foil kind of the printing with this id: { foilOnly, finishes, kind }, looked up in the set files that are loaded (a printing is stored by its set and number, so there is no way to ask by id alone); null when its set is not among them.
export function foilInfoById(id, files) {
  if (typeof id !== 'string' || !(files instanceof Map)) return null;
  for (const file of files.values()) {
    if (!file || typeof file !== 'object') continue;
    for (const value of Object.values(file)) if (typeof value === 'string' && value.startsWith(id)) { const printing = readPrintingValue(value); if (printing && printing.id === id) return { foilOnly: printing.foilOnly === true, finishes: printing.finishes ?? DEFAULT_FINISHES, kind: printing.kind ?? TRADITIONAL }; }
  }
  return null;
}
// Is the printing with this id foil only? false when its set is not among the loaded files.
export const foilOnlyById = (id, files) => foilInfoById(id, files)?.foilOnly === true;
export const findPrinting = (file, number, cardName) => findPrintingInfo(file, number, cardName)?.id ?? null;
