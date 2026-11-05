// The card buttons of a table page (the solo table and the live table draw cards the same way). A card is a button with its
// picture from Scryfall's picture server (shared/card-image.mjs) and its name as the fallback; the same card keeps the same
// button when it moves, so its picture is not loaded again. Names go in as text, never as markup.
// onSelect(uid) is called when a card is clicked; isSelected(uid) says whether it is the selected one; `readOnly` makes the
// buttons do nothing (another player's cards: you look, you do not touch).
import { imageUrl } from '../../shared/card-image.mjs';
import { changeParts, counterChips, marksSentence } from '../../shared/marks.mjs';

function make(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

// Counter chips and the power/toughness change, drawn over the bottom of the card (nothing when the card has neither). Each
// chip and each piece of the change (power, the "/", toughness) carries data-mark so a click on it can be told from a click on
// the card; the marks answer clicks only when the table gave an onMark (your own cards).
const MARK_HELP = ' Click a counter or number to add 1, right-click to take 1 off, hold Shift for 10; the "/" changes both numbers.';
function updateMarks(button, card, interactive) {
  const chips = counterChips(card);
  const parts = changeParts(card);
  let box = button.querySelector(':scope > .marks');
  if (!chips.length && !parts) { if (box) box.remove(); return; }
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
  const nodes = chips.map((chip) => piece(`chip chip-${chip.kind}`, chip.text, 'chip', chip.kind));
  if (parts) {
    const change = make('span', 'change');
    change.append(piece('power', parts.power, 'power'), piece('both', '/', 'both'), piece('toughness', parts.toughness, 'toughness'));
    nodes.push(change);
  }
  box.classList.toggle('live', interactive);
  box.replaceChildren(...nodes);
  box.title = marksSentence(card) + (interactive ? MARK_HELP : '');
}

export function makeCardNodes({ onSelect = () => {}, isSelected = () => false, readOnly = false, onMark = null } = {}) {
  const nodes = new Map(); // uid -> its button

  function nodeFor(card) {
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
          if (hit) { event.stopPropagation(); onMark(card.uid, hit); } else onSelect(card.uid);
        });
        button.addEventListener('contextmenu', (event) => {
          const hit = markHit(event);
          if (hit) { event.preventDefault(); onMark(card.uid, { ...hit, remove: true }); }
        });
      }
      nodes.set(card.uid, button);
    }
    const selected = !readOnly && isSelected(card.uid);
    button.classList.toggle('tapped', card.tapped);
    button.classList.toggle('selected', selected);
    if (!readOnly) button.setAttribute('aria-pressed', String(selected));
    const marks = marksSentence(card);
    button.setAttribute('aria-label', `${card.n}${card.tapped ? ', tapped' : ''}${marks ? `. ${marks}` : ''}`);
    updateMarks(button, card, Boolean(onMark) && !readOnly);
    return button;
  }

  return {
    nodeFor,
    place: (container, cards) => container.replaceChildren(...cards.map(nodeFor)),
    clear: () => nodes.clear(),
  };
}
