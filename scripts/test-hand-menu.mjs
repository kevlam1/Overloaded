// Tests for shared/hand-menu.mjs: the menu of the hand (Mulligan, Shuffle hand into library, Discard X at random, Discard hand).
import { makeGame, checkGame, seededRandom, ZONES } from '../shared/zones.mjs';
import { handMenuItems, handAction } from '../shared/hand-menu.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };
const check = (label, condition, detail = '') => { checks++; if (!condition) fail(label, detail); };

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const deck = { cards: [{ i: id(1), n: 'Forest', qty: 20, section: 'main' }, { i: id(2), n: 'Island', qty: 10, section: 'main' }, { i: id(3), n: 'Goblin Guide', qty: 10, section: 'main' }], commander: [] };
const fresh = () => makeGame(deck, () => ({ t: 'Basic Land', m: '', k: [] }), { random: seededRandom(8) });
const uids = (game, zone) => game.zones[zone].map((c) => c.uid);
const total = (game) => ZONES.reduce((sum, zone) => sum + game.zones[zone].length, 0);

// the items
same('a hand with cards: Mulligan, Shuffle hand into library, Discard X at random, Discard hand', handMenuItems(7).map((i) => [i.id, i.label, i.ask ?? null]), [['mulligan', 'Mulligan', null], ['shuffleinto', 'Shuffle hand into library', null], ['discardrandom', 'Discard X at random...', { max: 7, unit: 'cards' }], ['discardall', 'Discard hand', null]]);
same('an empty hand can only mulligan', handMenuItems(0).map((i) => i.id), ['mulligan']);
same('a hand of one card asks for 1 at most', handMenuItems(1).find((i) => i.ask).ask.max, 1);
check('there is no Draw line (the library menu has it)', [0, 1, 7].every((n) => handMenuItems(n).every((i) => !/draw/i.test(i.label))));
same('Mulligan is the page\'s: no action', handAction('mulligan'), null);
same('an unknown id has no action', [handAction('nope'), handAction(undefined), handAction('draw')], [null, null, null]);

// shuffle hand into library
{
  const game = fresh();
  const hand = uids(game, 'hand'); const library = uids(game, 'library');
  const action = handAction('shuffleinto', 1, { random: seededRandom(3) });
  const next = action.run(game);
  same('shuffling the hand into the library empties the hand and puts every card in the library', [uids(next, 'hand').length, uids(next, 'library').length, [...uids(next, 'library')].sort()], [0, library.length + hand.length, [...library, ...hand].sort()]);
  check('...the order is not the old order (it was shuffled)', JSON.stringify(uids(next, 'library')) !== JSON.stringify([...hand, ...library]));
  same('...and says so, and nothing is lost', [action.message, checkGame(next), total(next) === total(game)], ['Shuffled your hand into your library.', [], true]);
  same('the game that was given is not changed', uids(game, 'hand'), hand);
}
// discard hand
{
  const game = fresh();
  const hand = uids(game, 'hand');
  const next = handAction('discardall').run(game);
  same('Discard hand puts the whole hand in the graveyard (the first card of the hand ends up lowest: the graveyard shows the newest first)', [uids(next, 'hand'), [...uids(next, 'graveyard')].sort()], [[], [...hand].sort()]);
  same('...the library is untouched, nothing is lost', [uids(next, 'library'), checkGame(next), total(next) === total(game)], [uids(game, 'library'), [], true]);
  same('and says so', handAction('discardall').message, 'Discarded your hand.');
  same('discarding an empty hand changes nothing', uids(handAction('discardall').run(next), 'graveyard'), uids(next, 'graveyard'));
}
// discard X at random
{
  const game = fresh();
  const hand = uids(game, 'hand');
  const action = handAction('discardrandom', 3, { random: seededRandom(11) });
  const next = action.run(game);
  same('Discard 3 at random: three cards leave the hand for the graveyard, four stay', [uids(next, 'hand').length, uids(next, 'graveyard').length], [4, 3]);
  check('...the ones that left were in the hand, the ones that stayed keep their order', uids(next, 'graveyard').every((u) => hand.includes(u)) && JSON.stringify(uids(next, 'hand')) === JSON.stringify(hand.filter((u) => uids(next, 'hand').includes(u))));
  same('...and says how many', action.message, 'Discarded 3 cards at random.');
  same('discarding one says "1 card"', handAction('discardrandom', 1).message, 'Discarded 1 card at random.');
  same('asking for more than the hand has discards the whole hand', uids(handAction('discardrandom', 99).run(game), 'hand'), []);
  same('a bad number discards one card', [handAction('discardrandom', 0).run(game), handAction('discardrandom', 'x').run(game), handAction('discardrandom', 2.5).run(game)].map((g) => uids(g, 'graveyard').length), [1, 1, 1]);
  // it is random: over many runs every card of the hand is discarded about equally often
  const counts = Object.fromEntries(hand.map((u) => [u, 0]));
  const random = seededRandom(99);
  const runs = 7000;
  for (let i = 0; i < runs; i++) for (const u of uids(handAction('discardrandom', 1, { random }).run(game), 'graveyard')) counts[u]++;
  const expected = runs / hand.length;
  check('one random discard picks each of the 7 cards about equally often', Object.values(counts).every((c) => Math.abs(c - expected) < expected * 0.15), JSON.stringify(counts));
  check('three random discards leave every card in play exactly once', Array.from({ length: 200 }, () => handAction('discardrandom', 3, { random }).run(game)).every((g) => checkGame(g).length === 0 && total(g) === total(game)));
}
console.log(`All ${checks} hand menu checks passed.`);
