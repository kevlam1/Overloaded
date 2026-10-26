# CLAUDE.md: Overloaded (TCSS 490 Artifact 5, "The Moonshot")

Read this file first. My shared preferences are in `../CLAUDE.md` (the `TCSS 490` folder, loaded for every artifact, not in git). Keep this file under 200 lines and move anything long into `docs/`.

**Requirements are not final.** This file was written at the start (2026-10-25) to set direction. I will expand and change the scope, the architecture and the structure in later sessions. When something here is replaced, update this file in the same session and log the change. Treat every "Planned" and "Proposed" line as a draft, not a decision.

## What this project is
- A browser-based virtual Magic: The Gathering tabletop simulator, named **Overloaded**. Friends open it, build or load a deck, join a table, and play a game by moving cards around a shared play area in real time.
- Artifact 5 of TCSS 490 (Generative AI and Software Development, UW Tacoma, Autumn 2026): the moonshot, possibly deployed to real users. Due **Sunday, December 13, 2026 at 11:59 PM** on Canvas. I have about 5 to 7 weeks. It is the biggest and hardest thing I have built, so plan in phases and expect to cut scope.
- Repo: `https://github.com/kevlam1/Overloaded` (public, created by me, returned HTTP 200 on 2026-10-25, `origin` is set, nothing pushed yet). The name and URL go on the portfolio card, so they can't change.
- Owner: Kevin Lam. Windows, IntelliJ IDEA Ultimate.
- The Portfolio's Artifact 4 and 5 ideas were swapped on 2026-10-25: my original Artifact 5 (a game reference tool for League of Legends, Valorant and Overwatch) moved to Artifact 4, and this project took Artifact 5. Do not work on Artifact 4 here.
- **The Artifact 5 course page has not been read.** It is not in `../Unit 3/`. The only thing known is the overview line (from `../Portfolio/docs/PROJECT_CONTEXT.md`, local only): "the moonshot, possibly deployed to real users". When the page is available, read it and copy its real requirements and grading into a section here before building further.

## Vision
- Play a real game of Magic with friends who are not in the same room, with no cards to buy and nothing to install.
- The table should feel like a physical table: drag cards, tap them (turn sideways), flip them, stack them, look at your hand while others cannot.
- Fast and clear over fancy. A player should be at a table with a deck within a minute of opening the page.
- A simulator for playing the game. How much the site knows the rules (enforcing turns and legality) versus only moving cards is **open**, see "Open questions". Start with the table, not a rules engine.

## Planned scope (phases; each one must work before the next starts)
Everything after phase 2 is a stretch and the first thing cut.
1. **Card data.** Get card information (names, images, types, text) into the project, with a search that finds a card fast. No game yet.
2. **Solo table.** One player, one table: load a deck, draw, a hand, a battlefield, a graveyard, a library, move cards between zones, tap and untap, a life counter.
3. **Two players, live.** Two browsers share one table in real time: each sees the other's battlefield, hidden hands stay hidden, a table can be joined by a link or code.
4. **Deck builder.** Search cards, build a deck, save and load it, import a decklist from text.
5. **Quality of play.** Counters and tokens, a log of what happened, undo, a simple turn tracker, reconnecting after a refresh.
6. **More players and formats** (Commander is four players), spectators, a rules helper. Stretch.
7. **Deploy.** A public site real people can use, with the limits, cost and moderation questions answered.
- Not planned: a full automated rules engine, an AI opponent, buying or trading cards, a mobile app. They may change after the requirements are expanded.

## Architecture (proposed, high level)
A multi-page site with a backend, not one `index.html`. The pieces and the folders for them:
- `frontend/pages/lobby/`: find or create a table, join by code.
- `frontend/pages/deck-builder/`: card search, deck editing, import and export.
- `frontend/pages/table/`: the shared play area (the hardest page).
- `frontend/assets/` and `frontend/src/`: shared images, fonts, styles, and browser code shared by the pages.
- `backend/src/`: the API (cards, decks, tables) and the live connection that keeps players in step.
- `shared/`: card, deck and game-state shapes, and the messages sent over the live connection, so both sides agree. No browser-only or server-only code, so Node tests can load it.
- `scripts/`: tests and data tools, plain Node (`test-*.mjs`, `fetch-*.mjs`).
- `docs/`: `todo.md` and longer notes.
- Ideas to evaluate, not decisions: the server holds the game state and sends each player only what that player may see (so hidden cards can't be read from the browser); players send small actions ("move card X to the graveyard"), not whole states; card data is downloaded once by a script and served from our own storage so pages are fast and a third party's limits don't matter; the table is drawn with plain DOM or Canvas, whichever tests faster with a hundred cards.
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
- `.gitignore`: ignores `node_modules/`, `dist/`, `build/`, `.env` and `.env.*` (not `.env.example`), `*.local`, `*.log`, `.idea/`, `scratch*`, `CLAUDE.local.md`, `.claude/settings.local.json`, `*.sqlite`, `*.db` and `data/cache/`.
- `.claude/settings.json`: `Read` deny rules for `.env` and key files, copied from readme-architect. Best-effort only (the docs call `Read` rules best-effort), not a hard block.
- `frontend/`, `backend/`, `shared/`, `scripts/`: each has a short `README.md` saying what goes there. Empty folders hold a `.gitkeep`.
- Not set up yet, on purpose: a `/logs/` page (see "Reuse"), CI, a database, hosting.

## Run and check
- Nothing runs yet. When there is something, put the exact commands here.
- Check what you build by running it, and say what you checked and what you could not. For a page, drive headless Chrome as described in `../CLAUDE.md` and look at a screenshot at desktop and phone width.
- For real-time play, a check needs two browser sessions at once. Say plainly that one session cannot prove sync, and test with two.
- Game logic gets plain Node tests that print "All ... checks passed." Make sure the tests really run (an assertion in a comment passes forever).
- Spot-check card data against the real source (print the raw fields first). Record every disagreement in `log.md`.

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
- `../Portfolio/`: the card for this artifact is filled in from a session started in the Portfolio folder, when this is finished or real enough to show.

## Open questions (all unanswered; each one needs a decision before the part it affects is built)
1. **What the course page requires** for Artifact 5 (deployed? how many users? what must the log show?). Read it first.
2. **Rules enforcement.** Only move cards (a sandbox like a physical table), or know turns and phases, or enforce card rules? Recommended starting point: sandbox only.
3. **Card data.** Scryfall is the obvious source, but its fields, rate limits, image terms and bulk-download option are **not verified**. Print real responses before relying on it. Other sources may exist.
4. **Wizards of the Coast's fan-content rules.** What is allowed for card names, text and images, and what disclaimer is required? Not read yet. It decides whether the site can show real card images.
5. **Live sync.** WebSockets, server-sent events plus POSTs, or peer-to-peer (WebRTC)? Server as the source of truth or a player? Recommended to evaluate: server as the source of truth, because it can keep hands hidden.
6. **Backend language and framework.** JavaScript or TypeScript on Node is the likely fit (shared types with the frontend), but not chosen.
7. **Frontend approach.** No framework with plain pages (like Portfolio), or a small framework with a build step (like MIDI Companion). The table page is the one that may need more structure.
8. **Hosting.** The Portfolio is on GitHub Pages and MIDI Companion on Vercel; neither is assumed to run a long-lived real-time server. Check current docs, limits and cost for any host before choosing.
9. **Accounts and saved decks.** None (decks stay in the browser or export as text), or logins. Logins mean storing personal details and passwords, which is a large security job.
10. **Scale and safety if deployed.** How many tables at once? Abuse, rate limiting, and cost caps if strangers can reach it.
11. **Formats and player count.** Two players first. Commander (four) later?
12. **Does the AI-built-software angle need to show up?** The course is about generative AI and software development. Whether the product itself uses a model is not required by anything I have read for this artifact.
13. **Testing real-time and drag-and-drop** on phones and in two browsers at once. How, with headless Chrome only?
14. **Monorepo layout.** Whether `frontend`, `backend` and `shared` stay in one repo with one `package.json` or become workspaces. The current layout is a guess.
