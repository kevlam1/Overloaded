// The card list the site serves (/data/cards.json). Plain Node 20.11+, no dependencies.
//
//   node scripts/build-card-list.mjs              the site build (what `npm run build` and `npm run cards` run): reuse the
//                                                 cached list if it is under 7 days old, otherwise download Scryfall's two
//                                                 bulk files (about 100 MB), build and check the list, and keep it. Puts the
//                                                 list in frontend/public/data/cards.json, which Vite copies into dist/.
//   node scripts/build-card-list.mjs --from-files [--oracle FILE] [--default FILE] [--out FILE]
//                                                 build from two bulk files already on disk (the ones
//                                                 `node scripts/fetch-scryfall.mjs bulk ...` caches), no network. With --site
//                                                 it also publishes the list and the per-set printing files into
//                                                 frontend/public/data, for running and checking the pages here.
//
// Environment (all optional):
//   SKIP_CARD_LIST=1          ship the site WITHOUT a list (the emergency switch if the card step ever blocks a deploy)
//   CARD_LIST_NO_DOWNLOAD=1   never touch the network: reuse whatever list is cached, or ship without one (the tests use this)
//   CARD_LIST_CACHE_DIR       where the list is kept between builds (default .vercel/cache/overloaded, which Vercel keeps)
//   VERCEL_ENV                set by Vercel when its system variables are exposed: a preview build never downloads
// Exits 1, and the build stops, only when there is no usable list at all (see ensureCardList).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { buildFromFiles, countPrintings, serializeList, serializePrintings, validateList, validatePrintings } from './lib/card-list.mjs';
import { ensureCardList, publish } from './lib/card-list-build.mjs';

const root = join(import.meta.dirname, '..');
const args = process.argv.slice(2);
const option = (name, fallback) => { const at = args.indexOf(`--${name}`); return at >= 0 && args[at + 1] ? args[at + 1] : fallback; };
const mb = (bytes) => (bytes / 1048576).toFixed(2);

async function fromFiles() {
  const oraclePath = option('oracle', join(root, 'data', 'cache', 'scryfall', 'oracle_cards.jsonl.gz'));
  const defaultPath = option('default', join(root, 'data', 'cache', 'scryfall', 'default_cards.jsonl.gz'));
  const outPath = option('out', join(root, 'data', 'cache', 'overloaded', 'cards.json'));
  for (const path of [oraclePath, defaultPath]) {
    if (!existsSync(path)) { console.error(`Missing ${path}. Run: node scripts/fetch-scryfall.mjs bulk oracle_cards   and   ... bulk default_cards`); process.exit(1); }
  }
  // The last good list, if there is one, so a list that suddenly shrinks is refused.
  let previousCount = null;
  if (existsSync(outPath)) { try { previousCount = JSON.parse(readFileSync(outPath, 'utf8')).length; } catch { /* an unreadable old file is not a reason to refuse a new list */ } }
  const started = performance.now();
  const { list, counts, printingFiles } = await buildFromFiles(oraclePath, defaultPath);
  const problems = [...validateList(list, { previousCount }), ...validatePrintings(printingFiles)];
  console.log(`Read ${counts.printings} printings and ${counts.oracleRecords} card records in ${((performance.now() - started) / 1000).toFixed(1)} s`);
  console.log(`  not for decks (art cards, vanguards, planes, schemes, tokens, emblems, collectibles): ${counts.notCandidates}`);
  console.log(`  online-only (every printing digital): ${counts.onlineOnly}`);
  console.log(`  kept although the printings file has none of their printings (it may be older): ${counts.noPrintingsKept}`);
  console.log(`  cards in the list: ${counts.kept}${previousCount ? ` (the last list had ${previousCount})` : ''}`);
  console.log(`  cards with another printed title: ${counts.withAlternateNames}; printings kept: ${counts.printingsKept} in ${counts.printingSets} sets`);
  if (problems.length) {
    console.error('\nNot written. The list failed its checks:');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  const bytes = Buffer.from(serializeList(list));
  mkdirSync(dirname(outPath), { recursive: true });
  const temporary = `${outPath}.tmp`; // written whole, then renamed, so a stopped build never leaves a half-written list
  writeFileSync(temporary, bytes);
  renameSync(temporary, outPath);
  console.log(`Wrote ${outPath}: ${mb(bytes.length)} MB, ${mb(gzipSync(bytes).length)} MB gzipped, ${mb(brotliCompressSync(bytes).length)} MB brotli`);
  // The printings, all in one file beside the list (the site build splits them into one small file per set).
  const printingBytes = Buffer.from(serializePrintings(printingFiles));
  const printingsPath = join(dirname(outPath), 'printings.json');
  writeFileSync(`${printingsPath}.tmp`, printingBytes);
  renameSync(`${printingsPath}.tmp`, printingsPath);
  console.log(`Wrote ${printingsPath}: ${mb(printingBytes.length)} MB, ${mb(gzipSync(printingBytes).length)} MB gzipped (${countPrintings(printingFiles).sets} sets)`);
  if (args.includes('--site')) {
    // Also put them where the site picks them up (the same step the real build uses), so the pages can be run and checked
    // here without downloading anything. The bytes are the ones that were just checked and written.
    const publicFile = join(root, 'frontend', 'public', 'data', 'cards.json');
    await publish(publicFile, bytes, printingBytes);
    console.log(`Published the list and ${countPrintings(printingFiles).sets} printing files to ${dirname(publicFile)}`);
  }
}

async function forTheSite() {
  // One place everywhere: Vercel keeps files under .vercel/cache between builds (its docs), and on this machine the same
  // folder is git-ignored. Nothing depends on an environment variable Vercel might not expose, so a missing one cannot
  // quietly move the cache somewhere that is not kept (which would mean a 100 MB download on every deploy).
  const cacheDir = process.env.CARD_LIST_CACHE_DIR ?? join(root, '.vercel', 'cache', 'overloaded');
  const publicFile = join(root, 'frontend', 'public', 'data', 'cards.json');
  // These lines are what a Vercel build log will show: which Node ran, and which cache and mode were used.
  console.log(`card list: node ${process.version}, cache ${cacheDir}, VERCEL_ENV=${process.env.VERCEL_ENV ?? '(not set)'}`);
  try {
    const result = await ensureCardList({ cacheDir, publicFile });
    if (result.action !== 'skip') console.log(`card list: ${result.action}, ${result.count} cards in ${publicFile}`);
    // A small public record of what this build did, so the first Vercel builds can be read from the live site without
    // access to Vercel's build logs: whether the list was rebuilt or reused (does the cache persist?), which Node ran,
    // and whether Vercel's system variables reached the build. Nothing secret; it changes on every build on purpose.
    const info = { action: result.action, reason: result.reason, count: result.count, builtAt: result.meta?.builtAt ?? null, sha256: result.meta?.sha256 ?? null, oracleUpdatedAt: result.meta?.oracleUpdatedAt ?? null, printingSets: result.meta?.printingSets ?? null, printingCount: result.meta?.printingCount ?? null, printingsSha256: result.meta?.printingsSha256 ?? null, node: process.version, vercelEnv: process.env.VERCEL_ENV ?? null, onVercel: Boolean(process.env.VERCEL), ranAt: new Date().toISOString() };
    mkdirSync(dirname(publicFile), { recursive: true });
    writeFileSync(join(dirname(publicFile), 'cards.info.json'), JSON.stringify(info, null, 2));
  } catch (error) {
    console.error(`card list: ERROR ${error.message}`);
    console.error('card list: the build stops here. To ship the site without a card list, set SKIP_CARD_LIST=1.');
    process.exit(1);
  }
}

if (args.includes('--from-files')) await fromFiles();
else await forTheSite();
