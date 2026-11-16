// The rules of a card, for the details window (Kevin, 2026-11-15: right-click a card to read it: the large card on the left, its rules, mana value, type and the rest on the right). Plain JavaScript with no browser
// or network code, so Node tests can load it (scripts/test-card-rules.mjs).
//
// The card list leaves the rules text out on purpose (it would be several times the size), so the build writes it into small files grouped by card, the same way as the printings (shared/card-prints.mjs):
//   /data/rules/XX.json   where XX is the first two characters of the card's key (shared/printings.mjs cardKey), 256 files; a file is { "Sol Ring": { v: 1, f: [ { n, m, t, x } ], g: "..." }, ... }
// The name is the card's real English name, as in the card list. A file is only fetched when someone opens a card's details, and only that one (about 15 KB compressed). The page never asks Scryfall for anything.
//
// An entry:  v  the mana value (a number)            c  the colors (letters in the order WUBRG; none for a colorless card)
//            g  the legality in seven formats, one letter each in the order of LEGALITY_FORMATS: l legal, n not legal, b banned, r restricted
//            f  the faces, one for most cards and two for a card with two faces (a card of the "Who // What // When // Where // Why" kind has five): { n name, m mana cost, t type line, x rules text (lines separated by a new line), pt "power/toughness", l loyalty, d defense }
import { cardKey } from './printings.mjs';

export const RULES_PATH = '/data/rules';
export const LEGALITY_FORMATS = ['standard', 'pioneer', 'modern', 'legacy', 'vintage', 'commander', 'pauper'];
export const LEGALITY_WORDS = { l: 'Legal', n: 'Not legal', b: 'Banned', r: 'Restricted' };
export const MAX_NAME = 200;
export const MAX_TEXT = 4000;
const LEGALITY_CODES = { legal: 'l', not_legal: 'n', banned: 'b', restricted: 'r' };
const COLORS = /^W?U?B?R?G?$/;

export const shardOf = (name) => cardKey(name).slice(0, 2);
export const shardUrl = (name) => (typeof name === 'string' && name.length > 0 && name.length <= MAX_NAME ? `${RULES_PATH}/${shardOf(name)}.json` : null);
export const shardFileName = (shard) => (typeof shard === 'string' && /^[0-9a-f]{2}$/.test(shard) ? `${shard}.json` : null);

const text = (value, max) => (typeof value === 'string' && value.length > 0 ? value.slice(0, max) : null);

// One face of a Scryfall record (or the record itself, for a card with one face) as the small object the files hold.
function faceOf(source, fallback) {
  const face = { n: text(source.name ?? fallback.name, MAX_NAME) ?? '', t: text(source.type_line ?? fallback.type_line, 200) ?? '' };
  const cost = text(source.mana_cost, 100);
  if (cost) face.m = cost;
  const rules = text(source.oracle_text, MAX_TEXT);
  if (rules) face.x = rules;
  if (typeof source.power === 'string' && typeof source.toughness === 'string') face.pt = `${source.power}/${source.toughness}`;
  if (typeof source.loyalty === 'string' && source.loyalty) face.l = source.loyalty;
  if (typeof source.defense === 'string' && source.defense) face.d = source.defense;
  return face;
}

// The entry for a card, from its record in Scryfall's Oracle Cards file.
export function entryFromRecord(record) {
  const faces = Array.isArray(record.card_faces) && record.card_faces.length > 0 ? record.card_faces.map((face) => faceOf(face, record)) : [faceOf(record, record)];
  const entry = { v: typeof record.cmc === 'number' && record.cmc >= 0 && record.cmc <= 1000000 ? record.cmc : 0 }; // (the keys in the same order readEntry gives, so the same data is always the same bytes)
  const colors = (Array.isArray(record.colors) ? record.colors : record.card_faces?.[0]?.colors ?? []).filter((c) => 'WUBRG'.includes(c));
  const ordered = ['W', 'U', 'B', 'R', 'G'].filter((c) => colors.includes(c)).join('');
  if (ordered) entry.c = ordered;
  const legalities = record.legalities && typeof record.legalities === 'object' ? record.legalities : {};
  entry.g = LEGALITY_FORMATS.map((format) => LEGALITY_CODES[legalities[format]] ?? 'n').join('');
  entry.f = faces;
  return entry;
}

const FACE_KEYS = ['n', 'm', 't', 'x', 'pt', 'l', 'd'];
function readFace(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  for (const key of Object.keys(raw)) if (!FACE_KEYS.includes(key)) return null;
  if (typeof raw.n !== 'string' || raw.n.length > MAX_NAME || typeof raw.t !== 'string' || raw.t.length > 200) return null;
  for (const [key, max] of [['m', 100], ['x', MAX_TEXT], ['pt', 20], ['l', 10], ['d', 10]]) if (key in raw && !(typeof raw[key] === 'string' && raw[key].length > 0 && raw[key].length <= max)) return null;
  return { ...raw };
}

// An entry as the page uses it, a clean copy, or null for something that is not one (never trust what came over the network).
export function readEntry(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  for (const key of Object.keys(raw)) if (!['v', 'c', 'g', 'f'].includes(key)) return null;
  if (typeof raw.v !== 'number' || !Number.isFinite(raw.v) || raw.v < 0 || raw.v > 1000000) return null;
  if ('c' in raw && !(typeof raw.c === 'string' && raw.c.length > 0 && COLORS.test(raw.c))) return null;
  if (typeof raw.g !== 'string' || raw.g.length !== LEGALITY_FORMATS.length || ![...raw.g].every((letter) => Object.hasOwn(LEGALITY_WORDS, letter))) return null;
  if (!Array.isArray(raw.f) || raw.f.length < 1 || raw.f.length > 8) return null;
  const faces = raw.f.map(readFace);
  if (faces.some((face) => face === null)) return null;
  return { v: raw.v, ...(raw.c ? { c: raw.c } : {}), g: raw.g, f: faces };
}

// The entry of a card from a parsed shard, or null when the card is not in it or its entry is damaged.
export function rulesOf(shard, name) {
  if (!shard || typeof shard !== 'object' || Array.isArray(shard) || typeof name !== 'string' || !Object.hasOwn(shard, name)) return null;
  return readEntry(shard[name]);
}

// The legality line of an entry: [{ format, word }] in the order of LEGALITY_FORMATS.
export const legalitiesOf = (entry) => LEGALITY_FORMATS.map((format, index) => ({ format, word: LEGALITY_WORDS[entry.g[index]] }));

// The build keeps every card in one object, { cards: { name: entry } }, and splits it into the files. The cards come in name order so the same data is always the same bytes.
export function splitRules(rules) {
  const shards = {};
  for (const name of Object.keys(rules.cards)) {
    const shard = shardOf(name);
    if (!shards[shard]) shards[shard] = {};
    shards[shard][name] = rules.cards[name];
  }
  return shards;
}
export const countRules = (rules) => Object.keys(rules.cards).length;

// The checks a build makes before it publishes the files. Returns a list of problems; empty means fine.
export function validateRules(rules, { minCards = 20000, previousCount = null, maxShrink = 0.05, mustHave = { 'Sol Ring': /\{C\}\{C\}/, 'Lightning Bolt': /3 damage/ } } = {}) {
  if (!rules || typeof rules !== 'object' || !rules.cards || Array.isArray(rules.cards)) return ['the rules are not { cards }'];
  const problems = [];
  const names = Object.keys(rules.cards);
  let bad = 0; let badNames = 0; let unordered = 0;
  names.forEach((name, index) => {
    if (name.length === 0 || name.length > MAX_NAME) badNames++;
    if (!readEntry(rules.cards[name])) bad++;
    if (index > 0 && names[index - 1] > name) unordered++;
  });
  if (names.length < minCards) problems.push(`only ${names.length} cards with rules, fewer than the minimum of ${minCards}`);
  if (previousCount && names.length < previousCount * (1 - maxShrink)) problems.push(`${names.length} cards with rules is more than ${maxShrink * 100}% fewer than the last good build (${previousCount})`);
  if (bad) problems.push(`${bad} entries are not a rules entry`);
  if (badNames) problems.push(`${badNames} cards have a name that is empty or too long`);
  if (unordered) problems.push(`${unordered} cards are out of order`);
  for (const [name, pattern] of Object.entries(mustHave ?? {})) {
    const entry = rulesOf(rules.cards, name);
    if (!entry || !pattern.test(entry.f.map((face) => face.x ?? '').join('\n'))) problems.push(`the rules of "${name}" are missing or wrong`);
  }
  return problems.slice(0, 20);
}
