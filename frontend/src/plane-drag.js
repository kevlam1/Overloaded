// Dragging ANOTHER player's card on the Shared view's plane (Kevin, 2026-11-25: anyone moves anything). Your own cards keep the usual drag (src/board-drag.js), which
// only takes cards that are direct children of your battlefield; another player's cards are in their own layer (.plane-layer[data-owner]) and are moved here.
// A press and a move of more than 6 px picks the card up; a copy of it follows the pointer at its size on screen (so the zoom is respected), the place it would land is
// outlined, and letting go on the plane calls onMove({ owner, uid, cell }) with the cell of the card's top left. Escape, or letting go off the plane, puts it back.
// Only the card's place changes: tapping, counters and moving it to a pile stay with its owner.
import { cellAtPoint, shiftedAnchor } from '../../shared/board-grid.mjs';

const DRAG_PX = 6;

export function mountPlaneDrag({ plane, isActive, onMove, onCarry = () => {}, flatten = (x, y) => ({ x, y }), flatRect = null }) { // flatten, flatRect: the camera's, for a turned table // onCarry({ owner, uid, cell } | null): where the card is being carried, for the other players
  let press = null;
  let drag = null;

  const cardOf = (target) => {
    const button = target?.closest?.('.plane-layer > .card');
    return button && plane().contains(button) ? button : null;
  };
  const cellFor = (event) => {
    // the card moves by as many cells as the pointer has moved, counted on the table as it is not turned (src/plane-camera.js flatten), so a turned table moves it the right way
    const rect = flatRect?.() ?? plane().getBoundingClientRect();
    const now = flatten(event.clientX, event.clientY);
    if (!cellAtPoint(rect, now.x, now.y)) return null;
    return shiftedAnchor(rect, drag.startCell, now.x - drag.startFlat.x, now.y - drag.startFlat.y);
  };
  function start(event) {
    const box = press.button.getBoundingClientRect();
    const ghost = press.button.cloneNode(true);
    ghost.classList.add('plane-ghost');
    ghost.removeAttribute('id');
    Object.assign(ghost.style, { position: 'fixed', left: '0px', top: '0px', width: `${box.width}px`, height: `${box.height}px`, margin: '0', zIndex: '95', pointerEvents: 'none', gridColumnStart: '', gridRowStart: '' });
    document.body.append(ghost);
    const outline = document.createElement('div');
    outline.className = 'plane-target';
    plane().append(outline);
    const startCell = { col: Math.max(0, Number(press.button.style.gridColumnStart) - 1 || 0), row: Math.max(0, Number(press.button.style.gridRowStart) - 1 || 0) };
    drag = { button: press.button, ghost, outline, dx: press.x - box.left, dy: press.y - box.top, startCell, startFlat: flatten(press.x, press.y) };
    press.button.classList.add('plane-lifted');
    document.body.classList.add('dragging-card');
    move(event);
  }
  function move(event) {
    drag.ghost.style.transform = `translate(${event.clientX - drag.dx}px, ${event.clientY - drag.dy}px)`;
    const cell = cellFor(event);
    drag.cell = cell;
    drag.outline.hidden = !cell;
    if (cell) { drag.outline.style.gridColumnStart = String(cell.col + 1); drag.outline.style.gridRowStart = String(cell.row + 1); }
    onCarry({ owner: drag.button.closest('.plane-layer').dataset.owner, uid: drag.button.dataset.uid, cell });
  }
  function end(commit) {
    if (!drag) { press = null; return; }
    const { button, ghost, outline, cell } = drag;
    ghost.remove(); outline.remove();
    button.classList.remove('plane-lifted');
    document.body.classList.remove('dragging-card');
    drag = null; press = null;
    onCarry(null);
    if (commit && cell) onMove({ owner: button.closest('.plane-layer').dataset.owner, uid: button.dataset.uid, cell });
  }

  document.addEventListener('pointerdown', (event) => {
    if (!isActive() || event.button !== 0 || event.pointerType === 'touch' || event.altKey) return;
    const button = cardOf(event.target);
    if (!button) return;
    event.preventDefault();
    press = { button, x: event.clientX, y: event.clientY };
  }, true);
  document.addEventListener('pointermove', (event) => {
    if (!press) return;
    if (!drag && Math.hypot(event.clientX - press.x, event.clientY - press.y) > DRAG_PX) start(event);
    else if (drag) move(event);
  }, true);
  document.addEventListener('pointerup', () => end(true), true);
  document.addEventListener('pointercancel', () => end(false), true);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && drag) end(false); }, true);
  return { isDragging: () => drag !== null };
}
