// A larger picture of any card on the table while the pointer rests on it (Kevin, 2026-11-06: on the one-screen layout the cards are small, so a card is read by
// hovering it). It works for every card button on the page, yours or another player's, in play or in the hand, by asking the card's own small picture for its address
// (Scryfall keeps the same card under /small/, /normal/ and /large/), so no card data is needed. It never takes the pointer, never shows on touch (a phone has no hover),
// waits a moment so a pointer sweeping across the table shows nothing, and hides on a click, a menu, Escape or a scroll.
import { IMAGE_HOST } from '../../shared/card-image.mjs';

const SMALL = `${IMAGE_HOST}/small/`;
const NORMAL = `${IMAGE_HOST}/normal/`;
export const HOVER_DELAY_MS = 350;
const BOX_WIDTH = 272; // px, the picture is 17rem wide

// The bigger picture's address for a card button, or null when the card shows no picture (a name only, or an address that is not one of Scryfall's).
export function largeAddress(button) {
  const picture = button?.querySelector?.('img');
  const src = picture?.getAttribute('src') ?? '';
  if (!src.startsWith(SMALL) || button.classList.contains('noimage')) return null;
  return NORMAL + src.slice(SMALL.length);
}

// Where the box goes (px): beside the card, on the side with more room, level with the card and kept inside the window. Plain numbers in and out so it can be tested.
export function placeBox(rect, { width = BOX_WIDTH, height, windowWidth, windowHeight, gap = 8, edge = 4 }) {
  const roomRight = windowWidth - rect.right - gap - edge;
  const roomLeft = rect.left - gap - edge;
  let left = roomRight >= width || roomRight >= roomLeft ? rect.right + gap : rect.left - gap - width;
  left = Math.max(edge, Math.min(left, windowWidth - width - edge));
  let top = rect.top + rect.height / 2 - height / 2;
  top = Math.max(edge, Math.min(top, windowHeight - height - edge));
  return { left, top };
}

// Starts the preview for the whole page. Returns { stop(), box } (the box is the element, for tests).
export function mountCardHover(doc = document, { delay = HOVER_DELAY_MS } = {}) {
  const box = doc.createElement('div');
  box.id = 'card-hover';
  box.className = 'card-peek card-hover';
  box.hidden = true;
  box.setAttribute('aria-hidden', 'true'); // a picture of what is already on the card button; the card's name is read from the button itself
  const picture = doc.createElement('img');
  picture.alt = '';
  picture.decoding = 'async';
  picture.referrerPolicy = 'no-referrer';
  box.append(picture);
  doc.body.append(box);

  let timer = null;
  let pending = null; // the card button the pointer is on while the box waits to show
  let current = null; // the card button the box is for
  let suppressed = null; // after Escape or a click: not again for this card until the pointer has left it

  const hide = () => { clearTimeout(timer); timer = null; box.hidden = true; picture.removeAttribute('src'); current = null; };
  const show = (button) => {
    const url = largeAddress(button);
    if (!url || !button.isConnected) return;
    current = button;
    picture.onerror = () => { box.hidden = true; }; // no larger picture: show nothing rather than a broken image
    picture.src = url;
    const rect = button.getBoundingClientRect();
    const height = Math.round(BOX_WIDTH * 1.395);
    const spot = placeBox(rect, { height, windowWidth: doc.defaultView.innerWidth, windowHeight: doc.defaultView.innerHeight });
    box.style.left = `${spot.left}px`;
    box.style.top = `${spot.top}px`;
    box.hidden = false;
  };

  const onOver = (event) => {
    if (event.pointerType === 'touch' || event.pointerType === 'pen') return;
    const button = event.target.closest?.('.card');
    if (!button || button === current || button === pending || button === suppressed) return;
    hide();
    timer = setTimeout(() => show(button), delay);
    current = null;
    pending = button;
  };
  const onOut = (event) => {
    const from = event.target.closest?.('.card');
    if (!from) return;
    const to = event.relatedTarget?.closest?.('.card');
    if (to === from) return; // moved between the parts of the same card
    if (suppressed === from) suppressed = null;
    pending = null;
    hide();
  };
  const onAway = () => { if (current || timer) { suppressed = current ?? pending; hide(); } };
  const onKey = (event) => { if (event.key === 'Escape') onAway(); };

  doc.addEventListener('pointerover', onOver);
  doc.addEventListener('pointerout', onOut);
  doc.addEventListener('pointerdown', onAway, true);
  doc.addEventListener('contextmenu', onAway, true);
  doc.addEventListener('keydown', onKey);
  doc.defaultView.addEventListener('scroll', onAway, true);
  doc.defaultView.addEventListener('blur', hide);

  return {
    box,
    stop() {
      hide();
      doc.removeEventListener('pointerover', onOver);
      doc.removeEventListener('pointerout', onOut);
      doc.removeEventListener('pointerdown', onAway, true);
      doc.removeEventListener('contextmenu', onAway, true);
      doc.removeEventListener('keydown', onKey);
      doc.defaultView.removeEventListener('scroll', onAway, true);
      doc.defaultView.removeEventListener('blur', hide);
      box.remove();
    },
  };
}
