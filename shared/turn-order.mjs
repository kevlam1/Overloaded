// Whose turn it is at a table, and how a turn is passed. Plain data in, plain data out, no browser or network code, so Node tests can load
// it (scripts/test-turn-order.mjs). The table pages draw it and run it.
//
// THE DESIGN. A player can only write their own part of the database, so "pass the turn to Bob" cannot write to Bob. Instead the player who
// passes writes ONE small record on their OWN public branch, game.pass = { n, to }: n is the number of the turn that now begins, and to is
// the seat whose turn it is. Every page can read everyone's public branch, so every page finds the newest record (the one with the largest n)
// and that is the turn: its n is the table's turn number and its `to` is the active seat. The player it names sees it and starts their turn
// (shared/zones.mjs startTurn: untap, draw, clear summoning sickness, set the turn number). Nothing else is stored, so no database rule is new.
//
// Why this holds up: the record names the next seat when it is written (skipping players who conceded or left), so a later change of who
// is at the table does not move an earlier turn; a refresh reads the same newest record and, because the player's own turn number is then
// already caught up, starts nothing twice; and taking a pass back is only deleting your own record, which makes the previous newest record
// the turn again (the previous pass is still on its writer's branch until that player passes again).
//
// The turn number is the TABLE's turn number (seat 1 plays turn 1, seat 2 turn 2, seat 3 turn 3, seat 4 turn 4, then seat 1 turn 5), as turns
// are counted in the game. Nothing is enforced: anyone may press Pass turn or Skip, because players are friends at a table and sometimes a
// player has left the room.
import { COMMANDER_SEATS, MAX_TURN } from './zones.mjs';

const SEATS = COMMANDER_SEATS; // '1' to '4': the seats a table has

const validTurnAndSeat = (raw) => Boolean(raw) && typeof raw === 'object' && !Array.isArray(raw) && Number.isInteger(raw.n) && raw.n >= 2 && raw.n <= MAX_TURN && typeof raw.to === 'string' && SEATS.includes(raw.to);

// A stored pass record, checked: { n, to, from? } or null. n is a whole number from 2 (turn 1 needs no pass) to the largest turn; to is a
// seat. from is the turn this pass replaced ({ n, to }, with a smaller n; none when it replaced turn 1): a player keeps only their LATEST
// record, so without it a pass written right after another of their own (skipping a player) could not be taken back to the right turn.
// A damaged from is dropped; the rest of the record still counts.
export function validPass(raw) {
  if (!validTurnAndSeat(raw)) return null;
  const pass = { n: raw.n, to: raw.to };
  if (validTurnAndSeat(raw.from) && raw.from.n < raw.n) pass.from = { n: raw.from.n, to: raw.from.to };
  return pass;
}

// The players at a table in seat order: [{ uid, seat, name }]. members is the table's members ({ uid: { name, seat } }).
export function seatOrder(members) {
  const seated = [];
  for (const [uid, member] of Object.entries(members && typeof members === 'object' ? members : {})) {
    const seat = String(member?.seat ?? '');
    if (SEATS.includes(seat)) seated.push({ uid, seat, name: typeof member.name === 'string' ? member.name : '' });
  }
  return seated.sort((a, b) => Number(a.seat) - Number(b.seat));
}

// The newest pass among the players' public branches ({ uid: { pass? } }, only branches of THIS match): { uid, n, to } or null. Records that
// are not valid are ignored. Two records with the same n (two players pressed at the same moment) are settled the same way on every page, by uid.
export function latestPass(publicByUid) {
  let best = null;
  for (const [uid, branch] of Object.entries(publicByUid && typeof publicByUid === 'object' ? publicByUid : {})) {
    const pass = validPass(branch?.pass);
    if (!pass) continue;
    if (!best || pass.n > best.n || (pass.n === best.n && uid > best.uid)) best = { uid, ...pass };
  }
  return best;
}

// The turn now: { turn, seat, uid, name, last } where last is the newest pass (or null at the start of the match, turn 1, the lowest seat).
// uid and name are the active player's, or null when no one at the table has that seat (they left).
export function currentTurn(publicByUid, members) {
  const order = seatOrder(members);
  const last = latestPass(publicByUid);
  const seat = last ? last.to : (order[0]?.seat ?? '1');
  const who = order.find((player) => player.seat === seat) ?? null;
  return { turn: last ? last.n : 1, seat, uid: who?.uid ?? null, name: who?.name ?? null, last };
}

// The seat after `seat` in seat order, wrapping round and skipping players for whom isOut(uid) is true (they conceded). With no one else
// eligible it is the same seat if that player is eligible, else the first seat that is. isOut is optional.
export function nextSeatAfter(members, seat, isOut = () => false) {
  const order = seatOrder(members);
  if (!order.length) return seat;
  const eligible = order.filter((player) => !isOut(player.uid));
  const pool = eligible.length ? eligible : order;
  const after = pool.find((player) => Number(player.seat) > Number(seat));
  return (after ?? pool[0]).seat;
}

// The record a pass writes: the turn after the current one, to the next seat, remembering the turn it replaces (from). Anyone may write it
// (see the top of this file).
export function nextPass(current, members, isOut = () => false) {
  const n = current.turn + 1;
  if (n > MAX_TURN) throw new Error('This game has gone on for more turns than a table can count.');
  return { n, to: nextSeatAfter(members, current.seat, isOut), ...(current.last ? { from: { n: current.last.n, to: current.last.to } } : {}) };
}

// Passing the turn, as a change to YOUR game: { run(game) -> game, message }. current is currentTurn(); the passer may be the active player
// or someone skipping a player who is not there. A pass replaces the player's own earlier record (each player keeps only their latest).
export function passAction(current, members, isOut, myUid) {
  const record = nextPass(current, members, isOut);
  const next = seatOrder(members).find((player) => player.seat === record.to);
  const skipping = current.uid !== myUid;
  const who = next ? (next.uid === myUid ? 'you' : `Seat ${next.seat}: ${next.name || 'the next player'}`) : `seat ${record.to}`;
  return {
    run: (game) => ({ ...game, pass: record }),
    message: skipping ? `Skipped ${current.name ? `Seat ${current.seat}: ${current.name}` : `seat ${current.seat}`}'s turn. It is turn ${record.n}, and ${who === 'you' ? 'your' : `${who}'s`} turn.` : `Passed the turn. It is turn ${record.n}, and ${who === 'you' ? 'your' : `${who}'s`} turn.`,
  };
}

// Taking back a pass you made by mistake: your record goes back to the turn it replaced (its from), or is deleted when it replaced turn 1.
// Only the player who wrote the newest record may, and only while it is still the newest (a newer pass by someone else cannot be undone from
// here). current is currentTurn().
export const canTakeBack = (current, myUid) => Boolean(current.last) && current.last.uid === myUid;
export function takeBackAction(current) {
  const from = current?.last?.from ?? null;
  return {
    run: (game) => { const { pass: _gone, ...rest } = game; return from ? { ...rest, pass: { n: from.n, to: from.to } } : rest; },
    message: 'Took the pass back.',
  };
}

// Is it time for THIS player to start their turn? The turn number to start (a whole number) or null. It is when the newest pass names my seat
// and my own game is still on an earlier turn. After a refresh my game already has that turn number, so nothing starts twice.
export function turnToStart(current, mySeat, game) {
  if (!current.last || current.seat !== mySeat) return null;
  return game && Number.isInteger(game.turn) && game.turn < current.turn ? current.turn : null;
}

// Whose turn, in words: "your turn", "Seat 2: Bob's turn", or "seat 3's turn (no one is there)".
export function whoseWords(current, myUid) {
  if (current.uid === myUid && current.uid) return 'your turn';
  if (!current.uid) return `seat ${current.seat}'s turn (no one is there)`;
  return `${current.name ? `Seat ${current.seat}: ${current.name}` : `Seat ${current.seat}`}'s turn`;
}
// The words for the turn line on the page: "Turn 5: your turn" or "Turn 5: Seat 2: Bob's turn".
export const turnWords = (current, myUid) => `Turn ${current.turn}: ${whoseWords(current, myUid)}`;
