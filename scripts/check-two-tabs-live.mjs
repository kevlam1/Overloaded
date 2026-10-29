// Live check: two tabs of ONE fresh browser profile open the lobby page at the same moment. They must end up as one player
// (before the Web Lock in src/db.js they became two, and one tab kept acting as an account the browser had lost).
// Run: node --env-file=.env scripts/check-two-tabs-live.mjs   Makes no tables; deletes the accounts it can reach and its profile folder.
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromePath, sleep } from './lib/browser.mjs';

const API_KEY = process.env.FIREBASE_API_KEY ?? '';
const PORT = 5198;
const PAGE = `http://127.0.0.1:${PORT}/pages/lobby/index.html`;
const profile = mkdtempSync(join(tmpdir(), 'cdp-twotabs-'));
const dport = 9300 + Math.floor(Math.random() * 600);
let server = null; let child = null;
const tokens = new Set();

async function attach(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let id = 1; const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  const send = (method, params = {}) => new Promise((ok) => { const i = id++; pending.set(i, ok); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable');
  return async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); return r.result?.exceptionDetails ? 'ERR ' + r.result.exceptionDetails.text : r.result?.result?.value; };
}
const stored = `new Promise((resolve) => { const o = indexedDB.open('firebaseLocalStorageDb'); o.onerror = () => resolve(null); o.onsuccess = () => { const db = o.result; if (!db.objectStoreNames.contains('firebaseLocalStorage')) return resolve([]); const r = db.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll(); r.onsuccess = () => resolve(r.result.map((x) => x.value).filter((v) => v && v.uid).map((v) => ({ uid: v.uid.slice(0, 6), token: v.stsTokenManager && v.stsTokenManager.accessToken }))); }; })`;

try {
  server = await createServer({ configFile: 'vite.config.js', logLevel: 'error', server: { port: PORT, strictPort: true, host: '127.0.0.1' } });
  await server.listen();
  child = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${dport}`, `--user-data-dir=${profile}`, '--no-first-run', '--disable-extensions', 'about:blank'], { stdio: 'ignore', windowsHide: true });
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://127.0.0.1:${dport}/json/version`)).ok) break; } catch {} await sleep(250); }
  // two tabs created at the same moment, both pointing at the page
  const [t1, t2] = await Promise.all([1, 2].map(() => fetch(`http://127.0.0.1:${dport}/json/new?${PAGE}`, { method: 'PUT' }).then((r) => r.json())));
  const [ev1, ev2] = await Promise.all([attach(t1), attach(t2)]);
  await sleep(4000);
  const ask = `import('/src/db.js').then((d) => d.signIn()).then((u) => u.slice(0, 6), (e) => 'ERR ' + e.message)`;
  const [u1, u2] = await Promise.all([ev1(ask), ev2(ask)]);
  console.log('tab 1 thinks its id starts:', u1, '| tab 2:', u2);
  const s1 = await ev1(stored); const s2 = await ev2(stored);
  console.log('accounts stored in the browser (seen from tab 1):', JSON.stringify(s1.map((x) => x.uid)), '| from tab 2:', JSON.stringify(s2.map((x) => x.uid)));
  for (const x of [...s1, ...s2]) if (x.token) tokens.add(x.token);
  await sleep(4000); // give any cross-tab sync time, then ask again
  const [v1, v2] = await Promise.all([ev1(ask), ev2(ask)]);
  console.log('after 4 more seconds, tab 1:', v1, '| tab 2:', v2, '(signIn caches its first answer, so these only repeat)');
  const s3 = await ev1(stored); const s4 = await ev2(stored);
  console.log('stored accounts after waiting, tab 1 sees:', JSON.stringify(s3.map((x) => x.uid)), '| tab 2 sees:', JSON.stringify(s4.map((x) => x.uid)));
  const pass = u1 === u2 && !String(u1).startsWith('ERR') && s3.length === 1 && s4.length === 1 && s3[0].uid === u1;
  console.log(pass ? 'All 1 two-tab checks passed: both tabs are the same player and the browser holds one account.' : 'FAILED: the two tabs are different players, or the browser holds a different number of accounts.');
  process.exitCode = pass ? 0 : 1;
} finally {
  for (const token of tokens) await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${API_KEY}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: token }) }).catch(() => {});
  try { child?.kill(); } catch {}
  await sleep(1500);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  if (server) await server.close();
}
process.exit(process.exitCode ?? 1);
