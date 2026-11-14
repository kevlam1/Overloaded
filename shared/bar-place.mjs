// Where the floating action bar sits (Kevin, 2026-11-12; 2026-11-14 it was made to work like the control bar of MIDI Companion): you drag it by its grip and it stays where you leave it. Let go within
// SNAP_DISTANCE of an edge of the window and it docks to that edge (top, bottom, left or right), keeping its place along the edge; within CENTER_DISTANCE of the middle of the edge it goes exactly to the
// middle; within CORNER_DISTANCE of two edges it goes into the corner. Docked to the left or the right it turns into a column (isVertical). Plain numbers, no browser code, so Node can test it
// (scripts/test-bar-place.mjs). The place is kept as two FRACTIONS of the room the bar has to move in (0 is the left or top edge, 1 the right or bottom edge), not as pixels, so it is in the same place on a
// window of another size, and the edge it is docked to (or null: it is free).
export const MARGIN = 8; // px between the bar and an edge of the window
export const SNAP_DISTANCE = 10; // px from an edge within which letting go docks the bar to it
export const CENTER_DISTANCE = 15; // px either side of the middle of an edge within which letting go docks to the middle
export const CORNER_DISTANCE = 20; // px from both edges of a corner within which letting go docks into the corner
export const DOCKS = ['top', 'bottom', 'left', 'right'];
export const DEFAULT_PLACE = { dock: 'top', fx: 0.5, fy: 0 }; // docked to the middle of the top

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const round4 = (value) => Math.round(value * 10000) / 10000;

// The stored text read back into a place, or null when it is not one (damaged, from another version, hand edited): both numbers must be finite and from 0 to 1.
export function readPlace(text) {
  if (typeof text !== 'string') return null;
  let data;
  try { data = JSON.parse(text); } catch { return null; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const { fx, fy, dock } = data;
  if (typeof fx !== 'number' || typeof fy !== 'number' || !Number.isFinite(fx) || !Number.isFinite(fy) || fx < 0 || fx > 1 || fy < 0 || fy > 1) return null;
  return { dock: DOCKS.includes(dock) ? dock : null, fx: round4(fx), fy: round4(fy) }; // (a place stored before the docks has none: the bar is free where it was)
}
export const writePlace = (place) => JSON.stringify({ dock: DOCKS.includes(place.dock) ? place.dock : null, fx: round4(place.fx), fy: round4(place.fy) });

// The room the top left corner of the bar can move in: from the margin to (the window minus the bar minus the margin). Never negative: a bar wider than the window sits at the margin.
export function room({ width, height, barWidth, barHeight, margin = MARGIN }) {
  return { width: Math.max(0, width - barWidth - 2 * margin), height: Math.max(0, height - barHeight - 2 * margin), margin };
}

export function placeToPixels(place, size) {
  const r = room(size);
  return { left: Math.round(r.margin + clamp(place.fx, 0, 1) * r.width), top: Math.round(r.margin + clamp(place.fy, 0, 1) * r.height) };
}

export function pixelsToPlace(pixels, size) {
  const r = room(size);
  return { fx: r.width > 0 ? round4(clamp((pixels.left - r.margin) / r.width, 0, 1)) : 0.5, fy: r.height > 0 ? round4(clamp((pixels.top - r.margin) / r.height, 0, 1)) : 0 };
}

// A column on the left and right edges, a row everywhere else.
export const isVertical = (place) => place?.dock === 'left' || place?.dock === 'right';

// Where a place really is, as fractions: a docked bar is pressed against its edge and keeps its place along it.
export function anchored(place) {
  switch (place?.dock) {
    case 'top': return { fx: place.fx, fy: 0 };
    case 'bottom': return { fx: place.fx, fy: 1 };
    case 'left': return { fx: 0, fy: place.fy };
    case 'right': return { fx: 1, fy: place.fy };
    default: return { fx: place?.fx ?? 0.5, fy: place?.fy ?? 0 };
  }
}

// 0 if the bar is within CORNER_DISTANCE of the start of an axis, 1 if of the end, null if of neither (start and end are the pixels left on each side).
function nearEnd(start, end) {
  if (start <= end) return start <= CORNER_DISTANCE ? 0 : null;
  return end <= CORNER_DISTANCE ? 1 : null;
}

// The edge the bar would dock to if it were let go now at { fx, fy }, or null: the nearest edge within SNAP_DISTANCE. A row prefers the top and the bottom, a column the sides (vertical: the bar is a column now).
export function nearestDock({ fx, fy }, size, vertical = false) {
  const r = room(size);
  const away = { top: fy * r.height, bottom: (1 - fy) * r.height, left: fx * r.width, right: (1 - fx) * r.width };
  const order = vertical ? ['left', 'right', 'top', 'bottom'] : ['top', 'bottom', 'left', 'right'];
  let best = null;
  for (const edge of order) if (away[edge] <= SNAP_DISTANCE && (best === null || away[edge] < away[best])) best = edge;
  return best;
}

// What letting go at { fx, fy } would do, or null when the bar is not near an edge (then it just stays where it is). Near a corner it goes into the corner. Near an edge it docks to it, to the middle of
// it when that is close, and otherwise keeps its place along the edge. Returns { edge, fx, fy, corner } with corner null or { x: 0 | 1, y: 0 | 1 }.
export function dockPlan({ fx, fy }, size, vertical = false) {
  const r = room(size);
  const cornerX = nearEnd(fx * r.width, (1 - fx) * r.width);
  const cornerY = nearEnd(fy * r.height, (1 - fy) * r.height);
  if (cornerX !== null && cornerY !== null) {
    const edge = vertical ? (cornerX === 0 ? 'left' : 'right') : (cornerY === 0 ? 'top' : 'bottom');
    return { edge, fx: cornerX, fy: cornerY, corner: { x: cornerX, y: cornerY } };
  }
  const edge = nearestDock({ fx, fy }, size, vertical);
  if (edge === null) return null;
  const middle = (along, span) => (Math.abs(along - 0.5) * span <= CENTER_DISTANCE ? 0.5 : along);
  return edge === 'top' || edge === 'bottom' ? { edge, fx: middle(fx, r.width), fy, corner: null } : { edge, fx, fy: middle(fy, r.height), corner: null };
}

// Move by a number of pixels (the arrow keys on the grip), staying inside the room.
export function nudge(pixels, size, dx, dy) {
  const r = room(size);
  return { left: clamp(pixels.left + dx, r.margin, r.margin + r.width), top: clamp(pixels.top + dy, r.margin, r.margin + r.height) };
}
