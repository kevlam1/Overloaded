// Tests for shared/scry.mjs: scry and surveil.
import { makeGame, checkGame, seededRandom, ZONES } from '../shared/zones.mjs';
import { applyScry, topCards, SCRY_CHOICES } from '../shared/scry.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };
const check = (label, condition, detail = '') => { checks++; if (!condition) fail(label, detail); };
const refused = (label, run, pattern) => { checks++; let message = null; try { run(); } catch (error) { message = error.message; } if (message === null) fail(label, 'it did not throw'); else if (!pattern.test(message)) fail(label, `wrong message: ${message}`); };

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const deck = { cards: [{ i: id(1), n: 'Forest', qty: 20, section: 'main' }, { i: id(2), n: 'Island', qty: 10, section: 'main' }, { i: id(3), n: 'Goblin Guide', qty: 10, section: 'main' }], commander: [] };
const fresh = () => makeGame(deck, (c) => ({ t: 'Basic Land', m: '', k: [] }), { random: seededRandom(21) });
const uids = (game, zone) => game.zones[zone].map((c) => c.uid);
const total = (game) => ZONES.reduce((sum, zone) => sum + game.zones[zone].length, 0);

same('the choices of each', SCRY_CHOICES, { scry: ['top', 'bottom'], surveil: ['top', 'bottom', 'graveyard'] });
{
  const game = fresh();
  const library = uids(game, 'library');
  same('the cards to look at are the top n of the library, the first one first', topCards(game, 3).map((c) => c.uid), library.slice(0, 3));
  same('asking for more than there is gives all of it, and a bad number gives one', [topCards(game, 999).length, topCards(game, 0).length, topCards(game, 'x').length, topCards(game, 2.5).length], [library.length, 1, 1, 1]);
  const [a, b, c, d] = library;
  // scry 3: the first goes to the bottom, the other two stay on top in the order they were put in (c before b)
  const scried = applyScry(game, { kind: 'scry', order: [a, c, b], choices: { [a]: 'bottom' } });
  same('scry 3 with the first card to the bottom and the other two swapped: the top is c, b, then the rest, and a is last', [uids(scried.game, 'library').slice(0, 3), uids(scried.game, 'library').at(-1), scried.game.zones.library.length], [[c, b, d], a, library.length]);
  same('...and says what it did', scried.message, 'Scried 3: 2 on top, 1 on the bottom.');
  same('...it changes nothing else', [uids(scried.game, 'hand'), uids(scried.game, 'graveyard'), checkGame(scried.game), total(scried.game) === total(game)], [uids(game, 'hand'), [], [], true]);
  same('the game that was given is not changed', uids(game, 'library'), library);
  // everything stays on top: only the order can change
  const reorder = applyScry(game, { kind: 'scry', order: [c, b, a] });
  same('with no choices every card stays on top, in the order given', uids(reorder.game, 'library').slice(0, 3), [c, b, a]);
  // two for the bottom keep the order they were given in
  const two = applyScry(game, { kind: 'scry', order: [b, a, c], choices: { [b]: 'bottom', [a]: 'bottom' } });
  same('two cards for the bottom go under the library in the order given (b then a), and c is on top', [uids(two.game, 'library')[0], uids(two.game, 'library').slice(-2)], [c, [b, a]]);
  // surveil
  const surveilled = applyScry(game, { kind: 'surveil', order: [a, b, c, d], choices: { [a]: 'graveyard', [b]: 'bottom', [c]: 'top', [d]: 'graveyard' } });
  same('surveil 4: a and d to the graveyard (the one put there last is on top of it), b to the bottom, c on top', [uids(surveilled.game, 'graveyard'), uids(surveilled.game, 'library')[0], uids(surveilled.game, 'library').at(-1), surveilled.game.zones.library.length], [[d, a], c, b, library.length - 2]);
  same('...and says what it did', surveilled.message, 'Surveilled 4: 1 on top, 1 on the bottom, 2 in the graveyard.');
  check('...and nothing is lost or copied', checkGame(surveilled.game).length === 0 && total(surveilled.game) === total(game));
  same('scry has no graveyard line and surveil has', [applyScry(surveilled.game, { kind: 'scry', order: topCards(surveilled.game, 1).map((x) => x.uid) }).message], ['Scried 1: 1 on top, 0 on the bottom.']);
  refused('scry does not send a card to the graveyard', () => applyScry(game, { kind: 'scry', order: [a], choices: { [a]: 'graveyard' } }), /top or the bottom/);
  refused('a choice that is not one is refused', () => applyScry(game, { kind: 'surveil', order: [a], choices: { [a]: 'hand' } }), /top, the bottom or into the graveyard/);
  refused('a kind that is not scry or surveil is refused', () => applyScry(game, { kind: 'mill', order: [a] }), /not scry or surveil/);
  refused('no cards is refused', () => applyScry(game, { kind: 'scry', order: [] }), /no cards/);
  refused('cards that are not the top of the library are refused', () => applyScry(game, { kind: 'scry', order: [b, c] }), /not the top cards/);
  refused('a card twice is refused', () => applyScry(game, { kind: 'scry', order: [a, a] }), /not the top cards/);
  refused('more cards than the library has are refused', () => applyScry({ ...game, zones: { ...game.zones, library: game.zones.library.slice(0, 2) } }, { kind: 'scry', order: [a, b, c] }), /not the top cards/);
  // scrying the whole library puts it in the chosen order
  const whole = applyScry({ ...game, zones: { ...game.zones, library: game.zones.library.slice(0, 3) } }, { kind: 'surveil', order: [a, b, c], choices: { [b]: 'graveyard', [c]: 'bottom' } });
  same('surveilling a whole library of three: a on top, c under it, b in the graveyard', [uids(whole.game, 'library'), uids(whole.game, 'graveyard')], [[a, c], [b]]);
}
// random scrys and surveils never lose or copy a card
{
  const random = seededRandom(5);
  let game = fresh();
  const before = total(game);
  for (let step = 0; step < 300; step++) {
    const n = 1 + Math.floor(random() * Math.min(8, game.zones.library.length));
    const kind = random() < 0.5 ? 'scry' : 'surveil';
    const looked = topCards(game, n).map((c) => c.uid);
    const order = [...looked].sort(() => random() - 0.5);
    const choices = Object.fromEntries(order.map((uid) => [uid, SCRY_CHOICES[kind][Math.floor(random() * SCRY_CHOICES[kind].length)]]));
    game = applyScry(game, { kind, order, choices }).game;
    if (checkGame(game).length || total(game) !== before) fail('random scrys keep every card', `step ${step}`);
    if (game.zones.library.length < 3) game = { ...game, zones: { ...game.zones, library: [...game.zones.library, ...game.zones.graveyard.splice(0)] , graveyard: [] } };
  }
  checks++;
}
console.log(`All ${checks} scry checks passed.`);
