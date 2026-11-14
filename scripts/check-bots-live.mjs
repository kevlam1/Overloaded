// The host's test bots (Add bot in the lobby), with a real browser against the REAL project (about 1 minute).
// Alice makes a four-seat table and adds a bot to seats 2, 3 and 4 with the buttons on the empty seats: each bot is its own account, takes the seat it was added to, and is ready; the Start button says
// who is not ready; a bot is taken away again with Remove bot and its seat is empty; after a refresh the page knows its bots again. Makes one throwaway table, deletes it and every account it made.
// Run: node --env-file=.env scripts/check-bots-live.mjs     Exit 0 all passed, 1 a check failed.
import { createServer } from 'vite';
import { openBrowser, closeAllBrowsers, waitFor, sleep, text, tableShown, setValue, click } from './lib/browser.mjs';

const DB = (process.env.FIREBASE_DATABASE_URL ?? '').replace(/\/$/, '');
const API_KEY = process.env.FIREBASE_API_KEY ?? '';
if (!DB || !API_KEY) { console.log('The Firebase settings are not in the environment. Run: node --env-file=.env scripts/check-bots-live.mjs'); process.exit(1); }
const PORT = 5203;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const rest = async (method, path, token) => {
  const response = await fetch(`${DB}/${path}.json?auth=${encodeURIComponent(token)}`, { method });
  let json = null; try { json = await response.json(); } catch {}
  return { status: response.status, json };
};
const deleteAccount = (token) => fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${API_KEY}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: token }) }).catch(() => {});
const results = [];
const record = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };
// every signed-in account of the page: the player (the default app) and each bot (an app named for its seat)
const accountsOf = (browser) => browser.eval(`new Promise((resolve) => {
  const open = indexedDB.open('firebaseLocalStorageDb');
  open.onerror = () => resolve([]);
  open.onsuccess = () => {
    const db = open.result;
    if (!db.objectStoreNames.contains('firebaseLocalStorage')) return resolve([]);
    const req = db.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll();
    req.onsuccess = () => resolve(req.result.filter((row) => row.value && row.value.uid).map((row) => ({ app: String(row.fbase_key).split(':').pop(), uid: row.value.uid, token: row.value.stsTokenManager && row.value.stsTokenManager.accessToken })));
    req.onerror = () => resolve([]);
  };
})`);
const seatLines = (browser) => browser.eval(`Array.from(document.querySelectorAll('#players li')).map((li) => ({ seat: li.dataset.seat ?? null, text: li.firstChild ? li.textContent.replace(/\\s+/g, ' ').trim() : '', add: Boolean(li.querySelector('button[data-bot="add"]')), remove: Boolean(li.querySelector('button[data-bot="remove"]')), ready: Boolean(li.querySelector('.ready-mark')) }))`);
const press = (browser, action, seat) => browser.eval(`document.querySelector('#players button[data-bot="${action}"][data-seat="${seat}"]').click()`);
const line = async (browser, seat) => (await seatLines(browser)).find((l) => new RegExp(`^Seat ${seat}:`).test(l.text));

let server = null; let exitCode = 0;
let accounts = [];
let code = null; let alice = null;
try {
  server = await createServer({ configFile: 'vite.config.js', logLevel: 'error', server: { port: PORT, strictPort: true, host: '127.0.0.1' } });
  await server.listen();
  const browser = await openBrowser('bots-alice');
  await browser.goto(`${ORIGIN}/pages/lobby/index.html`);
  await setValue(browser, 'name', 'Alice');
  await click(browser, 'create');
  await waitFor(async () => (await tableShown(browser)) || null, 20000);
  code = (await text(browser, 'code')).trim();
  accounts = await accountsOf(browser);
  alice = accounts.find((a) => a.app === '[DEFAULT]');
  const members = async () => (await rest('GET', `tables/${code}/members`, alice.token)).json ?? {};

  const first = await waitFor(async () => { const lines = await seatLines(browser); return lines.length === 4 ? lines : null; }, 10000, 200);
  record('on a four-seat table the host sees four seats: hers, and three empty ones, each with an Add bot button', Boolean(first) && first.filter((l) => /: empty/.test(l.text) && l.add).length === 3, JSON.stringify(first));

  for (const seat of [2, 3, 4]) {
    await press(browser, 'add', seat);
    await waitFor(async () => { const l = await line(browser, seat); return l && /Bot/.test(l.text) && l.ready ? l : null; }, 25000, 250);
  }
  const lines = await seatLines(browser);
  const db = await members();
  const uids = Object.keys(db);
  record('three bots are added, one to each empty seat: named for their seat, ready, and each its own account in the database', lines.filter((l) => /Bot \d/.test(l.text) && l.ready).length === 3 && uids.length === 4 && Object.values(db).filter((m) => /^Bot \d$/.test(m.name)).length === 3 && Object.entries(db).every(([, m]) => ['1', '2', '3', '4'].includes(m.seat)), JSON.stringify({ lines, db }));
  record('each bot keeps the seat it was added to (Bot 2 in seat 2, Bot 3 in seat 3, Bot 4 in seat 4)', Object.values(db).filter((m) => /^Bot \d$/.test(m.name)).every((m) => m.name === `Bot ${m.seat}`), JSON.stringify(db));
  await sleep(1500);
  const startNote = await text(browser, 'start-note');
  const startDisabled = await browser.eval(`document.getElementById('start').disabled`);
  record('with the bots ready and the host not, Start waits and says that 3 of 4 are ready', startDisabled === true && /3 of 4 players are ready/.test(startNote), startNote);
  record('the bots show as there (not "Disconnected"): each has a presence', !(await seatLines(browser)).some((l) => /Disconnected/.test(l.text)));

  await press(browser, 'remove', 3);
  await waitFor(async () => { const l = await line(browser, 3); return l && /: empty/.test(l.text) && l.add ? l : null; }, 20000, 250);
  record('Remove bot takes a bot away: its seat is empty again with an Add bot button, and the table has three members', Object.keys(await members()).length === 3);

  await browser.goto(`${ORIGIN}/lobby/${code}`);
  await waitFor(async () => (await tableShown(browser)) || null, 20000);
  const after = await waitFor(async () => { const lines2 = await seatLines(browser); return lines2.filter((l) => l.remove).length === 2 ? lines2 : null; }, 25000, 300);
  record('after a refresh the page knows its bots again: Remove bot is back on seats 2 and 4 and seat 3 is still empty', Boolean(after) && Boolean((await line(browser, 3))?.add), JSON.stringify(after));

  accounts = await accountsOf(browser); // (the bots are signed in as their own accounts, kept by the browser)
  record('there are four accounts in the browser: the host and one for each seat that ever had a bot', accounts.length === 4 && new Set(accounts.map((a) => a.uid)).size === 4, JSON.stringify(accounts.map((a) => a.app)));

  for (const seat of [2, 4]) { await press(browser, 'remove', seat); await waitFor(async () => { const l = await line(browser, seat); return l && /: empty/.test(l.text) ? l : null; }, 20000, 250); }
  record('the other bots are taken away too, and only the host is left at the table', Object.keys(await members()).length === 1);
} finally {
  try {
    if (alice?.token && code) {
      await rest('DELETE', `tables/${code}`, alice.token);
      await rest('DELETE', `hosts/${alice.uid}`, alice.token);
      const check = await rest('GET', `tables/${code}/meta`, alice.token);
      console.log(`cleanup: throwaway table removed: ${check.status === 401 || check.json === null}`);
    }
  } catch {}
  for (const account of accounts) if (account?.token) await deleteAccount(account.token);
  await closeAllBrowsers();
  if (server) await server.close();
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
if (failed.length) { console.log('FAILED:', failed.map((r) => r.name).join('; ')); exitCode = 1; }
process.exit(exitCode);
