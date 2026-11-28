// Tests for the second batched rules change (2026-11-27, the 11-26 feedback step 6b), against the local emulator only:
// foil, its kind and a rotation on stored cards; a ping closed by its pinger and "I saw it"; who goes first; moving to an empty seat; the host's swap, kick and "Ready?" ping.
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, get, set, update } from 'firebase/database';

const env = await initializeTestEnvironment({
  projectId: 'demo-overloaded',
  database: { host: '127.0.0.1', port: 9000, rules: readFileSync(new URL('./database.rules.json', import.meta.url), 'utf8') },
});
let checks = 0;
const ok = async (label, promise) => { try { await assertSucceeds(promise); } catch (error) { console.log('FAILED CHECK (expected to succeed):', label); throw error; } checks++; console.log('  ok  ', label); };
const denied = async (label, promise) => { try { await assertFails(promise); } catch (error) { console.log('FAILED CHECK (expected to be denied):', label); throw error; } checks++; console.log('  denied', label); };
const MINUTE = 60 * 1000;
const ID = '2cc8a1e2-4b2a-4b1e-9c11-0123456789ab';

async function seed(code, { status = 'lobby', members = [['alice', '1'], ['bob', '2']] } = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    const t = `tables/${code}`;
    await set(ref(db, `${t}/meta`), { host: 'alice', createdAt: Date.now() - 2 * MINUTE, seats: 4, format: 'commander', status, idleLimit: (status === 'lobby' ? 30 : 60) * MINUTE, match: 1 });
    await set(ref(db, `${t}/activity/lastActive`), Date.now() - MINUTE);
    for (const [uid, seat] of members) { await set(ref(db, `${t}/members/${uid}`), { name: uid, seat }); await set(ref(db, `${t}/seats/${seat}`), uid); }
  });
}
const as = (uid) => env.authenticatedContext(uid).database();
const alice = as('alice'); const bob = as('bob'); const carol = as('carol'); const dave = as('dave');

console.log('cards: foil, its kind, rotation');
await seed('CARD01', { status: 'playing' });
const card = (extra) => ({ u: 'c1', i: ID, n: 'Island', ...extra });
await ok('a foil card with its kind is stored', set(ref(alice, 'tables/CARD01/public/alice/battlefield'), [card({ fo: 1, lk: 'etched' })]));
await ok('a card rotated 90, 180 or 270 degrees is stored', set(ref(alice, 'tables/CARD01/public/alice/battlefield'), [card({ rt: 1 }), { ...card({ rt: 3 }), u: 'c2' }]));
await ok('a foil card in a hidden list too', set(ref(alice, 'tables/CARD01/private/alice/hand'), [card({ fo: 1 })]));
await denied('foil is only 1', set(ref(alice, 'tables/CARD01/public/alice/battlefield'), [card({ fo: true })]));
await denied('a kind is a short lowercase word', set(ref(alice, 'tables/CARD01/public/alice/battlefield'), [card({ lk: 'Etched Foil!' })]));
await denied('a rotation is 1, 2 or 3', set(ref(alice, 'tables/CARD01/public/alice/battlefield'), [card({ rt: 4 })]));

console.log('pings: closed by the pinger, seen by the others');
await ok('the pinger closes the ping for everyone', set(ref(alice, 'tables/CARD01/public/alice/ping'), { k: 5, card: card({ fo: 1 }), x: 1 }));
await denied('a ping closed is marked only with 1', set(ref(alice, 'tables/CARD01/public/alice/ping'), { k: 5, card: card(), x: 'yes' }));
await ok('Bob says he saw Alice’s ping 5', set(ref(bob, 'tables/CARD01/public/bob/ack/alice'), 5));
await denied('...not for someone who is not at the table', set(ref(bob, 'tables/CARD01/public/bob/ack/carol'), 5));
await denied('...not on Alice’s branch', set(ref(bob, 'tables/CARD01/public/alice/ack/bob'), 5));
await denied('...and only with a number', set(ref(bob, 'tables/CARD01/public/bob/ack/alice'), 'seen'));

console.log('who goes first');
await seed('FIRST1');
await ok('the host picks Random', set(ref(alice, 'tables/FIRST1/meta/first'), 'random'));
await ok('the host picks seat 3', set(ref(alice, 'tables/FIRST1/meta/first'), '3'));
await ok('the host writes the opening seat', set(ref(alice, 'tables/FIRST1/meta/opener'), '2'));
await denied('the opening seat is a seat', set(ref(alice, 'tables/FIRST1/meta/opener'), 'random'));
await denied('a player who is not the host cannot pick', set(ref(bob, 'tables/FIRST1/meta/first'), '2'));

console.log('moving to an empty seat');
await seed('SEAT01');
const move = (db, uid, from, to) => update(ref(db), { [`tables/SEAT01/seats/${from}`]: null, [`tables/SEAT01/seats/${to}`]: uid, [`tables/SEAT01/members/${uid}/seat`]: to });
await ok('Bob moves from seat 2 to the empty seat 4', move(bob, 'bob', '2', '4'));
await denied('Bob cannot move onto Alice’s seat', move(bob, 'bob', '4', '1'));
await denied('Bob cannot change his seat without the seat slot', set(ref(bob, 'tables/SEAT01/members/bob/seat'), '3'));
await denied('Bob cannot keep his old slot while taking a new one', update(ref(bob), { 'tables/SEAT01/seats/3': 'bob', 'tables/SEAT01/members/bob/seat': '3' }));
await seed('SEAT02', { status: 'playing' });
await denied('nobody moves during a match', update(ref(bob), { 'tables/SEAT02/seats/2': null, 'tables/SEAT02/seats/4': 'bob', 'tables/SEAT02/members/bob/seat': '4' }));

console.log('the host swaps two players');
await seed('SWAP01', { members: [['alice', '1'], ['bob', '2'], ['carol', '3']] });
const swap = (db) => update(ref(db), { 'tables/SWAP01/seats/2': 'carol', 'tables/SWAP01/seats/3': 'bob', 'tables/SWAP01/members/bob/seat': '3', 'tables/SWAP01/members/carol/seat': '2' });
await denied('a player who is not the host cannot swap', swap(bob));
await ok('the host swaps Bob and Carol', swap(alice));
await denied('the host cannot put one player in two seats', update(ref(alice), { 'tables/SWAP01/seats/2': 'bob', 'tables/SWAP01/members/carol/seat': '3' }));
await denied('the host cannot change a seat to one whose slot names someone else', set(ref(alice, 'tables/SWAP01/members/bob/seat'), '2'));
await denied('the host cannot change a name', set(ref(alice, 'tables/SWAP01/members/bob/name'), 'Robert'));
await ok('the host moves Carol into the empty seat 4', update(ref(alice), { 'tables/SWAP01/seats/2': null, 'tables/SWAP01/seats/4': 'carol', 'tables/SWAP01/members/carol/seat': '4' }));
await denied('the host cannot free a seat whose player still sits there', set(ref(alice, 'tables/SWAP01/seats/3'), null));

console.log('the host removes a player');
await seed('KICK01');
const kick = (db) => update(ref(db), { 'tables/KICK01/members/bob': null, 'tables/KICK01/seats/2': null, 'tables/KICK01/kicked/bob': true });
await denied('a player who is not the host cannot remove anyone', update(ref(bob), { 'tables/KICK01/members/alice': null, 'tables/KICK01/seats/1': null }));
await ok('the host removes Bob, frees his seat and keeps him out', kick(alice));
await denied('Bob, removed, can no longer read the members (his page shows he was removed)', get(ref(bob, 'tables/KICK01/members')));
await ok('Bob can read his own removed mark (his page says he was removed, not that the table closed)', get(ref(bob, 'tables/KICK01/kicked/bob')));
await denied('...but not anyone else’s', get(ref(bob, 'tables/KICK01/kicked/carol')));
await denied('Bob cannot join again', update(ref(bob), { 'tables/KICK01/members/bob': { name: 'bob', seat: '2' }, 'tables/KICK01/seats/2': 'bob' }));
await ok('someone else can take the seat', update(ref(dave), { 'tables/KICK01/members/dave': { name: 'dave', seat: '2' }, 'tables/KICK01/seats/2': 'dave' }));
await denied('the host cannot remove himself this way', set(ref(alice, 'tables/KICK01/kicked/alice'), true));
await seed('KICK02', { status: 'playing' });
await denied('nobody is removed during a match', update(ref(alice), { 'tables/KICK02/members/bob': null, 'tables/KICK02/seats/2': null, 'tables/KICK02/kicked/bob': true }));

console.log('"Ready?"');
await seed('NUDGE1');
await ok('the host asks Bob', set(ref(alice, 'tables/NUDGE1/nudge/bob'), Date.now()));
await ok('Bob reads it', get(ref(bob, 'tables/NUDGE1/nudge')));
await denied('Bob cannot ask anyone', set(ref(bob, 'tables/NUDGE1/nudge/alice'), Date.now()));
await denied('the host cannot ask someone not at the table', set(ref(alice, 'tables/NUDGE1/nudge/carol'), Date.now()));
await denied('a stranger cannot read it', get(ref(carol, 'tables/NUDGE1/nudge')));

console.log('the Shared view: anyone taps any card and changes anyone’s life (2026-11-26 feedback, step 7)');
async function sharedTable(code, view) {
  await seed(code, { status: 'playing' });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    if (view) await set(ref(db, `tables/${code}/meta/view`), view);
    await set(ref(db, `tables/${code}/public/alice`), { life: 40, match: 1, battlefield: [{ u: 'c1', i: ID, n: 'Island' }] });
  });
}
await sharedTable('SHARE1', 'shared');
await ok('Bob taps Alice’s card', set(ref(bob, 'tables/SHARE1/public/alice/battlefield/0/x'), 1));
await ok('...and untaps it', set(ref(bob, 'tables/SHARE1/public/alice/battlefield/0/x'), null));
await denied('Bob cannot tap a card that is not there', set(ref(bob, 'tables/SHARE1/public/alice/battlefield/5/x'), 1));
await ok('Bob sets Alice’s life', set(ref(bob, 'tables/SHARE1/public/alice/life'), 37));
await denied('...but not to junk', set(ref(bob, 'tables/SHARE1/public/alice/life'), 'lots'));
await denied('Bob cannot write anything else of Alice’s', set(ref(bob, 'tables/SHARE1/public/alice/battlefield/0/n'), 'Mox'));
await denied('a stranger cannot tap it', set(ref(carol, 'tables/SHARE1/public/alice/battlefield/0/x'), 1));
await sharedTable('SHARE2', 'grid');
await denied('in Grid view Bob cannot tap Alice’s card', set(ref(bob, 'tables/SHARE2/public/alice/battlefield/0/x'), 1));
await denied('...nor change her life', set(ref(bob, 'tables/SHARE2/public/alice/life'), 37));
await env.withSecurityRulesDisabled(async (ctx) => { await set(ref(ctx.database(), 'tables/SHARE1/meta/view'), 'shared'); });
await ok('a card can be placed in the far right column, 229, of the wider table', set(ref(bob, 'tables/SHARE1/plane/1/c1'), { x: 229, y: 60, z: 1, by: 'bob', m: 1 }));

await env.cleanup();
console.log(`All ${checks} batch-2 rule checks passed.`);
