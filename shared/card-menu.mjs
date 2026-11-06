// What the right-click menu of a card offers and what each choice does. Plain data in, plain data out, no browser code, so Node
// tests can load it (scripts/test-card-menu.mjs). The menu itself is drawn by frontend/src/card-menu.js; the pages run the
// action with their own apply() so a refused move leaves the game as it was.
import { moveCard, setTapped, changeCounter, turnOver, copyAsToken, faceName } from './zones.mjs';

export const ZONE_NAMES = { library: 'your library', hand: 'your hand', battlefield: 'the battlefield', graveyard: 'your graveyard', exile: 'exile', command: 'the command zone', sideboard: 'your sideboard' };
export const MOVE_TARGETS = [['hand', 'Hand'], ['battlefield', 'Battlefield'], ['graveyard', 'Graveyard'], ['exile', 'Exile'], ['command', 'Command zone'], ['sideboard', 'Sideboard']];
export const COUNTER_AMOUNTS = [2, 3, 5]; // the quick buttons next to "+1/+1 counter"; clicking the name itself adds 1

// The words for turning a two-sided card over, and the sentence for a screen reader or the message line after it (the pages use
// both, so the menu and the selected-card button say the same).
export const turnLabel = (card) => (card?.turned ? 'Turn back to front' : 'Turn over');
export const turnMessage = (card) => `Turned ${card.n} ${card.turned ? 'back to its front' : 'over'}.`;

// Playing a modal card as its back face (a spell on the front and a land on the back, for example): the name of that face, or words for it
// when the saved name has no two halves. A transform card has a back face too, but only a modal card (md: 1) can be played as it.
// It is offered where a card can be cast from: the hand, the graveyard, exile and the command zone.
export const PLAY_BACK_ZONES = ['hand', 'graveyard', 'exile', 'command'];
const backNameOf = (card) => { const parts = String(card?.n ?? '').split(' // '); return parts.length === 2 ? parts[1] : null; };
export const playBackLabel = (card) => `Play ${backNameOf(card) ?? 'its back face'}`;

// The items for a card in a zone: { id, label, amounts? } for a choice, { id, label, items } for a heading that opens more.
// Tap, counters and Modify belong to a card on the battlefield; moving is offered everywhere (not to the zone it is already in).
export function menuItems(card, zone) {
  const items = [];
  if (zone === 'battlefield') {
    items.push({ id: 'modify', label: 'Modify...' });
    items.push({ id: 'tap', label: card?.tapped ? 'Untap' : 'Tap' });
    if (card?.b === 1) items.push({ id: 'turn', label: turnLabel(card) }); // only a card with a back face (transform and modal cards)
    items.push({ id: 'counter', label: '+1/+1 counter', amounts: [...COUNTER_AMOUNTS] });
    items.push({ id: 'copy', label: 'Create copy' });
  }
  if (card?.md === 1 && card.b === 1 && PLAY_BACK_ZONES.includes(zone)) items.push({ id: 'playback', label: playBackLabel(card) });
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
// printed (optional): the printed power and toughness of the face that shows, as text, for "Create copy" (the page knows it from the card list).
export function menuAction(id, card, amount = 1, { printed = null } = {}) {
  if (typeof id !== 'string' || !card) return null;
  const name = card.n;
  if (id === 'copy') return { run: (game) => copyAsToken(game, card.uid, { printed }).game, message: `Made a token copy of ${faceName(card)}.` };
  if (id === 'playback') {
    return {
      run: (game) => {
        if (card.md !== 1 || card.b !== 1) throw new Error(`${name} cannot be played as its back face (only a modal card can).`);
        if (game.zones.battlefield.some((on) => on.uid === card.uid)) throw new Error(`${name} is already on the battlefield.`);
        return turnOver(moveCard(game, card.uid, 'battlefield'), card.uid);
      },
      message: `Played ${backNameOf(card) ?? 'the back face'} (the back of ${String(name).split(' // ')[0]}).`,
    };
  }
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
