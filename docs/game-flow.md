# Game flow: create, join, ready, start, play, concede, end match, leave, close

Written 2026-10-28 for the flow review Kevin asked for ("check the logic of the overall game flow, testing the design and the code against each other"). The design is in `shared/table-flow.mjs` (a plain model, written without reading the rules). The page's real operations are in `shared/table-ops.mjs`. The rules are `backend/database.rules.json`. `backend/test-table-flow.mjs` runs random sequences of actions through the model and through the page and rules, and compares the verdict and the whole table after every step.

## The flow as designed

A table is in one of two states: **lobby** (people join, leave, ready up) and **playing**. It can be gone (closed).

| Action | Who | When | What happens |
|---|---|---|---|
| Create | anyone | anytime | A table with the creator as host in seat 1, in the lobby, match 1. A host holds one table; a new one closes the old one. |
| Join | anyone with the code | lobby, free seat | First free seat. Joining again when already at the table changes nothing. |
| Ready / unready | a player | lobby | A mark for the current match. |
| Start | the host | lobby, at least 2 players, everyone ready | The table moves to playing. |
| Concede | a player | playing | Your own mark for this match. It cannot be taken back during the match. |
| End match | the host | playing | Back to the lobby, match number plus one, so every ready and concede mark from before means nothing. |
| Leave (or crash) | a player | anytime | In the lobby your seat is freed. Mid-match your seat stays **reserved for you**: you come back to it by joining with the same code from the same browser, until the host ends the match, which releases every seat nobody is sitting in. The last one out closes the table. The host cannot leave while others are there; they close the table instead (see "Host handover" below). |
| Come back | a player who left or crashed | mid-match | Join again with the same code. You get your own seat back (with a fresh ready/concede mark: see question 3). A different browser, or cleared browser data, is a different person to the database, so it cannot reclaim the seat. |
| Close table | the host | anytime | The table is deleted for everyone. |
| Expire | the clock | 8 hours after creation, or idle 30 min in the lobby / 1 h playing | Nothing can change except closing it. |

## What enforces each rule today

| Rule | Database rules | Page (`table-ops.mjs`) |
|---|---|---|
| Start only by the host, only from the lobby | yes | yes |
| Start needs 2 players and everyone ready | **no** | yes |
| Ready only in the lobby | **no** (allowed while playing) | yes |
| Concede only while playing; locked for the match | yes | yes |
| End match: host only, playing only, match number plus one | yes | yes |
| Join only in the lobby, free seat, one seat per person | yes | yes |
| Last one out closes the table | yes | yes |
| Host cannot leave with others present | **no** | yes |
| A mid-match leaver's seat is reserved for them, and released when the match ends | yes (a member entry may return to a held seat; the host may free a seat whose holder has no entry, in the lobby only) | yes (`joinTable`, `endMatch`) |
| Expired table accepts no changes | yes | refused by the database |

"Page only" means a modified client could break the rule. For a game among friends that is acceptable (nobody gains anything by starting early, and the host is trusted), but it is a choice, see question 2.

## Findings of the first comparison (2026-10-28)

The model and the page plus rules agreed on every step of 1,673 steps in 120 random sequences (seed 20261028), except one thing:

1. **Found by the comparison, resolved 2026-10-28: a seat held forever by someone who left mid-match.** The rules let a seat be freed only in the lobby and only by its owner, so a mid-match leaver's seat stayed blocked after the match ended, and that person could never come back. Kevin's answer: a player must be able to come back to their own seat mid-match (a browser or computer can crash). Changed: (a) the rules accept a member entry in any state as long as the person holds the seat (the member-entry rule no longer demands the lobby; a seat can still only be *taken* in the lobby), (b) the host may free a seat whose holder has no member entry, in the lobby only, and the page does that when the host ends the match. 344 rule tests, the flow comparison (it now also compares the seat map) and 11 new rule mutations cover it. **The rules file changed, so it has to be pasted into the Firebase console again.**

Open design questions that the comparison cannot settle (the model and the code agree, but you may not):

2. **The rules are looser than the page** (start without everyone ready, ready during a match, a host leaving with others present). Accept this for a friendly game, or tighten the rules (more rules, more tests, and one more paste)? I lean toward accepting it for now.
3. **A conceded player can still be on the table**, can leave, and can ready up for the next match. Is that right? (The model says yes.) One consequence of coming back to your seat: leaving and coming back clears your concede mark, so a conceded player could "undo" it. In a casual game among friends that is harmless; stopping it would mean keeping the mark outside the member entry.
4. **The host cannot hand over the table yet.** See "Host handover" below: it is possible, small for a voluntary hand-over, and bigger for taking over from a host who vanished.
5. **Ending a match does not need the players' agreement.** The host alone can end it, as you described. Fine?
6. **Conceding does not end the match** by itself, even if everyone concedes. The host ends it. (Matches what you described.)

## When the host is gone (Kevin, 2026-10-28)

Kevin's requirement: a table must carry on when the host is gone but the others are still playing. **What already works, and is now tested** (`backend/test-rules.mjs`, "a match carries on when the host is gone"): any member can write the heartbeat that keeps the table from going idle, write their own public and private zones, concede, leave, and the last one standing can close the table. Nothing in play depends on the host. **What needs a host** and so is stuck without one: starting a match, ending a match, closing the table (the table still closes by itself when it goes idle or reaches 8 hours). The next match is the real problem, because the host is the only one who can end the current one.

## Host handover (proposal, not built)

Is it possible? Yes. `meta.host` is fixed today (a rule says it can never change), and that is a deliberate rule, not a limit of Firebase.

1. **Voluntary hand-over (small).** Let the current host change `meta.host` to the uid of a current member. One rule changes (the `host` check and the meta write rule), the host slot moves (the old host clears theirs in the same write, the new host claims theirs once they are host), and the page gets a `passHost(code, uid)` operation. The host can then also leave: leaving would hand the table to the next seat automatically. New rule tests, mutations and flow-model steps.
2. **A host who vanished (bigger).** A crashed host's entry is still there, so the database cannot tell "gone" from "quiet". We need presence first (each client writes a "last seen" time, which is also what the "Reconnecting..." banner needs). Then a rule: any member may claim the host role if the host's last-seen time is older than a few minutes. That is the same presence work already on the to-do list, so I would do it with the heartbeat.

Recommendation: do (1) now, because it is small and removes the "host must stay" problem for a planned exit; do (2) together with presence and the heartbeat.

## Solo play (goldfishing)

Playing alone does not need a table. It is Phase 2, the "solo table", running entirely in the browser with the same game logic modules in `shared/` and no database: no code, no seats, no rules, nothing to clean up. When the table page is built, a solo game is the same page with the "opponents" and live connection switched off.

## What the comparison covers and does not

Covered: create, join, rejoin, ready, unready, start, concede, end match, leave, close, expire, in random order, with illegal moves mixed in, on tables of 2, 3 and 4 seats, by the host, players and an outsider. Not covered: the heartbeat and idle expiry (not built; expiry is simulated by moving the creation time), the host slot after a table closes, reconnecting, and two players acting at the same instant (a real race), which needs two real connections and is on the to-do list.
