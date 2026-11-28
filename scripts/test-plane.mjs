// The Shared view's plane (shared/plane.mjs). One check per behavior.
import { homeOf, facingOf, cornerOf, pilesOf, readPlaneEntry, planeCell, entryFor, PLANE_COLS, PLANE_ROWS, COMMONS, MAX_X, MAX_Y } from '../shared/plane.mjs';

let checks = 0;
const same = (label, got, want) => { checks += 1; if (JSON.stringify(got) !== JSON.stringify(want)) { console.log('FAILED CHECK:', label, JSON.stringify(got), 'expected', JSON.stringify(want)); process.exit(1); } };
const inside = (h) => h.x >= 0 && h.y >= 0 && h.x + h.w <= PLANE_COLS && h.y + h.h <= PLANE_ROWS && (h.y + h.h <= COMMONS.top || h.y >= COMMONS.bottom);
const apart = (a, b) => a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;

for (const seats of [['1', '2'], ['1', '2', '3'], ['1', '2', '3', '4'], ['2', '4']]) {
  const homes = seats.map((seat) => homeOf(seat, seats));
  same(`${seats.length} seats (${seats}): every home is on the plane, off the commons, and none overlap`, homes.every(inside) && homes.every((a, i) => homes.every((b, j) => i === j || apart(a, b))), true);
}
same('with two players, one home is at the bottom and one at the top, both centred', [homeOf('1', ['1', '2']), homeOf('2', ['1', '2'])].map((h) => [h.x, h.y]), [[80, 80], [80, 0]]);
same('a seat that is not at the table has no home', homeOf('3', ['1', '2']), null);
same('a card with an entry shows there; one without shows at its cell in its owner\'s home', [planeCell({ col: 3, row: 4 }, { x: 150, y: 60 }, homeOf('1', ['1', '2'])), planeCell({ col: 3, row: 4 }, null, homeOf('1', ['1', '2']))], [{ col: 150, row: 60 }, { col: 83, row: 84 }]);
same('an entry of another match, or out of the plane, is no entry', [readPlaneEntry({ x: 1, y: 1, z: 0, m: 2 }, 3), readPlaneEntry({ x: MAX_X + 1, y: 0, z: 0, m: 3 }, 3), readPlaneEntry({ x: 5, y: 6, z: 2, m: 3 }, 3)], [null, null, { x: 5, y: 6, z: 2 }]);
same('an entry is kept on the plane', entryFor({ col: 999, row: -4 }, 3, 'u1', 2), { x: MAX_X, y: 0, z: 3, by: 'u1', m: 2 });
same('with 3 or 4 players there are 12 cells between the left and right homes', homeOf('1', ['1', '2', '3']).x - (homeOf('2', ['1', '2', '3']).x + homeOf('2', ['1', '2', '3']).w), 12);
same('seats 1 and 2 sit side by side along the bottom (1 on the right, so turns go clockwise), 3 and 4 along the top, 3 across from 1', ['1', '2', '3', '4'].map((seat) => { const h = homeOf(seat, ['1', '2', '3', '4']); return [h.x < PLANE_COLS / 2 - 56 ? 'left' : 'right', h.y === 0 ? 'top' : 'bottom']; }), [['right', 'bottom'], ['left', 'bottom'], ['left', 'top'], ['right', 'top']]);
same('the homes along the top face it (half a turn), the others face the bottom', ['1', '2', '3', '4'].map((seat) => facingOf(seat, ['1', '2', '3', '4'])), [0, 0, 2, 2]);
const all = ['1', '2', '3', '4'];
same('in Grid view seat 1 sees 3 4 on top and 2 1 at the bottom', all.map((seat) => cornerOf(seat, all, '1')), ['br', 'bl', 'tl', 'tr']);
same('...and seat 3 sees the table turned: 4 3 at the bottom, 1 2 on top', all.map((seat) => cornerOf(seat, all, '3')), ['tl', 'tr', 'br', 'bl']);
const inPlane = (b) => b.x >= 0 && b.y >= 0 && b.x + b.w <= PLANE_COLS && b.y + b.h <= PLANE_ROWS;
same('each seat has a pile column at its outer edge, on the table and off every area', all.every((seat) => { const p = pilesOf(seat, all); return inPlane(p) && all.every((other) => apart(p, homeOf(other, all))); }), true);
same('...on the left of a left area and the right of a right one', [pilesOf('2', all).x < homeOf('2', all).x, pilesOf('1', all).x > homeOf('1', all).x], [true, true]);
void MAX_Y;

console.log(`All ${checks} plane checks passed.`);
