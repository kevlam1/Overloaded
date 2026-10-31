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
const savedDeck = (name, commanders) => ({
  version: 1, name, savedAt: new Date().toISOString(), skipped: 0, text: '',
  commander: commanders.map((_, n) => uuid(100 + n)),
  cards: [...commanders.map((c, n) => ({ i: uuid(100 + n), n: c, qty: 1, section: 'commander' })), { i: uuid(1), n: 'Island', qty: 30, section: 'main' }],
});
let idNumber = 0;
const newId = () => `d${String(++idNumber).padStart(10, '0')}`;
const libraryWith = (...decks) => decks.reduce((library, [deck, format, bracket]) => addDeck(library, deck, { format, bracket: bracket ?? null, newId }).library, emptyLibrary());
const aliceLibrary = libraryWith([savedDeck('Goblins', ['Krenko, Mob Boss']), 'commander', 3], [savedDeck('Partners', ['Tymna the Weaver', 'Thrasios, Triton Hero']), 'commander'], [savedDeck('Burn', []), 'standard']);
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
  const alice = await openBrowser('lobbydeck-alice');
  const bob = await openBrowser('lobbydeck-bob');
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
  await bob.goto(PAGE);
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
  await alice.goto(PAGE);
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
  const startState = (browser) => browser.eval(`({ boxHidden: document.getElementById('start-box').hidden, disabled: document.getElementById('start').disabled, note: document.getElementById('start-note').textContent })`);
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

  await click(alice, 'draw');
  const drew = await waitFor(async () => { const r = await rest('GET', pathOf('private/hand'), cleanup.alice.token); return r.json && Object.keys(r.json).length === 8 ? true : null; }, 15000, 250);
  record('Draw shows 8 cards and saves them (the hand 8, the library 22, both counts)', Boolean(drew) && (await count(alice, '#hand .card')) === 8 && (await rest('GET', pathOf('public/counts'), cleanup.bob.token)).json?.hand === 8 && Object.keys((await rest('GET', pathOf('private/library'), cleanup.alice.token)).json).length === 22);

  await alice.eval(`document.querySelector('#hand .card').click()`);
  await alice.eval(`Array.from(document.querySelectorAll('#selected-actions button')).find((b) => b.textContent === 'To battlefield').click()`);
  const played = await waitFor(async () => { const r = await rest('GET', pathOf('public/battlefield'), cleanup.bob.token); return r.json && Object.keys(r.json).length === 1 ? r.json : null; }, 15000, 250);
  record('playing a card puts it on her battlefield on the page and in the public branch that Bob can read', Boolean(played) && (await count(alice, '#row-lands .card, #row-other .card')) === 1 && (await count(alice, '#hand .card')) === 7, JSON.stringify(played));
  record('the played card is no longer in her private hand', Object.keys((await rest('GET', pathOf('private/hand'), cleanup.alice.token)).json).length === 7);
  await click(alice, 'life-minus5');
  const lifeSaved = await waitFor(async () => (await rest('GET', pathOf('public/life'), cleanup.bob.token)).json === 35 ? true : null, 15000, 250);
  record('losing 5 life saves 35, and only the life changed', Boolean(lifeSaved) && (await text(alice, 'life')) === '35');
  record('the page says the moves are saved', Boolean(await waitFor(async () => (await text(alice, 'save-state')) === 'Saved.' ? true : null, 10000, 200)), await text(alice, 'save-state'));

  // Other players' boards: each page shows the other player's PUBLIC cards, live and read-only (their hand and library only as counts).
  const panelOf = (browser, name) => browser.eval(`(() => {
    const panel = Array.from(document.querySelectorAll('#opponent-list .opponent')).find((p) => p.querySelector('h3').textContent.includes(${JSON.stringify(name)}));
    if (!panel) return null;
    const rows = panel.querySelectorAll('.row');
    const cards = Array.from(panel.querySelectorAll('.card'));
    return { life: panel.dataset.life, stats: panel.querySelector('p.hint').textContent, onBattlefield: rows[0].querySelectorAll('.card').length + rows[1].querySelectorAll('.card').length, inCommandZone: rows[2].querySelectorAll('.card').length, allCards: cards.length, allReadOnly: cards.every((c) => c.disabled), heading: panel.querySelector('h3').textContent };
  })()`);
  const bobSeesAliceBoard = await waitFor(async () => { const p = await panelOf(bob, 'Alice'); return p && p.life === '35' && p.onBattlefield === 1 ? p : null; }, 30000, 250);
  record("Bob's page shows Alice's board live: life 35, one card on her battlefield, two in her command zone", Boolean(bobSeesAliceBoard) && bobSeesAliceBoard.inCommandZone === 2, JSON.stringify(bobSeesAliceBoard ?? await panelOf(bob, 'Alice')));
  record("...and how many cards she holds, but not which: hand 7 and library 22", /Hand: 7 cards. Library: 22 cards./.test(bobSeesAliceBoard?.stats ?? ''), bobSeesAliceBoard?.stats);
  record("...and only her public cards are on his page (the battlefield and the command zone: 3 cards), all of them read-only", bobSeesAliceBoard?.allCards === 3 && bobSeesAliceBoard.allReadOnly === true, JSON.stringify(bobSeesAliceBoard));
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
  await rest('PUT', `${bobPublic}/match`, cleanup.bob.token, 99);
  const staleHidden = await waitFor(async () => {
    const state = await alice.eval(`(() => { const p = Array.from(document.querySelectorAll('#opponent-list .opponent')).find((x) => x.querySelector('h3').textContent.includes('Bob')); if (!p) return null; const waiting = Array.from(p.querySelectorAll('p.hint')).find((x) => x.textContent.startsWith('Has not been dealt')); return { bodyHidden: p.querySelector('div').hidden, waitingShown: !waiting.hidden }; })()`);
    return state && state.bodyHidden && state.waitingShown ? state : null;
  }, 15000, 250);
  record("a branch marked with another match's number is not shown as this match's board ('Has not been dealt a game yet')", Boolean(staleHidden));
  await rest('PUT', `${bobPublic}/match`, cleanup.bob.token, 1);
  await rest('PUT', `${bobPublic}/battlefield`, cleanup.bob.token, [{ u: 'c900', i: uuid(1), n: '<img src=x onerror=alert(1)>' }, { u: 'c901', i: '"><img src=x onerror=alert(2)>', n: 'Bad id' }, 'junk', { u: 'c902', i: uuid(1), n: 'x'.repeat(5000) }]);
  const hostileShown = await waitFor(async () => { const p = await panelOf(alice, 'Bob'); return p && p.onBattlefield === 1 ? p : null; }, 15000, 250);
  record('a hostile public branch: only the one well-shaped card is shown; the bad id, the junk and the 5,000-character name are dropped', Boolean(hostileShown), JSON.stringify(await panelOf(alice, 'Bob')));
  record("...and no markup from a name or an id became part of Alice's page, no script ran and no dialog opened", (await alice.eval(`document.querySelectorAll('#opponent-list img[src="x"], #opponent-list script').length`)) === 0 && alice.dialogs.length === 0 && !alice.logs.some((l) => /^exception:/.test(l)));
  record("the hostile name is on the page as plain text only (in the card's label)", (await alice.eval(`Array.from(document.querySelectorAll('#opponent-list .card')).some((c) => c.getAttribute('aria-label') === '<img src=x onerror=alert(1)>')`)) === true);
  await rest('DELETE', `${bobPublic}/battlefield`, cleanup.bob.token);

  const handBeforeRefresh = Object.values((await rest('GET', pathOf('private/hand'), cleanup.alice.token)).json).map((card) => card.u).sort().join();
  await alice.goto(`http://127.0.0.1:${PORT}/table/${code}`);
  const restored = await waitFor(async () => (await count(alice, '#hand .card')) === 7 && (await count(alice, '#row-lands .card, #row-other .card')) === 1 ? true : null, 30000, 200);
  record('after a refresh Alice has the same game: 7 in hand, 1 on the battlefield, life 35', Boolean(restored) && (await text(alice, 'life')) === '35' && /back/i.test(await text(alice, 'deck-line')), `${await text(alice, 'life')} ${await text(alice, 'deck-line')}`);
  const handAfter = Object.values((await rest('GET', pathOf('private/hand'), cleanup.alice.token)).json).map((card) => card.u).sort().join();
  record('...and it was put back, not dealt again: the hand in the database is exactly the one she left', handAfter === handBeforeRefresh && handAfter.split(',').length === 7, handAfter);
  record('...and 6 of those 7 cards were in her first hand (one was played, one was drawn)', handAfter.split(',').filter((u) => handBefore.includes(u)).length === 6);
  if (process.argv.includes('--screenshot')) { await sleep(300); await bob.screenshot('scratch-table-page.png'); }
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
  record('both ready again with the decks they brought (remembered, no popup) and the host can start', Boolean(canStartAgain) && !(await dialogOpen(alice)) && !(await dialogOpen(bob)));
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
