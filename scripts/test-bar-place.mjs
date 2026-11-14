// Tests for shared/bar-place.mjs: where the floating action bar sits, how it snaps, and how a stored place is read back.
import { MARGIN, SNAP_DISTANCE, CENTER_DISTANCE, CORNER_DISTANCE, DEFAULT_PLACE, DOCKS, readPlace, writePlace, room, placeToPixels, pixelsToPlace, anchored, isVertical, nearestDock, dockPlan, nudge } from '../shared/bar-place.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };

const size = { width: 1000, height: 600, barWidth: 400, barHeight: 60 }; // the room for the top left corner: 584 by 524, from 8
same('the room is the window minus the bar minus a margin each side', room(size), { width: 584, height: 524, margin: 8 });
same('a bar bigger than the window has no room (and never a negative one)', room({ width: 300, height: 40, barWidth: 400, barHeight: 60 }), { width: 0, height: 0, margin: 8 });
same('the default place is docked to the middle of the top', DEFAULT_PLACE, { dock: 'top', fx: 0.5, fy: 0 });
same('the four docks', DOCKS, ['top', 'bottom', 'left', 'right']);

// places and pixels
same('the middle of the top is at 300 from the left (8 + 584 / 2) and at the margin from the top', placeToPixels({ fx: 0.5, fy: 0 }, size), { left: 300, top: 8 });
same('the right and bottom edges are flush with the margin', placeToPixels({ fx: 1, fy: 1 }, size), { left: 592, top: 532 });
same('a place outside 0 to 1 is held inside the room', placeToPixels({ fx: -3, fy: 9 }, size), { left: 8, top: 532 });
same('pixels and places turn into each other', pixelsToPlace(placeToPixels({ fx: 0.25, fy: 0.75 }, size), size), { fx: 0.25, fy: 0.75 });
same('a corner outside the room is held inside', pixelsToPlace({ left: -50, top: 9999 }, size), { fx: 0, fy: 1 });
same('with no room the place is the middle and the top', pixelsToPlace({ left: 100, top: 100 }, { width: 300, height: 40, barWidth: 400, barHeight: 60 }), { fx: 0.5, fy: 0 });
same('on a window of another size the same place is in the same relative spot', placeToPixels({ fx: 1, fy: 0 }, { width: 2000, height: 1000, barWidth: 400, barHeight: 60 }), { left: 1592, top: 8 });

// docking (the room for the top left corner is 584 by 524 here, so a place of { fx, fy } is at 584 * fx and 524 * fy pixels from the margin)
same('only the left and the right make a column', [isVertical({ dock: 'left' }), isVertical({ dock: 'right' }), isVertical({ dock: 'top' }), isVertical({ dock: 'bottom' }), isVertical({ dock: null }), isVertical(null)], [true, true, false, false, false, false]);
same('a docked bar is pressed against its edge and keeps its place along it', [anchored({ dock: 'top', fx: 0.3, fy: 0.9 }), anchored({ dock: 'bottom', fx: 0.3, fy: 0.1 }), anchored({ dock: 'left', fx: 0.8, fy: 0.4 }), anchored({ dock: 'right', fx: 0.2, fy: 0.4 })], [{ fx: 0.3, fy: 0 }, { fx: 0.3, fy: 1 }, { fx: 0, fy: 0.4 }, { fx: 1, fy: 0.4 }]);
same('a free bar is where it is', anchored({ dock: null, fx: 0.3, fy: 0.6 }), { fx: 0.3, fy: 0.6 });
const px = (fraction, span) => fraction / span; // a distance in pixels as a fraction of the room
const W = 584; const H = 524;
same('within 10 px of the left edge it docks to the left, keeping its height', dockPlan({ fx: px(SNAP_DISTANCE, W), fy: 0.4 }, size), { edge: 'left', fx: px(SNAP_DISTANCE, W), fy: 0.4, corner: null });
same('11 px from the left edge and far from the others it does not dock', dockPlan({ fx: px(SNAP_DISTANCE + 1, W), fy: 0.4 }, size), null);
same('within 10 px of the right edge it docks right, of the top it docks to the top, of the bottom to the bottom', [dockPlan({ fx: 1 - px(10, W), fy: 0.4 }, size).edge, dockPlan({ fx: 0.4, fy: px(10, H) }, size).edge, dockPlan({ fx: 0.4, fy: 1 - px(10, H) }, size).edge], ['right', 'top', 'bottom']);
same('near the middle of the top edge (within 15 px, tried at 14.5) it goes exactly to the middle', [dockPlan({ fx: 0.5 + px(CENTER_DISTANCE - 0.5, W), fy: 0 }, size).fx, dockPlan({ fx: 0.5 - px(CENTER_DISTANCE - 0.5, W), fy: 0 }, size).fx], [0.5, 0.5]);
same('16 px from the middle it does not', dockPlan({ fx: 0.5 + px(CENTER_DISTANCE + 1, W), fy: 0 }, size).fx !== 0.5, true);
same('the middle of a side edge is the middle of its height', dockPlan({ fx: 0, fy: 0.5 + px(10, H) }, size), { edge: 'left', fx: 0, fy: 0.5, corner: null });
same('within 20 px of both edges of a corner it goes into the corner (a row to the top, a column to the left)', [dockPlan({ fx: px(20, W), fy: px(20, H) }, size, false), dockPlan({ fx: px(20, W), fy: px(20, H) }, size, true)], [{ edge: 'top', fx: 0, fy: 0, corner: { x: 0, y: 0 } }, { edge: 'left', fx: 0, fy: 0, corner: { x: 0, y: 0 } }]);
same('the bottom right corner is the corner for a row at the bottom and a column at the right', [dockPlan({ fx: 1, fy: 1 }, size, false), dockPlan({ fx: 1, fy: 1 }, size, true)], [{ edge: 'bottom', fx: 1, fy: 1, corner: { x: 1, y: 1 } }, { edge: 'right', fx: 1, fy: 1, corner: { x: 1, y: 1 } }]);
same('21 px from a corner on one axis only is an edge, not the corner', dockPlan({ fx: px(21, W), fy: 0 }, size, false), { edge: 'top', fx: px(21, W), fy: 0, corner: null });
same('a row prefers the top and bottom when it is near a side and the top alike, a column the side', [nearestDock({ fx: px(5, W), fy: px(5, H) }, size, false), nearestDock({ fx: px(5, W), fy: px(5, H) }, size, true)], ['top', 'left']);
same('the nearest edge wins when two are within reach', nearestDock({ fx: px(8, W), fy: px(3, H) }, size, true), 'top');
same('a bar with no room is always at an edge: it docks as the start of the axes', dockPlan({ fx: 0.5, fy: 0 }, { width: 300, height: 40, barWidth: 400, barHeight: 60 }) !== null, true);

// the arrow keys
same('a nudge moves by the amount', nudge({ left: 100, top: 100 }, size, 10, -10), { left: 110, top: 90 });
same('a nudge stays inside the room', [nudge({ left: 10, top: 10 }, size, -50, -50), nudge({ left: 590, top: 530 }, size, 50, 50)], [{ left: 8, top: 8 }, { left: 592, top: 532 }]);

// storing
same('a place is written and read back, with its dock', readPlace(writePlace({ dock: 'right', fx: 0.123456789, fy: 1 })), { dock: 'right', fx: 0.1235, fy: 1 });
same('a place with no dock (stored before the docks) is a free place', readPlace('{"fx":0.25,"fy":0.75}'), { dock: null, fx: 0.25, fy: 0.75 });
same('a dock that is not one of the four is ignored: the bar is free there', readPlace('{"dock":"middle","fx":0.25,"fy":0.75}'), { dock: null, fx: 0.25, fy: 0.75 });
for (const [label, text] of [['nothing', null], ['not text', 5], ['not JSON', '{nope'], ['an array', '[0.5,0]'], ['null', 'null'], ['a missing number', '{"fx":0.5}'], ['a number as text', '{"fx":"0.5","fy":0}'], ['a number above 1', '{"fx":1.5,"fy":0}'], ['a negative number', '{"fx":-0.1,"fy":0}'], ['not finite', '{"fx":1e999,"fy":0}'], ['a string', '"hello"']]) {
  same(`a stored value that is ${label} is refused`, readPlace(text), null);
}
same('extra fields are ignored', readPlace('{"dock":"top","fx":0.5,"fy":0.5,"evil":"<script>"}'), { dock: 'top', fx: 0.5, fy: 0.5 });

console.log(`All ${checks} floating bar place checks passed.`);
