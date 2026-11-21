// Checks shared/live-history.mjs: the shared game history of the live table. Above all that a card in a hand or a library is never named, then the words of the common moves, the stored
// entries and the merged list. Short on purpose. Run from the repo root: node scripts/test-live-history.mjs
import { describeMove, makeEntry, slotFor, readLog, lastK, mergeHistory, LOG_SLOTS, MAX_TEXT } from '../shared/live-history.mjs';
import { makeGame, seededRandom, draw, moveCard, setTapped, adjustLife, shuffleLibrary, mulligan, createToken, changePlayerCounter, changeCommanderDamage } from '../shared/zones.mjs';

let checks = 0;
function check(label, pass, detail = '') {
  checks++;
  if (!pass) { console.log(`FAILED CHECK: ${label}${detail ? ` (${detail})` : ''}`); process.exit(1); }
}

const names = ['Sol Ring', 'Lightning Bolt', 'Counterspell', 'Llanowar Elves', 'Island', 'Forest', 'Mountain', 'Swamp', 'Plains', 'Opt', 'Brainstorm', 'Ponder'];
const deck = { cards: names.map((n, index) => ({ i: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, n, qty: 1, section: 'main' })), commander: [] };
const lookup = (card) => ({ t: ['Island', 'Forest', 'Mountain', 'Swamp', 'Plains'].includes(card.n) ? 'Basic Land' : 'Instant', m: '', k: [] });
const game = makeGame(deck, lookup, { random: seededRandom(4) });
const handNames = game.zones.hand.map((card) => card.n);
const libraryNames = game.zones.library.map((card) => card.n);
const namesIn = (text, list) => list.filter((n) => text.includes(n));

// hidden cards are never named
const drew = draw(game, 2).game;
const drewText = describeMove(game, drew);
check('drawing says how many, not which', drewText === 'drew 2 cards' && namesIn(drewText, libraryNames).length === 0, drewText);
const backToLibrary = moveCard(game, game.zones.hand[0].uid, 'library', { position: 'top' });
const backText = describeMove(game, backToLibrary);
check('a hand card put into the library is not named', namesIn(backText, handNames).length === 0 && backText.includes('a card'), backText);
const shuffled = shuffleLibrary(game, seededRandom(9));
check('a shuffle names no card', describeMove(game, shuffled, { note: 'shuffle' }) === 'shuffled {their} library');
const mull = mulligan(game, seededRandom(2));
const mullText = describeMove(game, mull);
check('a mulligan says so and names no card', mullText === 'took a mulligan (1)' && namesIn(mullText, [...handNames, ...libraryNames]).length === 0, mullText);

// public moves are named
const played = moveCard(game, game.zones.hand[0].uid, 'battlefield');
check('playing a card names it', describeMove(game, played) === `played ${game.zones.hand[0].n}`, describeMove(game, played));
const discarded = moveCard(game, game.zones.hand[1].uid, 'graveyard');
check('discarding names it', describeMove(game, discarded) === `discarded ${game.zones.hand[1].n}`);
const tappedGame = setTapped(played, game.zones.hand[0].uid, true);
check('tapping names it', describeMove(played, tappedGame) === `tapped ${game.zones.hand[0].n}`);
const faceDown = { ...played, zones: { ...played.zones, battlefield: played.zones.battlefield.map((card) => ({ ...card, faceDown: true })) } };
const exiledDown = moveCard(faceDown, game.zones.hand[0].uid, 'hand');
check('a face-down card is not named when it leaves', namesIn(describeMove(faceDown, exiledDown), handNames).length === 0, describeMove(faceDown, exiledDown));
check('life, counters and commander damage', describeMove(game, changeCommanderDamage(changePlayerCounter(adjustLife(game, -5), 'poison', 2), '2', 7), { seatName: () => 'Bob' }) === 'went from 20 to 15 life; {has} 2 poison; took 7 commander damage from Bob (7 in all)', describeMove(game, changeCommanderDamage(changePlayerCounter(adjustLife(game, -5), 'poison', 2), '2', 7), { seatName: () => 'Bob' }));
check('a token made is named as a token', describeMove(game, createToken(game, { n: 'Goblin', tt: 'Token Creature - Goblin', pt: '1/1', i: '00000000-0000-4000-8000-000000000999' }).game) === 'created a Goblin token');
check('moving a card on the grid or sorting the hand is not news', describeMove(game, { ...game, zones: { ...game.zones, hand: [...game.zones.hand].reverse() } }) === '');

// stored entries and the merged list
check('an entry is cut to its length and goes in slot k % 30', makeEntry({ k: 31, text: 'x'.repeat(500), turn: 2, at: 5 }).t.length === MAX_TEXT && slotFor(31) === '1' && LOG_SLOTS === 30);
const stored = { 0: { k: 30, t: 'drew 1 card', n: 3, at: 300 }, 1: { k: 1, t: 'played Sol Ring', n: 1, at: 100 }, 2: { k: 'x', t: 'bad', at: 1 }, 3: { k: 2, t: '', at: 5 }, 4: 'junk' };
check('a stored log keeps only real entries, oldest first, and its last number', JSON.stringify(readLog(stored).map((e) => e.k)) === '[1,30]' && lastK(stored) === 30 && readLog(null).length === 0);
const merged = mergeHistory({ a: { match: 2, log: { 1: { k: 1, t: 'drew 2 cards', n: 1, at: 200 } } }, b: { match: 2, log: { 1: { k: 1, t: 'shuffled {their} library; {has} 2 poison', n: 1, at: 100 } } }, c: { match: 1, log: { 1: { k: 1, t: 'old', n: 1, at: 50 } } } }, { names: { b: 'Bob' }, me: 'a', match: 2 });
check('everyone in time order, "You" and "your" for yours, the name and "their" for theirs, other matches left out', JSON.stringify(merged.map((e) => e.text)) === JSON.stringify(['Bob shuffled their library; has 2 poison.', 'You drew 2 cards.']), JSON.stringify(merged));
console.log(`All ${checks} live history checks passed.`);
