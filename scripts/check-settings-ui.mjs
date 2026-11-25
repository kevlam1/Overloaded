// Short browser check of the new Settings menu (real headless Chrome, real card list, stand-in pictures): the tabs, choosing a key (and the swap), that the new key works and the old one does not, that
// a chosen key is kept after a reload, that the Settings key can be changed too, and the Hand sorting page. Run from the repo root: node scripts/check-settings-ui.mjs (skipped without a card list: `npm run cards`).
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { openBrowser, closeAllBrowsers, waitFor, sleep } from './lib/browser.mjs';
import { buildCardIndex, matchDeck } from '../shared/card-match.mjs';
import { parseDeckText } from '../shared/deck-text.mjs';
import { makePreview, buildSavedDeck, serializeDeck } from '../shared/deck-preview.mjs';

if (!existsSync('frontend/public/data/cards.json')) { console.log('Settings checks skipped: no card list here yet. Run `npm run cards`.'); process.exit(0); }

const PORT = 5196;
const PAGE = `http://127.0.0.1:${PORT}/solo`;
let checks = 0;
const failures = [];
const check = (label, pass, detail = '') => { checks++; if (!pass) { failures.push(label); console.log(`FAIL  ${label}${detail ? '  (' + detail + ')' : ''}`); } };

const TEXT = 'COMMANDER:\n1 Eowyn, Lady of Rohan\n\nDECK:\n24 Forest\n4 Sol Ring\n4 Lightning Bolt\n4 Llanowar Elves\n24 Island';
const cards = JSON.parse(readFileSync('frontend/public/data/cards.json', 'utf8'));
const parsed = parseDeckText(TEXT);
const preview = makePreview(parsed, matchDeck(buildCardIndex(cards), parsed.entries));
const built = buildSavedDeck(preview, { name: 'Test deck', text: TEXT, commanderIds: preview.commander.ids });
if (!built.ok) { console.log('The test deck could not be built.'); process.exit(1); }
const DECK = serializeDeck(built.deck);

let server = null;
try {
  server = await createServer({ configFile: 'vite.config.js', logLevel: 'error', server: { port: PORT, strictPort: true, host: '127.0.0.1' } });
  await server.listen();
  const browser = await openBrowser('settings-ui', { width: 1280, height: 800, acceptConfirms: false });
  const ev = (expression) => browser.eval(expression);
  await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await browser.fakeImages('https://cards.scryfall.io/*', () => ({ type: 'image/svg+xml', text: '<svg xmlns="http://www.w3.org/2000/svg" width="146" height="204"><rect width="146" height="204" fill="#456"/></svg>' }));
  const start = async () => {
    await browser.goto(PAGE);
    await ev(`localStorage.setItem('overloaded.deck', ${JSON.stringify(DECK)})`);
    await browser.goto(PAGE);
    await waitFor(async () => (await ev("!document.getElementById('game').hidden")) || null, 15000, 50);
    await sleep(300);
  };
  const KEYS = { x: ['x', 'KeyX', 88], d: ['d', 'KeyD', 68], f: ['f', 'KeyF', 70], g: ['g', 'KeyG', 71], m: ['m', 'KeyM', 77], h: ['h', 'KeyH', 72], Tab: ['Tab', 'Tab', 9], Escape: ['Escape', 'Escape', 27] };
  const press = async (name) => { const [key, code, vk] = KEYS[name]; const text = key.length === 1 ? key : undefined; await browser.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: vk, ...(text ? { text } : {}) }); await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk }); await sleep(150); };
  const hand = () => ev("document.querySelectorAll('#hand > .card').length");
  const open = () => ev("!document.getElementById('settings-menu').hidden");
  const keyOf = (action, slot = 0) => ev(`document.querySelector('.kb-key[data-action="${action}"][data-slot="${slot}"]').textContent`);
  const choose = async (action, key, slot = 0) => { await ev(`document.querySelector('.kb-key[data-action="${action}"][data-slot="${slot}"]').click()`); await sleep(100); await press(key); };

  await start();
  await ev("document.getElementById('settings-button').click()");
  check('Settings opens as a panel with four tabs: General, Hand sorting, Keybinds and About, General first', (await ev("[...document.querySelectorAll('#settings-menu [role=tab]')].map((t) => t.textContent + ':' + t.getAttribute('aria-selected')).join()")) === 'General:true,Hand sorting:false,Keybinds:false,About:false');
  await ev("document.getElementById('tab-keys').click()");
  check('the Keybinds tab lists the keys: tap on E and Q, flip on F, draw on D, Settings on Tab', (await ev("(() => { const k = (a) => [...document.querySelectorAll('.kb-key[data-action=\"' + a + '\"]')].map((b) => b.textContent).join('/'); return [k('tap'), k('flip'), k('draw'), k('settings')].join(' '); })()")) === 'E/Q F/Add key D/Add key Tab/Add key');

  await choose('draw', 'x');
  check('choosing X for Draw puts X on it', (await keyOf('draw')) === 'X' && (await ev("document.querySelector('.kb-status').textContent")) === 'Draw a card is on X.');
  await press('Escape'); // closes Settings (nothing is being chosen now)
  const before = await hand();
  await press('x');
  const afterX = await hand();
  await press('d');
  check('X now draws a card and D no longer does', afterX === before + 1 && (await hand()) === afterX, `${before} ${afterX} ${await hand()}`);

  await ev("document.getElementById('settings-button').click()");
  await choose('flip', 'x'); // X is Draw's: a popup asks first
  const popup = await ev("document.querySelector('.confirm-box')?.textContent ?? ''");
  check('choosing a key another action has asks first, naming that action', /Draw a card has X/.test(popup) && (await keyOf('draw')) === 'X', popup);
  await ev("document.querySelector('.confirm-no').click()");
  await sleep(100);
  check('Cancel in the popup changes nothing and leaves Settings open', (await keyOf('flip')) === 'F' && (await keyOf('draw')) === 'X' && (await open()));
  await choose('flip', 'x');
  await ev("document.querySelector('.confirm-yes').click()");
  await sleep(100);
  check('Swap in the popup swaps: Flip gets X and Draw gets F', (await keyOf('flip')) === 'X' && (await keyOf('draw')) === 'F' && /Flip face down is on X\. Draw a card is now on F\./.test(await ev("document.querySelector('.kb-status').textContent")));
  await ev("document.querySelector('.kb-key[data-action=\"draw\"][data-slot=\"0\"]').click()");
  await press('Escape');
  check('Escape while choosing a key cancels it and leaves Settings open', (await open()) && (await keyOf('draw')) === 'F' && (await ev("document.querySelector('[data-listening]')")) === null);

  await ev("document.getElementById('settings-close').click()");
  await browser.goto(PAGE);
  await waitFor(async () => (await ev("!document.getElementById('game').hidden")) || null, 15000, 50);
  await sleep(300);
  const h0 = await hand();
  await press('f');
  check('the keys are kept: after a reload F draws', (await hand()) === h0 + 1);

  await ev("document.getElementById('settings-button').click()");
  await ev("document.getElementById('tab-keys').click()");
  await choose('settings', 'g');
  await press('Escape');
  await press('Tab');
  const tabOpens = await open();
  await press('g');
  check('the Settings key can be changed: G opens Settings and Tab does not', (await open()) && !tabOpens);

  const holdBtn = async (selector, ms) => { const [x, y] = await ev("(() => { document.querySelector('" + selector + "').scrollIntoView({ block: 'center' }); const b = document.querySelector('" + selector + "').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; })()"); await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await sleep(ms); await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); await sleep(150); };
  await holdBtn('#kb-reset-all', 500);
  check('a short press on Reset all does nothing', (await keyOf('settings')) === 'G');
  await holdBtn('#kb-reset-all', 2300);
  check('Reset all keybinds brings every default key back after a 2 second hold', (await keyOf('draw')) === 'D' && (await keyOf('settings')) === 'Tab' && (await keyOf('tap', 1)) === 'Q', await keyOf('draw') + await keyOf('settings') + await keyOf('tap', 1));

  await choose('mulligan', 'm');
  await choose('shuffle', 'h');
  await ev("document.getElementById('settings-close').click()");
  await press('m');
  check('a key on Mulligan presses Mulligan', /1 so far/.test(await ev("document.getElementById('mulligan').textContent")));
  await ev("document.getElementById('settings-button').click()");
  await ev("document.getElementById('tab-hand').click()");
  const types = () => ev("[...document.querySelectorAll('#hand-order-settings .sort-card')[0].querySelectorAll('.type-name')].map((n) => n.textContent).join()");
  const first = await types();
  await ev("document.querySelectorAll('#hand-order-settings .sort-card')[0].querySelectorAll('.type-move')[1].click()"); // Creatures one place later
  const moved = await types();
  check('the Hand sorting page has a card for the card types, the colors and the lands, and an arrow moves a type', (await ev("document.querySelectorAll('#hand-order-settings .sort-card').length")) === 3 && first.startsWith('Creatures,Instants') && moved.startsWith('Instants,Creatures'), moved);
  await ev("document.querySelectorAll('#hand-order-settings .sort-card')[0].querySelector('.sort-reset').click()");
  check('Reset puts the types back in the default order', (await types()) === first);
  // dragging a pill with the mouse (Kevin, 2026-11-21: it did not move or slide well): the row wraps, so the first pill is carried onto the last line, past the last pill's middle
  const mouse = (type, x, y, buttons = 0) => browser.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons, clickCount: 1 });
  const pillAt = (i) => ev(`(() => { const row = document.querySelectorAll('#hand-order-settings .sort-card')[0]; const pills = row.querySelectorAll('.type-pill'); const p = pills[${i} < 0 ? pills.length + ${i} : ${i}]; row.scrollIntoView({ block: 'center' }); const r = p.querySelector('.type-name').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  const carry = async (from, to, finish) => { await mouse('mouseMoved', from.x, from.y); await mouse('mousePressed', from.x, from.y, 1); for (let n = 1; n <= 20; n++) { await mouse('mouseMoved', from.x + ((to.x - from.x) * n) / 20, from.y + ((to.y - from.y) * n) / 20, 1); await sleep(12); } await finish(); await mouse('mouseReleased', to.x, to.y); await sleep(250); };
  const lastPill = await pillAt(-1);
  await carry(await pillAt(0), { x: lastPill.x + 40, y: lastPill.y + 34 }, async () => {}); // (let go just under the last line: the pills re-wrap while one is carried, so a point beside the last pill is not stable with every font; under the row it always goes last)
  const dragged = await types();
  check('a pill dragged onto the last line goes last, and the order is kept', dragged.split(',').pop() === first.split(',')[0] && JSON.parse(await ev("localStorage.getItem('overloaded.handTypeOrder')")).at(-1) === 'creature', dragged);
  await carry(await pillAt(0), await pillAt(-1), () => press('Escape'));
  check('Escape while dragging puts the pill back and leaves Settings open', (await types()) === dragged && (await open()), await types());
  check('no page errors', (await ev('window.__errors || []')).length === 0);
  await closeAllBrowsers();
} finally {
  await closeAllBrowsers().catch(() => {});
  if (server) await server.close();
}
if (failures.length) { console.log(`\n${failures.length} of ${checks} settings checks FAILED.`); process.exit(1); }
console.log(`All ${checks} settings checks passed.`);
