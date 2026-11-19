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

// Lets the shine of a layer drift on its own, for a big picture the pointer is not over (the picture beside the deck list). Returns stop(). With reduced motion the shine stays still.
export function driftFoil(layer, win = window) {
  if (!layer || win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {};
  let frame = 0;
  const started = win.performance.now();
  const step = (now) => {
    const t = (now - started) / 1000;
    layer.style.setProperty('--mx', `${(50 + 32 * Math.sin(t * 0.9)).toFixed(1)}%`);
    layer.style.setProperty('--my', `${(40 + 28 * Math.cos(t * 0.65)).toFixed(1)}%`);
    frame = win.requestAnimationFrame(step);
  };
  frame = win.requestAnimationFrame(step);
  return () => win.cancelAnimationFrame(frame);
}
