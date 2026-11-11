// Sorting your hand (Kevin, 2026-11-11). Plain data in, plain data out, no browser code, so Node tests can load it (scripts/test-hand-sort.mjs).
//
// Three sorts, each a button with three states: 0 off, 1 the first way, 2 the other way round (clicking again goes back to off). Any mix can be on at once; when more than one is on the
// colour decides first, then the card type, then the mana value, and a tie keeps the order the player gave the hand by hand. The sort is a VIEW: the hand's stored order is the player's
// own and is never changed by it (turn the sorts off and the hand is as they left it), and a card drawn while a sort is on is placed by it at once, because the hand is sorted every time it is shown.
//   colour: white, blue, black, red, green, then more than one colour, then colourless (lands have no cost, so they are colourless), W to G the first way
//   type:   the player's own order of the types (DEFAULT_TYPE_ORDER, changed in Settings), the first way in that order
//   cost:   the mana value, low to high the first way
import { categoryOf, colorOrder, manaValue } from './deck-view.mjs';

export const SORT_KEYS = ['color', 'type', 'cost'];
export const SORT_TITLES = { color: 'Color', type: 'Type', cost: 'Cost' };

// The types the player can order (Settings shows these as pills), and the two that are always last, in this order, when a card is a battle or has none of the types.
export const TYPE_KEYS = ['creature', 'instant', 'sorcery', 'enchantment', 'artifact', 'planeswalker', 'land'];
export const TYPE_TITLES = { creature: 'Creatures', instant: 'Instants', sorcery: 'Sorceries', enchantment: 'Enchantments', artifact: 'Artifacts', planeswalker: 'Planeswalkers', land: 'Lands' };
export const DEFAULT_TYPE_ORDER = [...TYPE_KEYS];
const AFTER_TYPES = ['battle', 'other'];

export const noSorts = () => ({ color: 0, type: 0, cost: 0 });
export const anySortOn = (state) => SORT_KEYS.some((key) => state?.[key] === 1 || state?.[key] === 2);

// The sorts as a saved object: only a whole number 0 to 2 for each of the three keys counts, anything else is off.
export function cleanSorts(value) {
  const out = noSorts();
  if (value && typeof value === 'object') for (const key of SORT_KEYS) if (value[key] === 1 || value[key] === 2) out[key] = value[key];
  return out;
}

// One click on a sort's button: off to the first way, to the other way round, to off. Returns a new state; a key that is not one of the three changes nothing.
export function nextSortState(state, key) {
  const now = cleanSorts(state);
  if (!SORT_KEYS.includes(key)) return now;
  return { ...now, [key]: (now[key] + 1) % 3 };
}

// The words for a button's state, for its tooltip and a screen reader.
export function sortWords(key, value) {
  const title = SORT_TITLES[key] ?? key;
  const ways = { color: ['white to green', 'green to white'], type: ['in your type order', 'the type order reversed'], cost: ['low to high', 'high to low'] }[key] ?? ['', ''];
  if (value === 1) return `${title}: ${ways[0]}. Click for ${ways[1]}.`;
  if (value === 2) return `${title}: ${ways[1]}. Click to turn it off.`;
  return `Sort by ${title.toLowerCase()} (${ways[0]}). Click again to reverse it, and again to turn it off.`;
}

// A saved type order made whole: the known types in the order given (no repeats), then any that are missing in the default order. Anything else is dropped.
export function normalizeTypeOrder(order) {
  const seen = new Set();
  const out = [];
  for (const key of Array.isArray(order) ? order : []) if (TYPE_KEYS.includes(key) && !seen.has(key)) { seen.add(key); out.push(key); }
  for (const key of DEFAULT_TYPE_ORDER) if (!seen.has(key)) out.push(key);
  return out;
}

// Moves the type at index "from" to index "to" (pills dragged in Settings). Returns a new order; a bad index changes nothing.
export function moveType(order, from, to) {
  const list = normalizeTypeOrder(order);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return list;
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
  return list;
}

// What a hand card is sorted by: its colour group, its type's place in the order, and its mana value, from its card-list entry (type line \`t\` and cost \`m\`, as the card list has them).
export function sortKeysOf(info, typeOrder) {
  const order = [...normalizeTypeOrder(typeOrder), ...AFTER_TYPES];
  const type = categoryOf(info?.t);
  const [colorRank, letters] = colorOrder(type === 'land' ? '' : info?.m);
  return { color: colorRank, colors: letters, type: Math.max(0, order.indexOf(type)), cost: type === 'land' ? 0 : manaValue(info?.m) };
}

// The hand in the order to show: a new array, the cards themselves unchanged. info(card) gives { t, m } for a card (or nothing for one the card list does not know, which sorts as colourless,
// typeless and free). With no sort on, the hand is returned in the player's own order.
export function sortHand(cards, state, { typeOrder = DEFAULT_TYPE_ORDER, info = () => null } = {}) {
  const list = Array.isArray(cards) ? [...cards] : [];
  const sorts = cleanSorts(state);
  if (!anySortOn(sorts)) return list;
  const keyed = list.map((card, index) => ({ card, index, keys: sortKeysOf(info(card), typeOrder) }));
  const sign = (key) => (sorts[key] === 2 ? -1 : 1);
  keyed.sort((a, b) => {
    if (sorts.color) { const d = (a.keys.color - b.keys.color) || (a.keys.colors < b.keys.colors ? -1 : a.keys.colors > b.keys.colors ? 1 : 0); if (d) return d * sign('color'); }
    if (sorts.type) { const d = a.keys.type - b.keys.type; if (d) return d * sign('type'); }
    if (sorts.cost) { const d = a.keys.cost - b.keys.cost; if (d) return d * sign('cost'); }
    return a.index - b.index;
  });
  return keyed.map((entry) => entry.card);
}
