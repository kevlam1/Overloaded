# Plan and open work

This is how I am planning Overloaded. The open work comes first, then what I dropped or parked, then the finished items of the earlier versions of this list, shortened. The detail of each finished item is in `log.md` (the entry numbers are in `CLAUDE.md`), and the longer wording of this list is in the git history of this file. My design notes are in `docs/design-notes.md`.

## Decided
- [x] Hosting: Vercel, which builds `main` and serves https://overloaded-spell.vercel.app.
- [x] Live play: Firebase Realtime Database with anonymous sign-in and Security Rules, no server (`docs/live-play.md`).
- [x] No accounts: a name per lobby, and decks kept in the browser as text.
- [x] Casual play only: no rules engine, players move their own cards.
- [x] Formats: Commander and Standard. The host picks the seats, and a match needs two ready players.
- [x] Card data: our own list built from Scryfall's bulk files during Vercel's build, with no Scryfall request while playing (`docs/scryfall.md`).
- [ ] At the start of every session, check the "Unknowns to check when their trigger happens" table in `CLAUDE.md`.

## Next, before the Dec 7 show and tell (proposed, not agreed)
- [x] **Stack window, step 2: arrows.** Shift and drag from a stack card to another stack card or to a card on the battlefield, or use "Point an arrow at..." in the card's menu. The arrows follow the cards, go with the card they belong to, and are covered by Undo (log entry 227).
- [ ] **Stack window, step 3: game history.** A log of the moves (played, tapped, drew) in its own floating window that slides out like the stack. Nothing like it exists yet; the status line only shows the last move.
- [ ] **Stack window on the live table.** Only the solo page has it. On the live table every player must see the stack and its arrows, which needs new database fields and a rules change that I paste into Firebase, so it waits until the solo version feels right.
- [ ] **Play a real game with two players on the table page.** Most changes since Nov 11 (hand fan, floating bar, menus, card details, pile windows, 7 by 10 cards) were made and tested on the solo page only. Run `npm run test:live` and play once with two real browsers.
- [ ] **Decide what the table page gets from the solo page before Dec 7.** The hand fan, the floating bar and the pile windows are solo only.
- [ ] **Re-measure the cards with three opponents.** The old numbers (26 px tall at 1366 by 650) were for bigger cards. Maybe fewer columns or rows, or a slimmer opponent panel.
- [ ] **Understand the flaky browser checks.** The solo check sometimes fails the hand lowering, "two cards played together" and the drawn-card flight checks (they pass on a rerun), and `--screenshot` crashes near the end.
- [ ] **Fan content.** Re-read Wizards' policy in a browser (only a summarizer was read), put the disclaimer on every public page (the solo and table pages only have it under Settings), and decide about the Mana icons and the real card back.
- [ ] **Sound files.** The source and licence of all four are not recorded (`frontend/public/sfx/credits.md`), so check them or replace them. Keep or delete the three uncommitted `commander-play-*.mp3` files.
- [ ] **Firebase key.** Restrict the public web key in Google Cloud Console (HTTP referrers, and only the Identity Toolkit and Token Service APIs), then close the GitHub alert. To rotate it instead: make a new key, restrict it, change it in Vercel and `.env`, redeploy, test, and delete the old one. The old key stays in git history.
- [ ] **Logs page summaries.** `SUMMARIES` in `scripts/log-summaries.mjs` is empty, so every entry shows the first sentence of its "What I asked for". Write the one-sentence summaries in my own words.

## Before real users (not needed for the Dec 7 demo)
- [ ] **Scheduled cleanup of old tables.** An expired table that nobody reopens stays in the database, against "lobbies are deleted when inactive" (whoever opens an expired table already deletes it). The fix is a free scheduled job outside Firebase, because Cloud Functions need the paid plan; it needs `firebase-admin` and an admin key kept in Vercel. Show Kevin the host, cost, license and key storage first.
- [ ] **One more batched rules change, when one is needed.** The other player counters (rad, ticket, speed), the commander tax and commander list, a table-code format check, and a limit on presence tab notes. Then a mutation run, Kevin pastes the rules, and `npm run test:live`. Add counter and those extra counters are solo only until then.
- [ ] **Match flow gaps (checked in the code 2026-11-17).** `claimHostSlot` is not called by any page. The table page uses four `confirm()` placeholders and shows no "the host ended the match" message. Nothing ends a match when all but one have conceded, and leaving and returning mid-match is not tested in a real browser.
- [ ] **Game sync.** A public zone other than the battlefield is written whole when it changes. Measure a real four-player game and switch to per-card writes if it matters. Old cards stay in the database for a player who never returns.
- [ ] **Abuse and security.** Unknown: how many anonymous accounts one address can make, and what to do near the 100-connection limit. Also test slow connections, and run `npm audit` before a deploy (never `npm audit fix --force`, it downgrades Firebase). A 6-character table code is fine for now.
- [ ] **Smaller known gaps.** One person can sit at several tables, two players can share a name, and a second tab of one browser after leaving is untested. "You're offline" is only unit tested, and the takeover has no screenshot after the click.

## Gameplay and table, still open
- [ ] **Menus (`docs/menus.md`).** The library, hand, hand group and battlefield card menus, card details and Add counter are built. The rest of that plan (command zone, life, turn, graveyard and exile extras) was not re-audited, and a menu for a picked group on the battlefield is not built.
- [ ] **Tokens.** Create copy exists, but the token creator from Scryfall's token list, with related tokens, is not built.
- [ ] **Emblems.** The card list drops them, but they should go to the command zone. First check whether Scryfall links a planeswalker to its emblem through `all_parts`.
- [ ] **Two-sided cards.** Flip cards, meld cards and reversible printings are not covered, and a copy of a back face takes its keywords from the whole card.
- [ ] **Commander damage.** Two partner commanders of one seat share one number, and the page with a Standard table is not tested.
- [ ] **Deck page.** Partner suggestions from keywords, a companion pick, moving cards to the sideboard, a Scryfall lookup for names newer than the list, and ManaBox's export text. Link import stays paste only until a site agrees.
- [ ] **Lobby.** Previewing your own deck with sideboard swaps, and a 60-card Standard sample deck (only the Commander sample exists).
- [ ] **Playmats and card-back uploads,** kept in the uploader's browser only (`docs/tokens-counters.md`).
- [ ] **Phones and tablets (on hold since 2026-10-28).** Desktop only for now. Later: phone-width and dark-mode screenshots, a real-phone test, touch versions of the hover features, and a long-press menu.
- [ ] **The Stack, a shared zone (parked until after Dec 7).** Spells and abilities from every seat, newest on top, anyone may remove one. It needs research first (`docs/stack.md` was never written) and a database rules change.

## Dropped or parked
- Dropped: the week-by-week schedule and the progress cards for Weeks 6 to 9 (only progress checks, and the portfolio card is updated), the old test plan (the checks exist), Cloud Functions for cleanup (paid plan), and the "round icon" from my screen recording (its meaning was never shown).
- Parked as polish: marking `placeholder` and `lowres` printings (575 and 6,754 of them), preferring a paper high-resolution printing for a title carried by several printings, and matching translated names.

## Done and earlier plans
The finished items of the earlier versions of this list, shortened. Dates are 2026.

### Planning and decisions
- [x] Hosting on Vercel, project `Overloaded`, building `main` (2026-10-25).
- [x] No accounts: a name per lobby, decks cached in the browser as text.
- [x] Lobby: a generated link `/lobby/CODE` or a typed code, the host picks the seats, players ready up, the host starts.
- [x] Casual mode only, Forge's rules engine skipped, and a deck builder only if there is time.
- [x] Scryfall checked: rules, rate limits, batch lookup, fields, images and bulk sizes (`docs/scryfall.md`).
- [x] Card data: our own list built during Vercel's build, a 200-card cap on main plus sideboard, rules text left out of version one (added 2026-11-15).
- [x] Online-only cards dropped (811, every printing digital); preview cards of unreleased sets stay.
- [x] Course page read and summarized in `CLAUDE.md`: show and tell Mon Dec 7, due Sun Dec 13.
- [x] Weeks 6 to 9 dates: ignored, they are only progress checks. The Artifact 5 card on the portfolio is updated.
- [x] Formats decided: Commander and Standard to start, with deck sizes as hints (2026-10-30).
- [x] Fan Content Policy read through a summarizer (`docs/fan-content.md`); the re-read in a browser is still open above.
- [x] How often the card list changes: over 3 days 198 added, 0 removed, 23 changed and 162 default printing ids changed, so the weekly limit applies (2026-10-29).
- [x] Week-by-week plan to Dec 7: replaced by the "Next" list above.
- [x] Stack of tools: Vite and the Firebase SDK, no framework (2026-10-27).

### Live play, rules and the lobby
- [x] Live play decided: Firebase Realtime Database, anonymous sign-in, Security Rules (2026-10-26).
- [x] Firebase project created on the free Spark plan, with anonymous sign-in on and locked rules at first.
- [x] The five config values kept in a gitignored `.env`, with names in `.env.example`; the five settings are in Vercel (2026-10-28).
- [x] Five pre-spike checks passed against the real project (2026-10-27).
- [x] Dev tools approved and installed in `backend/`, which has its own `package.json`.
- [x] `npm test` no longer leaves the emulator's Java process running (`backend/run-tests.mjs`).
- [x] Rules for `meta`, server-time `lastActive`, the idle and 8-hour limits, and deleting expired tables.
- [x] Conceding, ending a match and the last player standing: a flag on your own member entry, End match for the host only.
- [x] A host who creates a new table has the old one deleted, after a confirmation popup.
- [x] Join gate: seat slots, joining only in the lobby with a free seat, one seat per user.
- [x] The `hosts/{uid}` slot, and a host deleting their own table.
- [x] Partial cleanup: an expired table is deleted by whoever finds it (2026-11-06).
- [x] What `private/{uid}` holds: only the running game's zones, never the deck list.
- [x] Heartbeats in their own write, at most one a minute.
- [x] The rule tests also run against the real project's rules (`scripts/check-live-rules.mjs`).
- [x] Every database call behind one module (`frontend/src/db.js`).
- [x] Table lifetime: 30 minutes idle in the lobby, 1 hour while playing, 8 hours at most, with quiet warning banners.
- [x] The two-browser spike passed (31 of 31 live checks, 2026-10-28).
- [x] Lobby page: join by link, a readable failed join, heartbeat, "Reconnecting...", presence, "You're offline", and taking over from a host who is gone.
- [x] Edge-case and deep QA passes: player names, the card-name pattern, blocked storage, seat squatting, security headers and a content policy in `vercel.json`.
- [x] Backend review: a guard in `run-tests.mjs`, the README, and the `lastSeen` deletion fix.
- [x] The batched rules change: size and shape limits, card fields, `p` only as a Scryfall id. Pasted and confirmed live (2026-11-06).
- [x] Lobby deck fields (`commander`, `bracket`, `bracketGuess`): their rules, mutation run and live checks, the seats, deck picker, Ready, Start button and "Choose a deck" popup.
- [x] The lobby keeps the last deck between matches, and changing a deck un-readies you.
- [x] Lobby screens: `/lobby/CODE` is its own screen with automatic join, and decks can be imported inside the lobby.
- [x] The table page in five steps: Start button and skeleton, your own game, the opponent view, concede/end/leave buttons, and the batched rules change.
- [x] Board layout: the one-screen layout, then the grid battlefield (now 112 by 50 cells, with cards of 7 by 10).

### Card data and deck import
- [x] Card list build: filters, download from Scryfall (one `/bulk-data` request), reuse under 7 days, wired into `npm run build`, checked twice on Vercel (2026-10-29).
- [x] Pasted-decklist parser and card matcher, with tests and a check over every real card name.
- [x] Deck import page: problems first, commander picker, preview by card type (redesigned 2026-11-10).
- [x] The art of the printing a pasted line names, or that carries a title, from small per-set files with no Scryfall request (2026-10-29).
- [x] Changing a card's printing from a picker on the deck page (2026-11-10).
- [x] Several saved decks: up to 20, each tagged Commander or Standard (2026-10-30).
- [x] A sample deck button and `/deck?sample` (2026-10-30).
- [x] A Format choice on the deck page instead of commander radio buttons.
- [x] Import page and preview design: per-site export steps, a commander guess, and Commander, Partner, Companion and Sideboard marks (mostly built).

### Solo and table play
- [x] Solo table at `/solo`: deal 7, battlefield, piles, command zone, tap, draw and life (2026-10-29).
- [x] Counters, the power and toughness box, notes, tokens as copies, player counters and commander damage.
- [x] Two-sided cards: Turn over, Create copy and Play back for modal cards.
- [x] Turns: Pass turn, summoning sickness and "doesn't untap".
- [x] Ping card, tested live between two browsers.
- [x] Sound effects: draw, shuffle, tap and your turn.
- [x] Face-down cards with the real card back (Kevin's decision).
- [x] From my screen recording: Create copy, Ping card, a menu for cards in the pile viewer, and the SICK badge.
- [x] An intermittent failure in the two-browser check fixed: Ready now waits for the deck write.
- [x] Printed power and toughness loose ends: copies keep their numbers and back faces use their own.
- [x] Built since: the grid battlefield with piles and tapped stacks, the hand fan, the menus, card details with rules and rulings, and the pile windows (`CLAUDE.md` has the details).
- [x] Test plan: Node scripts for the game logic, and headless Chrome with one or two browsers for the pages and live play.
