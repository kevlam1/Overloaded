// Gets the card list the site serves: reuses the cached list when it is recent, otherwise downloads Scryfall's two bulk
// files, builds the list (scripts/lib/card-list.mjs), checks it, and keeps it. Plain Node 20.11+, no dependencies.
// The HTTP client, the clock, the environment and the delays are all passed in, so scripts/test-card-list-build.mjs can
// play every scenario (Scryfall down, a truncated download, a week passing) against a stand-in server.
//
// Costs this is built around (docs/scryfall.md, "Card list build"):
//  - a rebuild downloads about 100 MB from Scryfall, so it happens at most once a week (MAX_AGE_MS) and never in a
//    preview build or in the tests;
//  - when anything goes wrong, the last good list is reused for up to 30 days (MAX_STALE_MS), so a Scryfall outage
//    cannot block a deploy; only a build with no usable list at all fails;
//  - a list is written only after it passed its checks, whole and in one step, so a failed rebuild leaves the cache as it was.
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { buildFromFiles, serializeList, validateList } from './card-list.mjs';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_AGE_MS = 7 * DAY_MS; // a list younger than this is reused without asking Scryfall anything
export const MAX_STALE_MS = 30 * DAY_MS; // a failed rebuild falls back to a list this old; Vercel keeps its cache a month
export const BULK_DATA_URL = 'https://api.scryfall.com/bulk-data';
// Scryfall's rules (docs/scryfall.md): every request names the app and says what it accepts.
export const HEADERS = { 'User-Agent': 'Overloaded/0.1 (+https://github.com/kevlam1/Overloaded)', Accept: 'application/json' };
const API_TIMEOUT_MS = 30 * 1000;
const FILE_TIMEOUT_MS = 5 * 60 * 1000;
const sleepFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// What to do about the list, from what is cached and where we are running. Pure, so every case can be tested.
//   skip: ship the site without a list (SKIP_CARD_LIST=1, the emergency switch, or nothing cached and no downloading allowed)
//   reuse: use the cached list as it is (recent, or downloading is not allowed here)
//   rebuild: download and build a new one
// Downloading is not allowed in a preview build (VERCEL_ENV=preview) or when CARD_LIST_NO_DOWNLOAD is set (the tests).
export function decide({ cached, now, env }) {
  if (env.SKIP_CARD_LIST) return { action: 'skip', reason: 'SKIP_CARD_LIST is set' };
  const age = cached ? now - Date.parse(cached.meta.builtAt) : Infinity;
  if (cached && age >= 0 && age < MAX_AGE_MS) return { action: 'reuse', reason: 'the cached list is recent', age };
  const noDownload = Boolean(env.CARD_LIST_NO_DOWNLOAD) || env.VERCEL_ENV === 'preview';
  if (noDownload) return cached ? { action: 'reuse', reason: 'downloading is not allowed here', age } : { action: 'skip', reason: 'downloading is not allowed here and nothing is cached' };
  return { action: 'rebuild', reason: cached ? 'the cached list is old' : 'no usable cached list', age };
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// The cached list and its record, if both are there, agree with each other and still pass the checks.
export async function loadCached(cacheDir, validateOptions = {}) {
  try {
    const meta = JSON.parse(await readFile(join(cacheDir, 'cards.meta.json'), 'utf8'));
    const bytes = await readFile(join(cacheDir, 'cards.json'));
    if (typeof meta.builtAt !== 'string' || Number.isNaN(Date.parse(meta.builtAt)) || meta.sha256 !== sha256(bytes)) return null;
    const list = JSON.parse(bytes.toString('utf8'));
    if (validateList(list, validateOptions).length) return null;
    return { meta, bytes, count: list.length };
  } catch {
    return null;
  }
}

async function fetchChecked(fetchImpl, url, timeoutMs) {
  const response = await fetchImpl(url, { headers: HEADERS, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`${url} answered HTTP ${response.status}`);
  return response;
}

// Asks Scryfall where the two bulk files are. One request. Returns { oracle, default } each { url, size, updatedAt }.
export async function getBulkInfo(fetchImpl, apiUrl = BULK_DATA_URL, timeoutMs = API_TIMEOUT_MS) {
  const body = await (await fetchChecked(fetchImpl, apiUrl, timeoutMs)).json();
  if (!body || !Array.isArray(body.data)) throw new Error('the bulk-data answer has no "data" list');
  const pick = (type) => {
    const item = body.data.find((entry) => entry && entry.type === type);
    if (!item) throw new Error(`the bulk-data answer has no "${type}" file`);
    if (typeof item.jsonl_download_uri !== 'string' || !/^https?:\/\//.test(item.jsonl_download_uri)) throw new Error(`"${type}" has no jsonl_download_uri`);
    if (!Number.isInteger(item.compressed_size) || item.compressed_size <= 0) throw new Error(`"${type}" has no compressed_size`);
    return { url: item.jsonl_download_uri, size: item.compressed_size, updatedAt: typeof item.updated_at === 'string' ? item.updated_at : null };
  };
  return { oracle: pick('oracle_cards'), default: pick('default_cards') };
}

// Downloads one file to `destination`. It is written under a temporary name and renamed only when its size is exactly the
// size Scryfall announced, so a cut-off download never looks like a file. Returns the number of bytes.
export async function downloadFile(fetchImpl, url, destination, expectedSize, timeoutMs = FILE_TIMEOUT_MS) {
  const part = `${destination}.part`;
  try {
    const response = await fetchChecked(fetchImpl, url, timeoutMs);
    if (!response.body) throw new Error(`${url} sent no body`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(part));
    const { size } = await stat(part);
    if (size !== expectedSize) throw new Error(`${url} was ${size} bytes, expected ${expectedSize}`);
    await rename(part, destination);
    return size;
  } catch (error) {
    await rm(part, { force: true });
    throw error;
  }
}

async function writeWhole(path, bytes) {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, path);
}

// Puts the checked list where the site's build picks it up. Always the bytes that were checked, held in memory, never a
// second read of a file that something else might have changed.
async function publish(publicFile, bytes) {
  await mkdir(dirname(publicFile), { recursive: true });
  await writeWhole(publicFile, bytes);
}

// One try at a full rebuild. Throws, leaving the cache untouched, if anything is wrong.
async function rebuildOnce({ cacheDir, now, fetchImpl, apiUrl, validateOptions, previousCount, timeouts, log }) {
  const info = await getBulkInfo(fetchImpl, apiUrl, timeouts.apiMs);
  const work = join(cacheDir, `downloads-${process.pid}`);
  await mkdir(work, { recursive: true });
  try {
    const oracleFile = join(work, 'oracle_cards.jsonl.gz');
    const defaultFile = join(work, 'default_cards.jsonl.gz');
    const bytesDownloaded = (await downloadFile(fetchImpl, info.oracle.url, oracleFile, info.oracle.size, timeouts.fileMs)) + (await downloadFile(fetchImpl, info.default.url, defaultFile, info.default.size, timeouts.fileMs));
    log(`card list: downloaded ${(bytesDownloaded / 1048576).toFixed(1)} MB from Scryfall (oracle file ${info.oracle.updatedAt}, printings file ${info.default.updatedAt})`);
    const { list, counts } = await buildFromFiles(oracleFile, defaultFile);
    const problems = validateList(list, { ...validateOptions, previousCount });
    if (problems.length) throw new Error(`the new list failed its checks: ${problems.join('; ')}`);
    const bytes = Buffer.from(serializeList(list));
    await mkdir(cacheDir, { recursive: true });
    await writeWhole(join(cacheDir, 'cards.json'), bytes); // the list first, then the record that vouches for it
    const meta = { builtAt: new Date(now).toISOString(), count: list.length, bytes: bytes.length, sha256: sha256(bytes), oracleUpdatedAt: info.oracle.updatedAt, defaultUpdatedAt: info.default.updatedAt, counts };
    await writeWhole(join(cacheDir, 'cards.meta.json'), Buffer.from(JSON.stringify(meta, null, 2)));
    return { meta, bytes, bytesDownloaded };
  } finally {
    await rm(work, { recursive: true, force: true }); // the bulk files are not kept: the list is all that is reused
  }
}

// The whole job. Returns { action, count, ... } or throws if the site would have no list and should not be built.
//   cacheDir: where the list and its record are kept between builds (.vercel/cache/... on Vercel)
//   publicFile: where the site's build picks the list up (frontend/public/data/cards.json, copied into dist/)
export async function ensureCardList({ cacheDir, publicFile, now = Date.now(), env = process.env, fetchImpl = fetch, apiUrl = BULK_DATA_URL, validateOptions = {}, attempts = 2, retryDelayMs = 2000, sleep = sleepFor, timeouts = {}, log = console.log, warn = console.warn }) {
  const cached = await loadCached(cacheDir, validateOptions);
  const decision = decide({ cached, now, env });
  const days = (ms) => (ms / DAY_MS).toFixed(1);

  if (decision.action === 'skip') {
    warn(`card list: NOT included (${decision.reason}). The import page will have no cards.`);
    return { action: 'skip', reason: decision.reason, count: 0, meta: null };
  }
  if (decision.action === 'reuse') {
    await publish(publicFile, cached.bytes);
    log(`card list: reused the cached list of ${cached.count} cards, ${days(decision.age)} days old (${decision.reason}); no requests made`);
    return { action: 'reuse', reason: decision.reason, count: cached.count, ageDays: decision.age / DAY_MS, meta: cached.meta };
  }

  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const { meta, bytes, bytesDownloaded } = await rebuildOnce({ cacheDir, now, fetchImpl, apiUrl, validateOptions, previousCount: cached ? cached.meta.count : null, timeouts, log });
      await publish(publicFile, bytes);
      log(`card list: built ${meta.count} cards (${(meta.bytes / 1048576).toFixed(2)} MB)`);
      return { action: 'rebuilt', reason: decision.reason, count: meta.count, bytesDownloaded, meta };
    } catch (error) {
      lastError = error;
      warn(`card list: attempt ${attempt} of ${attempts} failed: ${error.message}`);
      if (attempt < attempts) await sleep(retryDelayMs); // the second try asks Scryfall for fresh links, in case they just changed
    }
  }
  // Rebuilding failed. The last good list, if it is not too old, is better than failing the whole deploy.
  if (cached && decision.age <= MAX_STALE_MS) {
    await publish(publicFile, cached.bytes);
    warn(`card list: WARNING using the OLD list of ${cached.count} cards, ${days(decision.age)} days old, because rebuilding failed (${lastError.message})`);
    return { action: 'stale-fallback', reason: decision.reason, count: cached.count, ageDays: decision.age / DAY_MS, error: lastError.message, meta: cached.meta };
  }
  throw new Error(`no card list: rebuilding failed (${lastError.message}) and ${cached ? `the cached list is ${days(decision.age)} days old, over the ${MAX_STALE_MS / DAY_MS}-day limit` : 'nothing usable is cached'}`);
}
