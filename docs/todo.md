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
- [ ] Confirm on Canvas: the dates of Weeks 6 to 9 (inferred: Nov 8, 15, 22, 29), and what the "Keep a log" page requires. The first card update is probably in about two weeks.
- [ ] Portfolio session before the first weekly submission: replace the Artifact 5 placeholder with the title, a link (the repo for now) and a short honest reflection of where it is. Repeat each week.
- [ ] Week-by-week plan to the Dec 7 demo: phases 1 to 3 as the core, a deployed, playable demo on Vercel, and the live-play decision made early because it is the biggest unknown.
- [x] Wizards of the Coast Fan Content Policy read (through a summarizer): `docs/fan-content.md`. Re-read the real page in a browser before going public, and put the disclaimer on every page.
- [ ] Which formats the lobby offers, and the deck-size rule for each (Commander exactly 100, 60-card formats at least 60).
- [ ] Later: a weekly rebuild of the card list, and exact printings from one small file per set (flow in `docs/scryfall.md`).
- [ ] When the build is set up: avoid downloading about 100 MB from Scryfall on every push, and change the card list at most weekly (each change makes every returning player re-download 1.41 MB). Keep the bulk files and the built list in `.vercel/cache`, reuse the list if it is younger than 7 days, and sort it by name so the bytes stay identical. Test on a real Vercel build that an unchanged list keeps its ETag across deploys.
- [ ] Next time we work on card data (no timer): measure how often the trimmed card list really changes. If Scryfall's `oracle_cards` file is newer than the cached one (2026-10-25 21:01 UTC), first copy the cached `data/cache/scryfall/oracle_cards.jsonl.gz` aside (the script overwrites it), download the new one, build both trimmed lists sorted by name, and count added, removed and changed cards. If they rarely differ, the weekly limit almost never applies.
- [ ] Live play and the lobby store: can Vercel hold live connections? Compare Supabase, Firebase and others on free-tier limits, idle pausing, and whether hands can stay hidden. Plan mode.
- [ ] Deck import: still missing ManaBox's exports (Export, and Share with a custom text file with printings). Details in `docs/deck-import.md`.
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
