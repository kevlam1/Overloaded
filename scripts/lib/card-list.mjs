// Builds the card list the site serves (/data/cards.json) from Scryfall's bulk files. Plain Node 20.11+, no dependencies.
// The rules come from the audits in docs/scryfall.md (tokens in their own list later, no collectibles, no online-only
// cards, sorted by name so unchanged data gives identical bytes). A card in the list is { n, t, m, k, i }:
// name, type line, mana cost, keywords, and the Scryfall id of the default printing, the shape shared/card-match.mjs expects.
// A card that was printed under another title (Scryfall's flavor_name) also has `f`: the list of those titles.
import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { printingValue, readPrintingValue, SET_CODE } from '../../shared/printings.mjs';

const byCodeUnits = (a, b) => (a < b ? -1 : a > b ? 1 : 0); // code units, not locale

export const NOT_IN_DECKS = new Set(['art_series', 'vanguard', 'planar', 'scheme']);
export const TOKENISH = new Set(['token', 'double_faced_token', 'emblem']);
// The list had 33,974 cards on 2026-10-26. A build that finds far fewer means Scryfall changed something, so it
// refuses to publish instead of shipping a broken site.
export const MIN_CARDS = 30000;
export const MAX_SHRINK = 0.05; // refuse a list more than 5% smaller than the last good one
export const MUST_HAVE = ['Sol Ring', 'Lightning Bolt', 'Island', 'Delver of Secrets // Insectile Aberration'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// The id that names a card across all its printings (double-faced cards keep it on the faces).
export const oracleIdOf = (record) => record.oracle_id ?? record.card_faces?.[0]?.oracle_id;

// Could a decklist name this record? No art cards, vanguards, planes, schemes, tokens, emblems, `front_card` records or
// collectibles (set_type memorabilia). Online-only cards are decided separately, from the printings.
export function isDeckCandidate(record) {
  return !NOT_IN_DECKS.has(record.layout) && !TOKENISH.has(record.layout) && record.layout !== 'front_card' && record.set_type !== 'memorabilia';
}

// The cost of a double-faced card is on its faces, not on the record; a land has none.
// alternateNames: other titles printed on some printing of this card (Scryfall's `flavor_name`, for example a Secret Lair
// title). Only cards that have some get an `f` field, so the other entries are exactly what they were before.
// alternateIds: the id of the printing that carries each of those titles (same order), `fp` in the entry, so a card found by
// a title can show that printing's picture. Both are always written together by the build.
export function toEntry(record, alternateNames = [], alternateIds = []) {
  const entry = { n: record.name, t: record.type_line, m: record.mana_cost ?? record.card_faces?.[0]?.mana_cost ?? '', k: record.keywords ?? [], i: record.id };
  if (alternateNames.length) {
    entry.f = alternateNames;
    if (alternateIds.length === alternateNames.length && alternateIds.every((id) => typeof id === 'string')) entry.fp = alternateIds;
  }
  return entry;
}

// What the Default Cards file (every printing) says about each card: has it any printing, and is any of them not digital?
// A card is online-only only when EVERY printing is digital. "No paper printing" is not enough (preview cards of unreleased
// sets have none), and a card with no printings at all is NOT online-only: the printings file may simply be older than the
// card file, and dropping a paper card is worse than keeping an online one.
export class PrintingSummary {
  constructor() { this.seen = new Set(); this.nonDigital = new Set(); this.alternate = new Map(); this.records = []; }
  add(printing) {
    const id = oracleIdOf(printing);
    if (!id) return;
    this.seen.add(id);
    // Every printing a decklist could name: the set, the collector number, the printing's own id and the card it belongs to.
    // Digital ones too (a player may paste an Arena or MTGO set code), and collectors' ones (memorabilia sets such as
    // Collectors' Edition or the 30th Anniversary: 2,707 printings of cards in the list on 2026-10-29, the same cards with
    // other art). Which are kept is decided later, when the list is known (printingFiles): only printings of a card in the
    // list, so a token, an art card or a card that is not in the list has none.
    if (typeof printing.set === 'string' && typeof printing.collector_number === 'string' && typeof printing.id === 'string') {
      this.records.push([printing.set, printing.collector_number, printing.id, id]);
    }
    if (printing.digital) return;
    this.nonDigital.add(id);
    // `name` is always the card's real name, in English, even on a printing in another language; the title printed on the
    // card, when it differs, is `flavor_name` (on the record, or on each face of a double-faced card).
    for (const title of [printing.flavor_name, ...(printing.card_faces ?? []).map((face) => face.flavor_name)]) {
      if (typeof title !== 'string' || !title.trim()) continue;
      if (!this.alternate.has(id)) this.alternate.set(id, new Map());
      // Which printing carries the title, for its own picture. Several can: the smallest id is taken, so the same data
      // always gives the same list.
      const titles = this.alternate.get(id);
      if (!titles.has(title) || printing.id < titles.get(title)) titles.set(title, printing.id);
    }
  }
  isOnlineOnly(oracleId) { return this.seen.has(oracleId) && !this.nonDigital.has(oracleId); }
  // The alternate titles of a card, sorted by code unit so the same data always gives the same bytes.
  alternateNames(oracleId) { return [...(this.alternate.get(oracleId)?.keys() ?? [])].sort(byCodeUnits); }
  // The id of the printing that carries each title, in the same order as alternateNames.
  alternateIds(oracleId) { return this.alternateNames(oracleId).map((title) => this.alternate.get(oracleId).get(title)); }
  // The per-set files: { set: { collector number: printing id + card key } }, only for the cards in the list.
  // `names` maps a kept card's oracle id to its name in the list. Sets and numbers are in a fixed order, so the same data
  // is always the same bytes.
  printingFiles(names) {
    const sets = new Map();
    for (const [set, number, id, oracleId] of this.records) {
      const name = names.get(oracleId);
      if (name === undefined) continue;
      if (!sets.has(set)) sets.set(set, new Map());
      sets.get(set).set(number, printingValue(id, name));
    }
    const files = {};
    for (const set of [...sets.keys()].sort(byCodeUnits)) {
      files[set] = {};
      for (const number of [...sets.get(set).keys()].sort(byCodeUnits)) files[set][number] = sets.get(set).get(number);
    }
    return files;
  }
}

const byNameThenId = (a, b) => (a.n < b.n ? -1 : a.n > b.n ? 1 : a.i < b.i ? -1 : a.i > b.i ? 1 : 0); // code units, not locale

// oracleRecords: the Oracle Cards records (any order). printings: a PrintingSummary. Returns the sorted list.
export function buildList(oracleRecords, printings) {
  const list = [];
  for (const record of oracleRecords) {
    if (!isDeckCandidate(record) || printings.isOnlineOnly(oracleIdOf(record))) continue;
    list.push(toEntry(record, printings.alternateNames(oracleIdOf(record)), printings.alternateIds(oracleIdOf(record))));
  }
  return list.sort(byNameThenId);
}

// The exact bytes served. No spaces, so the same list is always the same bytes (and gets the same ETag).
export const serializeList = (list) => JSON.stringify(list);
export const serializePrintings = (files) => JSON.stringify(files);

// A build that finds far fewer printings than this (there were 109,475 on 2026-10-29) means Scryfall changed something.
export const MIN_PRINTINGS = 80000;
export const MIN_PRINTING_SETS = 500;

// Everything that must be true before the printing files are published. Returns a list of problems; empty means fine.
export function validatePrintings(files, { minPrintings = MIN_PRINTINGS, minSets = MIN_PRINTING_SETS, previousCount = null } = {}) {
  if (!files || typeof files !== 'object' || Array.isArray(files)) return ['the printings are not an object of sets'];
  const problems = [];
  const sets = Object.keys(files);
  let count = 0; let badSets = 0; let badValues = 0; let badNumbers = 0;
  for (const set of sets) {
    const file = files[set];
    if (!SET_CODE.test(set) || !file || typeof file !== 'object' || Array.isArray(file)) { badSets++; continue; }
    for (const number of Object.keys(file)) {
      count++;
      if (number.length === 0 || number.length > 30 || /[\s/\\]/.test(number)) badNumbers++;
      if (!readPrintingValue(file[number])) badValues++;
    }
  }
  if (sets.length < minSets) problems.push(`only ${sets.length} sets, fewer than the minimum of ${minSets}`);
  if (count < minPrintings) problems.push(`only ${count} printings, fewer than the minimum of ${minPrintings}`);
  if (previousCount && count < previousCount * (1 - MAX_SHRINK)) problems.push(`${count} printings is more than ${MAX_SHRINK * 100}% fewer than the last good build (${previousCount})`);
  if (badSets) problems.push(`${badSets} sets have a code that is not a set code, or no printings`);
  if (badNumbers) problems.push(`${badNumbers} printings have a collector number that is empty, too long, or holds a space or slash`);
  if (badValues) problems.push(`${badValues} printings are not a printing id with a card key`);
  if (sets.some((set, index) => index > 0 && sets[index - 1] > set)) problems.push('the sets are out of order');
  return problems.slice(0, 20);
}

// How many printings and sets, for the build's log and its record.
export const countPrintings = (files) => ({ sets: Object.keys(files).length, printings: Object.values(files).reduce((sum, file) => sum + Object.keys(file).length, 0) });

// Everything that must be true before a list is published. Returns a list of problems; empty means fine.
export function validateList(list, { minCards = MIN_CARDS, previousCount = null, mustHave = MUST_HAVE } = {}) {
  const problems = [];
  if (!Array.isArray(list)) return ['the list is not an array'];
  if (list.length < minCards) problems.push(`only ${list.length} cards, fewer than the minimum of ${minCards}`);
  if (previousCount && list.length < previousCount * (1 - MAX_SHRINK)) problems.push(`${list.length} cards is more than ${MAX_SHRINK * 100}% fewer than the last good list (${previousCount})`);
  const ids = new Set();
  let badEntries = 0; let badIds = 0; let unsorted = 0;
  for (let index = 0; index < list.length; index++) {
    const e = list[index];
    const fine = e && typeof e.n === 'string' && e.n.length > 0 && typeof e.t === 'string' && typeof e.m === 'string' && Array.isArray(e.k) && e.k.every((word) => typeof word === 'string');
    if (!fine) { badEntries++; continue; }
    if ('f' in e && !(Array.isArray(e.f) && e.f.length > 0 && e.f.every((title) => typeof title === 'string' && title.length > 0))) { badEntries++; continue; }
    // `fp` (format 3): the printing that carries each title, one per title. A list in format 2 has none, and is still fine.
    if ('fp' in e && !('f' in e && Array.isArray(e.fp) && e.fp.length === e.f.length && e.fp.every((id) => typeof id === 'string' && UUID.test(id)))) { badEntries++; continue; }
    if (typeof e.i !== 'string' || !UUID.test(e.i)) badIds++;
    else if (ids.has(e.i)) problems.push(`duplicate id ${e.i} (${e.n})`);
    else ids.add(e.i);
    if (index > 0 && list[index - 1] && typeof list[index - 1].n === 'string' && byNameThenId(list[index - 1], e) > 0) unsorted++;
  }
  if (badEntries) problems.push(`${badEntries} entries are missing a name, type, cost or keywords`);
  if (badIds) problems.push(`${badIds} entries have an id that is not a Scryfall id`);
  if (unsorted) problems.push(`${unsorted} entries are out of order`);
  const names = new Set(list.map((e) => e && e.n));
  for (const name of mustHave) if (!names.has(name)) problems.push(`the card "${name}" is missing`);
  return problems.slice(0, 20);
}

// Reads a gzipped JSON Lines file one record at a time (the Default Cards file is 620 MB unpacked).
export async function* readJsonLines(path) {
  // `pipe` does not pass a read error (a missing file) on to the next stream, which would crash the process with an
  // unhandled error instead of failing this loop; so the error is handed on by hand.
  const file = createReadStream(path);
  const unzipped = createGunzip();
  file.on('error', (error) => unzipped.destroy(error));
  file.pipe(unzipped);
  const lines = createInterface({ input: unzipped, crlfDelay: Infinity });
  for await (const line of lines) if (line.trim()) yield JSON.parse(line);
}

// Builds the list from two bulk files on disk. Returns { list, counts } where counts describe each filter step.
// Both files are read one record at a time and only the small entries are kept: the Oracle file is 200 MB unpacked and
// the Default file 620 MB, and a build machine should not need gigabytes of memory for a 4 MB list.
export async function buildFromFiles(oraclePath, defaultPath) {
  const printings = new PrintingSummary();
  const counts = { printings: 0, oracleRecords: 0, notCandidates: 0, onlineOnly: 0, noPrintingsKept: 0, kept: 0 };
  for await (const printing of readJsonLines(defaultPath)) { printings.add(printing); counts.printings++; }
  const list = [];
  const names = new Map(); // the oracle id of each kept card to its name in the list, for the printing files
  for await (const record of readJsonLines(oraclePath)) {
    counts.oracleRecords++;
    if (!isDeckCandidate(record)) { counts.notCandidates++; continue; }
    const id = oracleIdOf(record);
    if (printings.isOnlineOnly(id)) { counts.onlineOnly++; continue; }
    if (!printings.seen.has(id)) counts.noPrintingsKept++;
    list.push(toEntry(record, printings.alternateNames(id), printings.alternateIds(id)));
    names.set(id, record.name);
  }
  list.sort(byNameThenId);
  counts.kept = list.length;
  counts.withAlternateNames = list.filter((entry) => entry.f).length;
  const printingFiles = printings.printingFiles(names);
  Object.assign(counts, { printingSets: Object.keys(printingFiles).length, printingsKept: countPrintings(printingFiles).printings });
  return { list, counts, printingFiles };
}
