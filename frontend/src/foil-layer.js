// Drawing a foil (Kevin, 2026-11-18). The look of a foil is the value of `data-foil` on an element (one of the looks in shared/foil-looks.mjs); the style sheet does the rest.
// A small card (battlefield, hand, deck tiles) gets a light sheen from its own `.foil` class. The big picture (Alt over a card, the details window) gets a FOIL LAYER: a box laid over the
// picture. Foil never moves because of the pointer (Kevin, 2026-11-18): the layer holds still.
import { ensureFoilTextures } from './foil-textures.js';

export const setFoilLook = (element, group) => {
  if (!element) return;
  if (group) { element.dataset.foil = group; ensureFoilTextures(group); }
  else delete element.dataset.foil;
};

// A layer to put over a picture (a span, sized and placed by the caller). Empty when there is no look.
export function makeFoilLayer(group) {
  const layer = document.createElement('span');
  layer.className = 'foil-full';
  layer.setAttribute('aria-hidden', 'true');
  setFoilLook(layer, group);
  return layer;
}

// Some foils shine only where the card is light (oil-slick and neon ink are on the linework): their layer uses the card's own picture as a brightness mask. The style sheet reads the address from --f-src.
// Scryfall allows its pictures to be used this way (Access-Control-Allow-Origin: *, checked 2026-11-18).
export function setFoilSource(element, url) {
  if (!element || typeof url !== 'string' || !url.startsWith('https://cards.scryfall.io/')) return;
  element.style.setProperty('--f-src', `url("${url}")`);
}
