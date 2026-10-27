# Open work (as of 2026-10-25)

Planning only. Nothing is built. My design notes are in `docs/design-notes.md`.

## Decided
- [x] Hosting: Vercel (the project exists, nothing builds yet).
- [x] No accounts. A name per lobby, and decks cached in the browser as text.
- [x] Lobby: a generated link `/lobby/CODE` or a typed code, the host picks the seats, players ready up, the host starts.
- [x] Casual mode only. Forge's rules engine skipped for now. Deck builder later, if there is time.
- [x] Scryfall checked: rules, rate limits, batch lookup, fields, images, bulk sizes (`docs/scryfall.md`).
- [x] Card data: our own card list built during Vercel's build, a 200-card cap on main plus sideboard, and no rules text in version one.
- [x] Online-only cards dropped (811, every printing marked digital). Preview cards of unreleased sets stay.

## Research next (print real data or docs, write what was found in `log.md`)
- [ ] Check the "Unknowns to check when their trigger happens" table in `CLAUDE.md` at the start of each session. Each row has an event that makes it due.
- [x] Course page read 2026-10-26 and summarized in `CLAUDE.md`. Show and tell is Mon Dec 7, due Sun Dec 13, and the card shows progress at the end of Weeks 6 to 9.
- [x] Weeks 6 to 9 dates: Kevin said to ignore them (2026-10-27); they are only progress checks.
- [ ] Portfolio session before the show and tell: replace the Artifact 5 placeholder with the title, a link (the repo for now) and a short honest reflection. Optional progress updates in between.
- [ ] Week-by-week plan to the Dec 7 demo: phases 1 to 3 as the core, a deployed, playable demo on Vercel, and the live-play decision made early because it is the biggest unknown.
- [x] Wizards of the Coast Fan Content Policy read (through a summarizer): `docs/fan-content.md`. Re-read the real page in a browser before going public, and put the disclaimer on every page.
- [ ] Which formats the lobby offers, and the deck-size rule for each (Commander exactly 100, 60-card formats at least 60).
- [ ] Later: a weekly rebuild of the card list, and exact printings from one small file per set (flow in `docs/scryfall.md`).
- [ ] When the build is set up: avoid downloading about 100 MB from Scryfall on every push, and change the card list at most weekly (each change makes every returning player re-download 1.41 MB). Keep the bulk files and the built list in `.vercel/cache`, reuse the list if it is younger than 7 days, and sort it by name so the bytes stay identical. Test on a real Vercel build that an unchanged list keeps its ETag across deploys.
- [ ] Next time we work on card data (no timer): measure how often the trimmed card list really changes. If Scryfall's `oracle_cards` file is newer than the cached one (2026-10-25 21:01 UTC), first copy the cached `data/cache/scryfall/oracle_cards.jsonl.gz` aside (the script overwrites it), download the new one, build both trimmed lists sorted by name, and count added, removed and changed cards. If they rarely differ, the weekly limit almost never applies.
- [x] Live play decided 2026-10-26 (plan approved): Firebase Realtime Database + anonymous sign-in + Security Rules, no server code. Research, data model and sources in `docs/live-play.md`.
- [x] Kevin created the Firebase project on 2026-10-26 (checked from his screenshots): Anonymous sign-in on, Realtime Database in `us-central1` with rules `.read: false` and `.write: false` (Locked), and a web app registered. The console also turned Google Analytics on (the config has a `measurementId`); we don't load the Analytics SDK and don't use that field. Not yet confirmed from a screenshot: that Auto clean-up was saved, and that the project is still on the free Spark plan.
- [x] Kevin saved the five config values in a gitignored `.env` (names in the committed `.env.example`). Checked 2026-10-27 without printing them: all five present and well shaped, project id and auth domain consistent, and `.env` ignored by git. My own attempt to create the file was blocked by the deny rule, and I did not work around it.
- [x] Five pre-spike checks passed against the real project (2026-10-27): reads and writes refused when signed out and signed in, anonymous sign-up works, throwaway user deleted, REST round trips 46 to 233 ms. Results in `docs/live-play.md`.
- [ ] **Kevin:** confirm in the console that the project is on the free Spark plan (near the bottom of the left sidebar), and whether Auto clean-up was saved.
- [x] Dev tools approved and installed 2026-10-27 in `backend/` (own `package.json`): `firebase-tools`, `@firebase/rules-unit-testing`, `firebase`. 11 audit findings, all in their own dependencies, dev only, not fixed (the fixes are major downgrades). First rules and 33 emulator checks pass (`npm test` in `backend/`); 16 of 17 broken copies of the rules fail them, and the survivor is probably redundant (see log entry 27).
- [x] `npm test` left the emulator's Java process running on port 9000 (Windows). Fixed 2026-10-27 with `backend/run-tests.mjs`, which stops only that process after every run; checked on a passing run and on a deliberately broken one.
- [ ] Rules still to write and test: `meta`, seat slots (create-only), `lastActive` as server time, the idle and 8-hour write limits, presence, `inbox`, and a limit on one open table per user. Two known holes until then: anyone signed in can create a table by writing a member entry under a new code, and a public zone accepts 1 MB (add size or shape limits when the zone shapes are designed).
- [ ] Keep every database call behind one small module (create, join, listen, write a move) so Firebase could be swapped for Supabase by rewriting that file. Reasons the choice could flip are in `docs/live-play.md`.
- [ ] Table lifetime (Kevin's idea, refined 2026-10-26): 30 minutes idle in the lobby, 1 hour idle once playing, 8 hours absolute; activity detected in the background (taps, clicks, keys, moves, only while the tab is visible), no popup, two quiet banners (the last 5 minutes of the idle limit, which a tap clears; and 30 and 10 minutes before the 8-hour limit, which nothing clears); heartbeats to a path nobody listens to; lazy cleanup by an indexed query; one open table per user; seats as create-only slots. Draft in `docs/live-play.md`; the spike tests the rules. **Decided 2026-10-26:** keep the idle banner ("definitely"; its design comes later) and the 8-hour warnings at 30 and 10 minutes before ("good enough"). The decided UI pieces are listed in `CLAUDE.md` so they are remembered at design time.
- [ ] Presence UI (Kevin's idea): "Reconnecting..." label and loading animation on a disconnected player's avatar and board, then "Disconnected, last seen N min ago" after about 2 minutes, and "You're offline" on your own screen. Must respect `prefers-reduced-motion`. Spike: measure how fast a closed tab and a dropped network show as offline.
- [ ] The spike (first live-play session): five pass or fail checks in `docs/live-play.md`. If the first three fail, use Supabase.- [ ] Deck import: still missing ManaBox's exports (Export, and Share with a custom text file with printings). Details in `docs/deck-import.md`.
- [x] Pasted-decklist parser `shared/deck-text.mjs` with tests (text to entries only).
- [x] Card matcher `shared/card-match.mjs` with tests and a check over all real card names (names to cards, no printings).
- [ ] Next import pieces, in order: (1) merge repeated lines and apply the 200-card cap to merged quantities; (2) resolve printings (set and number to a Scryfall id, using the per-set files plan in `docs/scryfall.md`); (3) the build step that writes the card list (needs the weekly-rebuild plan shown to Kevin first); (4) the page that previews the deck and confirms the commander. Decide how the 14 shared names are settled (build prefers the non-joke card, or the page asks).
- [ ] Import page and preview design (Kevin's idea, 2026-10-26): show per-site export steps, parse each format, guess the commander (typed header, then unlabeled block, then first legendary creature, then first card), and require the player to confirm it in Commander games. The preview marks Commander, Partner or second commander, Companion and Sideboard per card, suggested from Scryfall's keywords. Details in `docs/deck-import.md`. Decide: does the Commander size check count commander plus 99, with the companion and sideboard outside it?
- [ ] Deck-link import: version one is paste only. Decide whether to ask Archidekt and Moxfield for permission (draft in `docs/deck-import.md`). No more requests to either site until one says yes. Read both terms in a browser. If Archidekt agrees, check Vercel Hobby function limits first.

## Decide later
- [ ] Stack (frontend and backend), after the research. Show me each option's license and cost before adding it.
- [ ] Lobby details: code length, how long an idle lobby lives, whether changing a deck unreadies a player. Notes in `docs/private-lobby.md`; I have not read PokeGuess's lobby page or WebSocket server yet.
- [ ] Playmat and card-back uploads: proposed to stay in the uploader's browser only.
- [ ] Touch versions of hover features (enlarge a card, the icon legend) for phones and tablets.
- [ ] Test plan: plain Node scripts for game logic, plus headless Chrome with two sessions for live play.
- [ ] A week-by-week schedule once the scope is chosen (due Sun Dec 13).
- [ ] The course wants the card to show progress at the end of each of Weeks 6 to 9, so the Artifact 5 card does not stay locked until the end. See the Portfolio session item under "Research next".
