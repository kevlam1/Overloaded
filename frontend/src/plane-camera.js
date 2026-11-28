// The camera of the Shared view's plane (Kevin, 2026-11-25): the plane (the battlefield element, drawn at a fixed size) is moved and scaled inside a window that clips it.
// The wheel zooms around the pointer (15% to 250%); the middle button, or the left one while Space is held, drags the plane; a small control has -, the zoom, +, Fit and Mine.
// A CSS transform does it, so a card's on-screen box (getBoundingClientRect) already includes the zoom and the drag code's pointer-to-cell math keeps working.
// Alt and the wheel stay the size of the Alt picture (src/card-hover.js). Kept in this browser per table. Glides between places, except under reduced motion.
import { makeSafeStore } from './safe-store.js';

const MIN = 0.15; // (Fit needs about a quarter: the whole plane is 3,584 by 2,080 px)
const MAX = 2.5;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// viewport: the element that clips (the area of the board); plane: the element moved (the battlefield); controls: an element to put the buttons in; key: where the camera is kept.
export function mountPlaneCamera({ viewport, plane, controls, key, mine = () => null, baseTurn = () => 0 }) { // baseTurn: the quarter turns that put your own home at the bottom
  const store = makeSafeStore();
  let view = { scale: 1, x: 0, y: 0, turn: 0 }; // turn: quarter turns clockwise of the plane about its middle (2026-11-26 feedback: the table seen from your own seat; Ctrl+Q and Ctrl+E turn it)
  let active = false;
  let pan = null;
  let space = false;

  const quarter = () => ((view.turn % 4) + 4) % 4;
  // a point of the plane (its own pixels) turned about the plane's middle by the view's quarter turns, and back
  const turnPoint = (p, q = quarter()) => {
    const { w, h } = size(); const cx = w / 2; const cy = h / 2; const dx = p.x - cx; const dy = p.y - cy;
    const [rx, ry] = [[dx, dy], [-dy, dx], [-dx, -dy], [dy, -dx]][((q % 4) + 4) % 4];
    return { x: cx + rx, y: cy + ry };
  };
  function apply({ glide = false } = {}) {
    const { w, h } = size();
    plane.style.transformOrigin = '0 0';
    plane.style.transition = glide && !reduced() ? 'transform 0.35s ease' : 'none';
    plane.style.transform = `translate(${Math.round(view.x)}px, ${Math.round(view.y)}px) scale(${view.scale}) translate(${w / 2}px, ${h / 2}px) rotate(${quarter() * 90}deg) translate(${-w / 2}px, ${-h / 2}px)`;
    plane.dataset.turn = String(quarter());
    plane.style.setProperty('--zoom', String(view.scale)); // (the nameplates grow as the plane gets smaller, so they stay readable)
    zoomLabel.textContent = `${Math.round(view.scale * 100)}%`;
    store.set(key(), JSON.stringify(view));
  }
  const size = () => ({ w: plane.offsetWidth, h: plane.offsetHeight });
  // The camera showing a box of the plane (in the plane's own pixels) as large as fits, in the middle of the window.
  function show(box, { glide = true } = {}) {
    const vw = viewport.clientWidth; const vh = viewport.clientHeight;
    if (!vw || !vh || !box.w || !box.h) return;
    const [bw, bh] = quarter() % 2 ? [box.h, box.w] : [box.w, box.h]; // (on its side the box is as wide as it was tall)
    const scale = clamp(Math.min(vw / bw, vh / bh) * 0.96, MIN, MAX);
    const middle = turnPoint({ x: box.x + box.w / 2, y: box.y + box.h / 2 });
    view = { ...view, scale, x: vw / 2 - middle.x * scale, y: vh / 2 - middle.y * scale };
    apply({ glide });
  }
  const HANDS = 120; // (the hands lie just outside the top and bottom edges: Fit shows them too)
  const fit = (options) => { const { w, h } = size(); show({ x: 0, y: -HANDS, w, h: h + 2 * HANDS }, options); };
  const showMine = (options) => { const box = mine(); if (box) show(box, options); else fit(options); };
  function zoomAt(factor, cx, cy) {
    const next = clamp(view.scale * factor, MIN, MAX);
    if (next === view.scale) return;
    view = { ...view, scale: next, x: cx - ((cx - view.x) * next) / view.scale, y: cy - ((cy - view.y) * next) / view.scale };
    apply();
  }

  // the control: - 100% + Fit Mine
  const button = (words, title, run) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'secondary plane-button'; b.textContent = words; b.title = title; b.setAttribute('aria-label', title); b.addEventListener('click', run); return b; };
  const zoomLabel = document.createElement('span'); zoomLabel.className = 'plane-zoom';
  const centre = () => ({ x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 });
  controls.replaceChildren(
    button('−', 'Zoom out', () => { const c = centre(); zoomAt(1 / 1.25, c.x, c.y); }),
    zoomLabel,
    button('+', 'Zoom in', () => { const c = centre(); zoomAt(1.25, c.x, c.y); }),
    button('Fit', 'See the whole table', () => fit()),
    button('Mine', 'Go to your area', () => showMine()),
  );

  viewport.addEventListener('wheel', (event) => {
    if (!active || event.altKey) return; // (Alt and the wheel size the Alt picture)
    event.preventDefault();
    const box = viewport.getBoundingClientRect();
    zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX - box.left, event.clientY - box.top);
  }, { passive: false });
  // Panning: the middle button anywhere on the plane, or the left one on empty felt while Space is held. Registered on the document in the capture phase, before the
  // card drag (mounted later), so a pan never also starts a drag or a selection rectangle.
  const onDown = (event) => {
    if (!active || !viewport.contains(event.target)) return;
    const middle = event.button === 1;
    const spaceLeft = event.button === 0 && space;
    if (!middle && !spaceLeft) return;
    event.preventDefault(); event.stopImmediatePropagation();
    pan = { x: event.clientX, y: event.clientY, from: { ...view } };
    viewport.classList.add('panning');
  };
  const onMove = (event) => {
    if (!pan) return;
    event.preventDefault(); event.stopImmediatePropagation();
    view = { ...pan.from, x: pan.from.x + event.clientX - pan.x, y: pan.from.y + event.clientY - pan.y };
    apply();
  };
  const onUp = (event) => { if (!pan) return; event.stopImmediatePropagation(); pan = null; viewport.classList.remove('panning'); };
  document.addEventListener('pointerdown', onDown, true);
  document.addEventListener('pointermove', onMove, true);
  document.addEventListener('pointerup', onUp, true);
  viewport.addEventListener('auxclick', (event) => { if (event.button === 1) event.preventDefault(); });
  document.addEventListener('keydown', (event) => {
    if (!active || event.code !== 'Space' || event.target.closest?.('input, textarea, select, [contenteditable]')) return;
    event.preventDefault();
    if (!space) { space = true; viewport.classList.add('can-pan'); }
  });
  document.addEventListener('keyup', (event) => { if (event.code === 'Space') { space = false; viewport.classList.remove('can-pan'); } });
  // Ctrl+Q and Ctrl+E turn the table a quarter turn left and right about the middle of the window (2026-11-26 feedback)
  function turnBy(steps) {
    const vw = viewport.clientWidth; const vh = viewport.clientHeight;
    const under = untouched({ x: vw / 2, y: vh / 2 }); // the point of the plane in the middle of the window stays there
    view = { ...view, turn: quarter() + steps };
    const moved = turnPoint(under);
    view = { ...view, x: vw / 2 - moved.x * view.scale, y: vh / 2 - moved.y * view.scale };
    apply({ glide: true });
  }
  document.addEventListener('keydown', (event) => {
    if (!active || !event.ctrlKey || event.altKey || event.metaKey || event.target.closest?.('input, textarea, select, [contenteditable]')) return;
    const steps = event.code === 'KeyQ' ? -1 : event.code === 'KeyE' ? 1 : 0;
    if (!steps) return;
    event.preventDefault(); event.stopImmediatePropagation();
    turnBy(steps);
  }, true);
  // A point of the window (relative to it) as a point of the plane's own pixels.
  function untouched(p) {
    const q = { x: (p.x - view.x) / view.scale, y: (p.y - view.y) / view.scale };
    return turnPoint(q, -quarter());
  }

  return {
    // on: the Shared view is showing. The first time, the camera kept for this table comes back, or it shows your area.
    setActive(on) {
      if (on === active) return;
      active = on;
      controls.hidden = !on;
      if (!on) { plane.style.transform = ''; plane.style.transition = ''; return; }
      let kept = null;
      try { kept = JSON.parse(store.get(key()) ?? 'null'); } catch { kept = null; }
      if (kept && [kept.scale, kept.x, kept.y].every(Number.isFinite)) { view = { scale: clamp(kept.scale, MIN, MAX), x: kept.x, y: kept.y, turn: Number.isInteger(kept.turn) ? kept.turn : baseTurn() }; apply(); } else { view = { ...view, turn: baseTurn() }; requestAnimationFrame(() => showMine({ glide: false })); }
    },
    show, fit, showMine, turnBy,
    // the quarter turns now, and a new turn (with a box of the plane to show, in cells), as for a seat card in the rail: the table turned to that player
    turn: () => quarter(),
    turnTo(q, box, cellPx) { view = { ...view, turn: q }; if (box) show({ x: box.x * cellPx, y: box.y * cellPx, w: box.w * cellPx, h: box.h * cellPx }); else apply({ glide: true }); },
    // For the drags: a point on the screen as the point it would be on the plane NOT turned, and the plane's box on the screen as if it were not turned. With no turn both are
    // the plain screen ones, so the drags' pointer-to-cell math needs no other change.
    flatten(x, y) {
      if (!active || !quarter()) return { x, y };
      const origin = viewport.getBoundingClientRect();
      const p = untouched({ x: x - origin.left - plane.offsetLeft, y: y - origin.top - plane.offsetTop });
      return { x: origin.left + plane.offsetLeft + view.x + p.x * view.scale, y: origin.top + plane.offsetTop + view.y + p.y * view.scale };
    },
    flatRect() {
      if (!active || !quarter()) return plane.getBoundingClientRect();
      const origin = viewport.getBoundingClientRect(); const { w, h } = size();
      const left = origin.left + plane.offsetLeft + view.x; const top = origin.top + plane.offsetTop + view.y;
      return { left, top, width: w * view.scale, height: h * view.scale, right: left + w * view.scale, bottom: top + h * view.scale, x: left, y: top };
    },
    // A box of the plane in cells, shown (a seat card in the rail glides the camera to that player's area).
    showCells(box, cellPx) { show({ x: box.x * cellPx, y: box.y * cellPx, w: box.w * cellPx, h: box.h * cellPx }); },
  };
}
