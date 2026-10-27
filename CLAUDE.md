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
- `backend/src/`: the API (cards, decks, tables) and the live connection that keeps players in step.
- `shared/`: card, deck and game-state shapes, and the messages sent over the live connection, so both sides agree. No browser-only or server-only code, so Node tests can load it.
- `scripts/`: tests and data tools, plain Node (`test-*.mjs`, `fetch-*.mjs`).
- `docs/`: `todo.md` and longer notes.
- Ideas to evaluate, not decisions: the server holds the game state and sends each player only what that player may see (so hidden cards can't be read from the browser); players send small actions ("move card X to the graveyard"), not whole states; card data comes from a 1.4 MB gzipped card list (deck cards only, tokens in a separate small list) that a script builds from Scryfall's bulk file and Vercel serves, with images loaded straight from Scryfall and no card database of our own (see `docs/scryfall.md`); the table is drawn with plain DOM or Canvas, whichever tests faster with a hundred cards.
- Keep game logic (zones, moving a card, drawing, shuffling, what each player may see) in plain modules with no browser or network code, so it can be tested in Node.

## Stack
- **Not chosen.** Candidates and costs are in "Open questions". No `package.json` yet, and none of the three earlier artifacts' tools is assumed.
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
- `docs/fan-content.md`: Wizards of the Coast's Fan Content Policy as read on 2026-10-26, and what it means for this site.
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
| Exact dates of Weeks 6 to 9, and what the "Keep a log" page requires | now (next session) | Kevin checks Canvas or the syllabus; if the dates differ from Nov 8, 15, 22 and 29, fix them here and in `docs/todo.md` |
| The Fan Content Policy's exact wording (read only through a summarizer, page dated 2017) | before the site goes public | Read `company.wizards.com/en/legal/fancontentpolicy` in a browser; copy the disclaimer exactly into the README and every page |
| Real data transfer against the free 100 GB | the site has real players | Vercel dashboard usage page; redo the math in `docs/scryfall.md` |
| Whether the scripts run on Node 20.11 (only 24 tested) | Vercel's build Node version is chosen, or someone runs them on 20 | Run both scripts on that version |

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
- `../Portfolio/`: the card for this artifact is filled in from a session started in the Portfolio folder. The course asks for the card to show where I am at the end of each of Weeks 6 to 9 (probably Nov 8, 15, 22 and 29), not only at the end, so start a Portfolio session each week. Tell me when one is due.

## Open questions (all unanswered; each one needs a decision before the part it affects is built)
1. **What the course page requires.** Answered 2026-10-26, see "What this project is". Not answered: what the "Keep a log" page asks for (my log follows MIDI Companion's structure), and the exact dates of Weeks 6 to 9.
2. **Rules enforcement.** Decided 2026-10-25: casual mode only. Forge's engine is skipped for now and not researched. Auto-sorted rows, icons and summoning sickness do not need it.
3. **Card data.** Decided 2026-10-26 (see `docs/scryfall.md`): our own card list, a static file built from Scryfall's bulk file during Vercel's build and not committed. Imports make no API calls, except a batch lookup for names newer than the list. 200 cards maximum for main plus sideboard, checked at import. The format checks deck size before a player can ready up. No rules text in version one. Exact printings come soon after, from one small file per set. Open: which formats the lobby offers, and a weekly rebuild.
4. **Wizards of the Coast's fan-content rules.** Read 2026-10-26 through a summarizer, see `docs/fan-content.md`: free access only, no logos or trademarks, a required disclaimer, and Wizards may ask us to stop at any time. Kevin judges it fine (Moxfield has a playtest feature). Gray areas remain (a virtual tabletop is not mentioned). Re-read the real page in a browser before the site goes public.
5. **Live sync.** WebSockets, server-sent events plus POSTs, or peer-to-peer (WebRTC)? Server as the source of truth or a player? Recommended to evaluate: server as the source of truth, because it can keep hands hidden. Kevin wants private lobbies like PokeGuess (room code or link, no accounts); see `docs/private-lobby.md`. Candidates for the live part and the lobby store, compared on free tiers and on keeping hands hidden: Supabase, Firebase, others. Kevin leans Supabase. Not chosen; needs plan mode.
6. **Backend language and framework.** JavaScript or TypeScript on Node is the likely fit (shared types with the frontend), but not chosen.
7. **Frontend approach.** No framework with plain pages (like Portfolio), or a small framework with a build step (like MIDI Companion). The table page is the one that may need more structure.
8. **Hosting.** Decided 2026-10-25: Vercel (Hobby plan), project name `Overloaded`, imported from the GitHub repo. Still open: whether Vercel can run the live connection (WebSockets) or only the pages, with the live server elsewhere. Check Vercel's current docs, limits and cost before building the sync.
9. **Accounts and saved decks.** Decided 2026-10-25: no accounts, a name per lobby, decks cached in the browser as text. Open: playmat and card-back uploads (proposed: kept in the uploader's browser only).
10. **Scale and safety if deployed.** How many tables at once? Abuse, rate limiting, and cost caps if strangers can reach it.
11. **Formats and player count.** The host picks the seats. Build for two first, then up to four (Commander).
12. **Does the AI-built-software angle need to show up?** The course page's "What Complete Looks Like" does not ask for a model inside the product (that was Artifact 3). It does list LO 12 (AI as an active component) and LO 13 (trade-offs including cost, latency, reliability, security) among the objectives this artifact contributes to. My cost and security analysis already supports LO 13. Whether to add an AI feature is Kevin's call; none is planned.
13. **Testing real-time and drag-and-drop** on phones and in two browsers at once. How, with headless Chrome only? Phones have no hover or `Alt` key, so every hover feature needs a touch version.
14. **Monorepo layout.** Whether `frontend`, `backend` and `shared` stay in one repo with one `package.json` or become workspaces. The current layout is a guess.
15. **Deck import formats.** What text each site (Moxfield, Archidekt, ManaBox) exports. Print real examples before writing the parser. 2026-10-26: real exports from Moxfield (two options) and Archidekt are in `docs/deck-import.md` and parse with a draft parser; set and number are in "Copy for Moxfield" and Archidekt text but not Moxfield plain text. Sideboard (Moxfield only) and commander (position only) markers are known; a typed `Commander` or `Companion` line marks only the next card, and the import page must make the player confirm the commander in Commander games (the first-card guess was right for 1 of 3 exports; see "Finding the commander" in `docs/deck-import.md`). Still missing: ManaBox. Link import (public and unlisted decks) is analysed there: Archidekt's API returns Scryfall ids and categories but a browser can't call it (CORS), its terms forbid automated requests, and Moxfield's terms are unread. No more requests to either site without permission. Paste text stays the main path; link import only if a site agrees.
