// Puts your hand in a fan (shared/hand-layout.mjs works out where each card goes): the cards sit next to each other, turned a little like an arc, and each shows its mana cost in a
// row of symbols above it. The buttons are the page's own card buttons (src/card-nodes.js); this only sets three numbers on each (--hx, --hy and --ha: how far across, how far down and
// how far turned), which the style sheet turns into the card's place, with a short transition so a change of order is quick. While a card of the hand is dragged a gap opens where it
// would go back and the cards beside it lean away (showGap). Plain DOM, no dependencies besides the layout and the mana symbols.
import { handLayout, insertionIndex } from '../../shared/hand-layout.mjs';
import { manaNode } from './mana-pips.js';

// container: the #hand element. costOf(uid): the mana cost text of the hand card with this uid ('' for none, a land has none).
// Returns { arrange(), showGap(index | null, uid), indexAt(x, uid) }.
export function mountHand({ container, costOf = () => '' }) {
  // px kept free at each side for the turn of the outer cards: they swing out by about a fifth of a card's height, so it grows with the cards (a fixed 14 px clipped the first card once the hand was 50% larger)
  const margin = () => Math.max(14, Math.round((container.querySelector(':scope > .card')?.offsetHeight ?? 0) * 0.2));
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
    if (all.length === 0) { setZoneVars(); return; }
    const row = dragged ? all.filter((button) => button.dataset.uid !== dragged) : all;
    const sample = all[0];
    const layout = handLayout({ count: row.length, width: Math.max(0, container.clientWidth - 2 * margin()), cardWidth: sample.offsetWidth, cardHeight: sample.offsetHeight, gap });
    const shiftX = margin(); // the layout works in the width left after the margins
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
    // the dashed outline shown while a card is carried over the hand (style.css) covers the same width as the zone
    setZoneVars();
  }

  function setZoneVars() {
    const z = zone();
    container.style.setProperty('--zl', `${z.left - container.getBoundingClientRect().left}px`);
    container.style.setProperty('--zw', `${z.right - z.left}px`);
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
    return insertionIndex({ count: others.length, width: Math.max(0, container.clientWidth - 2 * margin()), cardWidth: sample.offsetWidth, x: clientX - container.getBoundingClientRect().left - margin() });
  }

  // Where the hand is on screen, for a card let go over it: the width the cards cover (with half a card of slack at each end, so a card can be put at either end) and the height of the box.
  // With no cards it is a few cards wide in the middle, so a card can still be put back into an empty hand.
  function zone() {
    const box = container.getBoundingClientRect();
    const all = buttons();
    const cardWidth = all[0] ? all[0].offsetWidth : box.height * 0.6;
    const slack = cardWidth / 2;
    let left = box.left + box.width / 2 - cardWidth * 1.5;
    let right = box.left + box.width / 2 + cardWidth * 1.5;
    if (all.length) {
      const xs = all.map((button) => parseFloat(button.style.getPropertyValue('--hx')) || 0);
      left = box.left + Math.min(...xs) - slack;
      right = box.left + Math.max(...xs) + cardWidth + slack;
    }
    return { left, right, top: box.top, bottom: box.bottom };
  }

  // Is the point (x, y) on screen over a card of the hand? (With no cards in it, over the few cards' width in the middle where one would go.) What is under the pointer is asked of the page, so
  // the tilt of the cards and the gaps between them count exactly.
  function hit(x, y) {
    if (buttons().length === 0) { const z = zone(); return x >= z.left && x < z.right && y >= z.top && y < z.bottom; }
    const el = document.elementFromPoint(x, y)?.closest('.card');
    return Boolean(el) && el.parentElement === container;
  }

  if (typeof ResizeObserver === 'function') new ResizeObserver(() => arrange()).observe(container);
  return { arrange, showGap, indexAt, zone, hit };
}
