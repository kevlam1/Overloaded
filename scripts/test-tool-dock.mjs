// The tool docks' saved layout (frontend/src/tool-dock.js): written as JSON text through a store that keeps only text, read back strictly, and kept per mode.
import { readDockLayout, readDockStore, writeDockStore } from '../frontend/src/tool-dock.js';

let checks = 0;
const same = (label, got, want) => { checks += 1; if (JSON.stringify(got) !== JSON.stringify(want)) { console.log('FAILED CHECK:', label, JSON.stringify(got), 'expected', JSON.stringify(want)); process.exit(1); } };

// a store like src/safe-store.js: every value becomes text
const kept = new Map();
const store = { get: (k) => kept.get(k) ?? null, set: (k, v) => { kept.set(k, String(v)); return true; } };
const key = 'overloaded.toolDocks';

const mine = { left: ['stack', 'bar'], right: ['history'], float: ['players'] };
store.set(key, writeDockStore(store.get(key), 'split', mine));
same('a saved split layout comes back after a reload', readDockLayout('split', readDockStore(store.get(key)).split), mine);

store.set(key, writeDockStore(store.get(key), 'column', { left: ['bar', 'stack'], float: ['history', 'players'] }));
same('saving the column layout keeps the split one', readDockLayout('split', readDockStore(store.get(key)).split), mine);
same('...and the column one is kept too', readDockLayout('column', readDockStore(store.get(key)).column), { left: ['bar', 'stack'], float: ['history', 'players'] });

same('damaged text reads as nothing stored', [readDockStore('[object Object]'), readDockStore('[1,2]'), readDockStore(null)], [{}, {}, {}]);
same('nothing stored gives the default layout', readDockLayout('split', readDockStore(null).split), { left: ['stack', 'bar'], right: ['players', 'history'] });

console.log(`All ${checks} tool dock checks passed.`);
