// Builds the card list the site serves (/data/cards.json) from Scryfall's bulk files. Plain Node 20.11+, no dependencies.
// The rules come from the audits in docs/scryfall.md (tokens in their own list later, no collectibles, no online-only
// cards, sorted by name so unchanged data gives identical bytes). A card in the list is { n, t, m, k, i }:
// name, type line, mana cost, keywords, and the Scryfall id of the default printing, the shape shared/card-match.mjs expects.
import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';

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
export function toEntry(record) {
  return { n: record.name, t: record.type_line, m: record.mana_cost ?? record.card_faces?.[0]?.mana_cost ?? '', k: record.keywords ?? [], i: record.id };
}

// What the Default Cards file (every printing) says about each card: has it any printing, and is any of them not digital?
// A card is online-only only when EVERY printing is digital. "No paper printing" is not enough (preview cards of unreleased
// sets have none), and a card with no printings at all is NOT online-only: the printings file may simply be older than the
// card file, and dropping a paper card is worse than keeping an online one.
export class PrintingSummary {
  constructor() { this.seen = new Set(); this.nonDigital = new Set(); }
  add(printing) {
    const id = oracleIdOf(printing);
    if (!id) return;
    this.seen.add(id);
    if (!printing.digital) this.nonDigital.add(id);
  }
  isOnlineOnly(oracleId) { return this.seen.has(oracleId) && !this.nonDigital.has(oracleId); }
}

const byNameThenId = (a, b) => (a.n < b.n ? -1 : a.n > b.n ? 1 : a.i < b.i ? -1 : a.i > b.i ? 1 : 0); // code units, not locale

// oracleRecords: the Oracle Cards records (any order). printings: a PrintingSummary. Returns the sorted list.
export function buildList(oracleRecords, printings) {
  const list = [];
  for (const record of oracleRecords) {
    if (!isDeckCandidate(record) || printings.isOnlineOnly(oracleIdOf(record))) continue;
    list.push(toEntry(record));
  }
  return list.sort(byNameThenId);
}

// The exact bytes served. No spaces, so the same list is always the same bytes (and gets the same ETag).
export const serializeList = (list) => JSON.stringify(list);

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
  for await (const record of readJsonLines(oraclePath)) {
    counts.oracleRecords++;
    if (!isDeckCandidate(record)) { counts.notCandidates++; continue; }
    const id = oracleIdOf(record);
    if (printings.isOnlineOnly(id)) { counts.onlineOnly++; continue; }
    if (!printings.seen.has(id)) counts.noPrintingsKept++;
    list.push(toEntry(record));
  }
  list.sort(byNameThenId);
  counts.kept = list.length;
  return { list, counts };
}
