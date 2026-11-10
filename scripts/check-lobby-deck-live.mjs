// The lobby's deck picker, Ready button and "Choose a deck" popup, with two real browsers against the REAL project (about 1 minute).
// Alice (host) has two Commander decks and a Standard deck saved in her browser; Bob has none at first. Checks: the popup when
// Ready is pressed with no deck (and with none to offer), the seat lines others see (commander, bracket, Ready), that choosing a
// different deck takes your ready mark back, that a refresh puts your deck and ready mark back, and that the database holds the
// commander and bracket but never a deck list.
// Run: node --env-file=.env scripts/check-lobby-deck-live.mjs
// Needs the deck fields rules to be published (they were on 2026-10-30). Exit 0 all passed, 1 a check failed. Makes one throwaway
// table, deletes it and its accounts, and the browser profile folders.
import { createServer } from 'vite';
import { openBrowser, closeAllBrowsers, waitFor, authOf, sleep, text, tableShown, setValue, click, players } from './lib/browser.mjs';
import { emptyLibrary, addDeck, serializeLibrary, LIBRARY_KEY } from '../shared/deck-library.mjs';

const DB = (process.env.FIREBASE_DATABASE_URL ?? '').replace(/\/$/, '');
const API_KEY = process.env.FIREBASE_API_KEY ?? '';
if (!DB || !API_KEY) { console.log('The Firebase settings are not in the environment. Run: node --env-file=.env scripts/check-lobby-deck-live.mjs'); process.exit(1); }
const PORT = 5198;
const PAGE = `http://127.0.0.1:${PORT}/pages/lobby/index.html`;
const rest = async (method, path, token, body) => {
  const response = await fetch(`${DB}/${path}.json?auth=${encodeURIComponent(token)}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  let json = null; try { json = await response.json(); } catch {}
  return { status: response.status, json };
};
const deleteAccount = (token) => fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${API_KEY}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: token }) }).catch(() => {});

const results = [];
const record = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };

// Saved decks written the way the deck page writes them (the strict reader of shared/deck-preview.mjs accepts these).
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
// sideboard: names of cards for the sideboard (always in the sideboard, never dealt: a way to get a given card on the table with no luck).
const savedDeck = (name, commanders, sideboard = []) => ({
  version: 1, name, savedAt: new Date().toISOString(), skipped: 0, text: '',
  commander: commanders.map((_, n) => uuid(100 + n)),
  cards: [...commanders.map((c, n) => ({ i: uuid(100 + n), n: c, qty: 1, section: 'commander' })), { i: uuid(1), n: 'Island', qty: 30, section: 'main' },
    ...sideboard.map((c, n) => ({ i: uuid(300 + n), n: c, qty: 1, section: 'sideboard' }))],
});
const TWO_SIDED = 'Delver of Secrets // Insectile Aberration'; // a real transform card: the page finds it by NAME in the real card list (the id above is made up)
let idNumber = 0;
const newId = () => `d${String(++idNumber).padStart(10, '0')}`;
const libraryWith = (...decks) => decks.reduce((library, [deck, format, bracket]) => addDeck(library, deck, { format, bracket: bracket ?? null, newId }).library, emptyLibrary());
const aliceLibrary = libraryWith([savedDeck('Goblins', ['Krenko, Mob Boss']), 'commander', 3], [savedDeck('Partners', ['Tymna the Weaver', 'Thrasios, Triton Hero'], [TWO_SIDED]), 'commander'], [savedDeck('Burn', []), 'standard']);
const bobLibrary = libraryWith([savedDeck('Elves', ['Ezuri, Renegade Leader']), 'commander', 2]);
const goblinsId = aliceLibrary.decks[0].id;
const partnersId = aliceLibrary.decks[1].id;

const seed = async (browser, library) => {
  await browser.goto(PAGE);
  await browser.eval(`localStorage.setItem(${JSON.stringify(LIBRARY_KEY)}, ${JSON.stringify(serializeLibrary(library))})`);
};
const row = (browser, who) => browser.eval(`(Array.from(document.querySelectorAll('#players li')).find((x) => x.textContent.includes(${JSON.stringify(who)})) ?? { textContent: '' }).textContent`);
const rowHas = (browser, who, ...parts) => waitFor(async () => { const t = await row(browser, who); return parts.every((p) => t.includes(p)) ? t : null; }, 15000, 200);
const choose = (browser, id, value) => browser.eval(`(() => { const s = document.getElementById(${JSON.stringify(id)}); s.value = ${JSON.stringify(value)}; s.dispatchEvent(new Event('change')); })()`);
const dialogOpen = (browser) => browser.eval(`document.getElementById('deck-dialog').open`);
const readyText = (browser) => text(browser, 'ready');
const statusText = (browser) => text(browser, 'status');
const memberEntry = async (token, code, uid) => (await rest('GET', `tables/${code}/members/${uid}`, token)).json;

let server = null; let exitCode = 0;
const cleanup = { alice: null, bob: null, code: null };
try {
  server = await createServer({ configFile: 'vite.config.js', logLevel: 'error', server: { port: PORT, strictPort: true, host: '127.0.0.1' } });
  await server.listen();
  const sizeArg = process.argv.find((arg) => arg.startsWith('--size='))?.slice(7).split('x').map(Number); // optional: --size=1366x650 to look at another window size
  const windowSize = { width: sizeArg?.[0] ?? 1280, height: sizeArg?.[1] ?? 800 };
  const alice = await openBrowser('lobbydeck-alice', windowSize);
  const bob = await openBrowser('lobbydeck-bob', windowSize);
  // The hand is dealt one card at a time unless the browser asks for reduced motion; most checks below count the hand at once, so both pages ask for it. One block turns it off for Alice.
  const motion = (page, value) => page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value }] });
  await motion(alice, 'reduce');
  await motion(bob, 'reduce');
  await alice.fakeImages('https://cards.scryfall.io/*'); // the saved decks use made-up card ids: no picture is fetched from Scryfall
  await bob.fakeImages('https://cards.scryfall.io/*');

  await seed(alice, aliceLibrary);
  await alice.goto(PAGE);
  await setValue(alice, 'name', 'Alice');
  await click(alice, 'create');
  await waitFor(async () => (await tableShown(alice)) || null, 20000);
  cleanup.alice = await authOf(alice);
  const code = (await text(alice, 'code')).trim();
  cleanup.code = code;
  record('Alice makes a Commander table', /^[A-HJ-NP-Z2-9]{6}$/.test(code));
  record('...and her address bar now shows the table, /lobby/CODE (it was the start page), so it can be copied and shared', (await alice.eval('location.pathname')) === `/lobby/${code}`, await alice.eval('location.pathname'));

  // Bob has no saved deck yet.
  await bob.goto(PAGE);
  await setValue(bob, 'name', 'Bob');
  await setValue(bob, 'join-code', code);
  await click(bob, 'join');
  await waitFor(async () => (await tableShown(bob)) || null, 20000);
  cleanup.bob = await authOf(bob);
  await rowHas(alice, 'Bob', 'Seat 2');

  const aliceOptions = await waitFor(async () => { const o = await alice.eval(`Array.from(document.getElementById('deck-pick').options).map((x) => x.textContent)`); return o.length > 1 ? o : null; }, 15000, 200);
  record("Alice's picker lists only her Commander decks, with commander and bracket", JSON.stringify(aliceOptions) === JSON.stringify(['Choose a deck...', 'Goblins (Krenko, Mob Boss, bracket 3)', 'Partners (Tymna the Weaver & Thrasios, Triton Hero)']), JSON.stringify(aliceOptions));
  record("Alice's picker starts with no deck chosen", (await alice.eval(`document.getElementById('deck-pick').value`)) === '');
  record('before anything is chosen the seats show no commander and nobody is ready', !(await row(alice, 'Alice')).includes('Krenko') && !(await row(alice, 'Alice')).includes('Ready'), await row(alice, 'Alice'));

  // Ready with no deck chosen opens the popup.
  await click(alice, 'ready');
  await waitFor(async () => (await dialogOpen(alice)) || null, 5000, 100);
  record('Ready with no deck chosen opens the "Choose a deck" popup', await dialogOpen(alice));
  record("the popup offers Alice's two Commander decks and not her Standard deck, the selected one first",(await alice.eval(`Array.from(document.getElementById('deck-dialog-pick').options).map((x) => x.value).join()`)) === `${goblinsId},${partnersId}`);
  await alice.eval(`document.getElementById('deck-dialog').close()`); // Escape does the same: no deck is set
  await sleep(500);
  record('closing the popup without choosing sets no deck and Alice is not ready', !(await row(alice, 'Alice')).includes('Ready') && !(await row(alice, 'Alice')).includes('Krenko'));

  // Ready and a deck, through the popup.
  await click(alice, 'ready');
  await waitFor(async () => (await dialogOpen(alice)) || null, 5000, 100);
  await choose(alice, 'deck-dialog-pick', goblinsId);
  await click(alice, 'deck-dialog-ok');
  const aliceRow = await rowHas(alice, 'Alice', 'Krenko, Mob Boss', 'bracket 3', 'Ready');
  record('choosing a deck in the popup brings it to the table and makes Alice ready', Boolean(aliceRow), aliceRow ?? await row(alice, 'Alice'));
  const bobSeesAlice = await rowHas(bob, 'Alice', 'Krenko, Mob Boss', 'bracket 3', 'Ready');
  record("Bob's page shows Alice's commander, bracket and Ready mark (a second browser, live)", Boolean(bobSeesAlice), bobSeesAlice ?? await row(bob, 'Alice'));
  record("Alice's button now offers to take it back", (await readyText(alice)) === 'Not ready');

  // The database holds the commander and bracket, never a deck list.
  let entry = await memberEntry(cleanup.alice.token, code, cleanup.alice.uid);
  record("Alice's member entry holds only name, seat, ready, commander and bracket", entry && Object.keys(entry).sort().join() === 'bracket,commander,name,ready,seat' && entry.commander === 'Krenko, Mob Boss' && entry.bracket === 3 && entry.ready === 1, JSON.stringify(entry));
  record("Bob's browser can read it but it holds no card list", !JSON.stringify(await memberEntry(cleanup.bob.token, code, cleanup.alice.uid)).includes('Island'));

  // Bob: no deck of this format. The popup says so and offers a link.
  await click(bob, 'ready');
  await waitFor(async () => (await dialogOpen(bob)) || null, 5000, 100);
  const bobDialog = await bob.eval(`({ ok: document.getElementById('deck-dialog-ok').hidden && document.getElementById('deck-dialog-ok').disabled, closeWord: document.getElementById('deck-dialog-cancel').textContent === 'Close', importShown: !document.getElementById('deck-dialog-import').hidden, fieldHidden: document.getElementById('deck-dialog-field').hidden, words: document.getElementById('deck-dialog-text').textContent })`);
  record('with no deck to offer, the popup says so, links to the deck page and has nothing to confirm (only Close)', bobDialog.ok && bobDialog.closeWord && bobDialog.importShown && bobDialog.fieldHidden && /no saved Commander deck/.test(bobDialog.words), JSON.stringify(bobDialog));
  if (process.argv.includes('--screenshot')) { await sleep(300); await bob.screenshot('scratch-lobby-dialog.png'); }
  await bob.eval(`document.getElementById('deck-dialog').close()`);
  record("Bob's page also says it under the picker, with a link", /no saved Commander deck/.test(await text(bob, 'deck-note')) && (await bob.eval(`!document.getElementById('deck-import').hidden && document.getElementById('deck-pick-field').hidden`)));

  // Bob saves a deck (as if imported in another tab) and comes back: the refresh puts him back at his seat.
  await bob.eval(`localStorage.setItem(${JSON.stringify(LIBRARY_KEY)}, ${JSON.stringify(serializeLibrary(bobLibrary))})`);
  await bob.goto(`http://127.0.0.1:${PORT}/lobby/${code}`); // a refresh of the table's own address puts him back at his seat
  await waitFor(async () => (await tableShown(bob)) || null, 20000);
  const bobOptions = await waitFor(async () => { const o = await bob.eval(`Array.from(document.getElementById('deck-pick').options).map((x) => x.textContent)`); return o.length > 1 ? o : null; }, 15000, 200);
  record("after a refresh Bob's picker lists his new deck", JSON.stringify(bobOptions) === JSON.stringify(['Choose a deck...', 'Elves (Ezuri, Renegade Leader, bracket 2)']), JSON.stringify(bobOptions));
  await choose(bob, 'deck-pick', bobLibrary.decks[0].id);
  const bobRow = await rowHas(alice, 'Bob', 'Ezuri, Renegade Leader', 'bracket 2');
  record("choosing a deck in the picker shows Bob's commander on Alice's page, and he is not ready yet", Boolean(bobRow) && !bobRow.includes('Ready'), bobRow ?? await row(alice, 'Bob'));
  await click(bob, 'ready');
  const bobReady = await rowHas(alice, 'Bob', 'Ready');
  record('Ready with a deck chosen needs no popup and shows Bob as ready on Alice\'s page', Boolean(bobReady) && !(await dialogOpen(bob)));
  if (process.argv.includes('--screenshot')) {
    await alice.eval(`document.getElementById('table').scrollIntoView()`); await sleep(300);
    await alice.screenshot('scratch-lobby-table.png');
  }

  // Alice changes deck: her ready mark must go, on both pages.
  await choose(alice, 'deck-pick', partnersId);
  const changed = await rowHas(alice, 'Alice', 'Tymna the Weaver & Thrasios, Triton Hero');
  record('choosing another deck shows the new commanders (two joined with " & ") and no bracket', Boolean(changed) && !changed.includes('bracket'), changed ?? await row(alice, 'Alice'));
  record('and takes Alice\'s ready mark back, on her page', !(await row(alice, 'Alice')).includes('Ready') && (await readyText(alice)) === 'Ready', await row(alice, 'Alice'));
  const bobSawIt = await waitFor(async () => { const t = await row(bob, 'Alice'); return t.includes('Tymna') && !t.includes('Ready') ? t : null; }, 15000, 200);
  record("and on Bob's page", Boolean(bobSawIt), await row(bob, 'Alice'));
  const saidSo = await waitFor(async () => { const t = await statusText(alice); return /not ready any more: press Ready again/.test(t) ? t : null; }, 10000, 200);
  record('and says so', Boolean(saidSo), await statusText(alice));
  entry = await memberEntry(cleanup.alice.token, code, cleanup.alice.uid);
  record("the database has the new commanders, no bracket and no ready mark for Alice", entry && entry.commander === 'Tymna the Weaver & Thrasios, Triton Hero' && !('bracket' in entry) && !('ready' in entry), JSON.stringify(entry));

  // Ready again, then a refresh: the remembered deck is sent again and does NOT take the ready mark back.
  await click(alice, 'ready');
  await rowHas(alice, 'Alice', 'Ready');
  await alice.goto(`http://127.0.0.1:${PORT}/lobby/${code}`);
  await waitFor(async () => (await tableShown(alice)) || null, 20000);
  await sleep(2500); // time for the remembered deck to be sent again, if it were going to un-ready her
  const afterRefresh = await row(alice, 'Alice');
  record('after a refresh Alice is still at her seat with her deck and still ready', afterRefresh.includes('Tymna the Weaver & Thrasios, Triton Hero') && afterRefresh.includes('Ready'), afterRefresh);
  record("and her picker shows the deck she brought", (await alice.eval(`document.getElementById('deck-pick').value`)) === partnersId);
  entry = await memberEntry(cleanup.alice.token, code, cleanup.alice.uid);
  record('the database still has her ready mark', entry?.ready === 1, JSON.stringify(entry));

  // Taking the mark back by hand.
  await click(alice, 'ready');
  const unready = await waitFor(async () => (!(await row(alice, 'Alice')).includes('Ready') ? true : null), 10000, 200);
  record('Not ready takes the mark back', Boolean(unready) && (await readyText(alice)) === 'Ready');

  // Start: only the host sees it, it waits until everyone is ready, and then both browsers are taken to the table page.
  // A page that is still loading (or is not the lobby screen) has no start box yet: report that, with where the page is, instead of throwing out of a retry loop.
  const startState = (browser) => browser.eval(`(() => { const box = document.getElementById('start-box'); const button = document.getElementById('start'); const note = document.getElementById('start-note'); if (!box || !button || !note) return { missing: true, url: location.pathname, boxHidden: true, disabled: true, note: '' }; return { boxHidden: box.hidden, disabled: button.disabled, note: note.textContent }; })()`);
  const early = await startState(alice);
  record('the host sees a Start button that waits, and says how many are ready', !early.boxHidden && early.disabled && /1 of 2 players are ready/.test(early.note), JSON.stringify(early));
  record('the other player sees no Start button', (await startState(bob)).boxHidden);
  await click(alice, 'ready');
  const enabled = await waitFor(async () => { const s = await startState(alice); return !s.disabled ? s : null; }, 10000, 200);
  record('once everyone is ready the Start button turns on and says so', Boolean(enabled) && /Everyone is ready/.test(enabled.note), JSON.stringify(enabled));
  await click(alice, 'start');
  const onTable = (browser) => waitFor(async () => (new RegExp(`^/table/${code}$`).test(await browser.eval('location.pathname')) ? true : null), 20000, 200);
  record("Alice's browser is taken to the table page when the match starts", Boolean(await onTable(alice)));
  record("Bob's browser is taken there too, without pressing anything", Boolean(await onTable(bob)));
  const tableRows = (browser) => waitFor(async () => { const r = await players(browser); return r.length === 2 && r.some((t) => t.includes('Seat 1: Alice (host)')) ? r : null; }, 20000, 200);
  const bobTable = await tableRows(bob);
  record("Bob's table page lists both seats, with Alice's commanders and no ready marks", Boolean(bobTable) && bobTable.some((t) => t.includes('Tymna the Weaver & Thrasios, Triton Hero')) && bobTable.some((t) => t.includes('Seat 2: Bob, Ezuri, Renegade Leader, bracket 2')), JSON.stringify(bobTable));
  record('and says the match is on', /The match is on/.test(await text(bob, 'match-state')), await text(bob, 'match-state'));
  await tableRows(alice);
  const meta = (await rest('GET', `tables/${code}/meta`, cleanup.alice.token)).json;
  record('the database says the table is playing, with the one-hour idle limit', meta?.status === 'playing' && meta.idleLimit === 3600000, JSON.stringify(meta));

  // The game on the table page: Alice's own cards, saved as she moves (hand and library private, the rest public).
  const count = (browser, selector) => browser.eval(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
  // What the buttons of the selected-card panel did is in the right-click menu of the card now: open the menu of the selected card with a real right click and pick, the way a person would.
  const MENU_PATHS = { 'To hand': ['Move to', 'Hand'], 'To battlefield': ['Move to', 'Battlefield'], 'To graveyard': ['Move to', 'Graveyard'], 'To exile': ['Move to', 'Exile'], 'To command zone': ['Move to', 'Command zone'], 'To sideboard': ['Move to', 'Sideboard'], 'Top of library': ['Move to', 'Top of library'], 'Bottom of library': ['Move to', 'Bottom of library'], Modify: ['Modify...'] };
  const openSelectedMenu = (page) => page.eval(`(() => { const c = document.querySelector('.card.selected'); if (!c) return false; const r = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + r.width * 0.7, clientY: r.y + r.height * 0.15 })); return true; })()`);
  const pressMenuEntry = async (page, label) => {
    const p = await page.eval(`(() => { const b = [...document.querySelectorAll('.card-menu [role="menuitem"]')].filter((x) => !x.closest('[hidden]')).find((x) => x.textContent.replace(String.fromCharCode(0x25b8), '').trim() === ${JSON.stringify(label)}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (!p) throw new Error(`no menu item "${label}"`);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(40);
  };
  const act = async (page, label) => { if (!(await openSelectedMenu(page))) throw new Error(`no selected card for "${label}"`); for (const step of MENU_PATHS[label] ?? [label]) await pressMenuEntry(page, step); };
  const buttonLabels = async (page = alice) => { if (!(await openSelectedMenu(page))) return []; const labels = await page.eval(`[...document.querySelectorAll('.card-menu [role="menuitem"]')].filter((x) => !x.closest('[hidden]')).map((x) => x.textContent.replace(String.fromCharCode(0x25b8), '').trim())`); await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(40); return labels; };
  // "public" or "private/hand": the branch, then Alice's id, then the rest (the layout is tables/CODE/BRANCH/UID/REST)
  const pathOf = (where) => { const [branch, ...rest] = where.split('/'); return `tables/${code}/${branch}/${cleanup.alice.uid}${rest.length ? `/${rest.join('/')}` : ''}`; };
  const aliceBoard = await waitFor(async () => (await count(alice, '#hand .card')) === 7 ? true : null, 30000, 200);
  record('Alice is dealt a hand of 7 and her commanders are in the command zone', Boolean(aliceBoard) && (await count(alice, '#command .card')) === 2 && (await text(alice, 'life')) === '40', `${await count(alice, '#hand .card')} cards, life ${await text(alice, 'life')}`);
  const savedFirst = await waitFor(async () => { const r = await rest('GET', pathOf('private'), cleanup.alice.token); return r.json?.hand && Object.keys(r.json.hand).length === 7 ? r.json : null; }, 15000, 250);
  record("the database holds Alice's hand and library in her private branch", Boolean(savedFirst) && Object.keys(savedFirst.library).length === 23, savedFirst ? `library ${Object.keys(savedFirst.library).length}` : 'nothing saved');
  const publicFirst = (await rest('GET', pathOf('public'), cleanup.bob.token)).json;
  record("Bob can read Alice's public branch: her life, her hand count and her command zone, but no hand or library", publicFirst?.life === 40 && publicFirst.counts?.hand === 7 && publicFirst.counts?.library === 23 && Object.keys(publicFirst.command ?? {}).length === 2 && !('hand' in publicFirst) && !('library' in publicFirst), JSON.stringify(publicFirst && Object.keys(publicFirst)));
  record("Bob is refused when he reads Alice's private branch", (await rest('GET', pathOf('private'), cleanup.bob.token)).status === 401);
  record("...and none of her hand's card numbers is in what he can read", !JSON.stringify(publicFirst).includes(Object.values(savedFirst?.hand ?? {})[0]?.u ?? 'no-hand'));
  const handBefore = Object.values(savedFirst.hand).map((card) => card.u);

  // The sound wiring on the table page (the check records the call; it cannot hear it): Draw plays the draw sound, Shuffle the shuffle sound.
  await alice.eval(`window.__plays = []; HTMLMediaElement.prototype.play = function () { window.__plays.push(new URL(this.src).pathname); return Promise.resolve(); };`);
  await click(alice, 'draw');
  const drew = await waitFor(async () => { const r = await rest('GET', pathOf('private/hand'), cleanup.alice.token); return r.json && Object.keys(r.json).length === 8 ? true : null; }, 15000, 250);
  record('Draw shows 8 cards and saves them (the hand 8, the library 22, both counts)', Boolean(drew) && (await count(alice, '#hand .card')) === 8 && (await rest('GET', pathOf('public/counts'), cleanup.bob.token)).json?.hand === 8 && Object.keys((await rest('GET', pathOf('private/library'), cleanup.alice.token)).json).length === 22);

  record('Draw on the table page plays the draw sound, and the sound settings are on the page', JSON.stringify(await alice.eval(`window.__plays`)) === '["/sfx/draw.mp3"]' && (await alice.eval(`document.getElementById('sound-on').checked`)) === true);
  await alice.eval(`(() => { const b = document.getElementById('pile-library'); const r = b.getBoundingClientRect(); b.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + 5, clientY: r.y + 5 })); })()`);
  await pressMenuEntry(alice, 'Shuffle');
  record('Shuffle on the table page plays the shuffle sound', JSON.stringify(await alice.eval(`window.__plays`)) === '["/sfx/draw.mp3","/sfx/shuffle.mp3"]');


  await alice.eval(`document.querySelector('#hand .card').click()`);
  await act(alice, 'To battlefield');
  const played = await waitFor(async () => { const r = await rest('GET', pathOf('public/battlefield'), cleanup.bob.token); return r.json && Object.keys(r.json).length === 1 ? r.json : null; }, 15000, 250);
  record('playing a card puts it on her battlefield on the page and in the public branch that Bob can read', Boolean(played) && (await count(alice, '#battlefield .card')) === 1 && (await count(alice, '#hand .card')) === 7, JSON.stringify(played));
  record('the played card is no longer in her private hand', Object.keys((await rest('GET', pathOf('private/hand'), cleanup.alice.token)).json).length === 7);
  await click(alice, 'life-minus5');
  const lifeSaved = await waitFor(async () => (await rest('GET', pathOf('public/life'), cleanup.bob.token)).json === 35 ? true : null, 15000, 250);
  record('losing 5 life saves 35, and only the life changed', Boolean(lifeSaved) && (await text(alice, 'life')) === '35');
  record('the page says the moves are saved', Boolean(await waitFor(async () => (await text(alice, 'save-state')) === 'Saved.' ? true : null, 10000, 200)), await text(alice, 'save-state'));

  // Other players' boards: each page shows the other player's PUBLIC cards, live and read-only (their hand and library only as counts).
  const panelOf = (browser, name) => browser.eval(`(() => {
    const panel = Array.from(document.querySelectorAll('#opponent-list .opponent')).find((p) => p.querySelector('h3').textContent.includes(${JSON.stringify(name)}));
    if (!panel) return null;
    const rows = panel.querySelectorAll('.row'); // the command zone is the only row now; the battlefield is one grid
    const board = panel.querySelector('.battlefield');
    const cards = Array.from(panel.querySelectorAll('.card'));
    return { life: panel.dataset.life, stats: panel.querySelector('p.hint').textContent, onBattlefield: board.querySelectorAll('.card').length, cells: Array.from(board.querySelectorAll('.card')).map((c) => c.dataset.col + ',' + c.dataset.row), inCommandZone: rows[0].querySelectorAll('.card').length, allCards: cards.length, allReadOnly: cards.every((c) => c.disabled), heading: panel.querySelector('h3').textContent };
  })()`);
  const bobSeesAliceBoard = await waitFor(async () => { const p = await panelOf(bob, 'Alice'); return p && p.life === '35' && p.onBattlefield === 1 ? p : null; }, 30000, 250);
  record("Bob's page shows Alice's board live: life 35, one card on her battlefield, two in her command zone", Boolean(bobSeesAliceBoard) && bobSeesAliceBoard.inCommandZone === 2, JSON.stringify(bobSeesAliceBoard ?? await panelOf(bob, 'Alice')));
  record("...and how many cards she holds, but not which: hand 7 and library 22", /Hand: 7 cards. Library: 22 cards./.test(bobSeesAliceBoard?.stats ?? ''), bobSeesAliceBoard?.stats);
  record("...and only her public cards are on his page (the battlefield and the command zone: 3 cards), all of them read-only", bobSeesAliceBoard?.allCards === 3 && bobSeesAliceBoard.allReadOnly === true, JSON.stringify(bobSeesAliceBoard));
  record("...and her battlefield card is on the cell she stored (column 0, row 33: a land goes to the bottom-left block of the 96 by 44 grid)", JSON.stringify(bobSeesAliceBoard?.cells) === JSON.stringify(['0,33']), JSON.stringify(bobSeesAliceBoard?.cells));
  // Alice drags her card on the grid with the real mouse; the move is saved as one small write and Bob sees the new cell
  {
    const geo = await alice.eval(`(() => { const b = document.getElementById('battlefield').getBoundingClientRect(); const c = document.querySelector('#battlefield .card').getBoundingClientRect(); return { cw: b.width / 112, ch: b.height / 44, x: c.x + c.width / 2, y: c.y + c.height / 2 }; })()`);
    const to = { x: geo.x + 16 * geo.cw, y: geo.y - 11 * geo.ch };
    const mouse = (page, type, p, buttons) => page.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: type === 'mouseMoved' ? 'none' : 'left', buttons, clickCount: 1 });
    await mouse(alice, 'mouseMoved', geo, 0); await mouse(alice, 'mousePressed', geo, 1);
    for (let step = 1; step <= 8; step++) await mouse(alice, 'mouseMoved', { x: geo.x + (to.x - geo.x) * step / 8, y: geo.y + (to.y - geo.y) * step / 8 }, 1);
    await mouse(alice, 'mouseReleased', to, 0);
    const moved = await waitFor(async () => { const p = await panelOf(bob, 'Alice'); return p && JSON.stringify(p.cells) === JSON.stringify(['16,22']) ? p : null; }, 20000, 250);
    record("Alice drags her card with the mouse (8 cells right, 4 up) and Bob's page shows it on the new cell, without a refresh", Boolean(moved), JSON.stringify((await panelOf(bob, 'Alice'))?.cells));
    record('...and the database holds the new cell on the public card that Bob can read', Boolean(await waitFor(async () => { const r = await rest('GET', pathOf('public/battlefield'), cleanup.bob.token); const card = r.json ? Object.values(r.json)[0] : null; return card && card.px === 16 && card.py === 22 ? true : null; }, 15000, 250)));
  }
  record("...with her name and seat as a heading", /^Seat 1: Alice/.test(bobSeesAliceBoard?.heading ?? ''));
  const aliceSeesBobBoard = await waitFor(async () => { const p = await panelOf(alice, 'Bob'); return p && p.life === '40' && p.inCommandZone === 1 ? p : null; }, 30000, 250);
  record("Alice's page shows Bob's board too: life 40, his commander in the command zone, hand 7", Boolean(aliceSeesBobBoard) && /Hand: 7 cards/.test(aliceSeesBobBoard.stats), JSON.stringify(aliceSeesBobBoard ?? await panelOf(alice, 'Bob')));
  record("...and nobody sees themselves in the list of other players", (await panelOf(alice, 'Alice')) === null && (await panelOf(bob, 'Bob')) === null);
  await click(alice, 'life-plus1');
  const liveUpdate = await waitFor(async () => { const p = await panelOf(bob, 'Alice'); return p && p.life === '36' ? p : null; }, 20000, 250);
  record("when Alice gains a life, Bob's page shows 36 without a refresh", Boolean(liveUpdate));
  await click(alice, 'life-minus1'); // back to 35 for the refresh checks below
  await waitFor(async () => (await panelOf(bob, 'Alice'))?.life === '35' ? true : null, 20000, 250);
  if (process.argv.includes('--screenshot')) { await bob.eval(`document.getElementById('opponents').scrollIntoView()`); await sleep(400); await bob.screenshot('scratch-table-opponent.png'); }

  // A stale or hostile public branch cannot make another player's page show anything it should not. Bob's own account writes the
  // data (the rules let a player write their own public branch), and Alice's page must cope with it.
  const bobPublic = `tables/${code}/public/${cleanup.bob.uid}`;
  // Changed 2026-11-06 with the new database rules: the database now REFUSES a wrong match number, a bad id, junk in a list and a 5,000-
  // character name, so this check asserts those refusals. The page still drops such data if it ever reads it (scripts/test-game-sync.mjs),
  // but it can no longer be shown live, because no hostile writer can get it into the database; the stale-match display ("Has not been
  // dealt a game yet") is no longer exercised in a real browser for the same reason. What stays live is a well-shaped card whose NAME is
  // hostile markup, which no rule can refuse, and which must appear as plain text.
  const refusedWrite = async (label, path, body) => { const r = await rest('PUT', path, cleanup.bob.token, body); record(label, r.status === 401, `HTTP ${r.status}`); };
  await refusedWrite("a match number that is not the table's is refused by the database", `${bobPublic}/match`, 99);
  await refusedWrite('a card with an id that is not a Scryfall id is refused by the database', `${bobPublic}/battlefield`, [{ u: 'c901', i: '"><img src=x onerror=alert(2)>', n: 'Bad id' }]);
  await refusedWrite('junk in a card list is refused by the database', `${bobPublic}/battlefield`, ['junk']);
  await refusedWrite('a 5,000-character card name is refused by the database', `${bobPublic}/battlefield`, [{ u: 'c902', i: uuid(1), n: 'x'.repeat(5000) }]);
  await rest('PUT', `${bobPublic}/battlefield`, cleanup.bob.token, [{ u: 'c900', i: uuid(1), n: '<img src=x onerror=alert(1)>' }]);
  const hostileShown = await waitFor(async () => { const p = await panelOf(alice, 'Bob'); return p && p.onBattlefield === 1 ? p : null; }, 15000, 250);
  record('a card whose name is hostile markup (well shaped, so the rules accept it) is shown', Boolean(hostileShown), JSON.stringify(await panelOf(alice, 'Bob')));
  record("...and no markup from a name or an id became part of Alice's page, no script ran and no dialog opened", (await alice.eval(`document.querySelectorAll('#opponent-list img[src="x"], #opponent-list script').length`)) === 0 && alice.dialogs.length === 0 && !alice.logs.some((l) => /^exception:/.test(l)));
  record("the hostile name is on the page as plain text only (in the card's label)", (await alice.eval(`Array.from(document.querySelectorAll('#opponent-list .card')).some((c) => c.getAttribute('aria-label') === '<img src=x onerror=alert(1)>')`)) === true);
  await rest('DELETE', `${bobPublic}/battlefield`, cleanup.bob.token);

  // Counters and the power/toughness change: Alice sets them with the panel, the database holds them, Bob's page shows them read-only,
  // and they are still there after a refresh.
  await alice.eval(`document.querySelector('#battlefield .card').click()`);
  record('the counter controls stay hidden until Modify is pressed', (await alice.eval(`document.getElementById('marks').hidden`)) === true);
  await act(alice, 'Modify');
  record('and Modify shows the counter controls for her card on the battlefield on the table page', (await alice.eval(`document.getElementById('marks').hidden`)) === false);
  await alice.eval(`document.getElementById('marks-amount').value = '3'`);
  await alice.eval(`Array.from(document.querySelectorAll('#marks button')).find((b) => b.textContent === 'Add counters').click()`);
  await alice.eval(`document.getElementById('marks-amount').value = '2'`);
  await alice.eval(`Array.from(document.querySelectorAll('#marks button')).find((b) => b.textContent === 'Power +').click()`);
  const marksSaved = await waitFor(async () => {
    const r = await rest('GET', pathOf('public/battlefield'), cleanup.bob.token);
    const card = r.json ? Object.values(r.json)[0] : null;
    return card && card.ct && card.ct.p === 3 && card.mp === 2 ? card : null;
  }, 15000, 250);
  record('the database holds three +1/+1 counters and a +2 power change on that card (and no toughness change)', Boolean(marksSaved) && marksSaved.mt === undefined, JSON.stringify(marksSaved));
  const bobSeesMarks = await waitFor(async () => {
    const seen = await bob.eval(`(() => { const p = Array.from(document.querySelectorAll('#opponent-list .opponent')).find((x) => x.querySelector('h3').textContent.includes('Alice')); const c = p && Array.from(p.querySelectorAll('.battlefield .card')).find((x) => x.querySelector('.marks')); return c ? { chips: Array.from(c.querySelectorAll('.marks .chip')).map((x) => x.textContent), change: c.querySelector('.marks .change')?.textContent ?? '', readOnly: c.disabled } : null; })()`);
    return seen && seen.change === '+5/+3' ? seen : null;
  }, 20000, 250);
  record("Bob's page shows the counters and the +5/+3 change on Alice's card, read-only, without a refresh", Boolean(bobSeesMarks) && JSON.stringify(bobSeesMarks.chips) === '["+1/+1 3"]' && bobSeesMarks.readOnly === true, JSON.stringify(bobSeesMarks));
  record("Bob's page has no counter controls for another player's cards", (await bob.eval(`document.getElementById('marks').hidden`)) === true);
  await alice.eval(`document.getElementById('marks-amount').value = '5,000,000,000'`);
  await alice.eval(`document.querySelector('#marks select').value = 'o'`);
  await alice.eval(`Array.from(document.querySelectorAll('#marks button')).find((b) => b.textContent === 'Add counters').click()`);
  const bigSaved = await waitFor(async () => {
    const r = await rest('GET', pathOf('public/battlefield'), cleanup.bob.token);
    const card = r.json ? Object.values(r.json)[0] : null;
    return card && card.ct && card.ct.o === 5000000000 ? card : null;
  }, 15000, 250);
  record('five billion counters are stored exactly (the database keeps whole numbers that large)', Boolean(bigSaved), JSON.stringify(bigSaved));

  // Clicking the numbers on the card itself (real mouse input): saved to the database, and other players' browsers cannot do it.
  const clickMarkOnCard = async (page, selector, button = 'left') => {
    await page.eval(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: 'center' })`);
    const p = await page.eval(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button, buttons: button === 'left' ? 1 : 2, clickCount: 1 });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button, buttons: 0, clickCount: 1 });
  };
  const aliceChip = '#battlefield .card .marks .chip';
  const counterInDb = async () => { const r = await rest('GET', pathOf('public/battlefield'), cleanup.bob.token); const card = r.json ? Object.values(r.json)[0] : null; return card?.ct?.p ?? null; };
  await clickMarkOnCard(alice, aliceChip);
  record('a click on the +1/+1 chip of her card adds a counter and saves it (3 to 4 in the database)', Boolean(await waitFor(async () => (await counterInDb()) === 4 ? true : null, 15000, 250)), String(await counterInDb()));
  await clickMarkOnCard(alice, aliceChip, 'right');
  record('a right click takes it off again (back to 3 in the database)', Boolean(await waitFor(async () => (await counterInDb()) === 3 ? true : null, 15000, 250)), String(await counterInDb()));
  record("Bob's copy of Alice's card has nothing to click: no number on it is a control", (await bob.eval(`document.querySelectorAll('#opponent-list [data-mark]').length`)) === 0);
  await bob.eval(`(() => { const chip = Array.from(document.querySelectorAll('#opponent-list .marks .chip'))[0]; if (chip) { chip.click(); chip.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); } })()`);
  await sleep(1500);
  record("pressing the numbers on Alice's card in Bob's browser changes nothing in the database", (await counterInDb()) === 3);

  // The right-click menu on the live table (real mouse input): a choice is saved like any move, and other players cannot open it.
  const menuOf = (page) => page.eval(`(() => { const m = document.querySelector('.card-menu'); return m ? { title: m.querySelector('.card-menu-title').textContent, items: [...m.querySelectorAll('[role="menuitem"]')].filter((b) => !b.closest('[hidden]')).map((b) => b.textContent.replace(String.fromCharCode(0x25b8), '').trim()) } : null; })()`);
  const clickMenuText = async (page, text) => {
    const p = await page.eval(`(() => { const b = [...document.querySelectorAll('.card-menu [role="menuitem"]')].find((x) => x.textContent.replace(String.fromCharCode(0x25b8), '').trim() === ${JSON.stringify(text)}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (!p) throw new Error(`no menu item "${text}"`);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: 1 });
  };
  const aliceCard = '#battlefield .card';
  const tappedInDb = async () => { const r = await rest('GET', pathOf('public/battlefield'), cleanup.bob.token); const card = r.json ? Object.values(r.json)[0] : null; return card ? card.x === 1 : null; };
  // a double click on her card taps it, and again untaps it (saved, and Bob sees it)
  {
  // aim at a spot that is the card itself, not a counter (the card is small and has counters by now)
    const dbl = async () => { const p = await alice.eval(`(() => { const card = document.querySelector('#battlefield .card'); const r = card.getBoundingClientRect(); for (let fy = 0.1; fy < 1; fy += 0.1) for (let fx = 0.9; fx > 0; fx -= 0.1) { const x = r.x + r.width * fx; const y = r.y + r.height * fy; const e = document.elementFromPoint(x, y); if (e && e.closest('.card') === card && !e.closest('[data-mark], [data-badge]')) return { x, y }; } return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`); await alice.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y }); for (const n of [1, 2]) { await alice.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: n }); await alice.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: n }); } };
    await dbl();
    record('a double click on the card of Alice taps it: tapped in the database that Bob can read', Boolean(await waitFor(async () => (await tappedInDb()) === true ? true : null, 15000, 250)));
    await dbl();
    record('...and a second double click untaps it again', Boolean(await waitFor(async () => (await tappedInDb()) === false ? true : null, 15000, 250)));
  }
  await alice.eval(`document.querySelector(${JSON.stringify(aliceCard)}).scrollIntoView({ block: 'center' })`);
  const cardAt = await alice.eval(`(() => { const r = document.querySelector(${JSON.stringify(aliceCard)}).getBoundingClientRect(); return { x: r.x + r.width * 0.85, y: r.y + r.height * 0.06 }; })()`); // the top right corner of the card: the counter chips and the badges are lower or on the left (a card is only 28 pixels wide at 1366x650, so the chips cover most of it)
  if (process.argv.includes('--screenshot')) { await alice.screenshot('scratch-table-alice-before-menu.png'); console.log('card at', JSON.stringify(cardAt), 'window', JSON.stringify(await alice.eval(`({ w: innerWidth, h: innerHeight, rect: document.querySelector(${JSON.stringify(aliceCard)}).getBoundingClientRect().toJSON(), under: (() => { const r = document.querySelector(${JSON.stringify(aliceCard)}).getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + 30); return e ? e.tagName + '.' + e.className : null; })() })`))); }
  await alice.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cardAt.x, y: cardAt.y });
  await alice.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cardAt.x, y: cardAt.y, button: 'right', buttons: 2, clickCount: 1 });
  await alice.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cardAt.x, y: cardAt.y, button: 'right', buttons: 0, clickCount: 1 });
  await sleep(150);
  const aliceMenu = await menuOf(alice);
  record("a right click on Alice's card opens its menu on the table page (Modify, Tap, the two marks, the counter with its amounts, Create copy, Ping card, Move to)", Boolean(aliceMenu) && JSON.stringify(aliceMenu.items) === JSON.stringify(['Modify...', 'Tap', "Doesn't untap", 'Summoning sick', '+1/+1 counter', '2', '3', '5', 'Create copy', 'Ping card', 'Move to']), JSON.stringify(aliceMenu));
  await clickMenuText(alice, 'Tap');
  record('Tap from the menu is saved: the card is tapped in the database that Bob can read', Boolean(await waitFor(async () => (await tappedInDb()) === true ? true : null, 15000, 250)));
  record("...and Bob's page shows Alice's card tapped, without a refresh", Boolean(await waitFor(async () => (await bob.eval(`Array.from(document.querySelectorAll('#opponent-list .opponent')).some((p) => p.querySelector('h3').textContent.includes('Alice') && p.querySelector('.card.tapped'))`)) ? true : null, 20000, 250)));
  const bobMenuTry = await bob.eval(`(() => { const card = document.querySelector('#opponent-list .opponent .card'); if (!card) return null; const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 50 }); card.dispatchEvent(e); return { prevented: e.defaultPrevented, menus: document.querySelectorAll('.card-menu').length }; })()`);
  record("a right click on Alice's card in Bob's browser opens no menu and is left to the browser", bobMenuTry && bobMenuTry.menus === 0 && bobMenuTry.prevented === false, JSON.stringify(bobMenuTry));
  const tappedAt = await alice.eval(`(() => { const card = document.querySelector('#battlefield .card'); const r = card.getBoundingClientRect(); for (let fy = 0.1; fy < 1; fy += 0.1) for (let fx = 0.9; fx > 0; fx -= 0.1) { const x = r.x + r.width * fx; const y = r.y + r.height * fy; const e = document.elementFromPoint(x, y); if (e && e.closest('.card') === card && !e.closest('[data-mark], [data-badge]')) return { x, y }; } return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`); // a tapped card is a small landscape box now: aim at a spot that is the card itself, not a counter or a badge
  await alice.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: tappedAt.x, y: tappedAt.y });
  await alice.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: tappedAt.x, y: tappedAt.y, button: 'right', buttons: 2, clickCount: 1 });
  await alice.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: tappedAt.x, y: tappedAt.y, button: 'right', buttons: 0, clickCount: 1 });
  await sleep(150);
  record('the menu then offers Untap, and choosing it untaps the card in the database', (await menuOf(alice))?.items[1] === 'Untap' && (await clickMenuText(alice, 'Untap'), Boolean(await waitFor(async () => (await tappedInDb()) === false ? true : null, 15000, 250))));

  const handBeforeRefresh = Object.values((await rest('GET', pathOf('private/hand'), cleanup.alice.token)).json).map((card) => card.u).sort().join();
  await alice.goto(`http://127.0.0.1:${PORT}/table/${code}`);
  const restored = await waitFor(async () => (await count(alice, '#hand .card')) === 7 && (await count(alice, '#battlefield .card')) === 1 ? true : null, 30000, 200);
  record('after a refresh Alice has the same game: 7 in hand, 1 on the battlefield, life 35', Boolean(restored) && (await text(alice, 'life')) === '35' && /back/i.test(await text(alice, 'deck-line')), `${await text(alice, 'life')} ${await text(alice, 'deck-line')}`);
  const marksAfterRefresh = await waitFor(async () => {
    const seen = await alice.eval(`(() => { const c = Array.from(document.querySelectorAll('#battlefield .card')).find((x) => x.querySelector('.marks')); return c ? { chips: Array.from(c.querySelectorAll('.marks .chip')).map((x) => x.textContent), change: c.querySelector('.marks .change')?.textContent ?? '' } : null; })()`);
    return seen && seen.chips.length === 2 ? seen : null;
  }, 15000, 250);
  record('after a refresh her card still has its counters and its +5/+3 change (read back from the database)', Boolean(marksAfterRefresh) && JSON.stringify(marksAfterRefresh.chips) === '["+1/+1 3","Other 5B"]' && marksAfterRefresh.change === '+5/+3', JSON.stringify(marksAfterRefresh));
  const handAfter = Object.values((await rest('GET', pathOf('private/hand'), cleanup.alice.token)).json).map((card) => card.u).sort().join();
  record('...and it was put back, not dealt again: the hand in the database is exactly the one she left', handAfter === handBeforeRefresh && handAfter.split(',').length === 7, handAfter);
  record('...and 6 of those 7 cards were in her first hand (one was played, one was drawn)', handAfter.split(',').filter((u) => handBefore.includes(u)).length === 6);
  // Dealing a new hand one card at a time on the table page: the shuffle sound, then the cards with a draw sound each. The game is dealt and SAVED at once; only what is
  // shown is staged. (It comes after the checks that compare Alice's hand with her first one, because a mulligan changes the hand.)
  {
    const handBefore = await count(alice, '#hand .card');
    await alice.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    await alice.eval(`window.__plays = []; HTMLMediaElement.prototype.play = function () { window.__plays.push(new URL(this.src).pathname); return Promise.resolve(); };`); // the page was reloaded since the earlier recorder
    await click(alice, 'mulligan');
    await sleep(150);
    record('Mulligan on the table page plays the shuffle sound and the shown hand is empty while the new hand waits to be dealt', JSON.stringify(await alice.eval(`window.__plays`)) === '["/sfx/shuffle.mp3"]' && (await count(alice, '#hand .card')) === 0);
    const savedAtOnce = await waitFor(async () => { const r = await rest('GET', pathOf('private/hand'), cleanup.alice.token); return r.json && Object.keys(r.json).length === 7 ? true : null; }, 15000, 250);
    record('...and the new hand of 7 is saved in the database without waiting for the animation', Boolean(savedAtOnce));
    await waitFor(async () => (await count(alice, '#hand .card')) === 7 ? true : null, 8000, 50);
    await sleep(300);
    record('then 7 draw sounds follow, one for each card, and the hand shows 7', JSON.stringify(await alice.eval(`window.__plays`)) === JSON.stringify(['/sfx/shuffle.mp3', ...Array(7).fill('/sfx/draw.mp3')]) && (await count(alice, '#hand .card')) === 7);
    await alice.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    for (let n = 7; n < handBefore; n++) await click(alice, 'draw'); // back to the size the hand had, as the checks below expect
    await waitFor(async () => (await count(alice, '#hand .card')) === Math.max(handBefore, 7) ? true : null, 8000, 50);
  }

  // Pinging a card (shared/ping.mjs): Alice shows one of her battlefield cards to the table. The record is one small write on HER branch; both pages show the spotlight and the card
  // glows on both screens; closing it is local; a refresh does not bring an old ping back; a card in the hand cannot be pinged. (Needs the rules published with the ping field.)
  {
    const spot = (page) => page.eval(`(() => { const r = document.getElementById('spotlight'); return { hidden: r.hidden, name: r.querySelector('.spot-name')?.textContent ?? '', line: r.querySelector('.spot-line')?.textContent ?? '', src: r.querySelector('.spot-picture')?.getAttribute('src') ?? '' }; })()`);
    const battlefieldCard = (await rest('GET', pathOf('public/battlefield'), cleanup.bob.token)).json;
    const first = battlefieldCard ? Object.values(battlefieldCard)[0] : null;
    record('Alice has a card on the battlefield to ping', Boolean(first?.n && first?.u), JSON.stringify(first));
    const aliceCard = `#battlefield .card`;
    await alice.eval(`document.querySelector(${JSON.stringify(aliceCard)}).click()`);
    await sleep(200);
    await act(alice, 'Ping card');
    const stored = await waitFor(async () => { const r = (await rest('GET', pathOf('public/ping'), cleanup.bob.token)).json; return r && r.k ? r : null; }, 15000, 250);
    record('the ping is ONE small record on Alice\'s own branch: a number and the card, nothing else', Boolean(stored) && Object.keys(stored).sort().join() === 'card,k' && Number.isInteger(stored.k) && stored.card.u === first?.u && stored.card.n === first?.n && stored.card.i === first?.i, JSON.stringify(stored));
    const aliceSees = await waitFor(async () => { const v = await spot(alice); return v.hidden ? null : v; }, 5000, 100);
    record('Alice\'s own page shows her ping at once: who, which card, and the card\'s picture (normal size)', Boolean(aliceSees) && aliceSees.name === first?.n && /^Seat 1: Alice pinged /.test(aliceSees.line) && aliceSees.src.includes('/normal/') , JSON.stringify(aliceSees));
    const bobSees = await waitFor(async () => { const v = await spot(bob); return v.hidden ? null : v; }, 20000, 250);
    record('Bob\'s page shows the same ping: the sentence names Alice and her seat, and the card', Boolean(bobSees) && bobSees.name === first?.n && bobSees.line === `Seat 1: Alice pinged ${first?.n}.` && bobSees.src.includes('/normal/'), JSON.stringify(bobSees));
    const glowOnBob = await waitFor(async () => (await bob.eval(`document.querySelectorAll('#opponent-list .opponent .card.pinged').length`)) >= 1 ? true : null, 5000, 100);
    record('the pinged card glows in Alice\'s panel on Bob\'s screen, and on Alice\'s own screen too', Boolean(glowOnBob) && (await alice.eval(`document.querySelectorAll('#game .card.pinged').length`)) >= 1);
    await bob.eval(`document.querySelector('#spotlight .spot-close').click()`);
    record('Bob closes his spotlight; Alice\'s stays open (closing is local)', (await spot(bob)).hidden === true && (await spot(alice)).hidden === false);

    // the right-click menu path, a second ping of the same card (the number must differ so Bob shows it again)
    await sleep(900);
    await alice.eval(`document.querySelector(${JSON.stringify(aliceCard)}).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 300, button: 2 }))`);
    await sleep(300);
    const offered = await alice.eval(`[...document.querySelectorAll('.card-menu [role="menuitem"]')].map((b) => b.textContent.replace(/[^A-Za-z/ ]/g, '').trim())`);
    record('the right-click menu of a battlefield card offers Ping card', offered.includes('Ping card'), JSON.stringify(offered));
    await alice.eval(`[...document.querySelectorAll('.card-menu [role="menuitem"]')].find((b) => b.textContent.includes('Ping card')).click()`);
    const second = await waitFor(async () => { const r = (await rest('GET', pathOf('public/ping'), cleanup.bob.token)).json; return r && r.k !== stored?.k ? r : null; }, 15000, 250);
    record('pinging from the menu writes a record with a DIFFERENT number', Boolean(second) && second.k > stored.k, JSON.stringify([stored?.k, second?.k]));
    const bobAgain = await waitFor(async () => { const v = await spot(bob); return v.hidden ? null : v; }, 20000, 250);
    record('and Bob\'s page shows it again, after he had closed the first', Boolean(bobAgain) && bobAgain.name === first?.n);

    // a refresh does not bring an old ping back
    await bob.eval(`location.reload()`);
    await waitFor(async () => (await bob.eval(`document.getElementById('game')?.hidden === false`)) ? true : null, 30000, 250);
    await sleep(2500);
    record('after Bob refreshes his page the old ping is not shown again', (await spot(bob)).hidden === true);

    // a card in the hand cannot be pinged: not from the buttons, not from the menu (a ping would reveal it)
    await alice.eval(`document.querySelector('#hand .card').click()`);
    await sleep(200);
    record('a card in the hand has no Ping card in its menu', !(await buttonLabels()).includes('Ping card'));
    await alice.eval(`document.querySelector('#hand .card').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 700, button: 2 }))`);
    await sleep(300);
    record('...and no Ping card item in its right-click menu', (await alice.eval(`[...document.querySelectorAll('.card-menu [role="menuitem"]')].some((b) => b.textContent.includes('Ping'))`)) === false);
    await alice.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
    await alice.eval(`document.querySelector('#spotlight .spot-close').click()`);
  }

  // Turning a two-sided card over: Alice takes Delver (a transform card) out of her sideboard, plays it and turns it over. The database
  // holds only a turned-over mark (bk), and Bob's page, which knows from its own card list that the card has a back, shows the back.
  const delverOf = (browser, where) => browser.eval(`(() => {
    const cards = Array.from(document.querySelectorAll(${JSON.stringify(where)}));
    const card = cards.find((c) => (c.getAttribute('aria-label') || '').startsWith('Delver'));
    if (!card) return null;
    const img = card.querySelector('img');
    return { label: card.getAttribute('aria-label'), src: img ? img.getAttribute('src') : null, parent: card.parentElement.id, disabled: card.disabled };
  })()`);
  const delverInDb = async () => { const r = await rest('GET', pathOf('public/battlefield'), cleanup.bob.token); return r.json ? Object.values(r.json).find((c) => c.n?.startsWith('Delver')) ?? null : null; };
  await click(alice, 'pile-sideboard');
  const sideRows = await waitFor(async () => { const n = await count(alice, '#viewer-list .card'); return n >= 1 ? n : null; }, 10000, 100);
  record("Alice's sideboard holds the Delver (the one card the deck put there)", sideRows === 1 && (await alice.eval(`document.querySelector('#viewer-list .card').getAttribute('aria-label')`)).includes('Delver'), `rows ${sideRows} | button: ${await text(alice, 'pile-sideboard')} | viewer hidden: ${await alice.eval(`document.getElementById('viewer').hidden`)} | db sideboard: ${JSON.stringify((await rest('GET', pathOf('private/sideboard'), cleanup.alice.token)).json)} | deck line: ${await text(alice, 'deck-line')}`);
  await alice.eval(`document.querySelector('#viewer-list .card').click()`);
  await act(alice, 'To battlefield');
  const delverPlayed = await waitFor(async () => (await delverInDb()) ? true : null, 15000, 250);
  record('playing it puts it on the public battlefield, showing its front: no turned-over mark in the database', Boolean(delverPlayed) && (await delverInDb()).bk === undefined, JSON.stringify(await delverInDb()));
  record('her right-click menu offers Turn over for it (the page found its back face by name in the card list)', (await buttonLabels()).includes('Turn over'), (await buttonLabels()).join(' | '));
  await act(alice, 'Turn over');
  const delverTurned = await waitFor(async () => (await delverInDb())?.bk === 1 ? await delverInDb() : null, 15000, 250);
  record('turning it over saves exactly one small mark on that card: bk is 1, and no back-face field (b) is stored', Boolean(delverTurned) && delverTurned.bk === 1 && !('b' in delverTurned) && !('turned' in delverTurned), JSON.stringify(delverTurned));
  const aliceDelver = await delverOf(alice, '#battlefield .card');
  record("on Alice's page it shows the back picture, says it is turned over, and button now says how to turn it back", Boolean(aliceDelver) && aliceDelver.src.includes('/back/') && /turned over/.test(aliceDelver.label) && (await buttonLabels()).includes('Turn back to front'), JSON.stringify(aliceDelver));
  const bobDelver = await waitFor(async () => { const d = await delverOf(bob, '#opponent-list .opponent .card'); return d && d.src?.includes('/back/') ? d : null; }, 20000, 250);
  record("Bob's page, without a refresh, shows the BACK picture and the label turned over on Alice's card, and the card is read-only", Boolean(bobDelver) && /turned over/.test(bobDelver.label) && bobDelver.disabled === true, JSON.stringify(bobDelver));
  const bobLabelsFor = await bob.eval(`Array.from(document.querySelectorAll('#opponent-list .opponent button')).map((b) => b.textContent).join('|')`);
  record("Bob's page offers no Turn over button for Alice's card", !/Turn over|Turn back/.test(bobLabelsFor), bobLabelsFor);
  // Create copy: a copy copies only the face that shows. Alice's Delver is turned over, so the copy is Insectile Aberration, a 3/2 with the
  // back picture. What is stored must be small and valid: the type line of ONE face (a whole "A // B" line is over the 60 characters a
  // stored token may have for 93 cards, which would make the copy vanish for everyone who reads it).
  const copyInDb = async () => { const r = await rest('GET', pathOf('public/battlefield'), cleanup.bob.token); return r.json ? Object.values(r.json).find((c) => c.tok === 1 && c.n === 'Insectile Aberration') ?? null : null; };
  const faceOf = (browser, where, prefix) => browser.eval(`(() => { const card = Array.from(document.querySelectorAll(${JSON.stringify(where)})).find((c) => (c.getAttribute('aria-label') || '').startsWith(${JSON.stringify(prefix)})); if (!card) return null; const img = card.querySelector('img'); return { label: card.getAttribute('aria-label'), src: img ? img.getAttribute('src') : null, disabled: card.disabled }; })()`);
  record('her selected-card buttons offer Create copy for the turned Delver', (await buttonLabels()).includes('Create copy'), (await buttonLabels()).join(' | '));
  await act(alice, 'Create copy');
  const copyStored = await waitFor(async () => (await copyInDb()) ?? null, 15000, 250);
  record('the copy is saved as a small token of the BACK face: its name, ONE face\'s type line, its 3/2, bk 1, and no back-face or counter fields', Boolean(copyStored) && copyStored.tt === 'Creature — Human Insect' && copyStored.pt === '3/2' && copyStored.bk === 1 && copyStored.tok === 1 && !('b' in copyStored) && !('ct' in copyStored) && copyStored.tt.length <= 60, JSON.stringify(copyStored));
  const aliceCopy = await waitFor(async () => { const d = await faceOf(alice, '#battlefield .card', 'Insectile Aberration'); return d && d.src?.includes('/back/') ? d : null; }, 15000, 250);
  record('on Alice\'s page the copy shows the back picture, and is not called turned over (it is a copy, not a two-sided card)', Boolean(aliceCopy) && !/turned over/.test(aliceCopy.label), JSON.stringify(aliceCopy));
  const bobCopy = await waitFor(async () => { const d = await faceOf(bob, '#opponent-list .opponent .card', 'Insectile Aberration'); return d && d.src?.includes('/back/') ? d : null; }, 20000, 250);
  record('Bob\'s page shows the copy too, read-only, with the back picture and without a refresh (it is a valid card for him)', Boolean(bobCopy) && bobCopy.disabled === true, JSON.stringify(bobCopy));
  await alice.goto(`http://127.0.0.1:${PORT}/table/${code}`);
  const copyAfterRefresh = await waitFor(async () => { const d = await faceOf(alice, '#battlefield .card', 'Insectile Aberration'); return d && d.src?.includes('/back/') ? d : null; }, 30000, 250);
  record('after a refresh the copy is still there with the back picture (read back from the database)', Boolean(copyAfterRefresh), JSON.stringify(copyAfterRefresh));
  const delverAfterRefresh = await waitFor(async () => { const d = await delverOf(alice, '#battlefield .card'); return d && d.src?.includes('/back/') ? d : null; }, 30000, 250);
  record('after a refresh Alice\'s Delver is still turned over (read back from the database)', Boolean(delverAfterRefresh) && /turned over/.test(delverAfterRefresh.label), JSON.stringify(delverAfterRefresh));
  await alice.eval(`Array.from(document.querySelectorAll('#battlefield .card')).find((c) => (c.getAttribute('aria-label') || '').startsWith('Delver')).click()`);
  await act(alice, 'Turn back to front');
  const delverBack = await waitFor(async () => { const d = await delverInDb(); return d && d.bk === undefined ? d : null; }, 15000, 250);
  record('turning it back removes the mark from the database (nothing is stored for a card showing its front)', Boolean(delverBack), JSON.stringify(await delverInDb()));
  const bobFront = await waitFor(async () => { const d = await delverOf(bob, '#opponent-list .opponent .card'); return d && d.src?.includes('/front/') ? d : null; }, 20000, 250);
  record("and Bob's page shows the front picture again", Boolean(bobFront) && !/turned over/.test(bobFront.label), JSON.stringify(bobFront));
  // Player counters and commander damage, as chips next to the life total, set from a right-click on the life. Alice's table is a Commander table, so her menu has commander
  // damage for every seat with a commander (hers and Bob's). The damage is stored as one number per seat on HER public branch (she took it), and Bob's page shows it as chips on her panel, read-only.
  // Only the counters the PUBLISHED rules accept are offered on this table (poison, energy, experience); the rest are for the solo table until the rules are changed.
  const rightClickLife = async (page) => {
    const p = await page.eval(`(() => { const r = document.getElementById('life').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'right', buttons: 2, clickCount: 1 });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'right', buttons: 0, clickCount: 1 });
    await sleep(150);
  };
  const lifeMenuPick = async (page, ...path) => { await rightClickLife(page); for (const step of path) await pressMenuEntry(page, step); };
  const closeAnyMenu = async (page) => { await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(60); };
  const chipFacts = (browser, scope) => browser.eval(`(() => { const box = document.querySelector(${JSON.stringify(scope)}); if (!box) return null; return [...box.querySelectorAll('.counter-chip')].map((c) => ({ id: c.dataset.id, number: c.querySelector('.chip-count').hidden ? null : c.querySelector('.chip-count').textContent, label: c.getAttribute('aria-label'), lethal: c.classList.contains('lethal'), word: !c.querySelector('.chip-lethal').hidden, buttons: c.querySelectorAll('button').length })); })()`);
  const onAlice = `#opponent-list .opponent[data-uid="${cleanup.alice.uid}"] .opponent-counters`;
  const hit = (chips, id) => (chips ?? []).find((c) => c.id === id) ?? null;
  await rightClickLife(alice);
  const aliceLifeMenu = await menuOf(alice);
  await closeAnyMenu(alice);
  record('Alice has no counters section any more; a right-click on her life opens a menu with the counters the database accepts and commander damage for the two seats that have a commander (the format is Commander)', Boolean(aliceLifeMenu) && aliceLifeMenu.title === 'Your counters' && JSON.stringify(aliceLifeMenu.items) === JSON.stringify(['Poison: 0', 'Energy: 0', 'Experience: 0', 'Commander damage from Seat 1: Alice: 0', 'Commander damage from Seat 2: Bob: 0']) && (await count(alice, '#counters, #player-counters, #commander-damage-block')) === 0, JSON.stringify(aliceLifeMenu));
  await lifeMenuPick(alice, 'Poison: 0', 'Add 1'); await lifeMenuPick(alice, 'Poison: 1', 'Add 1'); await lifeMenuPick(alice, 'Poison: 2', 'Add 1');
  await lifeMenuPick(alice, 'Commander damage from Seat 2: Bob: 0', 'Add 5'); await lifeMenuPick(alice, 'Commander damage from Seat 2: Bob: 5', 'Add 1'); await lifeMenuPick(alice, 'Commander damage from Seat 2: Bob: 6', 'Add 1');
  const countersSaved = await waitFor(async () => { const pc = (await rest('GET', pathOf('public/pc'), cleanup.bob.token)).json; const cd = (await rest('GET', pathOf('public/cd'), cleanup.bob.token)).json; return pc?.poison === 3 && cd?.['2'] === 7 ? { pc, cd } : null; }, 15000, 250);
  record('3 poison and 7 commander damage from seat 2 are saved: one small number each, and nothing for the counters at 0', Boolean(countersSaved) && JSON.stringify(countersSaved.pc) === '{"poison":3}' && JSON.stringify(countersSaved.cd) === '{"2":7}', JSON.stringify(countersSaved));
  const aliceChips = await chipFacts(alice, '#life-chips');
  record("Alice's life area shows the two chips: poison 3 and the damage from seat 2, 7", aliceChips && aliceChips.length === 2 && hit(aliceChips, 'counter:poison')?.number === '3' && hit(aliceChips, 'damage:2')?.number === '7' && hit(aliceChips, 'damage:2')?.label === 'Commander damage from Seat 2: Bob: 7', JSON.stringify(aliceChips));
  const bobSeesChips = await waitFor(async () => { const c = await chipFacts(bob, onAlice); return hit(c, 'counter:poison')?.number === '3' && hit(c, 'damage:2')?.number === '7' ? c : null; }, 20000, 250);
  record("Bob's page shows Alice's poison 3 and the 7 damage from seat 2 as chips on her panel, without a refresh, and with no buttons (read-only)", Boolean(bobSeesChips) && bobSeesChips.every((c) => c.buttons === 0) && hit(bobSeesChips, 'damage:2').label === 'Commander damage from Seat 2: Bob: 7' && bobSeesChips.length === 2, JSON.stringify(bobSeesChips));
  record("a counter Alice does not have is not shown on her panel (energy is at 0, so there is no chip)", !hit(bobSeesChips, 'counter:energy'));
  const bobOwnChips = await chipFacts(bob, '#life-chips');
  await rightClickLife(bob);
  const bobLifeMenu = await menuOf(bob);
  await closeAnyMenu(bob);
  record("Bob's own life area is separate: no chips, and his menu has the same counters and the same two seats of commander damage", bobOwnChips && bobOwnChips.length === 0 && bobLifeMenu && JSON.stringify(bobLifeMenu.items) === JSON.stringify(aliceLifeMenu.items), JSON.stringify({ bobOwnChips, bobLifeMenu }));
  const damage = (n) => `Commander damage from Seat 2: Bob: ${n}`;
  await lifeMenuPick(alice, damage(7), 'Add 5'); await lifeMenuPick(alice, damage(12), 'Add 5');
  for (const n of [17, 18, 19, 20]) await lifeMenuPick(alice, damage(n), 'Add 1');
  const lethalSaved = await waitFor(async () => (await rest('GET', pathOf('public/cd/2'), cleanup.bob.token)).json === 21 ? true : null, 15000, 250);
  const aliceLethal = hit(await chipFacts(alice, '#life-chips'), 'damage:2');
  const bobLethal = await waitFor(async () => { const f = hit(await chipFacts(bob, onAlice), 'damage:2'); return f && f.lethal && f.word ? f : null; }, 20000, 250);
  record('21 damage from one commander is saved, and is marked lethal (with the word) on Alice\'s page and on Bob\'s view of her panel', Boolean(lethalSaved) && aliceLethal.lethal && aliceLethal.word && Boolean(bobLethal), JSON.stringify({ aliceLethal, bobLethal }));
  await lifeMenuPick(alice, damage(21), 'Remove 5');
  const backDown = await waitFor(async () => (await rest('GET', pathOf('public/cd/2'), cleanup.bob.token)).json === 16 ? true : null, 15000, 250);
  const bobNotLethal = await waitFor(async () => { const f = hit(await chipFacts(bob, onAlice), 'damage:2'); return f && f.number === '16' && !f.lethal && !f.word ? f : null; }, 20000, 250);
  record('taking 5 off saves 16 and the lethal mark goes away for both players', Boolean(backDown) && Boolean(bobNotLethal), JSON.stringify(bobNotLethal));
  await alice.goto(`http://127.0.0.1:${PORT}/table/${code}`);
  const counterRefresh = await waitFor(async () => { const c = await chipFacts(alice, '#life-chips'); return hit(c, 'counter:poison')?.number === '3' && hit(c, 'damage:2')?.number === '16' ? c : null; }, 30000, 250);
  record('after a refresh Alice has her counters back: 3 poison and 16 damage from seat 2 (read from the database)', Boolean(counterRefresh), JSON.stringify(counterRefresh));

  // Whose turn it is, passing it, and the two marks. Alice is seat 1, so the match starts on her turn. A pass is ONE small record on the passer's own
  // branch (a player cannot write another's); both pages read everyone's branches, and the player the newest record names starts their own turn.
  const bobPath = (where) => `tables/${code}/public/${cleanup.bob.uid}${where ? `/${where}` : ''}`;
  const turnFacts = (browser) => browser.eval(`({ banner: document.getElementById('turn-banner').hidden ? '' : document.getElementById('turn-banner').textContent, mine: document.getElementById('turn-banner').classList.contains('mine'), whose: document.getElementById('turn-whose').textContent, turn: document.getElementById('turn').textContent, pass: document.getElementById('pass-turn').textContent, passHidden: document.getElementById('pass-turn').hidden, passSecondary: document.getElementById('pass-turn').classList.contains('secondary'), takeBack: !document.getElementById('take-back').hidden, title: document.title })`);
  const panelState = (browser, uid) => browser.eval(`(() => { const p = document.querySelector('#opponent-list .opponent[data-uid="${uid}"]'); return p ? { active: p.classList.contains('active'), mark: Boolean(p.querySelector('.turn-mark')) } : null; })()`);
  const handCount = async (uid) => (await rest('GET', `tables/${code}/public/${uid}/counts/hand`, cleanup.alice.token)).json;
  const aliceStart = await waitFor(async () => { const f = await turnFacts(alice); return /^It is your turn \(turn 1\)\./.test(f.banner) && f.mine ? f : null; }, 20000, 250);
  record('at the start it is turn 1 and Alice\'s turn: she has the banner, "Your turn", Pass turn as the main button, and the page title says so', Boolean(aliceStart) && aliceStart.whose === 'Your turn' && aliceStart.turn === '1' && aliceStart.pass === 'Pass turn' && !aliceStart.passSecondary && /^Your turn - /.test(aliceStart.title) && !aliceStart.takeBack, JSON.stringify(aliceStart));
  const bobWaiting = await waitFor(async () => { const f = await turnFacts(bob); return f.whose === "Seat 1: Alice's turn" ? f : null; }, 20000, 250);
  record('Bob sees whose turn it is, has a plain banner (not highlighted), and his button says he would be skipping her turn', Boolean(bobWaiting) && bobWaiting.banner === "Turn 1: Seat 1: Alice's turn" && !bobWaiting.mine && bobWaiting.pass === "Skip Seat 1: Alice's turn" && bobWaiting.passSecondary && !/^Your turn/.test(bobWaiting.title) && bobWaiting.turn === '1', JSON.stringify(bobWaiting));
  const alicePanel = await waitFor(async () => { const s = await panelState(bob, cleanup.alice.uid); return s && s.active ? s : null; }, 20000, 250);
  record("Alice's panel on Bob's page is marked as the active player's", Boolean(alicePanel) && alicePanel.mark, JSON.stringify(alicePanel));

  // The marks, seen by the other player: Alice's Delver came in sick (a creature without printed haste); she marks it as one that does not untap and taps it.
  const delverStored = async () => { const r = await rest('GET', pathOf('public/battlefield'), cleanup.bob.token); return r.json ? Object.values(r.json).find((c) => c.n?.startsWith('Delver')) ?? null : null; };
  const aliceBadges = (browser, where) => browser.eval(`(() => { const c = Array.from(document.querySelectorAll(${JSON.stringify(where)})).find((x) => (x.getAttribute('aria-label') || '').startsWith('Delver')); return c ? { sick: Boolean(c.querySelector('.badge-sick')), lock: Boolean(c.querySelector('.badge-lock')), clickable: Boolean(c.querySelector('[data-badge]')), label: c.getAttribute('aria-label') } : null; })()`);
  const sickStored = await delverStored();
  record('Alice\'s Delver came in summoning sick: one small mark in the database (sk 1), which Bob\'s page shows as a SICK badge he cannot click', Boolean(sickStored) && sickStored.sk === 1 && !('nu' in sickStored), JSON.stringify(sickStored));
  const bobSeesSick = await waitFor(async () => { const b = await aliceBadges(bob, '#opponent-list .opponent .card'); return b && b.sick ? b : null; }, 20000, 250);
  record("Bob's page shows the SICK badge on Alice's Delver, read-only, and its label says so", Boolean(bobSeesSick) && !bobSeesSick.clickable && /summoning sick/.test(bobSeesSick.label), JSON.stringify(bobSeesSick));
  await alice.eval(`Array.from(document.querySelectorAll('#battlefield .card')).find((c) => (c.getAttribute('aria-label') || '').startsWith('Delver')).click()`);
  await act(alice, "Doesn't untap");
  await act(alice, 'Tap');
  const lockStored = await waitFor(async () => { const c = await delverStored(); return c && c.nu === 1 && c.x === 1 ? c : null; }, 15000, 250);
  record('marking it "does not untap" and tapping it saves nu 1 and x 1 on that card', Boolean(lockStored), JSON.stringify(await delverStored()));
  const bobSeesLock = await waitFor(async () => { const b = await aliceBadges(bob, '#opponent-list .opponent .card'); return b && b.lock ? b : null; }, 20000, 250);
  record("Bob's page shows the lock on Alice's Delver, and the card says it does not untap", Boolean(bobSeesLock) && !bobSeesLock.clickable && /doesn't untap/.test(bobSeesLock.label), JSON.stringify(bobSeesLock));

  // Alice passes: one record on HER branch; Bob's own page starts Bob's turn (untap, draw, his turn number).
  const bobHandBefore = await handCount(cleanup.bob.uid);
  const aliceDialogsBefore = alice.dialogs.length;
  await bob.eval(`window.__plays = []; HTMLMediaElement.prototype.play = function () { window.__plays.push(new URL(this.src).pathname); return Promise.resolve(); };`);
  await click(alice, 'pass-turn');
  record('passing your OWN turn asks nothing (no popup)', alice.dialogs.length === aliceDialogsBefore, JSON.stringify(alice.dialogs.slice(aliceDialogsBefore)));
  const passStored = await waitFor(async () => { const p = (await rest('GET', pathOf('public/pass'), cleanup.bob.token)).json; return p && p.n === 2 ? p : null; }, 15000, 250);
  record('Pass turn writes exactly one small record on Alice\'s own branch: turn 2, to seat 2 (and nothing for the first turn, which it replaced)', Boolean(passStored) && JSON.stringify(passStored) === '{"n":2,"to":"2"}', JSON.stringify(passStored));
  const bobStarted = await waitFor(async () => { const t = (await rest('GET', bobPath('turn'), cleanup.alice.token)).json; return t === 2 ? true : null; }, 20000, 250);
  record("Bob's page starts Bob's turn by itself: his own turn number becomes 2 in the database, and he did NOT draw (players draw their own card)", Boolean(bobStarted) && (await handCount(cleanup.bob.uid)) === bobHandBefore, `${bobHandBefore} -> ${await handCount(cleanup.bob.uid)}`);
  const bobBanner = await waitFor(async () => { const f = await turnFacts(bob); return /^It is your turn \(turn 2\)\./.test(f.banner) ? f : null; }, 20000, 250);
  record('the banner on Bob page is highlighted and tells him what to do next (sickness ended, draw and untap himself), "Your turn", the table\'s turn number 2, and the page title says it is his turn', Boolean(bobBanner) && /Summoning sickness ended/.test(bobBanner.banner) && /Draw and untap when you are ready/.test(bobBanner.banner) && bobBanner.whose === 'Your turn' && bobBanner.turn === '2' && bobBanner.pass === 'Pass turn' && /^Your turn - /.test(bobBanner.title) && !bobBanner.takeBack, JSON.stringify(bobBanner));
  record("Bob's page plays the your-turn sound once when his turn begins by itself (Alice's page plays none)", JSON.stringify(await bob.eval(`window.__plays`)) === '["/sfx/yourturn.mp3"]' && !String(JSON.stringify(await alice.eval(`window.__plays`))).includes('yourturn'), JSON.stringify(await bob.eval(`window.__plays`)));
  const aliceAfterPass = await waitFor(async () => { const f = await turnFacts(alice); return f.banner === "Turn 2: Seat 2: Bob's turn" && !f.mine && f.whose === "Seat 2: Bob's turn" ? f : null; }, 20000, 250);
  record("Alice's banner is plain again (Turn 2: Seat 2: Bob's turn), her button now skips Bob's turn, she can take her pass back, and her title is the plain one", Boolean(aliceAfterPass) && aliceAfterPass.pass === "Skip Seat 2: Bob's turn" && aliceAfterPass.takeBack && !/^Your turn/.test(aliceAfterPass.title) && aliceAfterPass.turn === '2', JSON.stringify(aliceAfterPass));
  record("Alice's own turn number stayed 1 (a player only starts their own turns)", (await rest('GET', pathOf('public/turn'), cleanup.bob.token)).json === 1);
  const bobActive = await waitFor(async () => { const s = await panelState(alice, cleanup.bob.uid); return s && s.active && s.mark ? s : null; }, 20000, 250);
  record("Bob's panel on Alice's page is now the marked one", Boolean(bobActive));

  // Bob passes back: Alice's page starts her turn 3: she draws, summoning sickness ends, the lock stays and the card stays tapped.
  const aliceHandBefore = await handCount(cleanup.alice.uid);
  await click(bob, 'pass-turn');
  const bobPassStored = await waitFor(async () => { const p = (await rest('GET', bobPath('pass'), cleanup.alice.token)).json; return p && p.n === 3 ? p : null; }, 15000, 250);
  record("Bob's pass is turn 3, to seat 1, and remembers the turn it replaced (turn 2, seat 2), so it can be taken back", Boolean(bobPassStored) && JSON.stringify(bobPassStored) === '{"from":{"n":2,"to":"2"},"n":3,"to":"1"}' || JSON.stringify(bobPassStored) === '{"n":3,"to":"1","from":{"n":2,"to":"2"}}', JSON.stringify(bobPassStored));
  const aliceStarted = await waitFor(async () => { const t = (await rest('GET', pathOf('public/turn'), cleanup.bob.token)).json; return t === 3 ? true : null; }, 20000, 250);
  record("Alice's page starts Alice's turn by itself: her own turn number becomes 3 and she did NOT draw", Boolean(aliceStarted) && (await handCount(cleanup.alice.uid)) === aliceHandBefore, `${aliceHandBefore} -> ${await handCount(cleanup.alice.uid)}`);
  const afterStart = await delverStored();
  record("her turn starting ended the summoning sickness of her Delver (no sk), and the card is still tapped and still marked not to untap (x 1, nu 1)", Boolean(afterStart) && !('sk' in afterStart) && afterStart.x === 1 && afterStart.nu === 1, JSON.stringify(afterStart));
  const bobSeesClear = await waitFor(async () => { const b = await aliceBadges(bob, '#opponent-list .opponent .card'); return b && !b.sick && b.lock ? b : null; }, 20000, 250);
  record("Bob's page shows the lock but no SICK badge any more", Boolean(bobSeesClear));
  const aliceOwn = await aliceBadges(alice, '#battlefield .card');
  record("on Alice's page the lock is a badge she can click, and SICK is gone", Boolean(aliceOwn) && aliceOwn.lock && !aliceOwn.sick && aliceOwn.clickable, JSON.stringify(aliceOwn));

  // A refresh must not start the turn again (no second draw).
  const turnHandBeforeRefresh = await handCount(cleanup.alice.uid);
  await alice.goto(`http://127.0.0.1:${PORT}/table/${code}`);
  const afterRefreshTurn = await waitFor(async () => { const f = await turnFacts(alice); return /^It is your turn \(turn 3\)\./.test(f.banner) ? f : null; }, 30000, 250);
  await sleep(1500);
  record('after a refresh it is still turn 3 and Alice\'s turn, and the turn did not start twice: her hand and her own turn number are as they were', Boolean(afterRefreshTurn) && (await handCount(cleanup.alice.uid)) === turnHandBeforeRefresh && (await rest('GET', pathOf('public/turn'), cleanup.bob.token)).json === 3, `${turnHandBeforeRefresh} -> ${await handCount(cleanup.alice.uid)}`);

  // Skipping: it is Alice's turn, and Bob presses his button (she is not there): Bob confirms, and the turn goes round to him.
  const bobHandBeforeSkip = await handCount(cleanup.bob.uid);
  const skipLabel = (await turnFacts(bob)).pass;
  const bobDialogsBefore = bob.dialogs.length;
  await click(bob, 'pass-turn');
  const skipAsked = bob.dialogs.slice(bobDialogsBefore);
  record("skipping someone else's turn asks first, naming whose turn it is and why", skipAsked.length === 1 && /^Skip Seat 1: Alice's turn\? Use this when that player has left the table or cannot play\.$/.test(skipAsked[0]), JSON.stringify(skipAsked));
  const skipStored = await waitFor(async () => { const p = (await rest('GET', bobPath('pass'), cleanup.alice.token)).json; return p && p.n === 4 ? p : null; }, 15000, 250);
  record('Bob skipping Alice\'s turn (his button said "Skip Seat 1: Alice\'s turn", and asked first) writes turn 4, to himself, remembering turn 3', skipLabel === "Skip Seat 1: Alice's turn" && Boolean(skipStored) && skipStored.to === '2' && skipStored.from?.n === 3 && skipStored.from?.to === '1', JSON.stringify(skipStored));
  const bobSkipStarted = await waitFor(async () => { const t = (await rest('GET', bobPath('turn'), cleanup.alice.token)).json; return t === 4 ? true : null; }, 20000, 250);
  record('and Bob\'s page starts his turn 4 (the number only: he did not draw)', Boolean(bobSkipStarted) && (await handCount(cleanup.bob.uid)) === bobHandBeforeSkip);
  // Taking it back: Bob's record goes back to turn 3 (Alice's), NOT to turn 2 (his earlier record had been replaced, which a first design got wrong).
  await waitFor(async () => (await turnFacts(bob)).takeBack ? true : null, 20000, 250);
  await click(bob, 'take-back');
  const takenBack = await waitFor(async () => { const p = (await rest('GET', bobPath('pass'), cleanup.alice.token)).json; return p && p.n === 3 ? p : null; }, 15000, 250);
  record("Take back puts Bob's record back to turn 3, seat 1 (not turn 2), and it is Alice's turn again for both players", Boolean(takenBack) && takenBack.to === '1' && (await waitFor(async () => { const f = await turnFacts(alice); return /^It is your turn \(turn 3\)\./.test(f.banner) && (await turnFacts(bob)).whose === "Seat 1: Alice's turn" ? true : null; }, 20000, 250)) === true, JSON.stringify(takenBack));
  record("Bob's turn number stays 4 (taking a pass back does not un-draw his card), and Alice's did not start again", (await rest('GET', bobPath('turn'), cleanup.alice.token)).json === 4 && (await rest('GET', pathOf('public/turn'), cleanup.bob.token)).json === 3);
  if (process.argv.includes('--screenshot')) {
    await alice.eval(`window.scrollTo(0, 0)`); await sleep(400);
    await alice.screenshot('scratch-table-alice-turn.png'); // Alice's turn: the banner, the turn line and Pass turn
    await pressStep(alice, `${ownDamage('2')} button[data-step="5"]`, 1); // back to 21, so the picture shows the lethal mark
    await pressStep(alice, `${ownCounter('energy')} button[data-step="1"]`, 2);
    await sleep(2500);
    await alice.eval(`document.getElementById('life-area').scrollIntoView()`); await sleep(300);
    await alice.screenshot('scratch-table-alice-counters.png');
    await bob.eval(`document.getElementById('opponents').scrollIntoView()`); await sleep(300);
    await bob.screenshot('scratch-table-page.png');
  }
  await bob.goto(`http://127.0.0.1:${PORT}/table/${code}`); // a refresh puts a player back at the table
  const afterRefresh2 = await tableRows(bob);
  record('a refresh of the table page keeps Bob at the table', Boolean(afterRefresh2));

  // The match buttons: concede, end the match (host only), leave. Then a second match deals a NEW game (the old one is not restored).
  const shown = (browser, id) => browser.eval(`(() => { const e = document.getElementById(${JSON.stringify(id)}); return Boolean(e) && !e.hidden && !e.closest('[hidden]'); })()`);
  const pathIs = (browser, path) => waitFor(async () => (await browser.eval('location.pathname')) === path ? true : null, 25000, 200);
  const buttonsReady = await waitFor(async () => (await shown(alice, 'end-match')) && (await shown(bob, 'concede')) ? true : null, 30000, 200);
  record('during the match every player sees Concede and Leave, and only the host sees End the match', Boolean(buttonsReady) && (await shown(alice, 'concede')) && (await shown(alice, 'leave')) && (await shown(bob, 'leave')) && !(await shown(bob, 'end-match')));
  if (process.argv.includes('--screenshot')) { await alice.eval(`window.scrollTo(0, 0)`); await sleep(300); await alice.screenshot('scratch-match-buttons.png'); }
  await click(bob, 'concede'); // the page asks first; the test browser says yes
  const conceded = await waitFor(async () => (await players(alice)).some((t) => t.includes('Bob') && t.includes('(conceded)')) ? true : null, 20000, 250);
  record("Bob concedes: Alice's page shows him as conceded, the database has his match number, and his own button is off", Boolean(conceded) && (await rest('GET', `tables/${code}/members/${cleanup.bob.uid}/conceded`, cleanup.alice.token)).json === 1 && (await bob.eval(`document.getElementById('concede').disabled`)) === true);
  record("...and Alice, who did not concede, is not marked", !(await players(alice)).some((t) => t.includes('Alice') && t.includes('(conceded)')));

  // A conceded player is skipped by Pass turn, and a conceded player's page does not start a turn even if a record names them.
  const bobTurnBefore = (await rest('GET', bobPath('turn'), cleanup.alice.token)).json;
  const bobHandBeforeNaming = await handCount(cleanup.bob.uid);
  await waitFor(async () => (await turnFacts(alice)).pass === 'Pass turn' ? true : null, 20000, 250); // it is Alice's turn (turn 3)
  await click(alice, 'pass-turn');
  const skippedConceded = await waitFor(async () => { const p = (await rest('GET', pathOf('public/pass'), cleanup.bob.token)).json; return p && p.n === 4 ? p : null; }, 15000, 250);
  record('Alice passes while Bob has conceded: the pass skips him and comes back to Alice herself (turn 4, seat 1)', Boolean(skippedConceded) && skippedConceded.to === '1', JSON.stringify(skippedConceded));
  const wrote = await rest('PUT', pathOf('public/pass'), cleanup.alice.token, { n: 5, to: '2', from: { n: 4, to: '1' } }); // a record that names Bob, which the page never writes
  await sleep(4000);
  record('a pass that names a player who has conceded does not start a turn on his page: his own turn number and his hand are as they were', wrote.status === 200 && (await rest('GET', bobPath('turn'), cleanup.alice.token)).json === bobTurnBefore && (await handCount(cleanup.bob.uid)) === bobHandBeforeNaming, `${bobTurnBefore} -> ${(await rest('GET', bobPath('turn'), cleanup.alice.token)).json}, hand ${bobHandBeforeNaming} -> ${await handCount(cleanup.bob.uid)}`);
  await rest('PUT', pathOf('public/pass'), cleanup.alice.token, skippedConceded); // put Alice's record back as her page has it

  await click(alice, 'end-match');
  record("the host ends the match: Alice's page goes back to the lobby", Boolean(await pathIs(alice, `/lobby/${code}`)));
  record("...and so does Bob's, without pressing anything", Boolean(await pathIs(bob, `/lobby/${code}`)));
  const lobbyAgain = await waitFor(async () => { const m = (await rest('GET', `tables/${code}/meta`, cleanup.alice.token)).json; return m?.status === 'lobby' && m.match === 2 ? m : null; }, 15000, 250);
  record('the database says lobby, match 2', Boolean(lobbyAgain), JSON.stringify(lobbyAgain));
  const lobbyRows = await waitFor(async () => { const r = await players(alice); return r.length === 2 && r.every((t) => !t.includes('Ready')) ? r : null; }, 20000, 250);
  record('back in the lobby both players are still seated and nobody is ready (the marks were for match 1)', Boolean(lobbyRows), JSON.stringify(await players(alice)));

  await click(alice, 'ready');
  await rowHas(alice, 'Alice', 'Ready');
  await click(bob, 'ready');
  await rowHas(bob, 'Bob', 'Ready');
  const canStartAgain = await waitFor(async () => (await startState(alice)).disabled === false ? true : null, 20000, 250);
  record('both ready again with the decks they brought (remembered, no popup) and the host can start', Boolean(canStartAgain) && !(await dialogOpen(alice)) && !(await dialogOpen(bob)), JSON.stringify({ alice: await startState(alice), aliceDialog: await dialogOpen(alice).catch(() => 'n/a'), bobDialog: await dialogOpen(bob).catch(() => 'n/a') }));
  await click(alice, 'start');
  await pathIs(alice, `/table/${code}`);
  await pathIs(bob, `/table/${code}`);
  const freshDeal = await waitFor(async () => (await count(alice, '#hand .card')) === 7 && (await text(alice, 'life')) === '40' ? true : null, 40000, 250);
  record('the second match deals Alice a NEW game: 7 cards and life 40 again (not the life 35 she left), and says the hand is dealt', Boolean(freshDeal) && /dealt/i.test(await text(alice, 'deck-line')) && !/back/i.test(await text(alice, 'deck-line')), `${await text(alice, 'life')} / ${await text(alice, 'deck-line')}`);
  const secondMatch = await waitFor(async () => (await rest('GET', `${pathOf('public')}/match`, cleanup.bob.token)).json === 2 ? true : null, 20000, 250);
  record("...and her saved game is marked as match 2 in the database", Boolean(secondMatch));
  record("...and Bob's page does not show Alice's match-1 board as hers (her old battlefield card is gone)", Boolean(await waitFor(async () => { const p = await panelOf(bob, 'Alice'); return p && p.life === '40' && p.onBattlefield === 0 ? p : null; }, 20000, 250)));

  await click(bob, 'leave');
  record('Bob leaves: his browser goes to the start page', Boolean(await pathIs(bob, '/')));
  const bobGone = await waitFor(async () => (await rest('GET', `tables/${code}/members/${cleanup.bob.uid}`, cleanup.alice.token)).json === null ? true : null, 15000, 250);
  record("his entry is gone from the table but his seat is kept for him while the match is on", Boolean(bobGone) && (await rest('GET', `tables/${code}/seats/2`, cleanup.alice.token)).json === cleanup.bob.uid);
  record("Alice's page lists only Alice now", Boolean(await waitFor(async () => { const r = await players(alice); return r.length === 1 && r[0].includes('Alice') ? true : null; }, 15000, 250)));
  await click(alice, 'leave');
  record('Alice, the last one, leaves: her browser goes to the start page and the table is gone', Boolean(await pathIs(alice, '/')) && Boolean(await waitFor(async () => { const r = await rest('GET', `tables/${code}/meta`, cleanup.alice.token); return r.json === null || r.status === 401 ? true : null; }, 15000, 250)));

  record('no page errors on either page', !alice.logs.some((l) => /^exception:/.test(l)) && !bob.logs.some((l) => /^exception:/.test(l)), [...alice.logs, ...bob.logs].filter((l) => /^exception:/.test(l)).join(' | '));
} catch (error) {
  record('the check script itself ran without an error', false, error.message); exitCode = 1;
} finally {
  try {
    if (cleanup.alice?.token && cleanup.code) {
      await rest('DELETE', `tables/${cleanup.code}`, cleanup.alice.token);
      await rest('DELETE', `hosts/${cleanup.alice.uid}`, cleanup.alice.token);
      const check = await rest('GET', `tables/${cleanup.code}/meta`, cleanup.alice.token);
      console.log(`cleanup: throwaway table removed: ${check.status === 401 || check.json === null}`);
    }
  } catch {}
  for (const account of [cleanup.bob, cleanup.alice]) if (account?.token) await deleteAccount(account.token);
  await closeAllBrowsers();
  if (server) await server.close();
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
if (failed.length) { console.log('FAILED:', failed.map((r) => r.name).join('; ')); exitCode = 1; }
process.exit(exitCode);
