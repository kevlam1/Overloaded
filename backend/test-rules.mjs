// Tests for database.rules.json, run against the local Firebase emulator only
// (project id "demo-overloaded" cannot reach a real project).
// Run: npm test   (starts the emulator, runs this file, stops the emulator)
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, get, set, update } from 'firebase/database';

const env = await initializeTestEnvironment({
  projectId: 'demo-overloaded',
  database: {
    host: '127.0.0.1',
    port: 9000,
    rules: readFileSync(new URL('./database.rules.json', import.meta.url), 'utf8'),
  },
});

let checks = 0;
const ok = async (label, promise) => { await assertSucceeds(promise); checks++; console.log('  ok  ', label); };
const denied = async (label, promise) => { await assertFails(promise); checks++; console.log('  denied', label); };

// Seed a table with two members, bypassing rules.
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.database();
  await set(ref(db, 'tables/ABC123/members/alice'), { name: 'Alice' });
  await set(ref(db, 'tables/ABC123/members/bob'), { name: 'Bob' });
  await set(ref(db, 'tables/ABC123/private/alice'), { hand: ['Island'] });
  await set(ref(db, 'tables/ABC123/public/alice'), { life: 40 });
});

const alice = env.authenticatedContext('alice').database();
const bob = env.authenticatedContext('bob').database();
const carol = env.authenticatedContext('carol').database(); // signed in, not a member
const anon = env.unauthenticatedContext().database();

console.log('private branch');
await ok('owner reads own private', get(ref(alice, 'tables/ABC123/private/alice')));
await denied('opponent reads private', get(ref(bob, 'tables/ABC123/private/alice')));
await denied('non-member reads private', get(ref(carol, 'tables/ABC123/private/alice')));
await denied('signed-out reads private', get(ref(anon, 'tables/ABC123/private/alice')));
await ok('owner writes own private', set(ref(alice, 'tables/ABC123/private/alice/hand'), ['Island', 'Swamp']));
await denied('opponent writes private', set(ref(bob, 'tables/ABC123/private/alice/hand'), []));
await denied('non-member writes own private', set(ref(carol, 'tables/ABC123/private/carol'), { hand: [] }));

console.log('public zones');
await ok('member reads public', get(ref(bob, 'tables/ABC123/public/alice')));
await denied('non-member reads public', get(ref(carol, 'tables/ABC123/public/alice')));
await ok('owner writes own public', set(ref(alice, 'tables/ABC123/public/alice/life'), 39));
await denied('opponent writes public', set(ref(bob, 'tables/ABC123/public/alice/life'), 0));

console.log('members');
await ok('member reads members', get(ref(alice, 'tables/ABC123/members')));
await denied('non-member reads members', get(ref(carol, 'tables/ABC123/members')));
await ok('user adds self as member', set(ref(carol, 'tables/ABC123/members/carol'), { name: 'Carol' }));
await denied('user adds someone else', set(ref(carol, 'tables/ABC123/members/dave'), { name: 'Dave' }));
await ok('member renames self', set(ref(alice, 'tables/ABC123/members/alice'), { name: 'Al' }));
await ok('member readies up', set(ref(alice, 'tables/ABC123/members/alice/ready'), true));
await denied('member overwrites opponent entry', set(ref(alice, 'tables/ABC123/members/bob'), { name: 'Bobby' }));
await ok('member leaves', set(ref(bob, 'tables/ABC123/members/bob'), null));
const erin = env.authenticatedContext('erin').database();
await denied('member without name', set(ref(erin, 'tables/ABC123/members/erin'), { ready: true }));
await denied('empty name', set(ref(erin, 'tables/ABC123/members/erin'), { name: '' }));
await denied('name 31 characters', set(ref(erin, 'tables/ABC123/members/erin'), { name: 'x'.repeat(31) }));
await denied('name is a number', set(ref(erin, 'tables/ABC123/members/erin'), { name: 5 }));
await denied('ready is not a boolean', set(ref(erin, 'tables/ABC123/members/erin'), { name: 'Erin', ready: 'yes' }));
await denied('unknown extra field', set(ref(erin, 'tables/ABC123/members/erin'), { name: 'Erin', junk: 1 }));
await ok('name 30 characters', set(ref(erin, 'tables/ABC123/members/erin'), { name: 'x'.repeat(30) }));

console.log('leaks through parent paths');
// Re-add bob so the opponent checks below still have a second member.
await env.withSecurityRulesDisabled((ctx) => set(ref(ctx.database(), 'tables/ABC123/members/bob'), { name: 'Bob' }));
await denied('member reads the whole table', get(ref(bob, 'tables/ABC123')));
await denied('member reads the whole private branch', get(ref(bob, 'tables/ABC123/private')));
await denied('member lists all tables', get(ref(bob, 'tables')));
await denied('member overwrites the whole table', set(ref(bob, 'tables/ABC123'), { evil: 1 }));
await denied('multi-path update reaching opponent private',
  update(ref(bob), { 'tables/ABC123/private/alice/hand': [], 'tables/ABC123/public/bob/life': 40 }));
await denied('write outside tables', set(ref(alice, 'other/x'), 1));

console.log('root');
await denied('read whole database', get(ref(alice, '/')));

await env.cleanup();
console.log(`All ${checks} rule checks passed.`);
