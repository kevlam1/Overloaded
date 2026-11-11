// The card display beside the stacks view of a deck. It shows the card the pointer is on; a click keeps a card there, and when the pointer is on blank space (or leaves the stacks) it
// goes back to the card last clicked. Until something is clicked it shows the deck's default card (the commander). Nothing is highlighted in the stacks.
// The tiles carry data-preview-id (the Scryfall id of the picture to show) and data-card-name (src/deck-groups.js). Plain DOM, no dependencies.
import { imageUrl } from '../../shared/card-image.mjs';

// aside: the box that holds the picture (an <img> and a name line are made in it). sections: the element that holds the tiles.
// Returns { refresh(defaultCard, active) }, to call after the tiles were drawn again; a card is { id, name }. active: whether the stacks view is the one showing.
export function mountStackPreview({ aside, sections }) {
  const picture = document.createElement('img');
  picture.className = 'stack-preview-image';
  picture.width = 488;
  picture.height = 680;
  picture.decoding = 'async';
  picture.referrerPolicy = 'no-referrer';
  picture.alt = '';
  const name = document.createElement('p');
  name.className = 'stack-preview-name';
  aside.append(picture, name);

  let selected = null; // the card last clicked, or the default
  let shown = null;
  let active = false; // only the stacks view has the display, and a picture is asked for only while it is shown
  const tileOf = (target) => (target instanceof Element ? target.closest('.deck-tile[data-preview-id]') : null);
  const read = (tile) => ({ id: tile.dataset.previewId, name: tile.dataset.cardName ?? '' });

  function show(card) {
    if (!active) return;
    if (card?.id === shown?.id && card?.name === shown?.name) return;
    shown = card;
    const url = card ? imageUrl(card.id, 'normal') : null;
    picture.hidden = !url;
    name.textContent = card ? card.name : '';
    if (url) { picture.alt = card.name; picture.src = url; }
    else picture.removeAttribute('src');
  }
  picture.addEventListener('error', () => { picture.hidden = true; }); // the name line stays

  sections.addEventListener('pointerover', (event) => { const tile = tileOf(event.target); show(tile ? read(tile) : selected); });
  sections.addEventListener('pointerleave', () => show(selected));
  sections.addEventListener('focusin', (event) => { const tile = tileOf(event.target); if (tile) show(read(tile)); });
  sections.addEventListener('focusout', () => show(selected));
  const choose = (tile) => { selected = read(tile); show(selected); };
  sections.addEventListener('click', (event) => {
    const tile = tileOf(event.target);
    if (tile && !(event.target instanceof Element && event.target.closest('.row-menu'))) choose(tile);
  });
  sections.addEventListener('keydown', (event) => {
    const tile = tileOf(event.target);
    if (tile && event.target === tile && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); choose(tile); }
  });

  return {
    refresh(defaultCard, isActive) {
      active = Boolean(isActive);
      if (!active) { shown = null; picture.removeAttribute('src'); return; }
      const kept = selected && [...sections.querySelectorAll('.deck-tile[data-preview-id]')].some((tile) => tile.dataset.previewId === selected.id);
      if (!kept) selected = defaultCard ?? null;
      show(selected);
    },
  };
}
