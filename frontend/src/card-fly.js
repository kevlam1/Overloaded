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
// flip: 0 shows the face, 1 shows the back; the card turns about its upright middle line (a real 3D turn to the right, 0 to 180 degrees, the side that turns away hidden), and
// grows a little at the middle of the turn, as if it were lifted for it.
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
  inner.style.cssText = `position: absolute; left: 0; top: 0; width: 100%; height: 100%; margin: 0; padding: 0; transform: none; translate: none; scale: none; rotate: none; opacity: 1; visibility: visible; pointer-events: none; backface-visibility: hidden;`;
  const back = document.createElement('span');
  back.className = 'fly-back';
  back.style.cssText = `position: absolute; left: 0; top: 0; width: 100%; height: 100%; border-radius: 4.8% / 3.4%; background: #1a1a1a url('${backUrl}') center / 100% 100% no-repeat; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5); backface-visibility: hidden; transform: rotateY(180deg);`;
  holder.append(inner, back);
  document.body.appendChild(holder);
  const angle = (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI;
  const scale = Math.hypot(matrix.a, matrix.b) || 1;
  const copy = {
    holder, w, h, centre: centreOf(rect), angle, scale,
    set({ x, y, a = 0, s = 1, flip = 0 }) {
      const lift = 1 + 0.12 * Math.sin(Math.PI * flip); // biggest halfway through the turn
      const turn = flip * 180;
      holder.style.transform = `translate(${x - w / 2}px, ${y - h / 2}px) rotate(${a}deg) scale(${s * lift})`;
      inner.style.transform = `perspective(${Math.round(w * 10)}px) rotateY(${turn}deg)`;
      back.style.transform = `perspective(${Math.round(w * 10)}px) rotateY(${turn + 180}deg)`;
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

// The library is shuffled as a riffle (Kevin chose it from three styles, 2026-11-12, and asked for it a little toned down): the pile is split in two halves that part a little, the cards of the
// two halves drop into the middle one by one, each side in turn, interleaving, and the stack squares up with a small bounce. Resolves when it is over.
export const SHUFFLE_ANIMATION_MS = 900;
export const SHUFFLE_CARDS = 14;
const jitter = (n) => { const x = Math.sin(n * 9301 + 49297) * 233280; return x - Math.floor(x); }; // the same small mess every time
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
  const total = SHUFFLE_ANIMATION_MS;
  const animations = cards.map((node, i) => {
    const side = i % 2 === 0 ? -1 : 1; // even cards are the left half, odd the right one
    const apart = { transform: `translate(${side * rect.width * 0.46}px, ${-(i >> 1) * 0.5}px) rotate(${side * 4}deg)` };
    const drop = 140 + i * 36; // the cards fall in turn: left, right, left, right ...
    const settle = { transform: `translate(${(jitter(i) - 0.5) * 2.5}px, ${-i * 0.5}px) rotate(${(jitter(i + 20) - 0.5) * 1.6}deg)` };
    const keys = [
      { transform: 'translate(0px, 0px) rotate(0deg)', offset: 0 },
      { ...apart, offset: 0.15, easing: 'ease-out' },
      { ...apart, offset: drop / total },
      { transform: `translate(${side * rect.width * 0.16}px, ${-rect.height * 0.16}px) rotate(${side * 2}deg)`, offset: (drop + 50) / total, easing: 'ease-in' },
      { ...settle, offset: (drop + 105) / total },
      { ...settle, offset: 0.86 },
      { transform: `translate(0px, ${-i * 0.5 - 3}px) rotate(0deg)`, offset: 0.93, easing: 'ease-out' },
      { transform: 'translate(0px, 0px) rotate(0deg)', offset: 1 },
    ];
    return node.animate(keys, { duration: total, fill: 'both' }).finished.catch(() => {});
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
  const stackAt = () => ({ x: middle.x, y: middle.y }); // one neat, upright stack: every card exactly on the same spot (Kevin, 2026-11-12: not a slanted or diagonal pile)
  // (the hand comes together in 190 ms: twice as fast as before, Kevin 2026-11-13)
  await tween(110, (p) => copies.forEach((c, i) => { const at = stackAt(); c.set({ x: c.centre.x + (at.x - c.centre.x) * p, y: c.centre.y + (at.y - c.centre.y) * p, a: c.angle * (1 - p), s: c.scale, flip: 0 }); }));
  await wait(40);
  // the whole stack turns over as one (Kevin, 2026-11-12), slowly enough to see
  await tween(380, (p) => copies.forEach((c, i) => { const at = stackAt(); c.set({ x: at.x, y: at.y, a: 0, s: c.scale, flip: smooth(p) }); }), (p) => p);
  await wait(80);
  const end = target.width / Math.max(1, copies[0].w);
  await tween(480, (p) => copies.forEach((c, i) => {
    const q = easeOut(clamp01((p - (i / count) * 0.3) / 0.7)); // the cards leave the stack one after the other, the top one first (as Kevin liked it)
    const at = stackAt();
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
