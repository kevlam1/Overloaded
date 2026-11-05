// The card buttons of a table page (the solo table and the live table draw cards the same way). A card is a button with its
// picture from Scryfall's picture server (shared/card-image.mjs) and its name as the fallback; the same card keeps the same
// button when it moves, so its picture is not loaded again. Names go in as text, never as markup.
// onSelect(uid) is called when a card is clicked; isSelected(uid) says whether it is the selected one; `readOnly` makes the
// buttons do nothing (another player's cards: you look, you do not touch). onMark(uid, hit) is called for a click on a counter or on
// the power/toughness numbers and returns false when the change was refused; printedStats(card) gives a card's printed power and
// toughness as text ("2/2") or null.
import { imageUrl } from '../../shared/card-image.mjs';
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
      piece('pt both', '', 'both'),
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

export function makeCardNodes({ onSelect = () => {}, isSelected = () => false, readOnly = false, onMark = null, printedStats = () => null } = {}) {
  const nodes = new Map(); // uid -> its button

  function nodeFor(card, onBattlefield = false) {
    let button = nodes.get(card.uid);
    if (!button) {
      button = make('button', 'card');
      button.type = 'button';
      button.dataset.uid = card.uid;
      const face = make('span', 'face');
      const url = imageUrl(card.p ?? card.i); // the printing the deck named, else the card's default printing
      if (url) {
        const picture = document.createElement('img');
        picture.alt = '';
        picture.width = 146;
        picture.height = 204;
        picture.loading = 'lazy';
        picture.decoding = 'async';
        picture.referrerPolicy = 'no-referrer';
        let triedDefault = false;
        picture.addEventListener('error', () => {
          // The printing has no picture (or a damaged id): try the card's default picture once, then show the name.
          const fallback = card.p && !triedDefault ? imageUrl(card.i) : null;
          triedDefault = true;
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
        button.addEventListener('click', (event) => {
          const hit = markHit(event);
          if (hit) { event.stopPropagation(); if (onMark(card.uid, hit) !== false) showToast(button, markToast(hit)); } else onSelect(card.uid);
        });
        button.addEventListener('contextmenu', (event) => {
          const hit = markHit(event);
          if (hit) { event.preventDefault(); const removal = { ...hit, remove: true }; if (onMark(card.uid, removal) !== false) showToast(button, markToast(removal)); }
        });
      }
      nodes.set(card.uid, button);
    }
    const selected = !readOnly && isSelected(card.uid);
    button.classList.toggle('tapped', card.tapped);
    button.classList.toggle('selected', selected);
    if (!readOnly) button.setAttribute('aria-pressed', String(selected));
    const printed = printedStats(card);
    const marks = marksSentence(card, printed);
    button.setAttribute('aria-label', `${card.n}${card.tapped ? ', tapped' : ''}${marks ? `. ${marks}` : ''}`);
    updateMarks(button, card, Boolean(onMark) && !readOnly, printed, onBattlefield);
    return button;
  }

  return {
    nodeFor,
    // battlefield: true for the rows of permanents; only there does your own creature offer its power and toughness box.
    place: (container, cards, { battlefield = false } = {}) => container.replaceChildren(...cards.map((card) => nodeFor(card, battlefield))),
    clear: () => nodes.clear(),
  };
}
