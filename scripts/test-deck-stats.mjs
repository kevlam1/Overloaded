// Tests for shared/deck-stats.mjs: the numbers shown below a deck.
import { deckStats, pipsOf, COLOR_KEYS, CURVE_TOP } from '../shared/deck-stats.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };
const close = (label, actual, expected) => { checks++; if (Math.abs(actual - expected) > 1e-9) fail(label, `expected ${expected}, got ${actual}`); };
const DASH = String.fromCharCode(0x2014);

// ---- the pips of one cost ----
same('colored pips count one each; generic, X and snow ask for no color', pipsOf('{2}{G}{G}'), { W: 0, U: 0, B: 0, R: 0, G: 2, C: 0 });
same('X and snow', pipsOf('{X}{S}{R}'), { W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 });
same('a hybrid symbol is split evenly between its two colors', pipsOf('{W/U}'), { W: 0.5, U: 0.5, B: 0, R: 0, G: 0, C: 0 });
same('{2/W} is one white, {G/P} is one green, {C} is one colorless', pipsOf('{2/W}{G/P}{C}'), { W: 1, U: 0, B: 0, R: 0, G: 1, C: 1 });
same('a card with two costs counts by its first', pipsOf('{R} // {2}{W}{W}'), { W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 });
same('no cost, no text and a number give no pips', [pipsOf(''), pipsOf(undefined), pipsOf(5)].map((p) => Object.values(p).reduce((a, b) => a + b, 0)), [0, 0, 0]);

// ---- a small deck ----
const line = (name, t, m, qty = 1, section = 'main', status = 'matched') => ({ key: name, section, qty, status, name, card: status === 'matched' ? { i: 'id-' + name, n: name, t, m } : null });
const lines = [
  line('Forest', 'Basic Land ' + DASH + ' Forest', '', 10), line('Mountain', 'Basic Land ' + DASH + ' Mountain', '', 5),
  line('Bolt', 'Instant', '{R}', 4), line('Growth', 'Instant', '{G}', 2), line('Ring', 'Artifact', '{1}', 1), line('Elf', 'Creature ' + DASH + ' Elf', '{G}', 3),
  line('Dragon', 'Creature ' + DASH + ' Dragon', '{4}{R}{R}', 1), line('Titan', 'Creature', '{8}{G}{G}', 1), line('Krenko', 'Legendary Creature', '{2}{R}{R}', 1, 'commander'),
  line('Side', 'Instant', '{R}', 3, 'sideboard'), line('Maybe', 'Instant', '{R}', 3, 'maybeboard'), line('Comp', 'Creature', '{3}', 1, 'companion'), line('Nope', '', '', 2, 'main', 'not_found'),
];
const s = deckStats(lines);
same('the sideboard, companion, maybeboard and unmatched lines are not counted: 28 cards, 15 lands, 13 spells', [s.total, s.lands, s.spells], [28, 15, 13]);
same('the mana curve: each column splits permanents and spells; seven and more share a column', s.curve.map((c) => [c.value, c.permanents, c.spells]), [[0, 0, 0], [1, 4, 6], [2, 0, 0], [3, 0, 0], [4, 1, 0], [5, 0, 0], [6, 1, 0], [7, 1, 0]]);
same('the columns run 0 to 7', [s.curve.length, CURVE_TOP], [8, 7]);
same('the tallest column', s.curveMax, 10);
close('the sum of mana value times count', s.totalValue, 4 * 1 + 2 * 1 + 1 + 3 * 1 + 6 + 10 + 4);
close('without lands', s.averageWithoutLands, 30 / 13);
close('with lands', s.averageWithLands, 30 / 28);
same('the median without lands is the middle of the sorted values; with lands the zeros come first', [s.medianWithoutLands, s.medianWithLands], [1, 0]);
same('cards by type', [s.types.land, s.types.creature, s.types.instant, s.types.artifact], [15, 6, 6, 1]);
close('red pips: 4 bolts, 2 on the dragon, 2 on Krenko', s.pips.R, 4 + 2 + 2);
close('green pips: 2 growths, 3 elves, 2 on the titan', s.pips.G, 2 + 3 + 2);
close('shares add up to one', COLOR_KEYS.concat('C').reduce((n, k) => n + s.shares[k], 0), 1);
close('the red share', s.shares.R, 8 / 15);

// ---- odd input ----
const empty = deckStats([]);
same('an empty deck is all zeros and shares are zero, not NaN', [empty.total, empty.averageWithLands, empty.averageWithoutLands, empty.medianWithLands, empty.pipTotal, empty.shares.R, empty.curveMax], [0, 0, 0, 0, 0, 0, 0]);
same('bad input is an empty deck', [deckStats(null).total, deckStats([null, undefined, {}]).total], [0, 0]);
same('a deck of only lands has no spells and an average of zero', (({ spells, averageWithoutLands }) => [spells, averageWithoutLands])(deckStats([line('Forest', 'Basic Land', '', 40)])), [0, 0]);
same('a median of an even count is the mean of the two middle values', deckStats([line('A', 'Creature', '{1}'), line('B', 'Creature', '{3}')]).medianWithoutLands, 2);

console.log(`All ${checks} deck stats checks passed.`);
