// Drawing a foil (Kevin, 2026-11-18). The look of a foil is the value of `data-foil` on an element (traditional or etched, see shared/foil-looks.mjs); the style sheet does the rest.
// A small card (battlefield, hand, deck tiles) gets a light sheen from its own `.foil` class. The big picture (Alt over a card, the details window) gets a FOIL LAYER: a box laid over the
// picture. Foil never moves because of the pointer (Kevin, 2026-11-18): the layer holds still.
export const setFoilLook = (element, group) => {
  if (!element) return;
  if (group) element.dataset.foil = group;
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
