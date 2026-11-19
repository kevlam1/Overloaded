// The card display beside a deck, in every view (the text list, the pictures and the stacks). It shows the card the pointer is on; a click keeps a card there, and when the pointer is on blank space (or leaves the stacks) it
// goes back to the card last clicked. Until something is clicked it shows the deck's default card (the commander). Nothing is highlighted in the stacks.
// A row or a tile carries data-preview-id (the Scryfall id of the picture to show), data-card-name and, for a card with a back face, data-two-sided (src/deck-groups.js).
// A card with a back face shows the back too, smaller, under the front. Plain DOM, no dependencies.
import { imageUrl } from '../../shared/card-image.mjs';
import { makeFoilLayer, setFoilLook, driftFoil } from './foil-layer.js';

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
  const back = document.createElement('img');
  back.className = 'stack-preview-image stack-preview-back';
  back.width = 488;
  back.height = 680;
  back.decoding = 'async';
  back.referrerPolicy = 'no-referrer';
  back.alt = '';
  back.hidden = true;
  const name = document.createElement('p');
  name.className = 'stack-preview-name';
  aside.append(picture, name, back);
  // A foil card shows its foil over the front picture, with a shine that drifts (a row or tile says which foil with data-foil).
  const shine = makeFoilLayer(null);
  shine.hidden = true;
  aside.append(shine);
  let stopDrift = () => {};
  const fitShine = () => {
    if (shine.hidden) return;
    shine.style.position = 'absolute';
    shine.style.left = `${picture.offsetLeft}px`;
    shine.style.top = `${picture.offsetTop}px`;
    shine.style.width = `${picture.offsetWidth}px`;
    shine.style.height = `${picture.offsetHeight}px`;
  };

  let selected = null; // the card last clicked, or the default
  let shown = null;
  let active = false; // only the stacks view has the display, and a picture is asked for only while it is shown
  const tileOf = (target) => (target instanceof Element ? target.closest('[data-preview-id]') : null);
  const read = (tile) => ({ id: tile.dataset.previewId, name: tile.dataset.cardName ?? '', twoSided: tile.dataset.twoSided === '1', foil: tile.dataset.foil ?? null });

  function show(card) {
    if (!active) return;
    if (card?.id === shown?.id && card?.name === shown?.name && (card?.foil ?? null) === (shown?.foil ?? null)) return;
    shown = card;
    const url = card ? imageUrl(card.id, 'normal') : null;
    picture.hidden = !url;
    name.textContent = card ? card.name : '';
    stopDrift();
    setFoilLook(shine, card?.foil ?? null);
    shine.hidden = !url || !card?.foil;
    if (!shine.hidden) { stopDrift = driftFoil(shine); fitShine(); }
    if (url) { picture.alt = card.name; picture.src = url; }
    else picture.removeAttribute('src');
    const backUrl = url && card.twoSided ? imageUrl(card.id, 'normal', 'back') : null;
    back.hidden = !backUrl;
    if (backUrl) { back.alt = `${card.name} (back)`; back.src = backUrl; }
    else back.removeAttribute('src');
  }
  picture.addEventListener('load', fitShine);
  picture.addEventListener('error', () => { picture.hidden = true; shine.hidden = true; stopDrift(); }); // the name line stays
  back.addEventListener('error', () => { back.hidden = true; }); // a back picture that does not exist: the front alone

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
    if (tile && (event.target === tile || (event.target instanceof Element && event.target.classList.contains('name'))) && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); choose(tile); }
  });

  return {
    refresh(defaultCard, isActive) {
      active = Boolean(isActive);
      if (!active) { shown = null; stopDrift(); shine.hidden = true; picture.removeAttribute('src'); return; }
      const keptTile = selected && [...sections.querySelectorAll('[data-preview-id]')].find((tile) => tile.dataset.previewId === selected.id);
      selected = keptTile ? read(keptTile) : (defaultCard ?? null); // (read again, so a card made foil or not foil shows it)
      show(selected);
    },
  };
}
