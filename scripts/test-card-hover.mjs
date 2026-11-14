// Tests for the pure parts of frontend/src/card-hover.js: which larger picture a card button asks for, and where the box goes. (The hover itself is checked in a real browser in check-solo-ui.mjs.)
import { largeAddress, placeBox, nextHoverScale, readHoverScale, HOVER_SCALE } from '../frontend/src/card-hover.js';

let checks = 0;
const same = (label, actual, expected) => {
  checks++;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) { console.log(`FAILED CHECK: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); process.exit(1); }
};

// a stand-in for a card button: its picture's address and its classes
const button = (src, classes = []) => ({ querySelector: (selector) => (selector === 'img' && src !== undefined ? { getAttribute: (name) => (name === 'src' ? src : null) } : null), classList: { contains: (name) => classes.includes(name) } });
const id = '00000000-0000-4000-8000-000000000001';

same('the small picture becomes the normal one, same card, same face', largeAddress(button(`https://cards.scryfall.io/small/front/0/0/${id}.jpg`)), `https://cards.scryfall.io/normal/front/0/0/${id}.jpg`);
same('the back face stays the back face', largeAddress(button(`https://cards.scryfall.io/small/back/0/0/${id}.jpg`)), `https://cards.scryfall.io/normal/back/0/0/${id}.jpg`);
same('a card with no picture (a name only) has no larger picture', largeAddress(button(`https://cards.scryfall.io/small/front/0/0/${id}.jpg`, ['noimage'])), null);
same('a button with no picture element has none', largeAddress(button(undefined)), null);
same('a picture with no address has none', largeAddress(button('')), null);
for (const [label, src] of [['another site', `https://example.com/small/front/0/0/${id}.jpg`], ['a data address', 'data:image/png;base64,AAAA'], ['a script address', 'javascript:alert(1)'], ['a lookalike host', `https://cards.scryfall.io.evil.test/small/front/0/0/${id}.jpg`]]) {
  same(`${label} is not turned into a request (only Scryfall's small pictures are)`, largeAddress(button(src)), null);
}
// a card of the hand already shows the NORMAL picture (the hand is large): that is the bigger picture, as it is
same('a normal picture already is its own bigger picture', largeAddress(button(`https://cards.scryfall.io/normal/front/0/0/${id}.jpg`)), `https://cards.scryfall.io/normal/front/0/0/${id}.jpg`);
same('null and undefined buttons give none', [largeAddress(null), largeAddress(undefined)], [null, null]);

// where the box goes: window 1366 x 650, box 272 wide and 379 high
const win = { windowWidth: 1366, windowHeight: 650, height: 379 };
same('a card on the left: the box goes to its right, level with it', placeBox({ left: 100, right: 160, top: 300, height: 84 }, win), { left: 168, top: 300 + 42 - 189.5 });
same('a card with room on its right (294 px) puts the box there even on the right half', placeBox({ left: 1000, right: 1060, top: 300, height: 84 }, win).left, 1068);
same('a card on the right with too little room puts the box to its left', placeBox({ left: 1200, right: 1260, top: 300, height: 84 }, win), { left: 1200 - 8 - 272, top: 152.5 });
same('a card near the right edge of the window still puts the box inside the window', (() => { const p = placeBox({ left: 1300, right: 1360, top: 300, height: 84 }, win); return p.left + 272 <= 1366 - 4 && p.left >= 4; })(), true);
same('a card at the very top: the box is moved down to the edge gap', placeBox({ left: 100, right: 160, top: 0, height: 84 }, win).top, 4);
same('a card at the bottom: the box is moved up so it fits', placeBox({ left: 100, right: 160, top: 600, height: 84 }, win).top, 650 - 379 - 4);
same('the box never covers the hovered card when there is room on a side', (() => { const rect = { left: 600, right: 660, top: 300, height: 84 }; const p = placeBox(rect, win); return p.left >= rect.right || p.left + 272 <= rect.left; })(), true);
same('with more room on the left than the right it goes left', (() => { const p = placeBox({ left: 800, right: 860, top: 100, height: 84 }, { ...win, windowWidth: 1000 }); return p.left + 272 <= 800; })(), true);
same('a tiny window keeps the box at the edge gap and never negative', (() => { const p = placeBox({ left: 10, right: 40, top: 10, height: 40 }, { windowWidth: 200, windowHeight: 200, height: 379 }); return p.left >= 4 && p.top >= 4; })(), true);
same('numbers only: every result is a finite number', (() => { const p = placeBox({ left: 0, right: 0, top: 0, height: 0 }, win); return Number.isFinite(p.left) && Number.isFinite(p.top); })(), true);

// the wheel over the picture: up is bigger, down smaller, a tenth a notch, between half and double
same('wheel up makes the picture a tenth bigger, wheel down a tenth smaller', [nextHoverScale(1, -100), nextHoverScale(1, 100)], [1.1, 0.9]);
same('no float drift after many notches (rounded to a hundredth)', [3, 4, 5].map((n) => { let scale = 1; for (let i = 0; i < n; i++) scale = nextHoverScale(scale, -1); return scale; }), [1.3, 1.4, 1.5]);
same('it stops at half size and at double size', [nextHoverScale(0.5, 100), nextHoverScale(2, -100), nextHoverScale(1.95, -1)], [0.5, 2, 2]);
same('a wheel that does not move (0, nothing, text) changes nothing', [nextHoverScale(1.3, 0), nextHoverScale(1.3, undefined), nextHoverScale(1.3, 'x')], [1.3, 1.3, 1.3]);
same('a saved size is read back, and a bad or missing one is the normal size', [readHoverScale('1.4'), readHoverScale('9'), readHoverScale('0.1'), readHoverScale('nope'), readHoverScale(null), readHoverScale(undefined)], [1.4, 2, 0.5, 1, 1, 1]);
same('the limits and the key', [HOVER_SCALE.min, HOVER_SCALE.max, HOVER_SCALE.key], [0.5, 2, 'overloaded.hoverScale']);

console.log(`All ${checks} card hover checks passed.`);
