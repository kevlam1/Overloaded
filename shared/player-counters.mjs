// What the player counters (poison, energy, experience, rad, ticket, speed, the Ring, and the monarch, initiative and city's blessing marks) and commander damage look like and do. Plain data in, plain data out, no browser
// code, so Node tests can load it (scripts/test-player-counters.mjs). The chips are drawn by frontend/src/counter-chips.js and the icons by frontend/src/counter-icons.js.
//
// The data is in shared/zones.mjs: game.pc is { poison: n, rad: n, monarch: 1, ... } (only what is above 0) and game.cd is { '1': n, '2': n, '3': n, '4': n }, the
// commander damage the player has TAKEN from the commander of each seat (only counts above 0 are stored). So commander damage is
// already one number per player, and everything here keeps it that way: commanderDamageEntry() is ONE player's damage, and
// commanderDamageEntries() is only a list of those. A page can therefore show them all next to the life total (today) or put each entry in
// the panel of the player it came from (a later design) without changing any logic: an entry is one chip (frontend/src/counter-chips.js).
//
// Nothing here is enforced: poison 10 and commander damage 21 are shown as lethal, like a friend saying so across the table. The game
// goes on, because this is casual play and players manage their own cards and numbers.
import { PLAYER_COUNTERS, PLAYER_FLAGS, COMMANDER_SEATS, MAX_COUNT, changePlayerCounter, changeCommanderDamage } from './zones.mjs';

export const POISON_LETHAL = 10;
export const COMMANDER_LETHAL = 21; // damage from ONE commander
export const COUNTER_LABELS = { poison: 'Poison', energy: 'Energy', experience: 'Experience', rad: 'Rad', ticket: 'Ticket', speed: 'Speed', ring: 'The Ring tempts you', monarch: 'Monarch', initiative: 'Initiative', blessing: "City's blessing" };
const LETHAL_AT = { poison: POISON_LETHAL };
// The counters the PUBLISHED database rules accept under public/{uid}/pc. The live table offers only these until the rules are changed to take the rest
// (the whole public branch of a player is refused if one key is not allowed). Change this, and only this, when the new rules are pasted.
export const PUBLISHED_COUNTERS = ['poison', 'energy', 'experience'];
export const offeredCounters = ({ live = false } = {}) => (live ? PLAYER_COUNTERS.filter((kind) => PUBLISHED_COUNTERS.includes(kind)) : [...PLAYER_COUNTERS]);
export const COUNTER_STEPS = [-1, 1]; // the buttons of a player counter
export const DAMAGE_STEPS = [-5, -1, 1, 5]; // the buttons of commander damage, like the life buttons

const whole = (value) => (Number.isInteger(value) && value > 0 ? Math.min(value, MAX_COUNT) : 0);
const clamp = (value) => Math.min(MAX_COUNT, Math.max(0, value));

// ---- player counters ----
// One counter: { id, kind, label, count, lethalAt, lethal }. pc is game.pc (or nothing).
export function counterEntry(kind, pc) {
  if (!PLAYER_COUNTERS.includes(kind)) throw new Error('That is not a counter a player can have.');
  const count = whole(pc?.[kind]);
  const lethalAt = LETHAL_AT[kind] ?? null;
  return { id: `counter:${kind}`, kind, label: COUNTER_LABELS[kind], count: PLAYER_FLAGS.includes(kind) ? Math.min(count, 1) : count, flag: PLAYER_FLAGS.includes(kind), lethalAt, lethal: lethalAt !== null && count >= lethalAt };
}
export const playerCounterEntries = (pc) => PLAYER_COUNTERS.map((kind) => counterEntry(kind, pc));

// ---- commander damage ----
// ONE player's commander damage: the damage taken from the commander of `seat`. name is that player's name (other people's text: the
// page puts it in as text, never as markup). { id, seat, name, label, count, lethalAt, lethal }
export function commanderDamageEntry(cd, seat, name = '') {
  if (!COMMANDER_SEATS.includes(seat)) throw new Error('Commander damage comes from a seat from 1 to 4.');
  const count = whole(cd?.[seat]);
  const who = typeof name === 'string' ? name : '';
  return { id: `damage:${seat}`, seat, name: who, label: who ? `Seat ${seat}: ${who}` : `Seat ${seat}`, count, lethalAt: COMMANDER_LETHAL, lethal: count >= COMMANDER_LETHAL };
}

// Whose commander can have dealt damage at this table: [{ uid, seat, name }] in seat order, from the table's members (each { name, seat,
// commander? }). A seat counts when its player has a commander, or when damage from it is already recorded, so nothing recorded is hidden.
export function commanderDamageSeats(members, cd = null) {
  const seats = [];
  for (const [uid, member] of Object.entries(members && typeof members === 'object' ? members : {})) {
    const seat = String(member?.seat ?? '');
    if (!COMMANDER_SEATS.includes(seat)) continue;
    const hasCommander = typeof member.commander === 'string' && member.commander.trim() !== '';
    if (hasCommander || whole(cd?.[seat]) > 0) seats.push({ uid, seat, name: typeof member.name === 'string' ? member.name : '' });
  }
  return seats.sort((a, b) => Number(a.seat) - Number(b.seat));
}
export const commanderDamageEntries = (cd, seats) => seats.map(({ seat, name }) => commanderDamageEntry(cd, seat, name));

// The seats to show for a table of this format: in a Commander game every seat with a commander; in any other format (Standard has no
// commanders) only seats whose damage is already recorded, so nothing that was recorded is ever hidden.
export function commanderDamageSeatsFor(members, cd, format) {
  const seats = commanderDamageSeats(members, cd);
  return format === 'commander' ? seats : seats.filter(({ seat }) => whole(cd?.[seat]) > 0);
}

// ---- doing it ----
// A change to one of your own counters: { run(game) -> game, message }. game is the game now, only to word the message ("Poison 3.").
export function counterAction(game, kind, delta) {
  const next = clamp((whole(game?.pc?.[kind])) + delta);
  return { run: (current) => changePlayerCounter(current, kind, delta), message: `${COUNTER_LABELS[kind] ?? kind} ${next}.` };
}
export function damageAction(game, seat, delta, name = '') {
  const next = clamp(whole(game?.cd?.[seat]) + delta);
  return { run: (current) => changeCommanderDamage(current, seat, delta), message: `Commander damage from ${name || `seat ${seat}`}: ${next}${next >= COMMANDER_LETHAL ? ' (lethal)' : ''}.` };
}

// ---- words ----
// The counters above 0 as one sentence, for a screen reader and for another player's panel: "Poison 3 (lethal at 10). Commander damage:
// 7 from Seat 1: Alice, 21 from Seat 2: Bob (lethal)." Empty when there is nothing.
export function countersSentence(counterEntries, damageEntries = []) {
  const parts = counterEntries.filter((entry) => entry.count > 0).map((entry) => `${entry.label}${entry.flag ? '' : ` ${entry.count}`}${entry.lethal ? ' (lethal)' : ''}.`);
  const hits = damageEntries.filter((entry) => entry.count > 0);
  if (hits.length) parts.push(`Commander damage: ${hits.map((entry) => `${entry.count} from ${entry.label}${entry.lethal ? ' (lethal)' : ''}`).join(', ')}.`);
  return parts.join(' ');
}

// ---- what a player shows next to their life, and what the right-click menu of the life offers ----
// The chips to draw: every counter above 0 (a mark such as the monarch is one chip with no number), then the commander damage above 0. Each is an
// entry from counterEntry() or commanderDamageEntry(), in a fixed order, so the same game always draws the same chips.
export function chipEntries(pc, cd = null, seats = []) {
  const counters = playerCounterEntries(pc).filter((entry) => entry.count > 0);
  const damage = commanderDamageEntries(cd, seats).filter((entry) => entry.count > 0);
  return [...counters, ...damage];
}

const STEP_ITEMS = (count) => [
  { suffix: '+1', label: 'Add 1' }, { suffix: '+5', label: 'Add 5' },
  ...(count > 0 ? [{ suffix: '-1', label: 'Remove 1' }] : []),
  ...(count >= 2 ? [{ suffix: '-5', label: count > 5 ? 'Remove 5' : 'Remove all' }] : []),
];

// The items of the menu opened by a right-click on your own life: every counter a player can have (a count with Add and Remove inside it, a mark
// as one choice that turns it on or off), then, when seats are given, the commander damage taken from each of them. { live } limits the counters to what the
// database accepts; seats is [{ seat, name }] (commanderDamageSeatsFor).
export function playerMenuItems(game, { live = false, seats = [] } = {}) {
  const items = offeredCounters({ live }).map((kind) => {
    const entry = counterEntry(kind, game?.pc);
    if (entry.flag) return { id: `flag:${kind}`, label: `${entry.label}: ${entry.count ? 'on' : 'off'}` };
    return { id: `counter:${kind}`, label: `${entry.label}: ${entry.count}`, items: STEP_ITEMS(entry.count).map(({ suffix, label }) => ({ id: `counter:${kind}:${suffix}`, label })) };
  });
  for (const { seat, name } of seats) {
    const entry = commanderDamageEntry(game?.cd, seat, name);
    items.push({ id: `damage:${seat}`, label: `Commander damage from ${entry.label}: ${entry.count}`, items: STEP_ITEMS(entry.count).map(({ suffix, label }) => ({ id: `damage:${seat}:${suffix}`, label })) });
  }
  return items;
}

// What a choice in that menu does: { run(game) -> game, message } or null for an id that is not one. names maps a seat to the player's name (for the words).
export function playerAction(id, game, { live = false, names = {} } = {}) {
  if (typeof id !== 'string') return null;
  const flag = /^flag:([a-z]+)$/.exec(id);
  if (flag) {
    const kind = flag[1];
    if (!PLAYER_FLAGS.includes(kind) || !offeredCounters({ live }).includes(kind)) return null;
    const on = whole(game?.pc?.[kind]) > 0;
    return { run: (current) => changePlayerCounter(current, kind, on ? -1 : 1), message: `${COUNTER_LABELS[kind]}: ${on ? 'off' : 'on'}.` };
  }
  const counter = /^counter:([a-z]+):([+-])(\d+)$/.exec(id);
  if (counter) {
    const kind = counter[1];
    if (!PLAYER_COUNTERS.includes(kind) || PLAYER_FLAGS.includes(kind) || !offeredCounters({ live }).includes(kind)) return null;
    const delta = Number(counter[3]) * (counter[2] === '-' ? -1 : 1);
    return counterAction(game, kind, delta);
  }
  const damage = /^damage:([1-4]):([+-])(\d+)$/.exec(id);
  if (damage) return damageAction(game, damage[1], Number(damage[3]) * (damage[2] === '-' ? -1 : 1), names[damage[1]] ?? '');
  return null;
}
