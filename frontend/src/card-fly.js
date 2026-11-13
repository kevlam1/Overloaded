// Short animations of cards flying between places on the solo table (Kevin, 2026-11-12): a card dropped on a pile flies into it, the library is shuffled by riffling card backs
// over it, a card drawn comes out of the library and flips face up as it lands in the hand, and a mulligan gathers the hand, flips it face down, takes it into the library and shuffles.
// They are drawn by pictures of their own on top of the page (fixed position, no mouse), made and removed here, so the game state is never touched; the page decides WHEN to call them.
// Under prefers-reduced-motion every one of them finishes at once and draws nothing. Plain DOM, no dependencies.

export const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const centreOf = (rect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
const clamp01 = (value) => Math.min(1, Math.max(0, value));
const easeInOut = (p) => (p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2);
const easeOut = (p) => 1 - (1 - p) ** 3;
const smooth = (p) => p * p * (3 - 2 * p);

// Runs step(p) for every animation frame over `ms`, p from 0 to 1 (eased), and ends with exactly 1.
function tween(ms, step, ease = easeInOut) {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = (now) => {
      const p = clamp01((now - start) / ms);
      step(ease(p));
      if (p < 1) requestAnimationFrame(tick); else resolve();
    };
    requestAnimationFrame(tick);
  });
}

// A picture drawn from a card node that is on the page: its centre, size and turn are read from the screen, and it can be put anywhere, turned and shrunk, and flipped to show the card back.
// flip: 0 shows the face, 1 shows the back; the picture is squeezed to nothing at one half, like a card turning over.
function makeCopy(node, backUrl) {
  const rect = node.getBoundingClientRect();
  const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform === 'none' ? undefined : getComputedStyle(node).transform);
  const w = node.offsetWidth || rect.width;
  const h = node.offsetHeight || rect.height;
  const holder = document.createElement('div');
  holder.className = 'fly-copy';
  holder.style.cssText = `position: fixed; left: 0; top: 0; width: ${w}px; height: ${h}px; margin: 0; pointer-events: none; z-index: 60; transform-origin: 50% 50%;`;
  const inner = node.cloneNode(true);
  inner.removeAttribute('id');
  inner.style.cssText = `position: absolute; left: 0; top: 0; width: 100%; height: 100%; margin: 0; padding: 0; transform: none; translate: none; scale: none; rotate: none; opacity: 1; visibility: visible; pointer-events: none;`;
  const back = document.createElement('span');
  back.className = 'fly-back';
  back.style.cssText = `position: absolute; left: 0; top: 0; width: 100%; height: 100%; border-radius: 4.8% / 3.4%; background: #1a1a1a url('${backUrl}') center / 100% 100% no-repeat; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5); transform: scaleX(0);`;
  holder.append(inner, back);
  document.body.appendChild(holder);
  const angle = (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI;
  const scale = Math.hypot(matrix.a, matrix.b) || 1;
  const copy = {
    holder, w, h, centre: centreOf(rect), angle, scale,
    set({ x, y, a = 0, s = 1, flip = 0 }) {
      holder.style.transform = `translate(${x - w / 2}px, ${y - h / 2}px) rotate(${a}deg) scale(${s})`;
      inner.style.transform = flip < 0.5 ? `scaleX(${1 - 2 * flip})` : 'scaleX(0)';
      back.style.transform = flip > 0.5 ? `scaleX(${2 * flip - 1})` : 'scaleX(0)';
    },
    remove() { holder.remove(); },
  };
  copy.set({ x: copy.centre.x, y: copy.centre.y, a: angle, s: scale, flip: 0 });
  return copy;
}

// A picture already on the page (a copy of the picture that was carried) flies to the middle of `target` (an element or a rect), fading, and is removed. (Only moved and faded: the picture
// is positioned by its own transform, and shrinking it with the scale property would shrink that move too.)
export async function flyAway(node, target, { duration = 260 } = {}) {
  if (!node) return;
  const to = target instanceof Element ? target.getBoundingClientRect() : target;
  if (reducedMotion() || !to || typeof node.animate !== 'function') { node.remove(); return; }
  const from = centreOf(node.getBoundingClientRect());
  const goal = centreOf(to);
  try {
    await node.animate([{ translate: '0px 0px', opacity: 1 }, { translate: `${goal.x - from.x}px ${goal.y - from.y}px`, opacity: 0.25 }], { duration, easing: 'cubic-bezier(0.4, 0, 0.8, 1)', fill: 'forwards' }).finished;
  } catch { /* an animation that was cancelled is simply over */ }
  node.remove();
}

// The library is shuffled: card backs over its top are split into 7 narrow parts that fan out side by side and then riffle back together one part after another, twice (Kevin, 2026-11-12: it was
// two halves, which looked chunky, and slower). Each part is 2 card backs. Resolves when it is over.
export const SHUFFLE_ANIMATION_MS = 700;
export const SHUFFLE_PARTS = 7;
export const SHUFFLE_CARDS = SHUFFLE_PARTS * 2;
const RETURN_ORDER = [3, 0, 6, 1, 5, 2, 4]; // the order the parts drop back onto the pile: from the middle outwards, left and right in turn, like the cards of a riffle
export async function shuffleAnimation(pile, backUrl) {
  const face = pile?.querySelector?.('.stack-face') ?? pile;
  if (!face || reducedMotion()) return;
  const rect = face.getBoundingClientRect();
  if (!rect.width) return;
  const cards = [];
  for (let i = 0; i < SHUFFLE_CARDS; i++) {
    const node = document.createElement('div');
    node.className = 'shuffle-card';
    node.style.cssText = `position: fixed; left: ${rect.left}px; top: ${rect.top}px; width: ${rect.width}px; height: ${rect.height}px; margin: 0; pointer-events: none; z-index: ${60 + i}; background: #1a1a1a url('${backUrl}') center / 100% 100% no-repeat; border-radius: 4.8% / 3.4%; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);`;
    document.body.appendChild(node);
    cards.push(node);
  }
  const animations = [];
  cards.forEach((node, i) => {
    const part = i % SHUFFLE_PARTS; // 0 to 6, left to right
    const middle = part - (SHUFFLE_PARTS - 1) / 2; // -3 to 3
    const rank = RETURN_ORDER.indexOf(part);
    const out = (reach) => ({ translate: `${middle * rect.width * 0.34 * reach}px ${-rect.height * 0.05 * (part % 2) * reach}px`, rotate: `${middle * 3 * reach}deg` });
    const home = { translate: '0px 0px', rotate: '0deg' };
    const back = (from) => from + rank * 0.03; // when a part drops back
    const keys = [
      { ...home, offset: 0 }, { ...out(1), offset: 0.16, easing: 'ease-out' },
      { ...out(1), offset: 0.2 }, { ...home, offset: back(0.24) + 0.1, easing: 'ease-in' },
      { ...home, offset: 0.56 }, { ...out(0.7), offset: 0.68, easing: 'ease-out' },
      { ...out(0.7), offset: 0.7 }, { ...home, offset: back(0.7) + 0.08, easing: 'ease-in' }, { ...home, offset: 1 },
    ];
    keys.sort((a, b) => a.offset - b.offset);
    animations.push(node.animate(keys, { duration: SHUFFLE_ANIMATION_MS, fill: 'both' }).finished.catch(() => {}));
  });
  await Promise.all(animations);
  for (const node of cards) node.remove();
}

// A mulligan, the first half: the cards of the hand gather in a stack in the middle of the hand, turn over to show their backs, and the stack flies into the library, getting small.
// handNodes are the card buttons of the hand (the caller hides the real hand while this runs). The caller then shuffles, and deals the new hand with flyDraw.
export async function gatherIntoPile(handNodes, handBox, pile, backUrl) {
  if (reducedMotion() || !handNodes.length || !pile) return;
  const target = (pile.querySelector?.('.stack-face') ?? pile).getBoundingClientRect();
  const goal = centreOf(target);
  const middle = centreOf(handBox);
  const copies = handNodes.map((node) => makeCopy(node, backUrl));
  const count = copies.length;
  const stackAt = (i) => ({ x: middle.x + (i - (count - 1) / 2) * 1.5, y: middle.y - i * 0.8 }); // a loose pile, each card a little higher than the one under it
  await tween(380, (p) => copies.forEach((c, i) => { const at = stackAt(i); c.set({ x: c.centre.x + (at.x - c.centre.x) * p, y: c.centre.y + (at.y - c.centre.y) * p, a: c.angle * (1 - p), s: c.scale, flip: 0 }); }));
  await wait(60);
  await tween(320, (p) => copies.forEach((c, i) => { const at = stackAt(i); c.set({ x: at.x, y: at.y, a: 0, s: c.scale, flip: p }); }), smooth);
  await wait(90);
  const end = target.width / Math.max(1, copies[0].w);
  await tween(480, (p) => copies.forEach((c, i) => {
    const q = easeOut(clamp01((p - (i / count) * 0.3) / 0.7)); // the cards leave one after the other, the top one first
    const at = stackAt(i);
    c.set({ x: at.x + (goal.x - at.x) * q, y: at.y + (goal.y - at.y) * q, a: 0, s: c.scale + (end - c.scale) * q, flip: 1 });
  }), (p) => p);
  for (const c of copies) c.remove();
}

// A card of the hand that has just been put there (by a draw or a deal) comes out of the library: it starts as a card back at the size of the pile, flies to its place in the hand,
// and turns face up on the way. `node` is its card button (already placed in the hand, and hidden here until it lands); `pile` the library; the picture follows the card as the hand
// lays itself out again (each frame it is read from the screen), so it lands exactly on it.
export async function flyDraw(node, pile, backUrl, { duration = 520 } = {}) {
  if (!node || !pile || reducedMotion() || typeof requestAnimationFrame !== 'function') return;
  const target = (pile.querySelector?.('.stack-face') ?? pile).getBoundingClientRect();
  if (!target.width) return;
  const copy = makeCopy(node, backUrl);
  const from = centreOf(target);
  const start = target.width / Math.max(1, copy.w);
  node.style.visibility = 'hidden';
  try {
    await tween(duration, (p) => {
      if (!node.isConnected) return;
      const rect = node.getBoundingClientRect();
      const m = new DOMMatrixReadOnly(getComputedStyle(node).transform === 'none' ? undefined : getComputedStyle(node).transform);
      const to = centreOf(rect);
      const a = (Math.atan2(m.b, m.a) * 180) / Math.PI;
      const s = Math.hypot(m.a, m.b) || 1;
      // 'p' is already eased; the card turns over in the middle of the way: back (1) until a quarter, face (0) from three quarters
      copy.set({ x: from.x + (to.x - from.x) * p, y: from.y + (to.y - from.y) * p - Math.sin(Math.PI * p) * target.height * 0.35, a: a * p, s: start + (s - start) * p, flip: 1 - smooth(clamp01((p - 0.25) / 0.5)) });
    }, easeOut);
  } finally {
    copy.remove();
    node.style.visibility = '';
  }
}
