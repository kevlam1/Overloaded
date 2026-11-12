// Where the floating action bar sits (Kevin, 2026-11-12; the idea is the control bar of MIDI Companion): you drag it by its grip and it stays where you leave it, snapping flush to an edge or to the
// middle of one when you let go close to it. Plain numbers, no browser code, so Node can test it (scripts/test-bar-place.mjs). The place is kept as two FRACTIONS of the room the bar has to move in
// (0 is the left or top edge, 1 the right or bottom edge), not as pixels, so it is in the same place on a window of another size.
export const MARGIN = 8; // px between the bar and an edge of the window
export const SNAP_EDGE = 12; // px from an edge within which letting go snaps the bar flush to it
export const SNAP_CENTER = 16; // px either side of the middle within which letting go snaps to the middle
export const DEFAULT_PLACE = { fx: 0.5, fy: 0 }; // the middle of the top

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const round4 = (value) => Math.round(value * 10000) / 10000;

// The stored text read back into a place, or null when it is not one (damaged, from another version, hand edited): both numbers must be finite and from 0 to 1.
export function readPlace(text) {
  if (typeof text !== 'string') return null;
  let data;
  try { data = JSON.parse(text); } catch { return null; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const { fx, fy } = data;
  if (typeof fx !== 'number' || typeof fy !== 'number' || !Number.isFinite(fx) || !Number.isFinite(fy) || fx < 0 || fx > 1 || fy < 0 || fy > 1) return null;
  return { fx: round4(fx), fy: round4(fy) };
}
export const writePlace = (place) => JSON.stringify({ fx: round4(place.fx), fy: round4(place.fy) });

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

// Where the bar lands when let go with its top left corner at `pixels`: flush to an edge when within SNAP_EDGE of it, to the middle of the window when its middle is within SNAP_CENTER of it.
export function snap(pixels, size, { edge = SNAP_EDGE, center = SNAP_CENTER } = {}) {
  const r = room(size);
  let left = clamp(pixels.left, r.margin, r.margin + r.width);
  let top = clamp(pixels.top, r.margin, r.margin + r.height);
  if (left - r.margin <= edge) left = r.margin;
  else if (r.margin + r.width - left <= edge) left = r.margin + r.width;
  else if (Math.abs(left + size.barWidth / 2 - size.width / 2) <= center) left = Math.round(size.width / 2 - size.barWidth / 2);
  if (top - r.margin <= edge) top = r.margin;
  else if (r.margin + r.height - top <= edge) top = r.margin + r.height;
  else if (Math.abs(top + size.barHeight / 2 - size.height / 2) <= center) top = Math.round(size.height / 2 - size.barHeight / 2);
  return { left, top };
}

// Move by a number of pixels (the arrow keys on the grip), staying inside the room.
export function nudge(pixels, size, dx, dy) {
  const r = room(size);
  return { left: clamp(pixels.left + dx, r.margin, r.margin + r.width), top: clamp(pixels.top + dy, r.margin, r.margin + r.height) };
}
