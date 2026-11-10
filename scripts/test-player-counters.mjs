// Checks shared/player-counters.mjs: what poison, energy, experience and commander damage show, who commander damage can come from,
// what each button does to a real game, and that ONE player's commander damage stands on its own (so a page can place it anywhere).
// Run from the repo root:  node scripts/test-player-counters.mjs
import {
  POISON_LETHAL, COMMANDER_LETHAL, COUNTER_LABELS, COUNTER_STEPS, DAMAGE_STEPS,
  counterEntry, playerCounterEntries, commanderDamageEntry, commanderDamageSeats, commanderDamageEntries, commanderDamageSeatsFor, counterAction, damageAction, countersSentence,
  PUBLISHED_COUNTERS, offeredCounters, chipEntries, playerMenuItems, playerAction,
} from '../shared/player-counters.mjs';
import { makeGame, seededRandom, checkGame, PLAYER_COUNTERS, COMMANDER_SEATS, MAX_COUNT } from '../shared/zones.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const check = (label, condition, detail = '') => { checks++; if (!condition) fail(label, detail); };
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };
const refused = (label, run, words) => {
  checks++;
  try { run(); } catch (error) { if (error instanceof Error && (!words || words.test(error.message))) return; fail(label, `wrong message: ${error.message}`); }
  fail(label, 'was accepted');
};
const deepFreeze = (value) => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(deepFreeze); } return value; };

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const deck = { cards: [{ i: id(1), n: 'Forest', qty: 30, section: 'main' }], commander: [] };
const fresh = () => makeGame(deck, () => ({ t: 'Basic Land - Forest', m: '', k: [] }), { random: seededRandom(1) });

// ---- the constants are what the design says ----
same('what a player can have: six counts and three marks', PLAYER_COUNTERS, ['poison', 'energy', 'experience', 'rad', 'ticket', 'speed', 'ring', 'monarch', 'initiative', 'blessing']);
same('every one has words', PLAYER_COUNTERS.map((kind) => COUNTER_LABELS[kind]), ['Poison', 'Energy', 'Experience', 'Rad', 'Ticket', 'Speed', 'The Ring tempts you', 'Monarch', 'Initiative', "City's blessing"]);
check('poison is lethal at 10 and commander damage at 21 (from one commander)', POISON_LETHAL === 10 && COMMANDER_LETHAL === 21);
same('the buttons of a counter and of commander damage', [COUNTER_STEPS, DAMAGE_STEPS], [[-1, 1], [-5, -1, 1, 5]]);

// ---- player counters ----
same('a player with no counters shows each at 0, not lethal, in the fixed order', playerCounterEntries(undefined).slice(0, 3).map((e) => [e.id, e.count, e.lethal]), [['counter:poison', 0, false], ['counter:energy', 0, false], ['counter:experience', 0, false]]);
same('the counts come from the game', playerCounterEntries({ poison: 3, experience: 7 }).slice(0, 3).map((e) => e.count), [3, 0, 7]);
same('an entry says what it is', counterEntry('poison', { poison: 3 }), { id: 'counter:poison', kind: 'poison', label: 'Poison', count: 3, flag: false, lethalAt: 10, lethal: false });
for (const [count, lethal] of [[0, false], [1, false], [9, false], [10, true], [11, true], [1000, true]]) check(`poison ${count} is ${lethal ? '' : 'not '}lethal`, counterEntry('poison', { poison: count }).lethal === lethal);
for (const kind of ['energy', 'experience']) check(`${kind} is never lethal, even at ${MAX_COUNT.toLocaleString('en-US')}`, !counterEntry(kind, { [kind]: MAX_COUNT }).lethal && counterEntry(kind, { [kind]: 99 }).lethalAt === null);
for (const bad of [-1, 1.5, '3', null, undefined, NaN, Infinity, [3], {}, true]) check(`a damaged count ${JSON.stringify(bad)} shows as 0`, counterEntry('poison', { poison: bad }).count === 0);
check('a count past the limit stops at it', counterEntry('energy', { energy: MAX_COUNT * 5 }).count === MAX_COUNT);
for (const bad of ['', 'loyalty', 'Poison', 'Monarch', '__proto__', 'constructor', 5, null, undefined]) refused(`${JSON.stringify(bad)} is not a counter`, () => counterEntry(bad, {}), /not a counter/);
check('a missing or odd game object does not crash it', playerCounterEntries(null).every((e) => e.count === 0) && playerCounterEntries('x').every((e) => e.count === 0) && playerCounterEntries([5]).every((e) => e.count === 0));

// ---- commander damage: ONE player's entry ----
same('an entry says whose commander it is from', commanderDamageEntry({ '2': 7 }, '2', 'Bob'), { id: 'damage:2', seat: '2', name: 'Bob', label: 'Seat 2: Bob', count: 7, lethalAt: 21, lethal: false });
same('with no name it is just the seat', [commanderDamageEntry({}, '3').label, commanderDamageEntry({}, '3', '').label, commanderDamageEntry({}, '3', 42).name, commanderDamageEntry({}, '3', null).label], ['Seat 3', 'Seat 3', '', 'Seat 3']);
for (const [count, lethal] of [[0, false], [20, false], [21, true], [22, true], [500, true]]) check(`${count} from one commander is ${lethal ? '' : 'not '}lethal`, commanderDamageEntry({ '1': count }, '1').lethal === lethal);
for (const seat of COMMANDER_SEATS) check(`seat ${seat} is a seat`, commanderDamageEntry({ [seat]: 4 }, seat).count === 4);
for (const bad of ['0', '5', '', '01', 1, 2, null, undefined, '__proto__', 'constructor', '1 ', ' 1']) refused(`${JSON.stringify(bad)} is not a seat`, () => commanderDamageEntry({}, bad), /seat from 1 to 4/);
for (const bad of [-3, 2.5, '7', null, NaN, [7], true]) check(`damaged damage ${JSON.stringify(bad)} shows as 0`, commanderDamageEntry({ '1': bad }, '1').count === 0);
check('damage from one seat never shows as damage from another', commanderDamageEntry({ '1': 9 }, '2').count === 0 && commanderDamageEntry({ '1': 9 }, '1').count === 9);
check('names are kept as text exactly (they are put in the page as text, never markup)', commanderDamageEntry({}, '1', '<img src=x onerror=1>').name === '<img src=x onerror=1>');

// ---- the same player's entry stands alone, wherever the page puts it ----
{
  const cd = { '1': 3, '2': 21, '4': 8 };
  const seats = [{ seat: '1', name: 'Alice' }, { seat: '2', name: 'Bob' }, { seat: '3', name: 'Cy' }, { seat: '4', name: 'Dee' }];
  const list = commanderDamageEntries(cd, seats);
  same('the list is only the single entries, one per player, in the order given', list, seats.map((s) => commanderDamageEntry(cd, s.seat, s.name)));
  same('so a page can ask for just one player (here seat 2) and get exactly the entry the list holds', commanderDamageEntry(cd, '2', 'Bob'), list[1]);
  check('one entry does not depend on the others', commanderDamageEntry({ '2': 21 }, '2', 'Bob').count === list[1].count && commanderDamageEntry({ '2': 21, '1': 99, '3': 99, '4': 99 }, '2', 'Bob').count === list[1].count);
  same('an empty list of seats is an empty list', commanderDamageEntries(cd, []), []);
}

// ---- whose commander can have dealt damage ----
{
  const members = {
    u3: { name: 'Cy', seat: '3', commander: 'Krenko, Mob Boss' },
    u1: { name: 'Alice', seat: '1', commander: 'Tymna the Weaver & Thrasios, Triton Hero' },
    u2: { name: 'Bob', seat: '2' }, // no commander chosen
    u4: { name: 'Dee', seat: '4', commander: '   ' }, // only spaces
  };
  same('only players with a commander, in seat order', commanderDamageSeats(members).map((s) => [s.seat, s.name, s.uid]), [['1', 'Alice', 'u1'], ['3', 'Cy', 'u3']]);
  same('a seat with damage already recorded stays, even with no commander', commanderDamageSeats(members, { '2': 4 }).map((s) => s.seat), ['1', '2', '3']);
  same('recorded damage of 0 or damaged does not add a seat', commanderDamageSeats(members, { '2': 0, '4': -1, '3': 'x' }).map((s) => s.seat), ['1', '3']);
  same('members with an odd seat are left out', commanderDamageSeats({ a: { name: 'A', seat: '9', commander: 'X' }, b: { name: 'B', seat: 2, commander: 'Y' }, c: { name: 'C', commander: 'Z' }, d: null, e: 'x' }).map((s) => s.seat), ['2']);
  same('a name that is not text becomes empty', commanderDamageSeats({ a: { name: 5, seat: '1', commander: 'X' } })[0].name, '');
  same('no members at all, or something that is not a table', [commanderDamageSeats({}), commanderDamageSeats(null), commanderDamageSeats(undefined), commanderDamageSeats('x'), commanderDamageSeats([1])], [[], [], [], [], []]);
  check('commander text of an unusual kind is not a commander', commanderDamageSeats({ a: { name: 'A', seat: '1', commander: 5 } }).length === 0 && commanderDamageSeats({ a: { name: 'A', seat: '1', commander: ['X'] } }).length === 0);
  const frozen = deepFreeze(JSON.parse(JSON.stringify(members)));
  check('does not change the members it is given', commanderDamageSeats(frozen).length === 2);
}

// ---- the format decides which seats are shown ----
{
  const members = { a: { name: 'Alice', seat: '1', commander: 'Tymna the Weaver' }, b: { name: 'Bob', seat: '2' }, c: { name: 'Cy', seat: '3', commander: 'Krenko, Mob Boss' } };
  same('a Commander game shows every seat with a commander', commanderDamageSeatsFor(members, {}, 'commander').map((s) => s.seat), ['1', '3']);
  same('and a seat with damage already recorded', commanderDamageSeatsFor(members, { '2': 4 }, 'commander').map((s) => s.seat), ['1', '2', '3']);
  same('a Standard game has no commanders, so only recorded damage shows (here none)', commanderDamageSeatsFor(members, {}, 'standard'), []);
  same('and recorded damage is never hidden, even in Standard', commanderDamageSeatsFor(members, { '3': 2 }, 'standard').map((s) => s.seat), ['3']);
  same('an unknown or missing format is treated like Standard', [commanderDamageSeatsFor(members, {}, undefined), commanderDamageSeatsFor(members, {}, null), commanderDamageSeatsFor(members, {}, 'Commander'), commanderDamageSeatsFor(members, {}, '')], [[], [], [], []]);
  same('it never makes up a seat', commanderDamageSeatsFor({}, { '1': 5 }, 'commander'), []);
}

// ---- doing it: your own counters ----
{
  const game = deepFreeze(fresh());
  const plus = counterAction(game, 'poison', 1);
  same('adding a poison counter says the new count', plus.message, 'Poison 1.');
  const once = plus.run(game);
  same('and does it', once.pc, { poison: 1 });
  check('the old game is not changed (it is frozen)', !('pc' in game));
  same('a second counter kind is kept next to it', counterAction(once, 'energy', 4).run(once).pc, { poison: 1, energy: 4 });
  const ten = counterAction(once, 'poison', 9);
  same('ten poison counters', [ten.message, ten.run(once).pc.poison], ['Poison 10.', 10]);
  same('taking one off goes back down', counterAction(ten.run(once), 'poison', -1).run(ten.run(once)).pc.poison, 9);
  const zero = counterAction(once, 'poison', -1);
  same('taking the last one off says 0 and stores nothing at all for it', [zero.message, 'pc' in zero.run(once)], ['Poison 0.', false]);
  const below = counterAction(game, 'experience', -5);
  same('taking one off at 0 stays at 0 (never below), and says so', [below.message, 'pc' in below.run(game)], ['Experience 0.', false]);
  const big = counterAction(game, 'energy', MAX_COUNT);
  same('a change cannot pass the limit: the count stops at it', [big.run(game).pc.energy, counterAction(big.run(game), 'energy', 5).run(big.run(game)).pc.energy, counterAction(big.run(game), 'energy', 5).message], [MAX_COUNT, MAX_COUNT, `Energy ${MAX_COUNT}.`]);
  for (const bad of [0, 1.5, '2', null, NaN, Infinity, MAX_COUNT + 1]) refused(`a change of ${JSON.stringify(bad)} is refused when it is run`, () => counterAction(game, 'poison', bad).run(game), /whole number/);
  refused('an unknown counter is refused when it is run', () => counterAction(game, 'loyalty', 1).run(game), /not a counter/);
  same('every step of the buttons works', COUNTER_STEPS.map((step) => counterAction(once, 'poison', step).run(once).pc?.poison ?? 0), [0, 2]);
  same('the game with counters is consistent', checkGame(counterAction(once, 'energy', 3).run(once)), []);
}

// ---- doing it: commander damage ----
{
  const game = deepFreeze(fresh());
  const hit = damageAction(game, '2', 7, 'Bob');
  same('7 damage from Bob says so', hit.message, 'Commander damage from Bob: 7.');
  const hurt = hit.run(game);
  same('and records it under his seat', hurt.cd, { '2': 7 });
  check('nothing else changed: no other seat, no counters, the same life', !('pc' in hurt) && hurt.life === game.life && Object.keys(hurt.cd).join() === '2');
  const lethal = damageAction(hurt, '2', 14, 'Bob');
  same('reaching 21 says lethal', lethal.message, 'Commander damage from Bob: 21 (lethal).');
  same('20 is not lethal yet', damageAction(hurt, '2', 13, 'Bob').message, 'Commander damage from Bob: 20.');
  same('a nameless seat is worded by its number', damageAction(game, '4', 3).message, 'Commander damage from seat 4: 3.');
  same('two seats are tracked apart', damageAction(hurt, '3', 5, 'Cy').run(hurt).cd, { '2': 7, '3': 5 });
  const gone = damageAction(hurt, '2', -7, 'Bob');
  same('taking all of it off stores nothing for that seat', [gone.message, 'cd' in gone.run(hurt)], ['Commander damage from Bob: 0.', false]);
  same('taking more off than there is stops at 0', damageAction(hurt, '2', -50, 'Bob').run(hurt).cd, undefined);
  same('every step of the buttons works', DAMAGE_STEPS.map((step) => damageAction(hurt, '2', step, 'Bob').run(hurt).cd?.['2'] ?? 0), [2, 6, 8, 12]);
  for (const bad of ['0', '5', 1, '', null, '__proto__']) refused(`seat ${JSON.stringify(bad)} is refused when it is run`, () => damageAction(game, bad, 1).run(game), /seat from 1 to 4/);
  for (const bad of [0, 1.5, '2', null, NaN]) refused(`a change of ${JSON.stringify(bad)} is refused when it is run`, () => damageAction(game, '1', bad).run(game), /whole number/);
  same('the game with commander damage is consistent', checkGame(hurt), []);
  check('the old game is not changed (it is frozen)', !('cd' in game));
}

// ---- words ----
{
  const counters = playerCounterEntries({ poison: 10, energy: 2 });
  const damage = commanderDamageEntries({ '1': 7, '2': 21 }, [{ seat: '1', name: 'Alice' }, { seat: '2', name: 'Bob' }, { seat: '3', name: 'Cy' }]);
  same('counters above 0 and the damage above 0, lethal marked', countersSentence(counters, damage), 'Poison 10 (lethal). Energy 2. Commander damage: 7 from Seat 1: Alice, 21 from Seat 2: Bob (lethal).');
  same('only counters', countersSentence(playerCounterEntries({ experience: 3 })), 'Experience 3.');
  same('only damage', countersSentence(playerCounterEntries({}), damage.slice(0, 1)), 'Commander damage: 7 from Seat 1: Alice.');
  same('nothing at all is an empty sentence', [countersSentence(playerCounterEntries({}), damage.slice(2)), countersSentence([], [])], ['', '']);
}

// ---- the new counters, the chips and the menu of the life total ----
{
  const live = offeredCounters({ live: true });
  same('the live table offers only what the published rules accept', [live, PUBLISHED_COUNTERS], [['poison', 'energy', 'experience'], ['poison', 'energy', 'experience']]);
  same('a solo table offers everything', offeredCounters({ live: false }), PLAYER_COUNTERS);
  same('a mark is on or off: an entry of 7 monarchs is 1', [counterEntry('monarch', { monarch: 7 }).count, counterEntry('monarch', { monarch: 7 }).flag, counterEntry('poison', {}).flag], [1, true, false]);
  same('rad is a count and never lethal', [counterEntry('rad', { rad: 50 }).lethal, counterEntry('rad', { rad: 50 }).lethalAt], [false, null]);
  same('no chips for a player with nothing', chipEntries(undefined), []);
  same('the chips are the counters above 0 in the fixed order, then the commander damage', chipEntries({ monarch: 1, poison: 3, rad: 2 }, { 2: 21 }, [{ seat: '2', name: 'Bob' }]).map((e) => [e.id, e.count]), [['counter:poison', 3], ['counter:rad', 2], ['counter:monarch', 1], ['damage:2', 21]]);
  same('damage from a seat that is not listed has no chip', chipEntries({}, { 3: 5 }, [{ seat: '2', name: 'Bob' }]), []);

  const game = fresh();
  const solo = playerMenuItems(game);
  same('the solo menu has one entry for each of the nine, counts opening Add and Remove, marks being one choice', solo.map((i) => [i.id, i.items ? i.items.map((x) => x.id.split(':').pop()) : null]), PLAYER_COUNTERS.map((kind) => [kind === 'monarch' || kind === 'initiative' || kind === 'blessing' ? `flag:${kind}` : `counter:${kind}`, kind === 'monarch' || kind === 'initiative' || kind === 'blessing' ? null : ['+1', '+5']]));
  same('the live menu has only the published counters', playerMenuItems(game, { live: true }).map((i) => i.id), ['counter:poison', 'counter:energy', 'counter:experience']);
  same('with something to take off, Remove appears; with more than one, Remove all or Remove 5', playerMenuItems({ pc: { poison: 1, energy: 3, experience: 9 } }).slice(0, 3).map((i) => i.items.map((x) => x.label)), [['Add 1', 'Add 5', 'Remove 1'], ['Add 1', 'Add 5', 'Remove 1', 'Remove all'], ['Add 1', 'Add 5', 'Remove 1', 'Remove 5']]);
  same('the labels show what is on now', [playerMenuItems({ pc: { poison: 4, monarch: 1 } }).filter((i) => ['counter:poison', 'flag:monarch', 'flag:initiative'].includes(i.id)).map((i) => i.label)], [['Poison: 4', 'Monarch: on', 'Initiative: off']]);
  const withSeats = playerMenuItems({ cd: { 2: 3 } }, { live: true, seats: [{ seat: '1', name: 'Alice' }, { seat: '2', name: 'Bob' }] });
  same('commander damage comes after the counters, one entry per seat', [withSeats.slice(-2).map((i) => i.id), withSeats.at(-1).label], [['damage:1', 'damage:2'], 'Commander damage from Seat 2: Bob: 3']);

  const act = (id, g = game, options) => playerAction(id, g, options);
  same('adding rad and taking it away', [act('counter:rad:+5').run(game).pc, act('counter:rad:-1', { ...game, pc: { rad: 5 } }).run({ ...game, pc: { rad: 5 } }).pc], [{ rad: 5 }, { rad: 4 }]);
  same('and says so', act('counter:rad:+5').message, 'Rad 5.');
  same('a mark toggles and says so', [act('flag:monarch').run(game).pc, act('flag:monarch').message, act('flag:monarch', { ...game, pc: { monarch: 1 } }).message, 'pc' in act('flag:monarch', { ...game, pc: { monarch: 1 } }).run({ ...game, pc: { monarch: 1 } })], [{ monarch: 1 }, 'Monarch: on.', 'Monarch: off.', false]);
  same('commander damage by menu', [act('damage:2:+5', game, { names: { 2: 'Bob' } }).run(game).cd, act('damage:2:+5', game, { names: { 2: 'Bob' } }).message], [{ 2: 5 }, 'Commander damage from Bob: 5.']);
  same('on the live table a counter the rules do not accept is refused, a published one is fine', [act('counter:rad:+1', game, { live: true }), act('flag:monarch', game, { live: true }), act('counter:poison:+1', game, { live: true }) !== null], [null, null, true]);
  same('ids that are not choices give nothing', ['', 'counter', 'counter:poison', 'counter:poison:+x', 'counter:loyalty:+1', 'counter:monarch:+1', 'flag:poison', 'flag:rad', 'damage:5:+1', 'damage:2', 7, null, undefined, 'counter:poison:+1; drop'].map((x) => act(x)), Array(14).fill(null));
  check('a random walk of menu choices keeps the game consistent', (() => {
    const random = seededRandom(5);
    let g = fresh();
    for (let step = 0; step < 600; step++) {
      const items = playerMenuItems(g, { seats: [{ seat: '1', name: 'A' }, { seat: '3', name: 'C' }] });
      const item = items[Math.floor(random() * items.length)];
      const choices = item.items ?? [item];
      const choice = choices[Math.floor(random() * choices.length)];
      const action = act(choice.id, g);
      if (!action) return false;
      g = action.run(g);
      if (checkGame(g).length) return false;
    }
    return true;
  })());
}

console.log(`All ${checks} player counter checks passed.`);
