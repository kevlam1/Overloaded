// A picture of a card that shows beside a deck list while the pointer is over a row of it (or while the card's name has
// keyboard focus). Used by the deck import page to check the card art. It draws Scryfall's `normal` picture of the card's
// default printing; it does not know which printing a player meant (the card list holds one id per card).
// Rows are found by event delegation, so the list can be redrawn without wiring anything again. Plain DOM, no dependencies.
import { imageUrl } from '../../shared/card-image.mjs';

const GAP = 24; // pixels between the pointer and the picture
const EDGE = 8; // pixels kept free at the window's edge
const DOCK_MIN_WIDTH = 900; // a window at least this wide has room for the picture beside the list

// root: the element that holds the rows. Each row has data-card-id (a Scryfall id) and data-card-name. peek: the box to show,
// image: its <img>, note: the text under the picture. Returns { hide }.
export function setupCardPeek({ root, peek, image, note, win = window }) {
  let current = null; // the row being shown
  let dismissed = null; // a row whose box was closed with Escape; it is not shown again until the pointer has left that row
  let last = { x: 0, y: 0 }; // where it was last placed for, to place it again once the picture has its real size
  const failed = new Set(); // addresses that did not load, so a second hover does not show a broken image

  const rowOf = (target) => (target instanceof win.Element ? target.closest('[data-card-id]') : null);

  function place(x, y) {
    last = { x, y };
    const width = peek.offsetWidth;
    const height = peek.offsetHeight;
    const room = win.document.documentElement.clientWidth; // without the scroll bar
    // On a wide window the picture sits at the right edge, level with the pointer, so it never covers the names. On a
    // narrow one there is no spare room, so it follows the pointer, to its right or (with no room there) to its left.
    let left = room >= DOCK_MIN_WIDTH ? room - width - EDGE : x + GAP + width > room - EDGE ? x - GAP - width : x + GAP;
    left = Math.max(EDGE, Math.min(left, room - width - EDGE));
    const top = Math.max(EDGE, Math.min(y - height / 2, win.innerHeight - height - EDGE));
    peek.style.left = `${Math.round(left)}px`;
    peek.style.top = `${Math.round(top)}px`;
  }

  function show(row, x, y) {
    const url = imageUrl(row.dataset.cardId, 'normal');
    if (!url) { hide(); return; }
    const name = row.dataset.cardName ?? '';
    if (row !== current) {
      current = row;
      if (failed.has(url)) {
        image.hidden = true;
        note.textContent = `No picture could be loaded for ${name}.`;
      } else {
        image.hidden = false;
        if (image.getAttribute('src') !== url) image.setAttribute('src', url);
        image.alt = name;
        note.textContent = `${name}: the card's default printing`;
      }
    }
    peek.hidden = false;
    place(x, y);
  }

  function hide() {
    current = null;
    peek.hidden = true;
  }

  image.addEventListener('load', () => { if (current && !peek.hidden) place(last.x, last.y); });
  image.addEventListener('error', () => {
    // The picture is not there (a card Scryfall has no picture for, or no network): say so instead of showing a broken image.
    failed.add(image.getAttribute('src'));
    image.hidden = true;
    note.textContent = `No picture could be loaded for ${current?.dataset.cardName ?? 'this card'}.`;
  });

  // A mouse move over a row shows the box if it is not showing (after a scroll hid it, for example, the pointer is already on a
  // row and no "mouseover" comes), except for a row closed with Escape, which stays closed until the pointer leaves it.
  const pointerOver = (event) => {
    const row = rowOf(event.target);
    if (!row || row === dismissed) return;
    if (row === current && !peek.hidden) place(event.clientX, event.clientY);
    else show(row, event.clientX, event.clientY);
  };
  root.addEventListener('mouseover', pointerOver);
  root.addEventListener('mousemove', pointerOver);
  root.addEventListener('mouseout', (event) => {
    const row = rowOf(event.target);
    if (!row || rowOf(event.relatedTarget) === row) return; // still inside the same row: nothing changes
    if (row === dismissed) dismissed = null;
    if (row === current) hide();
  });
  root.addEventListener('focusin', (event) => {
    const row = rowOf(event.target);
    if (!row) return;
    dismissed = null; // focusing a name on purpose brings the box back
    const box = event.target.getBoundingClientRect();
    show(row, box.right, box.top + box.height / 2);
  });
  root.addEventListener('focusout', (event) => {
    if (rowOf(event.target) === current && rowOf(event.relatedTarget) !== current) hide();
  });
  win.document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !current) return;
    dismissed = current;
    hide();
  });
  win.addEventListener('scroll', hide, { passive: true });
  return { hide };
}
