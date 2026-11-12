// The floating action bar (Kevin, 2026-11-12; modelled on the control bar of MIDI Companion): a bar of buttons that floats over the table, that you drag by its grip, and that stays where you leave it.
// The rules for where it may go and how it snaps are in shared/bar-place.mjs (tested in Node); this puts them on the page. The place is kept in the browser as two fractions of the room
// the bar can move in, so it is in the same spot on a window of another size. Plain DOM, no dependencies.
import { DEFAULT_PLACE, readPlace, writePlace, placeToPixels, pixelsToPlace, snap, nudge } from '../../shared/bar-place.mjs';

// bar: the element that floats (position: absolute in a full-screen parent). grip: the button inside it that moves it. store: a safe store (get, set). key: where the place is kept.
// Returns { reset(), place() }.
export function mountFloatingBar({ bar, grip, store, key = 'overloaded.actionBar' }) {
  let place = readPlace(store?.get(key) ?? null) ?? { ...DEFAULT_PLACE };
  let drag = null; // { dx, dy, pixels } while the grip is held

  const size = () => ({ width: window.innerWidth, height: window.innerHeight, barWidth: bar.offsetWidth, barHeight: bar.offsetHeight });
  const put = (pixels) => { bar.style.left = `${pixels.left}px`; bar.style.top = `${pixels.top}px`; bar.style.translate = 'none'; };
  const current = () => ({ left: bar.offsetLeft, top: bar.offsetTop });
  const save = () => store?.set(key, writePlace(place));
  const show = () => put(placeToPixels(place, size()));

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
    // free while it is held, only kept inside the window
    const left = Math.min(Math.max(event.clientX - drag.dx, 0), Math.max(0, r.width - r.barWidth));
    const top = Math.min(Math.max(event.clientY - drag.dy, 0), Math.max(0, r.height - r.barHeight));
    drag.pixels = { left, top };
    put(drag.pixels);
  }
  function release() {
    if (!drag) return;
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', release);
    document.removeEventListener('pointercancel', release);
    const landed = snap(drag.pixels, size());
    drag = null;
    bar.classList.remove('dragging');
    place = pixelsToPlace(landed, size());
    show(); // where it snaps to, gliding there (style.css)
    save();
  }

  // the keyboard moves it too: the arrow keys by 10 pixels (Shift: 50), Home puts it back in the middle of the top
  grip.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const step = event.shiftKey ? 50 : 10;
    const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
    if (move) {
      event.preventDefault();
      place = pixelsToPlace(nudge(current(), size(), move[0], move[1]), size());
      show();
      save();
    } else if (event.key === 'Home') {
      event.preventDefault();
      reset();
    }
  });

  function reset() { place = { ...DEFAULT_PLACE }; show(); save(); }

  window.addEventListener('resize', () => { if (!drag) show(); });
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (!drag) show(); }).observe(bar); // its width changes when a button appears or its text does
  show();
  return { reset, place: () => ({ ...place }) };
}
