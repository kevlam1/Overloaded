// The filters of the pile windows (Kevin, 2026-11-16): a Type dropdown (any number of types, with Reset) and a Mana value dropdown (0 to 7 and 8+, any number, with Reset). A card shows when it
// matches ANY chosen type and ANY chosen mana value; a filter with nothing chosen lets every card through. Plain logic with no browser code, so Node tests can load it (scripts/test-pile-filter.mjs).
// A card here is a game card with its type line t and its cost m, as the card list has them (a token carries t too). The type is read from the FRONT face and the words before the dash, so an
// Artifact Creature is both an Artifact and a Creature; the mana value is the one of the front face (manaValue in shared/deck-view.mjs).
import { manaValue } from './deck-view.mjs';

export const TYPE_OPTIONS = ['creature', 'instant', 'sorcery', 'artifact', 'enchantment', 'land', 'planeswalker', 'battle'];
export const VALUE_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8]; // 8 is "8 or more"
export const typeTitle = (type) => `${type.charAt(0).toUpperCase()}${type.slice(1)}`;
export const valueTitle = (value) => (value >= 8 ? '8+' : String(value));
const EM_DASH = '—';

// The type words of a card: "Legendary Artifact Creature - Golem // Land" gives legendary, artifact, creature.
export function typeWordsOf(typeLine) {
  const front = String(typeLine ?? '').split(' // ')[0].split(EM_DASH)[0].split(' - ')[0];
  return new Set(front.split(/\s+/).filter(Boolean).map((word) => word.toLowerCase()));
}

// The mana value of a card as the filter sees it: 0 to 7, and 8 for 8 or more.
export const valueOf = (card) => Math.min(8, manaValue(card?.m ?? ''));

export const emptyFilter = () => ({ types: [], values: [] });
export const filterActive = (filter) => Boolean(filter && ((filter.types?.length ?? 0) > 0 || (filter.values?.length ?? 0) > 0));

// Does this card pass the filter?
export function matchesFilter(card, filter) {
  if (!filterActive(filter)) return true;
  if (filter.types?.length) {
    const words = typeWordsOf(card?.t ?? card?.tt);
    if (!filter.types.some((type) => words.has(type))) return false;
  }
  if (filter.values?.length && !filter.values.includes(valueOf(card))) return false;
  return true;
}

// Rows of the viewer ({ card, index }) that pass the filter, in the same order.
export const filterRows = (rows, filter) => (filterActive(filter) ? rows.filter((row) => matchesFilter(row.card, filter)) : rows);

// A short phrase for what the dropdowns are set to ("2 types, mana value 3"), for the line under the title.
export function describeFilter(filter) {
  const parts = [];
  if (filter?.types?.length) parts.push(filter.types.map(typeTitle).join(' or '));
  if (filter?.values?.length) parts.push(`mana value ${filter.values.map(valueTitle).join(' or ')}`);
  return parts.join(', ');
}
