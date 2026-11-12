// Tests for the hand: shared/hand-sort.mjs (the three sorts, the type order), shared/hand-layout.mjs (the fan, the places while a card is carried, and which place the carried card is over) and reorderHand in shared/zones.mjs.
import { SORT_KEYS, TYPE_KEYS, DEFAULT_TYPE_ORDER, noSorts, anySortOn, cleanSorts, nextSortState, sortWords, normalizeTypeOrder, moveType, sortKeysOf, sortHand } from '../shared/hand-sort.mjs';
import { handLayout, handLayoutSelected, layoutAround, holeAt, cardStep, MAX_ANGLE, SPREAD, MAX_WIDE_CARDS } from '../shared/hand-layout.mjs';
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
same('the step shrinks to fit a hand in a narrow room', cardStep({ slots: 20, width: 300, cardWidth: CW }), (300 - CW) / 19);
same('a single card or none has no step', [cardStep({ slots: 1, width: W, cardWidth: CW }), cardStep({ slots: 0, width: W, cardWidth: CW })], [0, 0]);
const row = handLayout({ count: 7, width: W, cardWidth: CW, cardHeight: CH });
same('seven cards: they overlap a little, like a real hand (a step of 72 of 80)', row.slots.map((s, i) => i === 0 ? 0 : Math.round(s.x - row.slots[i - 1].x)), [0, 72, 72, 72, 72, 72, 72]);
same('six cards are still edge to edge and the step is continuous at the change', [cardStep({ slots: 6, width: W, cardWidth: CW }), cardStep({ slots: 7, width: W, cardWidth: CW }) < CW, cardStep({ slots: 7, width: W, cardWidth: CW }) > cardStep({ slots: 20, width: W, cardWidth: CW })], [CW, true, true]);
const rowOf = (n, width = 2000) => Math.round((CW + cardStep({ slots: n, width, cardWidth: CW }) * (n - 1)) / CW * 100) / 100;
same('the hand stops growing at 7 cards: 7 cards are 6.4 cards wide, and so are 8, 10, 15 and 40 (more cards overlap more)', [rowOf(7), rowOf(8), rowOf(10), rowOf(15), rowOf(40)], [6.4, 6.4, 6.4, 6.4, 6.4]);
same('below 7 the row still grows with each card: 4, 5, 6 and 7 cards are 4, 5, 6 and 6.4 cards wide', [rowOf(4), rowOf(5), rowOf(6), rowOf(7)], [4, 5, 6, 6.4]);
same('the number of cards the width stops growing at is 7', MAX_WIDE_CARDS, 7);
same('a card more or fewer than 7 does not change the width after 7, but the step gets smaller: 10 cards are squeezed to 54/90 of a card a step', Math.round(cardStep({ slots: 10, width: 2000, cardWidth: CW }) / CW * 1000) / 1000, 0.6);
same('a narrow room still squeezes the overlapping row to fit', Math.round(CW + cardStep({ slots: 10, width: 400, cardWidth: CW }) * 9), 400);
same('five cards in a narrow room are squeezed to fit too', Math.round(CW + cardStep({ slots: 5, width: 240, cardWidth: CW }) * 4), 240);
check('the row is centred in its width', Math.abs(row.slots[0].x - (W - (CW + 72 * 6)) / 2) < 0.01 && Math.abs((W - (row.slots[6].x + CW)) - row.slots[0].x) < 0.01);
check('the middle card is straight and the ends lean outward by the full turn', row.slots[3].angle === 0 && row.slots[0].angle === -MAX_ANGLE && row.slots[6].angle === MAX_ANGLE, JSON.stringify(row.slots.map((s) => s.angle)));
check('the ends sit lower than the middle', row.slots[0].y > row.slots[3].y && row.slots[6].y > row.slots[3].y && row.slots[3].y === 0);
const few = handLayout({ count: 2, width: W, cardWidth: CW, cardHeight: CH });
check('two cards fan only a little (at most 40% of the full turn)', Math.abs(few.slots[0].angle) <= MAX_ANGLE * 0.4 && Math.abs(few.slots[1].angle) <= MAX_ANGLE * 0.4 && Math.abs(few.slots[0].angle) > 0, JSON.stringify(few.slots));
same('one card is straight and centred', handLayout({ count: 1, width: W, cardWidth: CW, cardHeight: CH }).slots, [{ x: 360, y: 0, angle: 0 }]);
same('no cards, no slots', handLayout({ count: 0, width: W, cardWidth: CW, cardHeight: CH }).slots, []);
const full = handLayout({ count: 20, width: W, cardWidth: CW, cardHeight: CH });
check('twenty cards overlap evenly and still fit inside the width', full.slots[0].x >= -0.01 && full.slots[19].x + CW <= W + 0.01 && full.step < CW, JSON.stringify([full.slots[0], full.slots[19], full.step]));
// ---- carrying a card: the places never change, only which place is the hole ----
const base = handLayout({ count: 7, width: W, cardWidth: CW, cardHeight: CH });
const around = (hole, total = 7) => layoutAround({ total, width: W, cardWidth: CW, cardHeight: CH, hole });
same('with a card carried the other cards are one fewer', [around(0).slots.length, around(3).slots.length, around(6).slots.length], [6, 6, 6]);
check('the places are exactly the places of the whole hand whichever place the hole is at (so nothing moves under the pointer when the hole moves)', [0, 1, 2, 3, 4, 5, 6].every((hole) => around(hole).slots.every((s, k) => s.x === base.slots[k >= hole ? k + 1 : k].x && s.y === base.slots[k >= hole ? k + 1 : k].y)), JSON.stringify(around(3).slots.map((s) => s.x)));
check('the step does not change either', [0, 3, 6].every((hole) => around(hole).step === base.step));
const lean3 = around(3);
// the hole at place 3: the card before it (place 2) is card 2, the one after it (place 4) is card 3
same('the card beside the hole leans 7 degrees away from it (left of it counter-clockwise, right of it clockwise)', [Math.round((lean3.slots[2].angle - base.slots[2].angle) * 100) / 100, Math.round((lean3.slots[3].angle - base.slots[4].angle) * 100) / 100], [-7, 7]);
same('two places from the hole it leans half as much', [Math.round((lean3.slots[1].angle - base.slots[1].angle) * 100) / 100, Math.round((lean3.slots[4].angle - base.slots[5].angle) * 100) / 100], [-3.5, 3.5]);
same('three places from the hole it does not lean', [lean3.slots[0].angle - base.slots[0].angle, lean3.slots[5].angle - base.slots[6].angle], [0, 0]);
same('a hole at the start or the end is allowed, below 0 is the start and past the end is the end', [around(-5).slots.map((s) => s.x).join() === around(0).slots.map((s) => s.x).join(), around(99).slots.map((s) => s.x).join() === around(6).slots.map((s) => s.x).join()], [true, true]);
same('a hand of one carried card has no other cards, and nothing has none', [layoutAround({ total: 1, width: W, cardWidth: CW, cardHeight: CH, hole: 0 }).slots, layoutAround({ total: 0, width: W, cardWidth: CW, cardHeight: CH, hole: 0 }).slots], [[], []]);
check('every number is finite, also for bad input', [handLayout({ count: -2, width: 0, cardWidth: 0, cardHeight: 0 }), layoutAround({ total: 3, width: 10, cardWidth: 80, cardHeight: 100, hole: 1 }), layoutAround({ total: 3, width: 10, cardWidth: 80, cardHeight: 100, hole: 'x' })].every((l) => l.slots.every((s) => Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.angle))));

// ---- which place the carried card is over ----
const over = (x, previous = null, total = 5) => holeAt({ total, width: W, cardWidth: CW, x, previous });
// five cards in 800: the step is 80, the row starts at 200, so the middles of the places are 240, 320, 400, 480 and 560
same('left of all the places is place 0, right of all is the last', [over(0), over(W)], [0, 4]);
same('the pointer is over the place whose middle is nearest', [over(240), over(330), over(361), over(450), over(530)], [0, 1, 2, 3, 4]);
same('a hand of one or none has only place 0', [holeAt({ total: 1, width: W, cardWidth: CW, x: 700 }), holeAt({ total: 0, width: W, cardWidth: CW, x: 700 })], [0, 0]);
same('moving right one pixel at a time, the place only ever goes up, and visits every place', (() => { let previous = null; const seen = []; for (let x = 0; x <= W; x++) { previous = over(x, previous); seen.push(previous); } return [seen.every((v, i) => i === 0 || v >= seen[i - 1]), [...new Set(seen)].join()]; })(), [true, '0,1,2,3,4']);
same('moving left one pixel at a time, the place only ever goes down', (() => { let previous = 4; const seen = []; for (let x = W; x >= 0; x--) { previous = over(x, previous); seen.push(previous); } return seen.every((v, i) => i === 0 || v <= seen[i - 1]); })(), true);
// the line between place 1 (middle 320) and place 2 (middle 400) is at 360; a hole that is on place 1 stays there until the pointer is more than 0.75 of a step (60) from its middle, that is a quarter of a step past the line
same('the hole stays on place 1 a little past the line (370) when it was there, but a pointer that was never there is over place 2', [over(370, 1), over(370)], [1, 2]);
same('...and leaves it once the pointer is a quarter of a step beyond the half way line (381)', [over(380, 1), over(381, 1)], [1, 2]);
same('...and the same going back: a hole on place 2 stays at 350 and leaves at 339', [over(350, 2), over(339, 2)], [2, 1]);
same('a pointer shaking 3 pixels either side of the line between two places changes the hole at most once', (() => { let previous = null; let changes = 0; let last = null; for (let i = 0; i < 200; i++) { previous = over(360 + (i % 2 ? 3 : -3), previous); if (last !== null && previous !== last) changes++; last = previous; } return changes <= 1; })(), true);
same('an old place that does not exist is ignored', [over(240, 99), over(240, -1), over(240, 1.5)], [0, 0, 0]);


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

// ---- a clicked card comes up and the whole of each side moves aside ----
const sel = (n, index, width = 1200) => handLayoutSelected({ count: n, width, cardWidth: 80, cardHeight: 112, index });
const plain5 = handLayout({ count: 5, width: 1200, cardWidth: 80, cardHeight: 112 });
const sel5 = sel(5, 2);
same('with room, every card to the left of the clicked one moves left by 0.55 of a card (44) and every card to the right moves right by 44; the clicked one stays where it was', sel5.slots.map((spot, k) => Math.round((spot.x - plain5.slots[k].x) * 100) / 100), [-44, -44, 0, 44, 44]);
same('the heights and the turns are those of the same places in the plain hand', sel5.slots.every((spot, k) => spot.y === plain5.slots[k].y && spot.angle === plain5.slots[k].angle), true);
same('the clicked card at the left end: it stays and all the others move right by 44', sel(5, 0).slots.map((spot, k) => Math.round((spot.x - plain5.slots[k].x) * 100) / 100), [0, 44, 44, 44, 44]);
{ // the whole hand is wider by two shifts when there is room, and stays centred
  const xs = sel5.slots.map((spot) => spot.x);
  same('the hand stays centred: the room left of the first card and right of the last card are the same', Math.round((xs[0] - (1200 - (xs.at(-1) + 80))) * 100) / 100, 0);
}
{ // a hand that fills the width: nothing leaves it, the sides close up, and the clicked card has a full gap on each side
  const full = sel(12, 5, 900); const cw = 80;
  const xs = full.slots.map((spot) => spot.x);
  same('in a hand that fills its width every card stays inside it (the sides close up to make the room)', xs[0] >= -0.01 && xs.at(-1) + cw <= 900.01, true);
  const stepAside = xs[5] - xs[4]; const stepAfter = xs[6] - xs[5];
  same('the clicked card is at least 0.9 of a card from each neighbour (it can be read)', [stepAside >= cw * 0.9, stepAfter >= cw * 0.9], [true, true]);
  same('the cards on each side keep one step between them (the whole side moves, not a few)', [Math.round((xs[1] - xs[0]) * 100) / 100 === Math.round((xs[4] - xs[3]) * 100) / 100, Math.round((xs[8] - xs[7]) * 100) / 100 === Math.round((xs[11] - xs[10]) * 100) / 100], [true, true]);
  same('the order of the cards never changes', xs.every((x, k) => k === 0 || x > xs[k - 1]), true);
}
same('a place that is not one of the cards, or a hand of one, is the plain hand', [sel(5, 99).slots.map((s2) => s2.x).join() === plain5.slots.map((s2) => s2.x).join(), sel(5, -1).slots.length, sel(1, 0).slots.length, sel(0, 0).slots.length], [true, 5, 1, 0]);
same('the constant is what the tests assume', SPREAD, 0.55);

console.log(`All ${checks} hand checks passed.`);
