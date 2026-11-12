// Short animations of cards flying between places on the solo table (Kevin, 2026-11-12): a card dropped on a pile flies into it, the library is shuffled by riffling card backs
// over it, and a mulligan gathers the hand, takes it into the library and shuffles. They are drawn by pictures of their own on top of the page (fixed position, no mouse), made
// and removed here, so the game state is never touched; the page decides WHEN to call them. Under prefers-reduced-motion every one of them finishes at once and draws nothing.
// Plain DOM and the Web Animations API, no dependencies.

export const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const centreOf = (rect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });

function fixedPicture(rect, className) {
  const node = document.createElement('div');
  node.className = className;
  node.style.cssText = `position: fixed; left: ${rect.left}px; top: ${rect.top}px; width: ${rect.width}px; height: ${rect.height}px; margin: 0; pointer-events: none; z-index: 60;`;
  document.body.appendChild(node);
  return node;
}

// A picture already on the page (a copy of the picture that was carried) flies to the middle of `target` (an element or a rect), shrinking and fading, and is removed.
export async function flyAway(node, target, { duration = 260 } = {}) {
  if (!node) return;
  const to = target instanceof Element ? target.getBoundingClientRect() : target;
  if (reducedMotion() || !to || typeof node.animate !== 'function') { node.remove(); return; }
  const from = centreOf(node.getBoundingClientRect());
  const goal = centreOf(to);
  try {
    await node.animate([{ translate: '0px 0px', scale: 1, opacity: 1 }, { translate: `${goal.x - from.x}px ${goal.y - from.y}px`, scale: 0.55, opacity: 0.2 }], { duration, easing: 'cubic-bezier(0.4, 0, 0.8, 1)', fill: 'forwards' }).finished;
  } catch { /* an animation that was cancelled is simply over */ }
  node.remove();
}

// The library is shuffled: a few card backs over its top are split in two halves that part and then riffle back together, twice. Resolves when it is over.
export const SHUFFLE_ANIMATION_MS = 1150;
export async function shuffleAnimation(pile, backUrl) {
  const face = pile?.querySelector?.('.stack-face') ?? pile;
  if (!face || reducedMotion()) return;
  const rect = face.getBoundingClientRect();
  if (!rect.width) return;
  const cards = [];
  const count = 8;
  for (let i = 0; i < count; i++) {
    const node = fixedPicture(rect, 'shuffle-card');
    node.style.background = `#1a1a1a url('${backUrl}') center / 100% 100% no-repeat`;
    node.style.borderRadius = '4.8% / 3.4%';
    node.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.6)';
    node.style.zIndex = String(60 + i);
    cards.push(node);
  }
  const spread = rect.width * 0.62;
  const animations = [];
  cards.forEach((node, i) => {
    const side = i % 2 === 0 ? -1 : 1; // even cards are the left half, odd the right one
    const out = { translate: `${side * spread}px ${-rect.height * 0.04 * (i >> 1)}px`, rotate: `${side * 7}deg` };
    const home = { translate: '0px 0px', rotate: '0deg' };
    // part (0 to 0.25), hold, riffle back one card at a time (the card's turn depends on its number), part again a little less, riffle again
    const keys = [
      { ...home, offset: 0 }, { ...out, offset: 0.2, easing: 'ease-out' },
      { ...out, offset: 0.26 }, { ...home, offset: 0.26 + 0.05 + 0.04 * (i / count) * 3, easing: 'ease-in' },
      { ...home, offset: 0.62 }, { ...out, offset: 0.78, easing: 'ease-out' },
      { ...out, offset: 0.83 }, { ...home, offset: 0.97, easing: 'ease-in' }, { ...home, offset: 1 },
    ];
    keys.sort((a, b) => a.offset - b.offset);
    animations.push(node.animate(keys, { duration: SHUFFLE_ANIMATION_MS, fill: 'both' }).finished.catch(() => {}));
  });
  await Promise.all(animations);
  for (const node of cards) node.remove();
}

// A mulligan: the cards of the hand (pictures made from the nodes that are on screen) gather in the middle of the hand, fly into the library, and are gone. The caller then shuffles.
export async function gatherIntoPile(handNodes, handBox, pile) {
  if (reducedMotion() || !handNodes.length || !pile) return;
  const target = (pile.querySelector?.('.stack-face') ?? pile).getBoundingClientRect();
  const middle = centreOf(handBox);
  const copies = handNodes.map((node) => {
    const rect = node.getBoundingClientRect();
    const copy = node.cloneNode(true);
    copy.removeAttribute('id');
    copy.style.cssText = `position: fixed; left: ${rect.left}px; top: ${rect.top}px; width: ${node.offsetWidth}px; height: ${node.offsetHeight}px; margin: 0; pointer-events: none; z-index: 60; transform: ${getComputedStyle(node).transform}; translate: none; scale: none; rotate: none; opacity: 1;`;
    document.body.appendChild(copy);
    return { copy, from: centreOf(copy.getBoundingClientRect()) };
  });
  const runs = (frames, options) => Promise.all(copies.map(({ copy, from }, i) => copy.animate(frames(from, i), options(i)).finished.catch(() => {})));
  const goal = centreOf(target);
  await runs((from, i) => [{ translate: '0px 0px', rotate: '0deg' }, { translate: `${middle.x - from.x + (i - copies.length / 2) * 3}px ${middle.y - from.y}px`, rotate: '0deg' }], () => ({ duration: 340, easing: 'ease-in-out', fill: 'forwards' }));
  await wait(60);
  await runs((from, i) => [{ translate: `${middle.x - from.x + (i - copies.length / 2) * 3}px ${middle.y - from.y}px`, scale: 1, opacity: 1 }, { translate: `${goal.x - from.x}px ${goal.y - from.y}px`, scale: Math.max(0.2, target.width / Math.max(1, copies[0].copy.offsetWidth)), opacity: 0.9 }], (i) => ({ duration: 380, delay: i * 25, easing: 'cubic-bezier(0.5, 0, 0.9, 0.6)', fill: 'forwards' }));
  for (const { copy } of copies) copy.remove();
}
