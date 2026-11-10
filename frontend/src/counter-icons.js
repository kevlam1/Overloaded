// Small icons for the counters a player can have, drawn as inline SVG (24 by 24, one colour, so they follow the page's text colour in light and dark mode).
// Width, height and fill are set directly on every icon (a rule of this project: an inline SVG that depends only on a style sheet can come out invisible).
// They are plain shapes made for this site, not any publisher's symbols.
const SVG_NS = 'http://www.w3.org/2000/svg';

const PATHS = {
  poison: 'M12 2C12 2 5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13z', // a drop
  energy: 'M13 2L4 14h6l-1 8 9-12h-6z', // a bolt
  experience: 'M12 2l3 7 7 .6-5.3 4.7 1.6 7.2L12 17.8 5.7 21.5l1.6-7.2L2 9.6 9 9z', // a star
  rad: 'M12 12L7.5 4.2A9 9 0 0 1 16.5 4.2Z M12 12L21 12A9 9 0 0 1 16.5 19.8Z M12 12L7.5 19.8A9 9 0 0 1 3 12Z', // three wedges
  ticket: 'M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z',
  speed: 'M4 5l8 7-8 7z M12 5l8 7-8 7z', // two chevrons
  ring: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4a5 5 0 1 1 0 10 5 5 0 0 1 0-10z',
  monarch: 'M3 18h18v2H3zM3 7l5 5 4-7 4 7 5-5-2 10H5z', // a crown
  initiative: 'M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z', // a shield
  blessing: 'M3 22V12h5V4h5v18h2V9h6v13z', // a city skyline
  damage: 'M19 3l2 2-9.5 9.5-1.5-1.5zM9 14l1 1-4 4-1.5-.5-.5-1.5z', // a sword
};

export const ICON_KINDS = Object.keys(PATHS);

// The icon for a counter kind (or 'damage' for commander damage) as an SVG element, or null for a kind that has none. size is in pixels.
export function counterIcon(kind, size = 16) {
  const d = PATHS[kind];
  if (!d) return null;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('fill-rule', 'evenodd');
  svg.append(path);
  return svg;
}
