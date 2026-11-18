// Tests for foil (Kevin, 2026-11-18): setFoil in shared/zones.mjs and the "Foil" line of the card menu in shared/card-menu.mjs.
import { makeGame, setFoil, moveCard, checkGame, seededRandom } from '../shared/zones.mjs';
import { menuItems, menuAction } from '../shared/card-menu.mjs';

let checks = 0;
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) { console.log(`FAILED CHECK: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); process.exit(1); } };
const throws = (label, fn) => { checks++; try { fn(); } catch { return; } console.log(`FAILED CHECK: ${label}: did not throw`); process.exit(1); };
const freeze = (v) => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); for (const k of Object.keys(v)) freeze(v[k]); } return v; };

const deck = { cards: [{ i: '00000000-0000-4000-8000-000000000001', n: 'Forest', qty: 30, section: 'main' }], commander: [] };
const game = freeze(makeGame(deck, () => ({ t: 'Basic Land', m: '', k: [] }), { random: seededRandom(4) }));
const uid = game.zones.hand[0].uid;
const foil = setFoil(game, uid, true);

same('a card of the hand can be made foil, and the old game is not changed (frozen)', [foil.zones.hand[0].foil, game.zones.hand[0].foil], [true, undefined]);
same('the other cards are untouched', foil.zones.hand.slice(1).every((c) => c.foil === undefined), true);
same('turning it off takes the field away (no foil: false left behind)', 'foil' in setFoil(foil, uid, false).zones.hand[0], false);
same('it works in any zone and the mark goes with the card when it moves', moveCard(foil, uid, 'graveyard').zones.graveyard[0].foil, true);
checkGame(setFoil(game, game.zones.library[0].uid, true)); // (a card of the library too: nothing is lost or copied)
throws('a card that is not in the game is refused', () => setFoil(game, 'nope', true));

same('the menu has a Foil line in the zones a player can see, and Remove foil once it is foil', [menuItems({ uid, n: 'Forest' }, 'hand', { foil: true }).find((i) => i.id === 'foil').label, menuItems({ uid, n: 'Forest', foil: true }, 'battlefield', { foil: true }).find((i) => i.id === 'foil').label], ['Foil', 'Remove foil']);
same('and none in the library or when the page does not ask', [menuItems({ n: 'Forest' }, 'library', { foil: true }).some((i) => i.id === 'foil'), menuItems({ n: 'Forest' }, 'hand').some((i) => i.id === 'foil')], [false, false]);
same('choosing it toggles the card and says so in a few words', [menuAction('foil', { uid, n: 'Forest' }).run(game).zones.hand[0].foil, menuAction('foil', { uid, n: 'Forest' }).message, menuAction('foil', { uid, n: 'Forest', foil: true }).message], [true, 'Forest is foil.', 'Forest is not foil.']);
console.log(`All ${checks} foil checks passed.`);
