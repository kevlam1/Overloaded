// Tests for shared/bar-place.mjs: where the floating action bar sits, how it snaps, and how a stored place is read back.
import { MARGIN, SNAP_EDGE, SNAP_CENTER, DEFAULT_PLACE, readPlace, writePlace, room, placeToPixels, pixelsToPlace, snap, nudge } from '../shared/bar-place.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };

const size = { width: 1000, height: 600, barWidth: 400, barHeight: 60 }; // the room for the top left corner: 584 by 524, from 8
same('the room is the window minus the bar minus a margin each side', room(size), { width: 584, height: 524, margin: 8 });
same('a bar bigger than the window has no room (and never a negative one)', room({ width: 300, height: 40, barWidth: 400, barHeight: 60 }), { width: 0, height: 0, margin: 8 });
same('the default place is the middle of the top', DEFAULT_PLACE, { fx: 0.5, fy: 0 });

// places and pixels
same('the middle of the top is at 300 from the left (8 + 584 / 2) and at the margin from the top', placeToPixels({ fx: 0.5, fy: 0 }, size), { left: 300, top: 8 });
same('the right and bottom edges are flush with the margin', placeToPixels({ fx: 1, fy: 1 }, size), { left: 592, top: 532 });
same('a place outside 0 to 1 is held inside the room', placeToPixels({ fx: -3, fy: 9 }, size), { left: 8, top: 532 });
same('pixels and places turn into each other', pixelsToPlace(placeToPixels({ fx: 0.25, fy: 0.75 }, size), size), { fx: 0.25, fy: 0.75 });
same('a corner outside the room is held inside', pixelsToPlace({ left: -50, top: 9999 }, size), { fx: 0, fy: 1 });
same('with no room the place is the middle and the top', pixelsToPlace({ left: 100, top: 100 }, { width: 300, height: 40, barWidth: 400, barHeight: 60 }), { fx: 0.5, fy: 0 });
same('on a window of another size the same place is in the same relative spot', placeToPixels({ fx: 1, fy: 0 }, { width: 2000, height: 1000, barWidth: 400, barHeight: 60 }), { left: 1592, top: 8 });

// snapping
same('within 12 px of the left edge it snaps flush to it', snap({ left: 8 + SNAP_EDGE, top: 200 }, size).left, 8);
same('13 px from the edge it does not snap to it', snap({ left: 8 + SNAP_EDGE + 1, top: 200 }, size).left, 8 + SNAP_EDGE + 1);
same('within 12 px of the right edge it snaps flush to it', snap({ left: 592 - SNAP_EDGE, top: 200 }, size).left, 592);
same('within 12 px of the top and the bottom it snaps to them', [snap({ left: 100, top: 8 + SNAP_EDGE }, size).top, snap({ left: 100, top: 532 - SNAP_EDGE }, size).top], [8, 532]);
same('with its middle within 16 px of the middle of the window it snaps to the middle (left 300 centres a 400 wide bar in 1000)', [snap({ left: 300 + SNAP_CENTER, top: 200 }, size).left, snap({ left: 300 - SNAP_CENTER, top: 200 }, size).left], [300, 300]);
same('17 px from the middle it does not snap', snap({ left: 300 + SNAP_CENTER + 1, top: 200 }, size).left, 300 + SNAP_CENTER + 1);
same('the vertical middle snaps too (top 270 centres a 60 high bar in 600)', snap({ left: 100, top: 270 + 10 }, size).top, 270);
same('a bar let go outside the window is brought back inside', snap({ left: -900, top: 5000 }, size), { left: 8, top: 532 });
same('an edge wins over the middle when the bar is as wide as the room allows', snap({ left: 8, top: 8 }, { width: 416, height: 76, barWidth: 400, barHeight: 60 }), { left: 8, top: 8 });

// the arrow keys
same('a nudge moves by the amount', nudge({ left: 100, top: 100 }, size, 10, -10), { left: 110, top: 90 });
same('a nudge stays inside the room', [nudge({ left: 10, top: 10 }, size, -50, -50), nudge({ left: 590, top: 530 }, size, 50, 50)], [{ left: 8, top: 8 }, { left: 592, top: 532 }]);

// storing
same('a place is written and read back', readPlace(writePlace({ fx: 0.123456789, fy: 1 })), { fx: 0.1235, fy: 1 });
for (const [label, text] of [['nothing', null], ['not text', 5], ['not JSON', '{nope'], ['an array', '[0.5,0]'], ['null', 'null'], ['a missing number', '{"fx":0.5}'], ['a number as text', '{"fx":"0.5","fy":0}'], ['a number above 1', '{"fx":1.5,"fy":0}'], ['a negative number', '{"fx":-0.1,"fy":0}'], ['not finite', '{"fx":1e999,"fy":0}'], ['a string', '"hello"']]) {
  same(`a stored value that is ${label} is refused`, readPlace(text), null);
}
same('extra fields are ignored', readPlace('{"fx":0.5,"fy":0.5,"evil":"<script>"}'), { fx: 0.5, fy: 0.5 });

console.log(`All ${checks} floating bar place checks passed.`);
