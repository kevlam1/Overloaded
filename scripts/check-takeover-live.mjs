// Host takeover against the REAL project, with two real browsers (about 6.5 minutes, so it is not part of test:live).
// Alice makes a table and Bob joins. Alice's browser is closed. Bob's page must NOT offer the takeover while Alice has been
// gone a short time, must offer it once she has been gone 5 minutes on the database's clock, and clicking it must make Bob
// the host in the database (meta host and his host slot), with "(host)" next to his name.
// Run: node --env-file=.env scripts/check-takeover-live.mjs
// Needs the takeover rule to be published (paste backend/database.rules.json into the console). Exit 0 all passed, 1 a
// check failed. Makes one throwaway table, deletes it and its accounts and the browser profile folders. A screenshot of
// Bob's page is saved in the temp folder (the path is printed); delete it when you are done.
import { createServer } from 'vite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openBrowser, closeAllBrowsers, waitFor, authOf, sleep, text, tableShown, setValue, click, players } from './lib/browser.mjs';

const DB = (process.env.FIREBASE_DATABASE_URL ?? '').replace(/\/$/, '');
const API_KEY = process.env.FIREBASE_API_KEY ?? '';
if (!DB || !API_KEY) { console.log('The Firebase settings are not in the environment. Run: node --env-file=.env scripts/check-takeover-live.mjs'); process.exit(1); }
const PORT = 5196;
const PAGE = `http://127.0.0.1:${PORT}/pages/lobby/index.html`;
const rest = async (method, path, token) => {
  const response = await fetch(`${DB}/${path}.json?auth=${encodeURIComponent(token)}`, { method });
  let json = null; try { json = await response.json(); } catch {}
  return { status: response.status, json };
};
const deleteAccount = (token) => fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${API_KEY}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: token }) }).catch(() => {});
const results = [];
const record = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };
const buttonShown = (page) => page.eval(`!document.getElementById('take-over').hidden`);

let server = null; let exitCode = 0;
const cleanup = { alice: null, bob: null, code: null };
try {
  server = await createServer({ configFile: 'vite.config.js', logLevel: 'error', server: { port: PORT, strictPort: true, host: '127.0.0.1' } });
  await server.listen();
  const alice = await openBrowser('takeover-alice');
  const bob = await openBrowser('takeover-bob');

  await alice.goto(PAGE);
  await setValue(alice, 'name', 'Alice');
  await click(alice, 'create');
  await waitFor(async () => (await tableShown(alice)) || null, 20000);
  cleanup.alice = await authOf(alice);
  const code = (await text(alice, 'code')).trim();
  cleanup.code = code;
  await bob.goto(PAGE);
  await setValue(bob, 'name', 'Bob');
  await setValue(bob, 'join-code', code);
  await click(bob, 'join');
  await waitFor(async () => (await tableShown(bob)) || null, 20000);
  cleanup.bob = await authOf(bob);
  record('Alice makes a table and Bob joins it', /^[A-HJ-NP-Z2-9]{6}$/.test(code) && await tableShown(bob));
  const marked = await waitFor(async () => (await players(bob)).some((l) => l.includes('Alice') && l.includes('(host)')) || null, 20000);
  record('Bob\'s page marks Alice as the host', Boolean(marked), JSON.stringify(await players(bob)));
  await sleep(2000);
  record('while Alice has the table open, Bob is not offered the takeover', (await buttonShown(bob)) === false);

  alice.close(); // Alice's browser closes: the database removes her note and records the time
  const closedAt = Date.now();
  const reconnecting = await waitFor(async () => (await players(bob)).some((l) => l.includes('Alice') && l.includes('Reconnecting')) || null, 40000, 250);
  record('Bob sees Alice as "Reconnecting..."', Boolean(reconnecting));
  await sleep(60000);
  record('one minute after Alice left, still no takeover offered', (await buttonShown(bob)) === false);
  await sleep(120000);
  record('three minutes after, still no takeover offered', (await buttonShown(bob)) === false);

  const offered = await waitFor(async () => (await buttonShown(bob)) || null, 220000, 1000);
  const waited = (Date.now() - closedAt) / 1000;
  record('after about 5 minutes the takeover is offered', Boolean(offered) && waited >= 295 && waited < 340, `${Math.round(waited)} s after Alice left`);
  await bob.eval(`document.getElementById('take-over').scrollIntoView({ block: 'center' })`);
  await sleep(300);
  const shot = join(tmpdir(), 'takeover-bob-offered.png');
  await bob.screenshot(shot);
  console.log(`   screenshot: ${shot}`);

  await click(bob, 'take-over');
  const nowHost = await waitFor(async () => (await players(bob)).some((l) => l.includes('Bob') && l.includes('(host)')) || null, 20000);
  record('after the click Bob is marked as the host', Boolean(nowHost), JSON.stringify(await players(bob)));
  record('and the takeover button is gone', (await buttonShown(bob)) === false);
  const meta = await rest('GET', `tables/${code}/meta/host`, cleanup.bob.token);
  record('the database says Bob is the host', meta.json === cleanup.bob.uid);
  const slot = await rest('GET', `hosts/${cleanup.bob.uid}`, cleanup.bob.token);
  record('and Bob holds the host slot for this table', slot.json === code);
  record('no page errors on Bob\'s side', !bob.logs.some((l) => /^exception:/.test(l)), bob.logs.filter((l) => /^exception:/.test(l)).join(' | '));
} catch (error) {
  record('the check script itself ran without an error', false, error.message); exitCode = 1;
} finally {
  try {
    if (cleanup.bob?.token && cleanup.code) {
      await rest('DELETE', `tables/${cleanup.code}`, cleanup.bob.token); // Bob is the host now (or Alice's token below if not)
      await rest('DELETE', `hosts/${cleanup.bob.uid}`, cleanup.bob.token);
    }
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
