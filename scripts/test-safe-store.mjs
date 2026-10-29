// Tests for frontend/src/safe-store.js: browser storage that never throws, even when storage is broken in the ways
// real browsers break it (a SecurityError on access, a quota error on write, no storage at all).
import { makeSafeStore } from '../frontend/src/safe-store.js';

let checks = 0;
function same(label, actual, expected) {
  checks++;
  const a = JSON.stringify(actual); const e = JSON.stringify(expected);
  if (a !== e) { console.error(`FAILED: ${label}: expected ${e}, got ${a}`); process.exit(1); }
}
const memory = () => { const data = new Map(); return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => { data.set(k, String(v)); }, removeItem: (k) => { data.delete(k); } }; };
const securityError = () => { throw new DOMException('The operation is insecure.', 'SecurityError'); };
const quotaError = () => { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); };

// Working storage behaves like storage
{ const s = makeSafeStore(() => memory());
  same('a missing key reads as null', s.get('x'), null); }
{ const m = memory(); const s = makeSafeStore(() => m);
  same('set reports success', s.set('name', 'Kevin'), true);
  same('and the value comes back', s.get('name'), 'Kevin');
  same('a non-string value is stored as text', s.set('n', 42) && s.get('n'), '42');
  same('remove reports success', s.remove('name'), true);
  same('and the value is gone', s.get('name'), null);
  same('removing a key that is not there is fine', s.remove('never'), true);
  same('an empty string is a real value, not null', s.set('e', '') && s.get('e'), ''); }

// Storage implementations differ: some answer undefined for a missing key, and some keep exactly what they are given
{ const s = makeSafeStore(() => ({ getItem: () => undefined, setItem() {}, removeItem() {} }));
  same('a storage that answers undefined for a missing key still reads as null', s.get('x'), null); }
{ const seen = []; const s = makeSafeStore(() => ({ getItem: () => null, setItem: (k, v) => seen.push([k, typeof v, v]), removeItem() {} }));
  s.set('a', 42); s.set('b', true); s.set('c', null);
  same('values reach the storage as text (a real store would turn them into text itself)', seen, [['a', 'string', '42'], ['b', 'string', 'true'], ['c', 'string', 'null']]); }

// Reading the storage property itself throws (Firefox and Safari with blocked site data)
{ const s = makeSafeStore(securityError);
  same('reading when the storage object cannot be reached gives null, not a throw', s.get('x'), null);
  same('writing gives false, not a throw', s.set('x', 'y'), false);
  same('removing gives false, not a throw', s.remove('x'), false); }

// The storage object exists but every method throws (a full store, or private mode on older Safari)
{ const broken = { getItem: securityError, setItem: quotaError, removeItem: securityError };
  const s = makeSafeStore(() => broken);
  same('a throwing getItem gives null', s.get('x'), null);
  same('a quota error on setItem gives false', s.set('x', 'y'), false);
  same('a throwing removeItem gives false', s.remove('x'), false); }

// Storage that is missing altogether
{ const s = makeSafeStore(() => undefined);
  same('undefined storage: get gives null', s.get('x'), null);
  same('undefined storage: set gives false', s.set('x', 'y'), false);
  same('undefined storage: remove gives false', s.remove('x'), false); }
{ const s = makeSafeStore(() => null);
  same('null storage does not throw either', [s.get('x'), s.set('x', 'y'), s.remove('x')], [null, false, false]); }

// Storage that breaks after working (it fills up, or the user changes a setting)
{ let broken = false; const m = memory();
  const s = makeSafeStore(() => (broken ? securityError() : m));
  same('works at first', s.set('a', '1') && s.get('a'), '1');
  broken = true;
  same('and then fails safely', [s.get('a'), s.set('a', '2'), s.remove('a')], [null, false, false]);
  broken = false;
  same('and recovers when it works again (nothing was cached wrongly)', s.get('a'), '1'); }

// Each call asks for the storage again: a throwing getter is retried, not remembered
{ let calls = 0; const s = makeSafeStore(() => { calls++; return securityError(); });
  s.get('a'); s.set('a', 'b'); s.remove('a');
  same('every call asks for the storage itself', calls, 3); }

// With no argument it uses the global storage, and a Node environment has none: that must not throw
{ const s = makeSafeStore();
  same('the default (no global localStorage here) is safe', [s.get('x'), s.set('x', 'y'), s.remove('x')], [null, false, false]); }

// The values are never altered
{ const m = memory(); const s = makeSafeStore(() => m);
  const odd = ' spaced  and\ttabbed \n';
  s.set('odd', odd);
  same('the stored text comes back exactly', s.get('odd'), odd); }

console.log(`All ${checks} safe storage checks passed.`);
