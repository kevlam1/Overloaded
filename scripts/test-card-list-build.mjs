// Tests for scripts/lib/card-list-build.mjs: when the list is reused, when it is rebuilt, and what happens when Scryfall
// is down, slow, wrong or cut off. A stand-in HTTP server plays Scryfall (no network), a fake clock makes weeks pass.
// The point is the COST: how many requests are made, and that a failure never costs the last good list.
// Run: node scripts/test-card-list-build.mjs
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { decide, ensureCardList, getBulkInfo, downloadFile, loadCached, DAY_MS, MAX_AGE_MS, MAX_STALE_MS, HEADERS } from './lib/card-list-build.mjs';

let checks = 0;
function check(label, condition, detail = '') {
  checks++;
  if (!condition) { console.error(`FAILED: ${label} ${detail}`); process.exit(1); }
}
async function rejects(label, promise, pattern) {
  try { await promise; } catch (error) { check(label, pattern.test(error.message), `message was: ${error.message}`); return; }
  check(label, false, 'it did not throw');
}

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const rec = (name, index, over = {}) => ({ id: uuid(index), oracle_id: `o-${name}`, name, type_line: 'Creature', mana_cost: '{1}', keywords: [], layout: 'normal', set_type: 'expansion', ...over });
const gz = (rows) => gzipSync(Buffer.from(rows.map((r) => JSON.stringify(r)).join('\n') + '\n'));
// A tiny pretend Scryfall: the named cards, plus a token and an online-only card that must be left out.
function data(names) {
  return {
    oracle: gz([...names.map((n, i) => rec(n, i + 1)), rec('Goblin', 900, { layout: 'token' }), rec('Alchemy Only', 901)]),
    deflt: gz([...names.map((n) => ({ oracle_id: `o-${n}`, digital: false })), { oracle_id: 'o-Alchemy Only', digital: true }]),
  };
}
const NAMES_A = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'];
const NAMES_B = [...NAMES_A, 'Golf']; // a week later one card is new
const validateOptions = { minCards: 3, mustHave: [] };

// ---- the stand-in Scryfall ----
const state = { oracle: null, deflt: null, apiStatus: 200, fileStatus: 200, sizeLie: 0, cutOffDefault: false, failDefaultOnce: false, hang: false, hangFiles: false, requests: [], bulkBody: null };
const server = createServer((req, res) => {
  state.requests.push({ url: req.url, ua: req.headers['user-agent'], accept: req.headers.accept });
  const base = `http://127.0.0.1:${server.address().port}`;
  if (state.hang) return; // never answers
  if (req.url === '/bulk-data') {
    if (state.apiStatus !== 200) { res.writeHead(state.apiStatus); return res.end('no'); }
    const body = state.bulkBody ?? { data: [
      { type: 'rulings', jsonl_download_uri: `${base}/r.gz`, compressed_size: 5, updated_at: 'x' },
      { type: 'oracle_cards', jsonl_download_uri: `${base}/o.gz`, compressed_size: state.oracle.length + state.sizeLie, updated_at: '2026-10-29T21:01:58Z' },
      { type: 'default_cards', jsonl_download_uri: `${base}/d.gz`, compressed_size: state.deflt.length, updated_at: '2026-10-29T21:02:47Z' },
    ] };
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(body));
  }
  if (state.hangFiles === true || state.hangFiles === req.url) return; // the file list answers but a download never does (all of them, or just one)
  if (state.fileStatus !== 200) { res.writeHead(state.fileStatus); return res.end('gone'); }
  const file = req.url === '/o.gz' ? state.oracle : req.url === '/d.gz' ? state.deflt : null;
  if (!file) { res.writeHead(404); return res.end(); }
  const cut = req.url === '/d.gz' && (state.cutOffDefault || state.failDefaultOnce);
  if (cut) { state.failDefaultOnce = false; res.writeHead(200, { 'content-length': file.length }); res.write(file.subarray(0, Math.floor(file.length / 2))); return setTimeout(() => res.destroy(), 20); }
  res.writeHead(200, { 'content-length': file.length });
  res.end(file);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const API = `http://127.0.0.1:${server.address().port}/bulk-data`;
const reset = (names = NAMES_A) => { Object.assign(state, { ...data(names), apiStatus: 200, fileStatus: 200, sizeLie: 0, cutOffDefault: false, failDefaultOnce: false, hang: false, hangFiles: false, requests: [], bulkBody: null }); };

const root = mkdtempSync(join(tmpdir(), 'card-list-build-test-'));
let n = 0;
const fresh = () => { const dir = join(root, `case${++n}`); return { cacheDir: join(dir, 'cache'), publicFile: join(dir, 'public', 'data', 'cards.json') }; };
const T0 = Date.UTC(2026, 9, 29, 12, 0, 0);
const logs = []; const warns = [];
const run = (paths, over = {}) => ensureCardList({ ...paths, now: T0, env: {}, apiUrl: API, validateOptions, retryDelayMs: 0, timeouts: { apiMs: 3000, fileMs: 3000 }, log: (m) => logs.push(m), warn: (m) => warns.push(m), ...over });
const names = (paths) => JSON.parse(readFileSync(paths.publicFile, 'utf8')).map((e) => e.n);
const cacheBytes = (paths) => readFileSync(join(paths.cacheDir, 'cards.json'));

try {
  // ---- decide: the rule, with its boundaries ----
  const cachedAt = (daysAgo) => ({ meta: { builtAt: new Date(T0 - daysAgo * DAY_MS).toISOString() } });
  check('7 days is the reuse limit', MAX_AGE_MS === 7 * DAY_MS && MAX_STALE_MS === 30 * DAY_MS);
  check('a 1 day old list is reused', decide({ cached: cachedAt(1), now: T0, env: {} }).action === 'reuse');
  check('a list one millisecond under 7 days is reused', decide({ cached: { meta: { builtAt: new Date(T0 - MAX_AGE_MS + 1).toISOString() } }, now: T0, env: {} }).action === 'reuse');
  check('a list exactly 7 days old is rebuilt', decide({ cached: cachedAt(7), now: T0, env: {} }).action === 'rebuild');
  check('with nothing cached it rebuilds', decide({ cached: null, now: T0, env: {} }).action === 'rebuild');
  check('a list from the future (a wrong clock) is not trusted as recent', decide({ cached: cachedAt(-3), now: T0, env: {} }).action === 'rebuild');
  check('SKIP_CARD_LIST skips, even with a recent list', decide({ cached: cachedAt(1), now: T0, env: { SKIP_CARD_LIST: '1' } }).action === 'skip');
  check('no downloading and an old list: reuse it', decide({ cached: cachedAt(20), now: T0, env: { CARD_LIST_NO_DOWNLOAD: '1' } }).action === 'reuse');
  check('no downloading and nothing cached: skip', decide({ cached: null, now: T0, env: { CARD_LIST_NO_DOWNLOAD: '1' } }).action === 'skip');
  check('a preview build never downloads: old list reused', decide({ cached: cachedAt(20), now: T0, env: { VERCEL_ENV: 'preview' } }).action === 'reuse');
  check('a preview build never downloads: nothing cached is a skip', decide({ cached: null, now: T0, env: { VERCEL_ENV: 'preview' } }).action === 'skip');
  check('a production build may download', decide({ cached: null, now: T0, env: { VERCEL_ENV: 'production' } }).action === 'rebuild');

  // ---- 1. First build: one API request, two downloads, and nothing left over ----
  reset();
  let p = fresh();
  let result = await run(p);
  check('first build rebuilds', result.action === 'rebuilt' && result.count === 6, JSON.stringify(result));
  check('it made exactly 3 requests (the file list and the two files)', state.requests.length === 3, state.requests.map((r) => r.url).join(' '));
  check('every request named the app and said what it accepts', state.requests.every((r) => r.ua === HEADERS['User-Agent'] && r.accept === HEADERS.Accept && /Overloaded/.test(r.ua)));
  check('the token and the online-only card are not in the list', JSON.stringify(names(p)) === JSON.stringify(NAMES_A), names(p).join());
  check('the site gets exactly the bytes that were cached', Buffer.compare(cacheBytes(p), readFileSync(p.publicFile)) === 0);
  check('the cache holds only the list and its record (the bulk files are not kept)', readdirSync(p.cacheDir).sort().join() === 'cards.json,cards.meta.json', readdirSync(p.cacheDir).join());
  const meta = JSON.parse(readFileSync(join(p.cacheDir, 'cards.meta.json'), 'utf8'));
  check('the record says when, how many and what Scryfall files it came from', meta.builtAt === new Date(T0).toISOString() && meta.count === 6 && meta.oracleUpdatedAt === '2026-10-29T21:01:58Z' && /^[0-9a-f]{64}$/.test(meta.sha256));
  check('the log says how much was downloaded (so the cost shows in the Vercel build log)', logs.some((l) => /downloaded [0-9.]+ MB/.test(l)));
  check('the result carries the record and the reason, for the public build info file', result.meta?.count === 6 && result.meta.sha256 === meta.sha256 && /no usable cached list/.test(result.reason), JSON.stringify(result.reason));

  // ---- 2. The same list, the days after: no requests at all ----
  state.requests = [];
  rmSync(p.publicFile);
  result = await run(p, { now: T0 + 1 * DAY_MS });
  check('a day later the list is reused', result.action === 'reuse' && result.count === 6);
  check('a reuse still reports the original build record (so the date shows the list was NOT rebuilt)', result.meta?.builtAt === new Date(T0).toISOString() && result.meta.sha256 === meta.sha256);
  check('and not one request was made', state.requests.length === 0);
  check('the site still gets its copy (the build output is emptied every time)', existsSync(p.publicFile) && Buffer.compare(cacheBytes(p), readFileSync(p.publicFile)) === 0);
  result = await run(p, { now: T0 + MAX_AGE_MS - 1 });
  check('one millisecond before 7 days: still no requests', result.action === 'reuse' && state.requests.length === 0);

  // ---- 3. After a week: rebuilt, with the new card ----
  reset(NAMES_B);
  state.requests = [];
  result = await run(p, { now: T0 + MAX_AGE_MS });
  check('after 7 days it rebuilds and picks up the new card', result.action === 'rebuilt' && names(p).includes('Golf') && names(p).length === 7);
  check('that rebuild cost 3 requests', state.requests.length === 3);

  // ---- 4. Scryfall down at the next rebuild: the old list is used, nothing is lost ----
  const before = cacheBytes(p);
  const beforeMeta = readFileSync(join(p.cacheDir, 'cards.meta.json'));
  state.apiStatus = 500; state.requests = []; warns.length = 0;
  rmSync(p.publicFile); // so the fallback has to put the list back, not find it already there
  const sleeps = [];
  result = await run(p, { now: T0 + 15 * DAY_MS, sleep: async (ms) => { sleeps.push(ms); }, retryDelayMs: 1234 });
  check('with Scryfall down the old list is used', result.action === 'stale-fallback' && result.count === 7, JSON.stringify(result));
  check('the site got the old list back', existsSync(p.publicFile) && names(p).length === 7);
  check('it waited once between its two tries, for the time it was told to', sleeps.length === 1 && sleeps[0] === 1234, JSON.stringify(sleeps));
  check('each failed attempt was reported', warns.some((w) => /attempt 1 of 2 failed/.test(w)) && warns.some((w) => /attempt 2 of 2 failed/.test(w)));
  check('it asked twice and no more (one retry)', state.requests.length === 2 && state.requests.every((r) => r.url === '/bulk-data'));
  check('it warned loudly', warns.some((w) => /WARNING using the OLD list/.test(w)) && warns.some((w) => /HTTP 500/.test(w)));
  check('the cache is byte for byte what it was', Buffer.compare(cacheBytes(p), before) === 0 && Buffer.compare(readFileSync(join(p.cacheDir, 'cards.meta.json')), beforeMeta) === 0);
  check('and the site got the old list', names(p).length === 7);
  result = await run(p, { now: T0 + 7 * DAY_MS + 30 * DAY_MS });
  check('exactly 30 days after it was built, a failed rebuild still falls back', result.action === 'stale-fallback');
  await rejects('31 days after, with Scryfall down, the build fails', run(p, { now: T0 + 7 * DAY_MS + 30 * DAY_MS + 1 }), /over the 30-day limit/);

  // ---- 5. Nothing cached and Scryfall down: fail, leave nothing behind ----
  p = fresh();
  state.requests = [];
  await rejects('no cache and Scryfall down: the build fails', run(p), /nothing usable is cached/);
  check('no list was published', !existsSync(p.publicFile));
  check('no leftover files in the cache', !existsSync(p.cacheDir) || readdirSync(p.cacheDir).length === 0, existsSync(p.cacheDir) ? readdirSync(p.cacheDir).join() : '');

  // ---- 6. Broken downloads ----
  reset();
  p = fresh();
  await run(p); // a good first list
  const good = cacheBytes(p);
  state.cutOffDefault = true; state.requests = [];
  result = await run(p, { now: T0 + 8 * DAY_MS });
  check('a cut-off download is refused and the old list stays', result.action === 'stale-fallback' && Buffer.compare(cacheBytes(p), good) === 0);
  check('no half-written file is left behind', readdirSync(p.cacheDir).sort().join() === 'cards.json,cards.meta.json');
  check('the cost of two failed attempts stayed small (at most 2 x 3 requests)', state.requests.length <= 6, String(state.requests.length));
  state.cutOffDefault = false; state.sizeLie = 1; state.requests = [];
  result = await run(p, { now: T0 + 8 * DAY_MS });
  check('a file that is not the size Scryfall announced is refused', result.action === 'stale-fallback' && warns.some((w) => /expected/.test(w)));
  state.sizeLie = 0; state.failDefaultOnce = true; state.requests = [];
  result = await run(p, { now: T0 + 8 * DAY_MS });
  check('one failure then success: the second attempt works', result.action === 'rebuilt' && result.count === 6);
  check('and it cost 6 requests at most', state.requests.length <= 6, String(state.requests.length));
  state.fileStatus = 404; state.requests = [];
  result = await run(p, { now: T0 + 16 * DAY_MS });
  check('a file link that has gone (404) is refused and the old list stays', result.action === 'stale-fallback');

  // ---- 6b. Scryfall that stops answering must not hang the build ----
  reset();
  state.hang = true; state.requests = []; warns.length = 0;
  const startedAt = Date.now();
  result = await run(p, { now: T0 + 16 * DAY_MS, timeouts: { apiMs: 250, fileMs: 250 } });
  check('a file list that never arrives is given up on, and the old list is used', result.action === 'stale-fallback' && Date.now() - startedAt < 5000, `${Date.now() - startedAt} ms`);
  state.hang = false;
  for (const stalled of ['/o.gz', '/d.gz']) {
    state.hangFiles = stalled; state.requests = []; warns.length = 0;
    const startedAt2 = Date.now();
    result = await run(p, { now: T0 + 16 * DAY_MS, timeouts: { apiMs: 3000, fileMs: 250 } });
    check(`a download of ${stalled} that never finishes is given up on, and the old list is used`, result.action === 'stale-fallback' && Date.now() - startedAt2 < 5000 && warns.some((w) => /timeout|aborted/i.test(w)), `${Date.now() - startedAt2} ms`);
  }
  state.hangFiles = false;

  // ---- 7. A new list that fails its own checks is never used ----
  reset(['Solo']);
  p = fresh();
  await rejects('a too-small list with nothing cached fails the build', run(p), /failed its checks/);
  reset();
  p = fresh();
  await run(p);
  const keep = cacheBytes(p);
  reset(['One', 'Two', 'Three']); // half the size of the last list: a shrink of more than 5%
  result = await run(p, { now: T0 + 8 * DAY_MS });
  check('a list far smaller than the last good one is refused', result.action === 'stale-fallback' && warns.some((w) => /fewer than the last good list|more than 5% fewer/.test(w)) && Buffer.compare(cacheBytes(p), keep) === 0);

  // ---- 8. A damaged cache is not trusted ----
  reset();
  p = fresh();
  await run(p);
  const damaged = Buffer.from(cacheBytes(p)); damaged[10] = damaged[10] ^ 1;
  writeFileSync(join(p.cacheDir, 'cards.json'), damaged);
  check('a list that no longer matches its record is not loaded', (await loadCached(p.cacheDir, validateOptions)) === null);
  state.requests = [];
  result = await run(p, { now: T0 + DAY_MS });
  check('so a damaged cache is rebuilt, not reused', result.action === 'rebuilt' && state.requests.length === 3);
  rmSync(join(p.cacheDir, 'cards.meta.json'));
  check('a list with no record is not loaded', (await loadCached(p.cacheDir, validateOptions)) === null);
  writeFileSync(join(p.cacheDir, 'cards.meta.json'), '{ not json');
  check('a record that is not JSON is not loaded', (await loadCached(p.cacheDir, validateOptions)) === null);
  const realSha = (await import('node:crypto')).createHash('sha256').update(cacheBytes(p)).digest('hex');
  writeFileSync(join(p.cacheDir, 'cards.meta.json'), JSON.stringify({ builtAt: 'yesterday-ish', sha256: realSha }));
  check('a record with a bad date is not loaded, even though its checksum is right', (await loadCached(p.cacheDir, validateOptions)) === null);
  writeFileSync(join(p.cacheDir, 'cards.meta.json'), JSON.stringify({ builtAt: 1793000000000, sha256: realSha }));
  check('a record whose date is a number, not text, is not loaded', (await loadCached(p.cacheDir, validateOptions)) === null);
  writeFileSync(join(p.cacheDir, 'cards.meta.json'), JSON.stringify({ sha256: realSha }));
  check('a record with no date is not loaded', (await loadCached(p.cacheDir, validateOptions)) === null);
  await run(p, { now: T0 + 2 * DAY_MS });
  check('a cached list that fails stricter checks is not loaded', (await loadCached(p.cacheDir, { minCards: 100, mustHave: [] })) === null && (await loadCached(p.cacheDir, validateOptions)) !== null);
  check('a cache folder that does not exist is simply empty', (await loadCached(join(root, 'nowhere'), validateOptions)) === null);

  // ---- 9. Where downloading is not allowed ----
  reset();
  p = fresh();
  state.requests = [];
  result = await run(p, { env: { SKIP_CARD_LIST: '1' } });
  check('SKIP_CARD_LIST ships without a list, makes no request and does not fail', result.action === 'skip' && state.requests.length === 0 && !existsSync(p.publicFile) && warns.some((w) => /NOT included/.test(w)));
  result = await run(p, { env: { CARD_LIST_NO_DOWNLOAD: '1' } });
  check('the tests mode with nothing cached skips and makes no request', result.action === 'skip' && state.requests.length === 0);
  result = await run(p, { env: { VERCEL_ENV: 'preview' } });
  check('a preview build with nothing cached skips and makes no request', result.action === 'skip' && state.requests.length === 0);
  await run(p); // a real first list
  state.requests = [];
  result = await run(p, { now: T0 + 40 * DAY_MS, env: { VERCEL_ENV: 'preview' } });
  check('a preview build reuses even a 40 day old list and makes no request', result.action === 'reuse' && state.requests.length === 0 && names(p).length === 6);
  result = await run(p, { now: T0 + 40 * DAY_MS, env: { CARD_LIST_NO_DOWNLOAD: '1' } });
  check('so does the tests mode', result.action === 'reuse' && state.requests.length === 0);

  // ---- 10. The cost over a month: a deploy every day ----
  reset();
  p = fresh();
  state.requests = [];
  let rebuilds = 0;
  for (let day = 0; day < 30; day++) {
    state.oracle = data(day < 14 ? NAMES_A : NAMES_B).oracle; state.deflt = data(day < 14 ? NAMES_A : NAMES_B).deflt;
    const r = await run(p, { now: T0 + day * DAY_MS });
    if (r.action === 'rebuilt') rebuilds++;
    check(`day ${day}: the site always has a list`, existsSync(p.publicFile) && names(p).length >= 6);
  }
  check('30 daily deploys cause 5 rebuilds (days 0, 7, 14, 21, 28)', rebuilds === 5, String(rebuilds));
  check('and 15 requests in all, not 90', state.requests.length === 15, String(state.requests.length));

  // ---- 11. What Scryfall might send that we do not expect ----
  const bad = async (label, body, pattern) => { reset(); state.bulkBody = body; await rejects(label, getBulkInfo(fetch, API, 3000), pattern); };
  await bad('an answer with no data list is refused', { object: 'list' }, /no "data" list/);
  await bad('an answer with no oracle file is refused', { data: [{ type: 'default_cards', jsonl_download_uri: 'http://x/d', compressed_size: 5 }] }, /no "oracle_cards" file/);
  await bad('a file with no download link is refused', { data: [{ type: 'oracle_cards', compressed_size: 5 }, { type: 'default_cards', jsonl_download_uri: 'http://x/d', compressed_size: 5 }] }, /no jsonl_download_uri/);
  await bad('a link that is not http is refused', { data: [{ type: 'oracle_cards', jsonl_download_uri: 'file:///etc/passwd', compressed_size: 5 }, { type: 'default_cards', jsonl_download_uri: 'http://x/d', compressed_size: 5 }] }, /no jsonl_download_uri/);
  await bad('a file with no size is refused', { data: [{ type: 'oracle_cards', jsonl_download_uri: 'http://x/o', compressed_size: 'big' }, { type: 'default_cards', jsonl_download_uri: 'http://x/d', compressed_size: 5 }] }, /no compressed_size/);
  await bad('a size of zero is refused', { data: [{ type: 'oracle_cards', jsonl_download_uri: 'http://x/o', compressed_size: 0 }, { type: 'default_cards', jsonl_download_uri: 'http://x/d', compressed_size: 5 }] }, /no compressed_size/);
  reset(); state.apiStatus = 429;
  await rejects('an HTTP 429 (we are being limited) is an error that names the status', getBulkInfo(fetch, API, 3000), /HTTP 429/);
  reset(); state.hang = true;
  await rejects('a server that never answers is given up on', getBulkInfo(fetch, API, 300), /timeout|aborted/i);
  reset();
  const info = await getBulkInfo(fetch, API, 3000);
  check('a good answer gives both files with their sizes', info.oracle.size === state.oracle.length && info.default.size === state.deflt.length && /\/o\.gz$/.test(info.oracle.url) && info.oracle.updatedAt === '2026-10-29T21:01:58Z');
  check('other file types in the list are ignored', !('rulings' in info));

  // ---- 12. downloadFile on its own ----
  const dest = join(root, 'dl.gz');
  reset();
  check('a good download writes the file and returns its size', (await downloadFile(fetch, API.replace('/bulk-data', '/o.gz'), dest, state.oracle.length, 3000)) === state.oracle.length && Buffer.compare(readFileSync(dest), state.oracle) === 0);
  rmSync(dest);
  await rejects('a download of the wrong size fails', downloadFile(fetch, API.replace('/bulk-data', '/o.gz'), dest, state.oracle.length + 1, 3000), /expected/);
  check('and leaves neither the file nor a partial one', !existsSync(dest) && !existsSync(`${dest}.part`));
  state.fileStatus = 404;
  await rejects('a 404 fails', downloadFile(fetch, API.replace('/bulk-data', '/o.gz'), dest, 5, 3000), /HTTP 404/);
  check('and leaves nothing behind', !existsSync(dest) && !existsSync(`${dest}.part`));
  state.fileStatus = 200; state.hang = true;
  await rejects('a download that stalls is given up on', downloadFile(fetch, API.replace('/bulk-data', '/o.gz'), dest, 5, 300), /timeout|aborted/i);
  state.hang = false;
} finally {
  server.close();
  rmSync(root, { recursive: true, force: true });
}
console.log(`All ${checks} card list build checks passed.`);
