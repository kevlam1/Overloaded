// The floating action bar (Kevin, 2026-11-12; made to work like the control bar of MIDI Companion on 2026-11-14): a bar of buttons that floats over the table, that you drag by its grip, and that stays where
// you leave it. Let go near an edge and it docks to it (top, bottom, left or right), near the middle of an edge and it goes to the middle, near a corner and it goes into the corner; docked to the left or the
// right it turns into a column. While you drag, a strip along the edge, a dotted line through the middle and a dotted triangle in the corner show what letting go would do.
// The rules for where it may go and how it docks are in shared/bar-place.mjs (tested in Node); this puts them on the page. The place is kept in the browser as the edge and two fractions of the room the bar
// can move in, so it is in the same spot on a window of another size. Plain DOM, no dependencies.
import { MARGIN, CORNER_DISTANCE, DEFAULT_PLACE, readPlace, writePlace, placeToPixels, pixelsToPlace, anchored, isVertical, dockPlan, nudge } from '../../shared/bar-place.mjs';

const SVG_NS = 'http://www.w3.org/2000/svg';

// bar: the element that floats (position: absolute in a full-screen parent). grip: the button inside it that moves it. store: a safe store (get, set). key: where the place is kept.
// Returns { reset(), place() }.
export function mountFloatingBar({ bar, grip, store, key = 'overloaded.actionBar' }) {
  let place = readPlace(store?.get(key) ?? null) ?? { ...DEFAULT_PLACE };
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

  const size = () => ({ width: window.innerWidth, height: window.innerHeight, barWidth: bar.offsetWidth, barHeight: bar.offsetHeight });
  const put = (pixels) => { bar.style.left = `${pixels.left}px`; bar.style.top = `${pixels.top}px`; bar.style.translate = 'none'; };
  const current = () => ({ left: bar.offsetLeft, top: bar.offsetTop });
  const save = () => store?.set(key, writePlace(place));
  const orient = () => { bar.dataset.vertical = String(isVertical(place)); }; // (a column on the left and the right: its size changes, so it is set before the size is read)
  const show = () => { orient(); put(placeToPixels(anchored(place), size())); };

  function hideHints() { snapHint.hidden = true; centerHint.hidden = true; cornerHint.hidden = true; }
  // What letting go now would do, shown: a strip along the edge, a dotted line when the bar is lined up with the middle of the edge, a dotted triangle in the corner it would go into.
  function showHints(plan) {
    hideHints();
    if (!plan) return;
    const { width, height } = size();
    const edge = plan.edge;
    const strip = { top: [0, 0, width, MARGIN], bottom: [0, height - MARGIN, width, MARGIN], left: [0, 0, MARGIN, height], right: [width - MARGIN, 0, MARGIN, height] }[edge];
    snapHint.style.left = `${strip[0]}px`; snapHint.style.top = `${strip[1]}px`; snapHint.style.width = `${strip[2]}px`; snapHint.style.height = `${strip[3]}px`;
    snapHint.hidden = false;
    const across = edge === 'top' || edge === 'bottom';
    if (plan.corner === null && (across ? plan.fx === 0.5 : plan.fy === 0.5)) {
      centerHint.dataset.line = across ? 'vertical' : 'horizontal';
      centerHint.style.left = `${across ? width / 2 - 1 : 0}px`; centerHint.style.top = `${across ? 0 : height / 2 - 1}px`;
      centerHint.style.width = across ? '0px' : `${width}px`; centerHint.style.height = across ? `${height}px` : '0px';
      centerHint.hidden = false;
    }
    if (plan.corner) {
      const box = CORNER_DISTANCE + MARGIN;
      cornerHint.style.left = `${plan.corner.x === 0 ? 0 : width - box}px`; cornerHint.style.top = `${plan.corner.y === 0 ? 0 : height - box}px`;
      const far = box - 1;
      const cx = plan.corner.x === 0 ? 1 : far; const cy = plan.corner.y === 0 ? 1 : far; // the right angle is in the corner of the window
      const ox = plan.corner.x === 0 ? far : 1; const oy = plan.corner.y === 0 ? far : 1; // the far ends of the two short sides
      cornerShape.setAttribute('points', `${cx},${cy} ${ox},${cy} ${cx},${oy}`);
      cornerHint.hidden = false;
    }
  }

  // While the grip is held the whole page listens to the pointer (not only the grip, which the pointer leaves as soon as it moves), as the drag of a card does.
  grip.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || drag) return;
    event.preventDefault();
    const box = bar.getBoundingClientRect();
    drag = { dx: event.clientX - box.left, dy: event.clientY - box.top, pixels: current() };
    bar.classList.add('dragging');
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', release);
    document.addEventListener('pointercancel', release);
  });
  function move(event) {
    if (!drag) return;
    const r = size();
    // free while it is held (it keeps the shape it had: a row stays a row until it is let go), only kept inside the window
    const left = Math.min(Math.max(event.clientX - drag.dx, 0), Math.max(0, r.width - r.barWidth));
    const top = Math.min(Math.max(event.clientY - drag.dy, 0), Math.max(0, r.height - r.barHeight));
    drag.pixels = { left, top };
    put(drag.pixels);
    showHints(dockPlan(pixelsToPlace(drag.pixels, r), r, isVertical(place)));
  }
  function release() {
    if (!drag) return;
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', release);
    document.removeEventListener('pointercancel', release);
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

  function reset() { place = { ...DEFAULT_PLACE }; show(); save(); }

  window.addEventListener('resize', () => { if (!drag) show(); });
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (!drag) put(placeToPixels(anchored(place), size())); }).observe(bar); // its width changes when a button appears or its text does
  show();
  return { reset, place: () => ({ ...place }) };
}
