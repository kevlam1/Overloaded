// The live-play spike: real browsers, one real Firebase project.
// Run from the repo root:  node --env-file=.env scripts/spike-two-browsers.mjs
//
// It starts the page (Vite, in this process), opens headless Chrome windows with separate profile folders
// (Alice makes a table, Bob joins it, Carol is a fresh visitor), and checks what the database rules and the page
// promise. Everything it writes goes to a throwaway table that it deletes at the end, and the anonymous accounts it
// creates are deleted too. Tokens are used for requests but never printed.
//
// Exit codes: 0 all checks passed, 1 a check failed, 2 the rules are not published yet (nothing else could run).
import { createServer } from 'vite';
import { openBrowser, closeAllBrowsers, waitFor, authOf, sleep, median, text, tableShown, setValue, click, players } from './lib/browser.mjs';

const PORT = 5199;
const PAGE = `http://127.0.0.1:${PORT}/pages/lobby/index.html`;
const DB = (process.env.FIREBASE_DATABASE_URL ?? '').replace(/\/$/, '');
const API_KEY = process.env.FIREBASE_API_KEY ?? '';
if (!DB || !API_KEY) {
  console.log('The Firebase settings are not in the environment. Run: node --env-file=.env scripts/spike-two-browsers.mjs');
  process.exit(1);
}

const results = [];
const record = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };

// ---------- the database, over HTTPS with someone's token ----------
async function rest(method, path, token, body) {
  const start = performance.now();
  const response = await fetch(`${DB}/${path}.json?auth=${encodeURIComponent(token)}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null; try { json = await response.json(); } catch {}
  return { status: response.status, json, ms: performance.now() - start };
}
async function newStranger() {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) });
  const json = await response.json();
  return { uid: json.localId, token: json.idToken };
}
const deleteAccount = (token) => fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${API_KEY}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: token }) }).catch(() => {});

// When a step fails, show what the page said and what its console logged. Table codes and account ids are masked.
const mask = (s) => String(s).replace(/\b[A-HJ-NP-Z2-9]{6}\b/g, '******').replace(/\b[A-Za-z0-9]{28}\b/g, '<id>').slice(0, 260);
async function dump(browser) {
  let status = '(page not readable)';
  try { status = await browser.eval(`document.getElementById('status').textContent`); } catch {}
  console.log(`   [${browser.label}] page status: ${mask(status)}`);
  for (const line of browser.logs.slice(-8)) console.log(`   [${browser.label}] ${mask(line)}`);
}

let server = null;
let exitCode = 0;
const cleanup = { aliceToken: null, aliceUid: null, bobToken: null, carolToken: null, tables: [] };
const strangers = [];

try {
  server = await createServer({ configFile: 'vite.config.js', logLevel: 'error', server: { port: PORT, strictPort: true, host: '127.0.0.1' } });
  await server.listen();

  const alice = await openBrowser('spike-alice', { width: 1280, height: 800 });
  const bob = await openBrowser('spike-bob', { width: 1280, height: 800 });
  const carol = await openBrowser('spike-carol', { width: 1280, height: 800 });

  // 0. A fresh visitor asks "who am I?" three times at once. It must end up as ONE anonymous account.
  await carol.goto(PAGE);
  const race = await carol.eval(`(async () => {
    const db = await import('/src/db.js');
    const start = performance.now();
    const ids = await Promise.all([db.signIn(), db.signIn(), db.signIn()]);
    return { ids, ms: Math.round(performance.now() - start) };
  })()`);
  const carolAuth = await authOf(carol);
  if (carolAuth?.token) cleanup.carolToken = carolAuth.token;
  record('three simultaneous sign-ins on a fresh browser share one anonymous account', race.ids.every((id) => id === race.ids[0]) && carolAuth?.uid === race.ids[0], `${race.ms} ms`);
  const again = await carol.eval(`(async () => { const db = await import('/src/db.js'); return db.signIn(); })()`);
  record('asking again later returns the same account', again === race.ids[0]);

  // 1. Alice makes a table
  await alice.goto(PAGE);
  await setValue(alice, 'name', 'Alice');
  await click(alice, 'create');
  await waitFor(async () => (await tableShown(alice)) || ((await text(alice, 'status')).includes('Could not')) || ((await text(alice, 'status')).includes('denied')) || null, 20000);
  const aliceAuth = await authOf(alice);
  if (aliceAuth?.token) { cleanup.aliceToken = aliceAuth.token; cleanup.aliceUid = aliceAuth.uid; }
  record('anonymous sign-in works in a real browser (an id and token are stored)', Boolean(aliceAuth?.uid && aliceAuth?.token));
  if (!(await tableShown(alice))) {
    record('Alice makes a table', false, (await text(alice, 'status')) || 'no result');
    console.log('\nThe database refused the table. That is what the locked rules do, so the rules have probably not been published to the project yet.');
    exitCode = 2;
    throw new Error('stop');
  }
  const code1 = (await text(alice, 'code')).trim();
  cleanup.tables.push(code1);
  record('Alice makes a table and gets a valid 6-character code', /^[A-HJ-NP-Z2-9]{6}$/.test(code1), code1.replace(/./g, '*'));
  record('Alice sits in seat 1', (await text(alice, 'seat')).trim() === '1');
  record('Alice is not warned about an old table when she has none', alice.dialogs.length === 0);

  // 2. Bob joins by code; Alice's page should show him without a refresh
  await bob.goto(PAGE);
  await setValue(bob, 'name', 'Bob');
  await setValue(bob, 'join-code', code1.toLowerCase().slice(0, 3) + ' ' + code1.slice(3)); // typed lower case with a space: the page must cope
  const clickedAt = Date.now();
  await click(bob, 'join');
  const bobShown = await waitFor(async () => (await tableShown(bob)) || null, 20000);
  const bobConfirmedMs = Date.now() - clickedAt;
  const aliceSawBob = await waitFor(async () => (await players(alice)).some((line) => line.includes('Bob')) || null, 20000, 20);
  const aliceSawBobMs = Date.now() - clickedAt;
  record('Bob joins by code (typed lower case with a space)', Boolean(bobShown), `${bobConfirmedMs} ms to confirm`);
  if (!bobShown) await dump(bob);
  record('Bob gets seat 2', (await text(bob, 'seat')).trim() === '2');
  record("Alice's page shows Bob without a refresh (live sync)", Boolean(aliceSawBob), `${aliceSawBobMs} ms from Bob's click`);
  const bobListStart = Date.now();
  const bobSeesBoth = await waitFor(async () => (await players(bob)).length === 2 || null, 5000, 20);
  record("Bob's page shows both players (the list arrives after the page opens)", Boolean(bobSeesBoth), `${Date.now() - bobListStart} ms after his page appeared`);

  const bobAuth = await authOf(bob);
  if (bobAuth?.token) cleanup.bobToken = bobAuth.token;
  record('Alice and Bob are different anonymous accounts', Boolean(bobAuth?.uid) && bobAuth.uid !== aliceAuth.uid);

  // 3. Hidden cards: what the rules promise, checked with each person's real token
  const put = await rest('PUT', `tables/${code1}/private/${aliceAuth.uid}`, aliceAuth.token, { hand: ['Island'] });
  record('Alice can write her own private cards', put.status === 200);
  const aliceReadsOwn = await rest('GET', `tables/${code1}/private/${aliceAuth.uid}`, aliceAuth.token);
  record('Alice can read her own private cards', aliceReadsOwn.status === 200 && aliceReadsOwn.json?.hand?.[0] === 'Island');
  const bobReadsAlice = await rest('GET', `tables/${code1}/private/${aliceAuth.uid}`, bobAuth.token);
  record("Bob's read of Alice's private cards is refused", bobReadsAlice.status === 401, `HTTP ${bobReadsAlice.status}`);
  const bobWritesAlice = await rest('PUT', `tables/${code1}/private/${aliceAuth.uid}/hand`, bobAuth.token, ['Forest']);
  record("Bob's write into Alice's private cards is refused", bobWritesAlice.status === 401, `HTTP ${bobWritesAlice.status}`);
  const stillIsland = await rest('GET', `tables/${code1}/private/${aliceAuth.uid}`, aliceAuth.token);
  record("Alice's cards are unchanged after Bob's attempt", stillIsland.json?.hand?.[0] === 'Island');
  const bobReadsOwn = await rest('GET', `tables/${code1}/private/${bobAuth.uid}`, bobAuth.token);
  record('Bob can read his own private path', bobReadsOwn.status === 200);
  const bobReadsMembers = await rest('GET', `tables/${code1}/members`, bobAuth.token);
  record('Bob can read the member list', bobReadsMembers.status === 200 && Object.keys(bobReadsMembers.json ?? {}).length === 2);
  const bobReadsWhole = await rest('GET', `tables/${code1}`, bobAuth.token);
  record('Bob cannot read the whole table at once (that would include private cards)', bobReadsWhole.status === 401, `HTTP ${bobReadsWhole.status}`);
  const bobEndsMatch = await rest('PUT', `tables/${code1}/meta/status`, bobAuth.token, 'playing');
  record('Bob (not the host) cannot start the match', bobEndsMatch.status === 401, `HTTP ${bobEndsMatch.status}`);
  const bobDeletes = await rest('DELETE', `tables/${code1}`, bobAuth.token);
  record('Bob (not the host) cannot delete the live table', bobDeletes.status === 401, `HTTP ${bobDeletes.status}`);

  const stranger = await newStranger(); strangers.push(stranger);
  for (const [label, path] of [['the member list', 'members'], ['the settings', 'meta'], ['the seats', 'seats'], ["Alice's private cards", `private/${aliceAuth.uid}`], ['the whole table', '']]) {
    const read = await rest('GET', `tables/${code1}${path ? '/' + path : ''}`, stranger.token);
    record(`A stranger with the code cannot read ${label}`, read.status === 401, `HTTP ${read.status}`);
  }

  // 4. Refresh: same account, same seat
  await bob.reload();
  const bobBack = await waitFor(async () => (await tableShown(bob)) || null, 20000);
  const bobAuthAfter = await authOf(bob);
  record('After a refresh Bob is put back at the table', Boolean(bobBack));
  record('After a refresh Bob keeps the same anonymous account', bobAuthAfter?.uid === bobAuth.uid);
  record('After a refresh Bob keeps seat 2', (await text(bob, 'seat')).trim() === '2');
  record('After a refresh both players are listed', (await players(bob)).length === 2);

  // 5. Timings (HTTPS, not the live socket)
  const samples = [];
  for (let i = 0; i < 10; i++) samples.push((await rest('GET', `tables/${code1}/meta`, bobAuth.token)).ms);
  console.log(`\nREST read round trip: median ${Math.round(median(samples))} ms, fastest ${Math.round(Math.min(...samples))} ms, slowest ${Math.round(Math.max(...samples))} ms`);
  console.log(`Join: confirmed on Bob's page in ${bobConfirmedMs} ms; visible on Alice's page ${aliceSawBobMs} ms after Bob's click\n`);

  // 6. One table per host: she is warned, and a second table replaces the first
  await click(alice, 'create');
  const second = await waitFor(async () => { const code = (await text(alice, 'code')).trim(); return code && code !== code1 ? code : null; }, 20000);
  if (second) cleanup.tables.push(second);
  record('Alice makes a second table (the confirm was accepted)', Boolean(second));
  if (!second) await dump(alice);
  record('Alice was warned before her old table was closed (one confirm, naming the table)', alice.dialogs.length === 1 && /already have a table/i.test(alice.dialogs[0]), `dialogs: ${alice.dialogs.length}`);
  record('the warning says how many people are at the old table', /2 at it/.test(alice.dialogs[0] ?? ''), mask(alice.dialogs[0] ?? ''));
  const slot = await rest('GET', `hosts/${aliceAuth.uid}`, aliceAuth.token);
  record("Alice's host slot now names the new table", second && slot.json === second);
  const oldGone = await rest('GET', `tables/${code1}/meta`, aliceAuth.token);
  record('The first table is gone', oldGone.status === 401 || oldGone.json === null, `HTTP ${oldGone.status}`);
  const bobOld = await rest('GET', `tables/${code1}/members`, bobAuth.token);
  record('Bob can no longer read the deleted table', bobOld.status === 401 || bobOld.json === null, `HTTP ${bobOld.status}`);
} catch (error) {
  if (error.message !== 'stop') { record('the test script itself ran without an error', false, error.message); exitCode = 1; }
} finally {
  // Remove the throwaway data and accounts (the host may delete their own table and slot)
  try {
    if (cleanup.aliceToken) {
      for (const code of cleanup.tables) await rest('DELETE', `tables/${code}`, cleanup.aliceToken);
      await rest('DELETE', `hosts/${cleanup.aliceUid}`, cleanup.aliceToken);
      // Verify, as the (former) host: a table that is gone cannot be read (401) and the slot reads as null.
      let allGone = true;
      for (const code of cleanup.tables) { const read = await rest('GET', `tables/${code}/meta`, cleanup.aliceToken); if (!(read.status === 401 || read.json === null)) allGone = false; }
      const slotAfter = await rest('GET', `hosts/${cleanup.aliceUid}`, cleanup.aliceToken);
      console.log(`cleanup: ${cleanup.tables.length} test table(s) removed and verified gone: ${allGone}; host slot cleared: ${slotAfter.json === null}`);
    }
  } catch {}
  for (const stranger of strangers) await deleteAccount(stranger.token);
  for (const token of [cleanup.bobToken, cleanup.aliceToken, cleanup.carolToken]) if (token) await deleteAccount(token);
  await closeAllBrowsers();
  if (server) await server.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
if (exitCode === 2) console.log('RESULT: the rules are not published to the project yet, so the live checks did not run.');
else if (failed.length) { console.log('RESULT: FAILED:', failed.map((r) => r.name).join('; ')); exitCode = 1; }
else console.log('RESULT: all live checks passed.');
process.exit(exitCode);
