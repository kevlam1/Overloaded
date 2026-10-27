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
- [ ] Read the Artifact 5 course page when it is posted and copy its requirements into `CLAUDE.md`. My design notes are not the course requirements.
- [ ] Which formats the lobby offers, and the deck-size rule for each (Commander exactly 100, 60-card formats at least 60).
- [ ] Later: a weekly rebuild of the card list, and exact printings from one small file per set (flow in `docs/scryfall.md`).
- [ ] When the build is set up: avoid downloading about 100 MB from Scryfall on every push, and change the card list at most weekly (each change makes every returning player re-download 1.41 MB). Keep the bulk files and the built list in `.vercel/cache`, reuse the list if it is younger than 7 days, and sort it by name so the bytes stay identical. Test on a real Vercel build that an unchanged list keeps its ETag across deploys.
- [ ] Next time we work on card data (no timer): measure how often the trimmed card list really changes. If Scryfall's `oracle_cards` file is newer than the cached one (2026-10-25 21:01 UTC), first copy the cached `data/cache/scryfall/oracle_cards.jsonl.gz` aside (the script overwrites it), download the new one, build both trimmed lists sorted by name, and count added, removed and changed cards. If they rarely differ, the weekly limit almost never applies.
- [ ] Wizards of the Coast's fan-content rules: card images, names, the disclaimer the site must show.
- [ ] Live play and the lobby store: can Vercel hold live connections? Compare Supabase, Firebase and others on free-tier limits, idle pausing, and whether hands can stay hidden. Plan mode.
- [ ] Deck import: still missing ManaBox's exports (Export, and Share with a custom text file with printings). Details in `docs/deck-import.md`.
- [x] Pasted-decklist parser `shared/deck-text.mjs` with tests (text to entries only). Next piece: match entries to cards (needs the card list), then the page.
- [ ] Import page and preview design (Kevin's idea, 2026-10-26): show per-site export steps, parse each format, guess the commander (typed header, then unlabeled block, then first legendary creature, then first card), and require the player to confirm it in Commander games. The preview marks Commander, Partner or second commander, Companion and Sideboard per card, suggested from Scryfall's keywords. Details in `docs/deck-import.md`. Decide: does the Commander size check count commander plus 99, with the companion and sideboard outside it?
- [ ] Deck-link import: version one is paste only. Decide whether to ask Archidekt and Moxfield for permission (draft in `docs/deck-import.md`). No more requests to either site until one says yes. Read both terms in a browser. If Archidekt agrees, check Vercel Hobby function limits first.

## Decide later
- [ ] Stack (frontend and backend), after the research. Show me each option's license and cost before adding it.
- [ ] Lobby details: code length, how long an idle lobby lives, whether changing a deck unreadies a player. Notes in `docs/private-lobby.md`; I have not read PokeGuess's lobby page or WebSocket server yet.
- [ ] Playmat and card-back uploads: proposed to stay in the uploader's browser only.
- [ ] Touch versions of hover features (enlarge a card, the icon legend) for phones and tablets.
- [ ] Test plan: plain Node scripts for game logic, plus headless Chrome with two sessions for live play.
- [ ] A week-by-week schedule once the scope is chosen (due Sun Dec 13).
- [ ] Tell the Portfolio session when this is real enough to put a card on: its card is "Artifact 5" and stays locked until then.
