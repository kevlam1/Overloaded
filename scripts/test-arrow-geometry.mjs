// Tests for shared/arrow-geometry.mjs: arrows are straight lines with right-angle corners.
import { arrowPath, overlaps, visible, GAP, LANE } from '../shared/arrow-geometry.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };
const rect = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height });
const square = (points) => points.every((p, i) => i === 0 || p.x === points[i - 1].x || p.y === points[i - 1].y); // every segment is horizontal or vertical
const at = (points) => points.map((p) => [p.x, p.y]);

const source = rect(20, 300, 120, 168); // right edge 140, middle y 384

// to another card of the stack: out, along, back in
const item = arrowPath(source, { kind: 'item', rect: rect(20, 100, 120, 168) });
same('a card of the stack: out to the right, up, and back in at its right edge', at(item.points), [[140, 384], [166, 384], [166, 184], [144, 184]]);
same('the path is straight lines with small rounded corners (M, L, Q)', item.d, 'M 140 384 L 159 384 Q 166 384 166 377 L 166 191 Q 166 184 159 184 L 144 184');

// to a real card
same('clear to the right: across, up or down, into the middle of the left edge', at(arrowPath(source, { kind: 'card', rect: rect(600, 100, 100, 140) }).points), [[140, 384], [370, 384], [370, 170], [596, 170]]);
same('above and not clear to the right: across, then down into the top edge', at(arrowPath(rect(20, 20, 120, 100), { kind: 'card', rect: rect(150, 300, 100, 140) }).points), [[140, 70], [200, 70], [200, 296]]);
same('below: across, then up into the bottom edge', at(arrowPath(rect(20, 600, 120, 100), { kind: 'card', rect: rect(150, 100, 100, 140) }).points), [[140, 650], [200, 650], [200, 244]]);
same('behind it (left and level): out, over the card, down into its top', at(arrowPath(rect(300, 300, 120, 100), { kind: 'card', rect: rect(100, 280, 100, 140) }).points), [[420, 350], [446, 350], [446, 254], [150, 254], [150, 276]]);
same('the tip stops GAP pixels from the card', arrowPath(source, { kind: 'card', rect: rect(600, 100, 100, 140) }).end.x, 600 - GAP);
same('a start level with the target is a straight line (no corners)', at(arrowPath(rect(20, 300, 120, 100), { kind: 'card', rect: rect(600, 300, 100, 100) }).points), [[140, 350], [596, 350]]);

// to the pointer
same('to the pointer: across, along, across', at(arrowPath(source, { kind: 'point', x: 500, y: 100 }).points), [[140, 384], [320, 384], [320, 100], [500, 100]]);
same('a pointer behind the start: out first', at(arrowPath(source, { kind: 'point', x: 60, y: 100 }).points), [[140, 384], [166, 384], [166, 100], [60, 100]]);

// whatever the cards, every segment is horizontal or vertical and the path has no NaN
const cases = [];
for (const sy of [0, 200, 500]) for (const tx of [100, 300, 700]) for (const ty of [0, 250, 600]) cases.push(arrowPath(rect(20, sy, 120, 168), { kind: 'card', rect: rect(tx, ty, 100, 140) }));
same('27 arrows in all directions: every segment is horizontal or vertical, no NaN', [cases.length, cases.every((c) => square(c.points) && !c.d.includes('NaN'))], [27, true]);

// bad input gives no path
same('a missing or damaged rect, a bad target or a pointer that is not a number gives no path', [arrowPath(null, { kind: 'point', x: 1, y: 2 }), arrowPath(source, null), arrowPath({ left: 1 }, { kind: 'point', x: 1, y: 2 }), arrowPath(source, { kind: 'item', rect: null }), arrowPath(source, { kind: 'card', rect: { left: NaN, top: 0, right: 1, bottom: 1 } }), arrowPath(source, { kind: 'other' }), arrowPath(source, { kind: 'point', x: NaN, y: 3 })], [null, null, null, null, null, null, null]);

// overlaps and visible
same('rects that overlap, touch and are apart, and a bad rect', [overlaps(rect(0, 0, 10, 10), rect(5, 5, 10, 10)), overlaps(rect(0, 0, 10, 10), rect(10, 0, 10, 10)), overlaps(rect(0, 0, 10, 10), rect(50, 50, 10, 10)), overlaps(null, rect(0, 0, 1, 1))], [true, false, false, false]);
same('a rect with a size you can see, and one of 0 by 0, a line or nothing', [visible(rect(0, 0, 50, 70)), visible(rect(0, 0, 0, 0)), visible(rect(0, 0, 50, 0.5)), visible(null)], [true, false, false, false]);
same('the constants', [GAP, LANE], [4, 26]);

console.log(`All ${checks} arrow geometry checks passed.`);
