// Measures what the lobby page costs to load: requests, bytes over the wire, and how long it takes.
// Run from the repo root after `npm run build`:  node scripts/measure-lobby-load.mjs
// It serves dist/ (Vite's preview server, in this process), opens headless Chrome with a fresh profile and the
// cache off, loads the page several times, and prints medians. Desktop only. Numbers are for this machine.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { preview } from 'vite';

const PORT = 5198;
const PAGE = `http://127.0.0.1:${PORT}/pages/lobby/index.html`;
const RUNS = 7;
const chromePath = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find(existsSync);
if (!chromePath) { console.log('Chrome was not found.'); process.exit(1); }
if (!existsSync('dist/pages/lobby/index.html')) { console.log('Run `npm run build` first.'); process.exit(1); }

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const median = (numbers) => [...numbers].sort((a, b) => a - b)[Math.floor(numbers.length / 2)];

const profile = mkdtempSync(join(tmpdir(), 'cdp-measure-'));
const port = 9300 + Math.floor(Math.random() * 300);
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'about:blank'], { stdio: 'ignore', windowsHide: true });
let server = null;
let exitCode = 0;
try {
  server = await preview({ configFile: 'vite.config.js', logLevel: 'error', preview: { port: PORT, strictPort: true, host: '127.0.0.1' } });
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break; } catch {} await sleep(250); }
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let nextId = 1; const pending = new Map(); let events = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); } else if (d.method) events.push(d); };
  const send = (method, params = {}) => new Promise((ok) => { const id = nextId++; pending.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
  await send('Page.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

  const samples = [];
  for (let run = 0; run < RUNS + 1; run++) { // the first run warms the server, so it is dropped
    events = [];
    await send('Page.navigate', { url: 'about:blank' }); await sleep(300); events = [];
    await send('Page.navigate', { url: PAGE });
    await sleep(1500);
    const finished = events.filter((e) => e.method === 'Network.loadingFinished');
    const requests = new Map(events.filter((e) => e.method === 'Network.requestWillBeSent').map((e) => [e.params.requestId, e.params.request.url]));
    const bytes = finished.reduce((sum, e) => sum + e.params.encodedDataLength, 0);
    const jsBytes = finished.filter((e) => /\.js(\?|$)/.test(requests.get(e.params.requestId) ?? '')).reduce((sum, e) => sum + e.params.encodedDataLength, 0);
    const timing = await send('Runtime.evaluate', { expression: `(() => { const n = performance.getEntriesByType('navigation')[0]; return { dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd }; })()`, returnByValue: true });
    if (run > 0) samples.push({ requests: requests.size, bytes, jsBytes, dcl: timing.result.value.dcl, load: timing.result.value.load });
  }
  const m = (key) => median(samples.map((s) => s[key]));
  console.log(`Lobby page, cache off, ${RUNS} loads, medians:`);
  console.log(`  requests:            ${m('requests')}`);
  console.log(`  bytes over the wire: ${m('bytes')} (JavaScript ${m('jsBytes')})`);
  console.log(`  DOMContentLoaded:    ${Math.round(m('dcl'))} ms`);
  console.log(`  load event:          ${Math.round(m('load'))} ms`);
  ws.close();
} catch (error) {
  console.log('measurement failed:', error.message);
  exitCode = 1;
} finally {
  try { chrome.kill(); } catch {}
  await sleep(1200);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
}
process.exit(exitCode);
