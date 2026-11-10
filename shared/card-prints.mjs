// All the printings of one card, for choosing which art a deck uses. Plain JavaScript with no browser or network code, so Node tests can load it (scripts/test-card-prints.mjs).
//
// The card list build writes them as small files grouped by card (the per-set files of shared/printings.mjs go the other way, from a set and a number to a card). A card's name picks the file:
//   /data/prints/XX.json    where XX is the first two characters of the card's key (shared/printings.mjs cardKey), 256 files; a file is { "Sol Ring": [["cmm", "410", "<printing id>", "2023"], ...] }, the last being the year the printing came out
//                           the printings newest first, then by set code and number, paper only, English (or the card's other language when it has no English printing), no placeholder pictures
//   /data/prints/sets.json  { "cmm": ["Commander Masters", "2023-08-04"], ... } the name and release date of every set that appears
// The name is the card's real English name, as in the card list. A file is only fetched when someone opens a card's printings, and only that one (about 9 KB compressed).
import { cardKey, SET_CODE } from './printings.mjs';

export const PRINTS_PATH = '/data/prints';
export const SETS_FILE = 'sets.json';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const YEAR = /^\d{4}$/;
export const MAX_NAME = 200;

// The file a card's printings are in (two hex characters), and its address.
export const shardOf = (name) => cardKey(name).slice(0, 2);
export const shardUrl = (name) => (typeof name === 'string' && name.length > 0 && name.length <= MAX_NAME ? `${PRINTS_PATH}/${shardOf(name)}.json` : null);
export const shardFileName = (shard) => (typeof shard === 'string' && /^[0-9a-f]{2}$/.test(shard) ? `${shard}.json` : null);
export const setsUrl = () => `${PRINTS_PATH}/${SETS_FILE}`;

// One printing row as the page uses it: { set, number, id, year }, or null for a row that is not one (never trust what came over the network).
export function readRow(row) {
  if (!Array.isArray(row) || row.length !== 4) return null;
  const [set, number, id, year] = row;
  if (typeof set !== 'string' || !SET_CODE.test(set) || typeof number !== 'string' || number.length === 0 || number.length > 30 || /[\s/\\]/.test(number) || typeof id !== 'string' || !UUID.test(id) || typeof year !== 'string' || !YEAR.test(year)) return null;
  return { set, number, id, year };
}

// The printings of a card from a parsed shard: [{ set, number, id, year }] in the file's order (newest first), the bad rows dropped; [] when the card is not in it.
export function printingsOf(shard, name) {
  if (!shard || typeof shard !== 'object' || Array.isArray(shard) || typeof name !== 'string' || !Object.hasOwn(shard, name) || !Array.isArray(shard[name])) return [];
  return shard[name].map(readRow).filter(Boolean);
}

// A set's name and year from the parsed sets file, or { name: code upper-cased, year: '' } for a set it does not know (so a row always has words).
export function setInfo(sets, code) {
  const entry = sets && typeof sets === 'object' && Object.hasOwn(sets, code) ? sets[code] : null;
  if (Array.isArray(entry) && typeof entry[0] === 'string' && entry[0].length > 0 && entry[0].length <= 100) return { name: entry[0], year: typeof entry[1] === 'string' && DATE.test(entry[1]) ? entry[1].slice(0, 4) : '' };
  return { name: String(code).toUpperCase(), year: '' };
}

// The checks a build makes before it publishes the files. prints: { sets, cards }, cards being { name: [row, ...] } in name order. Returns a list of problems; empty means fine.
export function validatePrints(prints, { minCards = 20000, minRows = 80000, previousRows = null, maxShrink = 0.05 } = {}) {
  if (!prints || typeof prints !== 'object' || !prints.cards || !prints.sets || Array.isArray(prints.cards) || Array.isArray(prints.sets)) return ['the printings by card are not { sets, cards }'];
  const problems = [];
  const names = Object.keys(prints.cards);
  let rows = 0; let badRows = 0; let badNames = 0; let unknownSets = 0; let unordered = 0; let empty = 0;
  for (const name of names) {
    if (name.length === 0 || name.length > MAX_NAME) badNames++;
    const list = prints.cards[name];
    if (!Array.isArray(list) || list.length === 0) { empty++; continue; }
    for (const row of list) {
      rows++;
      const read = readRow(row);
      if (!read) { badRows++; continue; }
      if (!Object.hasOwn(prints.sets, read.set)) unknownSets++;
    }
  }
  for (const code of Object.keys(prints.sets)) {
    const entry = prints.sets[code];
    if (!SET_CODE.test(code) || !Array.isArray(entry) || typeof entry[0] !== 'string' || entry[0].length === 0 || entry[0].length > 100 || !DATE.test(entry[1] ?? '')) problems.push(`the set ${JSON.stringify(code)} has a damaged name or date`);
  }
  if (names.length < minCards) problems.push(`only ${names.length} cards have printings, fewer than the minimum of ${minCards}`);
  if (rows < minRows) problems.push(`only ${rows} printings by card, fewer than the minimum of ${minRows}`);
  if (previousRows && rows < previousRows * (1 - maxShrink)) problems.push(`${rows} printings by card is more than ${maxShrink * 100}% fewer than the last good build (${previousRows})`);
  if (badRows) problems.push(`${badRows} printing rows are not a set, a number, a printing id and a year`);
  if (badNames) problems.push(`${badNames} card names are empty or too long`);
  if (empty) problems.push(`${empty} cards have no printings listed`);
  if (unknownSets) problems.push(`${unknownSets} printings are in a set the sets file does not have`);
  for (let index = 1; index < names.length; index++) if (names[index - 1] > names[index]) unordered++;
  if (unordered) problems.push('the cards are out of order');
  return problems.slice(0, 20);
}

export const countPrints = (prints) => ({ cards: Object.keys(prints.cards).length, rows: Object.values(prints.cards).reduce((sum, list) => sum + list.length, 0), sets: Object.keys(prints.sets).length });

// Splits { sets, cards } into the files that are published: { shards: { XX: { name: rows } }, sets }. Names stay in their order inside a file.
export function splitPrints(prints) {
  const shards = {};
  for (const name of Object.keys(prints.cards)) {
    const shard = shardOf(name);
    (shards[shard] ??= {})[name] = prints.cards[name];
  }
  return { shards, sets: prints.sets };
}
