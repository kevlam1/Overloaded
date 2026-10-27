# Live play and the lobby store (decided 2026-10-26)

Open questions 5, 6 and 8 in `CLAUDE.md`. Decided in plan mode on 2026-10-26; the approved plan is also saved outside the repo at `C:\Users\kevin\.claude\plans\reactive-sniffing-wirth.md` (this file is the copy that matters). Every number below was read from the service's own docs on 2026-10-26. These pages change, so re-check the limits before the Dec 7 demo.

## Decision
**Firebase Realtime Database (free Spark plan) + anonymous sign-in + Security Rules. No server code. The frontend is static pages on Vercel.** Hidden hands are enforced by the database (the "private" branch of each player). Kevin approved the plan, which includes the two decisions (stack, and database-enforced privacy) and the Firebase SDK (Apache-2.0) as a dependency. Fallback if the spike fails: Supabase.

## What it is, in plain words (new to Kevin, so explained first)
- **Realtime Database:** one big JSON tree in Google's cloud. A page listens to a path and is told about every change within a moment, over a persistent connection. That is the "live" part; there is no server of ours in between.
- **Anonymous sign-in:** each browser asks Firebase for a random user id (`uid`) with no email or password. It stays the same across refreshes in that browser, and the player never sees an account.
- **Security Rules:** a small file that says who may read or write each path, for example "only the owner of this branch". Rules run inside the database, so editing the page in dev tools can't get around them. A rule mistake shows up as a permission error.
- **Locked mode vs Test mode:** Locked denies all browser access until rules allow it. Test mode is world-readable and world-writable. We start Locked.

## What was verified
| Option | Free-plan facts | Hidden hands | Code we write | Main risk |
|---|---|---|---|---|
| **Firebase Realtime Database** | Spark plan: 100 simultaneous connections, 1 GB stored, 10 GB/month downloads, not billed on Spark. Regions: us-central1 (Iowa), europe-west1 (Belgium), asia-southeast1 (Singapore). Anonymous sign-in exists. Apache-2.0 SDK | Rules such as `".write": "$uid === auth.uid"`; rules can read other paths through `root`, `data`, `newData`. `update()` across paths is atomic (the docs: "either all updates succeed or all updates fail"). `onDisconnect` gives presence | Client only | Rules are a new language. Traffic denied by rules still counts toward the 10 GB |
| **Supabase** | Free: 200 connections, 100 messages/s, 2M messages/month, 256 KB payload (docs: realtime limits and pricing). Two free projects. MIT SDK | Row-level security on `realtime.messages` (private channels need "Allow public access" off) and on tables. Anonymous sign-ins exist | Client plus SQL | Docs: "We may pause applications on the Free Plan that exhibit low activity in a 7-day period", restored by hand. Anonymous sign-in IP limit 30 requests/hour (docs recommend CAPTCHA). Docs warn that RLS complexity slows joins |
| **Vercel WebSocket function + Redis** | WebSockets are in public beta on all plans since June 22, 2026 (Python since July 23). Hobby: 300 s maximum per connection, 4 CPU-hours, 360 GB-hours provisioned memory, 1,000,000 invocations a month. Upstash Redis free: 250 MB, 10 GB, 500K commands/month, 10,000 commands/s | Our own code | Server and client | Beta: "Behavior and APIs may change". Connections pin to one instance and a reconnect may land on another, so rooms need Redis. Clients must reconnect at least every 5 minutes |
| **Cloudflare Durable Objects** | Workers Free: 100,000 requests/day, SQLite-backed objects only, 13,000 GB-s/day. WebSocket Hibernation avoids duration charges | Our own code | Server and client | New platform, CLI and deploy |
| Peer to peer (WebRTC) | No server needed for traffic | n/a | Client | Not researched in detail; the least reliable on many networks and phones |

**Correction to the earlier notes:** `CLAUDE.md` said Vercel probably could not hold live connections. It can (beta). It is not used because we would have to write and run the server, and handle 5-minute reconnects and cross-instance Redis, on a beta feature.

## Why Firebase over Supabase (Kevin leaned Supabase)
- The 7-day pause rule is a risk right before a demo, and a restore is manual.
- The anonymous sign-in IP cap (30/hour) hits a classroom sharing one address.
- RLS plus Realtime is heavier than a rules file.
- Supabase is the fallback, and nothing here is permanent.

## Another view, weighed (Kevin's phone chat, 2026-10-26)
An earlier chat, before the project was scoped, favored Supabase: relational data, generated TypeScript types, versioned migrations, Broadcast and Presence without database writes, 200 vs 100 connections, row-level security, and "Firestore's 20K writes/day". Its downsides: the 2M messages/month cap, the 7-day pause, no automatic backups. Checked against what we decided:
- **"20K writes/day" is Firestore's free quota** (Firebase's quotas page: 20,000 document writes per day). The Realtime Database has no daily or monthly write cap, only a soft limit of 1,000 writes per second. We use the Realtime Database, so it does not apply.
- **Relational data, types and migrations** are real strengths only if we add accounts, saved decks or a deck builder, or move to TypeScript. None is planned (no accounts, decks in the browser, a static card list, tables deleted after 2 hours).
- **Broadcast without writes** is the best point, but only for an honor-system design. A hand that must stay private and survive a refresh has to be stored.
- **Row-level security and Security Rules** can both keep a hand hidden. RLS is more powerful and heavier.
- **Message limits:** with my model (4 players, 3 hours, 24 actions a minute, 4 to 5 events per action) 2M messages is about 93 to 116 games a month, matching the other chat's 100 to 200. Both services allow far more than a class demo needs.
- **Pause risk:** manageable with a request every few days during the term, so it is a chore, not a blocker. I weighted it too heavily at first.

**Decision stays Firebase for this scope.** It flips to Supabase if: accounts, saved decks or the deck builder become part of the plan; we move to TypeScript; hidden hands become an honor system (Broadcast is then simplest); or the spike fails.

**Hedge:** all database calls go through one small module in `frontend/src/` (create, join, listen, write a move), so changing the service means rewriting that file, not the game.

## Cost model (my estimate, assumptions stated)
A 4-player, 3-hour game at about 24 actions a minute is 4,320 actions. At about 1.2 KB delivered per action (a few hundred bytes of change delivered to 3 other players) that is roughly 5 MB, so 10 GB a month covers on the order of 1,900 such games. **The 1.2 KB is a guess, not a measurement**; even if real traffic is 5 times larger it is several hundred games. The spike measures it. Initial loads and presence add little. 100 simultaneous connections is about 25 four-player tables or 50 duels. Measure in the spike.

## Data model (draft, `/tables/{code}`)
- `meta`: host, format, seat count, status (`lobby` or `playing`), `createdAt` (server time), `idleLimit` (30 minutes in the lobby, 1 hour once playing; written when the status changes, so the rules need no conditional).
- `activity/lastActive`: the server time of the last player activity. **Kept apart from `meta` on purpose:** pages listen to `meta`, nobody listens to `activity`, so heartbeats cause no downloads for other players.
- `presence/{uid}/connections/{pushId}`: one entry per open browser tab, removed by the server when that tab disconnects (`onDisconnect`). **No entries means offline.** `presence/{uid}/lastOnline` holds the server time of the last disconnect. Only that uid writes its own presence; table members read it.
- `seats/1` to `seats/4`: each holds the uid that took it. **Create-only** (writable only while empty, and only for numbers up to the seat count), so two people can't both take a seat. This replaces counting members, because the rules have no `numChildren` (checked 2026-10-26).
- `members/{uid}`: name, ready, deck name and size.
- `public/{uid}`: battlefield, graveyard, exile, command zone, life, counters, hand and library counts.
- `private/{uid}`: hand, library order, sideboard, the deck list. **Only that uid reads or writes it.**
- `shared`: turn, active player, log.
- `inbox/{targetUid}/{pushId}`: requests across players (a counter on your permanent); the owner applies it.
- A move such as hand to battlefield is one multi-path `update()`. A drag sends only the drop.
- Rules: members only; join only into an empty seat while status is `lobby`.
- **Lifetime (Kevin's idea, 2026-10-26, the banking-app pattern; numbers refined the same day):** a table closes after **30 minutes with no activity while in the lobby, 1 hour with no activity once playing** (idle timeout) and never lives past **8 hours from creation** (absolute timeout). Draft rules, to test in the spike: `activity/lastActive` is written only as the server time (`".validate": "newData.val() === now"`); every write to a table is refused once `now > lastActive + idleLimit` or `now > createdAt + 28800000`, so an expired table is dead even if every player left; `createdAt` can only be set when it doesn't exist yet.
- **Activity is detected in the background, with no popup (Kevin's idea):** the page listens, passively and throttled, for taps, clicks, key presses, scrolling and mouse movement, **only while the tab is visible** (Page Visibility API), and also counts any game write. At most once a minute it writes `activity/lastActive`. It records that something happened, never what. An open but untouched tab does not count; an opponent's moves do. A rule can cap the rate (for example refuse a write less than 30 seconds after the last) so a script can't flood it, but the 8-hour limit is what stops a script from keeping a table alive forever.
- **No popup. Two quiet, non-blocking banners, for two different limits:**
  - **Decided by Kevin 2026-10-26:** the idle banner is wanted ("definitely"), its design comes later, and 30 and 10 minutes before the 8-hour limit is "good enough".
  - **Idle timer:** a banner in the **last 5 minutes of the idle limit** (minutes 25 to 30 in the lobby, 55 to 60 in a game), shown only if someone is looking at a visible tab and nothing has happened (a phone propped up with the screen on). Any tap clears it, because activity resets the idle timer. Without it the table just closes.
  - **8-hour limit:** a banner **30 minutes before** the limit, and a more visible one at 10 minutes: "This table closes at 9:42 PM, its 8-hour limit. It can't be extended." **Activity does not clear it**, because the limit counts from creation. A new table starts fresh, so the banner only gives players time to wrap up. (Added 2026-10-26: the first version of this plan described only the idle banner and left the 8-hour limit without any notice.) The page compares against server time (`/.info/serverTimeOffset`) when the tab regains focus, because phones throttle timers in background tabs. After real expiry the rules refuse every write.
- **Cost:** about zero. Heartbeats are at most one write a minute per player to a path nobody listens to.
- **Cleanup:** no timers exist and Cloud Functions need a paid plan, so it is lazy. `.indexOn` on `activity/lastActive` (ordering by a nested child path is supported); a client creating a table queries `orderByChild('activity/lastActive').endAt(now - 1 hour).limitToFirst(20)` and deletes those. The rules let any signed-in user delete an expired table.
- **One open table per user:** a create-only slot per uid (for example `hosts/{uid}` holding the code, replaceable only when that table has expired) so one anonymous user can't fill the 1 GB with tables.
- **Presence and "Reconnecting…" (Kevin's idea):** read from Firebase's docs 2026-10-26. `onDisconnect` runs on the server, "whether the client disconnects cleanly or not", so it still fires if a connection drops or a client crashes. `/.info/connected` gives each browser its own connection state. Firebase's own sample stores each connection separately (one per browser tab) and treats "no children" as offline; it queues the disconnect operation **before** marking the user online, to avoid a race. Storing one entry per tab matters for a refresh: the new tab adds its entry before the old one is removed, so a refresh never shows "offline". Not stated in the docs: how long the server waits before it decides a silently dropped connection is dead, so a network drop may show late; a closed tab should show promptly. To measure in the spike.
- **What players see:** when a player has no connection entries, the others see that player's avatar and board with "Reconnecting…" and a loading animation. After about 2 minutes it changes to "Disconnected, last seen N min ago". Casual mode lets everyone keep moving their own cards meanwhile; a host "skip turn" or "remove player" can come later. The player who lost the connection sees "You're offline, reconnecting…" from `/.info/connected`. **The animation respects `prefers-reduced-motion`** (static text and a still icon instead of a spinner) and is announced politely to screen readers. Presence is not activity: reconnecting never keeps a table alive.
- A closed table shows "This table closed (30 minutes idle in the lobby, an hour idle in a game, or the 8-hour limit)" to anyone who joins or is still in it. Its decks and hands are deleted, which also fits "store nothing that isn't needed".
- Lobby code: 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, about 1 billion codes (the PokeGuess alphabet).

## Setup steps for Kevin (from Firebase's docs read 2026-10-26; the console's labels may differ slightly)
1. Open the Firebase console with your Google account and add a project (for example `overloaded`). **Skip Google Analytics** (we don't need the data). **Stay on the free Spark plan and don't add billing.**
2. Authentication: turn on the **Anonymous** sign-in method. (Not in the pages I read, so check it when you get there.)
3. Realtime Database: Databases & Storage, Realtime Database, **Create database**, location **us-central1** (Iowa, the closest listed to Tacoma), start in **Locked mode** (not Test mode). Click Done.
4. Project settings, your apps, add a **web app** and keep the config values (project id, database URL, and so on). They identify the project and are not secrets, but our rule is no keys in the repo: put them in a gitignored `.env` and I will read them only through `node --env-file=.env`, so I never print them. Vercel gets the same values as project environment variables.
5. Tell me when it exists. Until then I can write and test the rules on the local emulator, if you approve the tools below.

## Tools needing Kevin's approval (rule: no new dependency without showing the license)
| Tool | License | Notes |
|---|---|---|
| `firebase` (the web SDK, in the plan) | Apache-2.0 | 36 MB unpacked as a package; a page loads only the modules it imports. How it is loaded (npm with a bundler, or the vendor CDN) is open |
| `firebase-tools` (the emulator, dev only) | MIT | 67 direct dependencies; the emulator needs Java, and Java 22 is installed |
| `@firebase/rules-unit-testing` (rule tests, dev only) | Apache-2.0 | needs Node 24.12 or newer; this machine has 24.14.1 |

## Pre-spike checks against the real project (2026-10-27)
Kevin created the project on 2026-10-26 (Anonymous sign-in on, Realtime Database in `us-central1`, rules `.read: false` and `.write: false`, a web app registered; the console also turned Google Analytics on, which we do not load). Five single requests from a Node script, with the endpoints and fields read from Firebase's REST docs first, nothing secret printed, and the throwaway user deleted afterwards:
| Check | Result |
|---|---|
| Read the database, not signed in | HTTP 401 "Permission denied" |
| Anonymous sign-up (`accounts:signUp`) | HTTP 200: an id token and a 28-character uid came back, the email was empty, the token lasts 3600 s. **Anonymous sign-in works from a script.** |
| Read the database, signed in | HTTP 401: the locked rules deny signed-in users too |
| Write to the database, signed in | HTTP 401 (nothing was written) |
| Delete the throwaway user (`accounts:delete`) | HTTP 200 |
| Round trip, 5 unauthenticated reads over HTTPS | 46 ms minimum, 49 ms median, 233 ms maximum (the first includes connection setup). An upper bound for a held-open socket, from Kevin's machine, not yet measured through the SDK |
These show the project, the key and the locked rules work. They do **not** yet prove any of the spike's five checks: no per-player rules exist yet, nothing ran in a browser, and no refresh test ran. Not confirmed: that the project is on the free Spark plan, and whether Auto clean-up was saved.

## The spike (first live-play session): pass or fail
1. Two browsers join one table by code.
2. A second player's read of the first player's `private` path is **denied**.
3. A refresh keeps the same seat and hand.
4. A round trip time is measured.
5. Rules tests run on the emulator and fail when the rules are broken on purpose.
If 1, 2 or 3 fails, switch to Supabase (or Vercel WebSockets) before building more.

## Still not verified
Firebase's anonymous-account limits per IP; **checked 2026-10-26:** the rules reference has `now` (server milliseconds), `root`, `data`, `newData`, `exists()`, `hasChild()` and `hasChildren([...])`, but **no `numChildren`** (seats use create-only slots instead), and `.indexOn` with `orderByChild`/`endAt`/`limitToFirst` queries exists. Still to test in the spike: arithmetic and conditional expressions in rules (the min of two deadlines), the server timestamp from the web SDK passing a `=== now` rule, and deletion of an expired table by any signed-in user; whether Firebase ever pauses idle free projects (none found); the SDK's size on a phone; round-trip time from Tacoma; whether Vercel Marketplace's Redis matches Upstash's free tier; Supabase's default for "Allow public access"; the Cloudflare ratio for WebSocket messages (the page was cut off).

## Sources (read 2026-10-26)
- Vercel: `vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections`, `.../publish-and-subscribe-to-realtime-data-on-vercel`, `vercel.com/docs/plans/hobby`
- Firebase: `firebase.google.com/docs/database/usage/limits`, `.../usage/billing`, `.../security`, `.../security/rules-conditions`, `.../web/read-and-write`, `.../web/offline-capabilities`, `.../web/start`, `.../locations`, `firebase.google.com/docs/auth/web/anonymous-auth`
- Supabase: `supabase.com/docs/guides/realtime/limits`, `.../realtime/pricing`, `.../realtime/authorization`, `.../deployment/going-into-prod`, `.../auth/auth-anonymous`
- Cloudflare: `developers.cloudflare.com/durable-objects/platform/pricing/`, `.../limits/`
- Upstash: `upstash.com/pricing/redis`
- npm registry for the three package licenses
