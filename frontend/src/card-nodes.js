// The card buttons of a table page (the solo table and the live table draw cards the same way). A card is a button with its
// picture from Scryfall's picture server (shared/card-image.mjs) and its name as the fallback; the same card keeps the same
// button when it moves, so its picture is not loaded again. Names go in as text, never as markup.
// onSelect(uid) is called when a card is clicked; isSelected(uid) says whether it is the selected one; `readOnly` makes the
// buttons do nothing (another player's cards: you look, you do not touch).
import { imageUrl } from '../../shared/card-image.mjs';
import { changeLabel, counterChips, marksSentence } from '../../shared/marks.mjs';

function make(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

// Counter chips and the power/toughness change, drawn over the bottom of the card (nothing when the card has neither).
function updateMarks(button, card) {
  const chips = counterChips(card);
  const change = changeLabel(card);
  let box = button.querySelector(':scope > .marks');
  if (!chips.length && !change) { if (box) box.remove(); return; }
  if (!box) {
    box = make('span', 'marks');
    box.setAttribute('aria-hidden', 'true'); // the card's aria-label says the same in words
    button.append(box);
  }
  box.replaceChildren(...chips.map((chip) => make('span', `chip chip-${chip.kind}`, chip.text)), ...(change ? [make('span', 'change', change)] : []));
  box.title = marksSentence(card);
}

export function makeCardNodes({ onSelect = () => {}, isSelected = () => false, readOnly = false } = {}) {
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
      if (readOnly) button.disabled = true; else button.addEventListener('click', () => onSelect(card.uid));
      nodes.set(card.uid, button);
    }
    const selected = !readOnly && isSelected(card.uid);
    button.classList.toggle('tapped', card.tapped);
    button.classList.toggle('selected', selected);
    if (!readOnly) button.setAttribute('aria-pressed', String(selected));
    const marks = marksSentence(card);
    button.setAttribute('aria-label', `${card.n}${card.tapped ? ', tapped' : ''}${marks ? `. ${marks}` : ''}`);
    updateMarks(button, card);
    return button;
  }

  return {
    nodeFor,
    place: (container, cards) => container.replaceChildren(...cards.map(nodeFor)),
    clear: () => nodes.clear(),
  };
}
