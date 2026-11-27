// Checks the stack window of the solo table (frontend/src/stack-window.js) in a real headless Chrome with the real card list: adding a card as a copy, notes, moving, Resolve top and Undo,
// and arrows. Short on purpose: one check for each thing a player does. Run from the repo root: node scripts/check-stack-ui.mjs (skipped without a card list: `npm run cards`).
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { openBrowser, closeAllBrowsers, waitFor, sleep } from './lib/browser.mjs';
import { buildCardIndex, matchDeck } from '../shared/card-match.mjs';
import { parseDeckText } from '../shared/deck-text.mjs';
import { makePreview, buildSavedDeck, serializeDeck } from '../shared/deck-preview.mjs';

if (!existsSync('frontend/public/data/cards.json')) { console.log('Stack window checks skipped: no card list here yet. Run `npm run cards`.'); process.exit(0); }

const PORT = 5196;
const PAGE = `http://127.0.0.1:${PORT}/pages/solo/index.html`;
let checks = 0;
const failures = [];
const check = (label, pass, detail = '') => { checks++; if (!pass) { failures.push(label); console.log(`FAIL  ${label}${detail ? '  (' + detail + ')' : ''}`); } };

const TEXT = 'COMMANDER:\n1 Eowyn, Lady of Rohan\n\nDECK:\n24 Forest\n4 Sol Ring\n4 Lightning Bolt\n4 Llanowar Elves\n24 Island';
const cards = JSON.parse(readFileSync('frontend/public/data/cards.json', 'utf8'));
const parsed = parseDeckText(TEXT);
const preview = makePreview(parsed, matchDeck(buildCardIndex(cards), parsed.entries));
const built = buildSavedDeck(preview, { name: 'Stack test deck', text: TEXT, commanderIds: preview.commander.ids });
if (preview.counts.problem !== 0 || !built.ok) { console.log('The test deck could not be built.'); process.exit(1); }
const DECK_JSON = serializeDeck(built.deck);
const art = (url) => ({ type: 'image/svg+xml', text: `<svg xmlns="http://www.w3.org/2000/svg" width="146" height="204"><rect width="146" height="204" fill="hsl(${parseInt(url.split('/').pop().slice(0, 4), 16) % 360},45%,38%)"/></svg>` });

let server = null;
try {
  server = await createServer({ configFile: 'vite.config.js', logLevel: 'error', server: { port: PORT, strictPort: true, host: '127.0.0.1' } });
  await server.listen();
  const browser = await openBrowser('stack-ui', { width: 1280, height: 1000 });
  const ev = (expression) => browser.eval(expression);
  await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await browser.fakeImages('https://cards.scryfall.io/*', art);
  await browser.fakeImages('https://backs.scryfall.io/*', null);
  await browser.goto(PAGE);
  await ev(`localStorage.removeItem('overloaded.decks'); localStorage.setItem('overloaded.deck', ${JSON.stringify(DECK_JSON)});`);
  await browser.goto(PAGE);
  await waitFor(async () => (await ev("!document.getElementById('game').hidden")) || null, 15000, 50);
  await ev("window.addEventListener('error', (e) => { window.__errors = (window.__errors || []).concat(String(e.message)); })");

  const count = (selector) => ev(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
  const mouse = (type, x, y, button = 'left', buttons = 0, modifiers = 0) => browser.send('Input.dispatchMouseEvent', { type, x, y, button, buttons, clickCount: 1, modifiers });
  const rectOf = (selector, i = 0) => ev(`(() => { const e = document.querySelectorAll(${JSON.stringify(selector)})[${i}]; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; })()`);
  const labels = () => ev(`[...document.querySelectorAll('.card-menu [role="menuitem"]')].map((x) => x.textContent.trim())`);
  const pick = async (text) => {
    const p = await ev(`(() => { const b = [...document.querySelectorAll('.card-menu [role="menuitem"]')].find((x) => x.textContent.trim() === ${JSON.stringify(text)}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (!p) return false;
    await mouse('mouseMoved', p.x, p.y); await mouse('mousePressed', p.x, p.y, 'left', 1); await mouse('mouseReleased', p.x, p.y);
    await sleep(120);
    return true;
  };
  const rightClick = async (selector, i = 0) => { const r = await rectOf(selector, i); await mouse('mouseMoved', r.cx, r.cy); await mouse('mousePressed', r.cx, r.cy, 'right', 2); await mouse('mouseReleased', r.cx, r.cy, 'right'); await sleep(150); };
  const menuOfHandCard = () => ev(`(() => { const c = document.querySelector('#hand > .card'); const r = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: Math.min(r.y + 30, innerHeight - 20) })); })()`);
  const addFromHand = async () => { await menuOfHandCard(); await sleep(150); await pick('Add to the stack'); await sleep(200); };
  const names = () => ev(`[...document.querySelectorAll('#stack-window .stack-item')].map((li) => li.dataset.kind === 'card' ? li.querySelector('.card').getAttribute('aria-label').split(/[,.]/)[0] : '[' + li.querySelector('textarea').value + ']')`);
  const ids = () => ev(`[...document.querySelectorAll('#stack-window .stack-item')].map((li) => li.dataset.id)`);
  const button = (label) => ev(`(() => { const b = [...document.querySelectorAll('#stack-window .stack-button')].find((x) => x.textContent === ${JSON.stringify(label)}); b.click(); return !b.disabled; })()`);
  const typeNote = async (text) => { await button('Add note'); await sleep(60); await browser.send('Input.insertText', { text }); await ev('document.activeElement.blur()'); await sleep(100); };
  const status = () => ev("document.getElementById('status').textContent");

  // ---- adding a card ----
  check('the stack is in the rail on the right, always open, with no tab (the redesign, 2026-11-25)', await ev(`(() => { const w = document.getElementById('stack-window'); const rail = document.querySelector('.tool-dock[data-dock="rail"]'); return rail.contains(w) && w.dataset.pinned === 'true' && w.dataset.open === 'true' && !w.querySelector('.stack-panel').inert && getComputedStyle(w.querySelector('.stack-tab')).display === 'none'; })()`));
  const handBefore = await count('#hand > .card');
  await menuOfHandCard(); await sleep(150);
  check('a card of the hand has "Add to the stack" in its menu', (await labels()).includes('Add to the stack'));
  await pick('Add to the stack');
  check('it puts a copy on the stack, opens the window, counts it, and leaves the card in the hand', (await count('#stack-window .stack-card')) === 1 && (await ev("document.getElementById('stack-window').dataset.open")) === 'true' && (await ev("document.querySelector('.stack-tab-count').textContent")) === '1' && (await count('#hand > .card')) === handBefore);
  check('the card is fully visible and sharp (opaque, the normal size of the picture) and is the only thing in its item', await ev(`(() => { const li = document.querySelector('#stack-window .stack-card'); const c = li.querySelector('.card'); return li.children.length === 1 && getComputedStyle(c).opacity === '1' && c.querySelector('img').getAttribute('src').includes('/normal/'); })()`));

  // a copy keeps what the card had and is separate from the real card
  await menuOfHandCard(); await sleep(150); await pick('Play'); await sleep(200);
  const onField = async (item) => { await ev(`(() => { const c = document.querySelector('#battlefield .card'); const r = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 })); })()`); await sleep(150); await pick(item); await sleep(200); };
  await onField('+1/+1 counter'); await onField('Add to the stack');
  const counterWords = await ev(`document.querySelector('#stack-window .stack-card .card').getAttribute('aria-label')`);
  await onField('+1/+1 counter');
  check('a copy keeps the counter it had, and the real card changing afterwards does not touch it', /\+1\/\+1/.test(counterWords) && (await ev(`document.querySelector('#stack-window .stack-card .card').getAttribute('aria-label')`)) === counterWords && (await ev(`document.querySelector('#battlefield .card').getAttribute('aria-label')`)) !== counterWords);

  // ---- moving, notes ----
  const two = await ids();
  await rightClick('#stack-window .stack-card', 0);
  check('the menu of the top card has Move down but no Move up', (await labels()).includes('Move down') && !(await labels()).includes('Move up'));
  await pick('Move down');
  check('Move down puts the top card second', (await ids()).join() === [two[1], two[0]].join());
  await typeNote('target');
  check('a note is added at the top and kept when it is left', (await names())[0] === '[target]');
  await button('Add note'); await sleep(60); await ev('document.activeElement.blur()'); await sleep(100);
  check('a note left empty is removed', (await count('#stack-window .stack-text')) === 1);
  await rightClick('#stack-window .stack-text', 0); await pick('Remove');
  check('a note is removed from its menu', (await count('#stack-window .stack-text')) === 0);
  check('there are no buttons beside the cards, only the four at the top', (await ev(`document.querySelectorAll('#stack-window .stack-list button:not(.card)').length`)) === 0 && (await count('#stack-window .stack-head .stack-button')) === 4);

  // a real mouse drag: the item follows, the others slide aside, and the order changes
  const before = await ids();
  const a = await rectOf('#stack-window .stack-card', 0);
  const b = await rectOf('#stack-window .stack-card', 1);
  await mouse('mouseMoved', a.cx, a.cy); await mouse('mousePressed', a.cx, a.cy, 'left', 1);
  for (let n = 1; n <= 10; n++) await mouse('mouseMoved', a.cx, a.cy + ((b.cy + b.h * 0.6 - a.cy) * n) / 10, 'left', 1);
  const dragging = await ev(`({ lifted: document.querySelectorAll('#stack-window .dragging').length, aside: [...document.querySelectorAll('#stack-window .stack-item:not(.dragging)')].filter((li) => li.style.translate).length })`);
  await mouse('mouseReleased', a.cx, b.cy + b.h * 0.6); await sleep(150);
  check('dragging lifts the card and slides the other aside; letting go below it swaps them', dragging.lifted === 1 && dragging.aside === 1 && (await ids()).join() === [before[1], before[0]].join(), JSON.stringify({ dragging, before, after: await ids() }));
  // a right click outside while a card is held: the left release never arrives, and the card must go back, not keep following the pointer
  const order = (await ids()).join();
  const held = await rectOf('#stack-window .stack-card', 0);
  await mouse('mouseMoved', held.cx, held.cy); await mouse('mousePressed', held.cx, held.cy, 'left', 1);
  for (let n = 1; n <= 6; n++) await mouse('mouseMoved', held.cx, held.cy + n * 12, 'left', 1);
  await mouse('mousePressed', 700, 300, 'right', 3); await mouse('mouseReleased', 700, 300, 'right', 1);
  await mouse('mouseMoved', 700, 500, 'none', 0); await mouse('mouseMoved', held.cx, held.cy + 250, 'none', 0); await sleep(150);
  check('a right click outside while a card is held puts it back and it does not keep following the pointer', (await count('#stack-window .dragging')) === 0 && (await ev("[...document.querySelectorAll('#stack-window .stack-item')].filter((li) => li.style.translate).length")) === 0 && (await ids()).join() === order);
  await mouse('mouseReleased', held.cx, held.cy, 'left', 0);

  // ---- Resolve top, Undo, Clear ----
  const handNow = await count('#hand > .card');
  await button('Resolve top'); await sleep(100);
  check('Resolve top takes one card off the stack and does not touch the game', (await count('#stack-window .stack-card')) === 1 && (await count('#hand > .card')) === handNow);
  await button('Undo'); await sleep(100);
  check('Undo brings it back', (await count('#stack-window .stack-card')) === 2);
  await button('Clear'); await sleep(100);
  check('Clear empties it and shows a short line', (await count('#stack-window .stack-card')) === 0 && /Right-click/.test(await ev("document.querySelector('#stack-window .stack-empty').textContent")));

  // ---- arrows ----
  await addFromHand(); await addFromHand();
  const far = () => ev(`(() => { const c = [...document.querySelectorAll('#battlefield .card')].find((x) => x.getBoundingClientRect().left > 300); return c ? c.dataset.uid : null; })()`); // clear of the window, which covers the left of the table
  await ev(`document.querySelector('#battlefield .card').click()`); await sleep(100);
  for (let n = 0; n < 40 && !(await far()); n++) { for (const type of ['rawKeyDown', 'keyUp']) await browser.send('Input.dispatchKeyEvent', { type, key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39, modifiers: 1 }); await sleep(25); }
  const farUid = await far();
  const farBox = await ev(`(() => { const r = document.querySelector('#battlefield .card[data-uid="${farUid}"]').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; })()`);
  const arrows = () => count('.stack-arrows .stack-arrow');
  const shiftDrag = async (from, to) => { await mouse('mouseMoved', from.cx, from.cy, 'none', 0, 8); await mouse('mousePressed', from.cx, from.cy, 'left', 1, 8); for (let n = 1; n <= 8; n++) await mouse('mouseMoved', from.cx + ((to.cx - from.cx) * n) / 8, from.cy + ((to.cy - from.cy) * n) / 8, 'left', 1, 8); await mouse('mouseReleased', to.cx, to.cy, 'left', 0, 8); await sleep(150); };
  const straight = (d) => { const p = [...d.matchAll(/([MLQ]) ([\d.]+) ([\d.]+)(?: ([\d.]+) ([\d.]+))?/g)].map((m) => (m[1] === 'Q' ? { x: +m[4], y: +m[5] } : { x: +m[2], y: +m[3] })); return p.every((q, i) => i === 0 || q.x === p[i - 1].x || q.y === p[i - 1].y || Math.abs(q.x - p[i - 1].x) <= 8 && Math.abs(q.y - p[i - 1].y) <= 8); }; // (the rounded corners are the only slanted bits, at most 7 px)
  const c0 = await rectOf('#stack-window .stack-card', 0);
  const c1 = await rectOf('#stack-window .stack-card', 1);
  await shiftDrag(c0, c1);
  check('Shift+drag from one card to another draws an arrow of straight segments with square corners', (await arrows()) === 1 && !(await ev(`document.querySelector('.stack-arrow-line').getAttribute('d')`)).includes('C') && straight(await ev(`document.querySelector('.stack-arrow-line').getAttribute('d')`)), await ev(`document.querySelector('.stack-arrow-line')?.getAttribute('d')`));
  await shiftDrag(c1, farBox);
  const d2 = await ev(`document.querySelectorAll('.stack-arrow-line')[1]?.getAttribute('d')`);
  check('Shift+drag to a card on the battlefield makes a second one that ends just outside that card', (await arrows()) === 2 && /^M /.test(d2) && straight(d2));
  await shiftDrag(c0, c0);
  await shiftDrag(c0, c1);
  check('an arrow onto the same card twice, or onto itself, is refused', (await arrows()) === 2 && /Already there/.test(await status()));
  const d0 = await ev(`document.querySelector('.stack-arrow-line').getAttribute('d')`);
  await rightClick('#stack-window .stack-card', 0); await pick('Move to bottom'); await sleep(400);
  check('the arrows follow the cards when they move', (await ev(`document.querySelector('.stack-arrow-line').getAttribute('d')`)) !== d0 && (await arrows()) === 2);
  await rightClick('#stack-window .stack-card', 1); await pick('Aim arrow...'); await sleep(80);
  check('the menu line "Aim arrow..." starts an arrow, and Escape cancels it', await ev("document.body.classList.contains('stack-aiming')"));
  for (const type of ['rawKeyDown', 'keyUp']) await browser.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(80);
  check('...and after Escape nothing is left aiming', !(await ev("document.body.classList.contains('stack-aiming')")) && (await arrows()) === 2);
  const mid = await ev(`(() => { const p = document.querySelectorAll('.stack-arrows .stack-arrow-hit')[0]; const q = p.getPointAtLength(p.getTotalLength() / 2); return { x: q.x, y: q.y }; })()`);
  await mouse('mouseMoved', mid.x, mid.y); await mouse('mousePressed', mid.x, mid.y, 'right', 2); await mouse('mouseReleased', mid.x, mid.y, 'right'); await sleep(150);
  check('right-clicking an arrow offers Remove, and it takes the arrow away; Undo brings it back', JSON.stringify(await labels()) === '["Remove"]' && (await pick('Remove')) && (await arrows()) === 1 && (await button('Undo')) !== null && (await sleep(100), (await arrows()) === 2));
  check('the arrows show while the stack is in the rail', await ev(`getComputedStyle(document.querySelector('.stack-arrows')).display !== 'none'`));

  if (process.argv.includes('--screenshot')) await browser.screenshot('scratch-stack.png');
  // ---- the limit ----
  for (let n = 0; n < 45; n++) await typeNote('n' + n);
  check('the stack holds 40 items and says "Stack full." for more', (await count('#stack-window .stack-item')) === 40 && /Stack full/.test(await status()));
  check('no page errors', (await ev('window.__errors || []')).length === 0);
  await closeAllBrowsers();
} finally {
  await closeAllBrowsers().catch(() => {});
  if (server) await server.close();
}
if (failures.length) { console.log(`\n${failures.length} of ${checks} stack window checks FAILED.`); process.exit(1); }
console.log(`All ${checks} stack window checks passed.`);
