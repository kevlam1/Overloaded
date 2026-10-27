# Private lobby: what PokeGuess does (draft, 2026-10-25)

Source: `github.com/ChristianDedios23/PokeGuess` (built with a friend, under the friend's account). Read through the public GitHub API on 2026-10-25: `backend/src/services/roomService.ts`, plus its README and file list. **Not read:** `RoomLobby.tsx`, `ws/server.ts`, the DynamoDB layer. Ideas only. Do not copy its code.

## What Kevin wants (stated 2026-10-25; the full plan comes later)
- The concept is similar to PokeGuess, and that is all that is meant to carry over.
- A custom link and a code to join a table.
- In the lobby, players can change their deck, name and similar settings, then ready up. The game begins when players are ready.
- Settled by Kevin's design notes (2026-10-25): the link is generated, like `overloaded.vercel.app/lobby/ABC1234`, or the code is typed in. The host picks the number of seats, everyone readies up, and **the host starts**. No accounts.
- Still open: whether a changed deck unreadies a player, and the code length (the example has 7 characters, PokeGuess uses 6).

## How its private lobby works (verified in `roomService.ts`)
- A room gets a random 6-character code from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no `I`, `O`, `0`, `1`). The server retries up to 10 times if the code exists.
- No accounts. A player enters a display name, creates a room, and shares `/room/{code}`.
- Joining returns a random player token. The server stores only its SHA-256 hash and compares in constant time. The browser keeps the token in a cookie for 2 hours.
- A socket registers with room code, name and token. A refresh re-registers with the same ones, so reconnecting works. The other player is told.
- The first player is the host. Two players max: a join fails if the room is full or the name is taken in that room. Both ready up, and only the host starts.
- Before sending a room to a player, the server removes the token hash and the other player's secret (`sanitizeRoomForViewer`).
- Rooms expire after 1 hour (DynamoDB TTL). A player disconnected past a grace period forfeits. The check runs when the room is read, not on a timer.

## What this suggests for Overloaded (proposals, not decisions)
- Private tables by code or link, no accounts. This answers part of open questions 5 and 9.
- Server as the source of truth, with a per-viewer filter for hands and libraries. Same pattern as `sanitizeRoomForViewer`.
- Player tokens so a refresh rejoins the same seat.
- Differences to decide: Magic needs 2 to 4 seats, so "full" and "host starts" need rules. A table may last hours, so the 1 hour expiry must be refreshed on activity or lengthened.
- Hosting: PokeGuess runs the backend on EC2 with Docker, nginx, TLS, and DynamoDB. That is real cost and ops work. **Settled 2026-10-26 (`live-play.md`):** Overloaded has no server. The lobby is a table in the Firebase Realtime Database, a player token is replaced by Firebase's anonymous user id (it survives a refresh, so reconnecting works), and the "only that player can see their secret" rule is a Security Rule instead of server code. A table closes after 1 hour with no activity and after 8 hours at most, enforced by the rules from the database's clock, with idle tables deleted lazily since the database has no timers (see `live-play.md`).
- The older idea of keeping table state in server memory is dropped: there is no server.
