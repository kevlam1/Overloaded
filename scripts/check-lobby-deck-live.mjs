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
const rest = async (method, path, token) => {
  const response = await fetch(`${DB}/${path}.json?auth=${encodeURIComponent(token)}`, { method });
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
