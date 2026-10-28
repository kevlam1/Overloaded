// Does the page really keep a table alive, on the real project, in a real browser, with the real clock?
// It takes about 70 seconds because the heartbeat interval is a minute. A host makes a table, then:
//   1. nobody does anything for 62 seconds: lastActive must NOT move (an idle tab sends nothing);
//   2. one tap: a heartbeat is sent and lastActive moves forward by about a minute;
//   3. more taps straight after: no second heartbeat (the page holds to one a minute);
//   4. the warning banner stays hidden (nothing to warn about), and the page has no errors.
// lastActive is read over HTTPS with the host's own token, so this needs the published rules to let a member read it
// (the activity read rule of 2026-10-28). Everything made here is deleted at the end.
// Run from the repo root:  node --env-file=.env scripts/check-heartbeat-live.mjs
// Exit codes: 0 all passed, 1 a check failed, 2 the rules are not published yet (lastActive could not be read).
import { createServer } from 'vite';
import { openBrowser, closeAllBrowsers, waitFor, sleep, text, setValue, click, tableShown, authOf } from './lib/browser.mjs';

const DB = (process.env.FIREBASE_DATABASE_URL ?? '').replace(/\/$/, '');
const API_KEY = process.env.FIREBASE_API_KEY ?? '';
if (!DB || !API_KEY) { console.log('The Firebase settings are not in the environment. Run: node --env-file=.env scripts/check-heartbeat-live.mjs'); process.exit(1); }

const PORT = 5196;
const ORIGIN = `http://127.0.0.1:${PORT}`;
let checks = 0;
const failures = [];
function check(label, pass, detail = '') {
  checks++;
  if (!pass) { failures.push(label); console.log(`FAILED  ${label}${detail ? `  (${detail})` : ''}`); }
}

let server = null; let auth = null; let code = '';
let exitCode = 0;
try {
  server = await createServer({ configFile: 'vite.config.js', logLevel: 'error', server: { port: PORT, strictPort: true, host: '127.0.0.1' } });
  await server.listen();
  const browser = await openBrowser('heartbeat');
  await browser.goto(`${ORIGIN}/pages/lobby/index.html`);
  await setValue(browser, 'name', 'Heartbeat check');
  await click(browser, 'create');
  check('a table is made', Boolean(await waitFor(() => tableShown(browser), 20000)), browser.logs.slice(-2).join(' | '));
  code = await text(browser, 'code');
  auth = await authOf(browser);
  const read = async () => {
    const response = await fetch(`${DB}/tables/${code}/activity/lastActive.json?auth=${encodeURIComponent(auth.token)}`);
    return response.status === 200 ? await response.json() : { denied: response.status };
  };

  const first = await read();
  if (typeof first !== 'number') {
    console.log('lastActive could not be read (HTTP ' + first.denied + '): the rules that let a member read it are not published yet.');
    exitCode = 2;
  } else {
    const t0 = Date.now();
    await sleep(62000 - (Date.now() - t0));
    const idle = await read();
    check('an idle table sends no heartbeat in 62 seconds', idle === first, `${first} -> ${idle}`);

    await browser.eval(`document.dispatchEvent(new Event('pointerdown'))`);
    const moved = await waitFor(async () => (await read()) > first, 8000);
    const afterTap = await read();
    check('one tap sends a heartbeat and lastActive moves forward', Boolean(moved), `${first} -> ${afterTap}`);
    check('by about the time that passed (a minute or so)', afterTap - first > 55000 && afterTap - first < 90000, String(afterTap - first));

    await browser.eval(`document.dispatchEvent(new Event('pointerdown')); document.dispatchEvent(new Event('keydown'));`);
    await sleep(4000);
    check('more taps straight after send no second heartbeat', (await read()) === afterTap);
    check('the warning banner stays hidden while the table is active', (await browser.eval(`document.getElementById('banner').hidden`)) === true);
    const errors = browser.logs.filter((line) => /^(exception|error):/i.test(line) && !/favicon/i.test(line));
    check('the page has no errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  }
} catch (error) {
  check('the check script itself ran without an error', false, String(error.message ?? error));
} finally {
  if (auth && code) {
    try { await fetch(`${DB}/tables/${code}.json?auth=${encodeURIComponent(auth.token)}`, { method: 'DELETE' }); } catch {}
    try { await fetch(`${DB}/hosts/${auth.uid}.json?auth=${encodeURIComponent(auth.token)}`, { method: 'DELETE' }); } catch {}
    try { await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${API_KEY}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: auth.token }) }); } catch {}
  }
  await closeAllBrowsers();
  if (server) await server.close();
}

if (exitCode === 2) { console.log('RESULT: the rules are not published yet.'); process.exit(2); }
if (failures.length) { console.log(`\n${checks - failures.length} of ${checks} heartbeat checks passed. FAILED: ${failures.join('; ')}`); process.exit(1); }
console.log(`All ${checks} live heartbeat checks passed.`);
