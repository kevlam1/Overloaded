// A reference model of the table flow AS DESIGNED (docs/game-flow.md), written without looking at the database rules,
// so the two can be compared. It is plain data in, plain data out: no database, no browser, no clock.
//
// A model table: { host, seatCount, status: 'lobby' | 'playing', match, members, exists, expired }
//   members: { uid: { seat: '1'..'4', ready: boolean, conceded: boolean } }
//   `ready` and `conceded` mean "for the current match" (the database stores the match number, which makes an old
//   match's marks mean nothing; the model just clears them when the match ends).
//   `expired`: the table passed its 8-hour limit or its idle limit. Nothing can change except closing it.
//
// step(table, uid, action) returns { ok, table, why }. When ok is false the table is unchanged and `why` says why.
// Actions: join, ready, unready, start, concede, endMatch, leave, endTable.
// `expire` is not something a person does; apply it with expireTable().

export const ACTIONS = ['join', 'ready', 'unready', 'start', 'concede', 'endMatch', 'leave', 'endTable'];

//   reserved: { uid: seat } seats held for players who left DURING a match. They can come back to that seat until
//   the host ends the match, which releases them (Kevin, 2026-10-28: a crash must not cost you your seat).
export function newModelTable({ host, seats }) {
  return { host, seatCount: seats, status: 'lobby', match: 1, members: { [host]: { seat: '1', ready: false, conceded: false } }, reserved: {}, exists: true, expired: false };
}

export const expireTable = (table) => ({ ...clone(table), expired: true });

const clone = (table) => structuredClone(table);
const no = (table, why) => ({ ok: false, table, why });
const yes = (table) => ({ ok: true, table });

// The lowest seat (up to the table's seat count) that no current member sits in.
function freeSeat(table) {
  const taken = new Set([...Object.values(table.members).map((m) => m.seat), ...Object.values(table.reserved)]);
  for (let n = 1; n <= table.seatCount; n++) if (!taken.has(String(n))) return String(n);
  return null;
}

export function step(table, uid, action) {
  if (!table.exists) return no(table, 'the table is gone');
  const mine = table.members[uid];
  const isHost = uid === table.host;
  const next = clone(table);

  switch (action) {
    case 'join': {
      if (mine) return yes(table); // already at the table: a rejoin, nothing changes
      if (table.expired) return no(table, 'the table has closed');
      if (table.reserved[uid]) { // coming back to the seat held for them (mid-match; the lobby has none reserved)
        next.members[uid] = { seat: table.reserved[uid], ready: false, conceded: false };
        delete next.reserved[uid];
        return yes(next);
      }
      if (table.status !== 'lobby') return no(table, 'the match has started');
      const seat = freeSeat(table);
      if (!seat) return no(table, 'no free seat');
      next.members[uid] = { seat, ready: false, conceded: false };
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
      if (isHost) return no(table, 'the host closes the table instead of leaving');
      if (table.expired) return no(table, 'the table has closed');
      delete next.members[uid];
      if (table.status === 'playing') next.reserved[uid] = mine.seat; // held for them to come back; released when the match ends
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
