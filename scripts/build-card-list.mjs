// Builds the card list the site serves from two bulk files already on disk (no network: downloading and the weekly reuse
// come in the next piece). Plain Node 20.11+, no dependencies.
//   node --max-old-space-size=4096 scripts/build-card-list.mjs [--oracle FILE] [--default FILE] [--out FILE]
// Defaults: the files `node scripts/fetch-scryfall.mjs bulk oracle_cards` and `... bulk default_cards` cache under
// data/cache/scryfall/, and the output goes to data/cache/overloaded/cards.json (git-ignored). Exits 1 and writes nothing
// if the list fails its checks (see validateList in scripts/lib/card-list.mjs).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { buildFromFiles, serializeList, validateList } from './lib/card-list.mjs';

const root = join(import.meta.dirname, '..');
const args = process.argv.slice(2);
const option = (name, fallback) => { const at = args.indexOf(`--${name}`); return at >= 0 && args[at + 1] ? args[at + 1] : fallback; };
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
const { list, counts } = await buildFromFiles(oraclePath, defaultPath);
const problems = validateList(list, { previousCount });
const mb = (bytes) => (bytes / 1048576).toFixed(2);
console.log(`Read ${counts.printings} printings and ${counts.oracleRecords} card records in ${((performance.now() - started) / 1000).toFixed(1)} s`);
console.log(`  not for decks (art cards, vanguards, planes, schemes, tokens, emblems, collectibles): ${counts.notCandidates}`);
console.log(`  online-only (every printing digital): ${counts.onlineOnly}`);
console.log(`  kept although the printings file has none of their printings (it may be older): ${counts.noPrintingsKept}`);
console.log(`  cards in the list: ${counts.kept}${previousCount ? ` (the last list had ${previousCount})` : ''}`);
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
