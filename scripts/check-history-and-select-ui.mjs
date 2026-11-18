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
  const bar = () => ev(`(() => { const p = document.getElementById('history-bar'); const r = p.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, h: r.height, open: p.dataset.open, expanded: document.querySelector('.history-toggle').getAttribute('aria-expanded'), listShown: !document.getElementById('history-list').hidden, rows: document.querySelectorAll('.history-row').length, count: document.querySelector('.history-count').textContent }; })()`);
  const first = await bar();
  check('the history bar is a thin bar called Game history, closed, docked at the right edge', first.open === 'false' && first.expanded === 'false' && !first.listShown && first.h < 50 && first.right > 1280 - 16 && (await ev("document.querySelector('.history-title').textContent")) === 'Game history', JSON.stringify(first));
  await ev("document.getElementById('draw').click()"); await sleep(100);
  await ev("document.querySelector('.history-toggle').click()"); await sleep(100);
  const opened = await bar();
  check('clicking the title opens it downward and it lists the move (the new game, then the draw), newest first', opened.listShown && opened.expanded === 'true' && opened.h > first.h + 20 && opened.rows === 2 && /^Drew /.test(await ev("document.querySelector('.history-row .history-text').textContent")) && opened.top === first.top, JSON.stringify(opened));
  await ev("document.getElementById('draw').click()"); await sleep(100);
  if (process.argv.includes('--screenshot')) await browser.screenshot('scratch-history.png');
  check('each move adds a row and the count follows', (await bar()).rows === 3 && (await bar()).count === '3');
  // drag it out by its grip into the middle of the screen: it is free there, and docks again near the left edge
  const grip = await rectOf('.history-grip');
  const drag = async (from, to) => { await mouse('mouseMoved', from.cx, from.cy); await mouse('mousePressed', from.cx, from.cy, 1); for (let n = 1; n <= 10; n++) await mouse('mouseMoved', from.cx + ((to.x - from.cx) * n) / 10, from.cy + ((to.y - from.cy) * n) / 10, 1); await mouse('mouseReleased', to.x, to.y); await sleep(450); };
  await drag(grip, { x: 600, y: 300 });
  const free = await bar();
  check('dragged by the grip into the middle of the screen it stays there, free, and stays open', free.left > 300 && free.left < 900 && free.top > 150 && free.open === 'true', JSON.stringify(free));
  const grip2 = await rectOf('.history-grip');
  await drag(grip2, { x: 4, y: 400 });
  const latched = await bar();
  check('dragged near the left edge it latches onto it', latched.left <= 10, JSON.stringify(latched));
  await ev("document.querySelector('.history-toggle').click()"); await sleep(100);
  check('clicking the title again closes it', (await bar()).open === 'false');
  await ev("document.getElementById('new-game').click()"); await sleep(200);
  await ev("document.querySelector('.history-toggle').click()"); await sleep(100);
  check('a new game starts an empty history with one row for the new game', (await bar()).rows === 1);

  // ---- drag-selecting the cards of the hand ----
  await ev("document.querySelector('.history-toggle').click()"); await sleep(100);
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
  check('no page errors', (await ev('window.__errors || []')).length === 0);
  await closeAllBrowsers();
} finally {
  await closeAllBrowsers().catch(() => {});
  if (server) await server.close();
}
if (failures.length) { console.log(`\n${failures.length} of ${checks} history and select checks FAILED.`); process.exit(1); }
console.log(`All ${checks} history and select checks passed.`);
