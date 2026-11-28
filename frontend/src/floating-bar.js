// The floating action bar (Kevin, 2026-11-12; made to work like the control bar of MIDI Companion on 2026-11-14): a bar of buttons that floats over the table, that you drag by its grip, and that stays where
// you leave it. Let go near an edge and it docks to it (top, bottom, left or right), near the middle of an edge and it goes to the middle, near a corner and it goes into the corner; docked to the left or the
// right it turns into a column. While you drag, a strip along the edge, a dotted line through the middle and a dotted triangle in the corner show what letting go would do.
// The rules for where it may go and how it docks are in shared/bar-place.mjs (tested in Node); this puts them on the page. The place is kept in the browser as the edge and two fractions of the room the bar
// can move in, so it is in the same spot on a window of another size. Plain DOM, no dependencies.
import { MARGIN, CORNER_DISTANCE, DEFAULT_PLACE, readPlace, writePlace, placeToPixels, pixelsToPlace, anchored, isVertical, dockPlan, nudge } from '../../shared/bar-place.mjs';

const SVG_NS = 'http://www.w3.org/2000/svg';

// bar: the element that floats (position: absolute in a full-screen parent). grip: the button inside it that moves it. store: a safe store (get, set). key: where the place is kept.
// Returns { reset(), place() }.
// growDown: the bar gets taller or shorter (the history bar opens downward): its top edge stays where it is instead of following its fraction of the free space.
// flush: docked to an edge it touches the edge (no gap), and the style sheet drops the border and the rounding on that side (data-dock says which edge), like the stack window.
// clickThrough: the grip is also a button (the whole top of the history bar): a press that moves less than 5 px is a click and is left alone, and a drag does not end in a click.
// room: a function giving the pixels kept free at the right of the window ({ right }), so the bar stays out of them (the player column of the table's Sidebar view). Call relayout() after it changes.
// Returns { reset(), place(), relayout() }.
export function mountFloatingBar({ bar, grip, store, key = 'overloaded.actionBar', defaultPlace = DEFAULT_PLACE, growDown = false, flush = false, clickThrough = false, room = null, docking = null }) { // docking: src/tool-dock.js dockingFor(name), or null
  let place = readPlace(store?.get(key) ?? null) ?? { ...defaultPlace };
  let drag = null; // { dx, dy, pixels } while the grip is held

  // the three hints shown while the bar is dragged (fixed to the window, they take no mouse)
  const host = bar.parentElement ?? document.body;
  const snapHint = document.createElement('div'); snapHint.className = 'bar-snap-hint'; snapHint.hidden = true;
  const centerHint = document.createElement('div'); centerHint.className = 'bar-center-hint'; centerHint.hidden = true;
  const cornerHint = document.createElement('div'); cornerHint.className = 'bar-corner-hint'; cornerHint.hidden = true;
  const cornerSvg = document.createElementNS(SVG_NS, 'svg');
  cornerSvg.setAttribute('width', String(CORNER_DISTANCE + MARGIN)); cornerSvg.setAttribute('height', String(CORNER_DISTANCE + MARGIN)); cornerSvg.setAttribute('fill', 'none');
  const cornerShape = document.createElementNS(SVG_NS, 'polygon');
  cornerSvg.append(cornerShape); cornerHint.append(cornerSvg);
  host.append(snapHint, centerHint, cornerHint);

  const size = () => ({ width: Math.max(0, window.innerWidth - Math.max(0, room?.()?.right ?? 0)), height: window.innerHeight, barWidth: bar.offsetWidth, barHeight: bar.offsetHeight }); // (the room it moves in: the window, less what room() keeps free)
  let lastPut = null; // where the bar was last put (not where it is now: it may still be gliding there)
  const put = (pixels) => { lastPut = pixels; bar.style.left = `${pixels.left}px`; bar.style.top = `${pixels.top}px`; bar.style.translate = 'none'; };
  const pixelsFor = (p) => {
    const r = size();
    const base = placeToPixels(anchored(p), r);
    if (!flush) return base;
    return { left: p.dock === 'left' ? 0 : p.dock === 'right' ? Math.max(0, r.width - r.barWidth) : base.left, top: p.dock === 'top' ? 0 : p.dock === 'bottom' ? Math.max(0, r.height - r.barHeight) : base.top };
  };
  const current = () => ({ left: bar.offsetLeft, top: bar.offsetTop });
  const save = () => store?.set(key, writePlace(place));
  const orient = () => { bar.dataset.vertical = String(isVertical(place) && !docking?.isDocked()); }; // (a column on the left and the right: its size changes, so it is set before the size is read; never in a dock, Kevin 2026-11-27: the console in the rail showed as a column of icons after it had once been docked to a side)
  const show = () => { orient(); bar.dataset.dock = flush && place.dock && !docking?.isDocked() ? place.dock : ''; put(pixelsFor(place)); };

  function hideHints() { snapHint.hidden = true; centerHint.hidden = true; cornerHint.hidden = true; }
  // What letting go now would do, shown: a strip along the edge, a dotted line when the bar is lined up with the middle of the edge, a dotted triangle in the corner it would go into.
  // The hints are changed IN PLACE: one is shown or hidden only when what it shows really changes, never hidden and shown again on every pointer move (each new showing restarts its fade-in,
  // which was the flicker while the bar was dragged near an edge, and kept the dotted line almost invisible, Kevin 2026-11-16). Like MIDI Companion's (its barBounds() is the whole play area, not the bar), the strip runs along the whole edge and the dotted line across the whole window.
  function showHints(plan) {
    if (!plan) { hideHints(); return; }
    const { width, height } = size();
    const edge = plan.edge;
    const across = edge === 'top' || edge === 'bottom';
    // a strip along the whole edge the bar would dock to (a corner shows only its own triangle)
    const strip = { top: [MARGIN, 0, width - 2 * MARGIN, MARGIN], bottom: [MARGIN, height - MARGIN, width - 2 * MARGIN, MARGIN], left: [0, MARGIN, MARGIN, height - 2 * MARGIN], right: [width - MARGIN, MARGIN, MARGIN, height - 2 * MARGIN] }[edge];
    snapHint.hidden = plan.corner !== null;
    if (plan.corner === null) { snapHint.style.left = `${strip[0]}px`; snapHint.style.top = `${strip[1]}px`; snapHint.style.width = `${strip[2]}px`; snapHint.style.height = `${strip[3]}px`; }
    // a dotted line through the middle of the window while the bar is lined up with the middle of the edge
    const centered = plan.corner === null && (across ? plan.fx === 0.5 : plan.fy === 0.5);
    centerHint.hidden = !centered;
    if (centered) {
      centerHint.dataset.line = across ? 'vertical' : 'horizontal';
      centerHint.style.left = `${across ? width / 2 - 1 : MARGIN}px`; centerHint.style.top = `${across ? MARGIN : height / 2 - 1}px`;
      centerHint.style.width = across ? '0px' : `${width - 2 * MARGIN}px`; centerHint.style.height = across ? `${height - 2 * MARGIN}px` : '0px';
    }
    // a dotted triangle in the corner it would go into
    cornerHint.hidden = plan.corner === null;
    if (plan.corner) {
      const box = CORNER_DISTANCE + MARGIN;
      cornerHint.style.left = `${plan.corner.x === 0 ? 0 : width - box}px`; cornerHint.style.top = `${plan.corner.y === 0 ? 0 : height - box}px`;
      const far = box - 1;
      const cx = plan.corner.x === 0 ? 1 : far; const cy = plan.corner.y === 0 ? 1 : far; // the right angle is in the corner of the window
      const ox = plan.corner.x === 0 ? far : 1; const oy = plan.corner.y === 0 ? far : 1; // the far ends of the two short sides
      cornerShape.setAttribute('points', `${cx},${cy} ${ox},${cy} ${cx},${oy}`);
    }
  }

  // While the grip is held the whole page listens to the pointer (not only the grip, which the pointer leaves as soon as it moves), as the drag of a card does.
  let pending = null; // clickThrough: a press that may still turn out to be a click
  function begin(x, y) {
    const box = bar.getBoundingClientRect();
    const lifted = Boolean(docking?.isDocked());
    if (lifted) { docking.lift(); orient(); put({ left: box.left, top: box.top }); } // (out of its dock, floating where it was; the tools left in the dock close up)
    drag = { dx: x - box.left, dy: y - box.top, pixels: lifted ? { left: box.left, top: box.top } : current(), dockPlan: null };
    bar.classList.add('dragging');
    bar.dataset.dock = ''; // (free while it is held: the square edge goes)
  }
  grip.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || drag || pending) return;
    if (clickThrough) pending = { x: event.clientX, y: event.clientY }; else { event.preventDefault(); begin(event.clientX, event.clientY); }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', release);
    document.addEventListener('pointercancel', release);
  });
  function move(event) {
    if (pending) {
      if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) < 5) return;
      begin(pending.x, pending.y); // (from where the press was, so the bar does not jump)
      pending = null;
    }
    if (!drag) return;
    const r = size();
    // free while it is held (it keeps the shape it had: a row stays a row until it is let go), only kept inside the window
    const left = Math.min(Math.max(event.clientX - drag.dx, 0), Math.max(0, r.width - r.barWidth));
    const top = Math.min(Math.max(event.clientY - drag.dy, 0), Math.max(0, r.height - r.barHeight));
    drag.pixels = { left, top };
    put(drag.pixels);
    drag.dockPlan = docking?.over(event.clientX, event.clientY) ?? null; // over a dock: a line shows where it would go, instead of the edge hints
    docking?.preview(drag.dockPlan);
    if (drag.dockPlan) hideHints(); else showHints(dockPlan(pixelsToPlace(drag.pixels, r), r, isVertical(place)));
  }
  function release() {
    if (pending) { // it was a click: nothing moved
      pending = null;
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', release);
      document.removeEventListener('pointercancel', release);
      return;
    }
    if (!drag) return;
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', release);
    document.removeEventListener('pointercancel', release);
    if (clickThrough) { // a drag does not end in a click on the button it started on
      const swallow = (click) => { click.stopImmediatePropagation(); click.preventDefault(); document.removeEventListener('click', swallow, true); };
      document.addEventListener('click', swallow, true);
      setTimeout(() => document.removeEventListener('click', swallow, true), 100);
    }
    if (docking && docking.drop(drag.dockPlan)) { // let go over a dock: it is in the dock now, and its floating place is kept for the next time it floats
      drag = null;
      bar.classList.remove('dragging');
      hideHints();
      if (isVertical(place)) place = { ...defaultPlace }; // (a tool in a dock is never a column of icons)
      orient();
      bar.dataset.dock = '';
      return;
    }
    const r = size();
    const free = pixelsToPlace(drag.pixels, r);
    const plan = dockPlan(free, r, isVertical(place));
    drag = null;
    bar.classList.remove('dragging');
    hideHints();
    place = plan ? { dock: plan.edge, fx: plan.fx, fy: plan.fy } : { dock: null, ...free };
    show(); // where it docks to, gliding there (style.css); a bar docked to a side is a column now
    save();
  }

  // the keyboard moves it too: the arrow keys by 10 pixels (Shift: 50), Home puts it back in the middle of the top
  grip.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const step = event.shiftKey ? 50 : 10;
    const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
    if (move) {
      event.preventDefault();
      const r = size();
      place = { dock: null, ...pixelsToPlace(nudge(current(), r, move[0], move[1]), r) };
      show();
      save();
    } else if (event.key === 'Home') {
      event.preventDefault();
      reset();
    }
  });

  function reset() { place = { ...defaultPlace }; show(); save(); }

  window.addEventListener('resize', () => { if (!drag) show(); });
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => {
    if (drag || pending) return;
    if (growDown && lastPut && place.dock !== 'bottom') {
      // the top edge stays exactly where it was put (not where it is now: it may be gliding, and reading that moved the bar a little at every new row), and its place is worked out again for the new height
      const keep = lastPut.top;
      if (place.dock !== 'top') place = { ...place, fy: pixelsToPlace({ left: lastPut.left, top: keep }, size()).fy };
      const next = pixelsFor(place);
      if (place.dock !== 'top') next.top = Math.max(0, Math.min(keep, window.innerHeight - bar.offsetHeight)); // (but never past the bottom of the window: it moves up just enough, Kevin 2026-11-23)
      put(next);
    } else put(pixelsFor(place));
  }).observe(bar); // its width changes when a button appears or its text does
  show();
  return { reset, place: () => ({ ...place }), relayout: () => { if (!drag) show(); } };
}
