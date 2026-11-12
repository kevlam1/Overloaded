// Drag and drop on the battlefield grid (Kevin, 2026-11-06, docs/layout.md "Phase B"). You can lift one of your cards from the battlefield or from your hand and drop it on a cell of
// your own battlefield; the cell under the pointer is outlined while you drag, and the page decides what the drop does (onDrop). Mouse and pen only: a phone has no hover and its
// touch version is on hold. A drag starts only after the pointer has moved a few pixels, so an ordinary click still selects a card, and a press on a counter or a badge is theirs.
// Escape, a menu, the window losing focus or letting go outside the board cancels it. This module changes nothing in the game: it reports { uid, from, col, row }.
import { STACK_HOLD_MS } from '../../shared/stacks.mjs';
import { anchorAtPoint, cellAtPoint, shiftedAnchor, BOARD_COLS, CARD_COLS, CARD_ROWS } from '../../shared/board-grid.mjs';

export const DRAG_DISTANCE_PX = 6;

// board: () => the battlefield element of the player. onDrop({ uid, from: 'battlefield' | 'hand', col, row }). isEnabled: () => whether dragging is allowed right now.
// hand (optional): () => the element of your hand; a card from the battlefield let go over it is reported to onDropHand({ uid, from }) (back into the hand), and the hand is marked while one is over it.
// A card of the hand dragged within the hand rearranges it: while it is over the hand onHandOver({ uid, x }) is called with the pointer's x (and with null when it leaves or the drag ends), and on
// letting go onReorderHand({ uid, x }) says where it was let go.
// The picture of a card carried out of the HAND does not stick to the pointer: it follows it with a little lag (every instant it closes a share of the distance, so it eases and never jerks) and
// leans with the lag, so it swings as it is moved. It starts from where the card was, at the card's own turn. Under prefers-reduced-motion it is exactly under the pointer. (A card of the
// battlefield is exactly under the pointer: its place is read off the pointer.)
const FOLLOW_RATE = 30; // per second
const LEAN_RATE = 14; // per second
const LEAN_PER_PIXEL = 0.35; // degrees of lean for each pixel the picture is behind the pointer
const MAX_LEAN = 18; // degrees

// Piles and the command zone (Kevin, 2026-11-12): a card can be taken from the top of the library, the graveyard or the exile, or from the command zone, and a card can be dropped on any of them. The page says
// what is a pile: zoneSource(target) gives { button, uid, from, picture? } for the element pressed (the top card of a pile, or a card of the command zone; picture: an address for the picture carried, for a
// library, whose top card is not shown), pileAt(x, y) gives { zone, element } for the pile under a point, and onDropPile({ uid, from, to }) is called when a card is let go over one.
export function mountBoardDrag({ doc = document, board, onDrop, hand = () => null, onDropHand = () => {}, onHandOver = () => {}, onReorderHand = () => {}, handZone = () => null, handHit = null, zoneSource = () => null, pileAt = () => null, onDropPile = () => {}, isEnabled = () => true }) {
  let press = null; // the card the pointer went down on, before it has moved far enough to be a drag
  let hold = null; // { ring, timer, ready }: a pile of cards is being held down; when the circle is full it is ready to be moved as a whole
  let drag = null; // { button, uid, from, ghost, highlight, cell }

  const sourceOf = (target) => {
    const button = target?.closest?.('.card');
    if (!button || button.disabled) return null;
    const boardElement = board();
    if (boardElement && button.parentElement === boardElement) return { button, uid: button.dataset.uid, from: 'battlefield' };
    if (button.parentElement?.id === 'hand') return { button, uid: button.dataset.uid, from: 'hand' };
    return null; // another player's cards are not dragged
  };
  // what was pressed: a card of the battlefield or the hand, or (the page says) the top of a pile or a card of the command zone
  const pressedSource = (target) => sourceOf(target) ?? zoneSource(target);

  // A pile of more than one card (Kevin, 2026-11-12: this replaces the triangle in its corner): hold it down without moving and a circle fills over it; when the circle is full the whole pile is ready, and
  // moving then carries all of it. Move before that and one card comes off the top, as before. (Shift and drag still carries the whole pile at once.)
  const SVG = 'http://www.w3.org/2000/svg';
  const endHold = () => {
    if (!hold) return;
    clearTimeout(hold.timer);
    hold.ring.remove();
    hold = null;
  };
  const startHold = () => {
    endHold();
    const boardElement = board();
    if (!boardElement || !press) return;
    const card = press.button.getBoundingClientRect();
    const box = boardElement.getBoundingClientRect();
    const ring = doc.createElementNS(SVG, 'svg');
    ring.setAttribute('class', 'stack-hold-ring holding');
    ring.setAttribute('width', '44');
    ring.setAttribute('height', '44');
    ring.setAttribute('viewBox', '0 0 44 44');
    ring.setAttribute('fill', 'none');
    ring.setAttribute('aria-hidden', 'true');
    ring.style.left = `${card.left - box.left + card.width / 2 - 22}px`;
    ring.style.top = `${card.top - box.top + card.height / 2 - 22}px`;
    ring.style.setProperty('--hold', `${STACK_HOLD_MS}ms`);
    for (const name of ['track', 'fill']) {
      const circle = doc.createElementNS(SVG, 'circle');
      circle.setAttribute('class', name);
      circle.setAttribute('cx', '22');
      circle.setAttribute('cy', '22');
      circle.setAttribute('r', '18');
      circle.setAttribute('fill', 'none');
      ring.append(circle);
    }
    boardElement.append(ring);
    const mine = press;
    hold = { ring, ready: false, timer: setTimeout(() => { if (hold && press === mine) { press.whole = true; hold.ready = true; ring.setAttribute('class', 'stack-hold-ring ready'); } }, STACK_HOLD_MS) };
  };

  const clean = () => {
    endHold();
    if (drag) {
      onHandOver(null); // (the hand closes its place, whichever card was carried)
      if (drag.smooth?.frame) cancelAnimationFrame(drag.smooth.frame);
      drag.ghost.remove();
      hand()?.classList.remove('drop-hand');
      drag.pileElement?.classList.remove('drop-target');
      drag.highlight.remove();
      for (const c of drag.carried) c.classList.remove('dragging');
      doc.body.classList.remove('dragging-card');
    }
    drag = null;
    press = null;
  };

  const startDrag = (event) => {
    const boardElement = board();
    endHold(); // (press.whole says whether the hold was long enough)
    if (!boardElement || !press.uid) { press = null; return; }
    // a pile is carried from its top card (the picture of the stack, not the whole button with its name under it)
    const rect = (press.zone ? press.button.querySelector('.stack-face') ?? press.button : press.button).getBoundingClientRect();
    const ghost = doc.createElement('div');
    ghost.className = 'drag-ghost';
    const picture = press.button.querySelector('img');
    if (press.picture) { const back = doc.createElement('img'); back.alt = ''; back.draggable = false; back.referrerPolicy = 'no-referrer'; back.src = press.picture; ghost.append(back); } // (the top of a library: a card back)
    else if (picture && !press.button.classList.contains('noimage')) { const copy = picture.cloneNode(); copy.removeAttribute('loading'); ghost.append(copy); } else ghost.textContent = press.button.getAttribute('aria-label') ?? '';
    // the picture is the card at its own size on screen (a tapped card is turned back to portrait and then turned on its side again)
    const tapped = press.button.classList.contains('tapped');
    // the card at its own size: a card of the hand is turned and may be lifted under the pointer, which makes its box on screen bigger, so its own layout size is used
    const own = press.from === 'hand' && press.button.offsetWidth > 0;
    // A tapped card is a landscape box on the board (rect). Its picture is drawn as a portrait card (the short side across, the long side down) and the style sheet turns it on its side, so it ends up as big
    // as the tapped card; what is held is the landscape box.
    const height = tapped ? rect.width : own ? press.button.offsetHeight : rect.height;
    const width = tapped ? rect.height : own ? press.button.offsetWidth : rect.width;
    const holdW = tapped ? rect.width : width; // the size of what is held (the box on screen)
    const holdH = tapped ? rect.height : height;
    if (tapped) ghost.classList.add('tapped');
    ghost.style.width = `${width}px`;
    ghost.style.height = `${height}px`;
    doc.body.append(ghost);
    const highlight = doc.createElement('div');
    highlight.className = 'cell-highlight';
    highlight.hidden = true;
    boardElement.append(highlight);
    // the cards being carried are not shown where they were: the one pressed, and for a whole pile every card of it (the same cell, tapped or not like it)
    const carried = press.zone ? [] : [press.button]; // (the pile stays where it is: only a copy of its top card is carried)
    if (press.whole) carried.push(...[...boardElement.querySelectorAll(':scope > .card')].filter((c) => c !== press.button && c.dataset.col === press.button.dataset.col && c.dataset.row === press.button.dataset.row && c.classList.contains('tapped') === press.button.classList.contains('tapped') && c.dataset.stackSize !== undefined));
    for (const c of carried) c.classList.add('dragging');
    doc.body.classList.add('dragging-card');
    const grab = { x: Math.min(1, Math.max(0, (press.x - rect.left) / (rect.width || 1))), y: Math.min(1, Math.max(0, (press.y - rect.top) / (rect.height || 1))) }; // where on the card it was taken, as fractions
    if (press.whole) ghost.dataset.count = press.button.dataset.stackSize; // the picture says how many cards it carries
    drag = { carried, button: press.button, uid: press.uid, from: press.from, whole: press.whole, tapped, ghost, highlight, cell: null, overHand: false, pile: null, pileElement: null, width, height, holdW, holdH, grab, startX: press.x, startY: press.y, start: press.start };
    if (press.from === 'hand' && !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
      // from where the card is (the middle of its box on screen is where its middle is, whatever its turn), at its own turn
      const turn = parseFloat(press.button.style.getPropertyValue('--ha')) || 0;
      const x = rect.left + rect.width / 2 - width / 2;
      const y = rect.top + rect.height / 2 - height / 2;
      drag.smooth = { x, y, a: turn, tx: x, ty: y, frame: 0, last: performance.now() };
      ghost.style.transform = `translate(${x}px, ${y}px) rotate(${turn}deg)`;
      drag.smooth.frame = requestAnimationFrame(followPointer);
    }
    press = null;
  };

  // one step of the picture of a carried card of the hand toward the pointer
  function followPointer(now) {
    const s = drag?.smooth;
    if (!s) return;
    const dt = Math.min(0.05, Math.max(0, (now - s.last) / 1000));
    s.last = now;
    const lag = s.tx - s.x;
    s.x += lag * (1 - Math.exp(-FOLLOW_RATE * dt));
    s.y += (s.ty - s.y) * (1 - Math.exp(-FOLLOW_RATE * dt));
    const lean = Math.max(-MAX_LEAN, Math.min(MAX_LEAN, lag * LEAN_PER_PIXEL));
    s.a += (lean - s.a) * (1 - Math.exp(-LEAN_RATE * dt));
    drag.ghost.style.transform = `translate(${s.x}px, ${s.y}px) rotate(${s.a}deg)`;
    s.frame = requestAnimationFrame(followPointer);
  }

  const update = (event) => {
    const x = event.clientX; const y = event.clientY;
    // the top left of the picture: the middle of what is held is where the pointer holds it (for a tapped card the box held is on its side, the picture is turned about its middle)
    const left = x - drag.holdW * (drag.grab.x - 0.5) - drag.width / 2;
    const top = y - drag.holdH * (drag.grab.y - 0.5) - drag.height / 2;
    if (drag.smooth) { drag.smooth.tx = left; drag.smooth.ty = top; } // (the picture follows these)
    else { drag.pos = { x: Math.round(left), y: Math.round(top) }; drag.ghost.style.transform = `translate(${drag.pos.x}px, ${drag.pos.y}px)${drag.tapped ? ' rotate(90deg)' : ''}`; } // (a tapped card is turned on its side about its middle, after the move) the card is held where it was taken
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
    const over = drag.from !== 'hand' && handHit ? handHit(x, y) : inZone;
    // over a pile (the library, the graveyard, the exile or the command zone) the card goes onto it: the hand and the board are not under the pointer then
    const pileHere = pileAt(x, y);
    const pile = pileHere && pileHere.zone !== drag.from ? pileHere : null;
    if ((pile?.element ?? null) !== drag.pileElement) { drag.pileElement?.classList.remove('drop-target'); pile?.element.classList.add('drop-target'); drag.pileElement = pile?.element ?? null; }
    drag.pile = pile ? pile.zone : null;
    drag.overHand = !pile && (drag.from === 'hand' || !drag.whole) && over;
    handElement?.classList.toggle('drop-hand', drag.overHand && drag.from !== 'hand');
    // the place the card is over is decided from the middle of the picture carried, not from the pointer: you take a card of an overlapping hand by the part that shows, which may be far from its middle, and the
    // picture starts exactly over its own place, so nothing moves until it has been carried a little
    // a card from outside the hand (the battlefield, a pile) opens a place in it while it is over it, as a card of the hand does
    if (drag.from === 'hand') onHandOver({ uid: drag.uid, x: x - drag.holdW * (drag.grab.x - 0.5), over: drag.overHand });
    else if (!drag.whole) onHandOver({ uid: drag.uid, x: x - drag.holdW * (drag.grab.x - 0.5), over: drag.overHand, external: true }); // the hand shows where the card would go back (over), or closes up when the card is away from it
    // a tapped card is a landscape card, 11 cells wide, so it may not start in the last 3 columns of the board
    if (cell && drag.tapped) cell.col = Math.min(cell.col, BOARD_COLS - CARD_ROWS);
    drag.cell = drag.overHand || drag.pile ? null : cell;
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
    const source = pressedSource(event.target);
    // A pile of more than one card: Shift held while dragging, or holding it down until the circle is full (startHold), carries the WHOLE pile; a plain drag takes one card off the top. Shift on a card
    // that is not in a pile is something else (a marks step) and starts no drag.
    const stacked = source?.from === 'battlefield' && Number(source.button.dataset.stackSize) > 1;
    if (event.shiftKey && !stacked) return;
    const whole = stacked && event.shiftKey;
    const own = source?.from === 'battlefield' ? { col: Number(source.button.dataset.col), row: Number(source.button.dataset.row) } : null;
    press = source ? { ...source, zone: source.from !== 'battlefield' && source.from !== 'hand', whole, x: event.clientX, y: event.clientY, start: own && Number.isInteger(own.col) && Number.isInteger(own.row) ? own : null } : null;
    if (press && stacked && !event.shiftKey) startHold(); // a pile held down is ready to be moved as a whole
  };
  const onMove = (event) => {
    if (press && !drag && Math.hypot(event.clientX - press.x, event.clientY - press.y) > DRAG_DISTANCE_PX) startDrag(event);
    if (drag) update(event);
  };
  const onUp = (event) => {
    if (!drag) { endHold(); press = null; return; }
    update(event);
    const { uid, from, cell, overHand, whole, pile } = drag;
    const x = event.clientX - drag.holdW * (drag.grab.x - 0.5); // (the middle of the picture, as while it was carried)
    const picture = drag.smooth ? { x: drag.smooth.x, y: drag.smooth.y, angle: drag.smooth.a } : drag.pos ? { x: drag.pos.x, y: drag.pos.y, angle: 0 } : null; // where the picture is as it is let go: the card starts there
    clean();
    swallowClick();
    if (pile) onDropPile({ uid, from, to: pile });
    else if (overHand && from === 'hand') onReorderHand({ uid, x, picture });
    else if (overHand) onDropHand({ uid, from, x, picture });
    else if (cell) onDrop({ uid, from, col: cell.col, row: cell.row, whole });
  };
  const cancel = () => { if (drag) swallowClick(); clean(); };
  const onKey = (event) => { if (event.key === 'Escape' && drag) cancel(); };
  const noNativeDrag = (event) => { if (event.target.closest?.('.card, .pile-stack')) event.preventDefault(); }; // the browser's own picture dragging would start instead of ours

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
