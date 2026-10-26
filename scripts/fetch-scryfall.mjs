// Research tool for Scryfall card data. Plain Node 18+, no dependencies.
//   node scripts/fetch-scryfall.mjs sample  -> one POST /cards/collection, raw reply saved, key fields printed
//   node scripts/fetch-scryfall.mjs bulk [oracle_cards|default_cards]
//        -> downloads that bulk file once (default oracle_cards), measures a trimmed card list and printing list
// Everything is written to data/cache/scryfall/, which is gitignored.
// Scryfall's rules (docs/scryfall.md): send User-Agent and Accept, at most 2 requests a second
// to /cards/collection, and use bulk files instead of the API for large lookups.
import { createReadStream } from 'node:fs';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { createGunzip, gzipSync } from 'node:zlib';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

const OUT = join(import.meta.dirname, '..', 'data', 'cache', 'scryfall');
const HEADERS = {
  'User-Agent': 'Overloaded/0.1 (+https://github.com/kevlam1/Overloaded)',
  Accept: 'application/json',
};

// Stop on any failed request (including HTTP 429), so an error page is never saved or parsed as card data.
async function fetchOk(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`${url} answered HTTP ${res.status}. Stopping${res.status === 429 ? ' (rate limited: wait before trying again)' : ''}.`);
  return res;
}

async function sample() {
  const identifiers = [
    { name: 'Forest' },
    { name: 'Serra Angel' },
    { name: 'Delver of Secrets' }, // double-faced
    { name: 'Lightning Bolt' },
    { name: 'Not A Real Card Name' }, // should land in not_found
  ];
  const res = await fetchOk('https://api.scryfall.com/cards/collection', {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifiers }),
  });
  const json = await res.json();
  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, 'collection-sample.json'), JSON.stringify(json, null, 2));
  console.log(`HTTP ${res.status}. Top-level keys: ${Object.keys(json).join(', ')}`);
  console.log(`not_found: ${JSON.stringify(json.not_found)}`);
  console.log(`Card object keys (first card): ${Object.keys(json.data[0]).join(', ')}`);
  for (const c of json.data) {
    const faces = c.card_faces ? c.card_faces.map((f) => f.name).join(' // ') : '-';
    console.log(`\n${c.name}`);
    console.log(`  id ${c.id}  layout ${c.layout}  faces ${faces}`);
    console.log(`  type_line ${JSON.stringify(c.type_line)}  mana_cost ${JSON.stringify(c.mana_cost)}`);
    console.log(`  keywords ${JSON.stringify(c.keywords)}  produced_mana ${JSON.stringify(c.produced_mana)}`);
    console.log(`  image_uris.normal ${c.image_uris?.normal ?? '(none on card; see card_faces)'}`);
    if (!c.image_uris && c.card_faces) console.log(`  card_faces[0].image_uris.normal ${c.card_faces[0].image_uris?.normal}`);
  }
}

// Layouts that never go in a deck. Tokens and emblems stay, since cards make them during a game.
const NOT_IN_DECKS = new Set(['art_series', 'vanguard', 'planar', 'scheme']);

async function bulk(type) {
  const list = await (await fetchOk('https://api.scryfall.com/bulk-data', { headers: HEADERS })).json();
  const item = list.data.find((b) => b.type === type);
  if (!item) throw new Error(`No bulk file of type ${type}. Types: ${list.data.map((b) => b.type).join(', ')}`);
  const file = join(OUT, `${type}.jsonl.gz`);
  await mkdir(OUT, { recursive: true });
  let have = false;
  // Same size as today's file means same file. Good enough for a research tool; the real build should compare updated_at.
  try { have = (await stat(file)).size === item.compressed_size; } catch {}
  if (!have) {
    console.log(`Downloading ${item.jsonl_download_uri} (${(item.compressed_size / 1048576).toFixed(1)} MB)...`);
    const res = await fetchOk(item.jsonl_download_uri, { headers: HEADERS });
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length !== item.compressed_size) throw new Error(`Download is ${body.length} bytes, expected ${item.compressed_size}. Not saved.`);
    await writeFile(file, body);
  } else console.log('Using the cached copy (same size as today\'s file).');

  // Stream line by line: the larger files unpack to more than a JavaScript string can hold.
  let rawBytes = 0, total = 0;
  const layouts = {};
  const cardList = [];  // one entry per card: name, type, cost, keywords, id
  const withText = [];  // the same plus rules text (all faces)
  const printings = []; // one line per printing: set|collector number|id
  const bySet = {};     // set code -> its printing lines, to size one file per set
  const lines = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line) continue;
    rawBytes += Buffer.byteLength(line) + 1;
    total++;
    const c = JSON.parse(line);
    layouts[c.layout] = (layouts[c.layout] ?? 0) + 1;
    if (NOT_IN_DECKS.has(c.layout)) continue;
    const entry = { n: c.name, t: c.type_line, m: c.mana_cost ?? c.card_faces?.[0]?.mana_cost ?? '', k: c.keywords, i: c.id };
    cardList.push(entry);
    withText.push({ ...entry, o: c.oracle_text ?? c.card_faces?.map((f) => f.oracle_text).join('\n//\n') ?? '' });
    const printing = `${c.set}|${c.collector_number}|${c.id}`;
    printings.push(printing);
    (bySet[c.set] ??= []).push(printing);
  }
  const mb = (b) => (b / 1048576).toFixed(2) + ' MB';
  const report = (label, text) => {
    const buf = Buffer.from(text);
    console.log(`${label}: ${mb(buf.length)}, ${mb(gzipSync(buf).length)} gzipped`);
  };
  console.log(`${item.name}: ${total} records, ${mb(item.compressed_size)} compressed, ${mb(rawBytes)} uncompressed`);
  console.log(`Kept for decks (not ${[...NOT_IN_DECKS].join(', ')}): ${cardList.length}`);
  report('Card list (name, type, cost, keywords, id)', JSON.stringify(cardList));
  report('Card list plus rules text', JSON.stringify(withText));
  report('Printing list (set|number|id per line)', printings.join('\n'));
  const setSizes = Object.values(bySet).map((lines) => gzipSync(Buffer.from(lines.join('\n'))).length).sort((a, b) => a - b);
  const kb = (b) => (b / 1024).toFixed(1) + ' KB';
  console.log(`One file per set: ${setSizes.length} sets, gzipped median ${kb(setSizes[setSizes.length >> 1])}, largest ${kb(setSizes.at(-1))}`);
  console.log(`Layouts: ${JSON.stringify(layouts)}`);
}

const [mode, arg] = process.argv.slice(2);
if (mode === 'sample') await sample();
else if (mode === 'bulk') await bulk(arg ?? 'oracle_cards');
else console.log('Usage: node scripts/fetch-scryfall.mjs sample | bulk [oracle_cards|default_cards]');
