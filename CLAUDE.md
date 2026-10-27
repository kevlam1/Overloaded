# CLAUDE.md: Overloaded (TCSS 490 Artifact 5, "The Moonshot")

Read this file first. My shared preferences are in `../CLAUDE.md` (the `TCSS 490` folder, loaded for every artifact, not in git). Keep this file under 200 lines and move anything long into `docs/`.

**Requirements are not final.** This file was written at the start (2026-10-25) to set direction. I will expand and change the scope, the architecture and the structure in later sessions. When something here is replaced, update this file in the same session and log the change. Treat every "Planned" and "Proposed" line as a draft, not a decision.

## What this project is
- A browser-based virtual Magic: The Gathering tabletop simulator, named **Overloaded**. Friends open it, build or load a deck, join a table, and play a game by moving cards around a shared play area in real time.
- Artifact 5 of TCSS 490 (Generative AI and Software Development, UW Tacoma, Autumn 2026): the moonshot, possibly deployed to real users. Due **Sunday, December 13, 2026 at 11:59 PM** on Canvas, and the **final show and tell is in class on Monday, December 7**, so I have about 6 weeks to something I can show. It is the biggest and hardest thing I have built, so plan in phases and expect to cut scope.
- Repo: `https://github.com/kevlam1/Overloaded` (public, created by me, `origin` is set, `main` is pushed, and a Vercel project named `Overloaded` imports it). The name and URL go on the portfolio card, so they can't change. The capital O is part of the name: the repo was briefly renamed to lowercase `overloaded` on 2026-10-26 and renamed back.
- Owner: Kevin Lam. Windows, IntelliJ IDEA Ultimate.
- The Portfolio's Artifact 4 and 5 ideas were swapped on 2026-10-25: my original Artifact 5 (a game reference tool for League of Legends, Valorant and Overwatch) moved to Artifact 4, and this project took Artifact 5. Do not work on Artifact 4 here.
- **The course page, read 2026-10-26** (`../Unit 5/Artifact 5- The Moonshot.pdf`, version 1.0 of 2026-09-26; PDFs are gitignored, so this is my summary). **Complete means:** a genuine five-week attempt at something big, a repository log of plans and changes, and the card on my portfolio. It does not have to land, and I should pick something larger than I'm sure I can finish. Any stack; a team is optional. **Steps:** scaffold (plan in pieces, a CLAUDE.md, a structure), build, keep a log, deploy if it's something people can use, show it, fill the card (title, a link to the live site, repo or demo video, a short reflection), submit the portfolio link on Canvas. **Dates:** at the end of each of Weeks 6 to 9, submit the portfolio link with the Artifact 5 card showing where I am; final show and tell in class Monday, December 7; due Sunday, December 13. It lists LO 3, 7, 8, 9, 12 and 13 (decomposing problems, planning and versioning with documentation, navigating large codebases, communicating decisions, AI as an active component, and cost, latency, reliability and security trade-offs). The linked "Keep a log" and "Labor-Based Grading" pages are not in the PDF and not read.
- **Week dates are my inference, not on the page:** Artifact 2 was due Oct 18 and Artifact 3 Oct 25, a week apart, which fits a quarter where this week (Oct 26 to Nov 1) is Week 5. Then Weeks 6 to 9 end on Sundays **Nov 8, 15, 22 and 29**, and the first card update is due in about two weeks. Confirm on Canvas.
- **My design notes** (2026-10-25, a PDF in `../Unit 5/`, not in the repo) are restated in `docs/design-notes.md`, with Claude's questions next to each idea. They are my wishes, not the course requirements. Read that file before planning.

## Vision
- Play a real game of Magic with friends who are not in the same room, with no cards to buy and nothing to install, on a phone, tablet or computer.
- Bring your own deck: paste a decklist exported from a deck-building site (Moxfield, Archidekt, ManaBox). A deck builder of our own comes later, if there is time.
- Private lobbies with no accounts: the host creates one, shares `/lobby/CODE` or the code, picks the number of seats, players pick a name and deck and ready up, and the host starts.
- The battlefield arranges itself (a row for lands and a row for other permanents) instead of free-form clutter, and cards show icons for keywords and states such as summoning sickness. Tap, flip, look at your hand while others cannot.
- Fast and clear over fancy. A player should be at a table with a deck within a minute of opening the page.
- Gameplay first, visuals after (as with MIDI Companion).
- A simulator for playing the game. "Casual" mode only: players manage their own cards, like paper. A rules engine (Forge) was set aside on 2026-10-25, see "Open questions".

## Planned scope (proposed 2026-10-25 from my design notes; each phase must work before the next starts)
Target: something deployed and demonstrable at the Dec 7 show and tell. Phases 1 to 3 are the core. Everything after is a stretch and the first thing cut. Vercel deploys from `main` all along, so "deploy" is not a last phase.
1. **Deck import and card data.** Paste a decklist (main and sideboard as separate sections) and match it by name against our trimmed card list, with the Scryfall API only for names the list doesn't have. Save it in the browser. No game yet.
2. **Solo table (casual).** Library, hand, battlefield in two automatic rows (lands, other permanents), graveyard, exile, draw, tap and untap, life total.
3. **Lobby and two players, live.** Create a lobby, join by link or code, name, deck, ready up, host starts. Each player sees the other's battlefield, and hands stay hidden.
4. **Up to the seats the host picks** (Commander is four), and reconnecting after a refresh.
5. **Quality of play.** Keyword and state icons, enlarge-on-hover with an icon legend (and a touch version), counters and tokens, a game log, a turn tracker with summoning sickness.
6. **Look and feel.** A snappy hand, playmats (card art, or an upload only you see), card backs, animations that respect `prefers-reduced-motion`.
7. **Stretch:** a "can I afford this" hint, a deck builder, spectators.
- Not planned: a rules engine (Forge skipped for now), user accounts, an AI opponent, buying or trading cards, a mobile app.

## Architecture (proposed, high level)
A multi-page site with a backend, not one `index.html`. The pieces and the folders for them:
- `frontend/pages/lobby/`: create a lobby, join by link (`/lobby/CODE`) or code, pick name, deck and seats, ready up.
- `frontend/pages/deck-builder/`: deck import first; a real deck builder later, if there is time.
- `frontend/pages/table/`: the shared play area (the hardest page).
- `frontend/assets/` and `frontend/src/`: shared images, fonts, styles, and browser code shared by the pages.
- `backend/`: no server. The Firebase Realtime Database rules file (who may read and write which path) and the tests that prove it. Live play is the database plus those rules; see `docs/live-play.md`.
- `shared/`: card, deck and game-state shapes, and the messages sent over the live connection, so both sides agree. No browser-only or server-only code, so Node tests can load it.
- `scripts/`: tests and data tools, plain Node (`test-*.mjs`, `fetch-*.mjs`).
- `docs/`: `todo.md` and longer notes.
- Live play (decided 2026-10-26, see `docs/live-play.md`): each player writes only their own zones, and the database rules keep each player's hand and library readable only by them (so hidden cards can't be read from the browser); a move is one atomic multi-path write of small changes, never a whole state, and a drag sends only the drop. Ideas still to evaluate, not decisions: card data comes from a 1.4 MB gzipped card list (deck cards only, tokens in a separate small list) that a script builds from Scryfall's bulk file and Vercel serves, with images loaded straight from Scryfall and no card database of our own (see `docs/scryfall.md`); the table is drawn with plain DOM or Canvas, whichever tests faster with a hundred cards.
- Keep game logic (zones, moving a card, drawing, shuffling, what each player may see) in plain modules with no browser or network code, so it can be tested in Node.

## Stack
- **Live play chosen 2026-10-26:** Firebase Realtime Database (free Spark plan) with anonymous sign-in and Security Rules; frontend as plain static pages on Vercel; no server (questions 5, 6, 8). Not chosen yet: the frontend build and how the Firebase SDK is loaded (question 7). The only `package.json` is `backend/package.json` (dev tools for testing the database rules); the repo root has none, and none of the three earlier artifacts' tools is assumed.
- Defaults to prefer when choosing: plain and small, few dependencies, TypeScript only if I agree, and nothing that needs a paid key. MIDI Companion (Vite and TypeScript, hosted on Vercel) is the model for a build setup, and Portfolio (plain HTML, CSS, JavaScript) is the model for no build.
- Every new dependency: show me its license and its cost, and ask first.

## Files
- `CLAUDE.md`: this file.
- `README.md`: what it is. Rewrite it when there is something to run.
- `log.md`: the build log in my first-person voice (see "The log protocol").
- `docs/todo.md`: open items.
- `docs/design-notes.md`: my design notes restated, with Claude's notes and risks per idea.
- `docs/scryfall.md`: Scryfall's rules, rate limits, batch lookup, fields, image links and bulk file sizes (checked 2026-10-25), two audits with fixes and costs (2026-10-26).
- `scripts/fetch-scryfall.mjs`: research tool. `sample` saves one batch lookup. `bulk [type]` downloads a bulk file and measures the card list, the list with rules text, and the per-set printing files. Writes only to `data/cache/scryfall/` (gitignored). Stops on any failed request.
- `scripts/audit-card-data.mjs`: checks the cached bulk files for what breaks name matching (tokens, collectibles, online-only cards, multi-face names, accents, normalization collisions, back-face clashes) and prints list sizes. No network.
- `docs/deck-import.md`: what the deck sites document about their export text, the test deck, the real exports, and the link-import analysis.
- `shared/deck-text.mjs`: the pasted-decklist parser (text to entries; no card lookup). `scripts/test-deck-text.mjs` tests it.
- `shared/card-match.mjs`: matches entries to cards by name (no printing yet). `scripts/test-card-match.mjs` (small real fixture in `scripts/fixtures/`) and `scripts/check-card-match.mjs` (every real card name, needs the cache) test it. `scripts/fixtures/exports.mjs` holds the three real exports.
- `docs/live-play.md`: the live-play research (Vercel WebSockets, Firebase, Supabase, Redis, Cloudflare) with sources, the decision, the data model and the spike checklist.
- `docs/fan-content.md`: Wizards of the Coast's Fan Content Policy as read on 2026-10-26, and what it means for this site.
- `backend/database.rules.json`, `backend/firebase.json`, `backend/test-rules.mjs`, `backend/run-tests.mjs`, `backend/package.json`: the first database rules (private branch owner-only, members and public zones), the emulator config, 33 rule tests, and the wrapper `npm test` runs (it stops the emulator's leftover Java process after each run, only one whose command line has `firebase-database-emulator` and `--port 9000`). Run `npm install` then `npm test` in `backend/` (needs Java and Node 24.12+). Rules are not deployed to the real project yet.
- `docs/private-lobby.md`: how PokeGuess does private rooms (code, player token, reconnect, hidden data) and what it suggests here. Draft ideas.
- `.gitignore`: ignores `node_modules/`, `dist/`, `build/`, `.env` and `.env.*` (not `.env.example`), `*.local`, `*.log`, `.idea/`, `scratch*`, `CLAUDE.local.md`, `.claude/settings.local.json`, `.vercel/`, `coverage/`, OS files (`Thumbs.db`, `desktop.ini`, `.DS_Store`), `*.pdf` (keeps my design notes out), `*.sqlite`, `*.db` and `data/cache/`.
- `.claude/settings.json`: `Read` deny rules for `.env` and key files, copied from readme-architect. Best-effort only (the docs call `Read` rules best-effort), not a hard block.
- `frontend/`, `backend/`, `shared/`, `scripts/`: each has a short `README.md` saying what goes there. Empty folders hold a `.gitkeep`.
- Not set up yet, on purpose: a `/logs/` page (see "Reuse"), CI, a database. A Vercel project exists, but nothing builds yet.

## Run and check
- No site yet. Research tool (Node 20.11 or later, because the scripts use `import.meta.dirname`; no install): `node scripts/fetch-scryfall.mjs sample` (one API request) and `node scripts/fetch-scryfall.mjs bulk [oracle_cards|default_cards]` (a 24 MB or 76 MB download, skipped if today's copy is cached, then sizes printed). After both downloads: `node --max-old-space-size=4096 scripts/audit-card-data.mjs`.
- Tests: `node scripts/test-deck-text.mjs` ("All deck text checks passed.") and `node scripts/test-card-match.mjs` ("All card match checks passed."). Both were checked on 2026-10-26 against deliberately broken copies (34 of the parser, 17 of the matcher); every one failed them. With the card cache downloaded, also `node --max-old-space-size=2048 scripts/check-card-match.mjs` (every real card name; its one blind spot is the `Æ` mapping, which no real name uses, so only the unit test covers it).
- Card-list rules from the 2026-10-26 audit (details in `docs/scryfall.md`): tokens in their own list, no collectibles, no online-only cards (only when every printing is `digital: true`, never because `paper` is missing, which would drop previews of unreleased sets), land row and icons from the showing face, match full name then front name after normalizing accents, quotes and slashes (back-face names only as a "did you mean" suggestion, since 29 clash), at most one fallback batch request per import. Load card images only when the card is showing, `small` where cards are small.
- Any code that calls Scryfall must send `User-Agent` and `Accept`, keep `/cards/collection` to 2 requests a second, back off on HTTP 429, and cache results for at least 24 hours.
- **The card-data build must not download Scryfall's bulk files (about 100 MB) on every push, and must not change the card list more than once a week.** Vercel's docs say files in `.vercel/cache` persist between builds: keep the bulk files and the built list there, and reuse the list if it is younger than 7 days. Write the list in a fixed order (sorted by name) so unchanged data gives identical bytes. A changed list makes every returning player download all of it again (Vercel serves static files with `max-age=0, must-revalidate` and an ETag, checked on MIDI Companion). Show me the plan before building it. See the second audit and "How often to rebuild" in `docs/scryfall.md`.
- Check what you build by running it, and say what you checked and what you could not. For a page, drive headless Chrome as described in `../CLAUDE.md` and look at a screenshot at desktop and phone width.
- For real-time play, a check needs two browser sessions at once. Say plainly that one session cannot prove sync, and test with two.
- Game logic gets plain Node tests that print "All ... checks passed." Make sure the tests really run (an assertion in a comment passes forever).
- Spot-check card data against the real source (print the raw fields first). Record every disagreement in `log.md`.

## Unknowns to check when their trigger happens (added 2026-10-26)
Desk research can't answer these. When a trigger below happens in a session, do the check in that session, record the result in `log.md` and `docs/scryfall.md`, and delete the row here. Tell me when one is due.

| Still unknown | Trigger: check it when... | How |
|---|---|---|
| How often the trimmed card list really changes | we next work on card data and Scryfall's `oracle_cards` file is newer than the cached one | Steps in `docs/todo.md` (copy the cached file aside first, since the script overwrites it) |
| Same ETag across deploys for an unchanged list; whether `.vercel/cache` really keeps files between builds | the first real Vercel build that writes the card list | Deploy twice without changing card data; compare the list's `ETag` and the build log |
| ManaBox's export text (Moxfield and Archidekt text are known) | before writing the decklist parser (phase 1) | Kevin pastes ManaBox's Export and Share → Custom text file (see `docs/deck-import.md`) |
| Whether Archidekt or Moxfield allow automated deck requests from our server | before building any deck-link import | Kevin decides whether to ask each site; read both terms in a browser (Archidekt's were read only through a summarizer). **Make no more requests to either site until a site says yes.** |
| Firebase: per-IP limits on anonymous accounts, whether rules accept the arithmetic and server-timestamp checks the table lifetime needs (`now` exists, `numChildren` does not), whether idle free projects are ever paused (none found), the SDK size on a phone, round-trip time over a held-open connection (plain HTTPS reads measured 46 to 233 ms on 2026-10-27; anonymous sign-up from a script already works) | the spike (first live-play session) | Run it; record each result in `docs/live-play.md`; if the first three spike checks fail, use the Supabase fallback |
| Whether Vercel Marketplace's Redis has the same free tier as Upstash's (only matters if Firebase fails and we use Vercel WebSockets) | only if that fallback is chosen | Read it then |
| The Fan Content Policy's exact wording (read only through a summarizer, page dated 2017) | before the site goes public | Read `company.wizards.com/en/legal/fancontentpolicy` in a browser; copy the disclaimer exactly into the README and every page |
| Real data transfer against the free 100 GB | the site has real players | Vercel dashboard usage page; redo the math in `docs/scryfall.md` |
| Whether the scripts run on Node 20.11 (only 24 tested) | Vercel's build Node version is chosen, or someone runs them on 20 | Run both scripts on that version |

## Decided UI pieces, design still to come (added 2026-10-26)
These were decided with me but not yet designed. When the lobby or table pages are designed, **include every one of them without being asked, and remind me if I forget one.** Details are in `docs/live-play.md` and `docs/deck-import.md`.
- **Idle banner (decided, "definitely"):** a quiet, non-blocking banner in the last 5 minutes of the idle limit (minutes 25 to 30 in a lobby, 55 to 60 in a game), shown only when someone is looking at a visible tab and nothing has happened. A tap clears it. No popup.
- **8-hour limit banners (decided):** a quiet banner 30 minutes before the 8-hour limit and a more visible one at 10 minutes, saying when the table closes and that it can't be extended. Nothing clears them.
- **"Reconnecting..." indicator:** a disconnected player's avatar and board show "Reconnecting..." with a loading animation, then "Disconnected, last seen N min ago" after about 2 minutes; your own screen shows "You're offline, reconnecting...". The animation respects `prefers-reduced-motion`.
- **Closed-table message** for anyone who joins or is still in a table that closed (idle in the lobby, idle in a game, or the 8-hour limit).
- **Deck preview page:** every card shown, the commander confirmed by the player in Commander games (a typed `Commander` or `Companion` line marks only the next card), a partner, second commander or companion pickable, cards movable to the sideboard, per-site export steps shown ("Copy for Moxfield", Archidekt's text export).
- **Fan content disclaimer** on every public page.

## Hard rules
- No keys, tokens or secrets in the repo, not even in `log.md` or `README.md`. Use environment variables and a gitignored `.env` with a committed `.env.example` that has names only. My repos are public.
- No personal details (email, phone, home network address) in any file. If accounts are added, decide first what is stored, where, and who can see it.
- Do not use a paid service or key without asking me. Say what it would cost first.
- No new dependency without showing me its license and asking.
- Do not copy third-party code or assets with an unclear license. Card art and text belong to Wizards of the Coast; use only what the source and the fan-content rules allow, and credit it. The exact rules are unchecked (see "Open questions").
- Do not commit, push, force-push or rewrite history unless I ask. No `Co-Authored-By` line or other Claude attribution in commit messages or pull requests.
- Lowercase file names for new files (`CLAUDE.md` and `README.md` keep their standard names).
- Before using any API field, file format or library feature, print the raw data or the docs and show me the exact field.
- Start from a clean `git status` and tell me if it is not clean.
- Every animation respects `prefers-reduced-motion`. Every inline SVG has `width`, `height` and `fill` set directly.
- Once a card on the Portfolio links to a URL, never move or rename it.
- Never name the reference products from my design notes PDF in any file, commit or log entry, and never describe the site as copying another product. Describe the feature itself. Do not copy the PDF or its screenshots into the repo.
- Store nothing that is not needed (money, speed, privacy). Lobbies are deleted when inactive. Decks live in the browser.
- Fan content rules (`docs/fan-content.md`): free access only, no payment or email sign-up, no Wizards or Magic logos, never "Magic: The Gathering" in the site's name, card images unaltered, and the fan content disclaimer on every public page and in the README.

## How to work with me
- Keep steps small. After each change, say which files you touched and what changed.
- This is a long project, so at the start of a session, read `docs/todo.md` and the last few `log.md` entries before doing anything.
- If a request is much bigger than the time I have, say so and propose a smaller first version. Cut scope early, not late.
- If a request can be read two ways, say how you read it before building.
- Explain new things (WebSockets, hosting a backend, a database) before building them. I may not have done them before.
- Use plan mode for anything that changes the architecture.

## The log protocol
- Add to `log.md` directly, in my first-person voice, matching the existing entries, and say what you added so I can review the diff. Never rewrite past entries without asking. List your own mistakes. Do not claim you tested something you did not.
- Keep the structure of `../midi-companion/log.md` so a `/logs/` page script can read it later: a title and tool lines, then `## What I set out to build`, then numbered `## N. Title (YYYY-MM-DD)` sections with bold labels (`**What I asked for**`, `**What changed**`, `**What I checked**`, `**Decisions**`), then `## Where AI misread me, or I had to correct course` and `## Decisions and abandoned ideas`. No other `##` headings.
- For a project this long, log decisions and dropped features as they happen, including every scope cut and why.

## Reuse from the other artifacts
- `../midi-companion/`: layout of its `CLAUDE.md`, the `scripts/test-*.mjs` approach, Vite and TypeScript setup, Vercel hosting.
- `../midi-companion/scripts/make-logs-page.mjs`, `log-summaries.mjs`, `logs-template.html` build a `/logs/` page from `log.md`. Copy them instead of writing a new one if the card should link to a `/logs/` page, and change the template's title, intro and links, which are about MIDI Companion. The alternative is linking to `log.md` on GitHub, as readme-architect does. Not decided.
- `../readme-architect/`: the `.claude/settings.json` deny rules, and the idea of a fixture with known contents to check data against.
- `../Portfolio/`: the card for this artifact is filled in from a session started in the Portfolio folder. The Weeks 6 to 9 card updates are only progress checks (Kevin, 2026-10-27, ignore their exact dates), so a Portfolio session is optional between now and the show and tell.

## Open questions (all unanswered; each one needs a decision before the part it affects is built)
1. **What the course page requires.** Answered 2026-10-26, see "What this project is". Not answered: what the "Keep a log" page asks for (my log follows MIDI Companion's structure), and the exact dates of Weeks 6 to 9.
2. **Rules enforcement.** Decided 2026-10-25: casual mode only. Forge's engine is skipped for now and not researched. Auto-sorted rows, icons and summoning sickness do not need it.
3. **Card data.** Decided 2026-10-26 (see `docs/scryfall.md`): our own card list, a static file built from Scryfall's bulk file during Vercel's build and not committed. Imports make no API calls, except a batch lookup for names newer than the list. 200 cards maximum for main plus sideboard, checked at import. The format checks deck size before a player can ready up. No rules text in version one. Exact printings come soon after, from one small file per set. Open: which formats the lobby offers, and a weekly rebuild.
4. **Wizards of the Coast's fan-content rules.** Read 2026-10-26 through a summarizer, see `docs/fan-content.md`: free access only, no logos or trademarks, a required disclaimer, and Wizards may ask us to stop at any time. Kevin judges it fine (Moxfield has a playtest feature). Gray areas remain (a virtual tabletop is not mentioned). Re-read the real page in a browser before the site goes public.
5. **Live sync.** Decided 2026-10-26 (plan approved; research and sources in `docs/live-play.md`): **Firebase Realtime Database with anonymous sign-in and Security Rules**, no server code. Each player's hand and library live in a `private` branch that only that player can read or write (the database enforces hidden hands); public zones are written by their owner; a move is one atomic multi-path `update()`. Lobbies are tables keyed by the code. A table closes after 30 minutes with no activity in the lobby or 1 hour once playing, and never lives past 8 hours from creation (Kevin's idea, 2026-10-26, like a banking app: the rules enforce it from the database's clock, activity is detected in the background from taps, clicks and moves while the tab is visible, with no popup, and idle tables are deleted lazily). Other players see a "Reconnecting..." avatar and board when someone's connection entries disappear (presence via `onDisconnect`, one entry per tab, which survives a refresh). Seats are create-only slots, because the rules cannot count members. **A 1 to 2 session spike must pass first** (two browsers join by code, a denied read of an opponent's private path, a refresh keeps the seat, a measured round trip, rule tests); if any of the first three fails, fall back to Supabase. Details of the data model are in the plan and `docs/live-play.md`.
6. **Backend language and framework.** Decided 2026-10-26 with question 5: **no backend server.** `backend/` holds the database rules file and its tests. Game logic stays in plain modules in `shared/` with Node tests.
7. **Frontend approach.** Leaning (plan, 2026-10-26): plain pages and ES modules, no framework, reusing `shared/`. Open: how the Firebase SDK is loaded (a bundler dependency or the vendor's CDN). Each new dependency needs its license shown and my approval; the SDK is Apache-2.0 and was approved in the plan.
8. **Hosting.** Decided 2026-10-25: Vercel (Hobby plan), project name `Overloaded`, imported from the GitHub repo, serving the static pages and running the card list build. Corrected 2026-10-26: Vercel Functions *can* hold WebSocket connections (public beta since 2026-06-22, on Hobby too, 300 s maximum per connection, state shared across instances needs Redis), so that was not the blocker I first assumed. It is not used: live play runs on Firebase (question 5).
9. **Accounts and saved decks.** Decided 2026-10-25: no accounts, a name per lobby, decks cached in the browser as text. Open: playmat and card-back uploads (proposed: kept in the uploader's browser only).
10. **Scale and safety if deployed.** Limits known 2026-10-26: Firebase's free plan allows 100 simultaneous connections (about 25 four-player tables or 50 duels) and 10 GB of downloads a month, and never bills. Still open: abuse of anonymous sign-in, rate limiting, and what the page says when the site is full.
11. **Formats and player count.** The host picks the seats. Build for two first, then up to four (Commander).
12. **Does the AI-built-software angle need to show up?** The course page's "What Complete Looks Like" does not ask for a model inside the product (that was Artifact 3). It does list LO 12 (AI as an active component) and LO 13 (trade-offs including cost, latency, reliability, security) among the objectives this artifact contributes to. My cost and security analysis already supports LO 13. Whether to add an AI feature is Kevin's call; none is planned.
13. **Testing real-time and drag-and-drop** on phones and in two browsers at once. How, with headless Chrome only? Phones have no hover or `Alt` key, so every hover feature needs a touch version.
14. **Monorepo layout.** Partly answered 2026-10-27: `backend/` has its own `package.json` (not workspaces) so Vercel never installs the dev tools. Open: where the frontend's dependencies go.
15. **Deck import formats.** What text each site (Moxfield, Archidekt, ManaBox) exports. Print real examples before writing the parser. 2026-10-26: real exports from Moxfield (two options) and Archidekt are in `docs/deck-import.md` and parse with a draft parser; set and number are in "Copy for Moxfield" and Archidekt text but not Moxfield plain text. Sideboard (Moxfield only) and commander (position only) markers are known; a typed `Commander` or `Companion` line marks only the next card, and the import page must make the player confirm the commander in Commander games (the first-card guess was right for 1 of 3 exports; see "Finding the commander" in `docs/deck-import.md`). Still missing: ManaBox. Link import (public and unlisted decks) is analysed there: Archidekt's API returns Scryfall ids and categories but a browser can't call it (CORS), its terms forbid automated requests, and Moxfield's terms are unread. No more requests to either site without permission. Paste text stays the main path; link import only if a site agrees.
