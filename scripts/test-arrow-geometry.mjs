// Tests for shared/arrow-geometry.mjs: where the arrows of the stack window start and end.
import { GAP, BULGE, edgePoint, arrowPath, overlaps, visible } from '../shared/arrow-geometry.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };
const rect = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height });

same('the constants', [GAP, BULGE], [4, 56]);

// edgePoint: from the centre toward a point, out to the edge and a little further
const card = rect(100, 100, 100, 140); // centre (150, 170)
same('a point to the right: the right edge, middle, plus the gap', edgePoint(card, { x: 500, y: 170 }), { x: 204, y: 170 });
same('a point to the left: the left edge plus the gap outward', edgePoint(card, { x: -300, y: 170 }), { x: 96, y: 170 });
same('a point above: the top edge', edgePoint(card, { x: 150, y: -400 }), { x: 150, y: 96 });
same('a point below: the bottom edge', edgePoint(card, { x: 150, y: 900 }), { x: 150, y: 244 });
{ const p = edgePoint(card, { x: 400, y: 400 }); // the diagonal leaves through the bottom edge (the card is taller than wide? 140 > 100: the right edge is reached first)
  same('a diagonal point leaves by the nearer edge and lies on the line toward the point', [p.x > 200, p.y > 170 && p.y < 240], [true, true]); }
same('a point inside the card, or at its centre, gives the centre', [edgePoint(card, { x: 160, y: 180 }), edgePoint(card, { x: 150, y: 170 })], [{ x: 150, y: 170 }, { x: 150, y: 170 }]);
same('the gap can be set', edgePoint(card, { x: 500, y: 170 }, 0), { x: 200, y: 170 });

// the path to another card of the stack: out to the right and back in
const source = rect(20, 300, 120, 168); // right edge 140, middle y 384
const above = rect(20, 100, 120, 168); // middle y 184
const toItem = arrowPath(source, { kind: 'item', rect: above });
same('an arrow to another card of the stack starts at the middle of the right edge and ends at the middle of the right edge of the target', [toItem.start, toItem.end], [{ x: 140, y: 384 }, { x: 140, y: 184 }]);
same('...and swings out to the right by the bulge', toItem.d, 'M 140 384 C 196 384 196 184 140 184');
same('a target further right moves the swing with it', arrowPath(source, { kind: 'item', rect: rect(200, 100, 120, 168) }).d.startsWith('M 140 384 C 376 384 376 184 320 184'), true);

// the path to a real card
const target = rect(600, 200, 100, 140); // centre (650, 270)
const toCard = arrowPath(source, { kind: 'card', rect: target });
same('an arrow to a real card starts at the right edge of the source and ends at the edge of the target nearest to it (the left side)', [toCard.start, toCard.end.x < 600, toCard.end.y > 200 && toCard.end.y < 340], [{ x: 140, y: 384 }, true, true]);
same('...as a curve (a quadratic path) that ends at that point', toCard.d.startsWith('M 140 384 Q ') && toCard.d.endsWith(`${toCard.end.x} ${toCard.end.y}`), true);
same('a target to the left of the start is reached on its right side', arrowPath(rect(900, 300, 100, 140), { kind: 'card', rect: target }).end.x > 700, true);
{ const above2 = arrowPath(rect(300, 600, 100, 140), { kind: 'card', rect: rect(300, 100, 100, 140) }).end; same('a target far above is reached on its bottom edge, leaning toward the start (the arrow starts at the right edge of the source, x 400)', [above2.x > 350 && above2.x < 380, above2.y > 240 && above2.y < 260], [true, true]); }

// the path to the pointer while drawing
const draft = arrowPath(source, { kind: 'point', x: 500, y: 300 });
same('an arrow being drawn ends exactly at the pointer', [draft.start, draft.end], [{ x: 140, y: 384 }, { x: 500, y: 300 }]);
same('the curve bends to one side of the straight line (the control point is off the line by a tenth of the distance)', draft.d, 'M 140 384 Q 328.4 378 500 300');
same('a pointer on the start itself does not break (no division by zero)', arrowPath(source, { kind: 'point', x: 140, y: 384 }).d, 'M 140 384 Q 140 384 140 384');
same('a pointer that is not a number gives no path', [arrowPath(source, { kind: 'point', x: NaN, y: 3 }), arrowPath(source, { kind: 'point', x: 3 })], [null, null]);

// bad input gives no path, never a path with NaN
same('a missing or damaged rect gives no path', [arrowPath(null, { kind: 'point', x: 1, y: 2 }), arrowPath(source, null), arrowPath({ left: 1 }, { kind: 'point', x: 1, y: 2 }), arrowPath(source, { kind: 'item', rect: null }), arrowPath(source, { kind: 'card', rect: { left: NaN, top: 0, right: 1, bottom: 1 } }), arrowPath(source, { kind: 'other' }), arrowPath({ left: 5, top: 0, right: 1, bottom: 1 }, { kind: 'point', x: 1, y: 2 })], [null, null, null, null, null, null, null]);
same('no path contains NaN', [toItem, toCard, draft].every((p) => !p.d.includes('NaN')), true);

// overlaps and visible
same('rects that overlap, touch and are apart', [overlaps(rect(0, 0, 10, 10), rect(5, 5, 10, 10)), overlaps(rect(0, 0, 10, 10), rect(10, 0, 10, 10)), overlaps(rect(0, 0, 10, 10), rect(50, 50, 10, 10))], [true, false, false]);
same('overlaps with a bad rect is false', [overlaps(null, rect(0, 0, 1, 1)), overlaps(rect(0, 0, 1, 1), { left: NaN, top: 0, right: 1, bottom: 1 })], [false, false]);
same('a rect with a size you can see, and one of 0 by 0 or a line', [visible(rect(0, 0, 50, 70)), visible(rect(0, 0, 0, 0)), visible(rect(0, 0, 50, 0.5)), visible(null)], [true, false, false, false]);

console.log(`All ${checks} arrow geometry checks passed.`);
