// Choosing a deck's commander from the card itself (the "..." button or a right-click on a card in the deck view). Plain data in, plain data out, no browser code, so Node tests can
// load it (scripts/test-deck-commander.mjs). picks is [commander, partner], two card ids ('' for none), the same two choices as the Commander and Partner selects.
//
// A card may be made the commander (in the first place, whatever was there) or the partner (second place), or taken out of the commander places; the card that was replaced goes back
// to its type group. The same card is never both. Only a card of the main deck can be picked (not the sideboard, companion or maybeboard), and only in a Commander deck.

export const PICKABLE_SECTIONS = ['main', 'commander', 'unlabeled'];

// The menu for one line: [{ id, label }], empty when nothing can be done (Standard, a sideboard card, a line that was not matched).
export function commanderMenuItems(line, picks, { commanderFormat }) {
  if (!commanderFormat || !line || line.status !== 'matched' || !line.card || !PICKABLE_SECTIONS.includes(line.section)) return [];
  const id = line.card.i;
  const [first, second] = [picks?.[0] ?? '', picks?.[1] ?? ''];
  if (id === first) return [{ id: 'unpick', label: 'Not the commander' }];
  if (id === second) return [{ id: 'unpick', label: 'Not the partner' }, { id: 'commander', label: 'Make commander instead' }];
  return [{ id: 'commander', label: first ? 'Make commander (replaces the current one)' : 'Make commander' }, { id: 'partner', label: second ? 'Make partner (replaces the current one)' : 'Make partner' }];
}

// What the picks are after a choice. action: 'commander', 'partner' or 'unpick'. A partner with no commander becomes the commander.
export function applyCommanderChoice(picks, action, id) {
  let [first, second] = [picks?.[0] ?? '', picks?.[1] ?? ''];
  if (typeof id !== 'string' || !id) return [first, second];
  if (action === 'commander') {
    if (id === second) second = first === id ? '' : first; // swapping places: the old commander becomes the partner
    first = id;
  } else if (action === 'partner') {
    if (id === first) first = second && second !== id ? second : ''; // moved from first to second
    second = id;
    if (!first) { first = second; second = ''; }
  } else if (action === 'unpick') {
    if (id === first) { first = second; second = ''; } else if (id === second) second = '';
  }
  if (first && first === second) second = '';
  return [first, second];
}

// The words for the status line after a choice.
export function commanderChoiceMessage(action, name) {
  if (action === 'commander') return `${name} is now the commander.`;
  if (action === 'partner') return `${name} is now the partner.`;
  return `${name} is no longer a commander.`;
}
