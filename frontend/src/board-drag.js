// Drag and drop on the battlefield grid (Kevin, 2026-11-06, docs/layout.md "Phase B"). You can lift one of your cards from the battlefield or from your hand and drop it on a cell of
// your own battlefield; the cell under the pointer is outlined while you drag, and the page decides what the drop does (onDrop). Mouse and pen only: a phone has no hover and its
// touch version is on hold. A drag starts only after the pointer has moved a few pixels, so an ordinary click still selects a card, and a press on a counter or a badge is theirs.
// Escape, a menu, the window losing focus or letting go outside the board cancels it. This module changes nothing in the game: it reports { uid, from, col, row }.
import { cellAtPoint } from '../../shared/board-grid.mjs';

export const DRAG_DISTANCE_PX = 6;

// board: () => the battlefield element of the player. onDrop({ uid, from: 'battlefield' | 'hand', col, row }). isEnabled: () => whether dragging is allowed right now.
export function mountBoardDrag({ doc = document, board, onDrop, isEnabled = () => true }) {
  let press = null; // the card the pointer went down on, before it has moved far enough to be a drag
  let drag = null; // { button, uid, from, ghost, highlight, cell }

  const sourceOf = (target) => {
    const button = target?.closest?.('.card');
    if (!button || button.disabled) return null;
    const boardElement = board();
    if (boardElement && button.parentElement === boardElement) return { button, uid: button.dataset.uid, from: 'battlefield' };
    if (button.parentElement?.id === 'hand') return { button, uid: button.dataset.uid, from: 'hand' };
    return null; // another player's cards, the command zone and the piles are not dragged
  };

  const clean = () => {
    if (drag) {
      drag.ghost.remove();
      drag.highlight.remove();
      drag.button.classList.remove('dragging');
      doc.body.classList.remove('dragging-card');
    }
    drag = null;
    press = null;
  };

  const startDrag = (event) => {
    const boardElement = board();
    if (!boardElement || !press.uid) { press = null; return; }
    const rect = press.button.getBoundingClientRect();
    const ghost = doc.createElement('div');
    ghost.className = 'drag-ghost';
    const picture = press.button.querySelector('img');
    if (picture && !press.button.classList.contains('noimage')) { const copy = picture.cloneNode(); copy.removeAttribute('loading'); ghost.append(copy); } else ghost.textContent = press.button.getAttribute('aria-label') ?? '';
    const width = Math.min(rect.width, 84);
    ghost.style.width = `${width}px`;
    ghost.style.height = `${Math.round(width * 1.4015)}px`;
    doc.body.append(ghost);
    const highlight = doc.createElement('div');
    highlight.className = 'cell-highlight';
    highlight.hidden = true;
    boardElement.append(highlight);
    press.button.classList.add('dragging');
    doc.body.classList.add('dragging-card');
    drag = { button: press.button, uid: press.uid, from: press.from, ghost, highlight, cell: null, width };
    press = null;
  };

  const update = (event) => {
    const x = event.clientX; const y = event.clientY;
    drag.ghost.style.transform = `translate(${Math.round(x - drag.width / 2)}px, ${Math.round(y - (drag.width * 1.4015) / 2)}px)`;
    const boardElement = board();
    const cell = boardElement ? cellAtPoint(boardElement.getBoundingClientRect(), x, y) : null;
    drag.cell = cell;
    if (!cell) { drag.highlight.hidden = true; return; }
    const holder = [...boardElement.children].find((child) => child.classList?.contains('card') && child.dataset.col === String(cell.col) && child.dataset.row === String(cell.row)) ?? null;
    drag.highlight.dataset.col = String(cell.col);
    drag.highlight.dataset.row = String(cell.row);
    // an empty cell, or the card's own, is fine; a card on the battlefield dropped on another card swaps places with it; a card from the hand cannot take a cell that is taken
    drag.highlight.className = `cell-highlight${holder && holder !== drag.button ? (drag.from === 'hand' ? ' taken' : ' swap') : ''}`;
    drag.highlight.hidden = false;
  };

  const swallowClick = () => {
    const stop = (event) => { event.stopPropagation(); event.preventDefault(); };
    doc.addEventListener('click', stop, true);
    setTimeout(() => doc.removeEventListener('click', stop, true), 0);
  };

  const onDown = (event) => {
    if (!isEnabled() || event.button !== 0 || event.pointerType === 'touch') return;
    if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return; // a modified click is something else (a marks step, a menu key)
    if (event.target.closest?.('[data-mark], [data-badge]')) return;
    const source = sourceOf(event.target);
    press = source ? { ...source, x: event.clientX, y: event.clientY } : null;
  };
  const onMove = (event) => {
    if (press && !drag && Math.hypot(event.clientX - press.x, event.clientY - press.y) > DRAG_DISTANCE_PX) startDrag(event);
    if (drag) update(event);
  };
  const onUp = (event) => {
    if (!drag) { press = null; return; }
    update(event);
    const { uid, from, cell } = drag;
    clean();
    swallowClick();
    if (cell) onDrop({ uid, from, col: cell.col, row: cell.row });
  };
  const cancel = () => { if (drag) swallowClick(); clean(); };
  const onKey = (event) => { if (event.key === 'Escape' && drag) cancel(); };
  const noNativeDrag = (event) => { if (event.target.closest?.('.card')) event.preventDefault(); }; // the browser's own picture dragging would start instead of ours

  doc.addEventListener('pointerdown', onDown, true);
  doc.addEventListener('pointermove', onMove, true);
  doc.addEventListener('pointerup', onUp, true);
  doc.addEventListener('pointercancel', cancel, true);
  doc.addEventListener('contextmenu', cancel, true);
  doc.addEventListener('keydown', onKey, true);
  doc.addEventListener('dragstart', noNativeDrag, true);
  doc.defaultView.addEventListener('blur', cancel);

  return {
    isDragging: () => drag !== null,
    stop() {
      clean();
      doc.removeEventListener('pointerdown', onDown, true);
      doc.removeEventListener('pointermove', onMove, true);
      doc.removeEventListener('pointerup', onUp, true);
      doc.removeEventListener('pointercancel', cancel, true);
      doc.removeEventListener('contextmenu', cancel, true);
      doc.removeEventListener('keydown', onKey, true);
      doc.removeEventListener('dragstart', noNativeDrag, true);
      doc.defaultView.removeEventListener('blur', cancel);
    },
  };
}
