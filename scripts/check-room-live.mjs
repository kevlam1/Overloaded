// A table's own screen (/lobby/CODE), with real browsers against the REAL project (about 1 minute).
// Alice makes a table. Bob (no saved name) opens its link and sees a one-button join with no code box; Carol (a saved name) opens
// the link and is joined with no click at all; a link to a table that does not exist says so; the start page of someone at a table
// offers a link back to it; the deck page's "Back to the lobby" returns to the table, not the start page; Leave frees the seat.
// Run: node --env-file=.env scripts/check-room-live.mjs
// Exit 0 all passed, 1 a check failed. Makes one throwaway table, deletes it, its accounts and the browser profile folders.
import { createServer } from 'vite';
import { openBrowser, closeAllBrowsers, waitFor, authOf, sleep, text, tableShown, setValue, click, players } from './lib/browser.mjs';

const DB = (process.env.FIREBASE_DATABASE_URL ?? '').replace(/\/$/, '');
const API_KEY = process.env.FIREBASE_API_KEY ?? '';
if (!DB || !API_KEY) { console.log('The Firebase settings are not in the environment. Run: node --env-file=.env scripts/check-room-live.mjs'); process.exit(1); }
const PORT = 5200;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const START = `${ORIGIN}/pages/lobby/index.html`;
const rest = async (method, path, token) => {
  const response = await fetch(`${DB}/${path}.json?auth=${encodeURIComponent(token)}`, { method });
  let json = null; try { json = await response.json(); } catch {}
  return { status: response.status, json };
};
const deleteAccount = (token) => fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${API_KEY}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: token }) }).catch(() => {});

const results = [];
const record = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };
const shown = (browser, id) => browser.eval(`(() => { const e = document.getElementById(${JSON.stringify(id)}); return Boolean(e) && !e.hidden && !e.closest('[hidden]'); })()`);
const pathOf = (browser) => browser.eval('location.pathname');
const members = async (code, token) => (await rest('GET', `tables/${code}/members`, token)).json ?? {};

let server = null; let exitCode = 0;
const cleanup = { alice: null, bob: null, carol: null, dave: null, code: null };
try {
  server = await createServer({ configFile: 'vite.config.js', logLevel: 'error', server: { port: PORT, strictPort: true, host: '127.0.0.1' } });
  await server.listen();
  const alice = await openBrowser('room-alice');
  const bob = await openBrowser('room-bob');
  const carol = await openBrowser('room-carol');
  const dave = await openBrowser('room-dave');

  await alice.goto(START);
  await setValue(alice, 'name', 'Alice');
  await click(alice, 'create');
  await waitFor(async () => (await tableShown(alice)) || null, 20000);
  cleanup.alice = await authOf(alice);
  const code = (await text(alice, 'code')).trim();
  cleanup.code = code;
  record('Alice makes a table and is on its own screen, /lobby/CODE', /^[A-HJ-NP-Z2-9]{6}$/.test(code) && (await pathOf(alice)) === `/lobby/${code}`, `${code} ${await pathOf(alice)}`);
  record("...which shows only the table: no 'make a table', no code box, no name box", (await shown(alice, 'table')) && !(await shown(alice, 'make-section')) && !(await shown(alice, 'join-section')) && !(await shown(alice, 'who')));

  // Bob follows the link with no name saved: a join screen with one button, and nothing joined yet.
  await bob.goto(`${ORIGIN}/lobby/${code}`);
  const joinScreen = await waitFor(async () => (await shown(bob, 'room-join')) && /Type your name/.test(await text(bob, 'status')) ? true : null, 20000, 200);
  record("Bob opens the link with no saved name: he sees 'Join table CODE', his name box and one button", Boolean(joinScreen) && (await text(bob, 'room-join-code')) === code && (await shown(bob, 'who')) && (await text(bob, 'room-join-button')) === 'Join this table');
  record("...and no code to type: there is no 'Join a table' box, no 'make a table', and the table itself is not shown yet", !(await shown(bob, 'join-section')) && !(await shown(bob, 'make-section')) && !(await shown(bob, 'table')));
  await sleep(1500);
  record('...and he is not at the table until he presses the button (a link alone, with no name, joins nobody)', Object.keys(await members(code, cleanup.alice.token)).length === 1);
  await setValue(bob, 'name', 'Bob');
  await click(bob, 'room-join-button');
  await waitFor(async () => (await tableShown(bob)) || null, 20000);
  cleanup.bob = await authOf(bob);
  record("one press of the button and Bob is at the table, in seat 2, on the same address (no extra step, no reload)", (await text(bob, 'seat')) === '2' && (await pathOf(bob)) === `/lobby/${code}`);
  record("Alice's page lists Bob", Boolean(await waitFor(async () => (await players(alice)).some((t) => t.includes('Bob')) || null, 20000, 200)));

  // Bob has no deck. He imports one inside the lobby, without going to /deck, and brings it to the table.
  const askedForList = () => bob.events.some((e) => e.method === 'Network.requestWillBeSent' && /cards.json/.test(e.params.request.url));
  record('the card list (1.3 MB) has not been fetched yet: the importer is only loaded when it is opened', !askedForList());
  await waitFor(async () => ((await shown(bob, 'deck-import')) ? true : null), 15000, 200);
  record('Bob has no deck for this format, so the lobby offers "Import a deck here" (a button in the lobby, not a link to another page)', (await shown(bob, 'deck-import')) &&(await bob.eval(`document.querySelectorAll('#deck-import a').length`)) === 0 && (await shown(bob, 'deck-import-open')));
  await click(bob, 'open-importer');
  const importerReady = await waitFor(async () => (await shown(bob, 'deck-importer')) && !(await bob.eval(`document.getElementById('check').disabled`)) ? true : null, 30000, 250);
  record('Import or change a deck opens the importer inside the lobby and loads the card list then', Boolean(importerReady) && askedForList() && (await pathOf(bob)) === `/lobby/${code}`);
  await setValue(bob, 'deck-text', 'Commander\n1 Krenko, Mob Boss\n\n1 Sol Ring\n1 Mountain');
  await click(bob, 'check');
  const checked = await waitFor(async () => (await shown(bob, 'preview')) ? true : null, 20000, 250);
  record('pasting a list and pressing Check shows the checked deck in the lobby, with Commander picked as the format', Boolean(checked) && (await bob.eval(`document.getElementById('deck-format').value`)) === 'commander' && /Krenko/.test(await bob.eval(`document.getElementById('commander-1').selectedOptions[0].textContent`)));
  if (process.argv.includes('--screenshot')) { await bob.eval(`document.getElementById('deck-importer').scrollIntoView()`); await sleep(500); await bob.screenshot('scratch-room-importer.png'); }
  await setValue(bob, 'deck-name', 'Bob goblins');
  await click(bob, 'save');
  const savedMessage = await waitFor(async () => (/Saved "Bob goblins"/.test(await text(bob, 'importer-status')) ? true : null), 15000, 250);
  record('Save puts the deck in this browser and says so in the importer message line, leaving the lobby status line alone', Boolean(savedMessage) && !/Bob goblins/.test(await text(bob, 'status')));
  const listed = await waitFor(async () => { const o = await bob.eval(`Array.from(document.getElementById('deck-pick').options).map((x) => x.textContent)`); return o.some((t) => /^Bob goblins \(Krenko, Mob Boss/.test(t)) ? o : null; }, 15000, 250);
  record("the lobby's deck picker lists the new deck straight away, with its commander (no reload, no going back)", Boolean(listed), JSON.stringify(listed));
  record('and the "no deck" offer is gone', !(await shown(bob, 'deck-import')));
  const pickedId = await bob.eval(`Array.from(document.getElementById('deck-pick').options).find((o) => /^Bob goblins/.test(o.textContent)).value`);
  await bob.eval(`(() => { const s = document.getElementById('deck-pick'); s.value = ${JSON.stringify(pickedId)}; s.dispatchEvent(new Event('change')); })()`);
  record("choosing it shows Bob's commander on Alice's page", Boolean(await waitFor(async () => (await players(alice)).some((t) => t.includes('Bob') && t.includes('Krenko')) || null, 20000, 250)));
  await click(bob, 'open-importer');
  record('pressing the button again closes the importer panel', !(await shown(bob, 'deck-importer')));

  // Carol has a saved name: opening the link is enough.
  await carol.goto(START);
  await carol.eval(`localStorage.setItem('overloaded.name', 'Carol')`);
  await carol.goto(`${ORIGIN}/lobby/${code}`);
  const carolIn = await waitFor(async () => (await tableShown(carol)) || null, 25000, 200);
  cleanup.carol = await authOf(carol);
  record('Carol opens the link with a name saved in her browser: she is joined with no click at all, in seat 3', Boolean(carolIn) && (await text(carol, 'seat')) === '3', await text(carol, 'seat'));
  record("...and Alice's page lists Carol", Boolean(await waitFor(async () => (await players(alice)).some((t) => t.includes('Carol')) || null, 20000, 200)));

  // A link to a table that does not exist.
  await dave.goto(START);
  await dave.eval(`localStorage.setItem('overloaded.name', 'Dave')`);
  await dave.goto(`${ORIGIN}/lobby/ZZZZZZ`);
  const bad = await waitFor(async () => { const s = await dave.eval(`({ words: document.getElementById('status').textContent, error: document.getElementById('status').classList.contains('error') })`); return s.error && s.words ? s : null; }, 25000, 200);
  cleanup.dave = await authOf(dave).catch(() => null);
  record('a link to a table that does not exist says so in plain words, in the error style, and shows no table', Boolean(bad) && !/Firebase|auth\//.test(bad.words) && !(await shown(dave, 'table')) && (await shown(dave, 'room-join')), JSON.stringify(bad));

  // The start page of someone who is at a table offers the way back; the deck page's back link goes to the table too.
  await bob.goto(START);
  const resume = await waitFor(async () => (await shown(bob, 'resume')) ? true : null, 20000, 200);
  record("Bob's start page says he is at a table and links to it (it does not push him into it: he may want to make another)", Boolean(resume) && (await text(bob, 'resume-code')) === code && (await bob.eval(`document.getElementById('resume-link').getAttribute('href')`)) === `/lobby/${code}` && (await shown(bob, 'make-section')));
  await bob.goto(`${ORIGIN}/pages/deck/index.html`);
  record("the deck page's 'Back to the lobby' goes to /lobby/CODE (it went to the start page before, while he was still at the table)", (await bob.eval(`document.getElementById('back').getAttribute('href')`)) === `/lobby/${code}`);
  await bob.goto(`${ORIGIN}/lobby/${code}`);
  record('...and following it puts him back in the table, still in seat 2', Boolean(await waitFor(async () => (await tableShown(bob)) || null, 20000, 200)) && (await text(bob, 'seat')) === '2');

  // Leaving.
  await click(bob, 'leave-table'); // the page asks first; the test browser says yes
  await waitFor(async () => (await pathOf(bob)) === '/' ? true : null, 20000, 200);
  const seatFree = await waitFor(async () => { const m = await members(code, cleanup.alice.token); return !(cleanup.bob.uid in m) ? true : null; }, 20000, 250);
  record('Bob leaves: his browser goes to the start page and his entry is gone from the table', Boolean(seatFree) && (await pathOf(bob)) === '/');
  record('...and in the lobby his seat is freed for someone else (seat 2 is empty)', (await rest('GET', `tables/${code}/seats/2`, cleanup.alice.token)).json === null);
  record("...and his start page no longer says he is at a table", !(await shown(bob, 'resume')) || Boolean(await waitFor(async () => !(await shown(bob, 'resume')) ? true : null, 8000, 200)));
  record('no page errors on any page', ![alice, bob, carol, dave].some((b) => b.logs.some((l) => /^exception:/.test(l))), [alice, bob, carol, dave].flatMap((b) => b.logs).filter((l) => /^exception:/.test(l)).join(' | '));
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
  for (const account of [cleanup.dave, cleanup.carol, cleanup.bob, cleanup.alice]) if (account?.token) await deleteAccount(account.token);
  await closeAllBrowsers();
  if (server) await server.close();
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
if (failed.length) { console.log('FAILED:', failed.map((r) => r.name).join('; ')); exitCode = 1; }
process.exit(exitCode);
