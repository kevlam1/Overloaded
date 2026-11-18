// Short browser check of two solo table pieces (real headless Chrome, real card list): the Game history bar (opens downward, records moves, latches to an edge and can be dragged out) and drag-selecting
// cards of the hand with a rectangle. Run from the repo root: node scripts/check-history-and-select-ui.mjs (skipped without a card list: `npm run cards`).
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { openBrowser, closeAllBrowsers, waitFor, sleep } from './lib/browser.mjs';
import { buildCardIndex, matchDeck } from '../shared/card-match.mjs';
import { parseDeckText } from '../shared/deck-text.mjs';
import { makePreview, buildSavedDeck, serializeDeck } from '../shared/deck-preview.mjs';

if (!existsSync('frontend/public/data/cards.json')) { console.log('History and select checks skipped: no card list here yet. Run `npm run cards`.'); process.exit(0); }

const PORT = 5197;
const PAGE = `http://127.0.0.1:${PORT}/pages/solo/index.html`;
let checks = 0;
const failures = [];
const check = (label, pass, detail = '') => { checks++; if (!pass) { failures.push(label); console.log(`FAIL  ${label}${detail ? '  (' + detail + ')' : ''}`); } };

const TEXT = 'COMMANDER:\n1 Eowyn, Lady of Rohan\n\nDECK:\n24 Forest\n4 Sol Ring\n4 Lightning Bolt\n4 Llanowar Elves\n24 Island';
const cards = JSON.parse(readFileSync('frontend/public/data/cards.json', 'utf8'));
const parsed = parseDeckText(TEXT);
const preview = makePreview(parsed, matchDeck(buildCardIndex(cards), parsed.entries));
const built = buildSavedDeck(preview, { name: 'Test deck', text: TEXT, commanderIds: preview.commander.ids });
if (preview.counts.problem !== 0 || !built.ok) { console.log('The test deck could not be built.'); process.exit(1); }
const DECK_JSON = serializeDeck(built.deck);
const art = (url) => ({ type: 'image/svg+xml', text: `<svg xmlns="http://www.w3.org/2000/svg" width="146" height="204"><rect width="146" height="204" fill="hsl(${parseInt(url.split('/').pop().slice(0, 4), 16) % 360},45%,38%)"/></svg>` });

let server = null;
try {
  server = await createServer({ configFile: 'vite.config.js', logLevel: 'error', server: { port: PORT, strictPort: true, host: '127.0.0.1' } });
  await server.listen();
  const browser = await openBrowser('history-ui', { width: 1280, height: 1000 });
  const ev = (expression) => browser.eval(expression);
  await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await browser.fakeImages('https://cards.scryfall.io/*', art);
  await browser.fakeImages('https://backs.scryfall.io/*', null);
  await browser.goto(PAGE);
  await ev(`localStorage.removeItem('overloaded.decks'); localStorage.removeItem('overloaded.historyBar'); localStorage.removeItem('overloaded.historyOpen'); localStorage.setItem('overloaded.deck', ${JSON.stringify(DECK_JSON)});`);
  await browser.goto(PAGE);
  await waitFor(async () => (await ev("!document.getElementById('game').hidden")) || null, 15000, 50);
  const mouse = (type, x, y, buttons = 0) => browser.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons, clickCount: 1 });
  const rectOf = (selector) => ev(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2, right: r.right, bottom: r.bottom }; })()`);

  // ---- the Game history bar ----
  const bar = () => ev(`(() => { const p = document.getElementById('history-bar'); const r = p.getBoundingClientRect(); const cs = getComputedStyle(p); return { left: r.left, top: r.top, right: r.right, h: r.height, open: p.dataset.open, dock: p.dataset.dock, borderRight: cs.borderRightWidth, borderLeft: cs.borderLeftWidth, rows: document.querySelectorAll('.history-row').length, count: document.querySelector('.history-count').textContent }; })()`);
  const click = async (selector) => { const r = await rectOf(selector); await mouse('mouseMoved', r.cx, r.cy); await mouse('mousePressed', r.cx, r.cy, 1); await mouse('mouseReleased', r.cx, r.cy); await sleep(150); };
  const first = await bar();
  check('the bar is thin, called Game history, closed, and attached to the right edge (no gap, no border on that side)', first.open === 'false' && first.h < 32 && first.right === 1280 && first.dock === 'right' && first.borderRight === '0px' && (await ev("document.querySelector('.history-title').textContent")) === 'Game history', JSON.stringify(first));
  await ev("document.getElementById('draw').click()"); await sleep(100);
  await click('.history-head');
  const opened = await bar();
  check('a click on the top of the bar opens it downward (its top edge stays) and it lists the moves with the newest at the bottom', opened.open === 'true' && opened.h > first.h + 20 && opened.rows === 2 && opened.top === first.top && /^New game/.test(await ev("document.querySelector('.history-row .history-text').textContent")) && /^Drew /.test(await ev("document.querySelector('.history-row:last-child .history-text').textContent")), JSON.stringify(opened));
  const tops = [];
  for (let n = 0; n < 6; n++) { await ev("document.getElementById('draw').click()"); await sleep(90); tops.push((await bar()).top); }
  check('new moves add rows and the count follows, and the window does not jump (the top edge never changes)', (await bar()).count === '8' && new Set(tops).size === 1 && tops[0] === opened.top, JSON.stringify(tops));
  for (let n = 0; n < 8; n++) { await ev("document.getElementById('draw').click()"); await sleep(40); } // (enough moves for the list to need scrolling)
  check('the newest move is the last row, and a long list is scrolled to the bottom', await ev(`(() => { const l = document.getElementById('history-list'); return l.scrollHeight > l.clientHeight + 20 && l.scrollTop + l.clientHeight >= l.scrollHeight - 2 && l.lastElementChild.querySelector('.history-turn') !== null; })()`));
  if (process.argv.includes('--screenshot')) await browser.screenshot('scratch-history.png');
  // the whole top is the handle: drag it into the middle of the screen (it is free there, and a drag does not close it), then to the left edge (it attaches, flush)
  const drag = async (from, to) => { await mouse('mouseMoved', from.cx, from.cy); await mouse('mousePressed', from.cx, from.cy, 1); for (let n = 1; n <= 10; n++) await mouse('mouseMoved', from.cx + ((to.x - from.cx) * n) / 10, from.cy + ((to.y - from.cy) * n) / 10, 1); await mouse('mouseReleased', to.x, to.y); await sleep(450); };
  await drag(await rectOf('.history-head'), { x: 600, y: 300 });
  const free = await bar();
  check('dragged by its top into the middle of the screen it stays there, free, and still open (the drag was not a click)', free.left > 300 && free.left < 900 && free.top > 150 && free.dock === '' && free.open === 'true', JSON.stringify(free));
  await drag(await rectOf('.history-head'), { x: 4, y: 400 });
  const latched = await bar();
  check('dragged near the left edge it attaches to it: touching the edge, no border on that side', latched.left === 0 && latched.dock === 'left' && latched.borderLeft === '0px', JSON.stringify(latched));
  await click('.history-head');
  check('clicking the top again closes it', (await bar()).open === 'false');
  await ev("document.getElementById('new-game').click()"); await sleep(200);
  await click('.history-head');
  check('a new game starts an empty history with one row for the new game', (await bar()).rows === 1);

  // ---- the life piece: Life above the number, - and +, a quick click shows no circle, and it can be dragged ----
  const life = () => ev("Number(document.getElementById('life').textContent)");
  const l0 = await life();
  await click('#life-minus'); await click('#life-plus'); await click('#life-plus');
  check('the - and + buttons change life by 1', (await life()) === l0 + 1, String(await life()));
  const num = await rectOf('#life');
  await mouse('mouseMoved', num.cx, num.cy); await mouse('mousePressed', num.cx, num.cy, 1); await sleep(120);
  const ringDuringClick = await ev("document.querySelector('.life-ring').classList.contains('holding')");
  await mouse('mouseReleased', num.cx, num.cy); await sleep(100);
  check('a click on the number gains 1 and the circle never shows', (await life()) === l0 + 2 && ringDuringClick === false);
  await mouse('mousePressed', num.cx, num.cy, 1); await sleep(400);
  const ringHeld = await ev("document.querySelector('.life-ring').classList.contains('holding')");
  await mouse('mouseReleased', num.cx, num.cy); await sleep(300);
  await ev("document.querySelector('.life-input')?.blur()");
  check('holding the number longer does show the circle', ringHeld === true);
  if (process.argv.includes('--screenshot')) await browser.screenshot('scratch-life.png');
  const lifeBox = await rectOf('#life-area');
  await drag(await rectOf('#life-grip'), { x: 640, y: 420 });
  const moved = await rectOf('#life-area');
  check('dragging the word Life moves the whole piece (and it stays where it is let go)', moved.x > lifeBox.x + 300 && moved.y > lifeBox.y + 200, JSON.stringify({ lifeBox, moved }));
  await drag(await rectOf('#life-grip'), { x: 4, y: 4 });
  check('and near the corner it docks again', (await rectOf('#life-area')).x < 20);

  // ---- drag-selecting the cards of the hand ----
  const handCards = await ev(`[...document.querySelectorAll('#hand > .card')].map((c) => { const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })`);
  const startX = 8; // (left of the first card, inside the area of the hand: half a card of room at each end)
  const startY = handCards[0].y + 120;
  await mouse('mouseMoved', startX, startY); await sleep(400);
  const where = await ev(`(() => { const e = document.elementFromPoint(${startX}, ${startY}); return e ? (e.closest('.card') ? 'card' : e.id || e.className || e.tagName) : null; })()`);
  await mouse('mousePressed', startX, startY, 1);
  for (let n = 1; n <= 10; n++) await mouse('mouseMoved', startX + ((handCards[2].x + handCards[2].w / 2 - startX) * n) / 10, startY + ((960 - startY) * n) / 10, 1);
  const during = await ev("document.querySelectorAll('.marquee').length");
  await mouse('mouseReleased', handCards[2].x + handCards[2].w / 2, 960); await sleep(150);
  const picked = await ev("document.querySelectorAll('#hand > .card.selected').length");
  check('dragging a rectangle from the area of the hand over some cards shows the rectangle and picks those cards of the hand', during === 1 && picked >= 2 && /cards picked/.test(await ev("document.getElementById('status').textContent")), JSON.stringify({ where, during, picked }));
  check('the battlefield has nothing picked by it', (await ev("document.querySelectorAll('#battlefield .card.selected').length")) === 0);
  // ---- the hand: Alt shows a larger picture, Shift+click picks cards, and a card is dragged to a new place ----
  await mouse('mouseMoved', 5, 5); await ev("document.getElementById('new-game').click()"); await sleep(500);
  const cardAt = async (i, dx = null) => ev(`(() => { const r = document.querySelectorAll('#hand > .card')[${i}].getBoundingClientRect(); return { x: r.x + ${dx === null ? 'r.width / 2' : dx}, y: r.y + 60 }; })()`);
  const raise = async (i) => { for (let n = 0; n < 2; n++) { const p = await cardAt(i); await mouse('mouseMoved', p.x, p.y); await sleep(450); } return cardAt(i); };
  const key = (type, name, modifiers) => browser.send('Input.dispatchKeyEvent', { type, key: name, code: name + 'Left', windowsVirtualKeyCode: name === 'Alt' ? 18 : 16, modifiers });
  const p0 = await raise(1);
  await key('rawKeyDown', 'Alt', 1); await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p0.x + 1, y: p0.y, modifiers: 1 }); await sleep(250);
  const shown = await ev("(() => { const b = document.getElementById('card-hover'); return Boolean(b) && !b.hidden && b.getBoundingClientRect().width > 100; })()");
  await key('keyUp', 'Alt', 0); await sleep(150);
  check('holding Alt over a card of the hand shows a larger picture, and letting go hides it', shown && (await ev("document.getElementById('card-hover').hidden")));
  const q = await raise(2);
  await mouse('mouseMoved', q.x, q.y); await mouse('mousePressed', q.x, q.y, 1); await mouse('mouseReleased', q.x, q.y); await sleep(150);
  const r = await raise(5); // (a card well away from the one that was clicked: that one came up and its neighbours moved aside)
  await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', buttons: 1, clickCount: 1, modifiers: 8 }); await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', buttons: 0, clickCount: 1, modifiers: 8 }); await sleep(200);
  check('a click, then Shift+click, picks two cards of the hand', (await ev("document.querySelectorAll('#hand > .card.selected').length")) === 2 && /2 cards picked/.test(await ev("document.getElementById('status').textContent")), await ev("document.getElementById('status').textContent"));
  await mouse('mouseMoved', 5, 5); await ev("document.getElementById('new-game').click()"); await sleep(500);
  const order = () => ev("[...document.querySelectorAll('#hand > .card')].map((c) => c.dataset.uid)");
  const before = await order();
  await raise(0);
  const from = await cardAt(0, 12); // (the left edge of the first card: the next card covers its middle)
  const last = await cardAt(before.length - 1);
  await mouse('mousePressed', from.x, from.y, 1);
  for (let n = 1; n <= 12; n++) await mouse('mouseMoved', from.x + ((last.x - from.x) * n) / 12, from.y, 1);
  await mouse('mouseReleased', last.x, from.y); await sleep(500);
  const after = await order();
  check('dragging the first card of the hand to the far end puts it last and keeps the others in order', after.length === before.length && after.at(-1) === before[0] && after.slice(0, -1).join() === before.slice(1).join(), JSON.stringify({ before, after }));
  check('no page errors', (await ev('window.__errors || []')).length === 0);
  await closeAllBrowsers();
} finally {
  await closeAllBrowsers().catch(() => {});
  if (server) await server.close();
}
if (failures.length) { console.log(`\n${failures.length} of ${checks} history and select checks FAILED.`); process.exit(1); }
console.log(`All ${checks} history and select checks passed.`);
