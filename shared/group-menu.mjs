// The menu of several cards of the hand picked with Shift and a click (Kevin, 2026-11-15). Plain logic with no browser code so Node can test it (scripts/test-group-menu.mjs).
// One line acts on every picked card at once. Top and Bottom of library need the order the cards go in, so the page asks for it first (frontend/src/order-window.js) and gives it to groupAction.
import { moveCard } from './zones.mjs';

// The items for a group of this many cards: Play, Discard, Exile, the two ends of the library (each opens the window that sets the order) and Move to for the rest.
export function handGroupItems() {
  return [
    { id: 'group:battlefield', label: 'Play' },
    { id: 'group:graveyard', label: 'Discard' },
    { id: 'group:exile', label: 'Exile' },
    { id: 'group:top', label: 'Top of library...' },
    { id: 'group:bottom', label: 'Bottom of library...' },
    { id: 'move', label: 'Move to', items: [{ id: 'group:command', label: 'Command zone' }, { id: 'group:sideboard', label: 'Sideboard' }] },
  ];
}

// The lines that need an order before they can run.
export const needsOrder = (id) => id === 'group:top' || id === 'group:bottom';

const WORDS = {
  'group:battlefield': (n) => `Played ${n} cards.`,
  'group:graveyard': (n) => `Discarded ${n} cards.`,
  'group:exile': (n) => `Exiled ${n} cards.`,
  'group:command': (n) => `Moved ${n} cards to the command zone.`,
  'group:sideboard': (n) => `Moved ${n} cards to your sideboard.`,
  'group:top': (n) => `Put ${n} cards on the top of your library.`,
  'group:bottom': (n) => `Put ${n} cards on the bottom of your library.`,
};

// What a choice does to the game: { run(game) -> game, message }, or null for an id that is not one. uids: the picked cards, in the order they have in the hand (left to right). order: for Top and Bottom, the
// same uids in the order the player put them in (the first goes highest in the library: on top it is the top card, at the bottom the cards go under the library in that order). run throws in words when a card is no
// longer in the hand or the order is not the picked cards.
export function groupAction(id, uids, { order = null } = {}) {
  const word = WORDS[id];
  if (!word || !Array.isArray(uids) || uids.length === 0) return null;
  const n = uids.length;
  const check = (game, list) => {
    const inHand = new Set(game.zones.hand.map((card) => card.uid));
    if (new Set(list).size !== list.length || !list.every((uid) => inHand.has(uid))) throw new Error('Those cards are not all in your hand any more.');
  };
  if (id === 'group:top' || id === 'group:bottom') {
    return {
      run: (game) => {
        if (!Array.isArray(order) || order.length !== n || !uids.every((uid) => order.includes(uid))) throw new Error('Put the cards in an order first.');
        check(game, order);
        if (id === 'group:top') return [...order].reverse().reduce((next, uid) => moveCard(next, uid, 'library', { position: 'top' }), game);
        return order.reduce((next, uid) => moveCard(next, uid, 'library', { position: 'bottom' }), game);
      },
      message: word(n),
    };
  }
  const to = id.slice('group:'.length);
  return {
    run: (game) => { check(game, uids); return uids.reduce((next, uid) => moveCard(next, uid, to), game); },
    message: word(n),
  };
}
