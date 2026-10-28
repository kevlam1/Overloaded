// Do the rules that are PUBLISHED on the real Firebase project behave like backend/database.rules.json?
// Firebase does not let us read the published rules back (that needs an admin secret), so this checks behavior:
// it plays a short game's worth of requests against the real database with throwaway anonymous accounts and
// compares each answer (200 allowed, 401 refused) with what the rules file promises. It uses only HTTPS requests,
// no browser. Everything it writes goes to one throwaway table, which it deletes, and it deletes its accounts.
// Run from the repo root:  node --env-file=.env scripts/check-live-rules.mjs
// Exit codes: 0 all matched, 1 a difference (the published rules may be out of date: paste the file again),
// 2 the rules are locked (nothing could be written).
import { makeTableCode } from '../shared/table-code.mjs';

const DB = (process.env.FIREBASE_DATABASE_URL ?? '').replace(/\/$/, '');
const API_KEY = process.env.FIREBASE_API_KEY ?? '';
if (!DB || !API_KEY) { console.log('The Firebase settings are not in the environment. Run: node --env-file=.env scripts/check-live-rules.mjs'); process.exit(1); }

const SERVER_TIME = { '.sv': 'timestamp' };
const LOBBY_IDLE = 1800000, PLAYING_IDLE = 3600000;
const accounts = [];
let checks = 0;
const failures = [];

async function newAccount() {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) });
  const json = await response.json();
  if (!json.idToken) throw new Error('could not create a throwaway account');
  const account = { uid: json.localId, token: json.idToken };
  accounts.push(account);
  return account;
}
const deleteAccount = (token) => fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${API_KEY}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: token }) }).catch(() => {});

async function call(who, method, path, body) {
  const response = await fetch(`${DB}/${path}.json?auth=${encodeURIComponent(who.token)}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null; try { json = await response.json(); } catch {}
  return { status: response.status, json };
}
const update = (who, writes) => call(who, 'PATCH', '', writes);

// expect(label, request, 'allowed' | 'refused')
async function expect(label, request, outcome) {
  const answer = await request;
  const pass = outcome === 'allowed' ? answer.status === 200 : answer.status === 401;
  checks++;
  if (!pass) { failures.push(label); console.log(`DIFFERENT  ${label}  (expected ${outcome}, got HTTP ${answer.status})`); }
  return answer;
}

const newTable = (host, code, over = {}) => ({
  [`tables/${code}/meta`]: { host: host.uid, createdAt: SERVER_TIME, seats: 3, format: 'commander', status: 'lobby', idleLimit: LOBBY_IDLE, match: 1, ...over },
  [`tables/${code}/activity/lastActive`]: SERVER_TIME,
  [`tables/${code}/members/${host.uid}`]: { name: 'Host', seat: '1' },
  [`tables/${code}/seats/1`]: host.uid,
  [`hosts/${host.uid}`]: code,
});

let exitCode = 0;
const code = makeTableCode();
try {
  const host = await newAccount();
  const member = await newAccount();
  const stranger = await newAccount();
  const T = `tables/${code}`;

  // Creating a table: the first one tells us whether the rules are published at all
  const created = await update(host, newTable(host, code));
  if (created.status === 401) { console.log('The database refused the first write: the rules are locked or not published yet.'); exitCode = 2; throw new Error('stop'); }
  checks++;
  if (created.status !== 200) { failures.push('the host creates a table'); console.log(`DIFFERENT  the host creates a table  (HTTP ${created.status})`); }

  // Bad tables, each by a fresh account so nothing else can be the reason for the refusal
  for (const [label, over] of [['createdAt is a client time', { createdAt: Date.now() - 5000 }], ['five seats', { seats: 5 }], ['one seat', { seats: 1 }], ['created already playing', { status: 'playing', idleLimit: PLAYING_IDLE }], ['a match number other than 1', { match: 2 }], ['an unknown meta field', { junk: 1 }], ['a lobby with the playing idle limit', { idleLimit: PLAYING_IDLE }]]) {
    const other = await newAccount();
    await expect(`creating a table with ${label}`, update(other, newTable(other, makeTableCode(), over)), 'refused');
  }
  const slotThief = await newAccount();
  await expect('creating a table at a code that is in use', update(slotThief, newTable(slotThief, code)), 'refused');
  const noSlot = await newAccount();
  const withoutSlot = newTable(noSlot, makeTableCode()); delete withoutSlot[`hosts/${noSlot.uid}`];
  await expect('creating a table without claiming the host slot', update(noSlot, withoutSlot), 'refused');

  // Joining: seats are create-only, limited to the seat count, one per person
  await expect('a member takes seat 2 and joins', update(member, { [`${T}/members/${member.uid}`]: { name: 'Member', seat: '2' }, [`${T}/seats/2`]: member.uid }), 'allowed');
  await expect('a stranger takes a seat that is already taken', update(stranger, { [`${T}/members/${stranger.uid}`]: { name: 'S', seat: '2' }, [`${T}/seats/2`]: stranger.uid }), 'refused');
  await expect('a stranger takes seat 4 on a 3-seat table', update(stranger, { [`${T}/members/${stranger.uid}`]: { name: 'S', seat: '4' }, [`${T}/seats/4`]: stranger.uid }), 'refused');
  await expect('a stranger deletes a live table', call(stranger, 'DELETE', T), 'refused');
  await expect('a member takes a second seat', call(member, 'PUT', `${T}/seats/3`, member.uid), 'refused');

  // Ready is a number: the match you are ready for
  await expect('ready for the current match (1)', call(member, 'PUT', `${T}/members/${member.uid}/ready`, 1), 'allowed');
  await expect('ready for another match (2)', call(member, 'PUT', `${T}/members/${member.uid}/ready`, 2), 'refused');
  await expect('ready as a boolean', call(member, 'PUT', `${T}/members/${member.uid}/ready`, true), 'refused');

  // The heartbeat cap (the table is only seconds old) and who may start a match
  await expect('a heartbeat straight after creation (30 second cap)', call(member, 'PUT', `${T}/activity/lastActive`, SERVER_TIME), 'refused');
  await expect('a member who is not the host starts the match', call(member, 'PATCH', `${T}/meta`, { status: 'playing', idleLimit: PLAYING_IDLE }), 'refused');
  await expect('the host starts the match', call(host, 'PATCH', `${T}/meta`, { status: 'playing', idleLimit: PLAYING_IDLE }), 'allowed');
  await expect('the host changes the seat count after creation', call(host, 'PUT', `${T}/meta/seats`, 2), 'refused');
  await expect('a stranger takes the free seat 3 after the match started', update(stranger, { [`${T}/members/${stranger.uid}`]: { name: 'S', seat: '3' }, [`${T}/seats/3`]: stranger.uid }), 'refused');

  // Conceding, during the match
  await expect('the member concedes for match 1', call(member, 'PUT', `${T}/members/${member.uid}/conceded`, 1), 'allowed');
  await expect('the member takes it back by writing 0', call(member, 'PUT', `${T}/members/${member.uid}/conceded`, 0), 'refused');
  await expect('the member takes it back by deleting it', call(member, 'DELETE', `${T}/members/${member.uid}/conceded`), 'refused');
  await expect('the member concedes for someone else', call(member, 'PUT', `${T}/members/${host.uid}/conceded`, 1), 'refused');

  // Ending the match: only the host, back to the lobby, and the match number goes up by exactly one
  await expect('a member ends the match', call(member, 'PATCH', `${T}/meta`, { status: 'lobby', idleLimit: LOBBY_IDLE, match: 2 }), 'refused');
  await expect('the host ends the match without raising the match number', call(host, 'PATCH', `${T}/meta`, { status: 'lobby', idleLimit: LOBBY_IDLE }), 'refused');
  await expect('the host ends the match and raises the number by 2', call(host, 'PATCH', `${T}/meta`, { status: 'lobby', idleLimit: LOBBY_IDLE, match: 3 }), 'refused');
  await expect('the host ends the match with the playing idle limit', call(host, 'PATCH', `${T}/meta`, { status: 'lobby', match: 2 }), 'refused');
  await expect('the host ends the match properly (back to the lobby, match 2)', call(host, 'PATCH', `${T}/meta`, { status: 'lobby', idleLimit: LOBBY_IDLE, match: 2 }), 'allowed');

  // Back in the lobby: marks from match 1 no longer count
  await expect('the member concedes in the lobby', call(member, 'PUT', `${T}/members/${member.uid}/conceded`, 2), 'refused');
  await expect('the member removes the old concession', call(member, 'DELETE', `${T}/members/${member.uid}/conceded`), 'allowed');
  await expect('the member is ready for the old match (1)', call(member, 'PUT', `${T}/members/${member.uid}/ready`, 1), 'refused');
  await expect('the member is ready for the new match (2)', call(member, 'PUT', `${T}/members/${member.uid}/ready`, 2), 'allowed');
  await expect('the host starts the next match (the number stays 2)', call(host, 'PATCH', `${T}/meta`, { status: 'playing', idleLimit: PLAYING_IDLE }), 'allowed');
  await expect('the member concedes for match 2', call(member, 'PUT', `${T}/members/${member.uid}/conceded`, 2), 'allowed');

  // Coming back to your own seat mid-match, and the host freeing a seat nobody sits in (added 2026-10-28). The OLD
  // rules refused both of these, so these checks pass only once the new file has been published.
  await expect('a member drops out of the match (their entry goes, their seat stays held)', call(member, 'DELETE', `${T}/members/${member.uid}`), 'allowed');
  await expect('a stranger adds an entry for the seat held for the member', update(stranger, { [`${T}/members/${stranger.uid}`]: { name: 'S', seat: '2' } }), 'refused');
  await expect('the member comes back to their own seat mid-match', call(member, 'PUT', `${T}/members/${member.uid}`, { name: 'Member', seat: '2' }), 'allowed');
  await expect('the member drops out again', call(member, 'DELETE', `${T}/members/${member.uid}`), 'allowed');
  await expect('the host cannot free the held seat during the match', call(host, 'DELETE', `${T}/seats/2`), 'refused');
  await expect('the host ends the match (back to the lobby, match 3)', call(host, 'PATCH', `${T}/meta`, { status: 'lobby', idleLimit: LOBBY_IDLE, match: 3 }), 'allowed');
  await expect('a stranger frees the empty seat', call(stranger, 'DELETE', `${T}/seats/2`), 'refused');
  await expect('the host frees the seat nobody sits in', call(host, 'DELETE', `${T}/seats/2`), 'allowed');
  await expect('the member joins the lobby again and takes seat 2', update(member, { [`${T}/members/${member.uid}`]: { name: 'Member', seat: '2' }, [`${T}/seats/2`]: member.uid }), 'allowed');

  // The last player standing may end the table
  await expect('a member ends the table while the host is still in it', call(member, 'DELETE', T), 'refused');
  await expect('the host leaves (deletes their member entry)', call(host, 'DELETE', `${T}/members/${host.uid}`), 'allowed');
  await expect('the last member remaining ends the table', call(member, 'DELETE', T), 'allowed');
  const gone = await call(member, 'GET', `${T}/meta`);
  checks++;
  if (!(gone.status === 401 || gone.json === null)) { failures.push('the table is gone after the last member ended it'); console.log('DIFFERENT  the table is gone after the last member ended it'); }

  // Tidy the host slot (the table is gone, the slot is the host's own)
  await expect('the host clears their own host slot', call(host, 'DELETE', `hosts/${host.uid}`), 'allowed');
} catch (error) {
  if (error.message !== 'stop') { failures.push('the check script itself ran without an error: ' + error.message); console.log('DIFFERENT  the check script itself ran without an error:', error.message); exitCode = 1; }
} finally {
  try { await call(accounts[0] ?? { token: '' }, 'DELETE', `tables/${code}`); } catch {}
  for (const account of accounts) await deleteAccount(account.token);
}

if (exitCode === 2) { console.log('RESULT: the rules are locked, so nothing could be compared.'); process.exit(2); }
if (failures.length) { console.log(`\n${checks - failures.length} of ${checks} matched. RESULT: DIFFERENT from the rules file: ${failures.join('; ')}\nThe published rules may be out of date: paste backend/database.rules.json into the console again.`); process.exit(1); }
console.log(`All ${checks} live rule checks matched the rules file.`);
