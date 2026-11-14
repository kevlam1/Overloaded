// A larger picture of any card on the table while Alt is held and the pointer is on it (Kevin, 2026-11-10: the cards are small, so a card is read by holding Alt over it; the
// selected card also stays in the card corner). It works for every card button on the page, yours or another player's, in play or in the hand, by asking the card's own small
// picture for its address (Scryfall keeps the same card under /small/, /normal/ and /large/), so no card data is needed. It never takes the pointer, never shows on touch (a phone
// has no pointer or Alt), appears at once and goes when Alt is let go or the pointer leaves the card, and hides on a click, a menu, Escape or a scroll (and stays hidden for that
// card until Alt is let go or the pointer has left it).
import { IMAGE_HOST } from '../../shared/card-image.mjs';
import { makeSafeStore } from './safe-store.js';

const SMALL = `${IMAGE_HOST}/small/`;
const NORMAL = `${IMAGE_HOST}/normal/`;
const BOX_WIDTH = 272; // px, the picture is 17rem wide at the normal size
// The scroll wheel over a card while Alt is held makes the larger picture bigger or smaller (Kevin, 2026-11-13): a tenth of the normal size a notch, between half size and double, and the size is kept in this browser.
export const HOVER_SCALE = { min: 0.5, max: 2, step: 0.1, key: 'overloaded.hoverScale' };
export function nextHoverScale(scale, deltaY) {
  const now = Number.isFinite(scale) ? scale : 1;
  if (!(deltaY < 0 || deltaY > 0)) return Math.min(HOVER_SCALE.max, Math.max(HOVER_SCALE.min, now));
  const next = now + (deltaY < 0 ? HOVER_SCALE.step : -HOVER_SCALE.step); // wheel up: bigger
  return Math.round(Math.min(HOVER_SCALE.max, Math.max(HOVER_SCALE.min, next)) * 100) / 100;
}
export const readHoverScale = (text) => (text === null || text === undefined || text === '' ? 1 : nextHoverScale(Number(text), 0));

// The bigger picture's address for a card button, or null when the card shows no picture (a name only, or an address that is not one of Scryfall's).
export function largeAddress(button) {
  const picture = button?.querySelector?.('img');
  const src = picture?.getAttribute('src') ?? '';
  if (button?.classList?.contains('noimage')) return null;
  if (src.startsWith(NORMAL)) return src; // a card of the hand already has the normal size
  if (!src.startsWith(SMALL)) return null;
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
export function mountCardHover(doc = document) {
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
  const store = makeSafeStore();
  let scale = readHoverScale(store.get(HOVER_SCALE.key));

  let altHeld = false;
  let over = null; // the card button the pointer is on
  let current = null; // the card button the box is for
  let suppressed = null; // after Escape or a click: not again for this card until Alt is let go or the pointer has left it

  const hide = () => { box.hidden = true; picture.removeAttribute('src'); current = null; };
  const show = (button) => {
    const url = largeAddress(button);
    if (!url || !button.isConnected) return;
    current = button;
    picture.onerror = () => { box.hidden = true; }; // no larger picture: show nothing rather than a broken image
    picture.src = url;
    placeFor(button);
  };
  // The box at the size now chosen, beside the card.
  const placeFor = (button) => {
    const rect = button.getBoundingClientRect();
    const width = Math.round(BOX_WIDTH * scale);
    const height = Math.round(width * 1.395);
    const spot = placeBox(rect, { width, height, windowWidth: doc.defaultView.innerWidth, windowHeight: doc.defaultView.innerHeight });
    box.style.width = `${width}px`;
    box.style.left = `${spot.left}px`;
    box.style.top = `${spot.top}px`;
    box.hidden = false;
  };
  // The box is for the card under the pointer, and only while Alt is held.
  const sync = () => {
    if (!altHeld || !over || over === suppressed) { if (current) hide(); return; }
    if (over !== current) { hide(); show(over); }
  };
  const setAlt = (value) => { if (altHeld === value) return; altHeld = value; if (!value) suppressed = null; sync(); };

  const onOver = (event) => {
    if (event.pointerType === 'touch' || event.pointerType === 'pen') return;
    over = event.target.closest?.('.card') ?? null;
    if (typeof event.altKey === 'boolean') altHeld = event.altKey;
    sync();
  };
  const onOut = (event) => {
    const from = event.target.closest?.('.card');
    if (!from) return;
    const to = event.relatedTarget?.closest?.('.card');
    if (to === from) return; // moved between the parts of the same card
    if (suppressed === from) suppressed = null;
    over = to ?? null;
    sync();
  };
  const onMove = (event) => { if (typeof event.altKey === 'boolean' && event.altKey !== altHeld) setAlt(event.altKey); };
  const onAway = () => { if (current) { suppressed = current; hide(); } };
  // Alt alone must not reach the browser: pressed and let go on its own it opens the browser's menu (and a held Alt can open it on release), so both its keydown and its keyup are
  // cancelled whenever no other key is part of the press.
  const onKeyDown = (event) => {
    if (event.key === 'Alt') { event.preventDefault(); setAlt(true); }
    else if (event.key === 'Escape') onAway();
  };
  const onKeyUp = (event) => {
    if (event.key !== 'Alt') return;
    event.preventDefault();
    setAlt(false);
  };
  const onBlur = () => { altHeld = false; suppressed = null; hide(); };

  // The wheel changes the size of the picture while it is shown (and only then: otherwise the wheel is left alone).
  const onWheel = (event) => {
    if (!current || !altHeld || box.hidden) return;
    event.preventDefault();
    const next = nextHoverScale(scale, event.deltaY);
    if (next === scale) return;
    scale = next;
    store.set(HOVER_SCALE.key, scale);
    if (current.isConnected) placeFor(current);
  };

  doc.addEventListener('wheel', onWheel, { passive: false });
  doc.addEventListener('pointerover', onOver);
  doc.addEventListener('pointerout', onOut);
  doc.addEventListener('pointermove', onMove);
  doc.addEventListener('pointerdown', onAway, true);
  doc.addEventListener('contextmenu', onAway, true);
  doc.addEventListener('keydown', onKeyDown);
  doc.addEventListener('keyup', onKeyUp);
  doc.defaultView.addEventListener('scroll', onAway, true);
  doc.defaultView.addEventListener('blur', onBlur);

  return {
    box,
    stop() {
      hide();
      doc.removeEventListener('wheel', onWheel);
      doc.removeEventListener('pointerover', onOver);
      doc.removeEventListener('pointerout', onOut);
      doc.removeEventListener('pointermove', onMove);
      doc.removeEventListener('pointerdown', onAway, true);
      doc.removeEventListener('contextmenu', onAway, true);
      doc.removeEventListener('keydown', onKeyDown);
      doc.removeEventListener('keyup', onKeyUp);
      doc.defaultView.removeEventListener('scroll', onAway, true);
      doc.defaultView.removeEventListener('blur', onBlur);
      box.remove();
    },
  };
}
