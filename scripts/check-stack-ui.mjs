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
  check('the first card is marked as the top of the stack (data and the words a screen reader hears), with no label drawn on it', await ev(`(() => { const li = document.querySelector('#stack-window .stack-card'); return li.dataset.top === 'true' && /top of the stack/.test(li.getAttribute('aria-label')) && li.children.length === 1; })()`));

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

  // ---- no buttons beside the cards: the stack is the cards, and the right-click menu and the keyboard do the rest ----
  check('there are no buttons beside the cards or the text boxes (only the four buttons at the top of the window)', await ev(`document.querySelectorAll('#stack-window .stack-list button:not(.card)').length === 0 && document.querySelectorAll('#stack-window .stack-panel > .stack-head button').length === 4`));
  check('a card item is just the card: nothing else is in it', await ev(`[...document.querySelectorAll('#stack-window .stack-card')].every((li) => li.children.length === 1 && li.children[0].classList.contains('card'))`));

  // ---- Move up and Move down, from the menu ----
  await rightClick('#stack-window .stack-card', 0);
  const firstMenu = await menuLabels();
  check('the top card has no Move up or Move to top (nothing is above it) but has Move down', !firstMenu.includes('Move up') && !firstMenu.includes('Move to top') && firstMenu.includes('Move down') && firstMenu.includes('Move to bottom'), JSON.stringify(firstMenu));
  await pressMenuItem('Move down'); await sleep(150);
  check('Move down moves the top card down one place (the top of the stack is the other card now)', JSON.stringify(await stackNames()) === JSON.stringify([firstName, playedName]) && (await ev("document.querySelector('#stack-window .stack-item[data-top] .card').getAttribute('aria-label').split(/[,.]/)[0]")) === firstName, JSON.stringify(await stackNames()));
  await rightClick('#stack-window .stack-card', 1);
  const lastMenu = await menuLabels();
  check('the bottom card has Move up but no Move down', lastMenu.includes('Move up') && !lastMenu.includes('Move down') && !lastMenu.includes('Move to bottom'), JSON.stringify(lastMenu));
  await pressMenuItem('Move up'); await sleep(150);
  check('Move up moves it back', JSON.stringify(await stackNames()) === JSON.stringify([playedName, firstName]), JSON.stringify(await stackNames()));

  // ---- the keyboard ----
  const key = async (name, code, vk, modifiers = 0) => { await browser.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: name, code, windowsVirtualKeyCode: vk, modifiers }); await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code, windowsVirtualKeyCode: vk, modifiers }); await sleep(120); };
  await ev("document.querySelector('#stack-window .stack-card').focus()");
  check('a card of the stack can be reached with the keyboard and says what it is and how to move it', await ev(`(() => { const li = document.querySelector('#stack-window .stack-card'); return document.activeElement === li && /top of the stack/.test(li.getAttribute('aria-label')) && /Alt/.test(li.getAttribute('aria-label')); })()`));
  await key('ArrowDown', 'ArrowDown', 40, 1); // Alt+Down
  check('Alt and Down moves the focused card down one place and it keeps the focus', JSON.stringify(await stackNames()) === JSON.stringify([firstName, playedName]) && (await ev("document.activeElement.dataset.kind === 'card' && document.activeElement.getAttribute('aria-label').startsWith(" + JSON.stringify(playedName) + ")")), JSON.stringify(await stackNames()));
  await key('ArrowUp', 'ArrowUp', 38, 1); // Alt+Up
  check('Alt and Up moves it back', JSON.stringify(await stackNames()) === JSON.stringify([playedName, firstName]), JSON.stringify(await stackNames()));
  await key('ArrowDown', 'ArrowDown', 40); // plain Down: the focus goes to the next item
  check('the arrow keys alone move the focus from one item to the next (nothing moves)', (await ev("document.activeElement.getAttribute('aria-label').startsWith(" + JSON.stringify(firstName) + ")")) && JSON.stringify(await stackNames()) === JSON.stringify([playedName, firstName]));

  // ---- text boxes ----
  await pressStackButton('Add text'); await sleep(150);
  check('Add text puts an empty text box at the top and focuses it', (await stackNames())[0] === '[]' && (await ev("document.activeElement && document.activeElement.classList.contains('stack-note')")) === true, JSON.stringify(await stackNames()));
  await browser.send('Input.insertText', { text: 'target: the bears' });
  await ev("document.activeElement.blur()"); await sleep(150);
  check('the text is kept when the box is left', (await stackNames())[0] === '[target: the bears]', JSON.stringify(await stackNames()));
  await rightClick('#stack-window .stack-card', 0);
  const withText = await menuLabels();
  check('the menu of a card has Add text below', withText.includes('Add text below'), JSON.stringify(withText));
  await pressMenuItem('Add text below'); await sleep(150);
  check('"Add text below" puts a text box under that card, and focuses it', JSON.stringify((await stackNames()).map((n) => n.startsWith('[') ? 'T' : 'C')) === JSON.stringify(['T', 'C', 'T', 'C']) && (await ev("document.activeElement.classList.contains('stack-note')")), JSON.stringify(await stackNames()));
  await browser.send('Input.insertText', { text: 'second note' });
  await ev("document.activeElement.blur()"); await sleep(150);
  check('the top of the stack is still the first CARD (a text box above does not take the mark)', (await ev("document.querySelector('#stack-window .stack-item[data-top]').dataset.kind")) === 'card');
  await pressStackButton('Add text'); await sleep(120);
  await ev("document.activeElement.blur()"); await sleep(150);
  check('a text box left empty is taken away (nothing to keep)', (await count('#stack-window .stack-text')) === 2, JSON.stringify(await stackNames()));
  await rightClick('#stack-window .stack-text', 1);
  const textMenu = await menuLabels();
  check('right-clicking a text box opens its menu with Remove text box (and the moves)', textMenu.includes('Remove text box') && textMenu.includes('Add text below') && textMenu.includes('Move up'), JSON.stringify(textMenu));
  await pressMenuItem('Remove text box'); await sleep(150);
  check('Remove text box takes it off', (await count('#stack-window .stack-text')) === 1 && (await stackNames()).length === 3, JSON.stringify(await stackNames()));
  await rightClick('#stack-window .stack-card', 0); await pressMenuItem('Add text below'); await sleep(150);
  await browser.send('Input.insertText', { text: 'again' });
  await ev("document.activeElement.blur()"); await sleep(150);
  check('the three items again: a note, a card, a note, a card', JSON.stringify((await stackNames()).map((n) => n.startsWith('[') ? 'T' : 'C')) === JSON.stringify(['T', 'C', 'T', 'C']), JSON.stringify(await stackNames()));
  if (process.argv.includes('--screenshot')) await browser.screenshot('scratch-stack.png'); // (a stack with cards and text boxes, open; scratch files are ignored by git)

  // ---- a real drag, with the others sliding aside (reduced motion is on here: the next block turns the animation on) ----
  const ids = () => ev(`[...document.querySelectorAll('#stack-window .stack-item')].map((li) => li.dataset.id)`);
  const before = await stackNames();
  const idsBefore = await ids();
  const grab = await rectOf('#stack-window .stack-card', 0); // the first card
  const target = await rectOf('#stack-window .stack-card', 1);
  await mouse('mouseMoved', grab.cx, grab.cy); await mouse('mousePressed', grab.cx, grab.cy, 'left', 1);
  for (let n = 1; n <= 10; n++) await mouse('mouseMoved', grab.cx, grab.cy + ((target.cy + target.h * 0.6 - grab.cy) * n) / 10, 'left', 1);
  const dragging = await ev(`(() => { const lifted = document.querySelectorAll('#stack-window .stack-item.dragging'); const moved = [...document.querySelectorAll('#stack-window .stack-item:not(.dragging)')].filter((li) => li.style.translate && li.style.translate !== 'none' && li.style.translate !== '0px'); return { dragging: lifted.length, followed: lifted[0] ? lifted[0].style.translate : '', aside: moved.length }; })()`);
  await mouse('mouseReleased', grab.cx, target.cy + target.h * 0.6); await sleep(150);
  const after = await stackNames();
  const idsAfter = await ids();
  check('while dragging, the card is lifted and follows the pointer, and the items it passes slide aside to open its place', dragging.dragging === 1 && /px/.test(dragging.followed) && dragging.aside >= 2, JSON.stringify(dragging));
  check('letting go below the next card moves the card there (a real mouse drag)', idsAfter.length === idsBefore.length && idsAfter.indexOf(idsBefore[1]) === idsAfter.length - 1 && idsAfter.indexOf(idsBefore[3]) === idsAfter.length - 2, JSON.stringify({ idsBefore, idsAfter }));
  check('after the drop nothing is left lifted or shifted', await ev(`document.querySelectorAll('#stack-window .dragging').length === 0 && [...document.querySelectorAll('#stack-window .stack-item')].every((li) => !li.style.translate)`));
  const justClick = await rectOf('#stack-window .stack-card', 0);
  const orderBeforeClick = await stackNames();
  await mouse('mouseMoved', justClick.cx, justClick.cy); await mouse('mousePressed', justClick.cx, justClick.cy, 'left', 1); await mouse('mouseMoved', justClick.cx, justClick.cy + 2, 'left', 1); await mouse('mouseReleased', justClick.cx, justClick.cy + 2); await sleep(100);
  check('a press that moves only 2 pixels is a click, not a drag: nothing moves', JSON.stringify(await stackNames()) === JSON.stringify(orderBeforeClick));
  // a text box is dragged by its grip
  const gripBox = await rectOf('#stack-window .stack-text .stack-grip', 0);
  const textIdsBefore = await ids();
  const lastCard = await rectOf('#stack-window .stack-card', 1);
  await mouse('mouseMoved', gripBox.cx, gripBox.cy); await mouse('mousePressed', gripBox.cx, gripBox.cy, 'left', 1);
  for (let n = 1; n <= 10; n++) await mouse('mouseMoved', gripBox.cx, gripBox.cy + ((lastCard.cy + lastCard.h * 0.4 - gripBox.cy) * n) / 10, 'left', 1);
  await mouse('mouseReleased', gripBox.cx, lastCard.cy + lastCard.h * 0.4); await sleep(150);
  const textIdsAfter = await ids();
  check('a text box is dragged by the strip at its top, and moves down past the cards', textIdsAfter.indexOf(textIdsBefore[0]) > 0 && textIdsAfter.length === textIdsBefore.length, JSON.stringify({ textIdsBefore, textIdsAfter }));
  await mouse('mouseMoved', 5, 5);

  // ---- the menu of a card in the stack, to the bottom ----
  await rightClick('#stack-window .stack-card', 0);
  const stackMenu = await menuLabels();
  check('right-clicking a card of the stack opens its own menu', stackMenu.includes('Add text below') && stackMenu.includes('Take off the stack') && stackMenu.includes('Move to bottom'), JSON.stringify(stackMenu));
  const firstCard = (await stackNames()).find((n) => !n.startsWith('['));
  await pressMenuItem('Move to bottom');
  check('Move to bottom puts it last', (await stackNames()).at(-1) === firstCard, JSON.stringify(await stackNames()));
  await rightClick('#stack-window .stack-card', 0);
  await pressMenuItem('Take off the stack'); await sleep(120);
  check('Take off the stack removes the card (and Delete on a focused item does too)', (await count('#stack-window .stack-card')) === 1, JSON.stringify(await stackNames()));
  await ev("document.querySelector('#stack-window .stack-card').focus()"); await key('Delete', 'Delete', 46);
  check('Delete on a focused card takes it off the stack', (await count('#stack-window .stack-card')) === 0, JSON.stringify(await stackNames()));
  for (let n = 0; n < 6 && !(await stackButton('Undo')).disabled; n++) await pressStackButton('Undo'); // (back to a stack with two cards for the next part)
  const needCards = await count('#stack-window .stack-card');
  check('Undo brought the cards back', needCards >= 1, String(needCards));

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

  // ---- the glide: with animation on, the items slide aside while dragging and glide home after the drop ----
  await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await ev("document.querySelector('.stack-tab').getAttribute('aria-expanded') === 'true' || document.querySelector('.stack-tab').click()");
  await sleep(400);
  const addTyped = async (text) => { await pressStackButton('Add text'); await sleep(60); await browser.send('Input.insertText', { text }); await ev("document.activeElement.blur()"); await sleep(60); };
  await addTyped('one'); await addTyped('two'); await addTyped('three');
  await sleep(400);
  const glideBefore = await stackNames();
  const g1 = await rectOf('#stack-window .stack-grip', 0);
  const g3 = await rectOf('#stack-window .stack-grip', 2);
  await mouse('mouseMoved', g1.cx, g1.cy); await mouse('mousePressed', g1.cx, g1.cy, 'left', 1);
  for (let n = 1; n <= 12; n++) await mouse('mouseMoved', g1.cx, g1.cy + ((g3.cy + 30 - g1.cy) * n) / 12, 'left', 1);
  const slide = await ev(`[...document.querySelectorAll('#stack-window .stack-item:not(.dragging)')].map((li) => ({ transition: li.style.transition, translate: li.style.translate }))`);
  check('with animation on, the items it passes slide aside with a transition (and the ones it did not pass stay)', slide.filter((s) => /translate/.test(s.transition) && s.translate !== '').length === 2 && slide.every((s) => s.translate === '' || /^0(px)? -?\d/.test(s.translate)), JSON.stringify(slide));
  await mouse('mouseReleased', g1.cx, g3.cy + 30);
  await sleep(40);
  const gliding = await ev(`document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('#stack-window')).length`);
  await sleep(500);
  const settled = await ev(`document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('#stack-window') && a.playState === 'running').length`);
  check('after the drop the items glide to their places (animations are running), and they settle', gliding >= 2 && settled === 0, JSON.stringify({ gliding, settled }));
  check('the three notes are in the new order (the first went to the end)', JSON.stringify(await stackNames()) === JSON.stringify([glideBefore[1], glideBefore[2], glideBefore[0]]), JSON.stringify({ glideBefore, now: await stackNames() }));
  await rightClick('#stack-window .stack-text', 0); await pressMenuItem('Remove text box'); await sleep(40);
  const removing = await ev(`document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('#stack-window')).length`);
  check('taking one away makes the ones below it glide up', removing >= 1, String(removing));
  await sleep(400);
  await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

  // ---- limits ----
  for (let n = 0; n < 45; n++) await addTyped('n' + n);
  check('the stack stops at 40 items and the one past it is refused in words', (await count('#stack-window .stack-item')) === 40 && /full/.test(await $text('status')), (await $text('status')) + ' ' + (await count('#stack-window .stack-item')));
  check('the window never makes the page scroll and the hand and battlefield are still there', await ev(`document.scrollingElement.scrollTop === 0 && document.querySelectorAll('#hand > .card').length > 0`));

  check('no error was raised by the page', (await ev('window.__errors || []')).length === 0, JSON.stringify(await ev('window.__errors || []')));
  await closeAllBrowsers();
} finally {
  await closeAllBrowsers().catch(() => {});
  if (server) await server.close();
}

if (failures.length) { console.log(`\n${failures.length} of ${checks} stack window checks FAILED.`); process.exit(1); }
console.log(`All ${checks} stack window checks passed.`);
