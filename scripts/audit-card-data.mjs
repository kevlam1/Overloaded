// Checks the cached Scryfall bulk files for things that would break matching decklists by name.
// Plain Node 18+, no dependencies, no network. Run `node scripts/fetch-scryfall.mjs bulk oracle_cards`
// and `... bulk default_cards` first, then: node --max-old-space-size=4096 scripts/audit-card-data.mjs
// (the extra memory is for reading every printing; a real build should keep fewer fields).
import { createReadStream } from 'node:fs';
import { createGunzip, gzipSync, brotliCompressSync } from 'node:zlib';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

const DIR = join(import.meta.dirname, '..', 'data', 'cache', 'scryfall');
const NOT_IN_DECKS = new Set(['art_series', 'vanguard', 'planar', 'scheme']);
const TOKENISH = new Set(['token', 'double_faced_token', 'emblem']);

async function load(name, keep) {
  const out = [];
  const lines = createInterface({ input: createReadStream(join(DIR, name)).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of lines) if (line) out.push(keep(JSON.parse(line)));
  return out;
}
const oracleId = (c) => c.oracle_id ?? c.card_faces?.[0]?.oracle_id;
const show = (label, arr, fmt = (c) => c.name, n = 6) =>
  console.log(`\n${label}: ${arr.length}${arr.length ? '\n  ' + arr.slice(0, n).map(fmt).join('\n  ') : ''}`);

const oracle = (await load('oracle_cards.jsonl.gz', (c) => c)).filter((c) => !NOT_IN_DECKS.has(c.layout));
// A card is online-only when EVERY printing is marked digital. "No paper printing" is not enough:
// preview cards of unreleased sets have an empty games list (Geordi La Forge, Innovator, 2026-10-26).
const paper = new Set();
const notDigital = new Set();
for (const p of await load('default_cards.jsonl.gz', (c) => ({ o: oracleId(c), paper: c.games?.includes('paper'), digital: c.digital }))) {
  if (p.paper) paper.add(p.o);
  if (!p.digital) notDigital.add(p.o);
}
const onlineOnly = (c) => !notDigital.has(oracleId(c));

console.log(`Oracle Cards records kept (not ${[...NOT_IN_DECKS].join(', ')}): ${oracle.length}`);
show('Online-only cards (every printing marked digital)', oracle.filter(onlineOnly), (c) => `${c.name} set=${c.set}`);
show('No paper printing but NOT online-only (previews of unreleased sets)', oracle.filter((c) => !paper.has(oracleId(c)) && !onlineOnly(c)), (c) => `${c.name} set=${c.set} released ${c.released_at}`);
show('Cards on paper whose chosen printing is online only', oracle.filter((c) => paper.has(oracleId(c)) && !c.games?.includes('paper')), (c) => `${c.name} games=${c.games}`);
show('Collectible records (set_type memorabilia)', oracle.filter((c) => c.set_type === 'memorabilia'), (c) => `${c.name} [${c.layout}] "${c.type_line}"`);
show('Tokens and emblems', oracle.filter((c) => TOKENISH.has(c.layout)));
show('Type line says Land, but the front face is not a land', oracle.filter((c) => c.card_faces && /Land/.test(c.type_line) && !/Land/.test(c.card_faces[0].type_line ?? '')), (c) => `${c.name}: "${c.type_line}"`);
show('Records whose faces have their own "keywords" field', oracle.filter((c) => c.card_faces?.some((f) => 'keywords' in f)));
show('Names with " // " (decklists may give only the front name)', oracle.filter((c) => c.name.includes(' // ')));
show('Names with characters outside plain ASCII', oracle.filter((c) => /[^\x20-\x7e]/.test(c.name)), (c) => c.name, 8);

// The cards a decklist can name: no tokens or emblems, no collectibles, not online-only.
const cards = oracle.filter((c) => !TOKENISH.has(c.layout) && c.layout !== 'front_card' && c.set_type !== 'memorabilia' && !onlineOnly(c));
const byName = new Map();
for (const c of cards) (byName.get(c.name) ?? byName.set(c.name, []).get(c.name)).push(c);
console.log(`\nDeck cards after those filters: ${cards.length}`);
show('Names still shared by two deck cards', [...byName].filter(([, v]) => v.length > 1), ([n, v]) => `${n}: ${v.map((c) => `${c.set}(${c.set_type})`).join(' | ')}`, 14);
const fronts = new Map();
for (const c of cards) if (c.name.includes(' // ')) { const f = c.name.split(' // ')[0]; fronts.set(f, [...(fronts.get(f) ?? []), c.name]); }
show('Front-face names shared or equal to another card\'s name', [...fronts].filter(([f, v]) => v.length > 1 || byName.has(f)), ([f, v]) => `${f} -> ${v.join(' | ')}${byName.has(f) ? ' | (also a card named ' + f + ')' : ''}`);

const mb = (b) => (b / 1048576).toFixed(2);
const size = (label, value) => {
  const buf = Buffer.from(JSON.stringify(value));
  console.log(`  ${label.padEnd(44)} ${mb(buf.length)} MB raw, ${mb(gzipSync(buf).length)} MB gzip, ${mb(brotliCompressSync(buf).length)} MB brotli`);
};
const cost = (c) => c.mana_cost ?? c.card_faces?.[0]?.mana_cost ?? '';
console.log('\nSizes (brotli at maximum quality; a CDN may compress less)');
size('Deck cards {n,t,m,k,i}', cards.map((c) => ({ n: c.name, t: c.type_line, m: cost(c), k: c.keywords, i: c.id })));
size('Deck cards as arrays [n,t,m,k,i]', cards.map((c) => [c.name, c.type_line, cost(c), c.keywords, c.id]));
size('Tokens and emblems as arrays', oracle.filter((c) => TOKENISH.has(c.layout)).map((c) => [c.name, c.type_line, cost(c), c.keywords, c.id]));
