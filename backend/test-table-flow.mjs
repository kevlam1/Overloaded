// Compares the table flow AS DESIGNED (shared/table-flow.mjs, a model written from docs/game-flow.md) with the page's
// real operations (shared/table-ops.mjs) running against the real rules file in the local emulator.
// Random but repeatable sequences of actions (join, ready, start, concede, end the match, leave, close, expire) are run
// through both. After EVERY step the test compares (1) whether the action was allowed and (2) the whole table.
// A disagreement is one of three things, and the person reading must decide which: a bug in the code (page or rules),
// a bug in the model, or a design question for Kevin. Known ones are listed in KNOWN below with their answer; an
// unknown one fails the test. Run: npm test (the runner starts the emulator).
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { ref, get, set, update, onValue, serverTimestamp } from 'firebase/database';
import { createTableOps } from '../shared/table-ops.mjs';
import { newModelTable, step, expireTable, ACTIONS } from '../shared/table-flow.mjs';

const SEQUENCES = Number(process.env.FLOW_SEQUENCES ?? 240);
const STEPS = Number(process.env.FLOW_STEPS ?? 14);
const SEED = Number(process.env.FLOW_SEED ?? 20261028);

const env = await initializeTestEnvironment({
  projectId: 'demo-overloaded',
  database: { host: '127.0.0.1', port: 9000, rules: readFileSync(new URL('./database.rules.json', import.meta.url), 'utf8') },
});

// Disagreements we have already looked at. key -> { kind, text }. kind is 'design' (a question for Kevin, see
// docs/game-flow.md) or 'rules' (the rules are looser or stricter than the design, and the page covers it or it is
// accepted). Anything not listed here fails the test.
// (Empty since 2026-10-28: the one finding so far, a seat held forever by someone who left mid-match, was resolved by
// changing the design and the rules, see docs/game-flow.md.)
const KNOWN = {};

// Repeatable random numbers (mulberry32).
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rand, list) => list[Math.floor(rand() * list.length)];
const WEIGHTED = [['join', 4], ['ready', 4], ['unready', 1], ['setDeck', 0.6], ['start', 3], ['concede', 2], ['endMatch', 3], ['leave', 2], ['endTable', 0.3], ['passHost', 2], ['expire', 0.3]];
function pickAction(rand) {
  const total = WEIGHTED.reduce((sum, [, w]) => sum + w, 0);
  let r = rand() * total;
  for (const [name, weight] of WEIGHTED) { if ((r -= weight) < 0) return name; }
  return 'join';
}

// What a player might tell the table about a deck. The last four are not allowed (a bracket of 7, a commander text of 221
// units, a guess with no bracket, a bracket that is not a whole number): every one must be refused by the page and the model alike.
const DECKS = [
  { commander: '', bracket: null, bracketGuess: false },
  { commander: "Atraxa, Praetors' Voice", bracket: 3, bracketGuess: false },
  { commander: 'Tymna the Weaver & Thrasios, Triton Hero', bracket: 4, bracketGuess: true },
  { commander: 'Sol Ring', bracket: null, bracketGuess: false },
  { commander: 'x'.repeat(220), bracket: 1, bracketGuess: false },
  { commander: '', bracket: 2, bracketGuess: true },
  { commander: 'Atraxa, Praetors' + "'" + ' Voice', bracket: 5, bracketGuess: false },
  { commander: 'Sol Ring', bracket: 7, bracketGuess: false },
  { commander: 'x'.repeat(221), bracket: null, bracketGuess: false },
  { commander: 'Sol Ring', bracket: null, bracketGuess: true },
  { commander: 'Sol Ring', bracket: 2.5, bracketGuess: false },
];
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const codeFor = (n) => 'ZZ' + [3, 2, 1, 0].map((p) => ALPHABET[Math.floor(n / 32 ** p) % 32]).join('');

const sdk = { ref, get, update, onValue, serverTimestamp };
// One admin (rules-off) connection for the whole run: opening a new one for every read made the run 3x slower.
let adminDb;
const admin = async (fn) => fn(adminDb);

// What is really in the database, in the model's terms (null if the table is gone).
async function realState(code) {
  const table = await admin(async (db) => (await get(ref(db, `tables/${code}`))).val());
  if (!table?.meta) return null;
  const members = {};
  for (const [uid, m] of Object.entries(table.members ?? {})) {
    members[uid] = { seat: m.seat, ready: m.ready === table.meta.match, conceded: m.conceded === table.meta.match, commander: m.commander ?? null, bracket: m.bracket ?? null, bracketGuess: m.bracketGuess ?? null };
  }
  // Firebase hands back numeric keys as an array with holes, so build a plain { seat: uid } map.
  const seats = {};
  for (const [seat, holder] of Object.entries(table.seats ?? {})) if (holder) seats[seat] = holder;
  return { host: table.meta.host, status: table.meta.status, match: table.meta.match, members, seats };
}
// Who holds the one-table-per-host slot for this table right now (the slots of all the people in this sequence).
const slotHolders = async (names, code) => {
  const holders = [];
  for (const uid of names) if ((await admin(async (db) => (await get(ref(db, `hosts/${uid}`))).val())) === code) holders.push(uid);
  return holders;
};

// Who should hold which seat according to the model: the people at the table, plus seats reserved for people who left mid-match.
const modelSeats = (model) => {
  const seats = {};
  for (const [uid, m] of Object.entries(model.members)) seats[m.seat] = uid;
  for (const [uid, seat] of Object.entries(model.reserved)) seats[seat] = uid;
  return seats;
};

const same = (model, real) => {
  if (!model.exists) return real === null;
  if (real === null) return false;
  return model.host === real.host && model.status === real.status && model.match === real.match
    && JSON.stringify(sortKeys(model.members)) === JSON.stringify(sortKeys(real.members))
    && JSON.stringify(sortKeys(modelSeats(model))) === JSON.stringify(sortKeys(real.seats));
};
const sortKeys = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, v]));
const show = (model) => (model.exists ? `${model.status} #${model.match} host ${model.host}${model.expired ? ' EXPIRED' : ''} members ${JSON.stringify(sortKeys(model.members))} seats ${JSON.stringify(sortKeys(modelSeats(model)))}` : 'table gone');

const findings = new Map(); // key -> { count, example }
const record = (key, example) => { const f = findings.get(key) ?? { count: 0, example }; f.count++; findings.set(key, f); };

const rand = random(SEED);
let stepsRun = 0;
let agreed = 0;
let stoppedSequences = 0;
// How often each (action, table state, verdict) was exercised, so a clean run can be checked for real coverage.
const coverage = new Map();
const cover = (key) => coverage.set(key, (coverage.get(key) ?? 0) + 1);
// Situations that only arise after a particular history, counted separately because they hide the awkward cases.
const situations = { deckChangeTookReadyBack: 0, sameDeckKeptReady: 0, cameBackToAReservedSeat: 0, matchEndedWithReservedSeats: 0, hostLeftAndHandedOver: 0, newHostActed: 0 };

async function run() {
for (let s = 0; s < SEQUENCES; s++) {
  const code = codeFor(s);
  const seats = 2 + Math.floor(rand() * 3);
  const names = ['h', 'a', 'b', 'c', 'z'].map((n) => `${n}${s}`);
  const people = {};
  for (const uid of names) {
    const db = env.authenticatedContext(uid).database();
    people[uid] = createTableOps({ sdk, db, getUid: async () => uid, makeCode: () => code });
  }
  const host = names[0];
  await people[host].createTable({ name: 'Host', seats });
  let model = newModelTable({ host, seats });
  const trace = [`seats ${seats}, host ${host}`];

  for (let i = 0; i < STEPS; i++) {
    // Two thirds of the time pick a move the model says is possible (so tables really get to ready, start, concede,
    // end the match and play again), the rest of the time any move at all (so the refusals get tested too).
    let action = pickAction(rand);
    // Most random moves are tried by someone who IS at the table (an outsider is refused for the obvious reason and
    // would hide whether the real checks work), a fifth by anyone.
    const seated = names.filter((n) => model.members[n]);
    const hostNow = model.host; // the host can change, so "the host" means whoever it is now
    let uid = action === 'expire' ? hostNow : (seated.length && rand() < 0.8 ? pick(rand, seated) : pick(rand, names));
    let target = pick(rand, names); // only used by passHost: who should become host (a member or not)
    let deck = pick(rand, DECKS); // only used by setDeck
    // Near misses: the host tries to start whenever (often too early: alone, or before everyone is ready), and a
    // seated player tries an action meant for the other state (ready during a match, conceding in the lobby).
    if (action !== 'expire' && rand() < 0.15) { action = 'start'; uid = hostNow; }
    else if (action !== 'expire' && seated.length && rand() < 0.2) { action = pick(rand, ['ready', 'unready', 'setDeck', 'setDeck', 'concede', 'endTable', 'leave', 'passHost']); uid = pick(rand, seated); }
    // Someone whose seat is reserved tries to come back (their browser crashed, say), and a mid-match leave is common.
    const away = Object.keys(model.reserved);
    if (away.length && rand() < 0.2) { action = 'join'; uid = pick(rand, away); }
    else if (away.length && model.status === 'playing' && rand() < 0.2) { action = 'endMatch'; uid = hostNow; }
    else if (model.exists && model.status === 'playing' && seated.length > 1 && rand() < 0.12) { action = 'leave'; uid = pick(rand, seated.filter((n) => n !== hostNow)); }
    // The host hands the table to another player often enough that the new host does things too.
    else if (model.exists && seated.length > 1 && rand() < 0.12) { action = 'passHost'; uid = hostNow; target = pick(rand, seated.filter((n) => n !== hostNow)); }
    if (rand() < 0.67 && !(away.length && action === 'join' && model.reserved[uid])) {
      const possible = [];
      for (const [name, weight] of WEIGHTED) {
        if (name === 'expire') continue;
        for (const who of names) {
          if (name === 'join' && model.members[who]) continue; // a rejoin by a member is not interesting here
          for (const aim of name === 'passHost' ? names : name === 'setDeck' ? DECKS : [undefined]) {
            if (step(model, who, name, aim).ok) possible.push([name, who, weight, aim]);
          }
        }
      }
      const total = possible.reduce((sum, p) => sum + p[2], 0);
      let r = rand() * total;
      for (const [name, who, weight, aim] of possible) { if ((r -= weight) < 0) { action = name; uid = who; if (name === 'passHost') target = aim; if (name === 'setDeck') deck = aim; break; } }
    }
    const before = model;
    let modelOk;
    let realOk;
    let detail = '';

    if (action === 'expire') {
      if (!model.exists) continue;
      await admin((db) => set(ref(db, `tables/${code}/meta/createdAt`), Date.now() - 9 * 3600000));
      model = expireTable(model);
      realOk = modelOk = true;
    } else {
      const result = step(model, uid, action, action === 'setDeck' ? deck : target);
      modelOk = result.ok;
      model = result.table;
      detail = result.why ?? '';
      const op = { join: () => people[uid].joinTable({ code, name: `P${uid}` }), ready: () => people[uid].setReady(code), unready: () => people[uid].clearReady(code), setDeck: () => people[uid].setDeck(code, deck), start: () => people[uid].startMatch(code), concede: () => people[uid].concede(code), endMatch: () => people[uid].endMatch(code), leave: () => people[uid].leaveTable(code), endTable: () => people[uid].endTable(code), passHost: () => people[uid].passHost(code, target) }[action];
      try { await op(); realOk = true; } catch (error) { realOk = false; detail = `${detail}${detail ? '; ' : ''}real: ${error.name}`; }
      // The new host's page claims the host slot as soon as it sees it is the host (only they can write their slot).
      if (realOk && modelOk && model.exists && model.host !== before.host) {
        try { await people[model.host].claimHostSlot(code); } catch (error) { realOk = false; detail = `${detail}${detail ? '; ' : ''}the new host could not claim the slot: ${error.name}: ${error.message}`; }
      }
    }
    stepsRun++;
    const who = uid === before.host ? 'host' : uid.replace(/\d+$/, '');
    trace.push(`${who} ${action}${action === 'passHost' ? ' to ' + target.replace(/\d+$/, '') : ''}: model ${modelOk ? 'allows' : 'refuses'}, real ${realOk ? 'allowed' : 'refused'}`);

    const tag = (before.status === 'playing' ? 'playing' : 'lobby') + (before.expired ? '+expired' : '') + (before.exists ? '' : '+gone');
    cover(`${action}|${tag}|${modelOk ? 'allowed' : 'refused'}`);
    if (action === 'setDeck' && modelOk && before.members[uid]?.ready && before.status === 'lobby') {
      if (!model.members[uid].ready) situations.deckChangeTookReadyBack++; else situations.sameDeckKeptReady++;
    }
    if (action === 'join' && modelOk && before.reserved[uid]) situations.cameBackToAReservedSeat++;
    if (action === 'endMatch' && modelOk && Object.keys(before.reserved).length) situations.matchEndedWithReservedSeats++;
    if (action === 'leave' && modelOk && uid === before.host && Object.keys(before.members).length > 1) situations.hostLeftAndHandedOver++;
    // A host-only action done by someone who was not the original host: the table really works under a new host.
    if (['start', 'endMatch', 'endTable', 'passHost'].includes(action) && modelOk && uid !== host) situations.newHostActed++;
    if (modelOk !== realOk) {
      record(`${action}|${tag}|model ${modelOk ? 'allows' : 'refuses'}, real ${realOk ? 'allows' : 'refuses'}`, `${trace.join(' > ')}  [${detail}]`);
      stoppedSequences++;
      break;
    }
    const real = await realState(code);
    if (!same(model, real)) {
      record(`${action}|${tag}|same verdict, different state`, `${trace.join(' > ')}\n      model: ${show(model)}\n      real:  ${real ? JSON.stringify(real) : 'table gone'}`);
      stoppedSequences++;
      break;
    }
    // The host slot: after a hand-over, only the current host holds the slot for this table.
    if (model.exists && action !== 'expire') {
      const holders = await slotHolders(names, code);
      if (holders.length !== 1 || holders[0] !== model.host) {
        record(`${action}|${tag}|wrong host slot`, `${trace.join(' > ')}\n      host is ${model.host}, slot holders: ${JSON.stringify(holders)}`);
        stoppedSequences++;
        break;
      }
    }
    agreed++;
  }
}
}
await env.withSecurityRulesDisabled(async (ctx) => { adminDb = ctx.database(); await run(); });

console.log(`Flow comparison: ${SEQUENCES} random sequences (seed ${SEED}), ${stepsRun} steps; the model and the page + rules agreed on ${agreed}; ${stoppedSequences} sequences stopped at a disagreement.`);
console.log('Coverage (action | table state | what the model said): count');
for (const [key, count] of [...coverage].sort()) console.log(`  ${key}: ${count}`);
console.log(`Situation: a ready player changed their deck and was un-readied: ${situations.deckChangeTookReadyBack} time(s)`);
console.log(`Situation: a ready player sent the same deck again and stayed ready: ${situations.sameDeckKeptReady} time(s)`);
console.log(`Situation: a player came back to their reserved seat mid-match: ${situations.cameBackToAReservedSeat} time(s)`);
console.log(`Situation: a match ended while seats were reserved for players who had left: ${situations.matchEndedWithReservedSeats} time(s)`);
console.log(`Situation: a host left with others at the table and the table was handed on: ${situations.hostLeftAndHandedOver} time(s)`);
console.log(`Situation: someone other than the original host did a host-only action: ${situations.newHostActed} time(s)`);
let unknown = 0;
for (const [key, f] of [...findings].sort()) {
  const known = KNOWN[key];
  if (!known) unknown++;
  console.log(`\n${known ? `KNOWN (${known.kind})` : 'UNKNOWN'}: ${key}  x${f.count}`);
  if (known) console.log(`  ${known.text}`);
  console.log(`  example: ${f.example}`);
}
await env.cleanup();
// Disagreements come first: they are the cause, and a sequence stopped by one also lowers the coverage numbers below.
if (unknown) {
  console.log(`\n${unknown} disagreement kind(s) are not in KNOWN. Decide each: a bug in the code, a bug in the model, or a design question.`);
  process.exit(1);
}
// A clean run only means something if the awkward situations and every action really happened (a passing run that never
// started a match, or never handed a table over, proves nothing).
const gaps = Object.entries(situations).filter(([, count]) => !count).map(([name]) => name);
// Also required: a deck change tried during a match (it must be refused, by the model and by the page alike).
const missingCases = ['setDeck|playing|refused'].filter((key) => !coverage.has(key));
const neverWorked = ACTIONS.filter((a) => ![...coverage.keys()].some((k) => k.startsWith(`${a}|`) && k.endsWith('|allowed')));
if (gaps.length || neverWorked.length || missingCases.length) {
  if (missingCases.length) console.log(`
COVERAGE GAP: these cases never happened in this run: ${missingCases.join(', ')}`);
  if (gaps.length) console.log(`\nCOVERAGE GAP: the run never reached these situations: ${gaps.join(', ')}`);
  if (neverWorked.length) console.log(`\nCOVERAGE GAP: these actions never succeeded in this run, so they were not compared: ${neverWorked.join(', ')}`);
  process.exit(1);
}
console.log(`\nAll ${agreed} flow steps passed: the design and the code agree (${findings.size} known finding(s) listed above).`);
