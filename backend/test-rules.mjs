// Tests for database.rules.json, run against the local Firebase emulator only
// (project id "demo-overloaded" cannot reach a real project).
// Run: npm test   (starts the emulator, runs this file, stops the emulator)
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, get, set, update, serverTimestamp } from 'firebase/database';

const env = await initializeTestEnvironment({
  projectId: 'demo-overloaded',
  database: {
    host: '127.0.0.1',
    port: 9000,
    rules: readFileSync(new URL('./database.rules.json', import.meta.url), 'utf8'),
  },
});

let checks = 0;
// A failing check prints its own label first, so a failure (or a mutation that breaks one) can be traced to a named check.
const ok = async (label, promise) => {
  try { await assertSucceeds(promise); } catch (error) { console.log('FAILED CHECK (expected to succeed):', label); throw error; }
  checks++; console.log('  ok  ', label);
};
const denied = async (label, promise) => {
  try { await assertFails(promise); } catch (error) { console.log('FAILED CHECK (expected to be denied):', label); throw error; }
  checks++; console.log('  denied', label);
};

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const LOBBY_IDLE = 30 * MINUTE;
const PLAYING_IDLE = HOUR;
// A time a client might send instead of the server's. It is deliberately 5 seconds in the past: the emulator's
// clock is this machine's clock, so a bare Date.now() sometimes equals the server's `now` to the millisecond
// and is then (correctly) accepted, which made "a client time is denied" fail on roughly 1 run in 3.
const clientTime = () => Date.now() - 5000;

// Seed a table, bypassing rules. Times are "how long ago", measured on this machine's clock,
// which the emulator also uses for `now`. `members` is a list of [uid, seat] pairs; the host is alice.
async function seed(code, { host = 'alice', created = 2 * MINUTE, active = 2 * MINUTE, status = 'lobby', seatCount = 4, members = [['alice', '1'], ['bob', '2']] } = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    const t = `tables/${code}`;
    await set(ref(db, `${t}/meta`), {
      host, createdAt: Date.now() - created, seats: seatCount, format: 'commander',
      status, idleLimit: status === 'lobby' ? LOBBY_IDLE : PLAYING_IDLE, match: 1,
    });
    await set(ref(db, `${t}/activity/lastActive`), Date.now() - active);
    for (const [uid, seat] of members) {
      await set(ref(db, `${t}/members/${uid}`), { name: uid, seat });
      await set(ref(db, `${t}/seats/${seat}`), uid);
    }
    await set(ref(db, `${t}/private/alice`), { hand: ['Island'] });
    await set(ref(db, `${t}/public/alice`), { life: 40 });
  });
}
const as = (uid) => env.authenticatedContext(uid).database();
// Joining is one write: take a seat and create your member entry.
const join = (db, code, uid, seat, entry = { name: uid, seat }) =>
  update(ref(db), { [`tables/${code}/members/${uid}`]: entry, [`tables/${code}/seats/${seat}`]: uid });
// Removes a member entry but leaves their seat held, as when a player drops out mid-game (bypasses the rules).
const dropMember = (code, uid) => env.withSecurityRulesDisabled((ctx) => set(ref(ctx.database(), `tables/${code}/members/${uid}`), null));
const alice = as('alice');
const bob = as('bob');
const carol = as('carol'); // signed in, not a member
const anon = env.unauthenticatedContext().database();

await seed('ABC123');

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
await seed('PUB111');
await denied('non-member writes a public zone under their own uid', set(ref(carol, 'tables/PUB111/public/carol'), { life: 40 }));

console.log('members');
await ok('member reads members', get(ref(alice, 'tables/ABC123/members')));
await denied('non-member reads members', get(ref(carol, 'tables/ABC123/members')));
await ok('user takes a free seat and joins', join(carol, 'ABC123', 'carol', '3'));
await denied('user adds someone else', set(ref(carol, 'tables/ABC123/members/dave'), { name: 'Dave', seat: '4' }));
await ok('member renames self', set(ref(alice, 'tables/ABC123/members/alice'), { name: 'Al', seat: '1' }));
await ok('member readies up for the current match', set(ref(alice, 'tables/ABC123/members/alice/ready'), 1));
await denied('member overwrites opponent entry', set(ref(alice, 'tables/ABC123/members/bob'), { name: 'Bobby', seat: '2' }));
await ok('member leaves and frees the seat', update(ref(bob), { 'tables/ABC123/members/bob': null, 'tables/ABC123/seats/2': null }));
const erin = as('erin');
await denied('member without name', join(erin, 'ABC123', 'erin', '4', { seat: '4', ready: 1 }));
await denied('empty name', join(erin, 'ABC123', 'erin', '4', { name: '', seat: '4' }));
await denied('name 31 characters', join(erin, 'ABC123', 'erin', '4', { name: 'x'.repeat(31), seat: '4' }));
await denied('name is a number', join(erin, 'ABC123', 'erin', '4', { name: 5, seat: '4' }));
await denied('ready is a string', join(erin, 'ABC123', 'erin', '4', { name: 'Erin', seat: '4', ready: 'yes' }));
await denied('ready is a boolean (the old shape)', join(erin, 'ABC123', 'erin', '4', { name: 'Erin', seat: '4', ready: true }));
await denied('unknown extra field', join(erin, 'ABC123', 'erin', '4', { name: 'Erin', seat: '4', junk: 1 }));
await ok('name 30 characters', join(erin, 'ABC123', 'erin', '4', { name: 'x'.repeat(30), seat: '4' }));

console.log('leaks through parent paths');
await env.withSecurityRulesDisabled(async (ctx) => {
  await set(ref(ctx.database(), 'tables/ABC123/members/bob'), { name: 'Bob', seat: '2' });
  await set(ref(ctx.database(), 'tables/ABC123/seats/2'), 'bob');
});
await denied('member reads the whole table', get(ref(bob, 'tables/ABC123')));
await denied('member reads the whole private branch', get(ref(bob, 'tables/ABC123/private')));
await denied('member lists all tables', get(ref(bob, 'tables')));
await denied('member overwrites the whole table', set(ref(bob, 'tables/ABC123'), { evil: 1 }));
await denied('multi-path update reaching opponent private',
  update(ref(bob), { 'tables/ABC123/private/alice/hand': [], 'tables/ABC123/public/bob/life': 40 }));
await denied('write outside tables', set(ref(alice, 'other/x'), 1));
await denied('read whole database', get(ref(alice, '/')));
await denied('member reads activity', get(ref(alice, 'tables/ABC123/activity')));

console.log('creating a table');
const newTable = (code, over = {}, host = 'zoe') => ({
  [`tables/${code}/meta`]: { host, createdAt: serverTimestamp(), seats: 4, format: 'commander', status: 'lobby', idleLimit: LOBBY_IDLE, match: 1, ...over },
  [`tables/${code}/activity/lastActive`]: serverTimestamp(),
  [`tables/${code}/members/${host}`]: { name: host, seat: '1' },
  [`tables/${code}/seats/1`]: host,
  [`hosts/${host}`]: code,
});
// Each creation attempt uses its own host id. A host holds one table at a time (tested further down), so
// reusing one host would make every later attempt fail for that reason and hide the guard being tested.
const create = (code, over = {}, tweak = () => {}) => {
  const host = `h${code}`;
  const t = newTable(code, over, host);
  tweak(t, host, code);
  return update(ref(as(host)), t);
};
await ok('host creates meta, heartbeat, own member entry, seat 1 and the host slot in one write', create('NEW111'));
await ok('host reads own meta afterwards', get(ref(as('hNEW111'), 'tables/NEW111/meta')));
await denied('stranger creates a table by writing a member entry alone', set(ref(carol, 'tables/NEW222/members/carol'), { name: 'Carol', seat: '1' }));
await denied('table whose host is someone else', create('NEW333', { host: 'alice' }));
await denied('createdAt is a client time', create('NEW444', { createdAt: Date.now() - 9 * HOUR }));
await denied('createdAt in the future', create('NEW445', { createdAt: Date.now() + 9 * HOUR }));
await denied('one seat', create('NEW555', { seats: 1 }));
await denied('five seats', create('NEW556', { seats: 5 }));
await denied('seats is a string', create('NEW557', { seats: '4' }));
await denied('created already playing', create('NEW666', { status: 'playing', idleLimit: PLAYING_IDLE }));
await denied('idle limit longer than the lobby allows', create('NEW777', { idleLimit: 24 * HOUR }));
await denied('lobby with the playing idle limit', create('NEW778', { idleLimit: PLAYING_IDLE }));
await denied('unknown meta field', create('NEW888', { junk: 1 }));
await denied('missing format', create('NEW889', {}, (t, h, c) => { delete t[`tables/${c}/meta`].format; }));
await denied('missing seats', create('NEW891', {}, (t, h, c) => { delete t[`tables/${c}/meta`].seats; }));
await denied('format 21 characters', create('NEW890', { format: 'x'.repeat(21) }));
await denied('heartbeat is a client time on creation', create('NEW999', {}, (t, h, c) => { t[`tables/${c}/activity/lastActive`] = clientTime(); }));
await denied('stranger overwrites the meta of a live table', set(ref(carol, 'tables/ABC123/meta'), { host: 'carol', createdAt: serverTimestamp(), seats: 4, format: 'x', status: 'lobby', idleLimit: LOBBY_IDLE }));
await denied('host creates a table without taking a seat', create('NEW892', {}, (t, h, c) => { delete t[`tables/${c}/seats/1`]; }));
await denied('host takes seat 3 on a 2-seat table', create('NEW893', { seats: 2 }, (t, h, c) => {
  delete t[`tables/${c}/seats/1`];
  t[`tables/${c}/members/${h}`].seat = '3';
  t[`tables/${c}/seats/3`] = h;
}));
await denied('host takes two seats on creation', create('NEW894', {}, (t, h, c) => { t[`tables/${c}/seats/2`] = h; }));
await denied('host puts another uid in seat 1', create('NEW895', {}, (t, h, c) => { t[`tables/${c}/seats/1`] = 'alice'; }));
await denied('a table code of 21 characters', create('X'.repeat(21)));
await denied('host creates a table without claiming the host slot', create('NEW896', {}, (t, h) => { delete t[`hosts/${h}`]; }));
// Alice really hosts ABC123, so a slot naming it passes the slot rule; only the meta rule can refuse this.
await denied('slot names a different table than the one being created', update(ref(alice), { ...newTable('NEW897', {}, 'alice'), 'hosts/alice': 'ABC123' }));

console.log('meta changes by the host');
await seed('META11');
await denied('non-host changes status', update(ref(bob, 'tables/META11/meta'), { status: 'playing', idleLimit: PLAYING_IDLE }));
await denied('host changes status but not the idle limit', update(ref(alice, 'tables/META11/meta'), { status: 'playing' }));
await denied('host changes createdAt to a client time', update(ref(alice, 'tables/META11/meta'), { createdAt: clientTime() }));
await denied('host resets createdAt to the server time (would extend the 8-hour limit)', update(ref(alice, 'tables/META11/meta'), { createdAt: serverTimestamp() }));
await denied('host changes host', update(ref(alice, 'tables/META11/meta'), { host: 'bob' }));
await ok('host starts the game with the playing idle limit', update(ref(alice, 'tables/META11/meta'), { status: 'playing', idleLimit: PLAYING_IDLE }));
await ok('host sets playing back to lobby (end match)', update(ref(alice, 'tables/META11/meta'), { status: 'lobby', idleLimit: LOBBY_IDLE, match: 2 }));
await denied('host changes the seat count after creation', update(ref(alice, 'tables/META11/meta'), { seats: 3 }));
await ok('member reads meta', get(ref(bob, 'tables/META11/meta')));
await denied('non-member reads meta', get(ref(carol, 'tables/META11/meta')));

console.log('ending a match: the host sends the table back to the lobby');
await seed('MATCH1', { status: 'playing' });
await denied('a member who is not the host ends the match', update(ref(bob, 'tables/MATCH1/meta'), { status: 'lobby', idleLimit: LOBBY_IDLE, match: 2 }));
await denied('the host ends the match but keeps the playing idle limit', update(ref(alice, 'tables/MATCH1/meta'), { status: 'lobby', match: 2 }));
// With the playing idle limit, "not lobby" passes the idle-limit pairing, so only the status check can refuse this.
await denied('the host sets the status to something else', update(ref(alice, 'tables/MATCH1/meta'), { status: 'ended', idleLimit: PLAYING_IDLE }));
await ok('the host ends the match: the table goes back to the lobby', update(ref(alice, 'tables/MATCH1/meta'), { status: 'lobby', idleLimit: LOBBY_IDLE, match: 2 }));
await ok('back in the lobby a new player can join a free seat', join(carol, 'MATCH1', 'carol', '3'));
await ok('back in the lobby a player can leave and free their seat', update(ref(bob), { 'tables/MATCH1/members/bob': null, 'tables/MATCH1/seats/2': null }));
await ok('the host starts the next match', update(ref(alice, 'tables/MATCH1/meta'), { status: 'playing', idleLimit: PLAYING_IDLE }));
await seed('MATCH2', { status: 'playing', active: 61 * MINUTE });
await denied('an expired table: the host cannot end the match', update(ref(alice, 'tables/MATCH2/meta'), { status: 'lobby', idleLimit: LOBBY_IDLE, match: 2 }));

console.log('the match counter: only ending a match raises it, and by exactly one');
await seed('CNT111');
await denied('the host changes the match number in the lobby', update(ref(alice, 'tables/CNT111/meta'), { match: 2 }));
await ok('the host starts the match', update(ref(alice, 'tables/CNT111/meta'), { status: 'playing', idleLimit: PLAYING_IDLE }));
await denied('the host changes the match number mid-match', update(ref(alice, 'tables/CNT111/meta'), { match: 2 }));
await ok('the host can still change other settings mid-match (the format)', update(ref(alice, 'tables/CNT111/meta'), { format: 'brawl' }));
await denied('ending the match without raising the match number', update(ref(alice, 'tables/CNT111/meta'), { status: 'lobby', idleLimit: LOBBY_IDLE }));
await denied('ending the match and raising the number by 2', update(ref(alice, 'tables/CNT111/meta'), { status: 'lobby', idleLimit: LOBBY_IDLE, match: 3 }));
await denied('ending the match and lowering the number', update(ref(alice, 'tables/CNT111/meta'), { status: 'lobby', idleLimit: LOBBY_IDLE, match: 0 }));
await denied('ending the match with a string match number', update(ref(alice, 'tables/CNT111/meta'), { status: 'lobby', idleLimit: LOBBY_IDLE, match: '2' }));
await ok('ending the match and raising the number by one', update(ref(alice, 'tables/CNT111/meta'), { status: 'lobby', idleLimit: LOBBY_IDLE, match: 2 }));
await ok('the host can still change other settings in the lobby (the format)', update(ref(alice, 'tables/CNT111/meta'), { format: 'commander' }));
await denied('starting the next match and changing the number', update(ref(alice, 'tables/CNT111/meta'), { status: 'playing', idleLimit: PLAYING_IDLE, match: 3 }));
await ok('starting the next match leaves the number alone', update(ref(alice, 'tables/CNT111/meta'), { status: 'playing', idleLimit: PLAYING_IDLE }));
await denied('a table created with match 2', create('NEW898', { match: 2 }));
await denied('a table created with a string match number', create('NEW899', { match: '1' }));
await denied('a table created without a match number', create('NEW900', {}, (t, h, c) => { delete t[`tables/${c}/meta`].match; }));

console.log('ready: a number, the match you are ready for');
await seed('RDY111');
await ok('a player readies up for the current match', set(ref(bob, 'tables/RDY111/members/bob/ready'), 1));
await denied('ready for a match that is not the current one', set(ref(bob, 'tables/RDY111/members/bob/ready'), 2));
await denied('ready as a boolean (the old shape)', set(ref(bob, 'tables/RDY111/members/bob/ready'), true));
await ok('a player un-readies by removing the flag', set(ref(bob, 'tables/RDY111/members/bob/ready'), null));
await seed('RDY222', { status: 'playing' });
await ok('ready for match 1', set(ref(bob, 'tables/RDY222/members/bob/ready'), 1));
await ok('the host ends the match', update(ref(alice, 'tables/RDY222/meta'), { status: 'lobby', idleLimit: LOBBY_IDLE, match: 2 }));
await denied('after the match ends, the old number is no longer a valid ready mark to write', set(ref(bob, 'tables/RDY222/members/bob/ready'), 1));
await ok('ready for the new match', set(ref(bob, 'tables/RDY222/members/bob/ready'), 2));

console.log('conceding: a player marks themselves out for the current match');
await seed('CON111', { status: 'playing' });
await ok('a player concedes', set(ref(bob, 'tables/CON111/members/bob/conceded'), 1));
await ok('conceding again changes nothing', set(ref(bob, 'tables/CON111/members/bob/conceded'), 1));
await denied('a player takes back a concession by writing another value', set(ref(bob, 'tables/CON111/members/bob/conceded'), 0));
await denied('a player takes back a concession by deleting it', set(ref(bob, 'tables/CON111/members/bob/conceded'), null));
await denied('a player rewrites their whole entry without the concession', set(ref(bob, 'tables/CON111/members/bob'), { name: 'bob', seat: '2' }));
await denied('a player concedes for someone else', set(ref(bob, 'tables/CON111/members/alice/conceded'), 1));
await ok('the host can concede too', set(ref(alice, 'tables/CON111/members/alice/conceded'), 1));
await denied('a non-member writes a conceded flag', set(ref(carol, 'tables/CON111/members/carol/conceded'), 1));
await seed('CON222', { status: 'playing' });
await denied('conceded is a string', set(ref(bob, 'tables/CON222/members/bob/conceded'), 'yes'));
await denied('conceded is a boolean (the old shape)', set(ref(bob, 'tables/CON222/members/bob/conceded'), true));
await denied('conceded for a different match number', set(ref(bob, 'tables/CON222/members/bob/conceded'), 2));
await seed('CON333');
await denied('conceding in the lobby, outside a match', set(ref(bob, 'tables/CON333/members/bob/conceded'), 1));
await seed('CON444', { status: 'playing' });
await ok('a player concedes during a match', set(ref(bob, 'tables/CON444/members/bob/conceded'), 1));
await ok('the host ends the match', update(ref(alice, 'tables/CON444/meta'), { status: 'lobby', idleLimit: LOBBY_IDLE, match: 2 }));
await ok('back in the lobby the player removes their old concession', set(ref(bob, 'tables/CON444/members/bob/conceded'), null));
await denied('and cannot concede in the lobby', set(ref(bob, 'tables/CON444/members/bob/conceded'), 2));
await ok('the host starts the next match', update(ref(alice, 'tables/CON444/meta'), { status: 'playing', idleLimit: PLAYING_IDLE }));
await denied('conceding with the old match number', set(ref(bob, 'tables/CON444/members/bob/conceded'), 1));
await ok('conceding for the new match', set(ref(bob, 'tables/CON444/members/bob/conceded'), 2));
await seed('CON666', { status: 'playing' });
await ok('a player concedes in match 1 and never clears it', set(ref(bob, 'tables/CON666/members/bob/conceded'), 1));
await ok('the host ends match 1', update(ref(alice, 'tables/CON666/meta'), { status: 'lobby', idleLimit: LOBBY_IDLE, match: 2 }));
await ok('the host starts match 2', update(ref(alice, 'tables/CON666/meta'), { status: 'playing', idleLimit: PLAYING_IDLE }));
await ok('the stale concession from match 1 does not lock the player: they concede for match 2 over it', set(ref(bob, 'tables/CON666/members/bob/conceded'), 2));
await denied('and that one is locked', set(ref(bob, 'tables/CON666/members/bob/conceded'), null));
await seed('CON777', { status: 'playing' });
await ok('a player concedes in match 1', set(ref(bob, 'tables/CON777/members/bob/conceded'), 1));
await ok('the host ends match 1', update(ref(alice, 'tables/CON777/meta'), { status: 'lobby', idleLimit: LOBBY_IDLE, match: 2 }));
await ok('the host starts match 2', update(ref(alice, 'tables/CON777/meta'), { status: 'playing', idleLimit: PLAYING_IDLE }));
await ok('the stale concession from match 1 can be removed in match 2', set(ref(bob, 'tables/CON777/members/bob/conceded'), null));
await seed('CON555', { status: 'playing', active: 61 * MINUTE });
await denied('an expired table: conceding', set(ref(bob, 'tables/CON555/members/bob/conceded'), 1));

console.log('the last player standing can end the table');
await seed('LST111', { status: 'playing' });
await denied('a non-host member ends the table while others are still in it', set(ref(bob, 'tables/LST111'), null));
await ok('the host leaves (deletes their member entry)', set(ref(alice, 'tables/LST111/members/alice'), null));
await ok('the last member remaining ends the table', set(ref(bob, 'tables/LST111'), null));
await seed('LST222', { status: 'playing', members: [['bob', '2']] });
await dropMember('LST222', 'bob');
await denied('a stranger cannot end a live table just because everyone has left', set(ref(carol, 'tables/LST222'), null));
await seed('LST333', { status: 'playing', members: [['alice', '1'], ['bob', '2'], ['carol', '3']] });
await dropMember('LST333', 'alice');
await denied('two members still in: one of them cannot end it', set(ref(carol, 'tables/LST333'), null));
await dropMember('LST333', 'bob');
await ok('then the last of three can', set(ref(carol, 'tables/LST333'), null));
for (const s of ['1', '2', '3', '4']) {
  await seed(`LON${s}`, { status: 'playing', members: [['zed', s]] });
  await ok(`a lone member holding seat ${s} (the other three seats empty) can end the table`, set(ref(as('zed'), `tables/LON${s}`), null));
}
for (const n of ['1', '2', '3', '4']) {
  const mine = n === '1' ? '2' : '1';
  await seed(`LS${n}A`, { status: 'playing', members: [['zed', mine], ['pat', n]] });
  await denied(`seat ${n}: someone still holds it, so the table cannot be ended`, set(ref(as('zed'), `tables/LS${n}A`), null));
  await seed(`LS${n}B`, { status: 'playing', members: [['zed', mine], ['pat', n]] });
  await dropMember(`LS${n}B`, 'pat');
  await ok(`seat ${n}: its holder has left, so the last member can end the table`, set(ref(as('zed'), `tables/LS${n}B`), null));
}

console.log('seats and joining');
await seed('SEAT01');
await ok('member reads seats', get(ref(alice, 'tables/SEAT01/seats')));
await denied('non-member reads seats', get(ref(carol, 'tables/SEAT01/seats')));
await ok('joining takes a free seat', join(carol, 'SEAT01', 'carol', '3'));
const dave = as('dave');
await denied('taking a seat that is already taken', join(dave, 'SEAT01', 'dave', '2'));
await denied('overwriting a taken seat without the member entry', set(ref(dave, 'tables/SEAT01/seats/3'), 'dave'));
await denied('putting someone else in a seat', update(ref(dave), { 'tables/SEAT01/seats/4': 'carol', 'tables/SEAT01/members/dave': { name: 'dave', seat: '4' } }));
await denied('seat 5', join(dave, 'SEAT01', 'dave', '5'));
await denied('seat 0', join(dave, 'SEAT01', 'dave', '0'));
await denied('member entry with no seat', update(ref(dave), { 'tables/SEAT01/members/dave': { name: 'dave' }, 'tables/SEAT01/seats/4': 'dave' }));
await denied('member entry claims a seat nobody gave them', set(ref(dave, 'tables/SEAT01/members/dave'), { name: 'dave', seat: '4' }));
await denied('member entry claims a different seat than the one taken', update(ref(dave), { 'tables/SEAT01/members/dave': { name: 'dave', seat: '3' }, 'tables/SEAT01/seats/4': 'dave' }));
await denied('a member takes a second seat', update(ref(carol), { 'tables/SEAT01/seats/4': 'carol' }));
await seed('SEAT02', { members: [['alice', '1']] });
await denied('taking two seats in one write', update(ref(dave), {
  'tables/SEAT02/members/dave': { name: 'dave', seat: '3' }, 'tables/SEAT02/seats/3': 'dave', 'tables/SEAT02/seats/4': 'dave',
}));
await denied('a member changes their seat number', set(ref(alice, 'tables/SEAT02/members/alice'), { name: 'alice', seat: '2' }));
await denied('a member deletes someone else\'s seat', set(ref(carol, 'tables/SEAT01/seats/1'), null));
await ok('leaving frees the seat in the lobby', update(ref(carol), { 'tables/SEAT01/members/carol': null, 'tables/SEAT01/seats/3': null }));
await ok('someone else can then take that seat', join(dave, 'SEAT01', 'dave', '3'));
await seed('SEAT03', { seatCount: 2 });
await denied('seat 3 on a 2-seat table', join(dave, 'SEAT03', 'dave', '3'));
await denied('seat 4 on a 2-seat table', join(dave, 'SEAT03', 'dave', '4'));
await seed('SEAT04', { seatCount: 3 });
await ok('seat 3 on a 3-seat table', join(dave, 'SEAT04', 'dave', '3'));
await denied('seat 4 on a 3-seat table', join(as('fay'), 'SEAT04', 'fay', '4'));
await seed('SEAT05', { status: 'playing' });
await denied('joining a table that has started, with a free seat', join(dave, 'SEAT05', 'dave', '3'));
await denied('taking a free seat without joining on a table that has started', set(ref(dave, 'tables/SEAT05/seats/3'), 'dave'));
await denied('leaving a started table does not free the seat', update(ref(bob), { 'tables/SEAT05/members/bob': null, 'tables/SEAT05/seats/2': null }));
await seed('SEAT06', { status: 'playing' });
await ok('a member of a started table can still rename and ready up', set(ref(bob, 'tables/SEAT06/members/bob'), { name: 'Bobby', seat: '2', ready: 1 }));

console.log('each seat number: every guard repeated for seats 1 to 4 (the four seat rules are separate copies)');
const SEATS = ['1', '2', '3', '4'];
const sam = as('sam'); // signed in, never part of any table
for (const n of SEATS) {
  await seed(`SN${n}A`, { members: [['bob', n]] });
  await denied(`seat ${n}: a taken seat cannot be taken again`, set(ref(sam, `tables/SN${n}A/seats/${n}`), 'sam'));
  await seed(`SN${n}B`, { members: [] });
  await denied(`seat ${n}: writing another uid into a free seat`, set(ref(sam, `tables/SN${n}B/seats/${n}`), 'bob'));
  await ok(`seat ${n}: a free seat in a live lobby can be taken`, set(ref(sam, `tables/SN${n}B/seats/${n}`), 'sam'));
  await seed(`SN${n}C`, { status: 'playing', members: [] });
  await denied(`seat ${n}: a stranger takes a free seat after the game started`, set(ref(sam, `tables/SN${n}C/seats/${n}`), 'sam'));
  await denied(`seat ${n}: the host takes a free seat after the game started`, set(ref(alice, `tables/SN${n}C/seats/${n}`), 'alice'));
  await seed(`SN${n}D`, { status: 'playing', members: [['bob', n]] });
  await denied(`seat ${n}: the owner frees the seat after the game started`, set(ref(bob, `tables/SN${n}D/seats/${n}`), null));
  await seed(`SN${n}E`, { members: [['bob', n]] });
  await denied(`seat ${n}: a stranger frees someone else's seat`, set(ref(sam, `tables/SN${n}E/seats/${n}`), null));
  await ok(`seat ${n}: the owner frees their own seat in the lobby`, set(ref(bob, `tables/SN${n}E/seats/${n}`), null));
  await seed(`SN${n}F`, { active: 31 * MINUTE, members: [] });
  await denied(`seat ${n}: taking a seat in a lobby idle past its limit`, set(ref(sam, `tables/SN${n}F/seats/${n}`), 'sam'));
  await seed(`SN${n}G`, { created: 8 * HOUR + MINUTE, members: [] });
  await denied(`seat ${n}: taking a seat in a lobby past 8 hours`, set(ref(sam, `tables/SN${n}G/seats/${n}`), 'sam'));
  await denied(`seat ${n}: a stranger takes a seat of a table that does not exist`, set(ref(sam, `tables/NONE${n}/seats/${n}`), 'sam'));
  for (const k of SEATS.filter((x) => x !== n)) {
    await seed(`SN${n}H${k}`, { members: [['bob', k]] });
    await denied(`seat ${n}: a member already holding seat ${k} takes this one too`, set(ref(bob, `tables/SN${n}H${k}/seats/${n}`), 'bob'));
  }
  const hostTable = newTable(`HS${n}`, {}, `host${n}`);
  delete hostTable[`tables/HS${n}/seats/1`];
  hostTable[`tables/HS${n}/members/host${n}`].seat = n;
  hostTable[`tables/HS${n}/seats/${n}`] = `host${n}`;
  await ok(`a host creating a table takes seat ${n}`, update(ref(as(`host${n}`)), hostTable));
}

console.log('a player who dropped their member entry but still holds a seat');
await seed('REJ111', { status: 'playing', members: [['bob', '2']] });
await dropMember('REJ111', 'bob');
await denied('started table: re-adding the member entry', set(ref(bob, 'tables/REJ111/members/bob'), { name: 'bob', seat: '2' }));
await seed('REJ222', { active: 31 * MINUTE, members: [['bob', '2']] });
await dropMember('REJ222', 'bob');
await denied('lobby idle past its limit: re-adding the member entry', set(ref(bob, 'tables/REJ222/members/bob'), { name: 'bob', seat: '2' }));
await seed('REJ333', { created: 8 * HOUR + MINUTE, members: [['bob', '2']] });
await dropMember('REJ333', 'bob');
await denied('lobby past 8 hours: re-adding the member entry', set(ref(bob, 'tables/REJ333/members/bob'), { name: 'bob', seat: '2' }));
await seed('REJ555', { status: 'playing', members: [['alice', '1']] });
await dropMember('REJ555', 'alice');
await denied('started table: the host re-adding their own member entry', set(ref(alice, 'tables/REJ555/members/alice'), { name: 'alice', seat: '1' }));
await seed('REJ666', { active: 31 * MINUTE, members: [['alice', '1']] });
await dropMember('REJ666', 'alice');
await denied('lobby idle past its limit: the host re-adding their own member entry', set(ref(alice, 'tables/REJ666/members/alice'), { name: 'alice', seat: '1' }));
await seed('REJ444', { members: [['bob', '2']] });
await dropMember('REJ444', 'bob');
await ok('live lobby: re-adding the member entry for the seat they hold', set(ref(bob, 'tables/REJ444/members/bob'), { name: 'bob', seat: '2' }));

console.log('heartbeat (activity/lastActive)');
await seed('BEAT11');
await ok('member writes the server time', set(ref(bob, 'tables/BEAT11/activity/lastActive'), serverTimestamp()));
await denied('second heartbeat straight after (rate cap)', set(ref(alice, 'tables/BEAT11/activity/lastActive'), serverTimestamp()));
await seed('BEAT22');
await denied('a client time', set(ref(bob, 'tables/BEAT22/activity/lastActive'), clientTime()));
await denied('a time far in the future', set(ref(bob, 'tables/BEAT22/activity/lastActive'), Date.now() + 100 * HOUR));
await denied('non-member heartbeat', set(ref(carol, 'tables/BEAT22/activity/lastActive'), serverTimestamp()));
await denied('signed-out heartbeat', set(ref(anon, 'tables/BEAT22/activity/lastActive'), serverTimestamp()));
await denied('unknown field under activity', set(ref(bob, 'tables/BEAT22/activity/junk'), 1));
await denied('heartbeat on a table that does not exist', set(ref(carol, 'tables/NOPE88/activity/lastActive'), serverTimestamp()));

console.log('expiry: lobby idle limit is 30 minutes');
await seed('IDLE11', { active: 29 * MINUTE });
await ok('lobby idle 29 minutes: member can still write', set(ref(bob, 'tables/IDLE11/members/bob/ready'), 1));
await seed('IDLE22', { active: 31 * MINUTE });
await denied('lobby idle 31 minutes: member write', set(ref(bob, 'tables/IDLE22/members/bob/ready'), 1));
await denied('lobby idle 31 minutes: join', join(carol, 'IDLE22', 'carol', '3'));
await denied('lobby idle 31 minutes: the host writes their own member entry', set(ref(alice, 'tables/IDLE22/members/alice'), { name: 'Alice', seat: '1' }));
await denied('lobby idle 31 minutes: private write', set(ref(alice, 'tables/IDLE22/private/alice/hand'), []));
await denied('lobby idle 31 minutes: public write', set(ref(alice, 'tables/IDLE22/public/alice/life'), 1));
await denied('lobby idle 31 minutes: heartbeat cannot revive it', set(ref(bob, 'tables/IDLE22/activity/lastActive'), serverTimestamp()));
await denied('lobby idle 31 minutes: host meta change', update(ref(alice, 'tables/IDLE22/meta'), { format: 'x' }));
await denied('lobby idle 31 minutes: leaving frees no seat', update(ref(bob), { 'tables/IDLE22/members/bob': null, 'tables/IDLE22/seats/2': null }));

console.log('expiry: playing idle limit is 1 hour');
await seed('PLAY11', { status: 'playing', active: 45 * MINUTE });
await ok('playing, idle 45 minutes (past the lobby limit): still alive', set(ref(alice, 'tables/PLAY11/public/alice/life'), 38));
await seed('PLAY22', { status: 'playing', active: 61 * MINUTE });
await denied('playing, idle 61 minutes: write', set(ref(alice, 'tables/PLAY22/public/alice/life'), 38));

console.log('expiry: 8 hours from creation, even when active');
await seed('LONG11', { created: 7 * HOUR + 59 * MINUTE, status: 'playing' });
await ok('7 hours 59 minutes old and active: still alive', set(ref(alice, 'tables/LONG11/public/alice/life'), 20));
await seed('LONG22', { created: 8 * HOUR + MINUTE, status: 'playing' });
await denied('8 hours 1 minute old but active a moment ago: public write', set(ref(alice, 'tables/LONG22/public/alice/life'), 20));
await denied('8 hours 1 minute old: private write', set(ref(alice, 'tables/LONG22/private/alice/hand'), []));
await denied('8 hours 1 minute old: member write', set(ref(bob, 'tables/LONG22/members/bob/ready'), 1));
await denied('8 hours 1 minute old: host meta change', update(ref(alice, 'tables/LONG22/meta'), { format: 'x' }));
await denied('8 hours 1 minute old: heartbeat', set(ref(bob, 'tables/LONG22/activity/lastActive'), serverTimestamp()));
await seed('LONG33', { created: 8 * HOUR + MINUTE });
await denied('8 hours 1 minute old lobby: join', join(carol, 'LONG33', 'carol', '3'));

console.log('code collisions: a second person creating a table at a code already in use');
const abe = as('abe'); // signed in, not part of any table
await seed('COL111', { status: 'playing' });
await denied('creating a full table at a live code', update(ref(abe), newTable('COL111', {}, 'abe')));
await denied('writing a whole new table object at a live code',
  set(ref(abe, 'tables/COL111'), { meta: { host: 'abe', createdAt: clientTime(), seats: 4, format: 'x', status: 'lobby', idleLimit: LOBBY_IDLE } }));
await denied('creating only a meta at a live code', set(ref(abe, 'tables/COL111/meta'), { host: 'abe', createdAt: serverTimestamp(), seats: 4, format: 'x', status: 'lobby', idleLimit: LOBBY_IDLE }));
await seed('COL222', { active: 2 * HOUR });
await denied('creating at an expired code that has not been deleted yet', update(ref(abe), newTable('COL222', {}, 'abe')));
await ok('deleting that expired table first', set(ref(abe, 'tables/COL222'), null));
await ok('then creating at the same code', update(ref(abe), newTable('COL222', {}, 'abe')));
await denied('the previous table is gone, but the old host cannot write to the new table', set(ref(alice, 'tables/COL222/public/alice'), { life: 40 }));
await seed('COL333', { status: 'playing' });
await denied('the host deletes the meta of their own live table', set(ref(alice, 'tables/COL333/meta'), null));
await denied('the host deletes lastActive and could then skip the heartbeat cap', set(ref(alice, 'tables/COL333/activity/lastActive'), null));
await denied('a member deletes lastActive', set(ref(bob, 'tables/COL333/activity/lastActive'), null));
await denied('deleting the whole activity node', set(ref(alice, 'tables/COL333/activity'), null));

console.log('deleting expired tables');
await seed('DEL111', { active: 31 * MINUTE });
await denied('signed-out user deletes an expired table', set(ref(anon, 'tables/DEL111'), null));
await denied('deleting only part of an expired table', set(ref(carol, 'tables/DEL111/private/alice'), null));
await ok('any signed-in user deletes an expired table', set(ref(carol, 'tables/DEL111'), null));
await seed('DEL222', { created: 9 * HOUR, status: 'playing' });
await ok('any signed-in user deletes a table past 8 hours', set(ref(carol, 'tables/DEL222'), null));
await seed('DEL333');
await denied('stranger deletes a live table', set(ref(carol, 'tables/DEL333'), null));
await denied('a member who is not the host deletes a live table', set(ref(bob, 'tables/DEL333'), null));
await denied('deleting a live table through a multi-path update', update(ref(carol), { 'tables/DEL333': null }));
await denied('joining a table that does not exist', join(carol, 'NOPE99', 'carol', '1'));

console.log('ending a table, and one table per host');
await seed('END111');
await ok('the host ends their own live table', set(ref(alice, 'tables/END111'), null));
await seed('END222', { host: 'hostX', members: [['hostX', '1'], ['bob', '2']] });
await denied('a host cannot end a table hosted by someone else', set(ref(alice, 'tables/END222'), null));
await denied('a signed-out user cannot end a table', set(ref(anon, 'tables/END222'), null));
await ok('the host ends a table that has already started', (async () => {
  await seed('END333', { host: 'hostY', status: 'playing', members: [['hostY', '1']] });
  return set(ref(as('hostY'), 'tables/END333'), null);
})());
const hostA = as('hostA');
await ok('a first table claims the host slot with it', update(ref(hostA), newTable('HT0001', {}, 'hostA')));
await ok('the host reads their own slot', get(ref(hostA, 'hosts/hostA')));
await denied('another user reads that slot', get(ref(carol, 'hosts/hostA')));
await denied('listing all host slots', get(ref(hostA, 'hosts')));
await denied('a second table without deleting the first', update(ref(hostA), newTable('HT0002', {}, 'hostA')));
await denied('a second table that deletes some other table instead', update(ref(hostA), { ...newTable('HT0002', {}, 'hostA'), 'tables/ABC123': null }));
await ok('a second table in the same write that deletes the first', update(ref(hostA), { ...newTable('HT0002', {}, 'hostA'), 'tables/HT0001': null }));
await seed('HT0010', { host: 'hostB', active: 2 * HOUR, members: [['hostB', '1']] });
await env.withSecurityRulesDisabled((ctx) => set(ref(ctx.database(), 'hosts/hostB'), 'HT0010'));
const hostB = as('hostB');
await denied('old table expired but not deleted: a new table must still delete it', update(ref(hostB), newTable('HT0011', {}, 'hostB')));
await ok('old table expired: a new table that deletes it', update(ref(hostB), { ...newTable('HT0011', {}, 'hostB'), 'tables/HT0010': null }));
await env.withSecurityRulesDisabled((ctx) => set(ref(ctx.database(), 'hosts/hostC'), 'GONE00'));
await ok('old table already gone (someone else deleted it): the slot can move on', update(ref(as('hostC')), newTable('HT0021', {}, 'hostC')));
await seed('HT0040', { host: 'hostE', members: [['hostE', '1']] });
const hostE = as('hostE');
await ok('a host with no slot claims one for a table they already host', set(ref(hostE, 'hosts/hostE'), 'HT0040'));
await ok('a host clears their own slot', set(ref(hostE, 'hosts/hostE'), null));
const hostD = as('hostD');
await denied('a slot naming a table someone else hosts', set(ref(hostD, 'hosts/hostD'), 'ABC123'));
await denied('a slot naming a table that does not exist', set(ref(hostD, 'hosts/hostD'), 'NOPE12'));
await denied('a slot value containing a slash', set(ref(hostD, 'hosts/hostD'), 'HT0040/meta'));
await denied('a slot value that is not a string', set(ref(hostD, 'hosts/hostD'), 5));
await denied('another user writes someone else\'s slot', set(ref(abe, 'hosts/hostE'), 'HT0040'));
await seed('HT0041', { host: 'hostF', members: [['hostF', '1']] });
await env.withSecurityRulesDisabled((ctx) => set(ref(ctx.database(), 'hosts/hostF'), 'HT0041'));
await denied('another user clears someone else\'s slot', set(ref(abe, 'hosts/hostF'), null));

await env.cleanup();
console.log(`All ${checks} rule checks passed.`);
