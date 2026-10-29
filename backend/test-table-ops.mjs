// Runs the page's own table logic (shared/table-ops.mjs, the same code the lobby page uses) against the REAL rules
// file in the local emulator. test-rules.mjs proves what the rules allow; this proves the page's code does the right
// thing with those rules: create, join, rejoin, replace an old table, a code collision, a full or started table.
// Run: npm test   (the runner starts the emulator, runs this and test-rules.mjs, stops the emulator)
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { ref, get, set, update, onValue, onDisconnect, goOffline, goOnline, serverTimestamp } from 'firebase/database';
import { createTableOps, TableUnavailableError } from '../shared/table-ops.mjs';

const env = await initializeTestEnvironment({
  projectId: 'demo-overloaded',
  database: { host: '127.0.0.1', port: 9000, rules: readFileSync(new URL('./database.rules.json', import.meta.url), 'utf8') },
});

let checks = 0;
function check(label, condition, detail = '') {
  if (!condition) { console.log('FAILED CHECK:', label, detail); throw new Error(`Check failed: ${label} ${detail}`); }
  checks++; console.log('  ok  ', label);
}
async function throwsWith(label, promise, errorName) {
  try { await promise; } catch (error) { check(label, errorName ? error.name === errorName : true, `got ${error.name}: ${error.message}`); return error; }
  check(label, false, 'it did not throw');
}

const sdk = { ref, get, update, onValue, onDisconnect, serverTimestamp };
// One "person": their own signed-in database connection and the page logic running as them.
function person(uid, makeCode) {
  const db = env.authenticatedContext(uid).database();
  return { uid, db, ops: createTableOps({ sdk, db, getUid: async () => uid, makeCode }) };
}
// withSecurityRulesDisabled throws away what its callback returns, so keep the result ourselves.
const admin = async (fn) => {
  let result;
  await env.withSecurityRulesDisabled(async (ctx) => { result = await fn(ctx.database()); });
  return result;
};
const readAdmin = (path) => admin(async (db) => (await get(ref(db, path))).val());
// Reads one thing as one person; resolves to 'denied' if the rules refuse the read.
const readAs = async (p, path) => { try { return (await get(ref(p.db, path))).val(); } catch { return 'denied'; } };

console.log('create');
const ann = person('ann');
check('a new person has no table to warn about', (await ann.ops.findMyTable()) === null);
const made = await ann.ops.createTable({ name: '  Ann  ', seats: 3 });
check('create returns a valid 6-character code, seat 1, nothing replaced', /^[A-Z2-9]{6}$/.test(made.code) && made.seat === '1' && made.replaced === null, JSON.stringify(made));
const meta = await readAdmin(`tables/${made.code}/meta`);
check('meta: host, seats 3, lobby, 30-minute limit, match 1', meta.host === 'ann' && meta.seats === 3 && meta.status === 'lobby' && meta.idleLimit === 1800000 && meta.match === 1, JSON.stringify(meta));
check('meta.createdAt is the server clock, not a client time', Math.abs(meta.createdAt - Date.now()) < 60000);
check('the name was cleaned (trimmed) and the host holds seat 1', (await readAdmin(`tables/${made.code}/members/ann`)).name === 'Ann' && (await readAdmin(`tables/${made.code}/seats/1`)) === 'ann');
check('the host slot points at the new table', (await readAdmin('hosts/ann')) === made.code);
check('findMyTable now finds it with 1 player, still open', JSON.stringify(await ann.ops.findMyTable()) === JSON.stringify({ code: made.code, players: 1, expired: false }));
await throwsWith('create with 5 seats is refused before any write', ann.ops.createTable({ name: 'Ann', seats: 5 }));
await throwsWith('create with an empty name is refused before any write', ann.ops.createTable({ name: '   ', seats: 2 }));
check('those two refusals left the table alone', (await ann.ops.findMyTable()).code === made.code);

console.log('join');
const bo = person('bo');
const cy = person('cy');
const di = person('di');
const joinedBo = await bo.ops.joinTable({ code: made.code, name: 'Bo' });
check('the first joiner gets seat 2', joinedBo.seat === '2' && joinedBo.rejoined === false);
const joinedCy = await cy.ops.joinTable({ code: made.code, name: 'Cy' });
check('the next joiner gets seat 3', joinedCy.seat === '3');
await throwsWith('a joiner when all 3 seats are taken is told the table is unavailable', di.ops.joinTable({ code: made.code, name: 'Di' }), 'TableUnavailableError');
check('the refused joiner left no member entry or seat behind', (await readAdmin(`tables/${made.code}/members/di`)) === null && (await readAdmin(`tables/${made.code}/seats/4`)) === null);
const again = await bo.ops.joinTable({ code: made.code, name: 'Bobby' });
check('joining again from the same person is a rejoin: same seat, name unchanged', again.rejoined === true && again.seat === '2' && (await readAdmin(`tables/${made.code}/members/bo`)).name === 'Bo');
check('rejoinTable finds a member and returns null for an outsider', (await bo.ops.rejoinTable(made.code))?.seat === '2' && (await di.ops.rejoinTable(made.code)) === null);
check('rejoinTable on a malformed code is null without a request', (await bo.ops.rejoinTable('nope')) === null);
await throwsWith('joining a malformed code is refused', bo.ops.joinTable({ code: 'abc', name: 'Bo' }));
await throwsWith('joining a table that does not exist is "unavailable"', di.ops.joinTable({ code: 'ZZZZZZ', name: 'Di' }), 'TableUnavailableError');
check('findMyTable counts all 3 players', (await ann.ops.findMyTable()).players === 3);

console.log('who can see what, as the page sees it');
check('a member can read the members list', Object.keys(await readAs(bo, `tables/${made.code}/members`)).length === 3);
check('an outsider cannot read the members list', (await readAs(di, `tables/${made.code}/members`)) === 'denied');
check('the host slot of someone else is not readable', (await readAs(bo, 'hosts/ann')) === 'denied');

console.log('watching the players');
const seen = [];
let watchError = null;
const stop = bo.ops.watchMembers(made.code, (members, error) => { if (error) watchError = error; else seen.push(Object.keys(members).sort().join(',')); });
const waitFor = async (condition) => { for (let i = 0; i < 100 && !condition(); i++) await new Promise((r) => setTimeout(r, 50)); };
await waitFor(() => seen.length >= 1);
check('the watcher gets the current players first', seen[0] === 'ann,bo,cy', seen.join(' | '));
await set(ref(cy.db, `tables/${made.code}/members/cy`), null); // Cy leaves (a member may delete their own entry)
await waitFor(() => seen.length >= 2);
check('the watcher is told when a player leaves', seen[seen.length - 1] === 'ann,bo', seen.join(' | '));
stop();
await set(ref(ann.db, `tables/${made.code}/members/ann/name`), 'Ann2');
await new Promise((r) => setTimeout(r, 300));
check('after stopping, the watcher hears nothing more and saw no error', seen.length === 2 && watchError === null);
const stranger = person('stranger');
let strangerResult = 'no callback';
const stopStranger = stranger.ops.watchMembers(made.code, (members, error) => { strangerResult = error ? 'error' : 'members'; });
await waitFor(() => strangerResult !== 'no callback');
check('an outsider watching gets an error callback, not a list', strangerResult === 'error', strangerResult);
stopStranger();

console.log('a table that has started, expired or closed');
await admin((db) => set(ref(db, `tables/${made.code}/meta/status`), 'playing'));
await admin((db) => set(ref(db, `tables/${made.code}/meta/idleLimit`), 3600000));
await throwsWith('a new player cannot join a table that has started', di.ops.joinTable({ code: made.code, name: 'Di' }), 'TableUnavailableError');
// Cy's member entry went but the seat is still held (a mid-match leave or a crash), so Cy may come back to that seat.
const cyBack = await cy.ops.joinTable({ code: made.code, name: 'Cy' });
check('a player who dropped out of a started table comes back to their own seat', cyBack.rejoined === true && cyBack.seat === '3', JSON.stringify(cyBack));
check('and is a member again', (await readAdmin(`tables/${made.code}/members/cy`))?.seat === '3');
await throwsWith('a stranger cannot take a seat that is held for someone, even with the table started', person('eli').ops.joinTable({ code: made.code, name: 'Eli' }), 'TableUnavailableError');
check('an existing member rejoins a started table', (await bo.ops.joinTable({ code: made.code, name: 'Bo' })).rejoined === true);

console.log('replacing the host\'s old table');
const before = await ann.ops.findMyTable();
const second = await ann.ops.createTable({ name: 'Ann', seats: 2 });
check('creating a second table reports the old code as replaced', second.replaced === made.code && second.code !== made.code);
check('the old table is gone in the same write', (await readAdmin(`tables/${made.code}`)) === null);
check('the old table\'s players can no longer rejoin it', (await bo.ops.rejoinTable(made.code)) === null);
check('the host slot moved to the new table, which has one player', (await readAdmin('hosts/ann')) === second.code && (await ann.ops.findMyTable()).players === 1 && before.players === 3);
check('the old table\'s seat claims are gone with it', (await readAdmin(`tables/${made.code}/seats`)) === null);

console.log('a stale host slot (its table was deleted)');
await admin((db) => set(ref(db, `tables/${second.code}`), null));
check('findMyTable returns null, so the page shows no false warning', (await ann.ops.findMyTable()) === null);
const third = await ann.ops.createTable({ name: 'Ann', seats: 4 });
check('creating again works and still reports the slot\'s old code as replaced', third.replaced === second.code);
check('the stale slot now points at the new table', (await readAdmin('hosts/ann')) === third.code);

console.log('a code that is already in use');
const taken = third.code;
const codes = [taken, taken, 'FRESH2'];
const eve = person('eve', () => codes.shift() ?? 'LATER3');
const evesTable = await eve.ops.createTable({ name: 'Eve', seats: 2 });
check('create skips codes that are taken and uses the next one', evesTable.code === 'FRESH2' && codes.length === 0);
const takenMeta = await readAdmin(`tables/${taken}/meta`);
check('the table that owned the code was not touched', takenMeta.host === 'ann' && (await readAdmin(`tables/${taken}/members/ann`)).name === 'Ann');
check('eve\'s failed attempts left nothing behind', (await readAdmin(`tables/${taken}/members/eve`)) === null && (await readAdmin('hosts/eve')) === 'FRESH2');
const unlucky = person('unlucky', () => taken);
const gaveUp = await throwsWith('five collisions in a row give a plain error, not a hang', unlucky.ops.createTable({ name: 'U', seats: 2 }));
check('that error is in words, and the person has no slot', /try again/i.test(gaveUp.message) && (await readAdmin('hosts/unlucky')) === null, gaveUp.message);

console.log('an expired old table is replaced too');
await admin(async (db) => { await set(ref(db, `tables/${evesTable.code}/meta/createdAt`), Date.now() - 9 * 3600000); });
const eve2 = await eve.ops.createTable({ name: 'Eve', seats: 2 });
check('replacing works when the old table has passed 8 hours', eve2.replaced === evesTable.code && (await readAdmin(`tables/${evesTable.code}`)) === null);

console.log('host handover');
const hana = person('hana');
const ivo = person('ivo');
const jon = person('jon');
const kai = person('kai');
const hanaTable = await hana.ops.createTable({ name: 'Hana', seats: 3 });
const HT = hanaTable.code;
await ivo.ops.joinTable({ code: HT, name: 'Ivo' }); // seat 2
await jon.ops.joinTable({ code: HT, name: 'Jon' }); // seat 3
await throwsWith('a player who is not the host cannot hand over the table', ivo.ops.passHost(HT, 'jon'), 'FlowRefusedError');
await throwsWith('the host cannot hand the table to someone who is not at it', hana.ops.passHost(HT, 'zed'), 'FlowRefusedError');
await throwsWith('the host cannot hand the table to themselves', hana.ops.passHost(HT, 'hana'), 'FlowRefusedError');
await hana.ops.passHost(HT, 'ivo');
check('the table now belongs to the new host', (await readAdmin(`tables/${HT}/meta/host`)) === 'ivo');
check('the old host\'s slot is cleared and the new host has not claimed theirs yet', (await readAdmin('hosts/hana')) === null && (await readAdmin('hosts/ivo')) === null);
await ivo.ops.claimHostSlot(HT);
check('the new host claims their host slot', (await readAdmin('hosts/ivo')) === HT);
await ivo.ops.claimHostSlot(HT);
check('claiming the slot again is harmless', (await readAdmin('hosts/ivo')) === HT);
await throwsWith('the former host cannot claim the slot', hana.ops.claimHostSlot(HT), 'FlowRefusedError');
await throwsWith('the former host can no longer start the match', hana.ops.startMatch(HT), 'FlowRefusedError');
check('findMyTable finds the table for the new host and not for the old one', (await ivo.ops.findMyTable())?.code === HT && (await hana.ops.findMyTable()) === null);

console.log('a host who leaves hands the table to the lowest seat');
const left = await ivo.ops.leaveTable(HT);
check('the table goes to the player in the lowest seat (Hana, seat 1)', left?.newHost === 'hana' && (await readAdmin(`tables/${HT}/meta/host`)) === 'hana', JSON.stringify(left));
check('the leaving host is out of the table, their seat is free and their slot is cleared', (await readAdmin(`tables/${HT}/members/ivo`)) === null && (await readAdmin(`tables/${HT}/seats/2`)) === null && (await readAdmin('hosts/ivo')) === null);
await hana.ops.claimHostSlot(HT);

console.log('a player who already hosts another table cannot take over');
const kaiOwn = await kai.ops.createTable({ name: 'Kai', seats: 2 });
await kai.ops.joinTable({ code: HT, name: 'Kai' }); // takes the freed seat 2
check('Kai is at Hana\'s table and hosts his own', (await readAdmin(`tables/${HT}/members/kai`))?.seat === '2' && (await readAdmin('hosts/kai')) === kaiOwn.code);
const refusal = await throwsWith('handing the table to someone who hosts another live table is refused in words', hana.ops.passHost(HT, 'kai'), 'FlowRefusedError');
check('and says why', /already host another table/i.test(refusal.message), refusal.message);
const handed = await hana.ops.leaveTable(HT);
check('a leaving host skips a player who cannot take over and hands it to the next seat (Jon, seat 3)', handed?.newHost === 'jon' && (await readAdmin(`tables/${HT}/meta/host`)) === 'jon', JSON.stringify(handed));
check('Kai still hosts only his own table', (await readAdmin('hosts/kai')) === kaiOwn.code);

console.log('the last person out of a handed-over table closes it');
await jon.ops.claimHostSlot(HT);
await kai.ops.leaveTable(HT);
await jon.ops.leaveTable(HT);
check('the table is gone and the last host\'s slot is cleared', (await readAdmin(`tables/${HT}`)) === null && (await readAdmin('hosts/jon')) === null);

console.log('a host whose old table has expired is not warned (decided 2026-10-27)');
{
  const fay = person('fay');
  const fayTable = await fay.ops.createTable({ name: 'Fay', seats: 2 });
  const FT = fayTable.code;
  const setActive = (agoMs) => admin((db) => set(ref(db, `tables/${FT}/activity/lastActive`), Date.now() - agoMs));
  const setCreated = (agoMs) => admin((db) => set(ref(db, `tables/${FT}/meta/createdAt`), Date.now() - agoMs));
  check('a live table is reported as not expired', (await fay.ops.findMyTable()).expired === false);
  await setActive(29 * 60 * 1000);
  check('29 minutes idle in the lobby: still open, so the host is warned', (await fay.ops.findMyTable()).expired === false);
  await setActive(31 * 60 * 1000);
  check('31 minutes idle in the lobby: expired, so no warning is needed', (await fay.ops.findMyTable()).expired === true);
  await admin((db) => set(ref(db, `tables/${FT}/meta/status`), 'playing'));
  await admin((db) => set(ref(db, `tables/${FT}/meta/idleLimit`), 3600000));
  await setActive(31 * 60 * 1000);
  check('31 minutes idle while playing (the limit is 1 hour): still open', (await fay.ops.findMyTable()).expired === false);
  await setActive(61 * 60 * 1000);
  check('61 minutes idle while playing: expired', (await fay.ops.findMyTable()).expired === true);
  await setActive(1000);
  check('active a second ago: open again', (await fay.ops.findMyTable()).expired === false);
  await setCreated(8 * 3600 * 1000 + 60000);
  check('past 8 hours even though active a second ago: expired', (await fay.ops.findMyTable()).expired === true);
  const replaced = await fay.ops.createTable({ name: 'Fay', seats: 2 });
  check('and a new table replaces it, naming the old one', replaced.replaced === FT && (await readAdmin(`tables/${FT}`)) === null);
  // The host cannot read the heartbeat (they left their own table): the answer must stay on the safe side, "ask"
  await admin((db) => set(ref(db, `tables/${replaced.code}/members/fay`), null));
  const unreadable = await fay.ops.findMyTable();
  check('if the heartbeat cannot be read the table is treated as open (the host is asked)', unreadable === null || unreadable.expired === false, JSON.stringify(unreadable));
}

console.log('the heartbeat and the watchers the page uses to warn before a table closes');
const beth = person('beth');
const cal = person('cal');
const eli2 = person('eli2'); // never joins
const bethTable = await beth.ops.createTable({ name: 'Beth', seats: 2 });
const BT = bethTable.code;
await cal.ops.joinTable({ code: BT, name: 'Cal' });
const lastActive = () => readAdmin(`tables/${BT}/activity/lastActive`);
const backdate = (ms) => admin((db) => set(ref(db, `tables/${BT}/activity/lastActive`), Date.now() - ms));
const created = await lastActive();
check('a new table has its first heartbeat from creation', Math.abs(created - Date.now()) < 60000);
check('a heartbeat straight after creation is refused by the 30-second cap (and is not an error)', (await beth.ops.heartbeat(BT)) === false && (await lastActive()) === created);
await backdate(40 * 1000);
const old40 = await lastActive();
check('a heartbeat 40 seconds after the last one is recorded', (await cal.ops.heartbeat(BT)) === true);
const fresh = await lastActive();
check('and it moved lastActive forward to about the server time', fresh > old40 && Math.abs(fresh - Date.now()) < 60000, `${old40} -> ${fresh}`);
check('a second heartbeat right after that is refused, from either player', (await beth.ops.heartbeat(BT)) === false && (await cal.ops.heartbeat(BT)) === false && (await lastActive()) === fresh);
await backdate(40 * 1000);
check('someone who is not at the table cannot send a heartbeat', (await eli2.ops.heartbeat(BT)) === false);
await backdate(45 * 60 * 1000);
const stale = await lastActive();
check('a heartbeat cannot revive a table that has been idle past its limit', (await beth.ops.heartbeat(BT)) === false && (await lastActive()) === stale);
check('a heartbeat for a table that does not exist is refused, not thrown', (await beth.ops.heartbeat('ZZZZZZ')) === false);

// Watchers
await backdate(40 * 1000);
const seenActive = []; let activityError = null;
const stopActivity = cal.ops.watchActivity(BT, (value, error) => { if (error) activityError = error; else seenActive.push(value); });
await waitFor(() => seenActive.length >= 1);
check('a member watching lastActive gets its current value', typeof seenActive[0] === 'number' && seenActive[0] === (await lastActive()), String(seenActive[0]));
await cal.ops.heartbeat(BT);
await waitFor(() => seenActive.length >= 2);
await new Promise((r) => setTimeout(r, 300)); // the SDK reports its own estimate of the server time first and the confirmed value a moment later
const final = seenActive[seenActive.length - 1];
// The estimate can sit a millisecond or so above the confirmed time (found 2026-10-28: 389 then 388 failed this once), so
// "never back" allows a second of drift; what matters is that the last value is the stored one and is later than the first.
check('and is told when a heartbeat changes it (moving forward, never back by more than the estimate\'s drift)', final > seenActive[0] && seenActive.every((v, i) => i === 0 || v >= seenActive[i - 1] - 1000) && final === (await lastActive()), seenActive.join(' -> '));
stopActivity();
let strangerActivity = 'no callback';
const stopStrangerActivity = eli2.ops.watchActivity(BT, (value, error) => { strangerActivity = error ? 'error' : 'value'; });
await waitFor(() => strangerActivity !== 'no callback');
check('someone not at the table gets an error callback, not the time', strangerActivity === 'error', strangerActivity);
stopStrangerActivity();

const seenMeta = [];
const stopMeta = beth.ops.watchMeta(BT, (meta, error) => { if (!error) seenMeta.push(meta); });
await waitFor(() => seenMeta.length >= 1);
check('a member watching the table gets its limits and status', seenMeta[0]?.idleLimit === 1800000 && seenMeta[0]?.status === 'lobby' && typeof seenMeta[0]?.createdAt === 'number', JSON.stringify(seenMeta[0]));
await admin((db) => set(ref(db, `tables/${BT}/meta/status`), 'playing'));
await admin((db) => set(ref(db, `tables/${BT}/meta/idleLimit`), 3600000));
await waitFor(() => seenMeta.some((m) => m?.status === 'playing' && m.idleLimit === 3600000));
check('and is told when the match starts (status and the 1-hour limit)', seenMeta.some((m) => m?.status === 'playing' && m.idleLimit === 3600000));
stopMeta();

let offset = null;
const stopOffset = beth.ops.watchServerOffset((value) => { offset = value; });
await waitFor(() => offset !== null);
check('the server clock offset arrives as a number close to zero on this machine', typeof offset === 'number' && Math.abs(offset) < 5000, String(offset));
stopOffset();


// ---- Presence: a note per open tab, removed by the DATABASE when the connection drops ----
console.log('presence');
// Polls an async question for up to 5 seconds; true as soon as it answers yes.
const until = async (question) => { for (let i = 0; i < 100; i++) { if (await question()) return true; await new Promise((r) => setTimeout(r, 50)); } return false; };
const pa = person('presence-a');
const pb = person('presence-b');
const pstranger = person('presence-s');
const PT = (await pa.ops.createTable({ name: 'Pa', seats: 2 })).code;
await pb.ops.joinTable({ code: PT, name: 'Pb' });
const TAB_A = 'bbbbbbbbbb';
const TAB_B = 'cccccccccc';
const notePath = (tab) => `tables/${PT}/presence/presence-b/tabs/${tab}`;
const seenPath = `tables/${PT}/presence/presence-b/lastSeen`;
const problems = [];
let watched = {};
const stopWatch = pa.ops.watchPresence(PT, (map, error) => { if (!error) watched = map; });
const stopTabA = pb.ops.startPresence(PT, { tabId: TAB_A, onProblem: (e) => problems.push(e) });
check('a tab writes its note once the connection is up', await until(async () => (await readAdmin(notePath(TAB_A))) === true));
check('a different player watching sees one tab open and no last-seen time yet', await until(async () => watched['presence-b']?.tabs === 1) && watched['presence-b'].lastSeen === null, JSON.stringify(watched));
const stopTabB = pb.ops.startPresence(PT, { tabId: TAB_B, onProblem: (e) => problems.push(e) });
check('a second tab of the same player is a second note', await until(async () => watched['presence-b']?.tabs === 2), JSON.stringify(watched));
await stopTabB();
check('stopping one tab removes only its note and records the last-seen time', await until(async () => watched['presence-b']?.tabs === 1 && Math.abs((watched['presence-b'].lastSeen ?? 0) - Date.now()) < 30000), JSON.stringify(watched));
check('stopping the same tab twice is harmless', (await stopTabB()) === undefined);
const beforeDrop = (await readAdmin(seenPath));
goOffline(pb.db); // the connection drops: the DATABASE must remove the note and record the time, with no help from the page
check('when the connection drops the database removes the note', await until(async () => (await readAdmin(notePath(TAB_A))) === null));
check('and records the last-seen time (the server clock, newer than before)', await until(async () => { const t = await readAdmin(seenPath); return typeof t === 'number' && t >= beforeDrop; }), String(await readAdmin(seenPath)));
check('the other player sees that player with no tabs and a last-seen time', await until(async () => watched['presence-b']?.tabs === 0 && typeof watched['presence-b'].lastSeen === 'number'), JSON.stringify(watched));
goOnline(pb.db); // the connection comes back: the tab must register again and write its note again
check('when the connection comes back the note is written again', await until(async () => (await readAdmin(notePath(TAB_A))) === true));
check('and the other player sees one tab again', await until(async () => watched['presence-b']?.tabs === 1), JSON.stringify(watched));
await stopTabA();
check('stopping the last tab removes its note', await until(async () => (await readAdmin(notePath(TAB_A))) === null));
check('no problems were reported during all of that', problems.length === 0, problems.map((e) => e.message).join('; '));
stopWatch();

let strangerSaw = 'no callback';
const stopStrangerWatch = pstranger.ops.watchPresence(PT, (map, error) => { strangerSaw = error ? 'error' : 'value'; });
check('someone not at the table cannot watch presence (they get an error, not the notes)', await until(async () => strangerSaw !== 'no callback') && strangerSaw === 'error', strangerSaw);
stopStrangerWatch();
const strangerProblems = [];
const stopStrangerPresence = pstranger.ops.startPresence(PT, { tabId: 'dddddddddd', onProblem: (e) => strangerProblems.push(e) });
await new Promise((r) => setTimeout(r, 1500));
check('someone not at the table writes no note, and the refusal is not reported as a problem', (await readAdmin(`tables/${PT}/presence/presence-s`)) === null && strangerProblems.length === 0, JSON.stringify(strangerProblems.map((e) => e.message)));
await stopStrangerPresence();

// ---- Host takeover: the page's own code, with presence seeded (a gone host cannot be waited for 5 minutes in a test) ----
console.log('host takeover');
const gone = (code, uid, msAgo) => admin((db) => set(ref(db, `tables/${code}/presence/${uid}/lastSeen`), Date.now() - msAgo));
const tkHost = person('tk-host');
const tkBob = person('tk-bob');
const tkOut = person('tk-out');
const TK = (await tkHost.ops.createTable({ name: 'Hosta', seats: 3 })).code;
await tkBob.ops.joinTable({ code: TK, name: 'Bobby' });
await throwsWith('taking over from a host with no presence record is refused in words', tkBob.ops.takeOverHost(TK), 'FlowRefusedError');
await gone(TK, 'tk-host', 2 * 60 * 1000);
await throwsWith('taking over from a host gone only 2 minutes is refused in words', tkBob.ops.takeOverHost(TK), 'FlowRefusedError');
await throwsWith('someone not at the table cannot take over', tkOut.ops.takeOverHost(TK), 'FlowRefusedError');
await throwsWith('the host cannot "take over" their own table', tkHost.ops.takeOverHost(TK), 'FlowRefusedError');
await admin((db) => set(ref(db, `tables/${TK}/presence/tk-host/tabs/aaaaaaaaaa`), true));
await gone(TK, 'tk-host', 20 * 60 * 1000);
await throwsWith('a host with a tab open is not gone however old the last-seen time', tkBob.ops.takeOverHost(TK), 'FlowRefusedError');
await admin((db) => set(ref(db, `tables/${TK}/presence/tk-host/tabs/aaaaaaaaaa`), null));
check('the page refused all of those before writing (the host is still the host)', (await readAdmin(`tables/${TK}/meta/host`)) === 'tk-host');
await tkBob.ops.takeOverHost(TK);
check('a member takes over from a host gone for 20 minutes', (await readAdmin(`tables/${TK}/meta/host`)) === 'tk-bob');
check('and holds the host slot for this table from the same write', (await readAdmin('hosts/tk-bob')) === TK);
check('the old host\'s slot still names the table (nobody else can clear it)', (await readAdmin('hosts/tk-host')) === TK);
check('the old host finding their table sees it is no longer theirs (nothing to warn about)', (await tkHost.ops.findMyTable()) === null);
check('and that cleared their stale slot', (await readAdmin('hosts/tk-host')) === null);
await throwsWith('the old host cannot take it straight back (the new host has no presence record, so is not gone)', tkHost.ops.takeOverHost(TK), 'FlowRefusedError');
const hostNow = await tkBob.ops.findMyTable();
check('the new host finds their table, with 2 players', hostNow?.code === TK && hostNow.players === 2, JSON.stringify(hostNow));

const tk2Host = person('tk2-host');
const tk2Bob = person('tk2-bob');
const TK2 = (await tk2Host.ops.createTable({ name: 'Hostb', seats: 2 })).code;
await tk2Bob.ops.joinTable({ code: TK2, name: 'Bobbo' });
await gone(TK2, 'tk2-host', 6 * 60 * 1000);
await tk2Bob.ops.takeOverHost(TK2);
check('second case: taken over, and the old host\'s slot is stale', (await readAdmin('hosts/tk2-host')) === TK2 && (await readAdmin(`tables/${TK2}/meta/host`)) === 'tk2-bob');
const freshTk = await tk2Host.ops.createTable({ name: 'Hostb', seats: 2 }); // straight away, without asking findMyTable first
check('the old host can make a new table straight away: the stale slot does not block it and nothing is reported as replaced', /^[A-Z2-9]{6}$/.test(freshTk.code) && freshTk.code !== TK2 && freshTk.replaced === null, JSON.stringify(freshTk));
check('their slot now names the new table', (await readAdmin('hosts/tk2-host')) === freshTk.code);
check('and the table they lost carries on, with its new host', (await readAdmin(`tables/${TK2}/meta/host`)) === 'tk2-bob' && (await readAdmin(`tables/${TK2}/members/tk2-bob`)) !== null);

const connectionSeen = [];
const stopConnection = pb.ops.watchConnection((connected) => connectionSeen.push(connected));
check('watching the connection says it is up', await until(async () => connectionSeen.at(-1) === true), JSON.stringify(connectionSeen));
goOffline(pb.db);
check('and says it is down when the connection is cut (this drives "You\'re offline, reconnecting...")', await until(async () => connectionSeen.at(-1) === false), JSON.stringify(connectionSeen));
goOnline(pb.db);
check('and up again when it returns', await until(async () => connectionSeen.at(-1) === true), JSON.stringify(connectionSeen));
stopConnection();

await env.cleanup();
console.log(`All ${checks} table logic checks passed.`);
