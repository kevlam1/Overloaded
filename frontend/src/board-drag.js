// Drag and drop on the battlefield grid (Kevin, 2026-11-06, docs/layout.md "Phase B"). You can lift one of your cards from the battlefield or from your hand and drop it on a cell of
// your own battlefield; the cell under the pointer is outlined while you drag, and the page decides what the drop does (onDrop). Mouse and pen only: a phone has no hover and its
// touch version is on hold. A drag starts only after the pointer has moved a few pixels, so an ordinary click still selects a card, and a press on a counter or a badge is theirs.
// Escape, a menu, the window losing focus or letting go outside the board cancels it. This module changes nothing in the game: it reports { uid, from, col, row }.
import { anchorAtPoint, cellAtPoint, shiftedAnchor, BOARD_COLS, CARD_COLS, CARD_ROWS } from '../../shared/board-grid.mjs';

export const DRAG_DISTANCE_PX = 6;

// board: () => the battlefield element of the player. onDrop({ uid, from: 'battlefield' | 'hand', col, row }). isEnabled: () => whether dragging is allowed right now.
// hand (optional): () => the element of your hand; a card from the battlefield let go over it is reported to onDropHand({ uid, from }) (back into the hand), and the hand is marked while one is over it.
// A card of the hand dragged within the hand rearranges it: while it is over the hand onHandOver({ uid, x }) is called with the pointer's x (and with null when it leaves or the drag ends), and on
// letting go onReorderHand({ uid, x }) says where it was let go.
export function mountBoardDrag({ doc = document, board, onDrop, hand = () => null, onDropHand = () => {}, onHandOver = () => {}, onReorderHand = () => {}, handZone = () => null, handHit = null, isEnabled = () => true }) {
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
      if (drag.from === 'hand') onHandOver(null);
      drag.ghost.remove();
      hand()?.classList.remove('drop-hand');
      drag.highlight.remove();
      for (const c of drag.carried) c.classList.remove('dragging');
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
    // the picture is the card at its own size on screen (a tapped card is turned back to portrait and then turned on its side again)
    const tapped = press.button.classList.contains('tapped');
    // the card at its own size: a card of the hand is turned and may be lifted under the pointer, which makes its box on screen bigger, so its own layout size is used
    const own = press.from === 'hand' && press.button.offsetWidth > 0;
    const height = own ? press.button.offsetHeight : rect.height;
    const width = tapped ? height / 1.4015 : own ? press.button.offsetWidth : rect.width;
    if (tapped) ghost.classList.add('tapped');
    ghost.style.width = `${width}px`;
    ghost.style.height = `${height}px`;
    doc.body.append(ghost);
    const highlight = doc.createElement('div');
    highlight.className = 'cell-highlight';
    highlight.hidden = true;
    boardElement.append(highlight);
    // the cards being carried are not shown where they were: the one pressed, and for a whole pile every card of it (the same cell, tapped or not like it)
    const carried = [press.button];
    if (press.whole) carried.push(...[...boardElement.querySelectorAll(':scope > .card')].filter((c) => c !== press.button && c.dataset.col === press.button.dataset.col && c.dataset.row === press.button.dataset.row && c.classList.contains('tapped') === press.button.classList.contains('tapped') && c.dataset.stackSize !== undefined));
    for (const c of carried) c.classList.add('dragging');
    doc.body.classList.add('dragging-card');
    const grab = { x: Math.min(1, Math.max(0, (press.x - rect.left) / (rect.width || 1))), y: Math.min(1, Math.max(0, (press.y - rect.top) / (rect.height || 1))) }; // where on the card it was taken, as fractions
    if (press.whole) ghost.dataset.count = press.button.dataset.stackSize; // the picture says how many cards it carries
    drag = { carried, button: press.button, uid: press.uid, from: press.from, whole: press.whole, tapped, ghost, highlight, cell: null, overHand: false, width, height, grab, startX: press.x, startY: press.y, start: press.start };
    press = null;
  };

  const update = (event) => {
    const x = event.clientX; const y = event.clientY;
    drag.ghost.style.transform = `translate(${Math.round(x - drag.width * drag.grab.x)}px, ${Math.round(y - drag.height * drag.grab.y)}px)`; // the card is held where it was taken
    const boardElement = board();
    const rect = boardElement ? boardElement.getBoundingClientRect() : null;
    // a card from the battlefield moves by as many cells as the pointer has moved; a card from the hand is put with the pointer in the middle of it. Outside the board there is no place.
    const cell = !rect || !cellAtPoint(rect, x, y) ? null : drag.start ? shiftedAnchor(rect, drag.start, x - drag.startX, y - drag.startY) : anchorAtPoint(rect, x, y);
    // a card from the battlefield can go back into the hand: over the hand there is no place on the board, and the hand is marked
    const handElement = hand();
    const handRect = handZone() ?? (handElement ? handElement.getBoundingClientRect() : null); // handZone: where the cards of the hand are (the hand floats over the battlefield, so its whole box is not the hand)
    const inZone = Boolean(handRect) && x >= handRect.left && x < handRect.right && y >= handRect.top && y < handRect.bottom;
    // a card of the hand being rearranged uses the whole zone (the gap it opens would flicker if only the cards counted); a card carried from the battlefield only returns to the hand when the pointer is over a card of it, so
    // the rest of the bottom of the board stays the battlefield
    const over = drag.from === 'battlefield' && handHit ? handHit(x, y) : inZone;
    drag.overHand = (drag.from === 'hand' || (drag.from === 'battlefield' && !drag.whole)) && over;
    handElement?.classList.toggle('drop-hand', drag.overHand && drag.from === 'battlefield');
    if (drag.from === 'hand') onHandOver(drag.overHand ? { uid: drag.uid, x } : null); // the hand opens a gap where the card would go back
    // a tapped card is a landscape card, 11 cells wide, so it may not start in the last 3 columns of the board
    if (cell && drag.tapped) cell.col = Math.min(cell.col, BOARD_COLS - CARD_ROWS);
    drag.cell = drag.overHand ? null : cell;
    if (!drag.cell) { drag.highlight.hidden = true; return; }
    drag.highlight.dataset.col = String(cell.col);
    // the outline of a tapped card is its landscape shape on the bottom line of its block (3 rows lower than the block starts), not the shape of an untapped card
    drag.highlight.dataset.row = String(drag.tapped ? cell.row + (CARD_ROWS - CARD_COLS) : cell.row);
    if (drag.tapped) drag.highlight.dataset.tapped = '1'; else delete drag.highlight.dataset.tapped;
    drag.highlight.hidden = false; // anywhere on the board is fine: cards may overlap, nothing is refused
  };

  const swallowClick = () => {
    const stop = (event) => { event.stopPropagation(); event.preventDefault(); };
    doc.addEventListener('click', stop, true);
    setTimeout(() => doc.removeEventListener('click', stop, true), 0);
  };

  const onDown = (event) => {
    if (!isEnabled() || event.button !== 0 || event.pointerType === 'touch') return;
    if (event.altKey || event.ctrlKey || event.metaKey) return; // a modified click is something else (a menu key)
    if (event.target.closest?.('[data-mark], [data-badge]')) return;
    const source = sourceOf(event.target);
    // A pile of more than one card: Shift held while dragging, or taking the corner handle (data-stack-handle), carries the WHOLE pile; a plain drag takes one card off the top. Shift on a card
    // that is not in a pile is something else (a marks step) and starts no drag.
    const stacked = source?.from === 'battlefield' && Number(source.button.dataset.stackSize) > 1;
    if (event.shiftKey && !stacked) return;
    const whole = stacked && (event.shiftKey || Boolean(event.target.closest?.('[data-stack-handle]')));
    const own = source?.from === 'battlefield' ? { col: Number(source.button.dataset.col), row: Number(source.button.dataset.row) } : null;
    press = source ? { ...source, whole, x: event.clientX, y: event.clientY, start: own && Number.isInteger(own.col) && Number.isInteger(own.row) ? own : null } : null;
  };
  const onMove = (event) => {
    if (press && !drag && Math.hypot(event.clientX - press.x, event.clientY - press.y) > DRAG_DISTANCE_PX) startDrag(event);
    if (drag) update(event);
  };
  const onUp = (event) => {
    if (!drag) { press = null; return; }
    update(event);
    const { uid, from, cell, overHand, whole } = drag;
    const x = event.clientX;
    clean();
    swallowClick();
    if (overHand && from === 'hand') onReorderHand({ uid, x });
    else if (overHand) onDropHand({ uid, from });
    else if (cell) onDrop({ uid, from, col: cell.col, row: cell.row, whole });
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
