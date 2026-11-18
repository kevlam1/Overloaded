// Checks the stack window of the solo table (frontend/src/stack-window.js) in a real headless Chrome, against the REAL card list: it slides out from the left edge, a card is added from the
// right-click menu as a COPY (counters kept, later changes to the real card do not reach it), text boxes, Up and Down, a real mouse drag to reorder, Resolve top, Undo, Clear, and the game
// itself is never touched. Card pictures are answered by a stand-in. Run from the repo root: node scripts/check-stack-ui.mjs   (skipped when there is no card list: run `npm run cards`)
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { openBrowser, closeAllBrowsers, waitFor, sleep } from './lib/browser.mjs';
import { buildCardIndex, matchDeck } from '../shared/card-match.mjs';
import { parseDeckText } from '../shared/deck-text.mjs';
import { makePreview, buildSavedDeck, serializeDeck } from '../shared/deck-preview.mjs';

if (!existsSync('frontend/public/data/cards.json')) {
  console.log('Stack window checks skipped: there is no card list here yet. Run `npm run cards` to build one.');
  process.exit(0);
}

const PORT = 5196;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const PAGE = `${ORIGIN}/pages/solo/index.html`;
let checks = 0;
const failures = [];
function check(label, pass, detail = '') {
  checks++;
  if (!pass) { failures.push(label); console.log(`FAIL  ${label}${detail ? '  (' + detail + ')' : ''}`); }
}

const DECK_TEXT = 'COMMANDER:\n1 Eowyn, Lady of Rohan\n\nDECK:\n24 Forest\n4 Sol Ring\n4 Lightning Bolt\n4 Llanowar Elves\n24 Island';
const cards = JSON.parse(readFileSync('frontend/public/data/cards.json', 'utf8'));
const parsed = parseDeckText(DECK_TEXT);
const preview = makePreview(parsed, matchDeck(buildCardIndex(cards), parsed.entries));
if (preview.counts.problem !== 0) { console.log(`The test deck did not match the card list: ${JSON.stringify(preview.problems)}`); process.exit(1); }
const built = buildSavedDeck(preview, { name: 'Stack test deck', text: DECK_TEXT, commanderIds: preview.commander.ids });
if (!built.ok) { console.log(`The test deck could not be built: ${built.error}`); process.exit(1); }
const DECK_JSON = serializeDeck(built.deck);
const cardArt = (url) => {
  const id = url.split('/').pop().replace('.jpg', '');
  const hue = parseInt(id.slice(0, 4), 16) % 360;
  return { type: 'image/svg+xml', text: `<svg xmlns="http://www.w3.org/2000/svg" width="146" height="204" viewBox="0 0 146 204"><rect width="146" height="204" rx="9" fill="hsl(${hue},45%,38%)"/></svg>` };
};

let server = null;
try {
  server = await createServer({ configFile: 'vite.config.js', logLevel: 'error', server: { port: PORT, strictPort: true, host: '127.0.0.1' } });
  await server.listen();
  const browser = await openBrowser('stack-ui', { width: 1280, height: 1000 });
  const ev = (expression) => browser.eval(expression);
  await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await browser.fakeImages('https://cards.scryfall.io/*', cardArt);
  await browser.fakeImages('https://backs.scryfall.io/*', null);
  await ev("window.addEventListener('error', (e) => { window.__errors = (window.__errors || []).concat(String(e.message)); })").catch(() => {});
  await browser.goto(ORIGIN + '/pages/solo/index.html');
  await ev(`localStorage.removeItem('overloaded.decks'); localStorage.setItem('overloaded.deck', ${JSON.stringify(DECK_JSON)}); localStorage.removeItem('overloaded.sound');`);
  await browser.goto(PAGE);
  await waitFor(async () => (await ev("!document.getElementById('game').hidden")) || null, 15000, 50);
  await ev("window.addEventListener('error', (e) => { window.__errors = (window.__errors || []).concat(String(e.message)); })");

  const $text = (id) => ev(`document.getElementById(${JSON.stringify(id)}).textContent`);
  const count = (selector) => ev(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
  const mouse = (type, x, y, button = 'left', buttons = 0) => browser.send('Input.dispatchMouseEvent', { type, x, y, button, buttons, clickCount: 1 });
  const rectOf = (selector, index = 0) => ev(`(() => { const e = document.querySelectorAll(${JSON.stringify(selector)})[${index}]; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; })()`);
  const menuLabels = () => ev(`[...document.querySelectorAll('.card-menu [role="menuitem"]')].map((x) => x.textContent.trim())`);
  const pressMenuItem = async (text) => {
    const p = await ev(`(() => { const b = [...document.querySelectorAll('.card-menu [role="menuitem"]')].find((x) => x.textContent.trim() === ${JSON.stringify(text)}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (!p) return false;
    await mouse('mouseMoved', p.x, p.y); await mouse('mousePressed', p.x, p.y, 'left', 1); await mouse('mouseReleased', p.x, p.y);
    await sleep(120);
    return true;
  };
  // a real right click on an element (the menu is opened by the contextmenu event the browser makes from it)
  const rightClick = async (selector, index = 0, dy = null) => {
    const r = await rectOf(selector, index);
    const x = r.cx; const y = dy === null ? r.cy : r.y + dy;
    await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y, 'right', 2); await mouse('mouseReleased', x, y, 'right');
    await sleep(150);
  };
  const stackNames = () => ev(`[...document.querySelectorAll('#stack-window .stack-item')].map((li) => li.dataset.kind === 'card' ? li.querySelector('.card').getAttribute('aria-label').split(/[,.]/)[0] : '[' + li.querySelector('textarea').value + ']')`);
  const clickIn = (selector, index = 0) => ev(`document.querySelectorAll(${JSON.stringify(selector)})[${index}].click()`);
  const stackButton = (label) => ev(`(() => { const b = [...document.querySelectorAll('#stack-window .stack-button')].find((x) => x.textContent === ${JSON.stringify(label)}); return b ? { disabled: b.disabled } : null; })()`);
  const pressStackButton = (label) => ev(`[...document.querySelectorAll('#stack-window .stack-button')].find((x) => x.textContent === ${JSON.stringify(label)}).click()`);
  const handCount = () => count('#hand > .card');
  const handFirstName = () => ev(`document.querySelector('#hand > .card').getAttribute('aria-label').split(/[,.]/)[0]`);

  // ---- before anything is added ----
  check('the tab is there at the left edge, the window is slid away (not open, kept from the keyboard) and nothing is counted', await ev(`(() => { const w = document.getElementById('stack-window'); const t = w.querySelector('.stack-tab'); const p = w.querySelector('.stack-panel'); const r = t.getBoundingClientRect(); const pr = p.getBoundingClientRect(); return w.dataset.open === 'false' && t.getAttribute('aria-expanded') === 'false' && p.inert === true && r.left <= 2 && r.width > 10 && r.right < 80 && pr.right <= r.left + 2 && w.querySelector('.stack-tab-count').hidden === true; })()`));
  check('the tab is visible and clear of the hand and the life total (the middle of the left edge)', await ev(`(() => { const r = document.querySelector('.stack-tab').getBoundingClientRect(); return r.top > 120 && r.bottom < innerHeight - 160; })()`));

  // ---- the menu line ----
  const handBefore = await handCount();
  const firstName = await handFirstName();
  await ev(`(() => { const c = document.querySelector('#hand > .card'); const r = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: Math.min(r.y + 30, innerHeight - 20) })); })()`);
  await sleep(150);
  const labels = await menuLabels();
  check('the right-click menu of a card of the hand has Add to the stack', labels.includes('Add to the stack'), JSON.stringify(labels));
  check('...before View details', labels.indexOf('Add to the stack') < labels.indexOf('View details'), JSON.stringify(labels));
  await pressMenuItem('Add to the stack');
  check('choosing it puts a copy on the stack, the tab counts 1 and the window slides out', (await stackNames()).length === 1 && (await stackNames())[0] === firstName && (await $text('stack-window').then(() => ev("document.querySelector('.stack-tab-count').textContent"))) === '1' && (await ev("document.getElementById('stack-window').dataset.open")) === 'true' && (await ev("document.querySelector('.stack-panel').inert")) === false, JSON.stringify(await stackNames()));
  check('the card is still in the hand (a copy: the game is not touched)', (await handCount()) === handBefore && (await handFirstName()) === firstName);
  check('the status line says what happened', (await $text('status')) === `Added ${firstName} to the stack.`, await $text('status'));
  check('the copy is on screen, inside the window, with a picture', await ev(`(() => { const c = document.querySelector('#stack-window .stack-card .card'); const r = c.getBoundingClientRect(); const img = c.querySelector('img'); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && r.width > 80 && r.height > 110 && Boolean(img) && img.getAttribute('src').includes('scryfall'); })()`));
  check('the first card is labelled the top of the stack', (await ev("document.querySelector('#stack-window .stack-item .stack-label')?.textContent")) === 'Top of the stack');

  // ---- a copy keeps what is on the card, and is separate from it ----
  // play a card from the hand, give it a +1/+1 counter, put a copy on the stack, then tap the real card and change its counter
  await ev(`(() => { const c = document.querySelector('#hand > .card'); const r = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: Math.min(r.y + 30, innerHeight - 20) })); })()`);
  await sleep(150);
  await pressMenuItem('Play'); await sleep(200);
  const playedName = await ev(`document.querySelector('#battlefield .card').getAttribute('aria-label').split(/[,.]/)[0]`);
  const onField = () => ev(`(() => { const c = document.querySelector('#battlefield .card'); const r = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 })); })()`);
  await onField(); await sleep(150); await pressMenuItem('+1/+1 counter'); await sleep(200);
  const counterWords = await ev(`document.querySelector('#battlefield .card').getAttribute('aria-label')`);
  await onField(); await sleep(150);
  check('a card on the battlefield has Add to the stack in its menu', (await menuLabels()).includes('Add to the stack'));
  await pressMenuItem('Add to the stack'); await sleep(200);
  const names = await stackNames();
  check('the new copy is on TOP (first in the list) and the first one is below it', names.length === 2 && names[0] === playedName && names[1] === firstName, JSON.stringify(names));
  const copyWords = await ev(`document.querySelector('#stack-window .stack-card .card').getAttribute('aria-label')`);
  check('the copy keeps the +1/+1 counter the card had when it was added', /\+1\/\+1/.test(counterWords) && copyWords === counterWords, JSON.stringify({ counterWords, copyWords }));
  await onField(); await sleep(150); await pressMenuItem('Tap'); await sleep(150);
  await onField(); await sleep(150); await pressMenuItem('+1/+1 counter'); await sleep(200);
  const laterReal = await ev(`document.querySelector('#battlefield .card').getAttribute('aria-label')`);
  const laterCopy = await ev(`document.querySelector('#stack-window .stack-card .card').getAttribute('aria-label')`);
  check('the real card was tapped and got another counter, and the copy is as it was when it was added', /tapped/.test(laterReal) && !/tapped/.test(laterCopy) && laterCopy === counterWords && laterReal !== counterWords, JSON.stringify({ laterReal, laterCopy }));
  check('the stack window\'s cards do not take the pointer (the window takes the clicks and drags) and have no selection', await ev(`(() => { const c = document.querySelector('#stack-window .card'); return getComputedStyle(c).pointerEvents === 'none' && c.disabled === true; })()`));

  // ---- Up and Down ----
  await clickIn('#stack-window .stack-card .stack-small', 1); await sleep(100); // the Down button of the first card
  check('Down moves the top card down one place (the label follows the new top card)', JSON.stringify(await stackNames()) === JSON.stringify([firstName, playedName]) && (await ev("document.querySelector('#stack-window .stack-item[data-top] .card').getAttribute('aria-label').split(/[,.]/)[0]")) === firstName, JSON.stringify(await stackNames()));
  check('the top card has no Up button to press and the last has no Down', await ev(`(() => { const items = [...document.querySelectorAll('#stack-window .stack-card')]; const up = (li) => li.querySelectorAll('.stack-small')[0].disabled; const down = (li) => li.querySelectorAll('.stack-small')[1].disabled; return up(items[0]) === true && down(items.at(-1)) === true && up(items[1]) === false; })()`));
  await clickIn('#stack-window .stack-card .stack-small', 4); await sleep(100); // the Up button of the second card
  check('Up moves it back', JSON.stringify(await stackNames()) === JSON.stringify([playedName, firstName]), JSON.stringify(await stackNames()));

  // ---- text boxes ----
  await pressStackButton('Add text'); await sleep(150);
  check('Add text puts an empty text box at the top and focuses it', (await stackNames())[0] === '[]' && (await ev("document.activeElement && document.activeElement.classList.contains('stack-note')")) === true, JSON.stringify(await stackNames()));
  await browser.send('Input.insertText', { text: 'target: the bears' });
  await ev("document.activeElement.blur()"); await sleep(150);
  check('the text is kept when the box is left', (await stackNames())[0] === '[target: the bears]', JSON.stringify(await stackNames()));
  await clickIn('#stack-window .stack-card .stack-small', 2); await sleep(100); // "Text below" of the first card
  check('"Text below" puts a text box under that card', JSON.stringify((await stackNames()).map((n) => n.startsWith('[') ? 'T' : 'C')) === JSON.stringify(['T', 'C', 'T', 'C']), JSON.stringify(await stackNames()));
  check('the top of the stack is still the first CARD (a text box above does not take the label)', (await ev("document.querySelector('#stack-window .stack-item[data-top]').dataset.kind")) === 'card');

  if (process.argv.includes('--screenshot')) await browser.screenshot('scratch-stack.png'); // (a stack with cards and text boxes, open; scratch files are ignored by git)

  // ---- a real drag ----
  const ids = () => ev(`[...document.querySelectorAll('#stack-window .stack-item')].map((li) => li.dataset.id)`);
  const before = await stackNames();
  const idsBefore = await ids();
  const grab = await rectOf('#stack-window .stack-card', 0); // the first card
  const target = await rectOf('#stack-window .stack-card', 1);
  await mouse('mouseMoved', grab.cx, grab.cy); await mouse('mousePressed', grab.cx, grab.cy, 'left', 1);
  for (let n = 1; n <= 10; n++) await mouse('mouseMoved', grab.cx, grab.cy + ((target.cy + target.h * 0.6 - grab.cy) * n) / 10, 'left', 1);
  const dragging = await ev(`({ dragging: document.querySelectorAll('#stack-window .stack-item.dragging').length, marked: document.querySelectorAll('#stack-window .drop-before, #stack-window .drop-end').length })`);
  await mouse('mouseReleased', grab.cx, target.cy + target.h * 0.6); await sleep(150);
  const after = await stackNames();
  const idsAfter = await ids();
  check('while dragging, the item is lifted and a line shows where it will land', dragging.dragging === 1 && dragging.marked === 1, JSON.stringify(dragging));
  check('letting go below the next card moves the card there (a real mouse drag)', idsAfter.length === idsBefore.length && idsAfter.indexOf(idsBefore[1]) === idsAfter.length - 1 && idsAfter.indexOf(idsBefore[3]) === idsAfter.length - 2, JSON.stringify({ idsBefore, idsAfter }));
  check('after the drop nothing is left lifted or marked', await ev(`document.querySelectorAll('#stack-window .dragging, #stack-window .drop-before, #stack-window .drop-end').length === 0`));
  const justClick = await rectOf('#stack-window .stack-card', 0);
  const orderBeforeClick = await stackNames();
  await mouse('mouseMoved', justClick.cx, justClick.cy); await mouse('mousePressed', justClick.cx, justClick.cy, 'left', 1); await mouse('mouseMoved', justClick.cx, justClick.cy + 2, 'left', 1); await mouse('mouseReleased', justClick.cx, justClick.cy + 2); await sleep(100);
  check('a press that moves only 2 pixels is a click, not a drag: nothing moves', JSON.stringify(await stackNames()) === JSON.stringify(orderBeforeClick));

  // ---- the menu of a card in the stack ----
  await rightClick('#stack-window .stack-card', 0);
  const stackMenu = await menuLabels();
  check('right-clicking a card of the stack opens its own menu', JSON.stringify(stackMenu) === JSON.stringify(['Move to top', 'Move to bottom', 'Add text below', 'Take off the stack']), JSON.stringify(stackMenu));
  const firstCard = (await stackNames()).find((n) => !n.startsWith('['));
  await pressMenuItem('Move to bottom');
  check('Move to bottom puts it last', (await stackNames()).at(-1) === firstCard, JSON.stringify(await stackNames()));

  // ---- Resolve top, Undo, Clear ----
  const handNow = await handCount();
  const fieldNow = await count('#battlefield .card');
  const beforeResolve = await stackNames();
  const topIndex = beforeResolve.findIndex((n) => !n.startsWith('['));
  check('Resolve top is on while there is a card', (await stackButton('Resolve top')).disabled === false);
  await pressStackButton('Resolve top'); await sleep(150);
  const afterResolve = await stackNames();
  check('Resolve top takes the top card and the text boxes above it off the stack', afterResolve.length === beforeResolve.length - (topIndex + 1) && JSON.stringify(afterResolve) === JSON.stringify(beforeResolve.slice(topIndex + 1)), JSON.stringify({ beforeResolve, afterResolve }));
  check('...and the game is not touched (the same hand and battlefield)', (await handCount()) === handNow && (await count('#battlefield .card')) === fieldNow);
  check('...and the status line says so', /^Resolved .* \(it left the stack; your game is unchanged\)\.$/.test(await $text('status')), await $text('status'));
  await pressStackButton('Undo'); await sleep(150);
  check('Undo brings the resolved card and its text boxes back', JSON.stringify(await stackNames()) === JSON.stringify(beforeResolve), JSON.stringify(await stackNames()));
  await pressStackButton('Clear'); await sleep(150);
  check('Clear empties the stack: the empty words show, the count is gone, and Resolve top and Clear are off', (await count('#stack-window .stack-item')) === 0 && (await count('#stack-window .stack-empty')) === 1 && (await ev("document.querySelector('.stack-tab-count').hidden")) === true && (await stackButton('Resolve top')).disabled === true && (await stackButton('Clear')).disabled === true);
  await pressStackButton('Undo'); await sleep(150);
  check('Undo brings everything back after a Clear', JSON.stringify(await stackNames()) === JSON.stringify(beforeResolve));
  for (let n = 0; n < 40 && !(await stackButton('Undo')).disabled; n++) await pressStackButton('Undo');
  check('Undo goes back to the empty stack and then is off', (await count('#stack-window .stack-item')) === 0 && (await stackButton('Undo')).disabled === true);

  // ---- sliding it away ----
  await mouse('mouseMoved', 5, 5);
  const tabBox = await rectOf('.stack-tab');
  await mouse('mouseMoved', tabBox.cx, tabBox.cy); await mouse('mousePressed', tabBox.cx, tabBox.cy, 'left', 1); await mouse('mouseReleased', tabBox.cx, tabBox.cy); await sleep(150);
  check('clicking the tab slides the window away: it is closed, kept from the keyboard, and its edge is off the screen', await ev(`(() => { const w = document.getElementById('stack-window'); const p = w.querySelector('.stack-panel').getBoundingClientRect(); return w.dataset.open === 'false' && w.querySelector('.stack-tab').getAttribute('aria-expanded') === 'false' && w.querySelector('.stack-panel').inert === true && p.right <= w.querySelector('.stack-tab').getBoundingClientRect().left + 2; })()`));
  const tabBack = await rectOf('.stack-tab'); // (the tab moves with the window: it is at the left edge when the window is away)
  await mouse('mouseMoved', tabBack.cx, tabBack.cy); await mouse('mousePressed', tabBack.cx, tabBack.cy, 'left', 1); await mouse('mouseReleased', tabBack.cx, tabBack.cy); await sleep(150);
  check('clicking it again slides the window out, with its edge at the left of the screen', await ev(`(() => { const w = document.getElementById('stack-window'); const p = w.querySelector('.stack-panel').getBoundingClientRect(); return w.dataset.open === 'true' && p.left <= 1 && p.width > 200 && p.right <= innerWidth; })()`));
  await ev("document.querySelector('.stack-tab').focus()");
  await browser.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(100);
  check('Escape slides it away too', (await ev("document.getElementById('stack-window').dataset.open")) === 'false');

  // ---- limits ----
  await ev("document.querySelector('.stack-tab').click()");
  for (let n = 0; n < 41; n++) await ev("document.querySelectorAll('#stack-window .stack-button')[2].click()"); // Add text, again and again
  check('the stack stops at 40 items and the 41st is refused in words', (await count('#stack-window .stack-item')) === 40 && /full/.test(await $text('status')), (await $text('status')) + ' ' + (await count('#stack-window .stack-item')));
  check('the window never makes the page scroll and the hand and battlefield are still there', await ev(`document.scrollingElement.scrollTop === 0 && document.querySelectorAll('#hand > .card').length > 0`));

  check('no error was raised by the page', (await ev('window.__errors || []')).length === 0, JSON.stringify(await ev('window.__errors || []')));
  await closeAllBrowsers();
} finally {
  await closeAllBrowsers().catch(() => {});
  if (server) await server.close();
}

if (failures.length) { console.log(`\n${failures.length} of ${checks} stack window checks FAILED.`); process.exit(1); }
console.log(`All ${checks} stack window checks passed.`);
