// Tokens and emblems for the "Create token" and "Create emblem" menus (Kevin, 2026-11-19). Plain JavaScript with no browser or network code, so Node tests can load it (scripts/test-card-tokens.mjs).
// Scryfall's Default Cards file has every token and emblem printing (3,355 of them on 2026-11-19; layout "token", "double_faced_token" or "emblem"). Printings of one token share an `oracle_id`
// (1,109 distinct tokens and emblems, none with two different names or types under one id), so a token is that group. A real card lists its tokens and its emblem in `all_parts`
// (component "token", or "combo_piece" for an emblem): 14,198 links from 4,162 cards, 82 of them to a printing that is not in the file.
//
// The build writes ONE file, /data/tokens.json (about 130 KB compressed; the pages fetch it only when a token menu opens):
//   { "v": 1, "t": [ [name, type, pt, colors, text, emblem, [[id, set, number, year], ...]], ... ], "l": { "Card Name": [tokenIndex, ...] } }
// "t" is sorted (tokens before emblems, then by name, type, power and toughness, colors, text), a token's printings are newest first (English only), pt is "1/1" or "", colors is "WUBRG" letters or "",
// emblem is 1 or 0, "l" has a card's name (as in the card list) and the indexes of its tokens in "t".
import { SET_CODE } from './printings.mjs';

export const TOKENS_PATH = '/data/tokens.json';
export const MAX_TEXT = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const YEAR = /^\d{4}$/;
const COLORS = /^W?U?B?R?G?$/;
const STATS = /^[^/\s]{1,6}\/[^/\s]{1,6}$/;
const WUBRG = ['W', 'U', 'B', 'R', 'G'];

// The tokens people make most, in the order the menu lists them (Kevin, 2026-11-19). The menu picks, for each name, the token of that name that has the most printings (the plain one).
export const COMMON_NAMES = ['Treasure', 'Food', 'Clue', 'Blood', 'Soldier', 'Spirit', 'Zombie', 'Goblin', 'Beast', 'Elemental', 'Angel', 'Dragon', 'Bird', 'Saproling', 'Human', 'Wolf'];

const isToken = (record) => record.layout === 'token' || record.layout === 'double_faced_token';
const isEmblem = (record) => record.layout === 'emblem';

// Reads Scryfall's printing records one at a time (add), then makes the data (build).
export class TokenCollector {
  constructor() {
    this.groups = new Map(); // oracle id -> { name, type, pt, colors, text, emblem, rows: [[id, set, number, year, released]] }
    this.groupOfPrinting = new Map(); // printing id -> oracle id (every language, so a link to a Japanese printing still finds its token)
    this.links = new Map(); // card oracle id -> Set of token printing ids
  }

  add(record) {
    if (!record || typeof record !== 'object') return;
    if (isToken(record) || isEmblem(record)) {
      if (typeof record.id !== 'string') return;
      const key = record.oracle_id ?? `id:${record.id}`;
      this.groupOfPrinting.set(record.id, key);
      if (record.lang !== undefined && record.lang !== 'en') return;
      const face = Array.isArray(record.card_faces) && record.card_faces.length ? record.card_faces[0] : record;
      if (!this.groups.has(key)) {
        const colors = WUBRG.filter((letter) => (face.colors ?? record.colors ?? []).includes(letter)).join('');
        this.groups.set(key, {
          name: String(face.name ?? record.name ?? '').trim(), type: String(face.type_line ?? record.type_line ?? '').trim(),
          pt: face.power !== undefined && face.toughness !== undefined ? `${face.power}/${face.toughness}` : '', colors,
          text: String(face.oracle_text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT), emblem: isEmblem(record) ? 1 : 0, rows: [],
        });
      }
      this.groups.get(key).rows.push([record.id, record.set, String(record.collector_number ?? ''), String(record.released_at ?? '').slice(0, 4), String(record.released_at ?? '')]);
      return;
    }
    if (!Array.isArray(record.all_parts) || !record.oracle_id) return;
    for (const part of record.all_parts) {
      if (!part || typeof part.id !== 'string') continue;
      if (part.component === 'token' || (part.component === 'combo_piece' && typeof part.type_line === 'string' && part.type_line.startsWith('Emblem'))) {
        if (!this.links.has(record.oracle_id)) this.links.set(record.oracle_id, new Set());
        this.links.get(record.oracle_id).add(part.id);
      }
    }
  }

  // namesByOracleId: the oracle id of every card of the card list to its name there; a link from any other card is left out.
  build(namesByOracleId) {
    const order = [...this.groups.entries()].sort(([, a], [, b]) => a.emblem - b.emblem || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) || (a.type < b.type ? -1 : a.type > b.type ? 1 : 0)
      || (a.pt < b.pt ? -1 : a.pt > b.pt ? 1 : 0) || (a.colors < b.colors ? -1 : a.colors > b.colors ? 1 : 0) || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));
    const indexOfGroup = new Map(order.map(([key], at) => [key, at]));
    const t = order.map(([, group]) => [group.name, group.type, group.pt, group.colors, group.text, group.emblem,
      group.rows.slice().sort((a, b) => (a[4] < b[4] ? 1 : a[4] > b[4] ? -1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0)).map((row) => row.slice(0, 4))]);
    const byName = new Map();
    for (const [cardId, printingIds] of this.links) {
      const name = namesByOracleId.get(cardId);
      if (name === undefined) continue;
      const found = new Set();
      for (const printingId of printingIds) { const key = this.groupOfPrinting.get(printingId); if (key !== undefined && indexOfGroup.has(key)) found.add(indexOfGroup.get(key)); }
      if (found.size) byName.set(name, [...found].sort((a, b) => a - b));
    }
    const l = Object.fromEntries([...byName.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).map((name) => [name, byName.get(name)]));
    return { v: 1, t, l };
  }
}

export const serializeTokens = (tokens) => JSON.stringify(tokens);
export const countTokens = (tokens) => ({ tokens: tokens.t.filter((row) => row[5] === 0).length, emblems: tokens.t.filter((row) => row[5] === 1).length, printings: tokens.t.reduce((sum, row) => sum + row[6].length, 0), cards: Object.keys(tokens.l).length });

// One token row as the page uses it: { index, name, type, pt, colors, text, emblem, printings: [{ id, set, number, year }] }, or null for a row that is not one (never trust what came over the network).
export function readTokenRow(row, index) {
  if (!Array.isArray(row) || row.length !== 7) return null;
  const [name, type, pt, colors, text, emblem, printings] = row;
  if (typeof name !== 'string' || name.length === 0 || name.length > 200 || typeof type !== 'string' || type.length === 0 || type.length > 200) return null;
  if (typeof pt !== 'string' || (pt !== '' && !STATS.test(pt)) || typeof colors !== 'string' || !COLORS.test(colors)) return null;
  if (typeof text !== 'string' || text.length > MAX_TEXT || (emblem !== 0 && emblem !== 1) || !Array.isArray(printings) || printings.length === 0) return null;
  const rows = [];
  for (const printing of printings) {
    if (!Array.isArray(printing) || printing.length !== 4) return null;
    const [id, set, number, year] = printing;
    if (typeof id !== 'string' || !UUID.test(id) || typeof set !== 'string' || !SET_CODE.test(set) || typeof number !== 'string' || number.length === 0 || number.length > 30 || /[\s/\\]/.test(number) || typeof year !== 'string' || !YEAR.test(year)) return null;
    rows.push({ id, set, number, year });
  }
  return { index, name, type, pt, colors, text, emblem: emblem === 1, printings: rows };
}

// The whole file as the page uses it: { tokens: [row...], links: Map(card name -> [token...]) }, or null when it is not a tokens file. A bad row is dropped, and a link to it is dropped.
export function readTokens(file) {
  if (!file || typeof file !== 'object' || file.v !== 1 || !Array.isArray(file.t) || !file.l || typeof file.l !== 'object' || Array.isArray(file.l)) return null;
  const tokens = file.t.map((row, at) => readTokenRow(row, at));
  const links = new Map();
  for (const [name, indexes] of Object.entries(file.l)) {
    if (!Array.isArray(indexes)) continue;
    const list = indexes.map((at) => (Number.isInteger(at) ? tokens[at] : null)).filter(Boolean);
    if (list.length) links.set(name, list);
  }
  return { tokens: tokens.filter(Boolean), links };
}

// The tokens (or emblems) that the cards of a deck make, each once, most-made first: `names` are card names; `emblem` says which kind.
export function tokensForCards(data, names, emblem = false) {
  const counts = new Map();
  for (const name of names) for (const token of data.links.get(name) ?? []) if (token.emblem === emblem) counts.set(token, (counts.get(token) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0].name < b[0].name ? -1 : a[0].name > b[0].name ? 1 : a[0].index - b[0].index)).map(([token]) => token);
}

// The common tokens, in COMMON_NAMES order: for each name the token of that name with the most printings.
export function commonTokens(data) {
  return COMMON_NAMES.map((name) => data.tokens.filter((token) => !token.emblem && token.name === name).sort((a, b) => b.printings.length - a.printings.length || a.index - b.index)[0]).filter(Boolean);
}

// Search by words: every word must be in the name or the type line (capitals do not matter). `emblem`: which kind. At most `limit` results, names that start with the first word first.
export function searchTokens(data, query, { emblem = false, limit = 60 } = {}) {
  const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const pool = data.tokens.filter((token) => token.emblem === emblem);
  if (words.length === 0) return pool.slice(0, limit);
  const found = pool.filter((token) => { const hay = `${token.name} ${token.type}`.toLowerCase(); return words.every((word) => hay.includes(word)); });
  const starts = (token) => (token.name.toLowerCase().startsWith(words[0]) ? 0 : 1);
  return found.map((token, at) => [token, at]).sort((a, b) => starts(a[0]) - starts(b[0]) || b[0].printings.length - a[0].printings.length || a[1] - b[1]).slice(0, limit).map(([token]) => token);
}

// The checks a build makes before it publishes the file. Returns a list of problems; empty means fine.
export function validateTokens(file, { minTokens = 800, minPrintings = 2500, minCards = 3000, previousPrintings = null, maxShrink = 0.05, mustHave = ['Treasure', 'Soldier', 'Food', "Elspeth, Sun's Champion Emblem"], mustLink = ["Elspeth, Sun's Champion", 'Krenko, Mob Boss'] } = {}) {
  if (!file || typeof file !== 'object' || file.v !== 1 || !Array.isArray(file.t) || !file.l || typeof file.l !== 'object' || Array.isArray(file.l)) return ['the tokens are not { v, t, l }'];
  const problems = [];
  let bad = 0; let unordered = 0; let printings = 0;
  file.t.forEach((row, at) => {
    const read = readTokenRow(row, at);
    if (!read) { bad++; return; }
    printings += read.printings.length;
    if (at > 0) { const before = file.t[at - 1]; if (Array.isArray(before) && (before[5] > row[5] || (before[5] === row[5] && before[0] > row[0]))) unordered++; }
  });
  const names = Object.keys(file.l);
  let badLinks = 0;
  for (const name of names) if (!Array.isArray(file.l[name]) || file.l[name].length === 0 || !file.l[name].every((at) => Number.isInteger(at) && at >= 0 && at < file.t.length)) badLinks++;
  if (file.t.length < minTokens) problems.push(`only ${file.t.length} tokens and emblems, fewer than the minimum of ${minTokens}`);
  if (printings < minPrintings) problems.push(`only ${printings} token printings, fewer than the minimum of ${minPrintings}`);
  if (names.length < minCards) problems.push(`only ${names.length} cards link to a token, fewer than the minimum of ${minCards}`);
  if (previousPrintings && printings < previousPrintings * (1 - maxShrink)) problems.push(`${printings} token printings is more than ${maxShrink * 100}% fewer than the last good build (${previousPrintings})`);
  if (bad) problems.push(`${bad} token rows are not a token`);
  if (badLinks) problems.push(`${badLinks} cards have a link that is not a list of token numbers`);
  if (unordered) problems.push(`${unordered} tokens are out of order`);
  for (const name of mustHave ?? []) if (!file.t.some((row) => row[0] === name)) problems.push(`the token "${name}" is missing`);
  for (const name of mustLink ?? []) if (!Array.isArray(file.l[name])) problems.push(`the card "${name}" has no token link`);
  return problems.slice(0, 20);
}
