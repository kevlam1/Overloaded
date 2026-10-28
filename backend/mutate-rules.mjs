// Mutation check for database.rules.json: break one rule at a time and require the tests to fail.
// A mutation that the tests do not catch ("SURVIVED") is a rule with no test, or a redundant rule.
// Run: npm run mutate   (about 15 seconds per mutation; it rewrites the rules file and always restores it)
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const rulesUrl = new URL('./database.rules.json', import.meta.url);
// A copy of the correct rules is kept on disk while mutations run (the name starts with "scratch", so git ignores it).
// If this script is killed, its `finally` block never runs and the rules file is left broken; the next start
// then restores it from this copy before doing anything else.
const backupUrl = new URL('./scratch-rules-original.json', import.meta.url);
if (existsSync(backupUrl)) {
  writeFileSync(rulesUrl, readFileSync(backupUrl, 'utf8'));
  unlinkSync(backupUrl);
  console.log('A previous run was interrupted: restored database.rules.json from its backup first.');
}
const original = readFileSync(rulesUrl, 'utf8');
const T = "root.child('tables').child($code)";
const A = `${T}.child('meta').child('createdAt').val() + 28800000 > now`;
const B = `${T}.child('activity').child('lastActive').val() + ${T}.child('meta').child('idleLimit').val() > now`;
const MEMBER = `${T}.child('members').child(auth.uid).exists()`;

const code = ['rules', 'tables', '$code'];
const at = (...p) => [...code, ...p];
// [name, path to the rule string, exact text to find, replacement]. The text must occur in the rule.
const M = [
  ['root read open', ['rules', '.read'], 'false', 'true'],
  ['root write open', ['rules', '.write'], 'false', 'true'],
  ['delete: any write allowed on expired tables (not just deletes)', at('.write'), '!newData.exists() && ', ''],
  ['delete: alive tables can be deleted by anyone', at('.write'), '|| !(', '|| ('],
  ['delete: anyone can delete (host check removed)', at('.write'), "data.child('meta').child('host').val() === auth.uid || ", 'true || '],
  ['host slot: readable by anyone', ['rules', 'hosts', '$uid', '.read'], 'auth.uid === $uid', 'true'],
  ['host slot: writable for another uid', ['rules', 'hosts', '$uid', '.write'], ' && auth.uid === $uid', ''],
  ['host slot: may name a table someone else hosts', ['rules', 'hosts', '$uid', '.write'], "newData.parent().parent().child('tables').child(newData.val()).child('meta').child('host').val() === auth.uid && ", ''],
  ['host slot: may move without deleting the old table', ['rules', 'hosts', '$uid', '.write'], "(!data.exists() || !newData.parent().parent().child('tables').child(data.val()).exists())", 'true'],
  ['host slot: any length', ['rules', 'hosts', '$uid', '.validate'], ' && newData.val().length <= 20', ''],
  ['host slot: may contain a slash', ['rules', 'hosts', '$uid', '.validate'], " && !newData.val().contains('/')", ''],
  ['host slot: need not be a string', ['rules', 'hosts', '$uid', '.validate'], 'newData.isString() && ', ''],
  ['meta write: table creation does not require the host slot', at('meta', '.write'), " && newData.parent().parent().parent().child('hosts').child(auth.uid).val() === $code", ''],
  ['delete: signed-out users', at('.write'), 'auth != null && ', ''],
  ['delete: 8-hour limit ignored', at('.write'), `${A} && `, ''],
  ['delete: idle limit ignored', at('.write'), ` && ${B}`, ''],
];
// The "alive" test (A and B) is repeated in several rules; drop each half in each rule.
for (const [label, path] of [
  ['members write', at('members', '$uid', '.write')],
  ['public write', at('public', '$uid', '.write')],
  ['private write', at('private', '$uid', '.write')],
  ['meta write', at('meta', '.write')],
]) {
  M.push([`${label}: 8-hour limit ignored`, path, `${A} && `, '']);
  M.push([`${label}: idle limit ignored`, path, ` && ${B}`, '']);
  M.push([`${label}: 8-hour limit is 80 hours`, path, '28800000', '288000000']);
}
M.push(
  ['members read: any signed-in user', at('members', '.read'), `auth != null && ${MEMBER}`, 'auth != null'],
  ['members write: any uid', at('members', '$uid', '.write'), ' && auth.uid === $uid', ''],
  ['members write: table-creation branch needs no host check', at('members', '$uid', '.write'), "newData.parent().parent().child('meta').child('host').val() === auth.uid", 'true'],
  ['members write: table-creation branch without "no meta yet"', at('members', '$uid', '.write'), `!${T}.child('meta').exists() && `, ''],
  ['members: name required removed', at('members', '$uid', '.validate'), "['name', 'seat']", "['seat']"],
  ['members: seat required removed', at('members', '$uid', '.validate'), "['name', 'seat']", "['name']"],
  ['members: a seat need not be held by the joiner', at('members', '$uid', '.validate'), "newData.parent().parent().child('seats').child(newData.child('seat').val()).val() === $uid", 'true'],
  ['members: seat number may change', at('members', '$uid', '.validate'), "newData.child('seat').val() === data.child('seat').val()", 'true'],
  ['members: seat value any string', at('members', '$uid', 'seat', '.validate'), "newData.isString() && (newData.val() === '1' || newData.val() === '2' || newData.val() === '3' || newData.val() === '4')", 'true'],
  // (Removed 2026-10-28: "new entries need the lobby status". A returning player's entry is now allowed during a match.)
  ['members write (new entries): 8-hour limit ignored', at('members', '$uid', '.write'), `${A} && `, '', 2],
  ['members write (new entries): idle limit ignored', at('members', '$uid', '.write'), ` && ${B}`, '', 2],
  ['seats read: any signed-in user', at('seats', '.read'), `auth != null && ${MEMBER}`, 'auth != null'],
  ['meta: seat count may change', at('meta', 'seats', '.validate'), 'newData.val() === data.val() : (', 'true : ('],
  ['seats: unknown seat numbers allowed', at('seats', '$other', '.validate'), 'false', 'true'],
  ['members: name length limit removed', at('members', '$uid', 'name', '.validate'), ' && newData.val().length <= 30', ''],
  ['members: name non-empty removed', at('members', '$uid', 'name', '.validate'), 'newData.val().length > 0 && ', ''],
  ['members: name string check removed', at('members', '$uid', 'name', '.validate'), 'newData.isString() && ', ''],
  ['members: ready need not be a number', at('members', '$uid', 'ready', '.validate'), 'newData.isNumber() && ', ''],
  ['members: ready for any match number', at('members', '$uid', 'ready', '.validate'), ` && newData.val() === ${T}.child('meta').child('match').val()`, ''],
  ['members: unknown fields allowed', at('members', '$uid', '$other', '.validate'), 'false', 'true'],
  ['public read: any signed-in user', at('public', '.read'), `auth != null && ${MEMBER}`, 'auth != null'],
  ['public write: any member', at('public', '$uid', '.write'), 'auth.uid === $uid && ', ''],
  ['public write: membership check removed', at('public', '$uid', '.write'), ` && ${MEMBER}`, ''],
  ['private read: any signed-in user', at('private', '$uid', '.read'), 'auth != null && auth.uid === $uid', 'auth != null'],
  ['private write: any member', at('private', '$uid', '.write'), 'auth.uid === $uid && ', ''],
  ['private write: membership check removed', at('private', '$uid', '.write'), ` && ${MEMBER}`, ''],
  ['meta read: any signed-in user', at('meta', '.read'), `auth != null && ${MEMBER}`, 'auth != null'],
  ['meta write: anyone may create (no host check)', at('meta', '.write'), "newData.child('host').val() === auth.uid", 'true'],
  ['meta write: anyone may update', at('meta', '.write'), "data.child('host').val() === auth.uid", 'true'],
  ['meta validate: status and idle limit not tied', at('meta', '.validate'), " && (newData.child('status').val() === 'lobby' ? newData.child('idleLimit').val() === 1800000 : newData.child('idleLimit').val() === 3600000)", ''],
  ['meta validate: format not required', at('meta', '.validate'), ", 'format'", ''],
  ['meta validate: seats not required', at('meta', '.validate'), ", 'seats'", ''],
  // Host handover (2026-10-28): the host may change only to a current member who does not host another live table.
  ['meta: host may change to anyone', at('meta', 'host', '.validate'), `(newData.val() === data.val() || (${T}.child('members')`, `(true || (${T}.child('members')`],
  ['meta: host may change to someone who is not at the table', at('meta', 'host', '.validate'), `${T}.child('members').child(newData.val()).exists() && (!root.child('hosts')`, `(!root.child('hosts')`],
  ['meta: host may change to someone who hosts another live table', at('meta', 'host', '.validate'), "(!root.child('hosts').child(newData.val()).exists() || !root.child('tables').child(root.child('hosts').child(newData.val()).val()).exists())", 'true'],
  ['meta: a stale host slot blocks a hand-over', at('meta', 'host', '.validate'), " || !root.child('tables').child(root.child('hosts').child(newData.val()).val()).exists()", ''],
  ['meta: an unchanged host is not accepted', at('meta', 'host', '.validate'), 'newData.val() === data.val() || ', ''],
  ['meta: host need not be a string', at('meta', 'host', '.validate'), 'newData.isString() && ', ''],
  ['meta: host on creation not checked', at('meta', 'host', '.validate'), 'auth.uid', 'newData.val()'],
  ['meta: createdAt not server time', at('meta', 'createdAt', '.validate'), 'newData.val() === (data.exists() ? data.val() : now)', 'true'],
  ['meta: createdAt may change', at('meta', 'createdAt', '.validate'), 'data.exists() ? data.val() : now', 'now'],
  ['meta: any seat count', at('meta', 'seats', '.validate'), 'newData.val() === 2 || newData.val() === 3 || newData.val() === 4', 'true'],
  ['meta: status any value', at('meta', 'status', '.validate'), 'newData.isString() && (', 'true || ('],
  ['meta: status accepts any other value', at('meta', 'status', '.validate'), "(newData.val() === 'lobby' || newData.val() === 'playing')", 'true'],
  ['meta: may be created already playing', at('meta', 'status', '.validate'), "!data.exists() ? newData.val() === 'lobby'", '!data.exists() ? true'],
  ['meta: idle limit any value', at('meta', 'idleLimit', '.validate'), 'newData.val() === 1800000 || newData.val() === 3600000', 'true'],
  ['meta: format any value', at('meta', 'format', '.validate'), 'newData.isString() && newData.val().length > 0 && newData.val().length <= 20', 'true'],
  ['meta: format may be 21 or more characters', at('meta', 'format', '.validate'), ' && newData.val().length <= 20', ''],
  ['meta: unknown fields allowed', at('meta', '$other', '.validate'), 'false', 'true'],
  ['meta write: meta can be deleted', at('meta', '.write'), 'newData.exists() && ', ''],
  ['heartbeat: lastActive can be deleted', at('activity', 'lastActive', '.write'), 'newData.exists() && ', ''],
  ['heartbeat: no rate cap', at('activity', 'lastActive', '.write'), '(!data.exists() || now >= data.val() + 30000) && ', ''],
  ['heartbeat: creation needs no host check', at('activity', 'lastActive', '.write'), "newData.parent().parent().child('meta').child('host').val() === auth.uid", 'true'],
  ['heartbeat: members check removed', at('activity', 'lastActive', '.write'), `${MEMBER} && `, ''],
  ['heartbeat: 8-hour limit ignored', at('activity', 'lastActive', '.write'), `${A} && `, ''],
  ['heartbeat: idle limit ignored (revival)', at('activity', 'lastActive', '.write'), ` && data.val() + ${T}.child('meta').child('idleLimit').val() > now`, ''],
  ['heartbeat: client time accepted', at('activity', 'lastActive', '.validate'), 'newData.val() === now', 'true'],
  ['activity: unknown fields allowed', at('activity', '$other', '.validate'), 'false', 'true'],
);

// Mutations the tests cannot catch because the rule is redundant: another rule already blocks the
// same writes. Each reason was checked by reading the rules (and, for the first, by a test run).
// A mutation listed here that survives is reported as "equivalent"; any other survivor fails the run.
const EQUIVALENT = {
  'members: name string check removed': 'a number has no .length in the rules language, so a number name is still denied',
  'meta write: anyone may create (no host check)': 'the host child validate still requires host === auth.uid when the table is created',
  'meta: idle limit any value': 'the status/idle-limit coupling at meta level already allows only the two exact values',
  'activity: unknown fields allowed': 'paths under activity other than lastActive have no write rule, so they are denied anyway',
  'meta: host need not be a string': 'a host that is not a string cannot be the key of a member entry, so the "is a current member" check already denies it (the test with a number as the new host is still denied without this check)',
  'members: seat required removed': 'a member entry with no seat fails the seat-held check (a missing seat is not a held seat)',
  'members: seat value any string': 'a seat key that is not 1 to 4 is not held by anyone, so the seat-held check already denies it',
  'seats: unknown seat numbers allowed': 'seat numbers other than 1 to 4 have no write rule, so they are denied anyway',
  'meta: host on creation not checked': 'the meta write rule also requires host === auth.uid on creation',
  'members: ready need not be a number': 'the rule also requires newData.val() === the current match number, and strict equality already refuses a string or a boolean',
  'conceded: need not be a number': 'the rule also requires newData.val() === the current match number, and strict equality already refuses a string or a boolean',
  'match: need not be a number': 'the meta-level check compares match to a number (1, or the old value plus one), so a string fails it',
  'match: not required on a table': 'the meta-level match check compares newData match to a number, so a missing match fails it',
  'conceded lock: applies outside a match': 'by reading: the lock needs the stored concession to equal the current match number, which only happens while playing because the number rises when a match ends',
  'host slot: need not be a string': 'a number has no .length in the rules language, so a numeric slot is still denied (seen: it survived once the flaky test was fixed)',
  'delete: signed-out users': 'for a signed-out user the host check reads auth.uid, which raises an error, and an error denies the whole rule (seen: it survived)',
  'host slot: may contain a slash': 'by reading, not by a test: the slot rule needs tables/<value>/meta/host to be the writer, and a value with a slash names a path no table can hold (table children have fixed names)',
  'members write: table-creation branch needs no host check': 'a member entry needs a seat taken in the same write, and a stranger cannot take a seat on a table that has no meta',
  'seat 3: table-creation branch needs no host check': 'the seat-count check reads the new meta, which does not exist, so a stranger cannot reach this branch',
  'seat 4: table-creation branch needs no host check': 'the seat-count check reads the new meta, which does not exist, so a stranger cannot reach this branch',
};

// The start of the free-a-seat branch: the owner, or the host when the holder has no member entry (changed 2026-10-28).
const OWNER_OR_HOST_FREES = `!newData.exists() && (data.val() === auth.uid || (${T}.child('meta').child('host').val() === auth.uid && !${T}.child('members').child(data.val()).exists())`;
// The four seat rules differ only in the seat number and the other seats they check.
for (const n of ['1', '2', '3', '4']) {
  const path = at('seats', n, '.write');
  const label = `seat ${n}`;
  M.push(
    [`${label}: a taken seat can be overwritten`, path, 'newData.exists() && !data.exists() && ', 'newData.exists() && '],
    [`${label}: another uid can be put in the seat`, path, 'newData.val() === auth.uid && ', ''],
    [`${label}: taking a seat allowed after the game starts`, path, `${T}.child('meta').child('status').val() === 'lobby' && `, ''],
    [`${label}: freeing a seat allowed after the game starts`, path, `${OWNER_OR_HOST_FREES}) && ${T}.child('meta').child('status').val() === 'lobby' && `, `${OWNER_OR_HOST_FREES}) && `],
    [`${label}: anyone can free anyone's seat`, path, OWNER_OR_HOST_FREES, '(true'],
    [`${label}: the owner cannot free their own seat`, path, 'data.val() === auth.uid || ', ''],
    [`${label}: the host can free the seat of someone still at the table`, path, ` && !${T}.child('members').child(data.val()).exists())`, ')'],
    [`${label}: anyone can free the seat of someone who left`, path, `${T}.child('meta').child('host').val() === auth.uid && !${T}.child('members')`, `!${T}.child('members')`],
    [`${label}: taking a seat ignores the 8-hour limit`, path, `${A} && `, ''],
    [`${label}: taking a seat ignores the idle limit`, path, ` && ${B}`, ''],
    [`${label}: table-creation branch needs no host check`, path, "newData.parent().parent().child('meta').child('host').val() === auth.uid", 'true'],
    [`${label}: table-creation branch without "no meta yet"`, path, `!${T}.child('meta').exists() && `, ''],
  );
  for (const k of ['1', '2', '3', '4'].filter((x) => x !== n)) {
    M.push([`${label}: may also hold seat ${k}`, path, `newData.parent().child('${k}').val() !== auth.uid && `, '']);
  }
  if (n === '3' || n === '4') {
    M.push([`${label}: seat count ignored`, path, `>= ${n}`, '>= 1']);
  }
}

// The match counter: meta.match starts at 1 and goes up by exactly 1 only when a match ends.
{
  const path = at('meta', '.validate');
  M.push(
    ['match: ending a match need not raise it', path, "newData.child('match').val() === data.child('match').val() + 1", 'true'],
    ['match: it may change at other times', path, " : newData.child('match').val() === (data.exists() ? data.child('match').val() : 1))", ' : true)'],
    ['match: a new table may start at any number', path, "data.child('match').val() : 1)", "data.child('match').val() : newData.child('match').val())"],
    ['match: raising it needs no playing-to-lobby change', path, "data.child('status').val() === 'playing' && ", ''],
    ['match: not required on a table', path, ", 'match']", ']'],
    ['match: need not be a number', at('meta', 'match', '.validate'), 'newData.isNumber()', 'true'],
  );
}
// Conceding: a match number on your own member entry, only for the current match and only while playing.
// Once it holds for the current match it cannot be changed or deleted, which is checked at member level because
// a validate rule on the conceded field itself does not run when the field is deleted.
{
  const path = at('members', '$uid', 'conceded', '.validate');
  const lock = at('members', '$uid', '.validate');
  const S = `${T}.child('meta').child('status').val()`;
  const MATCH = `${T}.child('meta').child('match').val()`;
  M.push(
    ['conceded: need not be a number', path, 'newData.isNumber() && ', ''],
    ['conceded: for any match number', path, ` && newData.val() === ${MATCH}`, ''],
    ['conceded: may be set outside a match', path, ` && ${S} === 'playing'`, ''],
    ['conceded: can be changed or deleted mid-match (lock removed)', lock, ` && (data.child('conceded').val() === ${MATCH} && ${S} === 'playing' ? newData.child('conceded').val() === data.child('conceded').val() : true)`, ''],
    ['conceded lock: an old concession also locks', lock, `data.child('conceded').val() === ${MATCH} && ${S}`, `${S}`],
    ['conceded lock: applies outside a match', lock, `${S} === 'playing' ? newData.child('conceded')`, 'true ? newData.child(\'conceded\')'],
  );
}
// The last player standing may delete the table. The check is repeated for each of the four seats.
{
  const path = at('.write');
  M.push(['last standing: need not be a member', path, "data.child('members').child(auth.uid).exists() && ", '']);
  for (const n of ['1', '2', '3', '4']) {
    const seat = `data.child('seats').child('${n}')`;
    M.push(
      [`last standing: seat ${n} holder ignored`, path, `(!${seat}.exists() || ${seat}.val() === auth.uid || !data.child('members').child(${seat}.val()).exists())`, 'true'],
      [`last standing: seat ${n} held by the caller blocks them`, path, `${seat}.val() === auth.uid || `, ''],
      [`last standing: an empty seat ${n} blocks it`, path, `!${seat}.exists() || `, ''],
    );
  }
}

const getRule = (rules, path) => path.slice(0, -1).reduce((o, k) => o[k], rules);
function mutate([name, path, from, to, nth = 1]) {
  const rules = JSON.parse(original);
  const holder = getRule(rules, path);
  const key = path[path.length - 1];
  const text = holder[key];
  if (typeof text !== 'string' && typeof text !== 'boolean') throw new Error(`${name}: no rule at ${path.join('.')}`);
  const asString = String(text);
  let index = -1;
  for (let i = 0; i < nth; i++) index = asString.indexOf(from, index + 1);
  if (index < 0) throw new Error(`${name}: occurrence ${nth} of the text not found in ${path.join('.')}: ${from}`);
  const replaced = asString.slice(0, index) + to + asString.slice(index + from.length);
  holder[key] = text === true || text === false ? replaced === 'true' : replaced;
  return JSON.stringify(rules, null, 2) + '\n';
}

for (const m of M) mutate(m); // dry run: every mutation must apply, before the slow part starts
console.log(`${M.length} mutations apply cleanly`);
const only = process.argv[2]; // optional: run only mutations whose name contains this text
let survived = 0, killed = 0, suspicious = 0, equivalent = 0;
const restore = () => { writeFileSync(rulesUrl, original); if (existsSync(backupUrl)) unlinkSync(backupUrl); };
writeFileSync(backupUrl, original);
process.on('SIGINT', () => { restore(); process.exit(130); });
try {
  for (const m of M) {
    if (only && !m[0].includes(only)) continue;
    const text = mutate(m); // throws if the mutation does not apply, so nothing here can pass by accident
    if (text === original) throw new Error(`${m[0]}: mutation changed nothing`);
    writeFileSync(rulesUrl, text);
    const r = spawnSync(process.execPath, ['run-tests.mjs'], { cwd: new URL('.', import.meta.url), encoding: 'utf8', windowsHide: true });
    const out = `${r.stdout}\n${r.stderr}`;
    if (r.status === 0 && EQUIVALENT[m[0]]) { console.log('equivalent', m[0], '(' + EQUIVALENT[m[0]] + ')'); equivalent++; }
    else if (r.status === 0) { console.log('SURVIVED  ', m[0]); survived++; }
    else if (/Expected request to (fail|succeed)|PERMISSION_DENIED/.test(out)) {
      // The failing check names itself; a kill with no named check, or one that looks unrelated, is worth a second look.
      const failed = /FAILED CHECK[^\n]*?: ([^\n]*)/.exec(out);
      console.log('killed    ', m[0], failed ? `  <- ${failed[1].trim()}` : '  <- (no named check)'); killed++;
    }
    else {
      console.log('FAILED, NOT BY AN ASSERTION (check)', m[0]); suspicious++;
      // Show what actually failed (the last lines that are not Firebase warnings), so it can be judged.
      const tail = out.split('\n').filter((l) => l.trim() && !/FIREBASE WARNING/.test(l)).slice(-4).map((l) => `      ${l.trim().slice(0, 200)}`);
      console.log(tail.join('\n'));
    }
  }
} finally {
  restore();
}
console.log(`done: ${killed} killed, ${equivalent} equivalent, ${survived} survived, ${suspicious} suspicious; rules restored: ${readFileSync(rulesUrl, 'utf8') === original}`);
process.exit(survived || suspicious ? 1 : 0);
