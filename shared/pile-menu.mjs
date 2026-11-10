// What the right-click menu of a pile (your library, graveyard, exile or sideboard) offers and what each choice does. Plain data in, plain data out, no browser code, so Node tests can
// load it (scripts/test-pile-menu.mjs). The menu is drawn by frontend/src/card-menu.js (the same one a card uses); the pages run the action with their own apply(), and open the
// viewer themselves for "search" and "look" (they change nothing in the game).
import { shuffleLibrary, draw, moveCard, moveAll } from './zones.mjs';

export const PILE_ZONES = ['library', 'graveyard', 'exile', 'sideboard'];
export const DRAW_AMOUNTS = [2, 3, 4, 5, 7];
export const LOOK_AMOUNTS = [2, 3, 4, 5, 10];
export const MILL_AMOUNTS = [2, 3, 5, 10];
const MOVE_ALL_TARGETS = [['hand', 'Hand'], ['battlefield', 'Battlefield'], ['graveyard', 'Graveyard'], ['exile', 'Exile'], ['sideboard', 'Sideboard']];
const ZONE_WORDS = { library: 'your library', hand: 'your hand', battlefield: 'the battlefield', graveyard: 'your graveyard', exile: 'exile', command: 'the command zone', sideboard: 'your sideboard' };

// The items for a pile with this many cards in it: { id, label, amounts? } for a choice (clicking the label does it once, an amount does it that many times), or { id, label, items } for
// a heading that opens more. Nothing is offered that could not do anything (no shuffling or drawing an empty library).
export function pileMenuItems(zone, count) {
  if (!PILE_ZONES.includes(zone)) return [];
  const items = [{ id: 'search', label: 'Search...' }];
  if (zone === 'library') {
    if (count > 1) items.push({ id: 'shuffle', label: 'Shuffle' });
    if (count > 0) {
      items.push({ id: 'draw', label: 'Draw', amounts: DRAW_AMOUNTS.filter((n) => n <= count) });
      items.push({ id: 'look', label: 'Look at the top card', amounts: LOOK_AMOUNTS.filter((n) => n <= count) });
      items.push({ id: 'mill', label: 'Mill the top card', amounts: MILL_AMOUNTS.filter((n) => n <= count) });
    }
    return items;
  }
  if (count > 0) {
    items.push({
      id: 'moveall',
      label: 'Move all to',
      items: [
        ...MOVE_ALL_TARGETS.filter(([to]) => to !== zone).map(([to, label]) => ({ id: `moveall:${to}`, label })),
        { id: 'moveall:library-top', label: 'Top of library' },
        { id: 'moveall:library-bottom', label: 'Bottom of library' },
      ],
    });
  }
  return items;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// What a choice does to the game: { run(game) -> game, message } for a change, or null for an id that is not one (search and look are the page's: they only open the viewer).
// zone is the pile the menu was opened on. run throws what the game logic throws, so the page can show it.
export function pileAction(id, zone, amount = 1) {
  if (typeof id !== 'string' || !PILE_ZONES.includes(zone)) return null;
  const n = Number.isInteger(amount) && amount > 0 ? amount : 1;
  if (id === 'shuffle' && zone === 'library') return { run: (game) => shuffleLibrary(game), message: 'Shuffled your library.' };
  if (id === 'draw' && zone === 'library') return { run: (game) => draw(game, Math.min(n, game.zones.library.length || 1)).game, message: `Drew ${plural(n, 'card', 'cards')}.` };
  if (id === 'mill' && zone === 'library') {
    return {
      run: (game) => { let next = game; for (let i = 0; i < n && next.zones.library.length; i++) next = moveCard(next, next.zones.library[0].uid, 'graveyard'); return next; },
      message: `Milled the top ${n === 1 ? 'card' : `${n} cards`} of your library into your graveyard.`,
    };
  }
  const moveAllMatch = /^moveall:(.+)$/.exec(id);
  if (moveAllMatch) {
    const target = moveAllMatch[1];
    const to = target.startsWith('library') ? 'library' : target;
    const position = target === 'library-top' ? 'top' : target === 'library-bottom' ? 'bottom' : undefined;
    if (to === zone || (to !== 'library' && !MOVE_ALL_TARGETS.some(([t]) => t === to))) return null;
    return { run: (game) => moveAll(game, zone, to, position ? { position } : {}), message: `Moved everything from ${ZONE_WORDS[zone]} to ${target === 'library-top' ? 'the top of your library' : target === 'library-bottom' ? 'the bottom of your library' : ZONE_WORDS[to]}.` };
  }
  return null;
}
