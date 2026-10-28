// Shared by the scripts that drive headless Chrome over the DevTools protocol (spike-two-browsers.mjs,
// check-lobby-ui.mjs, measure-lobby-load.mjs). Each browser gets its own profile folder in the temp directory,
// named cdp-<label>-..., removed by closeAllBrowsers(). Desktop only for now.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const median = (numbers) => [...numbers].sort((a, b) => a - b)[Math.floor(numbers.length / 2)];

export const chromePath = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find(existsSync);

const browsers = [];
let nextId = 1;

// Opens a headless Chrome with a fresh profile. Returns an object with:
//   eval(expression)      run JavaScript in the page and return its value (awaits promises)
//   goto(url), reload()   navigate and wait a moment
//   screenshot(file)      save a PNG
//   send(method, params)  any raw DevTools command, and events (an array of every DevTools event since the last reset)
//   logs                  console messages, exceptions and browser log entries
//   dialogs               the text of every alert/confirm that opened; they are accepted automatically
export async function openBrowser(label, { width = 1280, height = 800 } = {}) {
  if (!chromePath) throw new Error('Chrome was not found.');
  const profile = mkdtempSync(join(tmpdir(), `cdp-${label}-`));
  const port = 9300 + Math.floor(Math.random() * 600);
  const child = spawn(chromePath, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'about:blank',
  ], { stdio: 'ignore', windowsHide: true });
  const browser = { label, profile, child, logs: [], dialogs: [], events: [] };
  browsers.push(browser);
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break; } catch {} await sleep(250); }
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  const send = (method, params = {}) => new Promise((ok, fail) => { const id = nextId++; pending.set(id, { ok, fail }); ws.send(JSON.stringify({ id, method, params })); });
  ws.onmessage = (message) => {
    const data = JSON.parse(message.data);
    if (data.id && pending.has(data.id)) { const { ok, fail } = pending.get(data.id); pending.delete(data.id); data.error ? fail(new Error(JSON.stringify(data.error))) : ok(data.result); return; }
    if (!data.method) return;
    browser.events.push(data);
    if (data.method === 'Page.javascriptDialogOpening') {
      browser.dialogs.push(data.params.message);
      send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
    } else if (data.method === 'Runtime.consoleAPICalled') browser.logs.push(`console.${data.params.type}: ` + data.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    else if (data.method === 'Runtime.exceptionThrown') browser.logs.push('exception: ' + (data.params.exceptionDetails.exception?.description ?? data.params.exceptionDetails.text));
    else if (data.method === 'Log.entryAdded') browser.logs.push(`${data.params.entry.level}: ${data.params.entry.text}`);
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  browser.send = send;
  browser.eval = async (expression) => {
    const out = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (out.exceptionDetails) throw new Error('page error: ' + (out.exceptionDetails.exception?.description ?? out.exceptionDetails.text));
    return out.result.value;
  };
  browser.goto = async (url) => { await send('Page.navigate', { url }); await sleep(1200); };
  browser.reload = async () => { await send('Page.reload'); await sleep(1200); };
  browser.screenshot = async (file) => { const { data } = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(file, Buffer.from(data, 'base64')); };
  browser.close = () => { try { ws.close(); } catch {} try { child.kill(); } catch {} };
  return browser;
}

// Closes every browser opened here and deletes their profile folders. Call it in a `finally`.
export async function closeAllBrowsers() {
  for (const browser of browsers) browser.close();
  await sleep(1500);
  for (const browser of browsers) { try { rmSync(browser.profile, { recursive: true, force: true }); } catch {} }
}

// Polls until `predicate` returns something truthy (returned) or the time runs out (null).
export async function waitFor(predicate, timeoutMs, everyMs = 40) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) { const value = await predicate(); if (value) return value; await sleep(everyMs); }
  return null;
}

// The signed-in anonymous account is kept in the browser's own storage; read its id and token from there.
export const authOf = (browser) => browser.eval(`new Promise((resolve) => {
  const open = indexedDB.open('firebaseLocalStorageDb');
  open.onerror = () => resolve(null);
  open.onsuccess = () => {
    const db = open.result;
    if (!db.objectStoreNames.contains('firebaseLocalStorage')) return resolve(null);
    const req = db.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll();
    req.onsuccess = () => {
      const found = req.result.map((row) => row.value).find((value) => value && value.uid);
      resolve(found ? { uid: found.uid, token: found.stsTokenManager && found.stsTokenManager.accessToken } : null);
    };
    req.onerror = () => resolve(null);
  };
})`);

// Page helpers for the lobby page's elements (by id).
export const text = (browser, id) => browser.eval(`document.getElementById(${JSON.stringify(id)}).textContent`);
export const tableShown = (browser) => browser.eval(`!document.getElementById('table').hidden`);
export const setValue = (browser, id, value) => browser.eval(`(() => { const el = document.getElementById(${JSON.stringify(id)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input')); })()`);
export const click = (browser, id) => browser.eval(`document.getElementById(${JSON.stringify(id)}).click()`);
export const players = (browser) => browser.eval(`Array.from(document.querySelectorAll('#players li')).map((li) => li.textContent)`);
