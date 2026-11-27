// The commanders the home page's card shows (Kevin, 2026-11-26: "a random commander from the top 1000"). Scryfall has no list of top commanders; its field
// `edhrec_rank` ranks how often a card is played in any Commander deck (checked on the Oracle file on 2026-11-26: Krenko, Mob Boss is 1089; 3,443 legendary
// creatures legal as commanders have a rank). So "top commanders" here means: the legendary creatures legal as a commander, by that rank, the best 1,000.
// The card list build marks them with `cr` (1 = most played), and publishing writes their ids and names to /data/commanders.json.
export const TOP_COMMANDERS = 1000;

// Is this Scryfall record a commander candidate with a rank? (a legendary creature, legal as a commander, with a whole-number rank)
export function rankedCommander(record) {
  const type = record?.type_line ?? '';
  return /\bLegendary\b/.test(type) && /\bCreature\b/.test(type) && record?.legalities?.commander === 'legal' && Number.isInteger(record?.edhrec_rank) && record.edhrec_rank > 0;
}

// The published file: [[id, name], ...] in rank order, from a built list's `cr` marks.
export function commandersFromList(list) {
  return list.filter((entry) => Number.isInteger(entry?.cr)).sort((a, b) => a.cr - b.cr).map((entry) => [entry.i, entry.n]);
}

// A random one of them for the page: [id, name], or null when the file is empty or damaged. `random` is a number from 0 up to 1, passed in so tests can choose.
export function pickCommander(rows, random = Math.random()) {
  const usable = Array.isArray(rows) ? rows.filter((row) => Array.isArray(row) && typeof row[0] === 'string' && /^[0-9a-f-]{36}$/.test(row[0]) && typeof row[1] === 'string') : [];
  return usable.length ? usable[Math.min(usable.length - 1, Math.floor(random * usable.length))] : null;
}
