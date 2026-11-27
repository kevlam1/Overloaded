// Tests for addCard in shared/zones.mjs (2026-11-26 feedback, "Add a card"): a real card from the card list put onto the battlefield.
import { makeGame, addCard, moveCard, checkGame, seededRandom } from '../shared/zones.mjs';

let checks = 0;
const check = (label, condition, detail = '') => { checks++; if (!condition) { console.log(`FAILED CHECK: ${label}${detail ? ': ' + detail : ''}`); process.exit(1); } };
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const deck = { cards: [{ i: id(1), n: 'Forest', qty: 40, section: 'main' }], commander: [] };
const lookup = (card) => (card.i === id(7) ? { t: 'Creature - Goblin', m: '{R}', k: [] } : { t: 'Basic Land - Forest', m: '', k: [] });
const game = Object.freeze(makeGame(deck, lookup, { random: seededRandom(3) }));

const { game: next, uid } = addCard(game, { i: id(7), n: 'Goblin Guide' }, lookup);
const card = next.zones.battlefield.find((c) => c.uid === uid);
check('the card is on the battlefield with its type and cost from the card list, and a place on the grid', card && card.t === 'Creature - Goblin' && card.m === '{R}' && Number.isInteger(card.px), JSON.stringify(card));
check('it is a real card, not a token, and a creature comes in sick', !card.tok && card.sick === true);
check('the game is still whole, and the old game is unchanged', checkGame(next).length === 0 && game.zones.battlefield.length === 0, JSON.stringify(checkGame(next)));
check('it stays when it leaves the battlefield (a token would vanish)', moveCard(next, uid, 'graveyard').zones.graveyard.some((c) => c.uid === uid));
let refused = false; try { addCard(game, { i: 'nope', n: 'X' }, lookup); } catch { refused = true; }
check('a card with no real id is refused', refused);
console.log(`All add card checks passed (${checks}).`);
