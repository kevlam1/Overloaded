// The Seats table's layout (Kevin, 2026-11-20), with real browsers against the REAL project: for a table of 2, 3 and 4 seats (Alice and Bob are real players, bots fill the other seats), Alice's table page
// shows her own area like the solo table (battlefield, hand, life piece, action bar) under the other players' areas, which sit side by side across the top; Bob's battlefield is turned to face her, and
// upright when she chooses that in Settings. Short on purpose: one check per thing a player sees. Run: node --env-file=.env scripts/check-seats-live.mjs [--screenshot]
// Makes one throwaway table per size, deletes them and every account it made.
import { createServer } from 'vite';
import { openBrowser, closeAllBrowsers, waitFor, authOf, sleep, text, tableShown, setValue, click } from './lib/browser.mjs';
import { emptyLibrary, addDeck, serializeLibrary, LIBRARY_KEY } from '../shared/deck-library.mjs';

const DB = (process.env.FIREBASE_DATABASE_URL ?? '').replace(/\/$/, '');
const API_KEY = process.env.FIREBASE_API_KEY ?? '';
if (!DB || !API_KEY) { console.log('The Firebase settings are not in the environment. Run: node --env-file=.env scripts/check-seats-live.mjs'); process.exit(1); }
const PORT = 5173; // the one local port the web API key allows besides the real sites
const PAGE = `http://127.0.0.1:${PORT}/pages/lobby/index.html`;
const REFERER = 'https://overloaded-spell.vercel.app/';
const rest = async (method, path, token) => { const r = await fetch(`${DB}/${path}.json?auth=${encodeURIComponent(token)}`, { method }); let json = null; try { json = await r.json(); } catch {} return { status: r.status, json }; };
const deleteAccount = (token) => fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${API_KEY}`, { method: 'POST', headers: { 'content-type': 'application/json', Referer: REFERER }, body: JSON.stringify({ idToken: token }) }).catch(() => {});
const accountsOf = (browser) => browser.eval(`new Promise((resolve) => {
  const open = indexedDB.open('firebaseLocalStorageDb');
  open.onerror = () => resolve([]);
  open.onsuccess = () => {
    const db = open.result;
    if (!db.objectStoreNames.contains('firebaseLocalStorage')) return resolve([]);
    const req = db.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll();
    req.onsuccess = () => resolve(req.result.filter((row) => row.value && row.value.uid).map((row) => ({ uid: row.value.uid, token: row.value.stsTokenManager && row.value.stsTokenManager.accessToken })));
    req.onerror = () => resolve([]);
  };
})`);

const results = [];
const record = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const savedDeck = (name, commander) => ({ version: 1, name, savedAt: new Date().toISOString(), skipped: 0, text: '', commander: [uuid(100)], cards: [{ i: uuid(100), n: commander, qty: 1, section: 'commander' }, { i: uuid(1), n: 'Island', qty: 30, section: 'main' }] });
let idNumber = 0;
const library = (name, commander) => addDeck(emptyLibrary(), savedDeck(name, commander), { format: 'commander', bracket: 2, newId: () => `d${String(++idNumber).padStart(10, '0')}` }).library;
const box = (page, selector) => page.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height) }; })()`);

let server = null; let exitCode = 0;
const made = []; // { code, alice } for the cleanup
const accounts = [];
try {
  server = await createServer({ configFile: 'vite.config.js', logLevel: 'error', server: { port: PORT, strictPort: true, host: '127.0.0.1' } });
  await server.listen();
  for (const seats of [2, 3, 4]) {
    const alice = await openBrowser(`seats-alice-${seats}`, { width: 1366, height: 768 });
    const bob = await openBrowser(`seats-bob-${seats}`, { width: 1366, height: 768 });
    for (const page of [alice, bob]) { await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }); await page.fakeImages('https://cards.scryfall.io/*'); }
    for (const [page, name, lib] of [[alice, 'Alice', library('Goblins', 'Krenko, Mob Boss')], [bob, 'Bob', library('Elves', 'Ezuri, Renegade Leader')]]) {
      await page.goto(PAGE);
      await page.eval(`localStorage.setItem(${JSON.stringify(LIBRARY_KEY)}, ${JSON.stringify(serializeLibrary(lib))}); localStorage.setItem('overloaded.name', ${JSON.stringify(name)})`);
    }
    await alice.goto(PAGE);
    await alice.eval(`document.getElementById('seats').value = '${seats}'`);
    await click(alice, 'create');
    await waitFor(async () => (await tableShown(alice)) || null, 20000);
    const aliceAuth = await authOf(alice);
    const code = (await text(alice, 'code')).trim();
    made.push({ code, alice: aliceAuth });
    await bob.goto(`http://127.0.0.1:${PORT}/lobby/${code}`); // a saved name joins at once
    await waitFor(async () => (await tableShown(bob)) || null, 20000);
    for (const page of [alice, bob]) {
      await waitFor(async () => ((await page.eval(`document.querySelectorAll('#deck-tiles .deck-choice').length`)) > 0) || null, 15000, 200);
      await page.eval(`document.querySelector('#deck-tiles .deck-choice').click()`);
      await waitFor(async () => ((await page.eval(`document.querySelector('#deck-tiles .deck-choice.chosen')`)) !== null) || null, 15000, 200);
      await click(page, 'ready');
    }
    for (let seat = 3; seat <= seats; seat++) {
      await waitFor(async () => (await alice.eval(`Boolean(document.querySelector('#players button[data-bot="add"][data-seat="${seat}"]'))`)) || null, 15000, 200);
      await alice.eval(`document.querySelector('#players button[data-bot="add"][data-seat="${seat}"]').click()`);
      await waitFor(async () => (await alice.eval(`[...document.querySelectorAll('#players .seat')].filter((s) => s.dataset.ready === '1').length`)) >= seat || null, 30000, 300);
    }
    await waitFor(async () => (await alice.eval(`!document.getElementById('start').disabled`)) || null, 20000, 250);
    await click(alice, 'start');
    await waitFor(async () => ((await alice.eval(`document.querySelectorAll('#hand .card').length`)) === 7) || null, 40000, 300);
    await waitFor(async () => ((await bob.eval(`document.querySelectorAll('#hand .card').length`)) === 7) || null, 40000, 300);
    // Bob plays a land so his battlefield has a card to see turned
    await bob.eval(`document.querySelector('#hand .card').click()`);
    await sleep(300);
    await bob.eval(`(() => { const c = document.querySelector('#hand .card.selected') ?? document.querySelector('#hand .card'); const r = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + 10 })); })()`);
    await sleep(300);
    await bob.eval(`[...document.querySelectorAll('.card-menu [role="menuitem"]')].find((x) => x.textContent.trim() === 'Play')?.click()`);
    await waitFor(async () => ((await alice.eval(`document.querySelectorAll('#opponent-list .opponent .battlefield .card').length`)) >= 1) || null, 20000, 250);
    await sleep(800);
    if (process.argv.includes('--screenshot')) await alice.screenshot(`scratch-seats-${seats}.png`);

    const others = seats - 1;
    const opp = await box(alice, '#opponents');
    const areas = await alice.eval(`[...document.querySelectorAll('#opponent-list .opponent')].map((s) => { const r = s.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width)]; })`);
    const mine = await box(alice, '#battlefield');
    const life = await box(alice, '#life-area');
    const bar = await box(alice, '.actions-panel');
    const handTop = await alice.eval(`Math.round(Math.min(...[...document.querySelectorAll('#hand .card')].map((c) => c.getBoundingClientRect().top)))`);
    record(`${seats} seats: the page is the Seats table (the solo look for her own area)`, await alice.eval(`document.body.classList.contains('playing') && document.body.classList.contains('seats')`));
    record(`${seats} seats: the other players' areas are across the top, ${others} side by side and the same width`, Boolean(opp) && opp.top === 0 && areas.length === others && areas.every((a) => Math.abs(a[1] - areas[0][1]) <= 1 && Math.abs(a[2] - areas[0][2]) <= 2) && areas.every((a, n) => n === 0 || a[0] > areas[n - 1][0]), JSON.stringify(areas));
    record(`${seats} seats: her battlefield is below them, with room left`, Boolean(mine) && mine.top >= opp.bottom && mine.height > 150, JSON.stringify({ opp, mine }));
    record(`${seats} seats: the life piece and the action bar are in her own area and do not overlap`, Boolean(life && bar) && life.top >= opp.bottom && bar.top >= opp.bottom && (life.right <= bar.left || bar.right <= life.left || life.bottom <= bar.top || bar.bottom <= life.top), JSON.stringify({ life, bar }));
    record(`${seats} seats: her hand is at the bottom of the window`, handTop > 768 * 0.7, String(handTop));
    if (seats === 2) {
      const facing = () => alice.eval(`getComputedStyle(document.querySelector('#opponent-list .opponent .battlefield')).rotate`);
      record("Bob's battlefield is turned to face her by default", (await facing()) === '180deg', await facing());
      await alice.eval(`document.getElementById('facing-upright').click()`);
      record('...and upright when she chooses Upright in Settings (kept in her browser)', (await facing()) === 'none' && (await alice.eval(`localStorage.getItem('overloaded.facing')`)) === 'upright', await facing());
      await alice.eval(`document.getElementById('facing-turned').click()`);
    }
    record(`${seats} seats: no page errors`, ![alice, bob].some((b) => b.logs.some((l) => /^exception:/.test(l))), [alice, bob].flatMap((b) => b.logs).filter((l) => /^exception:/.test(l)).join(' | ').slice(0, 300));
    accounts.push(...(await accountsOf(alice)), ...(await accountsOf(bob)));
    await closeAllBrowsers();
  }
} catch (error) {
  record('the check script itself ran without an error', false, error.message); exitCode = 1;
} finally {
  for (const { code, alice } of made) {
    try { await rest('DELETE', `tables/${code}`, alice.token); await rest('DELETE', `hosts/${alice.uid}`, alice.token); } catch {}
  }
  for (const account of accounts) if (account?.token) await deleteAccount(account.token);
  await closeAllBrowsers().catch(() => {});
  if (server) await server.close();
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
if (failed.length) { console.log('FAILED:', failed.map((r) => r.name).join('; ')); exitCode = 1; }
process.exit(exitCode);
