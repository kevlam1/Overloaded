// The rulings of a card, for the details window (Kevin, 2026-11-15: "rulings are found in card details"). Plain JavaScript with no browser or network code, so Node tests can load it
// (scripts/test-card-rulings.mjs). Scryfall publishes the rulings of every card in one bulk file (79,706 rulings on 20,080 cards on 2026-11-15, 5.4 MB to download); the card list build reads it with the
// others and writes them into small files grouped by card, the same way as the rules (shared/card-rules.mjs):
//   /data/rulings/XX.json   where XX is the first two characters of the card's key (the same 256 files and the same key as the rules), a file is { "Sol Ring": [["2004-10-04", "w", "text"], ...], ... }
// A row is [date, source, text]: the date as YYYY-MM-DD, the source "w" for Wizards of the Coast and "s" for Scryfall's own, and the ruling. Rows are in date order. Only cards that have rulings are in a file.
// The page never asks Scryfall for anything: the files are the site's own, and only the one file of the card being read is fetched (about 16 KB compressed).
import { shardOf, shardFileName } from './card-rules.mjs';

export const RULINGS_PATH = '/data/rulings';
export const MAX_NAME = 200;
export const MAX_RULING = 3000;
export const MAX_ROWS = 200;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SOURCES = { wotc: 'w', scryfall: 's' };
export const SOURCE_WORDS = { w: 'Wizards of the Coast', s: 'Scryfall' };

export { shardOf, shardFileName };
export const shardUrl = (name) => (typeof name === 'string' && name.length > 0 && name.length <= MAX_NAME ? `${RULINGS_PATH}/${shardOf(name)}.json` : null);

// One row from a Scryfall ruling record, or null when it is not one: { source, published_at, comment }.
export function rowFromRecord(record) {
  if (!record || typeof record.published_at !== 'string' || !DATE.test(record.published_at) || typeof record.comment !== 'string') return null;
  const text = record.comment.replace(/\s+/g, ' ').trim();
  if (text.length === 0) return null;
  return [record.published_at, SOURCES[record.source] ?? 's', text.slice(0, MAX_RULING)];
}

// A row as the page uses it: { date, source, words, text }, or null for a row that is not one (never trust what came over the network).
export function readRow(row) {
  if (!Array.isArray(row) || row.length !== 3) return null;
  const [date, source, text] = row;
  if (typeof date !== 'string' || !DATE.test(date) || !Object.hasOwn(SOURCE_WORDS, source) || typeof text !== 'string' || text.length === 0 || text.length > MAX_RULING) return null;
  return { date, source, words: SOURCE_WORDS[source], text };
}

// The rulings of a card from a parsed file: [{ date, source, words, text }] in the file's order (the bad rows dropped), [] when the card is not in it.
export function rulingsOf(shard, name) {
  if (!shard || typeof shard !== 'object' || Array.isArray(shard) || typeof name !== 'string' || !Object.hasOwn(shard, name) || !Array.isArray(shard[name])) return [];
  return shard[name].slice(0, MAX_ROWS).map(readRow).filter(Boolean);
}

// The build keeps every card in one object, { cards: { name: [row, ...] } }, in name order, and splits it into the files.
export function splitRulings(rulings) {
  const shards = {};
  for (const name of Object.keys(rulings.cards)) {
    const shard = shardOf(name);
    if (!shards[shard]) shards[shard] = {};
    shards[shard][name] = rulings.cards[name];
  }
  return shards;
}
export const countRulings = (rulings) => ({ cards: Object.keys(rulings.cards).length, rows: Object.values(rulings.cards).reduce((sum, rows) => sum + rows.length, 0) });

// The checks a build makes before it publishes the files. Returns a list of problems; empty means fine.
export function validateRulings(rulings, { minCards = 15000, minRows = 60000, previousRows = null, maxShrink = 0.05, mustHave = { 'Doubling Season': 3, 'Humility': 3 } } = {}) {
  if (!rulings || typeof rulings !== 'object' || !rulings.cards || Array.isArray(rulings.cards)) return ['the rulings are not { cards }'];
  const problems = [];
  const names = Object.keys(rulings.cards);
  let rows = 0; let badRows = 0; let badNames = 0; let unordered = 0; let empty = 0; let tooMany = 0; let undated = 0;
  names.forEach((name, index) => {
    if (name.length === 0 || name.length > MAX_NAME) badNames++;
    if (index > 0 && names[index - 1] > name) unordered++;
    const list = rulings.cards[name];
    if (!Array.isArray(list) || list.length === 0) { empty++; return; }
    if (list.length > MAX_ROWS) tooMany++;
    list.forEach((row, at) => {
      rows++;
      const read = readRow(row);
      if (!read) { badRows++; return; }
      if (at > 0 && list[at - 1][0] > read.date) undated++;
    });
  });
  if (names.length < minCards) problems.push(`only ${names.length} cards with rulings, fewer than the minimum of ${minCards}`);
  if (rows < minRows) problems.push(`only ${rows} rulings, fewer than the minimum of ${minRows}`);
  if (previousRows && rows < previousRows * (1 - maxShrink)) problems.push(`${rows} rulings is more than ${maxShrink * 100}% fewer than the last good build (${previousRows})`);
  if (badRows) problems.push(`${badRows} rulings are not a [date, source, text] row`);
  if (badNames) problems.push(`${badNames} cards have a name that is empty or too long`);
  if (unordered) problems.push(`${unordered} cards are out of order`);
  if (undated) problems.push(`${undated} rulings are out of date order`);
  if (empty) problems.push(`${empty} cards have no rulings listed`);
  if (tooMany) problems.push(`${tooMany} cards have more than ${MAX_ROWS} rulings`);
  for (const [name, least] of Object.entries(mustHave ?? {})) if (!Array.isArray(rulings.cards[name]) || rulings.cards[name].length < least) problems.push(`"${name}" has no rulings`);
  return problems.slice(0, 20);
}
