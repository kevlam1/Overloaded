// Tests for shared/pile-menu.mjs and moveAll in shared/zones.mjs: what the right-click menu of a pile offers and what each choice does.
import { makeGame, moveCard, moveAll, checkGame, seededRandom, ZONES } from '../shared/zones.mjs';
import { pileMenuItems, pileAction, PILE_ZONES, DRAW_AMOUNTS, LOOK_AMOUNTS, MILL_AMOUNTS } from '../shared/pile-menu.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };
const check = (label, condition, detail = '') => { checks++; if (!condition) fail(label, detail); };

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const deck = { cards: [{ i: id(1), n: 'Forest', qty: 20, section: 'main' }, { i: id(2), n: 'Island', qty: 10, section: 'main' }, { i: id(3), n: 'Goblin Guide', qty: 10, section: 'main' }, { i: id(6), n: 'Sideboard Card', qty: 3, section: 'sideboard' }], commander: [] };
const TYPES = { [id(1)]: 'Basic Land - Forest', [id(2)]: 'Basic Land - Island', [id(3)]: 'Creature - Goblin', [id(6)]: 'Instant' };
const fresh = () => makeGame(deck, (c) => ({ t: TYPES[c.i] ?? '', m: '', k: [] }), { random: seededRandom(4) });
const uids = (game, zone) => game.zones[zone].map((c) => c.uid);

// the items
same('the pile zones are the four piles', PILE_ZONES, ['library', 'graveyard', 'exile', 'sideboard']);
same('an unknown zone has no menu', [pileMenuItems('hand', 5), pileMenuItems('battlefield', 5), pileMenuItems('nope', 5)], [[], [], []]);
same('the library menu: search, shuffle, draw, look, mill (with amounts that fit the pile)', pileMenuItems('library', 40).map((i) => [i.id, i.amounts ?? null]), [['search', null], ['shuffle', null], ['draw', DRAW_AMOUNTS], ['look', LOOK_AMOUNTS], ['mill', MILL_AMOUNTS]]);
same('amounts larger than the pile are not offered', pileMenuItems('library', 3).map((i) => [i.id, i.amounts ?? null]), [['search', null], ['shuffle', null], ['draw', [2, 3]], ['look', [2, 3]], ['mill', [2, 3]]]);
same('a library of one card cannot be shuffled and has no amounts', pileMenuItems('library', 1).map((i) => [i.id, i.amounts ?? null]), [['search', null], ['draw', []], ['look', []], ['mill', []]]);
same('an empty library can only be searched', pileMenuItems('library', 0).map((i) => i.id), ['search']);
for (const zone of ['graveyard', 'exile', 'sideboard']) {
  const items = pileMenuItems(zone, 5);
  same(`the ${zone} menu: search, and Move all to every other place but itself`, [items.map((i) => i.id), items[1].items.map((i) => i.id)], [['search', 'moveall'], ['hand', 'battlefield', 'graveyard', 'exile', 'sideboard'].filter((z) => z !== zone).map((z) => `moveall:${z}`).concat(['moveall:library-top', 'moveall:library-bottom'])]);
  same(`an empty ${zone} can only be searched`, pileMenuItems(zone, 0).map((i) => i.id), ['search']);
}

// the actions
{
  const game = fresh();
  const libraryBefore = uids(game, 'library');
  const shuffled = pileAction('shuffle', 'library').run(game);
  check('shuffle keeps every card and does not touch the other zones', [...uids(shuffled, 'library')].sort().join() === [...libraryBefore].sort().join() && uids(shuffled, 'hand').join() === uids(game, 'hand').join() && checkGame(shuffled).length === 0);
  const drawn = pileAction('draw', 'library', 3);
  const after = drawn.run(game);
  same('draw 3 moves the top three cards to the hand, in order', [uids(after, 'hand').slice(-3), after.zones.library.length], [libraryBefore.slice(0, 3), libraryBefore.length - 3]);
  same('...and says how many', drawn.message, 'Drew 3 cards.');
  same('draw 1 says "1 card"', pileAction('draw', 'library', 1).message, 'Drew 1 card.');
  const milled = pileAction('mill', 'library', 3);
  const gone = milled.run(game);
  same('mill 3 puts the top three cards in the graveyard (the newest first) and none in the hand', [uids(gone, 'graveyard'), gone.zones.library.length, uids(gone, 'hand').join() === uids(game, 'hand').join()], [libraryBefore.slice(0, 3).reverse(), libraryBefore.length - 3, true]);
  same('...and says what it did', milled.message, 'Milled the top 3 cards of your library into your graveyard.');
  same('mill 1 says "card"', pileAction('mill', 'library', 1).message, 'Milled the top card of your library into your graveyard.');
  const all = pileAction('mill', 'library', 999).run(game);
  same('milling more than the library holds mills what there is and stops', [all.zones.library.length, all.zones.graveyard.length], [0, libraryBefore.length]);
  same('a bad amount counts as one', [pileAction('draw', 'library', 0).message, pileAction('draw', 'library', -2).message, pileAction('draw', 'library', 'x').message, pileAction('draw', 'library', 2.5).message], ['Drew 1 card.', 'Drew 1 card.', 'Drew 1 card.', 'Drew 1 card.']);
  check('the actions never change the old game', (() => { const frozen = JSON.stringify(game); pileAction('shuffle', 'library').run(game); pileAction('draw', 'library', 2).run(game); pileAction('mill', 'library', 2).run(game); return JSON.stringify(game) === frozen; })());
}

// move all
{
  let game = fresh();
  for (const u of uids(game, 'library').slice(0, 4)) game = moveCard(game, u, 'graveyard'); // graveyard: newest first
  const gy = uids(game, 'graveyard');
  const toHand = moveAll(game, 'graveyard', 'hand');
  same('everything from the graveyard goes to the hand, in the order it was in', [uids(toHand, 'graveyard'), uids(toHand, 'hand').slice(-4)], [[], gy]);
  const toTop = moveAll(game, 'graveyard', 'library', { position: 'top' });
  same('to the top of the library keeps the first card first: it is the top card', uids(toTop, 'library').slice(0, 4), gy);
  const toBottom = moveAll(game, 'graveyard', 'library', { position: 'bottom' });
  same('to the bottom of the library keeps the order at the bottom', uids(toBottom, 'library').slice(-4), gy);
  same('moving a zone to itself changes nothing', moveAll(game, 'graveyard', 'graveyard'), game);
  same('moving an empty zone changes nothing', uids(moveAll(game, 'exile', 'hand'), 'hand'), uids(game, 'hand'));
  let threw = false; try { moveAll(game, 'nowhere', 'hand'); } catch { threw = true; }
  check('an unknown zone is refused', threw);
  const play = moveAll(game, 'graveyard', 'battlefield');
  check('to the battlefield every card gets a place on the grid and the game is consistent', play.zones.battlefield.length === 4 && play.zones.battlefield.every((c) => Number.isInteger(c.px) && Number.isInteger(c.py)) && checkGame(play).length === 0);
  const viaMenu = pileAction('moveall:hand', 'graveyard');
  same('the menu choice does the same and says it', [uids(viaMenu.run(game), 'hand').slice(-4), viaMenu.message], [gy, 'Moved everything from your graveyard to your hand.']);
  same('...to the top and the bottom of the library with their own words', [pileAction('moveall:library-top', 'exile').message, pileAction('moveall:library-bottom', 'sideboard').message], ['Moved everything from exile to the top of your library.', 'Moved everything from your sideboard to the bottom of your library.']);
  same('a pile cannot be moved to itself, to the command zone or to nowhere, and an id that is not a choice gives nothing', [pileAction('moveall:graveyard', 'graveyard'), pileAction('moveall:command', 'graveyard'), pileAction('moveall:nowhere', 'graveyard'), pileAction('search', 'library'), pileAction('look', 'library'), pileAction('shuffle', 'graveyard'), pileAction('draw', 'exile'), pileAction('mill', 'sideboard'), pileAction(5, 'library'), pileAction('shuffle', 'hand')], Array(10).fill(null));
  // a random walk: nothing is lost or copied
  const random = seededRandom(9);
  let walk = fresh();
  const total = ZONES.reduce((sum, zone) => sum + walk.zones[zone].length, 0);
  for (let step = 0; step < 400; step++) {
    const pick = (list) => list[Math.floor(random() * list.length)];
    const zone = pick(PILE_ZONES);
    const items = pileMenuItems(zone, walk.zones[zone].length);
    const item = pick(items);
    const choices = item.items ? item.items : [item];
    const choice = pick(choices);
    const action = pileAction(choice.id, zone, choice.amounts ? pick(choice.amounts) : 1);
    if (action) walk = action.run(walk);
    const problems = checkGame(walk);
    if (problems.length) fail(`random walk step ${step}`, problems.join('; '));
  }
  check('400 random menu choices lose and copy no card', ZONES.reduce((sum, zone) => sum + walk.zones[zone].length, 0) === total);
}

console.log(`All ${checks} pile menu checks passed.`);
