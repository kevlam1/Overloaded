// Tests for shared/group-menu.mjs: the menu of several cards of the hand picked together.
import { makeGame, checkGame, seededRandom, ZONES } from '../shared/zones.mjs';
import { handGroupItems, groupAction, needsOrder } from '../shared/group-menu.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };
const check = (label, condition, detail = '') => { checks++; if (!condition) fail(label, detail); };
const refused = (label, run, pattern) => { checks++; let message = null; try { run(); } catch (error) { message = error.message; } if (message === null) fail(label, 'it did not throw'); else if (!pattern.test(message)) fail(label, `wrong message: ${message}`); };

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const deck = { cards: [{ i: id(1), n: 'Forest', qty: 20, section: 'main' }, { i: id(2), n: 'Island', qty: 10, section: 'main' }, { i: id(3), n: 'Goblin Guide', qty: 10, section: 'main' }], commander: [] };
const fresh = () => makeGame(deck, () => ({ t: 'Basic Land', m: '', k: [] }), { random: seededRandom(12) });
const uids = (game, zone) => game.zones[zone].map((c) => c.uid);
const total = (game) => ZONES.reduce((sum, zone) => sum + game.zones[zone].length, 0);

same('the lines: Play, Discard, Exile, Move to command zone, Move to top of library, Move to bottom of library', handGroupItems().map((i) => [i.id, i.label]), [['group:battlefield', 'Play'], ['group:graveyard', 'Discard'], ['group:exile', 'Exile'], ['group:command', 'Move to command zone'], ['group:top', 'Move to top of library...'], ['group:bottom', 'Move to bottom of library...']]);
same('only the two library lines need an order first', handGroupItems().flatMap((i) => (i.items ?? [i])).filter((i) => needsOrder(i.id)).map((i) => i.id), ['group:top', 'group:bottom']);
same('an id that is not a choice, or no cards, has no action', [groupAction('nope', ['a']), groupAction('group:exile', []), groupAction('group:exile', null), groupAction('move', ['a'])], [null, null, null, null]);

{
  const game = fresh();
  const hand = uids(game, 'hand');
  const picked = [hand[1], hand[4], hand[5]];
  for (const [id2, zone, message] of [['group:battlefield', 'battlefield', 'Played 3 cards.'], ['group:graveyard', 'graveyard', 'Discarded 3 cards.'], ['group:exile', 'exile', 'Exiled 3 cards.'], ['group:sideboard', 'sideboard', 'Moved 3 cards to your sideboard.']]) {
    const action = groupAction(id2, picked);
    const next = action.run(game);
    same(`${id2}: the three picked cards go to ${zone}, the other four stay in the hand, and it says so`, [[...uids(next, zone)].sort(), uids(next, 'hand'), action.message], [[...picked].sort(), hand.filter((u) => !picked.includes(u)), message]);
    check(`${id2}: nothing is lost or copied`, checkGame(next).length === 0 && total(next) === total(game));
  }
  same('the game that was given is not changed', uids(game, 'hand'), hand);
  const toCommand = groupAction('group:command', picked).run(game);
  same('to the command zone', [uids(toCommand, 'command').length, groupAction('group:command', picked).message], [3 + game.zones.command.length, 'Moved 3 cards to the command zone.']);
  // the library: the order given is the order in the library
  const order = [picked[2], picked[0], picked[1]];
  const top = groupAction('group:top', picked, { order });
  const onTop = top.run(game);
  same('Top of library: the first card of the order is the top card, then the second, then the third, and the old top follows', [uids(onTop, 'library').slice(0, 3), uids(onTop, 'library')[3], top.message], [order, uids(game, 'library')[0], 'Put 3 cards on the top of your library.']);
  const bottom = groupAction('group:bottom', picked, { order });
  const underneath = bottom.run(game);
  same('Bottom of library: the cards go under the library in the order given (the last one is the very bottom)', [uids(underneath, 'library').slice(-3), uids(underneath, 'library').length, bottom.message], [order, uids(game, 'library').length + 3, 'Put 3 cards on the bottom of your library.']);
  check('...the old library is untouched in between, and nothing is lost', JSON.stringify(uids(underneath, 'library').slice(0, -3)) === JSON.stringify(uids(game, 'library')) && checkGame(underneath).length === 0 && total(underneath) === total(game));
  refused('Top of library without an order says to put the cards in order first', () => groupAction('group:top', picked).run(game), /order first/);
  refused('an order that is not the picked cards is refused', () => groupAction('group:top', picked, { order: [picked[0], picked[1], hand[0]] }).run(game), /order first/);
  refused('an order with a card twice is refused', () => groupAction('group:bottom', picked, { order: [picked[0], picked[0], picked[1]] }).run(game), /order first|not all in your hand/);
  refused('a card that has left the hand is refused (nothing moves)', () => groupAction('group:exile', picked).run(groupAction('group:graveyard', [picked[1]]).run(game)), /not all in your hand/);
  refused('a card that was never there is refused', () => groupAction('group:exile', [picked[0], 'nope']).run(game), /not all in your hand/);
  refused('the same card twice is refused', () => groupAction('group:exile', [picked[0], picked[0]]).run(game), /not all in your hand/);
}
// random groups never lose or copy a card
{
  const random = seededRandom(31);
  let game = fresh();
  const before = total(game);
  for (let step = 0; step < 200; step++) {
    if (game.zones.hand.length < 2) { game = groupAction('group:top', uids(game, 'graveyard').slice(0, 0), {}) ? game : game; const back = game.zones.library.slice(0, 5).map((c) => c.uid); game = { ...game, zones: { ...game.zones, library: game.zones.library.slice(5), hand: [...game.zones.hand, ...game.zones.library.slice(0, 5)] } }; void back; }
    const hand = uids(game, 'hand');
    const picked = hand.filter(() => random() < 0.5);
    if (picked.length === 0) continue;
    const kinds = ['group:battlefield', 'group:graveyard', 'group:exile', 'group:top', 'group:bottom', 'group:sideboard'];
    const kind = kinds[Math.floor(random() * kinds.length)];
    const order = [...picked].sort(() => random() - 0.5);
    game = groupAction(kind, picked, { order }).run(game);
    if (checkGame(game).length || total(game) !== before) fail('random groups keep every card', `step ${step} ${kind}`);
  }
  checks++;
}
console.log(`All ${checks} group menu checks passed.`);
