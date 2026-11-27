// The turn piece (2026-11-26 feedback, step 4: "move the turn like the control bar"): the turn number, whose turn it is, the clock and the step strip are one piece with a grip.
// It starts in the top bar. Dragged out by its grip it floats over the table like the control bar (src/floating-bar.js: it docks to an edge, a side makes it a column, its place is kept);
// let go over the top bar it goes back there. Where it is (in the bar or floating) is kept in this browser too. Plain DOM.
import { mountFloatingBar } from './floating-bar.js';

// piece: the #turn-piece element (in the top bar at first). grip: its handle. bar: the top bar. before: the element of the bar it sits in front of. floatHost: where it goes while it floats
// (the full-screen game area). store: a safe store. key: where its floating place is kept. room: the pixels kept free at the right (the rail), as the other floating tools take it.
export function mountTurnPiece({ piece, grip, bar, before, floatHost, store, key = 'overloaded.turnPlace', room = null }) {
  const inBarKey = `${key}.inBar`;
  const inBar = () => piece.parentElement === bar;
  const toBar = () => { piece.classList.remove('floating'); if (!inBar()) bar.insertBefore(piece, before?.parentElement === bar ? before : null); };
  const toFloat = () => { piece.classList.add('floating'); if (piece.parentElement !== floatHost) floatHost.append(piece); };
  if (store?.get(inBarKey) === '0') toFloat();

  // what src/floating-bar.js asks a dock (here the top bar is the only dock)
  const REACH = 24; // pixels around the top bar that still count as over it
  const docking = {
    isDocked: inBar,
    lift() { toFloat(); store?.set(inBarKey, '0'); },
    over(x, y) {
      const box = bar.getBoundingClientRect();
      return x >= box.left && x <= box.right && y >= box.top - REACH && y <= box.bottom + REACH ? { dock: 'bar' } : null;
    },
    preview(plan) { bar.classList.toggle('turn-drop', Boolean(plan)); },
    drop(plan) {
      bar.classList.remove('turn-drop');
      if (!plan) return false;
      toBar();
      store?.set(inBarKey, '1');
      return true;
    },
  };
  const floating = mountFloatingBar({ bar: piece, grip, store, key, defaultPlace: { dock: 'top', fx: 0.3, fy: 0 }, room, docking });
  return {
    relayout: () => floating.relayout(),
    // back into the top bar (Home on the grip while it floats puts it at its floating default instead, as the control bar's does)
    home() { toBar(); store?.set(inBarKey, '1'); },
  };
}
