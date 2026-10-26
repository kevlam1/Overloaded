# Build log: Artifact 5 (Overloaded)

**AI:** Claude Code | **Editor:** IntelliJ IDEA Ultimate | **Host:** not chosen yet (public repo `kevlam1/Overloaded`)
**Stack:** not chosen yet.

---

## What I set out to build

Artifact 5 is the moonshot, due Sunday 13 December. I want to build Overloaded, a browser-based virtual Magic: The Gathering tabletop simulator where friends can build a deck, join a table and play together in real time. I have about 5 to 7 weeks, and I expect it to be the hardest thing I build, so I started planning before the artifact opened. Nothing is built yet. This section will be rewritten once the project is further along. The numbered entries below are left as they were.

---

## 1. Setting up the folder and the Claude files (2026-10-25)

**What I asked for**
- Asked Claude Code to prepare Artifact 5 early: a folder named `Overloaded` in my `TCSS 490` folder, set up the same way my three finished artifacts were, as a large multi-page project with a backend, and a thorough `CLAUDE.md`.
- Told it that my Artifact 5 is now the MTG simulator, and that my old Artifact 5 idea (the game reference tool) moves to Artifact 4. I also gave it the GitHub repo link.

**What changed**
- Claude read the `CLAUDE.md` files of the Portfolio, MIDI Companion and readme-architect, their `.gitignore` files, and the layout of their folders. My first message said "my Portfolio project", but the artifact folders sit next to the Portfolio, so I corrected it to the `TCSS 490` folder.
- Created `Overloaded/` with `CLAUDE.md`, `log.md` (this file), `README.md`, `docs/todo.md`, a `.gitignore`, and `.claude/settings.json` (the `.env` and key deny rules from readme-architect). It ran `git init` on `main` and added my repo as `origin`. Nothing is committed or pushed.
- Starting structure: `frontend/` (pages for the lobby, deck builder and table, plus shared assets and code), `backend/`, `shared/` (types both sides use), `scripts/` for tests and tools, and `docs/`. Each has a short README, and empty folders have a `.gitkeep`. I wanted it flexible, so there is no `package.json`, no framework and no hosting.
- `CLAUDE.md` has the vision, phased scope, a proposed architecture, rules, the log protocol, and 14 open questions. It says plainly that the requirements will be expanded and the layout will change.
- The Portfolio's Artifact 4 and 5 ideas were swapped. See the Portfolio's `log.md`.

**What I checked**
- The repo URL returned HTTP 200 and `git remote -v` shows it as `origin`.
- Not checked: anything about the course page for Artifact 5. It isn't in my Unit folders yet, so the scope in `CLAUDE.md` comes only from the one-line overview in my notes.
- Not checked: Scryfall, Wizards of the Coast's fan-content rules, or any hosting. They are listed as open questions on purpose.

**Decisions**
- No stack, hosting or database yet. Those come after I answer the open questions.
- Started with a sandbox table (moving cards), not a rules engine, as the recommended first version. I can change this.
- The repo already existed, so the name `Overloaded` is final, and the card will link to it.

---

## 2. Private lobby idea from PokeGuess (2026-10-25)

**What I asked for**
- Told Claude I want a private lobby like the one I built in PokeGuess, and to update something with that info.

**What changed**
- Claude read PokeGuess's README, file list and `roomService.ts` through the public GitHub API (nothing cloned or run) and wrote `docs/private-lobby.md`: 6-character room codes, no accounts, a hashed player token so a refresh rejoins the same seat, host starts, and the server removes hidden data before sending a room to a player.
- Added a pointer in `CLAUDE.md` (Files list and open question 5) and one item in `docs/todo.md`.

**What I checked**
- The notes match what is in `roomService.ts`. Not read: PokeGuess's lobby page, its WebSocket server file and its database layer.
- Nothing is built. The notes are ideas, not decisions.

**Decisions**
- Take the ideas only. PokeGuess is under my friend's account, so no code is copied.
- Open: how many seats (2 or up to 4), how long a table lives, and where table state is kept.
- Told Claude the idea is similar to PokeGuess and nothing more: a custom link and a code, players change their deck, name and so on in the lobby, then ready up to begin. A fuller plan comes later. Claude wrote this into `docs/private-lobby.md` and left its guesses about "custom link" marked as unconfirmed.

---

## 3. Choosing Vercel for hosting (2026-10-25)

**What I asked for**
- Showed Claude the Vercel "New Project" screen for `kevlam1/Overloaded` and asked if I was doing it right or should wait. Claude suggested waiting, because nothing is built and hosting was still open. I decided hosting will be on Vercel and to continue.

**What changed**
- `CLAUDE.md` open question 8 now says Vercel is decided, and what is still open.

**What I checked**
- Only the two screenshots (Hobby plan, root `./`, preset Other, empty build settings and environment variables). Claude did not read Vercel's docs, so it has not checked whether Vercel can run a WebSocket server, or what the Hobby terms and limits are.

**Decisions**
- Vercel it is. The project name stays `Overloaded`, because it sets the URL the portfolio card will use.
- If Vercel cannot hold live connections, the pages stay on Vercel and a small server goes elsewhere. To be checked before the sync is built.

---

## 4. My first in-depth design notes (2026-10-25)

**What I asked for**
- Wrote my thoughts for Overloaded by hand into a PDF (in my Unit 5 folder) and gave it to Claude. I asked it to read it, make its own version in the repo if useful, and update whatever files needed it.
- In the notes, I asked Claude not to name the products I used as visual references anywhere in the files.

**What changed**
- New `docs/design-notes.md`: my notes restated by section (product, lobby, rules, card data and storage, database, look and feel, gameplay), each with Claude's questions and risks. The PDF and its screenshots stay out of the repo, since it is public and they name the references.
- `CLAUDE.md`: the vision, the phases, the lobby page and several open questions now follow my notes. There are new hard rules about not naming the references and not storing anything unneeded. It also said nothing was pushed, which was out of date, so that is fixed.
- `docs/private-lobby.md`: the link is generated (`/lobby/CODE`), the host picks the seats and the host starts.
- `docs/todo.md`: reorganized into decided, research next, and decide later.

**What I checked**
- Claude read all four pages of the PDF. Nothing about Scryfall, Forge, Supabase, Firebase or the deck sites was checked. Every claim about them in the notes is marked unverified.

**Decisions**
- No accounts. Decks are cached in the browser as text. Card data comes from Scryfall, and the proposal is to look up only each deck's cards with no card database of our own.
- Casual mode first. A rules-enforced mode with Forge's engine depends on research into its license and how it would run behind a website.
- Deck builder moved to a stretch goal. Deck import from text comes first.
- Claude pointed out that a row for lands and a row for other permanents, ability icons and summoning sickness do not need a rules engine, so they stay in scope without Forge.
- Supabase is my lean for the database and live play, but nothing is chosen until the free tiers are compared in plan mode.

---

## 5. Checking Scryfall, and skipping Forge (2026-10-25)

**What I asked for**
- Told Claude to skip Forge's rules engine for now and asked what Scryfall's rate limits are. I said it could keep Scryfall's API replies in a gitignored file, even a bulk cache, and that whether players cache all cards in their browsers can be decided later.

**What changed**
- New `docs/scryfall.md` with what Scryfall's docs say and what real replies showed. New `scripts/fetch-scryfall.mjs` (plain Node, no dependencies): `sample` makes one batch lookup, and `bulk` downloads the Oracle Cards file once. Both write only to `data/cache/scryfall/`, which is gitignored.
- `CLAUDE.md`: casual mode only, Forge is out of scope, the Scryfall rules and run commands are added, and the card-data question is narrowed to two options. It also fixes a line break Claude broke in entry 4 (open questions 13 and 14 had merged).
- `docs/todo.md` and `docs/design-notes.md` are updated to match.

**What I checked**
- Rate limits from Scryfall's page: 2 requests a second for search and the batch lookup, 10 a second for most other calls, and none for image and bulk files. Every request needs `User-Agent` and `Accept`, and ignoring HTTP 429 can get the app banned.
- One real batch lookup of 5 names: 4 cards came back and the fake name was listed in `not_found`. Double-faced cards keep their image and cost under `card_faces`. `keywords` lists the back face's abilities too.
- Downloaded the Oracle Cards bulk file: 38,998 cards, 23.9 MB compressed and 199.5 MB unpacked. A trimmed list (name, type, cost, keywords, id) is 1.6 MB gzipped.
- A card image loads from a link built from the card id alone (HTTP 200), so image links don't need to be stored.
- Not checked: Wizards of the Coast's Fan Content Policy itself. Scryfall's terms point to it.

**Decisions**
- Forge is skipped for now.
- No card database of our own. Still open: look up each deck's cards from the browser, or serve a small trimmed file of every card from Vercel.

---

## 6. Big decks, sideboards, and how to ask Scryfall for cards (2026-10-26)

**What I asked for**
- Raised a concern: main boards can be over 100 cards and some sideboards hold hundreds, so looking them up could hit Scryfall's limits and get us banned. My idea was to cap the first import at 100 cards and give the sideboard its own category that players swap from without more lookups. I asked whether to use batch requests or one cached bulk file, and what each would cost.

**What changed**
- `scripts/fetch-scryfall.mjs`: `bulk` now takes a file type, reads the file line by line (the bigger one unpacks to 620 MB), skips cards that never go in a deck, and measures a card list and a printing list.
- `docs/scryfall.md`: new sections on Vercel's free limits and on deck size, sideboards and request plans, with the costs of each option.
- `CLAUDE.md`, `docs/todo.md`: phase 1, the architecture note and open question 3 now point to the recommended plan.

**What I checked**
- Measured, not estimated: one record per card is 36,230 cards and 1.51 MB gzipped. A list of every printing (set, number, id) is 115,869 printings and 2.67 MB gzipped.
- Read Vercel's Hobby page: the first 100 GB a month of data transfer and 1,000,000 CDN requests are included. Going over pauses the feature for up to 30 days instead of charging, and Hobby is for non-commercial use.
- Worked out the batch-lookup cost: a 100-card deck is 2 requests, and 100 main plus 300 sideboard is 6 requests over about 2.5 seconds.
- Not checked: whether Scryfall counts its limit per player or for the whole site, and whether Scryfall would see our trimmed list as repackaging its data.

**Decisions**
- Claude recommended building our own card list from the bulk file. A deck of any size, sideboard included, is then matched in the browser with no API calls, and the batch lookup is used only for a few cards newer than the list. I have not decided yet.
- Claude disagreed with the reason for my 100-card cap: with our own list, a cap isn't needed to protect Scryfall. It suggested one generous cap on main plus sideboard (for example 250) so a huge paste can't freeze the page. The numbers are mine to pick.
- The sideboard stays its own section, and swapping in the lobby needs no new lookups (my idea, kept).
- Exact printings (matching set and collector number) come after version one.

---

## 7. Card list decided, 200-card cap, exact printings (2026-10-26)

**What I asked for**
- Said yes to our own card list, and asked whether new cards would join it or whether it's just a file.
- Picked a 200-card cap, and said players shouldn't be able to start a Commander game without exactly 100 cards anyway.
- Told Claude to decide where the list is built.
- Asked whether exact printings could get their own image for free, since the list's main job is the card text.

**What changed**
- `docs/scryfall.md`: new sections "Decided 2026-10-26" and "Rules text and exact printings".
- `scripts/fetch-scryfall.mjs`: also measures the list with rules text and one printing file per set.
- `CLAUDE.md` (open question 3, the script description) and `docs/todo.md` now match the decisions.

**What I checked**
- The list is a static file, not a database. New cards appear only when it is rebuilt, and until then they use the batch lookup.
- Our list doesn't actually have the rules text. Adding it takes the list from 1.51 MB to 3.00 MB gzipped, and the card image already shows the text.
- Exact printings: an image link needs that printing's id, which our list doesn't have. One file per set fixes that: 1,008 sets, a median of 0.5 KB gzipped, the largest 140 KB.
- Claude's first run of the new measurement crashed because it reused a variable name. It renamed the variable and ran it again.

**Decisions**
- Our own card list, built during Vercel's build and not committed (Claude's choice when I left it to it). Every deploy gets current cards, git history stays small, and a failed download leaves the last deploy live.
- 200 cards maximum for main plus sideboard, checked at import. The format decides whether a deck is the right size before a player can ready up. Which formats to offer is still open.
- No rules text in version one. Default printings first, with exact printings from per-set files soon after.

---

## 8. What a rebuild is, and exact printings rethought (2026-10-26)

**What I asked for**
- Asked whether a rebuild is basically what we've been doing with the script, and how often I should rebuild.
- Said I was still confused about exact printings and asked Claude to rethink whether its plan was the best way.

**What changed**
- `docs/scryfall.md`: the exact-printings part is rewritten as a step-by-step flow with three options compared, plus a new "How often to rebuild" section.
- `docs/todo.md`: a new item about not downloading about 100 MB from Scryfall on every push.
- I asked how I could be sure Claude would remember that item. Claude said it remembers nothing between sessions, and only `CLAUDE.md` loads every time. So the rule is now in `CLAUDE.md` under "Run and check", and it says to show me the fix before the build step is written.

**What I checked**
- In the Default Cards file, set plus collector number names exactly one printing (119,203 pairs, no duplicates). Sol Ring has 144 printings. Collector numbers can have letters and symbols (`268p`, `213★`, `XLN-217`).
- Not checked: whether the deck sites' exports include set and number, and whether Vercel's build cache keeps files between builds.

**Decisions**
- A printing changes only the picture. The printing id is looked up once at import and saved with the deck, and other players get the id from the server, so they never look anything up.
- One small file per set is still the plan for finding printing ids, because it is the only option that is both small and needs no API calls. One big file of all printings is the fallback.
- Rebuild weekly and after a set release. Claude flagged a flaw in its own build-step choice: every push would download about 100 MB from Scryfall. That gets fixed when the build is set up.

---

## 9. Auditing the card-data plan for bugs, and the costs again (2026-10-26)

**What I asked for**
- Asked Claude to look for bugs and optimizations, rerun the API costs and go through everything again carefully, taking its time.

**What changed**
- New `scripts/audit-card-data.mjs` (no network): checks the cached bulk files for what would break matching decklists by name, and prints list sizes.
- `scripts/fetch-scryfall.mjs`: it saved whatever came back, even an error page, and never checked HTTP status. It now stops on any failed request (including 429) and checks the download's size before saving.
- `docs/scryfall.md`: two wrong statements are corrected in place, and a new audit section has a table of findings and fixes, the cleaned list's sizes, and the costs again. Updated numbers in `CLAUDE.md`, `docs/design-notes.md` and `docs/todo.md`.

**What I checked**
- From the audit run: 1,095 tokens and emblems (87 share a name with a real card, like Storm Crow), 442 collectibles that aren't game cards, 812 cards with no paper printing, 82 cards that say "Land" only on their back face, 975 multi-face names, 107 names with accents, and 0 card faces with their own keywords.
- After filtering out tokens, collectibles and online-only cards: 33,973 deck cards, 1.41 MB gzipped. Only 14 names are still shared, mostly joke-set variants.
- Scryfall's rate limits and the 75-card batch limit are unchanged. Their docs still don't say whether the limit counts per player or for the whole site.
- Vercel's docs: JSON is compressed automatically, files in `.vercel/cache` persist between builds (kept per branch, for a month, up to 1.5 GB), and Hobby builds use a 2-CPU, 8 GB machine.
- Re-ran both script modes after the fix: they work. The new error path wasn't triggered, so it is only checked by reading the code.
- Not checked: whether Vercel's GB is decimal or binary, and whether the build cache works as described on a real build.

**Decisions**
- Tokens get their own small list. Collectibles are dropped. The land row and icons use the face that is showing. Names are matched in full first, then by front face, after removing accents and fixing quotes and slashes.
- At most one fallback batch request per import, so a typo-filled paste can't flood Scryfall.
- The compact list shape saves too little (1.41 to 1.37 MB) to be worth the extra code.
- The build will keep bulk files in Vercel's build cache and download only when Scryfall publishes a newer file.
- Still mine to decide: whether online-only cards stay out (Claude recommends leaving them out).

---

## 10. Online-only cards dropped, the open checks done, and am I at risk of a ban? (2026-10-26)

**What I asked for**
- Drop cards with no paper printing, but only if they are confirmed not to exist in paper Magic and checking needs no more calls.
- Check the items Claude had listed as "still not checked".
- Asked whether all this rechecking could get me banned from Scryfall.

**What changed**
- `scripts/audit-card-data.mjs`: online-only now means every printing is marked `digital: true`, not "no paper printing".
- `docs/scryfall.md`, `CLAUDE.md`, `docs/todo.md`: online-only cards are dropped, and there is a new "Checked again, still open" note with the request count.

**What I checked**
- In the cached every-printing file (no new calls): 885 of the 886 cards with no paper printing have every printing marked digital. The odd one, Geordi La Forge, Innovator, is a preview card from Star Trek Commander, releasing 2026-11-13. "No paper printing" would have wrongly dropped it. With the corrected rule, 811 deck-list cards are dropped and 33,974 remain.
- Tested the script's new error handling with a fake `fetch`, so Scryfall wasn't involved. A 429 stops both modes, and a short download is refused. The cached files were untouched.
- Scryfall's docs and a web search say nothing about whether the limit counts per player or for the whole site, and the docs mention no app registration. Our imports make 0 API calls, so it barely matters.
- Vercel's docs don't say whether their GB is decimal or binary. The cost math uses the smaller reading.
- Not checked: the build cache on a real Vercel build. That needs a deploy.

**Decisions**
- Online-only cards are out of the card list. Previews of unreleased sets stay in.
- My requests so far: 2 batch lookups and about 10 file-list requests over two days, with no 429, far inside the limits. Claude said it won't test the limit by sending many requests, because that is what gets apps banned.

---

## 11. Second audit: name matching, browser caching, and a hidden daily cost (2026-10-26)

**What I asked for**
- Asked Claude again to look for bugs and optimizations, rerun the API costs and go through everything carefully, taking its time.

**What changed**
- `scripts/audit-card-data.mjs`: now also tests the planned name normalization (collisions, names with a slash, back-face clashes).
- Both scripts' comments, `CLAUDE.md` and `scripts/README.md` now say Node 20.11 or later instead of 18.
- `docs/scryfall.md`: a new "Second audit" section. `CLAUDE.md`: the matching order, image loading, and a weekly limit on card-list changes. `docs/design-notes.md`: four stale notes are marked as changed. `docs/todo.md`: the build item now includes the weekly limit and sorted output.

**What I checked**
- Node's docs say `import.meta.dirname`, which both scripts use, was added in v20.11.0, so "Node 18 or later" was wrong.
- Name matching on the cached data: normalizing makes 0 different names collide, and real spellings like `Lim-Dul's Cohort`, `Æther Vial`, `Jotun Grunt`, `Fire/Ice` and curly quotes all match. 29 back-face names clash with other cards (`Ancestral Recall` is a card and a back face), so back faces must never match automatically.
- Caching on my own MIDI Companion site on Vercel: static files come with `max-age=0, must-revalidate` and an ETag, and a repeat request gets `304 Not Modified`. So an unchanged list is nearly free, but a changed one is downloaded again by every returning player.
- Costs: if the list changed daily, about 2,250 regular players would fit in Vercel's free transfer. Weekly gives about 15,500, and monthly about 67,600.
- Card images (one card): `small` 12 KB, `normal` 71 KB. A 100-card deck at `normal` is about 7 MB of a player's phone data.
- Scryfall API requests this round: 0. Only 4 header requests to the image server, which has no rate limit.
- Not checked: whether Vercel keeps the same ETag for an unchanged file across deploys, and whether Node 20.11 really runs the scripts (only 24 is installed).

**Decisions**
- Card data changes at most weekly, and the list is written sorted by name, so frequent deploys don't make players re-download it.
- Matching order: full name, then front name, then a "did you mean" from back-face names, then the one fallback request.
- Images load only for cards that are showing, small where cards are small.

---

## Where AI misread me, or I had to correct course

- In my first message I said to put the folder in my Portfolio project, which was wrong: the other artifacts live next to the Portfolio. I corrected it in my next message.
- **Guessed field names (Claude's slip, entry 5):** its first bulk-data check read `size` and `content_type`, which don't exist, and printed `NaN MB`. Printing the raw object showed the real field, `compressed_size`. Claude also broke a line break in `CLAUDE.md` in entry 4, which merged two open questions. It was fixed in entry 5.
- **Reused a variable name (Claude's slip, entry 7):** a new `line` variable inside a loop that already had one crashed the measurement script. Renamed it to `printing` and ran it again.
- **Made-up example (Claude's slip, entries 6 to 8):** the docs used `Sol Ring (CMM) 400` as a decklist example, but the real data shows Sol Ring in that set is number 410 or 703. Claude had invented the number. It is gone from the rewritten section, and the one older mention now says 410.
- **Build-step choice had a cost Claude missed (entry 7):** building the card data on every deploy would download about 100 MB from Scryfall per push. Claude caught it in entry 8, and the fix is on the todo list.
- **Two wrong statements in the Scryfall notes (Claude's slip, entries 5 to 8, found in entry 9):** it said the land row could read "Land" from `type_line` (wrong for 82 double-faced cards) and that icons should use per-face keywords (faces have none). It had also called all 36,230 kept records "cards that can be in a deck", but that count included tokens, collectibles and online-only cards. All are corrected in `docs/scryfall.md`.
- **Mixed units in the cost math (Claude's slip, entry 6, found in entry 9):** "about 68,000 first visits" divided decimal GB by binary MB. The consistent figure was about 63,000, and it is about 67,000 now that the list is smaller.
- **Bugs in its own checker (Claude's slip, entry 9):** the first audit printed three wrong counts because it shortened lists before counting them (for example "5" instead of 975 multi-face names). Claude spotted it, fixed it, and the committed script prints the right counts.
- **The research script saved error pages (Claude's slip, entry 5, found in entry 9):** `fetch-scryfall.mjs` never checked whether a request succeeded. Fixed.
- **Wrong test for online-only cards (Claude's slip, entry 9, found in entry 10):** it called a card online-only when no printing listed paper. That would have dropped preview cards of unreleased sets. It now requires every printing to be marked digital.
- **Wrong Node version (Claude's slip, entry 5, found in entry 11):** `CLAUDE.md` said the scripts need Node 18 or later, but they use `import.meta.dirname`, which needs 20.11.
- **A daily cost in the build plan (Claude's slip, entry 9, found in entry 11):** "download when Scryfall's file changes" meant a new card list almost every day, so every returning player would re-download it. Fixed by changing the list at most weekly.
- **Same trap twice (Claude's slip, entry 11):** its throwaway name test filtered on the chosen printing's `digital` flag, the mistake fixed in entry 10, and wrongly reported `Lim-Dul's Cohort` as not found. Claude noticed because the count was exactly 1,062 short, and fixed the test before using any result.

---

## Decisions and abandoned ideas

- Not building a full rules engine or an AI opponent in the first plan. They can come back after the requirements are expanded.
- Moved the deck builder to a stretch goal (entry 4). Importing a decklist as text comes first.
- No user accounts (entry 4). Players pick a name in each lobby.
- Skipped Forge's rules engine for now (entry 5). Casual mode only, where players manage their own cards.
