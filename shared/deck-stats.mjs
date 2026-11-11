// Numbers about a checked deck, for the information below it: how many cards, the mana curve, how much of each color the costs ask for, the average and median mana value.
// Plain data in, plain data out, no browser code, so Node tests can load it (scripts/test-deck-stats.mjs). The input is the lines of a preview (shared/deck-preview.mjs).
//
// What counts: the main deck and the commander(s), matched lines only. The sideboard, the companion and the maybeboard do not count (the companion starts outside the deck, like a sideboard card).
// A card's mana value is read from its cost (shared/deck-view.mjs manaValue); a card with two costs counts by its first. Lands have no cost, so they are counted apart.
import { parseCost } from './mana-cost.mjs';
import { categoryOf, manaValue, CATEGORY_ORDER } from './deck-view.mjs';

export const COLOR_KEYS = ['W', 'U', 'B', 'R', 'G'];
export const CURVE_TOP = 7; // seven and more share the last column
const NOT_COUNTED = ['sideboard', 'maybeboard', 'companion'];

// The colored mana a cost asks for, as { W, U, B, R, G, C } (numbers, because a hybrid symbol is split evenly between its colors and so can give a half). {2/W} is one white,
// {G/P} is one green, {C} is one colorless; generic numbers, X and snow ask for no color.
export function pipsOf(cost) {
  const out = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  for (const symbol of parseCost(cost)[0] ?? []) {
    if (symbol.kind === 'colorless') out.C += 1;
    else if (symbol.colors.length > 0) for (const color of symbol.colors) out[color] += 1 / symbol.colors.length;
  }
  return out;
}

const average = (sum, count) => (count > 0 ? sum / count : 0);
// The median of values with a count each: [[value, count], ...].
function median(pairs) {
  const total = pairs.reduce((sum, [, count]) => sum + count, 0);
  if (total === 0) return 0;
  const sorted = [...pairs].sort((a, b) => a[0] - b[0]);
  const at = (position) => { let seen = 0; for (const [value, count] of sorted) { seen += count; if (position < seen) return value; } return 0; };
  return total % 2 === 1 ? at((total - 1) / 2) : (at(total / 2 - 1) + at(total / 2)) / 2;
}

export function deckStats(lines) {
  const cards = (Array.isArray(lines) ? lines : []).filter((line) => line && line.status === 'matched' && line.card && !NOT_COUNTED.includes(line.section));
  const curve = Array.from({ length: CURVE_TOP + 1 }, (_, value) => ({ value, permanents: 0, spells: 0 }));
  const types = Object.fromEntries(CATEGORY_ORDER.map((key) => [key, 0]));
  const pips = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  let total = 0, lands = 0, valueSum = 0;
  const spellValues = [], allValues = [];
  for (const line of cards) {
    const qty = line.qty;
    const type = categoryOf(line.card.t);
    total += qty;
    types[type] += qty;
    const value = type === 'land' ? 0 : manaValue(line.card.m);
    allValues.push([value, qty]);
    if (type === 'land') { lands += qty; continue; }
    valueSum += value * qty;
    spellValues.push([value, qty]);
    curve[Math.min(value, CURVE_TOP)][type === 'instant' || type === 'sorcery' ? 'spells' : 'permanents'] += qty;
    const found = pipsOf(line.card.m);
    for (const key of Object.keys(pips)) pips[key] += found[key] * qty;
  }
  const spells = total - lands;
  const pipTotal = Object.values(pips).reduce((sum, n) => sum + n, 0);
  return {
    total, lands, spells,
    averageWithLands: average(valueSum, total), averageWithoutLands: average(valueSum, spells),
    medianWithLands: median(allValues), medianWithoutLands: median(spellValues),
    totalValue: valueSum,
    curve, curveMax: Math.max(0, ...curve.map((column) => column.permanents + column.spells)),
    types,
    pips, pipTotal, shares: Object.fromEntries(Object.keys(pips).map((key) => [key, pipTotal > 0 ? pips[key] / pipTotal : 0])),
  };
}
