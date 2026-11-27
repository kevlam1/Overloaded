// The window of Scry and Surveil (Kevin, 2026-11-15): the top cards of the library side by side, the top card on the left. Under each card are its choices (Top, Bottom, and for Surveil Graveyard) and two
// small arrows that move it earlier or later in the order; Done does what was chosen (shared/scry.mjs works out the new library), Cancel or Escape leaves everything as it was.
// openScryWindow({ kind, cards, nodeFor, onDone }): kind is 'scry' or 'surveil'; cards the cards to look at, first = top; nodeFor(card) the card button (the same one the viewer uses);
// onDone({ order, choices }) is called with the uids in the order chosen and an object from uid to 'top', 'bottom' or 'graveyard'. Returns { close }.
import { SCRY_CHOICES } from '../../shared/scry.mjs';

const make = (tag, className, text) => { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; };
const WORDS = { top: 'Top', bottom: 'Bottom', graveyard: 'Graveyard' };
let current = null;

export function openScryWindow({ kind, cards, nodeFor, onDone }) {
  current?.close();
  const choices = SCRY_CHOICES[kind];
  if (!choices || !Array.isArray(cards) || cards.length === 0) return { close() {} };
  const name = kind === 'scry' ? 'Scry' : 'Surveil';
  const order = cards.map((card) => card.uid);
  const picked = Object.fromEntries(order.map((uid) => [uid, 'top']));
  const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const overlay = make('div', 'scry-overlay');
  const panel = make('div', 'scry-window');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', `${name} ${cards.length}`);
  const heading = make('h2', 'scry-title', `${name} ${cards.length}`);
  const note = make('p', 'scry-note', kind === 'scry'
    ? 'The top card is on the left. Put each card on the top or the bottom; the arrows change the order.'
    : 'The top card is on the left. Keep each card on top or put it in your graveyard; the arrows change the order.');
  const list = make('ol', 'scry-cards');
  const buttons = make('div', 'scry-buttons');
  const done = make('button', 'scry-done', 'Done'); done.type = 'button';
  const cancel = make('button', 'scry-cancel', 'Cancel'); cancel.type = 'button';
  buttons.append(done, cancel);
  panel.append(heading, note, list, buttons);
  overlay.append(panel);
  for (const type of ['click', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'dblclick']) overlay.addEventListener(type, (event) => event.stopPropagation()); // (whatever happens on the dark space around the window is the window's)
  overlay.addEventListener('contextmenu', (event) => { event.preventDefault(); event.stopPropagation(); });
  document.body.append(overlay);
  const byUid = new Map(cards.map((card) => [card.uid, card]));

  function draw(focus = null) {
    list.replaceChildren(...order.map((uid, index) => {
      const item = make('li', 'scry-card');
      item.dataset.uid = uid;
      item.dataset.choice = picked[uid];
      const place = make('span', 'scry-place', index === 0 ? 'Top' : `#${index + 1}`);
      const picture = make('div', 'scry-picture');
      picture.append(nodeFor(byUid.get(uid)));
      const row = make('div', 'scry-choices');
      for (const choice of choices) {
        const button = make('button', 'scry-choice', WORDS[choice]);
        button.type = 'button';
        button.dataset.choice = choice;
        button.setAttribute('aria-pressed', String(picked[uid] === choice));
        button.addEventListener('click', () => { picked[uid] = choice; draw({ uid, choice }); });
        row.append(button);
      }
      const arrows = make('div', 'scry-arrows');
      const earlier = make('button', 'scry-move', '◀'); earlier.type = 'button'; earlier.disabled = index === 0; earlier.setAttribute('aria-label', `Move ${byUid.get(uid).n} earlier`);
      const later = make('button', 'scry-move', '▶'); later.type = 'button'; later.disabled = index === order.length - 1; later.setAttribute('aria-label', `Move ${byUid.get(uid).n} later`);
      const move = (to) => { order.splice(index, 1); order.splice(to, 0, uid); draw({ uid, move: true }); };
      earlier.addEventListener('click', () => move(index - 1));
      later.addEventListener('click', () => move(index + 1));
      arrows.append(earlier, later);
      item.append(place, picture, row, arrows);
      return item;
    }));
    if (focus) {
      const item = list.querySelector(`[data-uid="${focus.uid}"]`);
      (focus.choice ? item?.querySelector(`[data-choice="${focus.choice}"]`) : item?.querySelector('.scry-move:not(:disabled)'))?.focus({ preventScroll: true });
    }
  }

  function close() {
    if (!overlay.isConnected) return;
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
    current = null;
    if (returnTo && returnTo.isConnected) returnTo.focus({ preventScroll: true });
  }
  const onKey = (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation(); // the page's own Escape (it lets go of a card) must not also run
    close();
  };
  done.addEventListener('click', () => { const result = { order: [...order], choices: { ...picked } }; close(); onDone(result); });
  cancel.addEventListener('click', close);
  document.addEventListener('keydown', onKey, true);
  current = { close };
  draw();
  done.focus({ preventScroll: true });
  requestAnimationFrame(() => { if (overlay.isConnected) done.focus({ preventScroll: true }); }); // the menu that opened this window gives the focus back to its own button as it closes: take it again
  return { close };
}
