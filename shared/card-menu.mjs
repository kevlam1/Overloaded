// What the right-click menu of a card offers and what each choice does. Plain data in, plain data out, no browser code, so Node
// tests can load it (scripts/test-card-menu.mjs). The menu itself is drawn by frontend/src/card-menu.js; the pages run the
// action with their own apply() so a refused move leaves the game as it was.
import { moveCard, setTapped, changeCounter, turnOver } from './zones.mjs';

export const ZONE_NAMES = { library: 'your library', hand: 'your hand', battlefield: 'the battlefield', graveyard: 'your graveyard', exile: 'exile', command: 'the command zone', sideboard: 'your sideboard' };
export const MOVE_TARGETS = [['hand', 'Hand'], ['battlefield', 'Battlefield'], ['graveyard', 'Graveyard'], ['exile', 'Exile'], ['command', 'Command zone'], ['sideboard', 'Sideboard']];
export const COUNTER_AMOUNTS = [2, 3, 5]; // the quick buttons next to "+1/+1 counter"; clicking the name itself adds 1

// The words for turning a two-sided card over, and the sentence for a screen reader or the message line after it (the pages use
// both, so the menu and the selected-card button say the same).
export const turnLabel = (card) => (card?.turned ? 'Turn back to front' : 'Turn over');
export const turnMessage = (card) => `Turned ${card.n} ${card.turned ? 'back to its front' : 'over'}.`;

// The items for a card in a zone: { id, label, amounts? } for a choice, { id, label, items } for a heading that opens more.
// Tap, counters and Modify belong to a card on the battlefield; moving is offered everywhere (not to the zone it is already in).
export function menuItems(card, zone) {
  const items = [];
  if (zone === 'battlefield') {
    items.push({ id: 'modify', label: 'Modify...' });
    items.push({ id: 'tap', label: card?.tapped ? 'Untap' : 'Tap' });
    if (card?.b === 1) items.push({ id: 'turn', label: turnLabel(card) }); // only a card with a back face (transform and modal cards)
    items.push({ id: 'counter', label: '+1/+1 counter', amounts: [...COUNTER_AMOUNTS] });
  }
  items.push({
    id: 'move',
    label: 'Move to',
    items: [
      ...MOVE_TARGETS.filter(([to]) => to !== zone).map(([to, label]) => ({ id: `move:${to}`, label })),
      { id: 'move:library-top', label: 'Top of library' },
      { id: 'move:library-bottom', label: 'Bottom of library' },
    ],
  });
  return items;
}

const MOVES = Object.fromEntries([
  ...MOVE_TARGETS.map(([to]) => [`move:${to}`, { to }]),
  ['move:library-top', { to: 'library', position: 'top' }],
  ['move:library-bottom', { to: 'library', position: 'bottom' }],
]);

// What a choice does to a card: { run(game) -> game, message, toast? }, or null for an id the page handles itself ("modify") or
// that is not a choice at all. run throws what the game logic throws (a card that is not there, a card not on the battlefield).
export function menuAction(id, card, amount = 1) {
  if (typeof id !== 'string' || !card) return null;
  const name = card.n;
  if (id === 'tap') return { run: (game) => setTapped(game, card.uid, !card.tapped), message: `${card.tapped ? 'Untapped' : 'Tapped'} ${name}.` };
  if (id === 'turn') return { run: (game) => turnOver(game, card.uid), message: turnMessage(card) };
  if (id === 'counter') {
    if (amount !== 1 && !COUNTER_AMOUNTS.includes(amount)) throw new Error('Add 1, 2, 3 or 5 counters from the menu.');
    return {
      run: (game) => changeCounter(game, card.uid, 'p', amount),
      message: `Added ${amount} +1/+1 counter${amount === 1 ? '' : 's'} to ${name}.`,
      toast: { text: `+${amount}/+${amount}`, tone: 'up' },
    };
  }
  if (!Object.hasOwn(MOVES, id)) return null;
  const { to, position } = MOVES[id];
  const gone = card.tok && to !== 'battlefield'; // a token that leaves the battlefield stops existing (shared/zones.mjs)
  const message = gone ? `${name} is a token, so it is gone.`
    : to === 'library' ? `Put ${name} ${position === 'top' ? 'on top of' : 'on the bottom of'} your library.`
      : `Moved ${name} to ${ZONE_NAMES[to]}.`;
  return { run: (game) => moveCard(game, card.uid, to, position ? { position } : {}), message };
}
