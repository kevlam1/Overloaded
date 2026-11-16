// Tests for shared/pile-menu.mjs and moveAll in shared/zones.mjs: what the right-click menu of a pile offers and what each choice does.
import { makeGame, moveCard, moveAll, checkGame, seededRandom, ZONES } from '../shared/zones.mjs';
import { pileMenuItems, pileAction, PILE_ZONES } from '../shared/pile-menu.mjs';

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
const shape = (items) => items.map((i) => [i.id, i.label, i.ask ?? null, i.number ?? null, i.items ? i.items.map((c) => [c.id, c.label, c.ask ?? null]) : null]);
same('the library menu in the order of Kevin sketch (2026-11-15) with the lines the solo table adds: Draw card, Draw X, View library, View (top card, top X cards, bottom card, bottom X cards), Shuffle, Scry [n], Surveil [n], Move top X cards (graveyard, exile, exile face down), Reveal top X, Play with top revealed', shape(pileMenuItems('library', 40, { scry: true, reveal: true, downExile: true })), [['draw', 'Draw card', null, null, null], ['draw', 'Draw X...', { max: 40, unit: 'cards' }, null, null], ['search', 'View library', null, null, null], ['view', 'View', null, null, [['look', 'Top card', null], ['look', 'Top X cards...', { max: 40, unit: 'cards' }], ['lookbottom', 'Bottom card', null], ['lookbottom', 'Bottom X cards...', { max: 40, unit: 'cards' }]]], ['shuffle', 'Shuffle', null, null, null], ['scry', 'Scry', null, { key: 'scry', max: 40 }, null], ['surveil', 'Surveil', null, { key: 'surveil', max: 40 }, null], ['movetop', 'Move top X cards', null, null, [['movetop:graveyard', 'Graveyard...', { max: 40, unit: 'cards' }], ['movetop:exile', 'Exile...', { max: 40, unit: 'cards' }], ['movetop:exiledown', 'Exile face down...', { max: 40, unit: 'cards' }]]], ['reveal', 'Reveal top X...', { max: 40, unit: 'cards' }, null, null], ['toprevealed', 'Play with top revealed', null, null, null]]);
same('a page that cannot scry, reveal or exile face down (the table page) gets the menu without those lines', [pileMenuItems('library', 40).map((i) => i.label), pileMenuItems('library', 40).find((i) => i.id === 'movetop').items.map((i) => i.label)], [['Draw card', 'Draw X...', 'View library', 'View', 'Shuffle', 'Move top X cards'], ['Graveyard...', 'Exile...']]);
same('when the top card is face up the line says how to stop', [pileMenuItems('library', 5, { reveal: true }).at(-1).label, pileMenuItems('library', 5, { reveal: true, topRevealed: true }).at(-1).label], ['Play with top revealed', 'Stop playing with top revealed']);
same('the number in a line can be at most the size of the pile', pileMenuItems('library', 3, { scry: true }).filter((i) => i.number).map((i) => i.number.max), [3, 3]);
same('a library of one card cannot be shuffled and asks for 1 at most', shape(pileMenuItems('library', 1)).map(([id, label, ask, number]) => [id, label, ask?.max ?? number?.max ?? null]), [['draw', 'Draw card', null], ['draw', 'Draw X...', 1], ['search', 'View library', null], ['view', 'View', null], ['movetop', 'Move top X cards', null]]);
check('no menu line has a row of amounts', ['library', 'graveyard', 'exile', 'sideboard'].every((zone) => [0, 1, 5, 40].every((count) => pileMenuItems(zone, count, { scry: true, reveal: true }).every((i) => !('amounts' in i)))));
check('every line that asks for a number says so in its label (it ends in three dots), the lines with their own box do not, and the others do not', ['library', 'graveyard', 'exile'].every((zone) => pileMenuItems(zone, 9, { scry: true, reveal: true }).every((i) => Boolean(i.ask) === i.label.endsWith('...') && !(i.number && i.ask))));
same('an empty library can only be viewed (and, where it is offered, played with its top revealed)', [pileMenuItems('library', 0).map((i) => i.label), pileMenuItems('library', 0, { scry: true, reveal: true }).map((i) => i.label)], [['View library'], ['View library', 'Play with top revealed']]);
const MOVE_ALL = (zone) => ['hand', 'battlefield', 'graveyard', 'exile', 'sideboard'].filter((z) => z !== zone).map((z) => 'moveall:' + z).concat(['moveall:library-top', 'moveall:library-bottom']);
same('the graveyard menu: View graveyard, Exile all, Shuffle into library, Move all to every other place', [pileMenuItems('graveyard', 5).map((i) => [i.id, i.label]), pileMenuItems('graveyard', 5)[3].items.map((i) => i.id)], [[['search', 'View graveyard'], ['moveall:exile', 'Exile all'], ['intolibrary', 'Shuffle into library'], ['moveall', 'Move all to']], MOVE_ALL('graveyard')]);
same('the exile menu: View exile, Shuffle into library, Move all to every other place', [pileMenuItems('exile', 5).map((i) => [i.id, i.label]), pileMenuItems('exile', 5)[2].items.map((i) => i.id)], [[['search', 'View exile'], ['intolibrary', 'Shuffle into library'], ['moveall', 'Move all to']], MOVE_ALL('exile')]);
same('the sideboard menu: View sideboard and Move all to', [pileMenuItems('sideboard', 5).map((i) => [i.id, i.label]), pileMenuItems('sideboard', 5)[1].items.map((i) => i.id)], [[['search', 'View sideboard'], ['moveall', 'Move all to']], MOVE_ALL('sideboard')]);
for (const zone of ['graveyard', 'exile', 'sideboard']) same('an empty ' + zone + ' can only be viewed', pileMenuItems(zone, 0).map((i) => i.id), ['search']);

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
  const milled = pileAction('movetop:graveyard', 'library', 3);
  const gone = milled.run(game);
  same('mill 3 puts the top three cards in the graveyard (the newest first) and none in the hand', [uids(gone, 'graveyard'), gone.zones.library.length, uids(gone, 'hand').join() === uids(game, 'hand').join()], [libraryBefore.slice(0, 3).reverse(), libraryBefore.length - 3, true]);
  same('...and says what it did', milled.message, 'Milled the top 3 cards of your library into your graveyard.');
  const exiled = pileAction('movetop:exile', 'library', 3);
  const away = exiled.run(game);
  same('exile top 3 puts the top three cards in exile (it keeps its cards in the order they arrived) and none in the graveyard or hand', [uids(away, 'exile'), away.zones.library.length, away.zones.graveyard.length, uids(away, 'hand').join() === uids(game, 'hand').join()], [libraryBefore.slice(0, 3), libraryBefore.length - 3, 0, true]);
  same('...and says what it did', [exiled.message, pileAction('movetop:exile', 'library', 1).message], ['Exiled the top 3 cards of your library.', 'Exiled the top card of your library.']);
  same('the page-only choices (scry, surveil, reveal, top revealed, view, look) are not changes to the game: pileAction gives nothing', ['scry', 'surveil', 'reveal', 'toprevealed', 'view', 'look', 'lookbottom', 'search'].map((id) => pileAction(id, 'library', 2)), [null, null, null, null, null, null, null, null]);
  same('moving the top cards only works on the library, and drawing works only on the library', [pileAction('movetop:exile', 'graveyard'), pileAction('movetop:graveyard', 'exile'), pileAction('draw', 'sideboard')], [null, null, null]);
  same('mill 1 says "card"', pileAction('movetop:graveyard', 'library', 1).message, 'Milled the top card of your library into your graveyard.');
  {
    const down = pileAction('movetop:exiledown', 'library', 2);
    const next = down.run(game);
    same('Move top X cards: Exile face down puts the top two cards in exile, marked face down, and says so', [uids(next, 'exile').length, next.zones.exile.every((c) => c.xd === true), down.message, checkGame(next)], [2, true, 'Exiled the top 2 cards of your library face down.', []]);
    same('...a plain Exile has no mark', pileAction('movetop:exile', 'library', 2).run(game).zones.exile.some((c) => 'xd' in c), false);
    const back = moveCard(next, next.zones.exile[0].uid, 'hand');
    same('...a card that leaves exile loses the mark (hand, library, battlefield, graveyard)', ['hand', 'library', 'battlefield', 'graveyard'].map((to) => 'xd' in moveCard(next, next.zones.exile[0].uid, to).zones[to].find((c) => c.uid === next.zones.exile[0].uid)), [false, false, false, false]);
    same('...and the game stays consistent', checkGame(back), []);
    same('a mark in the wrong zone is a problem', checkGame({ ...next, zones: { ...next.zones, hand: [...next.zones.hand, { ...next.zones.exile[0], uid: 'x1' }], exile: next.zones.exile.slice(1) } }).some((p) => /exiled-face-down/.test(p)), true);
  }
  const all = pileAction('movetop:graveyard', 'library', 999).run(game);
  same('milling more than the library holds mills what there is and stops', [all.zones.library.length, all.zones.graveyard.length], [0, libraryBefore.length]);
  same('a bad amount counts as one', [pileAction('draw', 'library', 0).message, pileAction('draw', 'library', -2).message, pileAction('draw', 'library', 'x').message, pileAction('draw', 'library', 2.5).message], ['Drew 1 card.', 'Drew 1 card.', 'Drew 1 card.', 'Drew 1 card.']);
  check('the actions never change the old game', (() => { const frozen = JSON.stringify(game); pileAction('shuffle', 'library').run(game); pileAction('draw', 'library', 2).run(game); pileAction('movetop:graveyard', 'library', 2).run(game); return JSON.stringify(game) === frozen; })());
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
  { const inGy = (() => { let g = fresh(); for (const u of uids(g, 'library').slice(0, 5)) g = moveCard(g, u, 'graveyard'); return g; })();
    const into = pileAction('intolibrary', 'graveyard');
    const result = into.run(inGy);
    same('shuffle into library puts every card of the graveyard in the library, so the graveyard is empty and nothing is lost', [result.zones.graveyard.length, result.zones.library.length, checkGame(result).length], [0, inGy.zones.library.length + 5, 0]);
    same('...and says what it did, for the exile too, and is not offered for the sideboard or the library', [into.message, pileAction('intolibrary', 'exile').message, pileAction('intolibrary', 'sideboard'), pileAction('intolibrary', 'library')], ['Shuffled everything from your graveyard into your library.', 'Shuffled everything from exile into your library.', null, null]); }
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
    const action = pileAction(choice.id, zone, choice.ask ? 1 + Math.floor(random() * choice.ask.max) : choice.number ? 1 + Math.floor(random() * choice.number.max) : 1);
    if (action) walk = action.run(walk);
    const problems = checkGame(walk);
    if (problems.length) fail(`random walk step ${step}`, problems.join('; '));
  }
  check('400 random menu choices lose and copy no card', ZONES.reduce((sum, zone) => sum + walk.zones[zone].length, 0) === total);
}

console.log(`All ${checks} pile menu checks passed.`);
