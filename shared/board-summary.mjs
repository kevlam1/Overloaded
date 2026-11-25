// A readable summary of another player's battlefield, for their seat card in the rail (the redesign's Sidebar view, Kevin 2026-11-24): their permanents
// grouped by kind (creatures, other permanents, lands) and, inside a kind, by what they are: the face that shows, token or not, and the same counters.
// Each row says how many there are and how many are tapped. A face-down card is never named (only "Face-down card"). Plain data, no browser code.
import { faceName, isLandCard, isCreatureCard, COUNTER_KINDS, COUNTER_WORDS } from './zones.mjs';

export const SUMMARY_GROUPS = [['creatures', 'Creatures'], ['other', 'Other'], ['lands', 'Lands']];

// "+1/+1 ×2, Charge ×1": the fixed kinds in their usual order, then named ones alphabetically
export function countersText(ct) {
  if (!ct || typeof ct !== 'object') return '';
  const rank = (kind) => { const at = COUNTER_KINDS.indexOf(kind); return at === -1 ? COUNTER_KINDS.length : at; };
  return Object.entries(ct)
    .filter(([, count]) => Number.isInteger(count) && count > 0)
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([kind, count]) => `${Object.hasOwn(COUNTER_WORDS, kind) ? COUNTER_WORDS[kind] : kind} ×${count}`)
    .join(', ');
}

// cards: a battlefield (game cards, as readPublic gives them). Returns [{ id, label, total, tapped, rows: [{ name, token, counters, count, tapped, card }] }],
// only the kinds that have cards, rows with the most copies first, then by name. `card` is one card of the row (to show its picture), null for face-down cards.
export function summarizeBoard(cards) {
  const groups = new Map(SUMMARY_GROUPS.map(([id, label]) => [id, { id, label, total: 0, tapped: 0, rows: new Map() }]));
  for (const card of Array.isArray(cards) ? cards : []) {
    if (!card || typeof card !== 'object') continue;
    const hidden = card.faceDown === true;
    const kind = hidden ? 'other' : isLandCard(card) ? 'lands' : isCreatureCard(card) ? 'creatures' : 'other';
    const name = hidden ? 'Face-down card' : faceName(card) || String(card.n ?? 'Card');
    const token = !hidden && card.tok === true;
    const counters = hidden ? '' : countersText(card.ct);
    const key = `${name}\u0000${token ? 1 : 0}\u0000${counters}`;
    const group = groups.get(kind);
    const row = group.rows.get(key) ?? { name, token, counters, count: 0, tapped: 0, card: hidden ? null : card };
    row.count += 1;
    if (card.tapped === true) row.tapped += 1;
    group.rows.set(key, row);
    group.total += 1;
    if (card.tapped === true) group.tapped += 1;
  }
  return SUMMARY_GROUPS.map(([id]) => groups.get(id)).filter((group) => group.total > 0).map((group) => ({
    id: group.id, label: group.label, total: group.total, tapped: group.tapped,
    rows: [...group.rows.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  }));
}

// The words of a row: "Llanowar Elves ×3" and its detail "1 tapped · +1/+1 ×2 · token"
export const rowName = (row) => `${row.name}${row.count > 1 ? ` ×${row.count}` : ''}`;
export function rowDetail(row) {
  const parts = [];
  if (row.tapped) parts.push(row.count === 1 ? 'tapped' : `${row.tapped} tapped`);
  if (row.counters) parts.push(row.counters);
  if (row.token) parts.push('token');
  return parts.join(' · ');
}
