// Checks shared/view-help.mjs: the first-time help of each table view.
import assert from 'node:assert/strict';
import { HELP, VIEWS, VIEW_TITLES, readSeen, writeSeen, shouldShow, markSeen, unmarkSeen } from '../shared/view-help.mjs';
import { ACTIONS } from '../shared/keybinds.mjs';

let checks = 0;
const check = (name, fn) => { fn(); checks += 1; };

check('every view has a title and a few short lines', () => { for (const view of VIEWS) { assert.ok(VIEW_TITLES[view]); assert.ok(HELP[view].lines.length >= 4 && HELP[view].lines.length <= 8); for (const [what, does] of HELP[view].lines) assert.ok(what.length <= 25 && does.length <= 40, `${what}: ${does}`); } });
check('the keys it names are the default keys', () => { const key = (id) => ACTIONS.find((a) => a.id === id).defaults; assert.deepEqual(key('tap'), ['e', 'q']); assert.equal(key('draw')[0], 'd'); assert.equal(key('settings')[0], 'tab'); });
check('nothing stored, or junk, shows every help', () => { for (const text of [null, '', 'x', '{}', '[1]']) assert.deepEqual(readSeen(text), []); });
check('a view put away is not shown again, the others are', () => { const seen = markSeen([], 'grid'); assert.equal(shouldShow(seen, 'grid'), false); assert.equal(shouldShow(seen, 'solo'), true); });
check('kept and read back in the same order', () => { assert.deepEqual(readSeen(writeSeen(markSeen(markSeen([], 'shared'), 'solo'))), ['solo', 'shared']); });
check('an unknown view is never shown and never stored', () => { assert.equal(shouldShow([], 'party'), false); assert.deepEqual(markSeen([], 'party'), []); });
check('the switch in About shows a view again', () => { assert.equal(shouldShow(unmarkSeen(['grid', 'solo'], 'grid'), 'grid'), true); });

console.log(`All view help checks passed (${checks}).`);
