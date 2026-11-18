// Where the arrows of the stack window go (Kevin, 2026-11-17): plain geometry with no browser code, so Node can test it (scripts/test-arrow-geometry.mjs). A rect is { left, top, right, bottom } in pixels,
// like the browser's getBoundingClientRect. frontend/src/stack-window.js measures the cards, asks for a path here and gives it to an SVG path.
export const GAP = 4; // pixels between the tip of an arrow and the edge of the card it points at
export const BULGE = 56; // how far an arrow between two cards of the stack swings out to the right

const round = (n) => Math.round(n * 10) / 10;
const isRect = (r) => Boolean(r) && [r.left, r.top, r.right, r.bottom].every(Number.isFinite) && r.right >= r.left && r.bottom >= r.top;
const midY = (r) => (r.top + r.bottom) / 2;
const midX = (r) => (r.left + r.right) / 2;

// The point on the edge of `rect` that is on the line from its centre toward the point `from`, moved GAP pixels further out (so an arrowhead does not touch the card). A point inside the rect, or at its
// centre, gives the centre.
export function edgePoint(rect, from, gap = GAP) {
  const cx = midX(rect);
  const cy = midY(rect);
  const dx = from.x - cx;
  const dy = from.y - cy;
  const length = Math.hypot(dx, dy);
  if (length === 0) return { x: round(cx), y: round(cy) };
  const halfW = (rect.right - rect.left) / 2;
  const halfH = (rect.bottom - rect.top) / 2;
  const tx = dx === 0 ? Infinity : halfW / Math.abs(dx);
  const ty = dy === 0 ? Infinity : halfH / Math.abs(dy);
  const t = Math.min(tx, ty);
  if (t >= 1) return { x: round(cx), y: round(cy) }; // `from` is inside the rect
  return { x: round(cx + dx * t + (dx / length) * gap), y: round(cy + dy * t + (dy / length) * gap) };
}

// A curve that bends a little to one side: the quadratic path from a to b with its control point pushed sideways by a share of the distance.
function bent(a, b, share = 0.18) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const push = length * share;
  const cx = length === 0 ? mx : mx + (-dy / length) * push;
  const cy = length === 0 ? my : my + (dx / length) * push;
  return `M ${round(a.x)} ${round(a.y)} Q ${round(cx)} ${round(cy)} ${round(b.x)} ${round(b.y)}`;
}

// The path of an arrow from the card `source` (it starts at the middle of its right edge) to:
//   { kind: 'item', rect }  another card of the stack (the same column): it swings out to the right and comes back into the right edge of that card;
//   { kind: 'card', rect }  a real card somewhere on the table: a curve to the edge of that card nearest the start;
//   { kind: 'point', x, y } the pointer, while an arrow is being drawn.
// Returns { d, start, end } (d is the text of an SVG path) or null when a rect is not usable.
export function arrowPath(source, target) {
  if (!isRect(source) || !target) return null;
  const start = { x: source.right, y: midY(source) };
  if (target.kind === 'item') {
    if (!isRect(target.rect)) return null;
    const end = { x: target.rect.right, y: midY(target.rect) };
    const out = Math.max(start.x, end.x) + BULGE;
    return { d: `M ${round(start.x)} ${round(start.y)} C ${round(out)} ${round(start.y)} ${round(out)} ${round(end.y)} ${round(end.x)} ${round(end.y)}`, start, end };
  }
  if (target.kind === 'card') {
    if (!isRect(target.rect)) return null;
    const end = edgePoint(target.rect, start);
    return { d: bent(start, end), start, end };
  }
  if (target.kind === 'point' && Number.isFinite(target.x) && Number.isFinite(target.y)) {
    const end = { x: target.x, y: target.y };
    return { d: bent(start, end, 0.1), start, end };
  }
  return null;
}

// Is the rect `inner` at least partly inside `outer`? (An arrow from a card that was scrolled out of the stack's list is not drawn.)
export function overlaps(inner, outer) {
  return isRect(inner) && isRect(outer) && inner.right > outer.left && inner.left < outer.right && inner.bottom > outer.top && inner.top < outer.bottom;
}

// Does the rect have a size you can see? (A card that is hidden or not on the table measures 0 by 0.)
export const visible = (rect) => isRect(rect) && rect.right - rect.left > 1 && rect.bottom - rect.top > 1;
