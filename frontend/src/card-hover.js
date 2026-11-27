// A larger picture of any card on the table while Alt is held and the pointer is on it (Kevin, 2026-11-10: the cards are small, so a card is read by holding Alt over it; the
// selected card also stays in the card corner). It works for every card button on the page, yours or another player's, in play or in the hand, by asking the card's own small
// picture for its address (Scryfall keeps the same card under /small/, /normal/ and /large/), so no card data is needed. It never takes the pointer, never shows on touch (a phone
// has no pointer or Alt), appears at once and goes when Alt is let go or the pointer leaves the card, and hides on a click, a menu, Escape or a scroll (and stays hidden for that
// card until Alt is let go or the pointer has left it).
import { IMAGE_HOST } from '../../shared/card-image.mjs';
import { makeSafeStore } from './safe-store.js';
import { makeFoilLayer, setFoilLook } from './foil-layer.js';
import { keybinds } from './keybinds.js';
import { manaIcon } from './mana-icon.js';

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
// notesFor(button): the notes for that card (shared/card-notes.mjs: what its keywords mean, its counters and state), shown in a panel beside the picture; [] or null for none.
export function mountCardHover(doc = document, { notesFor = null } = {}) {
  const box = doc.createElement('div');
  box.id = 'card-hover';
  box.className = 'card-peek card-hover';
  box.hidden = true;
  box.setAttribute('aria-hidden', 'true'); // a picture of what is already on the card button; the card's name is read from the button itself
  const picture = doc.createElement('img');
  picture.alt = '';
  picture.decoding = 'async';
  picture.referrerPolicy = 'no-referrer';
  const shine = makeFoilLayer(null); // the foil over the picture of a foil card (it holds still)
  box.append(picture, shine);
  doc.body.append(box);
  // the notes beside the picture (Kevin, 2026-11-25: "does holding Alt explain the keywords on that card?")
  const notes = doc.createElement('div');
  notes.id = 'card-hover-notes';
  notes.className = 'card-hover-notes';
  notes.hidden = true;
  notes.setAttribute('aria-hidden', 'true');
  doc.body.append(notes);
  const NOTES_WIDTH = 260;
  function fillNotes(button) {
    const list = (notesFor?.(button) ?? []).filter(Boolean);
    notes.replaceChildren(...list.map((note) => {
      const row = doc.createElement('div');
      row.className = `hover-note${note.text ? '' : ' plain'}`;
      const icon = note.icon ? manaIcon(note.icon, { className: 'hover-note-icon' }) : null;
      const words = doc.createElement('div');
      const name = doc.createElement('strong'); name.textContent = note.name;
      words.append(name);
      if (note.text) { const text = doc.createElement('p'); text.textContent = note.text; words.append(text); }
      row.append(icon ?? Object.assign(doc.createElement('span'), { className: 'hover-note-icon none' }), words);
      return row;
    }));
    return list.length > 0;
  }
  // beside the picture, away from the card; on the other side of the card when there is no room; under the picture's bottom as a last resort
  function placeNotes(rect, spot, boxWidth, boxHeight) {
    const width = doc.defaultView.innerWidth;
    const height = doc.defaultView.innerHeight;
    const awayRight = spot.left >= rect.left; // the picture is on the card's right
    let left = awayRight ? spot.left + boxWidth + 8 : spot.left - 8 - NOTES_WIDTH;
    if (left < 4 || left + NOTES_WIDTH > width - 4) left = awayRight ? rect.left - 8 - NOTES_WIDTH : rect.right + 8;
    left = Math.max(4, Math.min(left, width - NOTES_WIDTH - 4));
    notes.style.width = `${NOTES_WIDTH}px`;
    notes.style.left = `${left}px`;
    notes.style.top = '0px';
    notes.hidden = false;
    const tall = notes.offsetHeight;
    notes.style.top = `${Math.max(4, Math.min(spot.top, height - tall - 4))}px`;
    void boxHeight;
  }
  const store = makeSafeStore();
  let scale = readHoverScale(store.get(HOVER_SCALE.key));

  let turns = 0; // quarter turns of the larger picture (Q turns it one way, E the other: for a room, a battle or any card that is read sideways), back to 0 for another card
  let altHeld = false;
  let over = null; // the card button the pointer is on
  let current = null; // the card button the box is for
  let suppressed = null; // after Escape or a click: not again for this card until Alt is let go or the pointer has left it
  let hasNotes = false;

  const hide = () => { box.hidden = true; notes.hidden = true; notes.replaceChildren(); picture.removeAttribute('src'); current = null; turns = 0; };
  const show = (button) => {
    const url = largeAddress(button);
    if (!url || !button.isConnected) return;
    current = button;
    setFoilLook(shine, button.dataset.foil ?? null);
    shine.hidden = !button.dataset.foil;
    picture.onerror = () => { box.hidden = true; notes.hidden = true; }; // no larger picture: show nothing rather than a broken image
    picture.src = url;
    hasNotes = fillNotes(button);
    placeFor(button);
  };
  // The box at the size now chosen, beside the card.
  const placeFor = (button) => {
    const rect = button.getBoundingClientRect();
    const width = Math.round(BOX_WIDTH * scale);
    const height = Math.round(width * 1.395);
    const sideways = turns % 2 !== 0; // a card on its side takes a box as wide as the card is tall
    const boxWidth = sideways ? height : width;
    const boxHeight = sideways ? width : height;
    const spot = placeBox(rect, { width: boxWidth, height: boxHeight, windowWidth: doc.defaultView.innerWidth, windowHeight: doc.defaultView.innerHeight });
    box.style.width = `${boxWidth}px`;
    box.style.height = `${boxHeight}px`;
    box.style.left = `${spot.left}px`;
    box.style.top = `${spot.top}px`;
    picture.style.position = 'absolute';
    picture.style.width = `${width}px`;
    picture.style.height = `${height}px`;
    picture.style.left = `${Math.round((boxWidth - width) / 2)}px`;
    picture.style.top = `${Math.round((boxHeight - height) / 2)}px`;
    picture.style.rotate = `${turns * 90}deg`;
    for (const property of ['position', 'width', 'height', 'left', 'top', 'rotate']) shine.style[property] = picture.style[property]; // the shine lies exactly over the picture
    box.dataset.turns = String(((turns % 4) + 4) % 4);
    box.hidden = false;
    if (hasNotes) placeNotes(rect, spot, boxWidth, boxHeight); else notes.hidden = true;
  };
  // The box is for the card under the pointer, while the picture is turned on. Alt TOGGLES it (Kevin's friends, 2026-11-26: a key that turns it on and off, instead of
  // holding Alt): one press turns it on, the next turns it off; letting go of Alt does nothing. (altHeld is the name from when it was held.)
  const sync = () => {
    if (!altHeld || !over || over === suppressed) { if (current) hide(); return; }
    if (over !== current) { hide(); show(over); }
  };
  const setAlt = (value) => { if (altHeld === value) return; altHeld = value; if (!value) suppressed = null; sync(); };

  const onOver = (event) => {
    if (event.pointerType === 'touch' || event.pointerType === 'pen') return;
    over = event.target.closest?.('.card, .token-tile') ?? null;
    sync();
  };
  const onOut = (event) => {
    const from = event.target.closest?.('.card, .token-tile');
    if (!from) return;
    const to = event.relatedTarget?.closest?.('.card, .token-tile');
    if (to === from) return; // moved between the parts of the same card
    if (suppressed === from) suppressed = null;
    over = to ?? null;
    sync();
  };
  const onMove = () => {};
  let altAlone = false; // Alt is down and no other key has been pressed with it yet
  const onAway = () => { if (current) { suppressed = current; hide(); } };
  // Alt alone must not reach the browser: pressed and let go on its own it opens the browser's menu (and a held Alt can open it on release), so both its keydown and its keyup are
  // cancelled whenever no other key is part of the press.
  const onKeyDown = (event) => {
    if (event.key === 'Alt') { event.preventDefault(); if (!event.repeat) altAlone = true; } // (it toggles when let go, if no other key was pressed with it: Alt and an arrow nudge a card)
    else if (event.altKey) altAlone = false;
    if (event.key === 'Alt') return;
    else if (event.key === 'Escape') onAway();
    else if (altHeld && current && !box.hidden && ['pictureLeft', 'pictureRight'].includes(keybinds.match('picture', event))) { // (with Alt held the table does not tap, so the keys are free to turn the picture; they are the player's own choices, Settings > Keybinds)
      event.preventDefault();
      event.stopImmediatePropagation(); // (the same keys tap on the table: while the picture is on they only turn it)
      turns += keybinds.match('picture', event) === 'pictureLeft' ? -1 : 1;
      if (current.isConnected) placeFor(current);
    }
  };
  const onKeyUp = (event) => {
    if (event.key !== 'Alt') return;
    event.preventDefault(); // (kept from the browser, which would open its menu)
    if (altAlone) setAlt(!altHeld); // Alt pressed and let go on its own: the picture on or off
    altAlone = false;
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
  doc.defaultView.addEventListener('keydown', onKeyDown, true); // (on the window, before the page's own key handlers: see the picture keys above)
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
      doc.defaultView.removeEventListener('keydown', onKeyDown, true);
      doc.removeEventListener('keyup', onKeyUp);
      doc.defaultView.removeEventListener('scroll', onAway, true);
      doc.defaultView.removeEventListener('blur', onBlur);
      box.remove();
      notes.remove();
    },
  };
}
