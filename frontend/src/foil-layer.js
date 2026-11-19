// Drawing a foil (Kevin, 2026-11-18). The look of a foil is the value of `data-foil` on an element (one of the 8 in shared/foil-looks.mjs); the style sheet does the rest.
// A small card (battlefield, hand, deck tiles) gets a light sheen from its own `.foil` class. The big picture (Alt over a card, the details window) gets a FOIL LAYER: a box laid over the
// picture whose shine follows the pointer, through the variables --mx and --my (percent of the picture).
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
  layer.style.setProperty('--mx', '50%');
  layer.style.setProperty('--my', '35%');
  setFoilLook(layer, group);
  return layer;
}

// Moves the shine to where a pointer is over `rect` (the picture's or the small card's box on the page); the pointer outside the box is held at its edge.
export function aimFoil(layer, rect, clientX, clientY) {
  if (!layer || !rect || !(rect.width > 0) || !(rect.height > 0)) return;
  const share = (value, start, size) => Math.round(Math.min(1, Math.max(0, (value - start) / size)) * 1000) / 10;
  layer.style.setProperty('--mx', `${share(clientX, rect.left, rect.width)}%`);
  layer.style.setProperty('--my', `${share(clientY, rect.top, rect.height)}%`);
}
