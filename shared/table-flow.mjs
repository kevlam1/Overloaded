// A reference model of the table flow AS DESIGNED (docs/game-flow.md), written without looking at the database rules,
// so the two can be compared. It is plain data in, plain data out: no database, no browser, no clock.
//
// A model table: { host, seatCount, status: 'lobby' | 'playing', match, members, exists, expired }
//   members: { uid: { seat: '1'..'4', ready: boolean, conceded: boolean, commander: text or null, bracket: 1..5 or null,
//   bracketGuess: true or null } }  (the deck fields are all the table learns about a deck; null means not stored)
//   `ready` and `conceded` mean "for the current match" (the database stores the match number, which makes an old
//   match's marks mean nothing; the model just clears them when the match ends).
//   `expired`: the table passed its 8-hour limit or its idle limit. Nothing can change except closing it.
//
// step(table, uid, action, arg) returns { ok, table, why }. When ok is false the table is unchanged and `why` says why.
// Actions: join, ready, unready, setDeck (arg: { commander, bracket, bracketGuess }), start, concede, endMatch, leave,
// endTable, passHost (arg: the new host's uid).
// setDeck (2026-10-30): only in the lobby; a change to any deck field takes the player's ready mark back, no change does not.
// A player who joins, or comes back to a reserved seat, has no deck fields: the page sends them again.
// The host can change (2026-10-28): the host hands the table to another player, or leaves and it passes to the player in
// the lowest seat. Host-only actions then belong to the new host.
// `expire` is not something a person does; apply it with expireTable().

export const ACTIONS = ['join', 'ready', 'unready', 'setDeck', 'start', 'concede', 'endMatch', 'leave', 'endTable', 'passHost'];

//   reserved: { uid: seat } seats held for players who left DURING a match. They can come back to that seat until
//   the host ends the match, which releases them (Kevin, 2026-10-28: a crash must not cost you your seat).
export function newModelTable({ host, seats }) {
  return { host, seatCount: seats, status: 'lobby', match: 1, members: { [host]: newMember('1') }, reserved: {}, exists: true, expired: false };
}

export const expireTable = (table) => ({ ...clone(table), expired: true });

const clone = (table) => structuredClone(table);
const newMember = (seat) => ({ seat, ready: false, conceded: false, commander: null, bracket: null, bracketGuess: null });
const no = (table, why) => ({ ok: false, table, why });
const yes = (table) => ({ ok: true, table });

// The lowest seat (up to the table's seat count) that no current member sits in.
function freeSeat(table) {
  const taken = new Set([...Object.values(table.members).map((m) => m.seat), ...Object.values(table.reserved)]);
  for (let n = 1; n <= table.seatCount; n++) if (!taken.has(String(n))) return String(n);
  return null;
}

export function step(table, uid, action, arg) {
  if (!table.exists) return no(table, 'the table is gone');
  const mine = table.members[uid];
  const isHost = uid === table.host;
  const next = clone(table);

  switch (action) {
    case 'join': {
      if (mine) return yes(table); // already at the table: a rejoin, nothing changes
      if (table.expired) return no(table, 'the table has closed');
      if (table.reserved[uid]) { // coming back to the seat held for them (mid-match; the lobby has none reserved)
        next.members[uid] = newMember(table.reserved[uid]);
        delete next.reserved[uid];
        return yes(next);
      }
      if (table.status !== 'lobby') return no(table, 'the match has started');
      const seat = freeSeat(table);
      if (!seat) return no(table, 'no free seat');
      next.members[uid] = newMember(seat);
      return yes(next);
    }
    case 'ready':
    case 'unready': {
      if (!mine) return no(table, 'not at the table');
      if (table.expired) return no(table, 'the table has closed');
      if (table.status !== 'lobby') return no(table, 'only in the lobby');
      next.members[uid].ready = action === 'ready';
      return yes(next);
    }
    case 'setDeck': { // arg: { commander, bracket, bracketGuess }; written out here on purpose, not shared with the page's checks
      if (!mine) return no(table, 'not at the table');
      if (table.expired) return no(table, 'the table has closed');
      if (table.status !== 'lobby') return no(table, 'only in the lobby');
      const commander = typeof arg.commander === 'string' && arg.commander !== '' ? arg.commander : null;
      if (typeof arg.commander === 'string' && arg.commander.length > 220) return no(table, 'commander text too long');
      const bracket = arg.bracket ?? null;
      if (bracket !== null && ![1, 2, 3, 4, 5].includes(bracket)) return no(table, 'a bracket is 1 to 5');
      if (arg.bracketGuess && bracket === null) return no(table, 'a guess needs a bracket');
      const guess = arg.bracketGuess ? true : null;
      const changed = mine.commander !== commander || mine.bracket !== bracket || mine.bracketGuess !== guess;
      if (!changed) return yes(table); // the same deck again: nothing changes and the ready mark stays
      Object.assign(next.members[uid], { commander, bracket, bracketGuess: guess, ready: false });
      return yes(next);
    }
    case 'start': {
      if (!isHost) return no(table, 'only the host starts');
      if (table.expired) return no(table, 'the table has closed');
      if (table.status !== 'lobby') return no(table, 'already started');
      const players = Object.values(table.members);
      if (players.length < 2) return no(table, 'needs two players');
      if (!players.every((p) => p.ready)) return no(table, 'everyone must be ready');
      next.status = 'playing';
      return yes(next);
    }
    case 'concede': {
      if (!mine) return no(table, 'not at the table');
      if (table.expired) return no(table, 'the table has closed');
      if (table.status !== 'playing') return no(table, 'no match to concede');
      next.members[uid].conceded = true;
      return yes(next);
    }
    case 'endMatch': {
      if (!isHost) return no(table, 'only the host ends the match');
      if (table.expired) return no(table, 'the table has closed');
      if (table.status !== 'playing') return no(table, 'no match to end');
      next.status = 'lobby';
      next.match += 1;
      for (const member of Object.values(next.members)) { member.ready = false; member.conceded = false; }
      next.reserved = {}; // seats held for players who left mid-match are released for the lobby
      return yes(next);
    }
    case 'leave': {
      if (!mine) return no(table, 'not at the table');
      const others = Object.keys(table.members).filter((id) => id !== uid);
      if (others.length === 0) { next.exists = false; return yes(next); } // the last one out closes the table (even an expired one)
      if (table.expired) return no(table, 'the table has closed');
      if (isHost) { // the host leaving hands the table to the player in the lowest seat
        next.host = others.sort((a, b) => Number(table.members[a].seat) - Number(table.members[b].seat))[0];
      }
      delete next.members[uid];
      if (table.status === 'playing') next.reserved[uid] = mine.seat; // held for them to come back; released when the match ends
      return yes(next);
    }
    case 'passHost': { // arg is the uid of the player who should become host
      if (!isHost) return no(table, 'only the host hands over the table');
      if (table.expired) return no(table, 'the table has closed');
      if (arg === uid) return no(table, 'already the host');
      if (!table.members[arg]) return no(table, 'that player is not at the table');
      next.host = arg;
      return yes(next);
    }
    case 'endTable': {
      if (!isHost) return no(table, 'only the host closes the table');
      next.exists = false; // the host can close it even if it expired
      return yes(next);
    }
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
