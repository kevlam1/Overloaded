// Where the arrows of the stack window go (Kevin, 2026-11-17; straight lines with right-angle corners since 2026-11-18): plain geometry with no browser code, so Node can test it
// (scripts/test-arrow-geometry.mjs). A rect is { left, top, right, bottom } in pixels, like the browser's getBoundingClientRect. frontend/src/stack-window.js measures the cards, asks for a path here
// and gives it to an SVG path. Every segment of a path is horizontal or vertical.
export const GAP = 4; // pixels between the tip of an arrow and the card it points at
export const LANE = 26; // how far an arrow runs out from a card before it turns
export const CORNER = 7; // the radius of the rounded corners (a small one: the lines stay straight)

const round = (n) => Math.round(n * 10) / 10;
const isRect = (r) => Boolean(r) && [r.left, r.top, r.right, r.bottom].every(Number.isFinite) && r.right >= r.left && r.bottom >= r.top;
const midY = (r) => (r.top + r.bottom) / 2;
const midX = (r) => (r.left + r.right) / 2;

// Takes out points that repeat or lie on a straight line between their neighbours.
function tidy(points) {
  const out = [];
  for (const p of points) {
    const last = out.at(-1);
    if (last && last.x === p.x && last.y === p.y) continue;
    out.push(p);
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3);
      if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) out.splice(-2, 1); else break;
    }
  }
  return out;
}

// The points as an SVG path with the corners rounded by CORNER pixels (or less on a short segment).
function pathOf(points) {
  let d = `M ${round(points[0].x)} ${round(points[0].y)}`;
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const next = points[i + 1];
    if (!next) { d += ` L ${round(p.x)} ${round(p.y)}`; break; }
    const prev = points[i - 1];
    const before = Math.min(CORNER, (Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y)) / 2);
    const after = Math.min(CORNER, (Math.abs(next.x - p.x) + Math.abs(next.y - p.y)) / 2);
    const a = { x: p.x - Math.sign(p.x - prev.x) * before, y: p.y - Math.sign(p.y - prev.y) * before };
    const b = { x: p.x + Math.sign(next.x - p.x) * after, y: p.y + Math.sign(next.y - p.y) * after };
    d += ` L ${round(a.x)} ${round(a.y)} Q ${round(p.x)} ${round(p.y)} ${round(b.x)} ${round(b.y)}`;
  }
  return d;
}

// The corners of an arrow from `start` to the card `rect` (not to the right of the start, or to its right with room to turn):
//   clear to the right  start -> across -> up or down -> into the middle of the left edge;
//   above or below      start -> across -> down or up into the top or bottom edge;
//   otherwise           start -> out -> over the card -> down into its top edge.
function toCard(start, rect) {
  const lane = start.x + LANE;
  const tx = midX(rect);
  const ty = midY(rect);
  if (rect.left >= lane + 16) {
    const turn = Math.max(lane, (start.x + rect.left) / 2);
    return [start, { x: turn, y: start.y }, { x: turn, y: ty }, { x: rect.left - GAP, y: ty }];
  }
  if (tx >= lane && start.y <= rect.top - 12) return [start, { x: tx, y: start.y }, { x: tx, y: rect.top - GAP }];
  if (tx >= lane && start.y >= rect.bottom + 12) return [start, { x: tx, y: start.y }, { x: tx, y: rect.bottom + GAP }];
  const over = rect.top - LANE;
  return [start, { x: lane, y: start.y }, { x: lane, y: over }, { x: tx, y: over }, { x: tx, y: rect.top - GAP }];
}

// The path of an arrow from the card `source` (it starts at the middle of its right edge) to:
//   { kind: 'item', rect }  another card of the stack (the same column): out to the right, along, and back in at the right edge of that card;
//   { kind: 'card', rect }  a real card somewhere on the table;
//   { kind: 'point', x, y } the pointer, while an arrow is being drawn.
// Returns { d, start, end, points } (d is the text of an SVG path) or null when a rect is not usable.
export function arrowPath(source, target) {
  if (!isRect(source) || !target) return null;
  const start = { x: source.right, y: midY(source) };
  let points = null;
  if (target.kind === 'item') {
    if (!isRect(target.rect)) return null;
    const out = Math.max(start.x, target.rect.right) + LANE;
    points = [start, { x: out, y: start.y }, { x: out, y: midY(target.rect) }, { x: target.rect.right + GAP, y: midY(target.rect) }];
  } else if (target.kind === 'card') {
    if (!isRect(target.rect)) return null;
    points = toCard(start, target.rect);
  } else if (target.kind === 'point' && Number.isFinite(target.x) && Number.isFinite(target.y)) {
    const end = { x: target.x, y: target.y };
    const turn = end.x >= start.x + LANE ? (start.x + end.x) / 2 : start.x + LANE;
    points = [start, { x: turn, y: start.y }, { x: turn, y: end.y }, end];
  }
  if (!points) return null;
  const clean = tidy(points);
  if (clean.length < 2) return { d: `M ${round(start.x)} ${round(start.y)}`, start, end: start, points: clean };
  return { d: pathOf(clean), start, end: clean.at(-1), points: clean };
}

// Is the rect `inner` at least partly inside `outer`? (An arrow from a card that was scrolled out of the stack's list is not drawn.)
export function overlaps(inner, outer) {
  return isRect(inner) && isRect(outer) && inner.right > outer.left && inner.left < outer.right && inner.bottom > outer.top && inner.top < outer.bottom;
}

// Does the rect have a size you can see? (A card that is hidden or not on the table measures 0 by 0.)
export const visible = (rect) => isRect(rect) && rect.right - rect.left > 1 && rect.bottom - rect.top > 1;
