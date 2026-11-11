// Tests for the hand: shared/hand-sort.mjs (the three sorts, the type order), shared/hand-layout.mjs (the fan and the gap) and reorderHand in shared/zones.mjs.
import { SORT_KEYS, TYPE_KEYS, DEFAULT_TYPE_ORDER, noSorts, anySortOn, cleanSorts, nextSortState, sortWords, normalizeTypeOrder, moveType, sortKeysOf, sortHand } from '../shared/hand-sort.mjs';
import { handLayout, insertionIndex, cardStep, MAX_ANGLE } from '../shared/hand-layout.mjs';
import { reorderHand } from '../shared/zones.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };
const check = (label, condition, detail = '') => { checks++; if (!condition) fail(label, detail); };
const DASH = String.fromCharCode(0x2014);

// ---- the sort buttons: off, the first way, the other way, off ----
same('the three sorts', SORT_KEYS, ['color', 'type', 'cost']);
same('all off to start', noSorts(), { color: 0, type: 0, cost: 0 });
let state = noSorts();
const seen = [];
for (let n = 0; n < 4; n++) { state = nextSortState(state, 'cost'); seen.push(state.cost); }
same('a click goes off, first way, other way, off, and round again', seen, [1, 2, 0, 1]);
same('a click changes only its own sort', nextSortState({ color: 1, type: 2, cost: 0 }, 'cost'), { color: 1, type: 2, cost: 1 });
same('an unknown key changes nothing', nextSortState({ color: 1, type: 0, cost: 0 }, 'weight'), { color: 1, type: 0, cost: 0 });
same('a damaged saved state is cleaned: only 1 and 2 count', cleanSorts({ color: 3, type: '1', cost: 2, extra: 1 }), { color: 0, type: 0, cost: 2 });
same('nothing, a string and null are all off', [cleanSorts(undefined), cleanSorts('x'), cleanSorts(null)], [noSorts(), noSorts(), noSorts()]);
same('any sort on', [anySortOn(noSorts()), anySortOn({ color: 0, type: 0, cost: 2 }), anySortOn(null)], [false, true, false]);
check('the words say what a click does in each state', /Click again to reverse/.test(sortWords('cost', 0)) && /low to high/.test(sortWords('cost', 1)) && /Click for high to low/.test(sortWords('cost', 1)) && /Click to turn it off/.test(sortWords('cost', 2)) && /white to green/.test(sortWords('color', 1)));

// ---- the type order ----
same('the default order is the one Kevin listed', DEFAULT_TYPE_ORDER, ['creature', 'instant', 'sorcery', 'enchantment', 'artifact', 'planeswalker', 'land']);
same('a saved order keeps its order and gets the missing types at the end', normalizeTypeOrder(['land', 'creature']), ['land', 'creature', 'instant', 'sorcery', 'enchantment', 'artifact', 'planeswalker']);
same('repeats, unknown names and junk are dropped', normalizeTypeOrder(['creature', 'creature', 'dragon', 7, null]), ['creature', 'instant', 'sorcery', 'enchantment', 'artifact', 'planeswalker', 'land']);
same('not a list gives the default', [normalizeTypeOrder(undefined), normalizeTypeOrder('x')], [DEFAULT_TYPE_ORDER, DEFAULT_TYPE_ORDER]);
same('moving a pill', moveType(DEFAULT_TYPE_ORDER, 6, 0), ['land', 'creature', 'instant', 'sorcery', 'enchantment', 'artifact', 'planeswalker']);
same('moving a pill forward', moveType(DEFAULT_TYPE_ORDER, 0, 2), ['instant', 'sorcery', 'creature', 'enchantment', 'artifact', 'planeswalker', 'land']);
same('a bad index or the same place changes nothing', [moveType(DEFAULT_TYPE_ORDER, 9, 0), moveType(DEFAULT_TYPE_ORDER, 2, 2), moveType(DEFAULT_TYPE_ORDER, -1, 2), moveType(DEFAULT_TYPE_ORDER, 1.5, 2)], [DEFAULT_TYPE_ORDER, DEFAULT_TYPE_ORDER, DEFAULT_TYPE_ORDER, DEFAULT_TYPE_ORDER]);
const before = [...DEFAULT_TYPE_ORDER];
moveType(DEFAULT_TYPE_ORDER, 0, 3);
same('the order given is not changed', DEFAULT_TYPE_ORDER, before);
same('every type has a place', TYPE_KEYS.length, 7);

// ---- sorting a hand ----
const card = (name, t, m) => ({ uid: name, n: name, t, m });
const info = (c) => ({ t: c.t, m: c.m });
const hand = [
  card('Forest', 'Basic Land ' + DASH + ' Forest', ''),
  card('Bolt', 'Instant', '{R}'),
  card('Growth', 'Instant', '{G}'),
  card('Elf', 'Creature ' + DASH + ' Elf', '{G}'),
  card('Dragon', 'Creature ' + DASH + ' Dragon', '{4}{R}{R}'),
  card('Ring', 'Artifact', '{1}'),
  card('Charm', 'Instant', '{R}{W}'),
  card('Wrath', 'Sorcery', '{2}{W}{W}'),
  card('Jace', 'Legendary Planeswalker ' + DASH + ' Jace', '{2}{U}{U}'),
  card('Aura', 'Enchantment ' + DASH + ' Aura', '{1}{W}'),
  card('Counter', 'Instant', '{U}{U}'),
  card('Ritual', 'Instant', '{B}'),
];
const names = (cards) => cards.map((c) => c.n).join(' ');
const view = (sorts, typeOrder) => names(sortHand(hand, sorts, { typeOrder, info }));
same('no sort leaves the hand in the player\'s own order', view(noSorts()), names(hand));
same('by cost: low to high, a tie keeps the hand\'s own order, lands are 0', view({ color: 0, type: 0, cost: 1 }), 'Forest Bolt Growth Elf Ring Ritual Charm Aura Counter Wrath Jace Dragon');
same('by cost the other way round: high to low, ties still in the hand\'s own order', view({ color: 0, type: 0, cost: 2 }), 'Dragon Wrath Jace Charm Aura Counter Bolt Growth Elf Ring Ritual Forest');
same('by type, in the default order (creatures, instants, sorceries, enchantments, artifacts, planeswalkers, lands), ties in the hand\'s order', view({ color: 0, type: 1, cost: 0 }), 'Elf Dragon Bolt Growth Charm Counter Ritual Wrath Aura Ring Jace Forest');
same('by type reversed', view({ color: 0, type: 2, cost: 0 }), 'Forest Jace Ring Aura Wrath Bolt Growth Charm Counter Ritual Elf Dragon');
same('by type with the player\'s own order (lands first, then planeswalkers)', view({ color: 0, type: 1, cost: 0 }, ['land', 'planeswalker']), 'Forest Jace Elf Dragon Bolt Growth Charm Counter Ritual Wrath Aura Ring');
same('by color: white, blue, black, red, green, two colors, colorless (lands and the Ring), ties in the hand\'s order', view({ color: 1, type: 0, cost: 0 }), 'Wrath Aura Jace Counter Ritual Bolt Dragon Growth Elf Charm Forest Ring');
same('color decides first, then type, then cost: all three on', view({ color: 1, type: 1, cost: 1 }), 'Wrath Aura Counter Jace Ritual Dragon Bolt Elf Growth Charm Ring Forest');
const first = sortHand(hand, { color: 1, type: 1, cost: 1 }, { info });
const rank = (c) => sortKeysOf(info(c), DEFAULT_TYPE_ORDER);
let ordered = true;
for (let i = 1; i < first.length; i++) {
  const a = rank(first[i - 1]); const b = rank(first[i]);
  const ka = [a.color, a.colors, a.type, a.cost]; const kb = [b.color, b.colors, b.type, b.cost];
  for (let k = 0; k < ka.length; k++) { if (ka[k] < kb[k]) break; if (ka[k] > kb[k]) { ordered = false; break; } }
}
check('with all three on, every card is no later than the next by (color, then type, then cost)', ordered, names(first));
const reversedColor = sortHand(hand, { color: 2, type: 1, cost: 1 }, { info });
check('color the other way round puts colorless first, green next, and the type and cost sorts still work inside each color', rank(reversedColor[0]).color === 6 && rank(reversedColor.at(-1)).color === 0, names(reversedColor));
same('a card the card list does not know sorts as colorless, typeless and free (after the other types, before nothing)', names(sortHand([{ uid: 'x', n: 'Mystery' }, card('Elf', 'Creature', '{G}')], { color: 0, type: 1, cost: 0 }, { info: (c) => (c.n === 'Mystery' ? null : info(c)) })), 'Elf Mystery');
const copy = [...hand];
sortHand(hand, { color: 1, type: 1, cost: 1 }, { info });
same('the hand given is never changed', hand, copy);
same('not a list gives an empty hand', [sortHand(null, { color: 1 }), sortHand(undefined, noSorts())], [[], []]);
same('a drawn card goes where the sort puts it at once: a one-mana card drawn last lands after the other five one-mana cards (place 6, after the land)', names(sortHand([...hand, card('Zap', 'Instant', '{R}')], { color: 0, type: 0, cost: 1 }, { info })).split(' ').indexOf('Zap'), 6);

// ---- the fan ----
const W = 800; const CW = 80; const CH = 112;
same('the step is a card wide when the cards fit', cardStep({ slots: 5, width: W, cardWidth: CW }), CW);
same('the step shrinks to fit a full hand', cardStep({ slots: 20, width: W, cardWidth: CW }), (W - CW) / 19);
same('a single card or none has no step', [cardStep({ slots: 1, width: W, cardWidth: CW }), cardStep({ slots: 0, width: W, cardWidth: CW })], [0, 0]);
const row = handLayout({ count: 7, width: W, cardWidth: CW, cardHeight: CH });
same('seven cards: edge to edge', row.slots.map((s, i) => i === 0 ? 0 : Math.round(s.x - row.slots[i - 1].x)), [0, 80, 80, 80, 80, 80, 80]);
check('the row is centred in its width', Math.abs(row.slots[0].x - (W - (CW * 7)) / 2) < 0.01 && Math.abs((W - (row.slots[6].x + CW)) - row.slots[0].x) < 0.01);
check('the middle card is straight and the ends lean outward by the full turn', row.slots[3].angle === 0 && row.slots[0].angle === -MAX_ANGLE && row.slots[6].angle === MAX_ANGLE, JSON.stringify(row.slots.map((s) => s.angle)));
check('the ends sit lower than the middle', row.slots[0].y > row.slots[3].y && row.slots[6].y > row.slots[3].y && row.slots[3].y === 0);
const few = handLayout({ count: 2, width: W, cardWidth: CW, cardHeight: CH });
check('two cards hardly fan', Math.abs(few.slots[0].angle) < MAX_ANGLE / 3 && Math.abs(few.slots[1].angle) < MAX_ANGLE / 3, JSON.stringify(few.slots));
same('one card is straight and centred', handLayout({ count: 1, width: W, cardWidth: CW, cardHeight: CH }).slots, [{ x: 360, y: 0, angle: 0 }]);
same('no cards, no slots', handLayout({ count: 0, width: W, cardWidth: CW, cardHeight: CH }).slots, []);
const full = handLayout({ count: 20, width: W, cardWidth: CW, cardHeight: CH });
check('twenty cards overlap evenly and still fit inside the width', full.slots[0].x >= -0.01 && full.slots[19].x + CW <= W + 0.01 && full.step < CW, JSON.stringify([full.slots[0], full.slots[19], full.step]));
const gapped = handLayout({ count: 6, width: W, cardWidth: CW, cardHeight: CH, gap: 2 });
same('a gap at 2 opens one empty place: the cards after it move up a place', [gapped.slots[1].x + 80, gapped.slots[2].x - gapped.slots[1].x], [gapped.slots[2].x - 80, 160]);
const leanLeft = handLayout({ count: 6, width: W, cardWidth: CW, cardHeight: CH, gap: 3 });
const base = handLayout({ count: 7, width: W, cardWidth: CW, cardHeight: CH }); // the same seven places with nobody dragged
check('beside the gap a card leans 12 degrees away from it (left of it counter-clockwise, right of it clockwise), compared with the same places and no gap', Math.abs(leanLeft.slots[2].angle - (base.slots[2].angle - 12)) < 0.02 && Math.abs(leanLeft.slots[3].angle - (base.slots[4].angle + 12)) < 0.02, JSON.stringify([leanLeft.slots.map((s) => s.angle), base.slots.map((s) => s.angle)]));
check('three places from the gap it leans a third as much, and four places away not at all', Math.abs(leanLeft.slots[0].angle - (base.slots[0].angle - 4)) < 0.02 && Math.abs(handLayout({ count: 7, width: W, cardWidth: CW, cardHeight: CH, gap: 4 }).slots[0].angle - handLayout({ count: 8, width: W, cardWidth: CW, cardHeight: CH }).slots[0].angle) < 0.02);
same('a gap at the end or the start is allowed and a gap past the end is clamped', [handLayout({ count: 3, width: W, cardWidth: CW, cardHeight: CH, gap: 0 }).slots.length, handLayout({ count: 3, width: W, cardWidth: CW, cardHeight: CH, gap: 3 }).slots.length, handLayout({ count: 3, width: W, cardWidth: CW, cardHeight: CH, gap: 99 }).slots.map((s) => s.x).join()], [3, 3, handLayout({ count: 3, width: W, cardWidth: CW, cardHeight: CH, gap: 3 }).slots.map((s) => s.x).join()]);
check('every number is finite, also for bad input', [handLayout({ count: -2, width: 0, cardWidth: 0, cardHeight: 0 }), handLayout({ count: 3, width: 10, cardWidth: 80, cardHeight: 100, gap: 1 })].every((l) => l.slots.every((s) => Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.angle))));

// ---- where a dragged card goes back ----
const at = (x, count = 5) => insertionIndex({ count, width: W, cardWidth: CW, x });
same('left of all the cards is place 0, right of all is the end', [at(0), at(W)], [0, 5]);
same('with five cards (middles at 240, 320, 400, 480 and 560) a pointer at 330 has passed two of them: place 2', at(330), 2);
same('the places come in order as the pointer moves right', [0, 200, 300, 400, 500, 600, 800].map((x) => at(x)).every((v, i, all) => i === 0 || v >= all[i - 1]), true);
same('with nothing in the row the place is 0', insertionIndex({ count: 0, width: W, cardWidth: CW, x: 400 }), 0);
same('the pointer on the middle of a card puts the dragged card after the ones whose middle it has passed', [at(360 - 1, 1), at(441, 1)], [0, 1]);

// ---- rearranging the hand ----
const game = { zones: { hand: [{ uid: 'a' }, { uid: 'b' }, { uid: 'c' }, { uid: 'd' }], library: [{ uid: 'z' }], battlefield: [], graveyard: [], exile: [], command: [], sideboard: [] } };
const order = (g) => g.zones.hand.map((c) => c.uid).join('');
same('a card moves to the left end', order(reorderHand(game, 'd', 0)), 'dabc');
same('a card moves to the right end', order(reorderHand(game, 'a', 3)), 'bcda');
same('a card moves to the middle', order(reorderHand(game, 'a', 2)), 'bcad');
same('an index past the end is the end, below 0 is the start', [order(reorderHand(game, 'a', 99)), order(reorderHand(game, 'd', -5))], ['bcda', 'dabc']);
check('the same place gives the same game back, not a copy', reorderHand(game, 'b', 1) === game && reorderHand(game, 'b', 1.5) === game);
check('the other zones are untouched and the old game is not changed', reorderHand(game, 'a', 3).zones.library === game.zones.library && order(game) === 'abcd');
let threw = false; try { reorderHand(game, 'z', 0); } catch (error) { threw = /not in your hand/.test(error.message); }
check('a card that is not in the hand is refused in words', threw);
const frozen = JSON.parse(JSON.stringify(game)); Object.freeze(frozen.zones.hand);
check('it works on a frozen hand (nothing is changed in place)', order(reorderHand(frozen, 'c', 0)) === 'cabd');

console.log(`All ${checks} hand checks passed.`);
