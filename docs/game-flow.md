# Game flow: create, join, ready, start, play, concede, end match, leave, close

Written 2026-10-28 for the flow review Kevin asked for ("check the logic of the overall game flow, testing the design and the code against each other"). The design is in `shared/table-flow.mjs` (a plain model, written without reading the rules). The page's real operations are in `shared/table-ops.mjs`. The rules are `backend/database.rules.json`. `backend/test-table-flow.mjs` runs random sequences of actions through the model and through the page and rules, and compares the verdict and the whole table after every step.

## The flow as designed

A table is in one of two states: **lobby** (people join, leave, ready up) and **playing**. It can be gone (closed).

| Action | Who | When | What happens |
|---|---|---|---|
| Create | anyone | anytime | A table with the creator as host in seat 1, in the lobby, match 1, and a **format** (Commander or Standard, chosen on the create form; casual, so deck sizes are hints). A host holds one table; a new one closes the old one. |
| Join | anyone with the code | lobby, free seat | First free seat. Joining again when already at the table changes nothing. |
| Ready / unready | a player | lobby | A mark for the current match. |
| Set your deck | a player | lobby | Tells the table three things about your deck, and nothing else: your commander(s) by card name (one text, two names joined with " & "), your bracket (1 to 5, optional) and whether the bracket is only a guess. A change to any of them **takes your ready mark back** in the same write; sending the same deck again changes nothing and keeps it. Swapping ordinary cards is not a change to any of the three. The deck list is never sent. Your deck fields stay when a match ends (only the ready mark stops counting). A player who left mid-match and comes back has no deck fields (the page sends them again). |
| Start | the host | lobby, at least 2 players, everyone ready | The table moves to playing. |
| Concede | a player | playing | Your own mark for this match. It cannot be taken back during the match. |
| End match | the host | playing | Back to the lobby, match number plus one, so every ready and concede mark from before means nothing. |
| Leave (or crash) | a player | anytime | In the lobby your seat is freed. Mid-match your seat stays **reserved for you**: you come back to it by joining with the same code from the same browser, until the host ends the match, which releases every seat nobody is sitting in. The last one out closes the table. If the host leaves while others are there, the table is handed to the player in the lowest seat as they go (see "Host handover" below). |
| Hand over the table | the host | anytime the table is alive | The host picks another player at the table and becomes an ordinary player. The new host claims the one-table-per-host slot afterwards. Refused if the new host already hosts another live table. |
| Come back | a player who left or crashed | mid-match | Join again with the same code. You get your own seat back (with a fresh ready/concede mark: see question 3). A different browser, or cleared browser data, is a different person to the database, so it cannot reclaim the seat. |
| Close table | the host | anytime | The table is deleted for everyone. |
| Expire | the clock | 8 hours after creation, or idle 30 min in the lobby / 1 h playing | Nothing can change except closing it. |

## What enforces each rule today

| Rule | Database rules | Page (`table-ops.mjs`) |
|---|---|---|
| Start only by the host, only from the lobby | yes | yes |
| Start needs 2 players and everyone ready | **no** | yes |
| Ready only in the lobby | **no** (allowed while playing) | yes |
| A player needs a deck to ready up (2026-10-30) | **no** (495 older rule tests ready players with no deck) | page path, not built yet |
| Set your deck only in the lobby | **no** (the rules only require that a change leaves you not ready) | yes (`setDeck`) |
| A change to the commander, bracket or guess flag cannot leave you ready for this match | yes (a rule on the whole member entry, which also covers deleting a field) | yes (`setDeck` clears `ready` in the same write) |
| Commander text 1 to 220 units; bracket 1 to 5; guess flag only `true` and only with a bracket | yes | yes (`shared/deck-fields.mjs`) |
| Concede only while playing; locked for the match | yes | yes |
| End match: host only, playing only, match number plus one | yes | yes |
| Join only in the lobby, free seat, one seat per person | yes | yes |
| Last one out closes the table | yes | yes |
| A host who leaves hands the table to the lowest seat | yes (the host may change to a current member who hosts no other live table) | yes (`leaveTable`, `passHost`, `claimHostSlot`) |
| A mid-match leaver's seat is reserved for them, and released when the match ends | yes (a member entry may return to a held seat; the host may free a seat whose holder has no entry, in the lobby only) | yes (`joinTable`, `endMatch`) |
| Expired table accepts no changes | yes | refused by the database |

"Page only" means a modified client could break the rule. For a game among friends that is acceptable (nobody gains anything by starting early, and the host is trusted), but it is a choice, see question 2.

## Deck fields, built 2026-10-30 (rules path; the lobby page for them is not built yet)

Decided by Kevin 2026-10-30: a seat shows only the player's name, their commander(s) by card name (not the deck's title), their bracket and whether they are ready; nobody sees inside another player's deck, and the list is never stored. Stored per member entry: `commander`, `bracket`, `bracketGuess` (true only when the bracket was inferred, not picked). Checked against the real card list (34,743 names and alternate titles): the longest legendary name is 61 units and two legendary names joined with " & " reach 123; the longest name of any card is a 141-unit joke card and two such names reach 208, so the limit is **220**.

- **The un-ready rule is on the whole member entry**, and Firebase runs it for a write to a child and for a delete of a child as well (checked in the emulator before writing the tests: deleting `commander` while ready was refused). So a modified client cannot change the deck and stay ready by any route. The same check showed that a rule on one child runs only when that child is written, so "a guess needs a bracket" also lives on the whole entry (otherwise deleting the bracket while the flag stayed was allowed).
- **Design questions I answered with a default because Kevin was away (please confirm or change):** (1) a deck can only be set in the lobby (the page refuses during a match; the rules do not), like readying; (2) an empty commander is stored as nothing, not as an empty text; (3) a player who comes back to a reserved seat has no deck fields until the page sends them.
- The model (`shared/table-flow.mjs`) has the new action and fields, and the comparison now runs 240 sequences (it was 120; the new action shifted the random numbers and left a coverage gap) and requires "a ready player changed their deck and was un-readied" and "a deck change during a match was refused".

## Findings of the first comparison (2026-10-28)

The model and the page plus rules agreed on every step of 1,673 steps in 120 random sequences (seed 20261028), except one thing:

1. **Found by the comparison, resolved 2026-10-28: a seat held forever by someone who left mid-match.** The rules let a seat be freed only in the lobby and only by its owner, so a mid-match leaver's seat stayed blocked after the match ended, and that person could never come back. Kevin's answer: a player must be able to come back to their own seat mid-match (a browser or computer can crash). Changed: (a) the rules accept a member entry in any state as long as the person holds the seat (the member-entry rule no longer demands the lobby; a seat can still only be *taken* in the lobby), (b) the host may free a seat whose holder has no member entry, in the lobby only, and the page does that when the host ends the match. 344 rule tests, the flow comparison (it now also compares the seat map) and 11 new rule mutations cover it. **The rules file changed, so it has to be pasted into the Firebase console again.**

Open design questions that the comparison cannot settle (the model and the code agree, but you may not):

2. **The rules are looser than the page** (start without everyone ready, ready during a match). Accept this for a friendly game, or tighten the rules (more rules, more tests, and one more paste)? I lean toward accepting it for now.
3. **A conceded player can still be on the table**, can leave, and can ready up for the next match. Is that right? (The model says yes.) One consequence of coming back to your seat: leaving and coming back clears your concede mark, so a conceded player could "undo" it. In a casual game among friends that is harmless; stopping it would mean keeping the mark outside the member entry.
4. **Handing over the table (voluntary part built 2026-10-28, see "Host handover" below).** Taking over from a host who vanished (a crashed host's entry is still there) is not built; it needs presence.
5. **Ending a match does not need the players' agreement.** The host alone can end it, as you described. Fine?
6. **Conceding does not end the match** by itself, even if everyone concedes. The host ends it. (Matches what you described.)

## When the host is gone (Kevin, 2026-10-28)

Kevin's requirement: a table must carry on when the host is gone but the others are still playing. **What already works, and is now tested** (`backend/test-rules.mjs`, "a match carries on when the host is gone"): any member can write the heartbeat that keeps the table from going idle, write their own public and private zones, concede, leave, and the last one standing can close the table. Nothing in play depends on the host. **What needs a host** and so is stuck without one: starting a match, ending a match, closing the table (the table still closes by itself when it goes idle or reaches 8 hours). The next match is the real problem, because the host is the only one who can end the current one.

## Host handover

`meta.host` used to be fixed for the life of the table (a deliberate rule, not a limit of Firebase).

1. **Voluntary hand-over: built 2026-10-28.**
   - **Rule:** `meta.host` may change, written by the current host, to a current member who does not host another live table (a stale slot, whose table is gone, does not count). Nothing else about `meta` can change in the same write that the rules would not allow alone.
   - **Slots:** the old host clears their own host slot in the same write (`passHost`); the new host claims theirs afterwards (`claimHostSlot`), because only they can write it.
   - **Leaving:** a host who leaves with others at the table hands it to the player in the lowest seat as they go; if the rules refuse that player (they host another table) it is offered to the next seat; if nobody can take it the leave is refused in words.
   - **Checks:** 372 rule tests (28 for hand-over), 18 new page checks, the flow comparison (the model hands over and compares who is host and who holds the slot after every step; a new host really does host-only things 57 times in a run), 6 new rule mutations (5 caught, 1 redundant), and 8 new live checks that pass only once the rules are published.
2. **A host who vanished: not built.** A crashed host's entry is still there, so the database cannot tell "gone" from "quiet". It needs presence first (each client writes a "last seen" time, which is also what the "Reconnecting..." banner needs). Then a rule: any member may claim the host role if the host's last-seen time is older than a few minutes. I would do it together with the heartbeat and presence. Until then, a table whose host vanished carries on (see above) but cannot start or end a match; someone can still leave, or the host can come back to their own seat after a crash.

## Keeping a table alive: the heartbeat and the warnings (built 2026-10-28)

**Design (Kevin, 2026-10-26):** like a banking app. A table closes after 30 minutes with no activity in the lobby, 1 hour with none while playing, and never lives past 8 hours from creation. Activity keeps it alive, with no popup.

| Part | Where | Enforced by |
|---|---|---|
| A tap, key or input in a **visible** tab sends a heartbeat, at most one a minute per player; hidden or idle tabs send none | `shared/heartbeat.mjs`, wired in `frontend/pages/lobby/lobby.js` | the page (decision logic tested with a fake clock) |
| The database accepts a heartbeat only from a member, only with its own clock (never the client's), at most one per 30 seconds for the whole table, and never on a closed table | `backend/database.rules.json` (`activity/lastActive`) | the rules |
| Members can read `lastActive` (they could not before) so the page can tell how long the table has been idle | `activity/.read` | the rules (new 2026-10-28) |
| A quiet banner in the last 5 minutes of the idle limit; a quiet one 30 minutes before the 8-hour limit and a firmer one at 10 minutes (nothing clears these); a plain message once the table has closed | `shared/table-limits.mjs`, `frontend/src/banner.js` | the page |
| All of it is judged on the **server's** time (`.info/serverTimeOffset`), so a wrong computer clock cannot hide or invent a warning | `watchServerOffset` | the page |

The page's interval is one minute, not the rules' 30-second floor: a heartbeat is a few dozen bytes and the cap is per table, so the cost is negligible either way, and several players' heartbeats rarely collide. A heartbeat refused because another player's just landed is not an error and is not retried.

**Checked by:** 36 heartbeat decision checks (11 of 11 broken copies caught), 40 limit and wording checks at exact boundaries (21 of 21), 20 banner checks (9 of 12 caught, the 3 survivors are redundant guards), 385 rule tests (13 new for the read rule), 78 table logic checks (14 new: heartbeat accepted, refused by the cap, refused for outsiders and for an idle table, and the three watchers), and a 70-second check on the real project in a real browser (`scripts/check-heartbeat-live.mjs`: no heartbeat while idle, one after a tap, none for a second tap straight after).

**Not covered:** the flow model above does not include the heartbeat (its "expire" step only moves the creation time), so "activity keeps a table alive" is covered by the rule tests and the live check, not by the model comparison. Presence ("Reconnecting..." and taking over from a vanished host) is not built.

## Solo play (goldfishing)

Playing alone does not need a table. It is Phase 2, the "solo table", running entirely in the browser with the same game logic modules in `shared/` and no database: no code, no seats, no rules, nothing to clean up. When the table page is built, a solo game is the same page with the "opponents" and live connection switched off.

## What the comparison covers and does not

Covered: create, join, rejoin, ready, unready, start, concede, end match, leave, close, expire, in random order, with illegal moves mixed in, on tables of 2, 3 and 4 seats, by the host, players and an outsider. Not covered: the heartbeat and idle expiry (not built; expiry is simulated by moving the creation time), the host slot after a table closes, reconnecting, and two players acting at the same instant (a real race), which needs two real connections and is on the to-do list.
