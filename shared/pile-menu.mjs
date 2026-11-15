// What the right-click menu of a pile (your library, graveyard, exile or sideboard) offers and what each choice does. Plain data in, plain data out, no browser code, so Node tests can
// load it (scripts/test-pile-menu.mjs). The menu is drawn by frontend/src/card-menu.js (the same one a card uses); the pages run the action with their own apply(), and open the
// viewer themselves for "search" and "look" (they change nothing in the game).
// Reworked 2026-11-15 (Kevin: "not a fan of the 2-7 number buttons"): a line that needs a number says so with \`ask\` and the menu opens a small box where the number is typed (frontend/src/number-box.js);
// there are no rows of fixed amounts any more.
import { shuffleLibrary, draw, moveCard, moveAll } from './zones.mjs';

export const PILE_ZONES = ['library', 'graveyard', 'exile', 'sideboard'];
const MOVE_ALL_TARGETS = [['hand', 'Hand'], ['battlefield', 'Battlefield'], ['graveyard', 'Graveyard'], ['exile', 'Exile'], ['sideboard', 'Sideboard']];
const ZONE_WORDS = { library: 'your library', hand: 'your hand', battlefield: 'the battlefield', graveyard: 'your graveyard', exile: 'exile', command: 'the command zone', sideboard: 'your sideboard' };
const VIEW_WORDS = { library: 'library', graveyard: 'graveyard', exile: 'exile', sideboard: 'sideboard' };

// The items for a pile with this many cards in it: { id, label } for a choice, { id, label, ask: { max, unit } } for a line that asks for a number first (its label ends in "..."), or
// { id, label, items } for a heading that opens more. The same id may be on two lines (Draw card and Draw X...): the number says how many. Nothing is offered that could not do anything
// (no shuffling or drawing an empty library).
export function pileMenuItems(zone, count) {
  if (!PILE_ZONES.includes(zone)) return [];
  const items = [{ id: 'search', label: `View ${VIEW_WORDS[zone]}` }];
  const ask = { max: count, unit: 'cards' };
  if (zone === 'library') {
    if (count > 0) {
      items.push({ id: 'draw', label: 'Draw card' });
      items.push({ id: 'draw', label: 'Draw X...', ask });
      items.push({ id: 'look', label: 'Look at top X...', ask });
      items.push({ id: 'mill', label: 'Mill X...', ask });
      items.push({ id: 'exiletop', label: 'Exile top X...', ask });
    }
    if (count > 1) items.push({ id: 'shuffle', label: 'Shuffle' });
    return items;
  }
  if (count > 0) {
    if (zone === 'graveyard') items.push({ id: 'moveall:exile', label: 'Exile all' });
    if (zone === 'graveyard' || zone === 'exile') items.push({ id: 'intolibrary', label: 'Shuffle into library' });
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
const topOfLibrary = (game, n, to) => { let next = game; for (let i = 0; i < n && next.zones.library.length; i++) next = moveCard(next, next.zones.library[0].uid, to); return next; };

// What a choice does to the game: { run(game) -> game, message } for a change, or null for an id that is not one (search and look are the page's: they only open the viewer).
// zone is the pile the menu was opened on. run throws what the game logic throws, so the page can show it.
export function pileAction(id, zone, amount = 1) {
  if (typeof id !== 'string' || !PILE_ZONES.includes(zone)) return null;
  const n = Number.isInteger(amount) && amount > 0 ? amount : 1;
  if (id === 'shuffle' && zone === 'library') return { run: (game) => shuffleLibrary(game), message: 'Shuffled your library.' };
  if (id === 'draw' && zone === 'library') return { run: (game) => draw(game, Math.min(n, game.zones.library.length || 1)).game, message: `Drew ${plural(n, 'card', 'cards')}.` };
  if (id === 'mill' && zone === 'library') {
    return { run: (game) => topOfLibrary(game, n, 'graveyard'), message: `Milled the top ${n === 1 ? 'card' : `${n} cards`} of your library into your graveyard.` };
  }
  if (id === 'exiletop' && zone === 'library') {
    return { run: (game) => topOfLibrary(game, n, 'exile'), message: `Exiled the top ${n === 1 ? 'card' : `${n} cards`} of your library.` };
  }
  if (id === 'intolibrary' && (zone === 'graveyard' || zone === 'exile')) {
    return { run: (game) => shuffleLibrary(moveAll(game, zone, 'library', { position: 'top' })), message: `Shuffled everything from ${ZONE_WORDS[zone]} into your library.` };
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
