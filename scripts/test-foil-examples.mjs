// Tests for shared/foil-examples.mjs: a real printing for the traditional foil and the etched foil. Run: node scripts/test-foil-examples.mjs
// The shape is always checked. When the printing files are built here (npm run cards), each example is also looked up in its set file: it must be that card, with that finish.
import { existsSync, readFileSync } from 'node:fs';
import { FOIL_EXAMPLES } from '../shared/foil-examples.mjs';
import { readPrintingValue, cardKey } from '../shared/printings.mjs';

let checks = 0;
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) { console.log(`FAILED CHECK: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); process.exit(1); } };

same('there is an example for etched and for a traditional foil, and nothing else', Object.keys(FOIL_EXAMPLES).sort(), ['etched', 'traditional']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
same('every example has a name, a set code, a number and a printing id', Object.entries(FOIL_EXAMPLES).filter(([, e]) => !(e.name && /^[a-z0-9]{3,6}$/.test(e.set) && e.number && UUID.test(e.id))).map(([k]) => k), []);

if (existsSync('frontend/public/data/printings')) {
  const wrong = [];
  for (const [kind, e] of Object.entries(FOIL_EXAMPLES)) {
    const file = existsSync(`frontend/public/data/printings/set-${e.set}.json`) ? JSON.parse(readFileSync(`frontend/public/data/printings/set-${e.set}.json`, 'utf8')) : {};
    const p = readPrintingValue(file[e.number]);
    const rightKind = kind === 'traditional' ? p && p.kind === undefined && p.finishes === undefined : kind === 'etched' ? p && (p.finishes & 4) !== 0 && p.kind === undefined : p && p.kind === kind;
    if (!p || p.id !== e.id || p.key !== cardKey(e.name) || !rightKind) wrong.push(kind);
  }
  same('in the real data each example is that card and printing, with that kind of foil', wrong, []);
} else console.log('(real data checks skipped: no printing files built here)');

console.log(`All ${checks} foil example checks passed.`);
