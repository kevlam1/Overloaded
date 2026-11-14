// The card buttons of a table page (the solo table and the live table draw cards the same way). A card is a button with its
// picture from Scryfall's picture server (shared/card-image.mjs) and its name as the fallback; the same card keeps the same
// button when it moves, so its picture is not loaded again. Names go in as text, never as markup.
// onSelect(uid) is called when a card is clicked; isSelected(uid) says whether it is the selected one; `readOnly` makes the
// buttons do nothing (another player's cards: you look, you do not touch). onMenu(uid, { x, y, element }) is called for a right-click
// that is not on a counter or a number (your own cards: the menu is src/card-menu.js). onMark(uid, hit) is called for a click on a counter or on
// the power/toughness numbers and returns false when the change was refused; printedStats(card) gives a card's printed power and
// toughness as text ("2/2") or null.
import { imageUrl, cardBackUrl } from '../../shared/card-image.mjs';
import { isLandCard } from '../../shared/zones.mjs';
import { stackInfo, STACK_VISIBLE } from '../../shared/stacks.mjs';
import { manaIcon } from './mana-icon.js';
import { changeParts, counterChips, marksSentence, markToast, shortNumber, statsOf } from '../../shared/marks.mjs';

function make(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

// What a card shows about its counters and its power and toughness, drawn over the bottom of the card:
// - the counters as a small column of chips at the bottom-left;
// - at the bottom-right a box with the power and toughness the card has NOW (printed numbers plus counters plus the hand-set
//   change), when the printed ones are two whole numbers. A number above the printed one is green, below it red. For your own
//   creature on the battlefield the box is also there with the printed numbers while nothing is changed, but only when the pointer
//   is on the card or the card is selected (so it does not cover the printed numbers the rest of the time);
// - when the printed numbers are not known (a non-creature with counters, a star), the change alone as "+5/+3" in a pill.
// Each chip and each piece of the box (power, the line between, toughness) carries data-mark so a click on it can be told from a
// click on the card; the marks answer clicks only when the table gave an onMark (your own cards).
const MARK_HELP = ' Click a counter or number to add 1, right-click to take 1 off, hold Shift for 10; the line or "/" between the numbers changes both.';
function updateMarks(button, card, interactive, printed, onBattlefield) {
  const chips = counterChips(card);
  const parts = changeParts(card);
  const stats = statsOf(card, printed);
  const showBox = Boolean(stats) && (Boolean(parts) || (interactive && onBattlefield));
  let box = button.querySelector(':scope > .marks');
  if (!chips.length && !parts && !showBox) { if (box) box.remove(); return; }
  if (!box) {
    box = make('span', 'marks');
    box.setAttribute('aria-hidden', 'true'); // the card's aria-label says the same in words
    button.append(box);
  }
  const piece = (className, text, mark, kind) => {
    const element = make('span', className, text);
    if (interactive) { element.dataset.mark = mark; if (kind) element.dataset.kind = kind; }
    return element;
  };
  const nodes = [];
  if (chips.length) {
    const column = make('span', 'chips');
    column.append(...chips.map((chip) => piece(`chip chip-${chip.kind}`, chip.text, 'chip', chip.kind)));
    nodes.push(column);
  }
  if (showBox) {
    const shiftClass = (shift) => (shift > 0 ? ' up' : shift < 0 ? ' down' : '');
    const ptbox = make('span', parts ? 'ptbox' : 'ptbox idle');
    ptbox.append(
      piece(`pt power${shiftClass(stats.shift.power)}`, shortNumber(stats.power), 'power'),
      piece('pt both', '/', 'both'),
      piece(`pt toughness${shiftClass(stats.shift.toughness)}`, shortNumber(stats.toughness), 'toughness'),
    );
    nodes.push(ptbox);
  } else if (parts) {
    const change = make('span', 'change');
    change.append(piece('power', parts.power, 'power'), piece('both', '/', 'both'), piece('toughness', parts.toughness, 'toughness'));
    nodes.push(change);
  }
  box.classList.toggle('live', interactive);
  box.replaceChildren(...nodes);
  box.title = marksSentence(card, printed) + (interactive ? MARK_HELP : '');
}

// The two state badges at the top-left of a card: the lock icon ("doesn't untap": the untap step skips this card) and SICK (summoning sick, a
// reminder). Another player sees them too. On your own card a click on a badge clears it (data-badge, answered through onBadge), which is the
// one-click fix when haste comes from somewhere the card data cannot see. The icon is our own plain turn arrow with a lock in the middle;
// the Magic tap symbol belongs to Wizards and is not used. The SVG has its width, height and fill set directly.
const SVG_NS = 'http://www.w3.org/2000/svg';
function lockIcon() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [name, value] of [['width', '18'], ['height', '18'], ['viewBox', '0 0 24 24'], ['fill', 'none'], ['aria-hidden', 'true'], ['focusable', 'false']]) svg.setAttribute(name, value);
  const part = (tag, attributes) => { const element = document.createElementNS(SVG_NS, tag); for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value); svg.append(element); };
  part('path', { d: 'M17.14 5.87A8 8 0 1 1 12 4', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', fill: 'none' }); // the arc
  part('path', { d: 'M11 0.9L11 7.1L15.4 4Z', fill: 'currentColor' }); // its arrowhead
  part('rect', { x: '9.2', y: '11.2', width: '5.6', height: '5', rx: '0.9', fill: 'currentColor' }); // the lock
  part('path', { d: 'M10.4 11.2V9.9a1.6 1.6 0 0 1 3.2 0V11.2', stroke: 'currentColor', 'stroke-width': '1.3', fill: 'none' }); // its shackle
  return svg;
}
function updateBadges(button, card, clickable) {
  const wantLock = card.noUntap === true;
  const wantSick = card.sick === true;
  let box = button.querySelector(':scope > .badges');
  if (!wantLock && !wantSick) { if (box) box.remove(); return; }
  if (!box) {
    box = make('span', 'badges');
    box.setAttribute('aria-hidden', 'true'); // the card's aria-label says the same in words
    button.append(box);
  }
  const badge = (className, kind, title, build) => {
    let element = box.querySelector(`:scope > .${className}`);
    if (!element) {
      element = make('span', `badge ${className}`);
      build(element);
      box.append(element);
    }
    element.title = clickable ? `${title} Click to clear it.` : title;
    if (clickable) element.dataset.badge = kind; else delete element.dataset.badge;
    return element;
  };
  const existing = (className) => box.querySelector(`:scope > .${className}`);
  if (wantLock) badge('badge-lock', 'nountap', "Doesn't untap: the untap step skips this card.", (element) => element.append(lockIcon())); else existing('badge-lock')?.remove();
  if (wantSick) badge('badge-sick', 'sick', 'Summoning sick: a reminder that it came in this turn, until your next turn starts.', (element) => { element.textContent = 'SICK'; }); else existing('badge-sick')?.remove();
}

// The floating text after a click on a mark (shared/marks.mjs says what it is). It rises and fades; with prefers-reduced-motion
// it stays still. Removed after a second, and a new one replaces the old.
function showToast(button, toast) {
  if (!toast) return;
  const old = button.querySelector(':scope > .toast');
  if (old) old.remove();
  const element = make('span', `toast toast-${toast.tone}`, toast.text);
  element.setAttribute('aria-hidden', 'true');
  button.append(element);
  setTimeout(() => element.remove(), 1000);
}

// The picture of the face that shows: the printing the deck named (else the card's default printing), or with `tried` the default
// one. A card turned over shows the back face's picture of the same printing (Scryfall keeps both under the one id).
// A card flipped face down shows the sleeve (the card back), whatever its faces are; otherwise the front, or the back face of a two-sided card turned over.
const sideShown = (card) => (card.faceDown === true ? 'sleeve' : card.turned === true ? 'back' : 'front');
const pictureAddress = (card, side, tried) => side === 'sleeve' ? cardBackUrl('small') : imageUrl(tried ? card.i : (card.p ?? card.i), 'small', side);

// Shows the face the card has now. A card button is built once and reused, so a turn changes the picture in place.
function showFace(button, card) {
  const picture = button.querySelector('img');
  const side = sideShown(card);
  button.classList.toggle('face-down', card.faceDown === true);
  if (!picture || picture.dataset.side === side) return;
  picture.dataset.side = side;
  picture.dataset.tried = '';
  picture.dataset.sharp = ''; // (the small picture again: the hand asks for the normal size when it needs it)
  button.classList.remove('noimage'); // the other face may have a picture even if this one had none
  picture.src = pictureAddress(card, side, false) ?? '';
}

export function makeCardNodes({ onSelect = () => {}, isSelected = () => false, readOnly = false, onMark = null, onMenu = null, onBadge = null, printedStats = () => null } = {}) {
  const nodes = new Map(); // uid -> its button

  function nodeFor(card, onBattlefield = false) {
    let button = nodes.get(card.uid);
    if (!button) {
      button = make('button', 'card');
      button.type = 'button';
      button.tabIndex = -1; // a card is not reached with Tab (Kevin, 2026-11-13: Tab opens Settings); it is clicked, dragged and right-clicked
      button.dataset.uid = card.uid;
      const face = make('span', 'face');
      const side = sideShown(card);
      const url = pictureAddress(card, side, false);
      if (url) {
        const picture = document.createElement('img');
        picture.alt = '';
        picture.width = 146;
        picture.height = 204;
        picture.loading = 'lazy';
        picture.decoding = 'async';
        picture.referrerPolicy = 'no-referrer';
        picture.dataset.side = side;
        picture.addEventListener('error', () => {
          // The printing has no picture (or a damaged id): try the card's default picture once, then show the name.
          let fallback = card.p && !picture.dataset.tried ? pictureAddress(card, picture.dataset.side, true) : null;
          if (fallback && picture.dataset.sharp === '1') fallback = fallback.replace('/small/', '/normal/'); // (a card of the hand stays sharp)
          picture.dataset.tried = '1';
          if (fallback) { picture.src = fallback; return; }
          button.classList.add('noimage');
        });
        picture.src = url;
        face.append(picture);
      } else {
        button.classList.add('noimage');
      }
      face.append(make('span', 'fallback', card.n));
      button.append(face);
      if (readOnly) {
        button.disabled = true;
      } else {
        // A click on a chip or on the change label is a counter change; anywhere else on the card it selects the card.
        const markHit = (event) => {
          const target = onMark && event.target instanceof Element ? event.target.closest('[data-mark]') : null;
          return target && button.contains(target) ? { mark: target.dataset.mark, kind: target.dataset.kind, big: event.shiftKey } : null;
        };
        // A click on a state badge (SICK, the lock) clears it: onBadge(uid, 'sick' | 'nountap').
        const badgeHit = (event) => {
          const target = onBadge && event.target instanceof Element ? event.target.closest('[data-badge]') : null;
          return target && button.contains(target) ? target.dataset.badge : null;
        };
        button.addEventListener('click', (event) => {
          const hit = markHit(event);
          const badge = badgeHit(event);
          if (hit) { event.stopPropagation(); if (onMark(card.uid, hit) !== false) showToast(button, markToast(hit)); }
          else if (badge) { event.stopPropagation(); onBadge(card.uid, badge); }
          else onSelect(card.uid);
        });
        button.addEventListener('contextmenu', (event) => {
          const hit = markHit(event);
          if (hit) { event.preventDefault(); const removal = { ...hit, remove: true }; if (onMark(card.uid, removal) !== false) showToast(button, markToast(removal)); return; }
          if (!onMenu) return; // no menu: the browser's own menu stays
          event.preventDefault();
          const box = button.getBoundingClientRect();
          const fromKeyboard = event.clientX === 0 && event.clientY === 0; // the Menu key or Shift+F10 gives no pointer position
          onMenu(card.uid, { x: fromKeyboard ? box.left + box.width / 2 : event.clientX, y: fromKeyboard ? box.top + box.height / 2 : event.clientY, element: button });
        });
      }
      nodes.set(card.uid, button);
    }
    const selected = !readOnly && isSelected(card.uid);
    button.classList.toggle('tapped', card.tapped);
    // a tapped card is greyed (the style sheet) and has the tap symbol in the middle of it; in a pile of tapped cards only the top one shows it (the style sheet hides the others')
    const tapMark = button.querySelector(':scope > .tap-mark');
    if (card.tapped && !tapMark) { const mark = manaIcon('tap', { className: 'tap-mark' }); if (mark) button.append(mark); } else if (!card.tapped) tapMark?.remove();
    button.classList.toggle('selected', selected);
    if (!readOnly) button.setAttribute('aria-pressed', String(selected));
    showFace(button, card);
    const printed = printedStats(card);
    const marks = marksSentence(card, printed);
    button.setAttribute('aria-label', `${card.n}${card.faceDown ? ', face down' : ''}${card.turned && !card.tok ? ', turned over' : ''}${card.tapped ? ', tapped' : ''}${card.noUntap ? ", doesn't untap" : ''}${card.sick ? ', summoning sick' : ''}${marks ? `. ${marks}` : ''}`);
    updateBadges(button, card, Boolean(onBadge) && !readOnly);
    updateMarks(button, card, Boolean(onMark) && !readOnly, printed, onBattlefield);
    return button;
  }

  return {
    nodeFor,
    // Shows the floating text (see markToast in shared/marks.mjs) on a card, for a change made some other way than clicking its numbers.
    flash: (uid, toast) => { const button = nodes.get(uid); if (button) showToast(button, toast); },
    // battlefield: true for the battlefield grid; only there does your own creature offer its power and toughness box, and each card is put on its cell (cells: a Map from uid to
    // { col, row }, shared/zones.mjs boardCells) with data-col and data-row, which the style sheet turns into a place in the grid; data-kind says land or other (the checks use it).
    // Cards with the same name and state on one cell are a pile (shared/stacks.mjs): the top one carries the count (a "3x" badge), up to STACK_VISIBLE copies are drawn each a little lower and to the right of
    // the one above it (data-stack-depth, the style sheet offsets them), and the rest are hidden. Every card is still its own button.
    place: (container, cards, { battlefield = false, cells = null } = {}) => {
      const stacks = battlefield && cells ? stackInfo(cards, cells) : null;
      container.replaceChildren(...cards.map((card) => {
        const button = nodeFor(card, battlefield);
        const cell = battlefield ? cells?.get(card.uid) : null;
        if (cell) { button.dataset.col = String(cell.col); button.dataset.row = String(cell.row); } else { delete button.dataset.col; delete button.dataset.row; }
        if (battlefield) button.dataset.kind = isLandCard(card) ? 'land' : 'other'; else delete button.dataset.kind;
        const stack = stacks?.get(card.uid);
        const count = button.querySelector(':scope > .stack-count');
        if (stack && stack.size > 1) {
          button.dataset.stackSize = String(stack.size);
          button.dataset.stackDepth = String(stack.depth);
          if (stack.depth >= STACK_VISIBLE) button.dataset.stackHidden = '1'; else delete button.dataset.stackHidden;
          if (stack.depth === 0) button.dataset.stackExt = String(Math.min(stack.size, STACK_VISIBLE) - 1); else delete button.dataset.stackExt;
          if (stack.depth === 0) {
            const badge = count ?? make('span', 'stack-count');
            badge.textContent = `${stack.size}x`;
            badge.setAttribute('aria-hidden', 'true');
            if (!count) button.append(badge);
            button.setAttribute('aria-label', `${button.getAttribute('aria-label')}, top of a stack of ${stack.size}`);
          } else { count?.remove(); }
        } else {
          delete button.dataset.stackSize; delete button.dataset.stackDepth; delete button.dataset.stackHidden; delete button.dataset.stackExt;
          count?.remove();
        }
        return button;
      }));
    },
    clear: () => nodes.clear(),
  };
}
