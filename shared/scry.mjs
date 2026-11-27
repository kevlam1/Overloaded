// Scry and Surveil (Kevin, 2026-11-15, from his sketch of the library menu). Plain logic with no browser code, so Node can test it (scripts/test-scry.mjs); the window that shows the cards and asks what to do
// with each is frontend/src/scry-window.js.
//   Scry N:    look at the top N cards of your library, then put any number of them on the BOTTOM and the rest back on the top in any order.
//   Surveil N: the same, but a card may also go to the GRAVEYARD.
// The window gives the N cards in the order the player has put them in (left to right: the first is the top card) and a choice for each: 'top', 'bottom' or (surveil) 'graveyard'.
// The cards that stay on top keep that order, the ones for the bottom go under the library in that order, and the graveyard ones go there one after another.
import { moveCard } from './zones.mjs';

export const SCRY_CHOICES = { scry: ['top', 'bottom'], surveil: ['top', 'graveyard'] }; // (surveil: top or graveyard, as the rules say; the bottom was taken out, Kevin's friends, 2026-11-26)

// The cards to look at: the top n of the library (all of it if it is smaller).
export function topCards(game, n) {
  const count = Number.isInteger(n) && n > 0 ? n : 1;
  return game.zones.library.slice(0, count);
}

// What the choices do: { game, counts: { top, bottom, graveyard }, message }. kind: 'scry' or 'surveil'. order: the uids of the cards looked at, in the order the player put them in (it must be
// exactly the top cards of the library, in any order). choices: an object from uid to 'top', 'bottom' or 'graveyard' (a card with no choice stays on top). Throws in words for anything else.
export function applyScry(game, { kind, order, choices = {} }) {
  const allowed = SCRY_CHOICES[kind];
  if (!allowed) throw new Error('That is not scry or surveil.');
  if (!Array.isArray(order) || order.length === 0) throw new Error('There are no cards to look at.');
  const looked = game.zones.library.slice(0, order.length);
  if (new Set(order).size !== order.length || looked.length !== order.length || !looked.every((card) => order.includes(card.uid))) throw new Error('Those are not the top cards of your library any more.');
  const choice = (uid) => choices[uid] ?? 'top';
  for (const uid of order) if (!allowed.includes(choice(uid))) throw new Error(kind === 'scry' ? 'A scried card goes on the top or the bottom.' : 'A surveilled card goes on the top or into the graveyard.');
  const byUid = new Map(looked.map((card) => [card.uid, card]));
  const to = (place) => order.filter((uid) => choice(uid) === place);
  const top = to('top'); const bottom = to('bottom'); const gone = to('graveyard');
  let next = game;
  for (const uid of gone) next = moveCard(next, uid, 'graveyard'); // one after another, as a mill would
  const rest = next.zones.library.slice(order.length - gone.length); // what was under the cards looked at
  const library = [...top.map((uid) => byUid.get(uid)), ...rest, ...bottom.map((uid) => byUid.get(uid))];
  next = { ...next, zones: { ...next.zones, library } };
  const counts = { top: top.length, bottom: bottom.length, graveyard: gone.length };
  const parts = kind === 'surveil' ? [`${counts.top} on top`, `${counts.graveyard} in the graveyard`] : [`${counts.top} on top`, `${counts.bottom} on the bottom`];
  return { game: next, counts, message: `${kind === 'scry' ? 'Scried' : 'Surveilled'} ${order.length}: ${parts.join(', ')}.` };
}
