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
export function mountPlaneCamera({ viewport, plane, controls, key, mine = () => null }) {
  const store = makeSafeStore();
  let view = { scale: 1, x: 0, y: 0 };
  let active = false;
  let pan = null;
  let space = false;

  function apply({ glide = false } = {}) {
    plane.style.transformOrigin = '0 0';
    plane.style.transition = glide && !reduced() ? 'transform 0.35s ease' : 'none';
    plane.style.transform = `translate(${Math.round(view.x)}px, ${Math.round(view.y)}px) scale(${view.scale})`;
    plane.style.setProperty('--zoom', String(view.scale)); // (the nameplates grow as the plane gets smaller, so they stay readable)
    zoomLabel.textContent = `${Math.round(view.scale * 100)}%`;
    store.set(key(), JSON.stringify(view));
  }
  const size = () => ({ w: plane.offsetWidth, h: plane.offsetHeight });
  // The camera showing a box of the plane (in the plane's own pixels) as large as fits, in the middle of the window.
  function show(box, { glide = true } = {}) {
    const vw = viewport.clientWidth; const vh = viewport.clientHeight;
    if (!vw || !vh || !box.w || !box.h) return;
    const scale = clamp(Math.min(vw / box.w, vh / box.h) * 0.96, MIN, MAX);
    view = { scale, x: vw / 2 - (box.x + box.w / 2) * scale, y: vh / 2 - (box.y + box.h / 2) * scale };
    apply({ glide });
  }
  const fit = (options) => { const { w, h } = size(); show({ x: 0, y: 0, w, h }, options); };
  const showMine = (options) => { const box = mine(); if (box) show(box, options); else fit(options); };
  function zoomAt(factor, cx, cy) {
    const next = clamp(view.scale * factor, MIN, MAX);
    if (next === view.scale) return;
    view = { scale: next, x: cx - ((cx - view.x) * next) / view.scale, y: cy - ((cy - view.y) * next) / view.scale };
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

  return {
    // on: the Shared view is showing. The first time, the camera kept for this table comes back, or it shows your area.
    setActive(on) {
      if (on === active) return;
      active = on;
      controls.hidden = !on;
      if (!on) { plane.style.transform = ''; plane.style.transition = ''; return; }
      let kept = null;
      try { kept = JSON.parse(store.get(key()) ?? 'null'); } catch { kept = null; }
      if (kept && [kept.scale, kept.x, kept.y].every(Number.isFinite)) { view = { scale: clamp(kept.scale, MIN, MAX), x: kept.x, y: kept.y }; apply(); } else requestAnimationFrame(() => showMine({ glide: false }));
    },
    show, fit, showMine,
    // A box of the plane in cells, shown (a seat card in the rail glides the camera to that player's area).
    showCells(box, cellPx) { show({ x: box.x * cellPx, y: box.y * cellPx, w: box.w * cellPx, h: box.h * cellPx }); },
  };
}
