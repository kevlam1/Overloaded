// Presence against the REAL project, with two real browsers (about 2.5 minutes).
// Alice makes a table and Bob joins it. Then Bob's browser is closed. Alice's page must show Bob as "Reconnecting...",
// and about two minutes later as "Disconnected, last seen 2 min ago"; the database must have removed Bob's note and
// recorded the time by itself (nothing on Bob's side was left running to do it).
// Run: node --env-file=.env scripts/check-presence-live.mjs
// Needs the presence rules to be published (paste backend/database.rules.json into the console). Exit 0 all passed,
// 1 a check failed. Makes one throwaway table, deletes it and its accounts, and the browser profile folders.
// Screenshots of Alice's page are saved in the temp folder (the paths are printed); delete them when you are done.
import { createServer } from 'vite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openBrowser, closeAllBrowsers, waitFor, authOf, sleep, text, tableShown, setValue, click, players } from './lib/browser.mjs';

const DB = (process.env.FIREBASE_DATABASE_URL ?? '').replace(/\/$/, '');
const API_KEY = process.env.FIREBASE_API_KEY ?? '';
if (!DB || !API_KEY) { console.log('The Firebase settings are not in the environment. Run: node --env-file=.env scripts/check-presence-live.mjs'); process.exit(1); }
const PORT = 5197;
const PAGE = `http://127.0.0.1:${PORT}/pages/lobby/index.html`;
const rest = async (method, path, token) => {
  const response = await fetch(`${DB}/${path}.json?auth=${encodeURIComponent(token)}`, { method });
  let json = null; try { json = await response.json(); } catch {}
  return { status: response.status, json };
};
const deleteAccount = (token) => fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${API_KEY}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: token }) }).catch(() => {});

const results = [];
const record = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };
const bobRow = (alice) => alice.eval(`(() => { const li = Array.from(document.querySelectorAll('#players li')).find((x) => x.textContent.includes('Bob')); return li ? { text: li.textContent, note: li.querySelector('.presence')?.textContent ?? '', state: li.querySelector('.presence')?.dataset.state ?? '' } : null; })()`);

let server = null; let exitCode = 0;
const cleanup = { alice: null, bob: null, code: null };
try {
  server = await createServer({ configFile: 'vite.config.js', logLevel: 'error', server: { port: PORT, strictPort: true, host: '127.0.0.1' } });
  await server.listen();
  const alice = await openBrowser('presence-alice');
  const bob = await openBrowser('presence-bob');

  await alice.goto(PAGE);
  await setValue(alice, 'name', 'Alice');
  await click(alice, 'create');
  await waitFor(async () => (await tableShown(alice)) || null, 20000);
  cleanup.alice = await authOf(alice);
  const code = (await text(alice, 'code')).trim();
  cleanup.code = code;
  record('Alice makes a table', /^[A-HJ-NP-Z2-9]{6}$/.test(code));

  await bob.goto(PAGE);
  await setValue(bob, 'name', 'Bob');
  await setValue(bob, 'join-code', code);
  await click(bob, 'join');
  await waitFor(async () => (await tableShown(bob)) || null, 20000);
  cleanup.bob = await authOf(bob);
  record('Bob joins', await tableShown(bob));

  const bobSeen = await waitFor(async () => (await players(alice)).some((l) => l.includes('Bob')) || null, 20000);
  record("Alice's page lists Bob", Boolean(bobSeen));
  const noteAppeared = await waitFor(async () => { const r = await rest('GET', `tables/${code}/presence/${cleanup.bob.uid}/tabs`, cleanup.bob.token); return r.json && Object.keys(r.json).length === 1 ? r.json : null; }, 20000, 250);
  record("Bob's open tab wrote one presence note", Boolean(noteAppeared), noteAppeared ? 'tab name hidden' : 'no note: are the presence rules published?');
  await sleep(1500);
  const before = await bobRow(alice);
  record('while Bob has the table open, Alice sees no status next to his name', before !== null && before.note === '', JSON.stringify(before));
  record("Bob's own page shows no offline message", (await bob.eval(`document.getElementById('connection').hidden`)) === true);

  // Bob closes his browser. Nothing of his page is left to clean up: the database must do it.
  const closedAt = Date.now();
  bob.close();
  const reconnecting = await waitFor(async () => { const row = await bobRow(alice); return row && row.state === 'reconnecting' ? row : null; }, 40000, 250);
  record('Alice sees "Reconnecting..." next to Bob after he closes his browser', Boolean(reconnecting), `${Date.now() - closedAt} ms`);
  const shot1 = join(tmpdir(), 'presence-alice-reconnecting.png');
  await alice.eval(`document.getElementById('players').scrollIntoView({ block: 'center' })`); // the list is below the fold otherwise
  await sleep(300);
  await alice.screenshot(shot1);
  console.log(`   screenshot: ${shot1}`);
  const gone = await rest('GET', `tables/${code}/presence/${cleanup.bob.uid}`, cleanup.alice.token);
  const noTabs = !gone.json?.tabs || Object.keys(gone.json.tabs).length === 0;
  record("the database removed Bob's note by itself", noTabs, JSON.stringify(gone.json ? { tabs: gone.json.tabs ? Object.keys(gone.json.tabs).length : 0, hasLastSeen: typeof gone.json.lastSeen === 'number' } : null));
  record("the database recorded Bob's last-seen time from its own clock", typeof gone.json?.lastSeen === 'number' && Math.abs(gone.json.lastSeen - Date.now()) < 60000, gone.json ? `${Math.round((Date.now() - gone.json.lastSeen) / 1000)} s ago` : '');

  // Two minutes after the drop the words change. Alice's page redraws every 10 seconds.
  const disconnected = await waitFor(async () => { const row = await bobRow(alice); return row && row.state === 'disconnected' ? row : null; }, 170000, 1000);
  record('about two minutes later Alice sees "Disconnected, last seen N min ago"', Boolean(disconnected) && /^Disconnected, last seen [2-4] min ago$/.test(disconnected.note), disconnected ? disconnected.note : 'never changed');
  const shot2 = join(tmpdir(), 'presence-alice-disconnected.png');
  await alice.eval(`document.getElementById('players').scrollIntoView({ block: 'center' })`);
  await sleep(300);
  await alice.screenshot(shot2);
  console.log(`   screenshot: ${shot2}`);
  record('and no page errors on Alice\'s side', !alice.logs.some((l) => /^exception:/.test(l)), alice.logs.filter((l) => /^exception:/.test(l)).join(' | '));
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
