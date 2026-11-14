// Sorting your hand (Kevin, 2026-11-11). Plain data in, plain data out, no browser code, so Node tests can load it (scripts/test-hand-sort.mjs).
//
// Four sorts, each a button with three states: 0 off, 1 the first way, 2 the other way round (clicking again goes back to off). Any mix can be on at once; when more than one is on the
// the card type decides first, then the colour, then the mana value, then the name (Kevin, 2026-11-13), and a tie keeps the order the player gave the hand by hand. The sort is a VIEW: the hand's stored order is the player's
// own and is never changed by it (turn the sorts off and the hand is as they left it), and a card drawn while a sort is on is placed by it at once, because the hand is sorted every time it is shown.
//   colour: in the player's own order of the colour groups (DEFAULT_COLOR_ORDER, changed in Settings: white, blue, black, red, green, more than one colour, colourless), the first way in that order. A land has no cost, so it goes by its colour identity (the card list's ci, which
//           covers basic lands, the dual and triome lands, the pain, check and fast lands and so on) joined with the basic land types in its type line (Plains, Island, Swamp, Mountain,
//           Forest); a land that names no colour at all (Wastes, Ancient Tomb, and a land that makes any colour, which the list cannot tell from rules text) is colourless. When only the colour
//           is on, the lands of a colour come after the spells of it.
//   type:   the player's own order of the types (DEFAULT_TYPE_ORDER, changed in Settings), the first way in that order (the first type is the left-most).
//   cost:   the mana value, low to high the first way
//   name:   A to Z the first way (accents and capitals do not matter)
import { categoryOf, colorOrder as colorOrderOf, manaValue } from './deck-view.mjs';

export const SORT_KEYS = ['color', 'type', 'cost', 'name'];
export const SORT_TITLES = { color: 'Color', type: 'Type', cost: 'Cost', name: 'A-Z' };

// The types the player can order (Settings shows these as pills), and the two that are always last, in this order, when a card is a battle or has none of the types.
export const TYPE_KEYS = ['creature', 'instant', 'sorcery', 'enchantment', 'artifact', 'planeswalker', 'land'];
export const TYPE_TITLES = { creature: 'Creatures', instant: 'Instants', sorcery: 'Sorceries', enchantment: 'Enchantments', artifact: 'Artifacts', planeswalker: 'Planeswalkers', land: 'Lands' };
export const DEFAULT_TYPE_ORDER = [...TYPE_KEYS];

// The colour groups the player can order (Settings shows these as pills): the five colours, cards of more than one colour, and colourless cards (and lands that name no colour).
export const COLOR_KEYS = ['W', 'U', 'B', 'R', 'G', 'multi', 'none'];
export const COLOR_TITLES = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green', multi: 'Multicolor', none: 'Colorless' };
export const DEFAULT_COLOR_ORDER = [...COLOR_KEYS];
// colorOrder() in deck-view.mjs ranks the groups 0 to 6 in this order, which is how a rank is turned into a group's key.
const RANK_KEYS = ['W', 'U', 'B', 'R', 'G', 'multi', 'none'];
const AFTER_TYPES = ['battle', 'other'];

export const noSorts = () => ({ color: 0, type: 0, cost: 0, name: 0 });
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
  const ways = { color: ['in your color order', 'the color order reversed'], type: ['in your type order', 'the type order reversed'], cost: ['low to high', 'high to low'], name: ['A to Z', 'Z to A'] }[key] ?? ['', ''];
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
function moveIn(list, from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return list;
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
  return list;
}
export const moveType = (order, from, to) => moveIn(normalizeTypeOrder(order), from, to);

// The same for the order of the colour groups: a saved order made whole (known keys in the order given, no repeats, the missing ones at the end in the default order), and a pill moved.
export function normalizeColorOrder(order) {
  const seen = new Set();
  const out = [];
  for (const key of Array.isArray(order) ? order : []) if (COLOR_KEYS.includes(key) && !seen.has(key)) { seen.add(key); out.push(key); }
  for (const key of DEFAULT_COLOR_ORDER) if (!seen.has(key)) out.push(key);
  return out;
}
export const moveColor = (order, from, to) => moveIn(normalizeColorOrder(order), from, to);

// Is this a land (the front face's type line has the word Land before any dash)? A land creature (Dryad Arbor) is one, and so is an artifact land.
const DASH_SPLIT = /\s[\u2014-]\s/;
const frontOf = (typeLine) => String(typeLine ?? '').split(' // ')[0];
export const isLandLine = (typeLine) => /\bLand\b/.test(frontOf(typeLine).split(DASH_SPLIT)[0]);
const BASIC_TYPE_COLORS = { Plains: 'W', Island: 'U', Swamp: 'B', Mountain: 'R', Forest: 'G' };

// The colours of a land: its colour identity and the basic land types it has (a land that is both a Swamp and a Mountain is black and red), as the letters WUBRG with no repeats.
export function landColors(info) {
  const letters = new Set(String(info?.ci ?? '').split('').filter((letter) => 'WUBRG'.includes(letter)));
  const subtypes = frontOf(info?.t).split(DASH_SPLIT)[1] ?? '';
  for (const word of subtypes.split(/\s+/)) if (BASIC_TYPE_COLORS[word]) letters.add(BASIC_TYPE_COLORS[word]);
  return [...letters].sort((a, b) => 'WUBRG'.indexOf(a) - 'WUBRG'.indexOf(b)).join('');
}

// What a hand card is sorted by: its colour group, its type's place in the order, its mana value and its name, from its card-list entry (type line t, cost m and colour identity ci, as the card list has them).
export function sortKeysOf(info, typeOrder, name = '', colorOrder = DEFAULT_COLOR_ORDER) {
  const order = [...normalizeTypeOrder(typeOrder), ...AFTER_TYPES];
  const colors = normalizeColorOrder(colorOrder);
  const type = categoryOf(info?.t);
  const land = isLandLine(info?.t);
  const [colorRank, letters] = land ? colorOrderOf(landColors(info).split('').map((letter) => '{' + letter + '}').join('')) : colorOrderOf(info?.m);
  return { color: colors.indexOf(RANK_KEYS[colorRank]), colors: letters, land: land ? 1 : 0, type: Math.max(0, order.indexOf(type)), cost: land ? 0 : manaValue(info?.m), name: String(name ?? '') };
}

// The hand in the order to show: a new array, the cards themselves unchanged. info(card) gives { t, m } for a card (or nothing for one the card list does not know, which sorts as colourless,
// typeless and free). With no sort on, the hand is returned in the player's own order.
export function sortHand(cards, state, { typeOrder = DEFAULT_TYPE_ORDER, colorOrder = DEFAULT_COLOR_ORDER, info = () => null } = {}) {
  const list = Array.isArray(cards) ? [...cards] : [];
  const sorts = cleanSorts(state);
  if (!anySortOn(sorts)) return list;
  const keyed = list.map((card, index) => ({ card, index, keys: sortKeysOf(info(card), typeOrder, card?.n, colorOrder) }));
  const sign = (key) => (sorts[key] === 2 ? -1 : 1);
  keyed.sort((a, b) => {
    if (sorts.type) { const d = a.keys.type - b.keys.type; if (d) return d * sign('type'); }
    if (sorts.color) {
      let d = (a.keys.color - b.keys.color) || (a.keys.colors < b.keys.colors ? -1 : a.keys.colors > b.keys.colors ? 1 : 0);
      if (!d && !sorts.type) d = a.keys.land - b.keys.land; // (with the type sort off, the lands of a colour come after its spells)
      if (d) return d * sign('color');
    }
    if (sorts.cost) { const d = a.keys.cost - b.keys.cost; if (d) return d * sign('cost'); }
    if (sorts.name) { const d = a.keys.name.localeCompare(b.keys.name, 'en', { sensitivity: 'base' }); if (d) return d * sign('name'); }
    return a.index - b.index;
  });
  return keyed.map((entry) => entry.card);
}
