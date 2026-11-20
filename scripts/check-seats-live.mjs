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
    const myArea = await box(alice, '#seat-me');
    const areas = await alice.eval(`[...document.querySelectorAll('#opponent-list .opponent')].map((s) => { const r = s.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }; })`);
    const mine = await box(alice, '#battlefield');
    const handBottom = await alice.eval(`Math.round(Math.max(...[...document.querySelectorAll('#hand .card')].map((c) => c.getBoundingClientRect().bottom)))`);
    record(`${seats} seats: Grid view, every player has an area like the solo table (${others} other${others === 1 ? '' : 's'}), hers at the bottom`, await alice.eval(`document.body.classList.contains('seats') && document.body.dataset.view === 'grid'`) && areas.length === others && myArea.bottom >= 760 && areas.every((a) => a.right <= myArea.left + 2 || a.left >= myArea.right - 2 || a.bottom <= myArea.top + 2), JSON.stringify({ myArea, areas }));
    record(`${seats} seats: her battlefield, hand and piles are in her area; her hand is along its bottom edge`, Boolean(mine) && mine.top >= myArea.top && mine.bottom <= myArea.bottom && mine.height > 150 && handBottom >= myArea.bottom - 2 && await alice.eval(`document.getElementById('seat-me').contains(document.getElementById('piles-section'))`), JSON.stringify({ mine, handBottom }));
    record(`${seats} seats: each other player shows a fan of card backs for their hand (Bob holds 6)`, (await alice.eval(`document.querySelector('#opponent-list .opponent .opp-backs').children.length`)) === 6 && /Hand 6/.test(await alice.eval(`document.querySelector('#opponent-list .opponent .opp-hand-pill').textContent`)));
    if (seats === 2) {
      const facing = () => alice.eval(`getComputedStyle(document.querySelector('#opponent-list .opponent .battlefield')).rotate`);
      record("Bob's battlefield is turned to face her by default", (await facing()) === '180deg', await facing());
      await alice.eval(`document.getElementById('facing-upright').click()`);
      record('...and upright when she chooses Upright in Settings (kept in her browser)', (await facing()) === 'none' && (await alice.eval(`localStorage.getItem('overloaded.facing')`)) === 'upright', await facing());
      await alice.eval(`document.getElementById('facing-turned').click()`);
      // Real mouse drags between her hand, her battlefield and her piles (Kevin, 2026-11-20: a card let go near the bottom of the battlefield went back into the hand, and a card let go on the graveyard landed on the board)
      const mouse = (type, x, y, buttons = 0) => alice.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons, clickCount: 1 });
      const drag = async (from, to) => { await mouse('mouseMoved', from.x, from.y); await sleep(60); await mouse('mousePressed', from.x, from.y, 1); for (let n = 1; n <= 12; n++) { await mouse('mouseMoved', from.x + ((to.x - from.x) * n) / 12, from.y + ((to.y - from.y) * n) / 12, 1); await sleep(16); } await mouse('mouseReleased', to.x, to.y); await sleep(700); };
      const centre = (selector) => alice.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
      const handPoint = (selector) => alice.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 14) }; })()`); // (the hand rests half below the window: press on the part that shows)
      const counts = () => alice.eval(`({ hand: document.querySelectorAll('#hand > .card').length, field: document.querySelectorAll('#battlefield > .card').length, grave: Number(document.getElementById('pile-graveyard').dataset.count) })`);
      const field = await box(alice, '#battlefield');
      if (process.argv.includes('--screenshot')) { const c = await handPoint('#hand > .card:nth-child(3)'); await mouse('mouseMoved', c.x, c.y); await sleep(400); await alice.screenshot('scratch-seats-hover.png'); }
      const before = await counts();
      { const resting = await handPoint('#hand > .card'); await mouse('mouseMoved', resting.x, resting.y); await sleep(400); } // (the pointer on the resting hand raises it, as on the solo table: the card is then pressed where it has risen to)
      await drag(await handPoint('#hand > .card'), { x: field.left + Math.round(field.width * 0.3), y: field.bottom - 6 });
      const played = await counts();
      record('a hand card let go on the bottom edge of her battlefield is played there', played.hand === before.hand - 1 && played.field === before.field + 1, JSON.stringify({ before, played }));
      const placed = await alice.eval(`[...document.querySelectorAll('#battlefield > .card')].map((c) => c.dataset.uid).pop()`);
      await drag(await centre(`#battlefield > .card[data-uid="${placed}"]`), await centre('#pile-graveyard'));
      const buried = await counts();
      record('a battlefield card let go on her graveyard goes to the graveyard', buried.grave === played.grave + 1 && buried.field === played.field - 1, JSON.stringify(buried));
      await drag(await centre('#pile-graveyard'), { x: field.left + Math.round(field.width / 2), y: field.top + Math.round(field.height / 2) });
      const back = await counts();
      record('the top card of her graveyard dragged onto the battlefield comes back', back.grave === buried.grave - 1 && back.field === buried.field + 1, JSON.stringify(back));
      const handCard = await handPoint('#hand > .card');
      await drag(await centre(`#battlefield > .card[data-uid="${placed}"]`), { x: handCard.x, y: myArea.bottom - 12 });
      const returned = await counts();
      record('a battlefield card let go on her hand goes back to her hand', returned.hand === back.hand + 1 && returned.field === back.field - 1, JSON.stringify(returned));
      // the solo table's hand tools on the table: Shift and a click picks two hand cards, a right-click on one offers the group menu, Discard sends both to the graveyard (and it is saved)
      const shiftClick = async (selector) => { const p = await handPoint(selector); await mouse('mouseMoved', p.x, p.y); await sleep(250); const q = await handPoint(selector); await alice.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: q.x, y: q.y, button: 'left', buttons: 1, clickCount: 1, modifiers: 8 }); await alice.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: q.x, y: q.y, button: 'left', buttons: 0, clickCount: 1, modifiers: 8 }); await sleep(250); };
      const pickedUids = await alice.eval(`[...document.querySelectorAll('#hand > .card')].slice(0, 2).map((c) => c.dataset.uid)`);
      await shiftClick(`#hand > .card[data-uid="${pickedUids[0]}"]`);
      await shiftClick(`#hand > .card[data-uid="${pickedUids[1]}"]`);
      const picked = await alice.eval(`document.querySelectorAll('#hand > .card.selected').length`);
      await alice.eval(`(() => { const c = document.querySelector('#hand > .card[data-uid="${pickedUids[1]}"]'); const r = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + 12 })); })()`);
      await sleep(300);
      const groupTitle = await alice.eval(`document.querySelector('.card-menu')?.querySelector('h2, h3, .card-menu-title')?.textContent ?? ''`);
      await alice.eval(`[...document.querySelectorAll('.card-menu [role="menuitem"]')].find((x) => x.textContent.trim() === 'Discard')?.click()`);
      await sleep(500);
      const discarded = await counts();
      const savedGrave = await waitFor(async () => { const r = await rest('GET', `tables/${code}/public/${aliceAuth.uid}/graveyard`, aliceAuth.token); return Array.isArray(r.json) && r.json.length === discarded.grave ? r.json.length : null; }, 15000, 300);
      record('Shift and a click picks two hand cards; the group menu ("2 cards") discards both, and the database has them in her graveyard', picked === 2 && /2 cards/.test(groupTitle) && discarded.grave === returned.grave + 2 && discarded.hand === returned.hand - 2 && savedGrave === discarded.grave, JSON.stringify({ picked, groupTitle, discarded, savedGrave }));
      // the bar under her raised hand has the sort buttons and the hand menu arrow; the pile window has its Type and Mana value filters and the Graveyard / Exile buttons
      { const p = await handPoint('#hand > .card'); await mouse('mouseMoved', p.x, p.y); await sleep(400); }
      const tools = await alice.eval(`({ sorts: document.querySelectorAll('.hand-bar .hand-sort').length, caret: Boolean(document.getElementById('hand-caret')) })`);
      await alice.eval(`document.getElementById('hand-caret').click()`);
      await sleep(250);
      const handMenu = await alice.eval(`[...document.querySelectorAll('.card-menu [role="menuitem"]')].map((x) => x.textContent.trim())`);
      await alice.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await alice.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(200);
      record('the hand has the sort buttons and its menu (Mulligan, Discard hand and the rest)', tools.sorts >= 4 && tools.caret && handMenu.includes('Mulligan') && handMenu.some((t) => t.startsWith('Discard hand')), JSON.stringify({ tools, handMenu }));
      await alice.eval(`document.getElementById('pile-graveyard').click()`);
      await sleep(400);
      const win = await alice.eval(`({ shown: !document.getElementById('viewer').hidden, filters: document.querySelectorAll('#viewer-filters button, #viewer-filters select, #viewer-filters details').length, tabs: !document.getElementById('viewer-tabs').hidden, cards: document.querySelectorAll('#viewer-list .card').length })`);
      record('her graveyard window has the Type and Mana value filters and the Graveyard / Exile buttons, and shows the 2 cards', win.shown && win.filters >= 2 && win.tabs && win.cards === 2, JSON.stringify(win));
      await alice.eval(`document.getElementById('viewer-close').click()`);
      await sleep(200);
      // the counters panel under her life: commander damage from each commander at the table (hers and Bob's), then her counters
      await alice.eval(`document.getElementById('life-counters').click()`);
      await sleep(300);
      const panel = await alice.eval(`(() => { const p = document.querySelector('.counter-panel'); return p ? { titles: [...p.querySelectorAll('.cp-title')].map((t) => t.textContent), rows: [...p.querySelectorAll('.cp-row')].map((r) => r.querySelector('.cp-label').textContent + '|' + (r.querySelector('.cp-detail')?.textContent ?? '') + '|' + r.querySelector('.cp-count').textContent) } : null; })()`);
      record('the arrow under her life opens the counters: commander damage from Krenko (hers) and Ezuri (Bob\'s), then poison, energy and experience', Boolean(panel) && panel.titles.join() === 'Commander damage,Counters' && panel.rows.some((r) => r.startsWith('Alice (you)|Krenko, Mob Boss|0')) && panel.rows.some((r) => r.startsWith('Bob|Ezuri, Renegade Leader|0')) && panel.rows.some((r) => r.startsWith('Poison')), JSON.stringify(panel));
      await alice.eval(`[...document.querySelectorAll('.counter-panel .cp-row')].find((r) => r.querySelector('.cp-label').textContent === 'Bob').querySelector('[data-step="1"]').click()`);
      await sleep(300);
      const after = await alice.eval(`[...document.querySelectorAll('.counter-panel .cp-row')].find((r) => r.querySelector('.cp-label').textContent === 'Bob').querySelector('.cp-count').textContent`);
      record('...and its plus on Bob\'s line records 1 commander damage from Ezuri, the panel staying open', after === '1' && (await alice.eval(`Boolean(document.querySelector('.counter-panel'))`)), after);
      await alice.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await alice.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await sleep(200);
      // Sidebar view: one area large, every player small in a column; Bob's area shown large keeps her hand along the bottom
      await alice.eval(`document.getElementById('view-toggle').click()`);
      await sleep(400);
      const side = await alice.eval(`({ view: document.body.dataset.view, slots: document.querySelectorAll('#seats-side .seat-slot').length, mineLarge: document.getElementById('seat-me').classList.contains('focused'), bobSmall: Boolean(document.querySelector('#seats-side .seat-area.mini')), saved: localStorage.getItem('overloaded.seatsView') })`);
      record('the view button switches to Sidebar view: her area large, both players in the column (Bob small), kept in her browser', side.view === 'sidebar' && side.slots === 2 && side.mineLarge && side.bobSmall && side.saved === 'sidebar', JSON.stringify(side));
      if (process.argv.includes('--screenshot')) await alice.screenshot('scratch-seats-sidebar-me.png');
      await alice.eval(`[...document.querySelectorAll('#seats-side .seat-slot')][1].querySelector('.slot-head').click()`);
      await sleep(500);
      const bobLarge = await alice.eval(`({ bob: document.querySelector('.opponent').classList.contains('focused'), mineSmall: document.getElementById('seat-me').classList.contains('mini'), handDocked: document.getElementById('hand-section').classList.contains('docked'), handCards: document.querySelectorAll('#hand > .card').length })`);
      record("...a click on Bob in the column shows his area large; her hand stays along the bottom, still hers", bobLarge.bob && bobLarge.mineSmall && bobLarge.handDocked && bobLarge.handCards === discarded.hand, JSON.stringify(bobLarge));
      if (process.argv.includes('--screenshot')) await alice.screenshot('scratch-seats-sidebar-bob.png');
      await alice.eval(`document.getElementById('view-toggle').click()`);
      await sleep(400);
      const backToGrid = await alice.eval(`({ view: document.body.dataset.view, handInArea: document.getElementById('seat-me').contains(document.getElementById('hand-section')), minis: document.querySelectorAll('.seat-area.mini').length })`);
      record('...and back to Grid view, her hand back in her area', backToGrid.view === 'grid' && backToGrid.handInArea && backToGrid.minis === 0, JSON.stringify(backToGrid));
      // Bob's piles: his library cannot be opened; his exile opens in the pile window to look at
      await alice.eval(`document.querySelector('#opponent-list .opp-pile[data-zone="exile"]').click()`);
      await sleep(300);
      const opened = await alice.eval(`({ shown: !document.getElementById('viewer').hidden, title: document.getElementById('viewer-title').textContent, library: document.querySelector('#opponent-list .opp-pile[data-zone="library"]').disabled })`);
      record("Bob's exile opens in the pile window; his library cannot be opened", opened.shown && /^Exile of Bob/.test(opened.title) && opened.library, JSON.stringify(opened));
      await alice.eval(`document.getElementById('viewer-close').click()`);
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
