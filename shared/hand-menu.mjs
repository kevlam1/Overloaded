// The menu of the hand (Kevin, 2026-11-15): an arrow next to the hand count opens it. Plain logic with no browser code so Node can test it (scripts/test-hand-menu.mjs).
// Only what is not a button somewhere else: Mulligan, Shuffle hand into library, Discard X at random, Discard hand (no Draw: the library's menu has it).
// The page runs "mulligan" itself (it has the shuffle animation and the new deal); the others are changes to the game, run through apply().
import { moveAll, moveCard, shuffleLibrary, secureRandom } from './zones.mjs';

// Where "Move all to" can send the hand, and the name of each place: the group move of the picked cards uses the same ids (shared/group-menu.mjs: group:top, group:bottom, group:graveyard, group:exile).
export const MOVE_ALL = [['top', 'Library top'], ['bottom', 'Library bottom'], ['graveyard', 'Graveyard'], ['exile', 'Exile']];
export const moveAllGroupId = (id) => (typeof id === 'string' && id.startsWith('moveall:') && MOVE_ALL.some(([to]) => `moveall:${to}` === id) ? `group:${id.slice('moveall:'.length)}` : null);

// The items for a hand of this many cards: { id, label } for a choice, { id, label, ask: { max, unit } } for a line that asks for a number first. Nothing is offered that could do nothing.
export function handMenuItems(count) {
  const items = [{ id: 'mulligan', label: 'Mulligan' }];
  if (count > 0) {
    items.push({ id: 'shuffleinto', label: 'Shuffle hand into library' });
    items.push({ id: 'moveall', label: 'Move all to', items: MOVE_ALL.map(([to, label]) => ({ id: `moveall:${to}`, label })) }); // (Kevin, 2026-11-18: the whole hand to one place; the page runs it like the menu of picked cards, so the two library lines ask for the order)
    items.push({ id: 'discardrandom', label: 'Discard X at random...', ask: { max: count, unit: 'cards' } });
    items.push({ id: 'discardall', label: 'Discard hand' });
  }
  return items;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// What a choice does to the game: { run(game) -> game, message }, or null for an id that is not one ("mulligan" is the page's). random: for tests.
export function handAction(id, amount = 1, { random = secureRandom } = {}) {
  if (id === 'shuffleinto') return { run: (game) => shuffleLibrary(moveAll(game, 'hand', 'library', { position: 'top' }), random), message: 'Shuffled your hand into your library.' };
  if (id === 'discardall') return { run: (game) => moveAll(game, 'hand', 'graveyard'), message: 'Discarded your hand.' };
  if (id === 'discardrandom') {
    const n = Number.isInteger(amount) && amount > 0 ? amount : 1;
    return {
      run: (game) => {
        const uids = game.zones.hand.map((card) => card.uid);
        const count = Math.min(n, uids.length);
        for (let i = 0; i < count; i++) { const j = i + Math.floor(random() * (uids.length - i)); [uids[i], uids[j]] = [uids[j], uids[i]]; } // the first `count` places of a shuffle
        return uids.slice(0, count).reduce((next, uid) => moveCard(next, uid, 'graveyard'), game);
      },
      message: `Discarded ${plural(n, 'card', 'cards')} at random.`,
    };
  }
  return null;
}
