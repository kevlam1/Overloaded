// Puts your hand in a fan (shared/hand-layout.mjs works out where each card goes): the cards sit next to each other, turned a little like an arc, and each shows its mana cost in a
// row of symbols above it. The buttons are the page's own card buttons (src/card-nodes.js); this only sets three numbers on each (--hx, --hy and --ha: how far across, how far down and
// how far turned), which the style sheet turns into the card's place, with a short transition so a change of order is quick. While a card of the hand is dragged a gap opens where it
// would go back and the cards beside it lean away (showGap). Plain DOM, no dependencies besides the layout and the mana symbols.
import { handLayout, insertionIndex } from '../../shared/hand-layout.mjs';
import { manaNode } from './mana-pips.js';

// container: the #hand element. costOf(uid): the mana cost text of the hand card with this uid ('' for none, a land has none).
// Returns { arrange(), showGap(index | null, uid), indexAt(x, uid) }.
const MARGIN = 14; // px kept free at each side, for the turn of the outer cards

export function mountHand({ container, costOf = () => '' }) {
  let gap = null; // where the dragged card would go (0 to the number of the other cards), or null
  let dragged = null; // the uid of the card being dragged, left out of the row while it is

  const buttons = () => [...container.querySelectorAll(':scope > .card')];

  function showCost(button) {
    const cost = String(costOf(button.dataset.uid) ?? '');
    let holder = button.querySelector(':scope > .hand-cost');
    if (!cost) { holder?.remove(); return; }
    if (holder && holder.dataset.cost === cost) return;
    holder?.remove();
    holder = document.createElement('span');
    holder.className = 'hand-cost';
    holder.dataset.cost = cost;
    holder.setAttribute('aria-hidden', 'true'); // the card's own label is what a screen reader says
    holder.append(manaNode(cost));
    button.append(holder);
  }

  function arrange() {
    const all = buttons();
    if (all.length === 0) return;
    const row = dragged ? all.filter((button) => button.dataset.uid !== dragged) : all;
    const sample = all[0];
    const layout = handLayout({ count: row.length, width: Math.max(0, container.clientWidth - 2 * MARGIN), cardWidth: sample.offsetWidth, cardHeight: sample.offsetHeight, gap });
    const shiftX = MARGIN; // the layout works in the width left after the margins
    row.forEach((button, index) => {
      const spot = layout.slots[index];
      // a card that has never been placed goes straight to its place, with no slide in from the corner
      const fresh = button.dataset.laid !== '1';
      if (fresh) button.style.transition = 'none';
      button.style.setProperty('--hx', `${spot.x + shiftX}px`);
      button.style.setProperty('--hy', `${spot.y}px`);
      button.style.setProperty('--ha', `${spot.angle}deg`);
      button.style.setProperty('--hz', String(index + 1)); // a variable, not z-index: the same button is reused on the battlefield, where an inline z-index would override its stacking
      if (fresh) { void button.offsetWidth; button.style.transition = ''; button.dataset.laid = '1'; }
    });
    for (const button of all) showCost(button);
  }

  // A card of the hand is being dragged: open a gap at index (the place among the OTHER cards) and leave the dragged card out of the row. null puts everything back.
  function showGap(index, uid = null) {
    const changed = gap !== (Number.isInteger(index) ? index : null) || dragged !== (Number.isInteger(index) ? uid : null);
    gap = Number.isInteger(index) ? index : null;
    dragged = gap === null ? null : uid;
    if (changed) arrange();
  }

  // Where a card let go with the pointer at clientX would go among the other cards of the hand (the dragged card is not counted).
  function indexAt(clientX, uid) {
    const others = buttons().filter((button) => button.dataset.uid !== uid);
    const sample = buttons()[0];
    if (!sample) return 0;
    return insertionIndex({ count: others.length, width: Math.max(0, container.clientWidth - 2 * MARGIN), cardWidth: sample.offsetWidth, x: clientX - container.getBoundingClientRect().left - MARGIN });
  }

  if (typeof ResizeObserver === 'function') new ResizeObserver(() => arrange()).observe(container);
  return { arrange, showGap, indexAt };
}
