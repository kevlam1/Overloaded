// Does the built site work the way vercel.json says it will? This serves dist/ with a small stand-in for Vercel that
// applies the rewrites and headers from vercel.json (the real Vercel is not involved), then drives headless Chrome
// against it and the REAL Firebase project:
//   - the headers (content policy and the rest) are present and have no 'unsafe-inline' or 'unsafe-eval';
//   - "/" and "/lobby/CODE" serve the lobby page, a shared link fills the code in and never joins by itself;
//   - nothing is blocked by the content policy while the page signs in, makes a table, and a second browser joins it
//     through the shared link (sign-in, the database connection, scripts, styles, all under the policy);
//   - the throwaway table, host slot and anonymous accounts are deleted at the end.
// Not covered: the long-polling fallback Firebase uses when WebSockets are blocked, and Vercel itself (confirm the
// real headers on the deployed site with a plain GET after a deploy).
// Run from the repo root:  node --env-file=.env scripts/check-deploy-config.mjs
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { extname, join, normalize } from 'node:path';
import { openBrowser, closeAllBrowsers, waitFor, authOf, text, setValue, click, tableShown, players, sleep } from './lib/browser.mjs';

const DB = (process.env.FIREBASE_DATABASE_URL ?? '').replace(/\/$/, '');
const API_KEY = process.env.FIREBASE_API_KEY ?? '';
if (!DB || !API_KEY) { console.log('The Firebase settings are not in the environment. Run: node --env-file=.env scripts/check-deploy-config.mjs'); process.exit(1); }

// DEPLOY_URL=https://your-site.example: check the DEPLOYED site instead (no build, no stand-in; the headers are read
// from the live responses, and Chrome and Firebase see the real origin). Run: DEPLOY_URL=... node --env-file=.env ...
const LIVE = (process.env.DEPLOY_URL ?? '').replace(/\/$/, '');

const failures = [];
let checks = 0;
function check(label, condition, detail = '') {
  checks++;
  if (!condition) { failures.push(label); console.log(`FAILED  ${label}${detail ? `  (${detail})` : ''}`); }
}

// ---- 1. Build the site, so dist/ matches the source as it is now ----
const build = LIVE ? { status: 0, stdout: '', stderr: '' } : spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { encoding: 'utf8', shell: true, windowsHide: true, env: { ...process.env, CARD_LIST_NO_DOWNLOAD: '1' } }); // a test must never start the 100 MB card download; it uses the cached list or none
check('the site builds', build.status === 0, (build.stdout + build.stderr).split('\n').filter((l) => /rror/.test(l)).slice(0, 2).join(' | '));
if (build.status !== 0) { console.log(`${failures.length} check(s) failed.`); process.exit(1); }

// ---- 2. vercel.json on its own ----
const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
const rewrites = config.rewrites ?? [];
const headerRules = config.headers ?? [];
if (!LIVE) for (const rule of rewrites) check(`the rewrite ${rule.source} points at a file that was built`, existsSync(join('dist', rule.destination)), rule.destination);
// Locally the headers come from vercel.json; against a deployed site they are read from its real responses.
const liveHeaders = {};
const headersFor = (path) => LIVE ? (liveHeaders[path] ?? {}) : Object.fromEntries(headerRules.filter((rule) => sourceMatches(rule.source, path)).flatMap((rule) => rule.headers.map((h) => [h.key.toLowerCase(), h.value])));
if (LIVE) {
  const fetchHeaders = async (path) => Object.fromEntries([...(await fetch(LIVE + path)).headers].map(([key, value]) => [key.toLowerCase(), value]));
  liveHeaders['/'] = await fetchHeaders('/');
  const asset = /\/assets\/[^"']+\.js/.exec(await (await fetch(`${LIVE}/`)).text())?.[0];
  if (asset) liveHeaders[asset] = await fetchHeaders(asset);
}

// The two pattern forms vercel.json uses here: ":name" (one path segment) and "(.*)" (anything, to the end).
function sourceMatches(source, path) {
  const escape = (part) => part.replace(/[.+?^${}|[\]\\()*]/g, '\\$&').replace(/:[A-Za-z]+/g, '[^/]+');
  return new RegExp('^' + source.split('(.*)').map(escape).join('.*') + '$').test(path);
}

const page = headersFor('/');
const csp = page['content-security-policy'] ?? '';
const directive = (name) => (csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? '');
check('a content security policy is set', csp.length > 0);
check('the policy has no unsafe-inline and no unsafe-eval', !/unsafe-(inline|eval)/.test(csp));
check('the policy starts from default-src self', directive('default-src') === "default-src 'self'");
check('the policy forbids plugins, framing and a changed base', directive('object-src').includes("'none'") && directive('frame-ancestors').includes("'none'") && directive('base-uri').includes("'self'"));
check('the policy allows sign-in and the database connection', /identitytoolkit\.googleapis\.com/.test(directive('connect-src')) && /securetoken\.googleapis\.com/.test(directive('connect-src')) && /wss:\/\/\*\.firebaseio\.com/.test(directive('connect-src')));
check('no wildcard source for scripts or connections', !/(^|\s)(\*|https:|http:|data:)(\s|$)/.test(directive('script-src')) && !/(^|\s)(\*|https:|http:)(\s|$)/.test(directive('connect-src')));
check('pictures may come from this site, data: and Scryfall\'s picture server only', directive('img-src') === "img-src 'self' data: https://cards.scryfall.io", directive('img-src'));
check('nosniff is set', page['x-content-type-options'] === 'nosniff');
check('framing is denied', page['x-frame-options'] === 'DENY');
check('a referrer policy is set that does not send the path to other sites', ['strict-origin-when-cross-origin', 'strict-origin', 'same-origin', 'no-referrer'].includes(page['referrer-policy']));
check('powerful browser features are switched off', /camera=\(\)/.test(page['permissions-policy'] ?? '') && /microphone=\(\)/.test(page['permissions-policy'] ?? ''));
const hashedPath = LIVE ? Object.keys(liveHeaders).find((key) => key.startsWith('/assets/')) : `/assets/${readdirAssets().find((f) => f.endsWith('.js'))}`;
check('hashed files are cached for a year', headersFor(hashedPath)['cache-control'] === 'public, max-age=31536000, immutable', hashedPath);
check('the page itself is not cached for a year', !/max-age=31536000/.test(headersFor('/')['cache-control'] ?? ''));

function readdirAssets() {
  const dir = join('dist', 'assets');
  return existsSync(dir) ? readdirSync(dir) : [];
}

// ---- 3. A small stand-in for Vercel: rewrites, then files, then headers ----
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.map': 'application/json' };
function resolve(urlPath) {
  const rewrite = rewrites.find((rule) => sourceMatches(rule.source, urlPath));
  const target = rewrite ? rewrite.destination : urlPath;
  let file = normalize(join('dist', target));
  if (!file.startsWith('dist')) return null; // never leave dist/
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  return existsSync(file) && statSync(file).isFile() ? file : null;
}
const server = LIVE ? null : createServer((request, response) => {
  const urlPath = decodeURIComponent(new URL(request.url, 'http://x').pathname);
  const file = resolve(urlPath);
  const headers = headersFor(urlPath);
  if (!file) { response.writeHead(404, headers); response.end('Not found'); return; }
  response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', ...headers });
  response.end(readFileSync(file));
});
if (server) await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const ORIGIN = LIVE || `http://127.0.0.1:${server.address().port}`;

// The server (the stand-in locally, the real Vercel with DEPLOY_URL), checked before anything relies on it
const get = async (path) => { const r = await fetch(ORIGIN + path); return { status: r.status, type: r.headers.get('content-type') ?? '', csp: r.headers.get('content-security-policy'), body: await r.text() }; };
const root = await get('/');
check('the served site serves the lobby page at /', root.status === 200 && root.type.startsWith('text/html') && /<h1>Overloaded/.test(root.body));
check('the served site serves the same page at /lobby/ABC234', (await get('/lobby/ABC234')).body === root.body);
check('the served site serves the same page at /lobby', (await get('/lobby')).body === root.body);
const deckPage = await get('/deck');
check('the served site serves the deck import page at /deck', deckPage.status === 200 && deckPage.type.startsWith('text/html') && /<h1>Import a deck/.test(deckPage.body) && deckPage.body !== root.body);
check('and sends the policy with it', deckPage.csp === csp);
const soloPage = await get('/solo');
check('the served site serves the solo table at /solo', soloPage.status === 200 && soloPage.type.startsWith('text/html') && /<h1>Solo table/.test(soloPage.body) && soloPage.body !== root.body && soloPage.body !== deckPage.body);
check('and sends the policy with it', soloPage.csp === csp);
check('the served site sends the policy with pages', root.csp === csp);
check('the served site answers an unknown path with 404', (await get('/no/such/page')).status === 404);
// Real Vercel answers a path-traversal attempt with 400, the stand-in with 404: either way nothing is served.
check('the served site refuses a path that climbs out of the site folder', [400, 404].includes((await get('/..%2Fpackage.json')).status));
for (const path of ['/package.json', '/vite.config.js', '/.env', '/backend/database.rules.json', '/log.md', '/CLAUDE.md']) {
  check(`the served site does not serve the repository file ${path}`, (await get(path)).status === 404);
}

// ---- 3b. The card list: served as JSON from /data/cards.json, not swallowed by a rewrite into the lobby page ----
// Checked when a list is cached on this machine (npm run cards) or against a deployed site; otherwise the build had none
// to include, and saying nothing would hide that, so it says so.
const cachedList = join('.vercel', 'cache', 'overloaded', 'cards.json');
if (LIVE || existsSync(cachedList)) {
  const served = await get('/data/cards.json');
  let cards = null; try { cards = JSON.parse(served.body); } catch { /* reported below */ }
  check('the card list is served as JSON, not as the lobby page', served.status === 200 && /json/.test(served.type) && Array.isArray(cards), `${served.status} ${served.type}`);
  check('it holds tens of thousands of cards, each with name, type, cost, keywords and id', Array.isArray(cards) && cards.length >= 30000 && ['n', 't', 'm', 'k', 'i'].every((key) => key in cards[0]), Array.isArray(cards) ? String(cards.length) : '');
  if (!LIVE) check('and it is exactly the cached list', readFileSync(join('dist', 'data', 'cards.json')).equals(readFileSync(cachedList)));
} else {
  console.log('(card list checks skipped: no list is cached here; run `npm run cards` to download one)');
}

// ---- 4. Chrome ----
const accounts = [];
const created = [];
let host = null; let guest = null;
try {
  host = await openBrowser('deploy-host');
  const violations = () => [...host.logs, ...(guest?.logs ?? [])].filter((line) => /Content Security Policy|Refused to (load|connect|execute|apply)|violates the following/i.test(line));
  const blocked = () => [...host.events, ...(guest?.events ?? [])].filter((e) => e.method === 'Network.loadingFailed' && /csp/i.test(e.params.blockedReason ?? ''));

  await host.goto(`${ORIGIN}/`);
  check('the lobby page shows at the site root', (await host.eval(`document.querySelector('h1')?.textContent`)).startsWith('Overloaded'));
  check('its stylesheet loaded', (await host.eval(`Array.from(document.styleSheets).some((s) => { try { return s.cssRules.length > 0; } catch { return false; } })`)));
  check('no code is filled in at the root', (await host.eval(`document.getElementById('join-code').value`)) === '');

  await host.goto(`${ORIGIN}/lobby/abc-234`);
  check('a shared link fills the code in (and upper-cases it)', (await host.eval(`document.getElementById('join-code').value`)) === 'ABC234');
  check('and says what to do next, without joining', /ABC234/.test(await text(host, 'status')) && !(await tableShown(host)));
  await host.goto(`${ORIGIN}/lobby/ABCO34`);
  check('a link with an invalid code fills nothing in', (await host.eval(`document.getElementById('join-code').value`)) === '');
  // A link with extra path parts is not a table link at all: no rewrite matches it, so it is a plain 404 and no page loads.
  check('a link with extra path parts is a 404, not the lobby page', (await get('/lobby/ABC234/extra')).status === 404);

  // The real thing, under the policy: sign in, make a table, and a second browser joins through the shared link
  await host.goto(`${ORIGIN}/`);
  await setValue(host, 'name', 'Deploy check host');
  await click(host, 'create');
  const shown = await waitFor(() => tableShown(host), 20000);
  check('a table can be made under the policy (sign-in and the database connection work)', Boolean(shown), host.logs.slice(-2).join(' | '));
  const code = shown ? await text(host, 'code') : '';
  const link = shown ? await text(host, 'link') : '';
  check('the table shows its shareable link', link === `${ORIGIN}/lobby/${code}`, link);

  const hostAuth = await authOf(host);
  if (hostAuth) accounts.push(hostAuth);
  if (code) created.push({ code, hostAuth });

  if (code) {
    guest = await openBrowser('deploy-guest');
    await guest.goto(`${ORIGIN}/lobby/${code}`);
    check('the guest opens the shared link and the code is filled in', (await guest.eval(`document.getElementById('join-code').value`)) === code);
    await setValue(guest, 'name', 'Deploy check guest');
    await click(guest, 'join');
    const joined = await waitFor(() => tableShown(guest), 20000);
    check('the guest joins from the link', Boolean(joined), guest.logs.slice(-2).join(' | '));
    const both = await waitFor(async () => (await players(host)).length === 2, 8000);
    check('the host sees both players, live', Boolean(both), JSON.stringify(await players(host)));
    const guestAuth = await authOf(guest);
    if (guestAuth) accounts.push(guestAuth);
  }

  await sleep(500);
  check('nothing was blocked by the content policy (console)', violations().length === 0, violations().slice(0, 2).join(' | '));
  check('no request was blocked by the content policy (network)', blocked().length === 0, blocked().slice(0, 2).map((e) => e.params.errorText).join(' | '));
  const strayErrors = [...host.logs, ...(guest?.logs ?? [])].filter((line) => /^(exception|error):/i.test(line) && !/favicon/i.test(line));
  check('no script errors on either page', strayErrors.length === 0, strayErrors.slice(0, 2).join(' | '));
} catch (error) {
  check('the check script itself ran without an error', false, String(error.message ?? error));
} finally {
  // Delete what was made: the table and the host slot (as the host), then the anonymous accounts.
  for (const { code, hostAuth } of created) {
    if (!hostAuth) continue;
    try { await fetch(`${DB}/tables/${code}.json?auth=${encodeURIComponent(hostAuth.token)}`, { method: 'DELETE' }); } catch {}
    try { await fetch(`${DB}/hosts/${hostAuth.uid}.json?auth=${encodeURIComponent(hostAuth.token)}`, { method: 'DELETE' }); } catch {}
  }
  for (const account of accounts) {
    try { await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${API_KEY}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: account.token }) }); } catch {}
  }
  await closeAllBrowsers();
  server?.close();
}

if (failures.length) { console.log(`\n${checks - failures.length} of ${checks} deploy checks passed. FAILED: ${failures.join('; ')}`); process.exit(1); }
console.log(`All ${checks} deploy config checks passed.`);
