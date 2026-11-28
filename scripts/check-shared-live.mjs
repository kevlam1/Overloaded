// The Shared view (Kevin, 2026-11-25; shared/plane.mjs), with two real browsers against the REAL project: the host picks Shared in the lobby; both players' battlefields are on
// one plane with a home each; a card Alice plays shows in her home on Bob's page; Bob drags Alice's card into the commons and Alice's page shows it there; Alice drags it back; the
// camera zooms and a drop still lands on the right cell. Needs the rules with meta/view 'shared' and tables/{code}/plane pasted. Short on purpose: one check per thing a player does.
// Run: node --env-file=.env scripts/check-shared-live.mjs [--screenshot]. Makes one throwaway table, deletes it and every account it made.
import { LIVE_PORT } from './lib/live-port.mjs';
import { createServer } from 'vite';
import { openBrowser, closeAllBrowsers, waitFor, authOf, sleep, text, tableShown, click } from './lib/browser.mjs';
import { emptyLibrary, addDeck, serializeLibrary, LIBRARY_KEY } from '../shared/deck-library.mjs';

const DB = (process.env.FIREBASE_DATABASE_URL ?? '').replace(/\/$/, '');
const API_KEY = process.env.FIREBASE_API_KEY ?? '';
if (!DB || !API_KEY) { console.log('The Firebase settings are not in the environment. Run: node --env-file=.env scripts/check-shared-live.mjs'); process.exit(1); }
const PORT = LIVE_PORT; // (scripts/lib/live-port.mjs: the local port the web API key allows for these checks)
const PAGE = `http://127.0.0.1:${PORT}/pages/lobby/index.html`;
const REFERER = 'https://overloaded-spell.vercel.app/';
const rest = async (method, path, token) => { const r = await fetch(`${DB}/${path}.json?auth=${encodeURIComponent(token)}`, { method }); let json = null; try { json = await r.json(); } catch {} return { status: r.status, json }; };
const deleteAccount = (token) => fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${API_KEY}`, { method: 'POST', headers: { 'content-type': 'application/json', Referer: REFERER }, body: JSON.stringify({ idToken: token }) }).catch(() => {});
const accountsOf = (browser) => browser.eval(`new Promise((resolve) => { const open = indexedDB.open('firebaseLocalStorageDb'); open.onerror = () => resolve([]); open.onsuccess = () => { const db = open.result; if (!db.objectStoreNames.contains('firebaseLocalStorage')) return resolve([]); const req = db.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll(); req.onsuccess = () => resolve(req.result.filter((row) => row.value && row.value.uid).map((row) => ({ uid: row.value.uid, token: row.value.stsTokenManager && row.value.stsTokenManager.accessToken }))); req.onerror = () => resolve([]); }; })`);

const results = [];
const record = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const savedDeck = (name, commander) => ({ version: 1, name, savedAt: new Date().toISOString(), skipped: 0, text: '', commander: [uuid(100)], cards: [{ i: uuid(100), n: commander, qty: 1, section: 'commander' }, { i: uuid(1), n: 'Island', qty: 30, section: 'main' }] });
let idNumber = 0;
const library = (name, commander) => addDeck(emptyLibrary(), savedDeck(name, commander), { format: 'commander', bracket: 2, newId: () => `d${String(++idNumber).padStart(10, '0')}` }).library;

let server = null; let exitCode = 0;
const made = []; const accounts = [];
try {
  server = await createServer({ configFile: 'vite.config.js', logLevel: 'error', server: { port: PORT, strictPort: true, host: '127.0.0.1' } });
  await server.listen();
  const alice = await openBrowser('shared-alice', { width: 1366, height: 768 });
  const bob = await openBrowser('shared-bob', { width: 1366, height: 768 });
  for (const page of [alice, bob]) { await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }); await page.fakeImages('https://cards.scryfall.io/*'); }
  for (const [page, name, lib] of [[alice, 'Alice', library('Goblins', 'Krenko, Mob Boss')], [bob, 'Bob', library('Elves', 'Ezuri, Renegade Leader')]]) {
    await page.goto(PAGE);
    await page.eval(`localStorage.setItem(${JSON.stringify(LIBRARY_KEY)}, ${JSON.stringify(serializeLibrary(lib))}); localStorage.setItem('overloaded.name', ${JSON.stringify(name)}); ${process.argv.includes('--light') ? "localStorage.setItem('overloaded.theme', 'light');" : ''}`); // (--light: the light theme)
  }
  await alice.goto(PAGE);
  const SEATS = Number((process.argv.find((a) => a.startsWith('--seats=')) ?? '--seats=2').split('=')[1]); // (--seats=4: bots fill seats 3 and 4)
  await alice.eval(`document.getElementById('seats').value = '${SEATS}'`);
  await click(alice, 'create');
  await waitFor(async () => (await tableShown(alice)) || null, 20000);
  const aliceAuth = await authOf(alice);
  const code = (await text(alice, 'code')).trim();
  made.push({ code, alice: aliceAuth });
  await bob.goto(`http://127.0.0.1:${PORT}/lobby/${code}`);
  await waitFor(async () => (await tableShown(bob)) || null, 20000);
  for (const page of [alice, bob]) {
    await waitFor(async () => ((await page.eval(`document.querySelectorAll('#deck-tiles .deck-choice').length`)) > 0) || null, 15000, 200);
    await page.eval(`document.querySelector('#deck-tiles .deck-choice').click()`);
    await waitFor(async () => ((await page.eval(`document.querySelector('#deck-tiles .deck-choice.chosen')`)) !== null) || null, 15000, 200);
    await click(page, 'ready');
  }
  for (let seat = 3; seat <= SEATS; seat++) {
    await waitFor(async () => (await alice.eval(`Boolean(document.querySelector('#players button[data-bot="add"][data-seat="${seat}"]'))`)) || null, 15000, 200);
    await alice.eval(`document.querySelector('#players button[data-bot="add"][data-seat="${seat}"]').click()`);
    await waitFor(async () => (await alice.eval(`[...document.querySelectorAll('#players .seat')].filter((s) => s.dataset.ready === '1').length`)) >= seat || null, 30000, 300);
  }
  await alice.eval(`document.querySelector('#view-switch button[data-view="shared"]').click()`);
  const seen = await waitFor(async () => (await bob.eval(`document.querySelector('#view-switch button[data-view="shared"]').getAttribute('aria-pressed')`)) === 'true' || null, 15000, 250).catch(() => false);
  record('the host picks Shared in the lobby and Bob sees it', Boolean(seen));
  await waitFor(async () => (await alice.eval(`!document.getElementById('start').disabled`)) || null, 20000, 250);
  await alice.eval(`document.querySelector('#first-switch button[data-first="1"]').click()`); await sleep(400); // (Alice goes first)
  await click(alice, 'start');
  for (const page of [alice, bob]) await waitFor(async () => ((await page.eval(`document.querySelectorAll('#hand .card').length`)) === 7) || null, 40000, 300);
  await sleep(800);
  const plane = await alice.eval(`({ view: document.body.dataset.view, homes: document.querySelectorAll('#battlefield .plane-home').length, commons: Boolean(document.querySelector('#battlefield .plane-commons')), camera: !document.getElementById('plane-controls').hidden, others: document.querySelectorAll('#opponent-list .opponent.offstage').length })`);
  record('the match opens in the Shared view: one plane with a home for each player, the commons and the camera', plane.view === 'shared' && plane.homes === SEATS && plane.commons && plane.camera, JSON.stringify(plane));

  // Alice plays a card from her hand (the menu's Play): Bob sees it in Alice's layer, inside Alice's home
  const play = async (page) => { await page.eval(`(() => { const c = document.querySelector('#hand > .card'); const r = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: Math.min(r.y + 20, innerHeight - 20) })); })()`); await sleep(200); await page.eval(`[...document.querySelectorAll('.card-menu [role="menuitem"]')].find((x) => x.textContent.trim() === 'Play')?.click()`); await sleep(500); };
  await play(alice);
  const aliceCard = await alice.eval(`document.querySelector('#battlefield > .card')?.dataset.uid ?? null`);
  const onBob = await waitFor(async () => (await bob.eval(`(() => { const layer = document.querySelector('#battlefield .plane-layer'); const card = layer?.querySelector(':scope > .card[data-uid="${aliceCard}"]'); return card ? { col: Number(card.dataset.col), row: Number(card.dataset.row) } : null; })()`)) || null, 15000, 250).catch(() => null);
  const aliceHome = await bob.eval(`(() => { const home = [...document.querySelectorAll('#battlefield .plane-home')].find((h) => h.textContent.includes('Alice')); return home ? { col: Number(home.style.gridColumnStart || home.style.gridColumn.split('/')[0]) - 1, row: Number(home.style.gridRowStart || home.style.gridRow.split('/')[0]) - 1 } : null; })()`);
  record("the card Alice plays shows on Bob's plane, in Alice's home", Boolean(onBob) && Boolean(aliceHome) && onBob.col >= aliceHome.col && onBob.col < aliceHome.col + 112 && onBob.row >= aliceHome.row && onBob.row < aliceHome.row + 50, JSON.stringify({ aliceCard, onBob, aliceHome }));
  if (process.argv.includes('--screenshot')) await bob.screenshot('scratch-shared-bob.png');

  // Bob drags Alice's card into the commons (rows 50 to 80): a real mouse drag
  const mouse = (page, type, x, y, buttons = 0) => page.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons, clickCount: 1 });
  const drag = async (page, from, to) => { await mouse(page, 'mouseMoved', from.x, from.y); await sleep(60); await mouse(page, 'mousePressed', from.x, from.y, 1); for (let n = 1; n <= 14; n++) { await mouse(page, 'mouseMoved', from.x + ((to.x - from.x) * n) / 14, from.y + ((to.y - from.y) * n) / 14, 1); await sleep(16); } await mouse(page, 'mouseReleased', to.x, to.y); await sleep(700); };
  // (the plane is 236 by 130 since 2026-11-27, and a player sitting along the top sees it turned half a turn: the point is then mirrored through the middle)
  const cellPoint = (page, col, row) => page.eval(`(() => { const b = document.getElementById('battlefield'); const r = b.getBoundingClientRect(); const x = r.left + (${col} + 3.5) * r.width / 236; const y = r.top + (${row} + 5) * r.height / 130; return b.dataset.turn === '2' ? { x: r.left + r.right - x, y: r.top + r.bottom - y } : { x, y }; })()`);
  const cardCentre = (page, selector) => page.eval(`(() => { const c = document.querySelector(${JSON.stringify(selector)}); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await bob.eval(`document.querySelector('.plane-button[aria-label="See the whole table"]').click()`); await sleep(500);
  const from = await cardCentre(bob, `#battlefield .plane-layer > .card[data-uid="${aliceCard}"]`);
  // Bob carries it (pressed, moving, not yet let go): Alice's page shows it lifted and moving with Bob's name, and will not let her pick it up meanwhile
  const to = await cellPoint(bob, 100, 60);
  await mouse(bob, 'mouseMoved', from.x, from.y); await sleep(60); await mouse(bob, 'mousePressed', from.x, from.y, 1);
  for (let n = 1; n <= 14; n++) { await mouse(bob, 'mouseMoved', from.x + ((to.x - from.x) * n) / 14, from.y + ((to.y - from.y) * n) / 14, 1); await sleep(30); }
  await sleep(200);
  if (process.argv.includes('--screenshot')) await bob.screenshot('scratch-shared-carrying-bob.png');
  const lifted = await waitFor(async () => (await alice.eval(`(() => { const c = document.querySelector('#battlefield > .card.carried-remote[data-uid="${aliceCard}"]'); const tag = document.querySelector('#battlefield .plane-target.remote .plane-carrier'); return c && tag ? { tag: tag.textContent, moved: getComputedStyle(c).translate !== 'none' } : null; })()`)) || null, 15000, 150).catch(() => null);
  record("while Bob carries Alice's card, Alice sees it lifted and moving, with Bob's name on the place it is over", Boolean(lifted) && lifted.tag === 'Bob' && lifted.moved, JSON.stringify(lifted));
  await alice.eval(`document.querySelector('.plane-button[aria-label="See the whole table"]').click()`); await sleep(500); // (the whole table on her screen, so the carried card is in view to try to grab)
  if (process.argv.includes('--screenshot')) await alice.screenshot('scratch-shared-carrying-alice.png');
  const grab = await cardCentre(alice, `#battlefield > .card[data-uid="${aliceCard}"]`);
  await mouse(alice, 'mouseMoved', grab.x, grab.y); await mouse(alice, 'mousePressed', grab.x, grab.y, 1); await sleep(100); await mouse(alice, 'mouseReleased', grab.x, grab.y); await sleep(200);
  record("...and she cannot pick it up meanwhile: the page says Bob is moving it", /Bob is moving that card/.test(await alice.eval(`document.getElementById('status').textContent`)), await alice.eval(`document.getElementById('status').textContent`));
  await mouse(bob, 'mouseReleased', to.x, to.y); await sleep(700);
  const settled = await waitFor(async () => (await alice.eval(`!document.querySelector('#battlefield .card.carried-remote') && !document.querySelector('#battlefield .plane-target.remote')`)) || null, 15000, 200).catch(() => false);
  record('when Bob lets go the lift and the outline are gone on her page', Boolean(settled));
  const onAlice = await waitFor(async () => (await alice.eval(`(() => { const c = document.querySelector('#battlefield > .card[data-uid="${aliceCard}"]'); return c && Number(c.dataset.row) >= 50 && Number(c.dataset.row) < 80 ? { col: Number(c.dataset.col), row: Number(c.dataset.row) } : null; })()`)) || null, 15000, 250).catch(() => null);
  record("Bob drags Alice's card into the commons, and Alice's page shows it there", Boolean(onAlice), JSON.stringify(onAlice ?? await alice.eval(`(() => { const c = document.querySelector('#battlefield > .card'); return c ? [c.dataset.col, c.dataset.row] : null; })()`)));
  if (process.argv.includes('--screenshot')) await alice.screenshot('scratch-shared-alice.png');

  // Alice fits the table, zooms in on the card (the wheel, at the card), and drags it 25 rows down, back into her home: it lands on the cell under the pointer
  await alice.eval(`document.querySelector('.plane-button[aria-label="See the whole table"]').click()`); await sleep(400);
  const at = await cardCentre(alice, `#battlefield > .card[data-uid="${aliceCard}"]`);
  await alice.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: at.x, y: at.y, deltaX: 0, deltaY: -250 }); await sleep(300);
  const zoom = await alice.eval(`document.querySelector('.plane-zoom').textContent`);
  const back = await cardCentre(alice, `#battlefield > .card[data-uid="${aliceCard}"]`);
  const target = { col: onAlice?.col ?? 100, row: (onAlice?.row ?? 60) + 25 };
  const point = await cellPoint(alice, target.col, target.row);
  const view = await alice.eval(`(() => { const r = document.getElementById('my-board').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; })()`);
  const visible = point.x > view.left && point.x < view.right && point.y > view.top && point.y < view.bottom;
  if (back) await drag(alice, back, point);
  const landed = await alice.eval(`(() => { const c = document.querySelector('#battlefield > .card[data-uid="${aliceCard}"]'); return c ? { col: Number(c.dataset.col), row: Number(c.dataset.row) } : null; })()`);
  record(`zoomed to ${zoom}, Alice drags it back into her home and it lands on the cell under the pointer`, zoom !== '100%' && visible && Boolean(landed) && Math.abs(landed.col - target.col) <= 1 && Math.abs(landed.row - target.row) <= 1 && landed.row >= 80, JSON.stringify({ zoom, visible, landed, target }));
  if (process.argv.includes('--screenshot')) await alice.screenshot('scratch-shared-zoom.png');
  record('no page errors', ![alice, bob].some((b) => b.logs.some((l) => /^exception:/.test(l))), [alice, bob].flatMap((b) => b.logs).filter((l) => /^exception:/.test(l)).join(' | ').slice(0, 300));
  accounts.push(...(await accountsOf(alice)), ...(await accountsOf(bob)));
  await closeAllBrowsers();
} catch (error) {
  record('the check script itself ran without an error', false, error.message); exitCode = 1;
} finally {
  for (const { code, alice } of made) { try { await rest('DELETE', `tables/${code}`, alice.token); await rest('DELETE', `hosts/${alice.uid}`, alice.token); } catch {} }
  for (const account of accounts) if (account?.token) await deleteAccount(account.token);
  await closeAllBrowsers().catch(() => {});
  if (server) await server.close();
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
if (failed.length) { console.log('FAILED:', failed.map((r) => r.name).join('; ')); exitCode = 1; }
process.exit(exitCode);
