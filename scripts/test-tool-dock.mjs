// The tool docks' saved layout (frontend/src/tool-dock.js): written as JSON text through a store that keeps only text, read back strictly, and kept per mode.
// Since the redesign (2026-11-24) there is one dock, the rail: 'grid' (Grid view), 'focus' (Sidebar view) and 'solo' (the solo table, no Players section).
import { readDockLayout, readDockStore, writeDockStore } from '../frontend/src/tool-dock.js';

let checks = 0;
const same = (label, got, want) => { checks += 1; if (JSON.stringify(got) !== JSON.stringify(want)) { console.log('FAILED CHECK:', label, JSON.stringify(got), 'expected', JSON.stringify(want)); process.exit(1); } };

// a store like src/safe-store.js: every value becomes text
const kept = new Map();
const store = { get: (k) => kept.get(k) ?? null, set: (k, v) => { kept.set(k, String(v)); return true; } };
const key = 'overloaded.toolDocks';

const mine = { rail: ['stack', 'players', 'bar'], float: ['history'] };
store.set(key, writeDockStore(store.get(key), 'grid', mine));
same('a saved grid layout comes back after a reload', readDockLayout('grid', readDockStore(store.get(key)).grid), mine);

store.set(key, writeDockStore(store.get(key), 'focus', { rail: ['players', 'stack', 'history'], float: ['bar'] }));
same('saving the focus layout keeps the grid one', readDockLayout('grid', readDockStore(store.get(key)).grid), mine);
same('...and the focus one is kept too', readDockLayout('focus', readDockStore(store.get(key)).focus), { rail: ['players', 'stack', 'history'], float: ['bar'] });

same('damaged text reads as nothing stored', [readDockStore('[object Object]'), readDockStore('[1,2]'), readDockStore(null)], [{}, {}, {}]);
same('nothing stored gives the default rails', [readDockLayout('grid', undefined), readDockLayout('focus', undefined)], [{ rail: ['players', 'history', 'stack', 'bar'] }, { rail: ['players', 'history', 'stack', 'bar'] }]);
same('a console dragged out stays floating after a reload', readDockLayout('focus', { rail: ['stack', 'players', 'history'], float: ['bar'] }), { rail: ['stack', 'players', 'history'], float: ['bar'] });
same('a layout saved without the console puts it back in the rail, its default', readDockLayout('focus', { rail: ['stack', 'players', 'history'] }), { rail: ['stack', 'players', 'history', 'bar'], float: [] });

same('the solo table has no Players section: its default has none, and one in a saved layout is dropped', [readDockLayout('solo', undefined), readDockLayout('solo', { rail: ['players', 'stack'], float: ['bar'] })], [{ rail: ['history', 'stack', 'bar'] }, { rail: ['history', 'stack'], float: ['bar'] }]);

console.log(`All ${checks} tool dock checks passed.`);
