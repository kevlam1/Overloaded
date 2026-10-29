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

## 12. Starting on deck import formats (2026-10-26)

**What I asked for**
- Asked whether deck import formats would be smoother to do next than live play, and to start on it if so.

**What changed**
- New `docs/deck-import.md`: what Moxfield, Archidekt and ManaBox document about their export text, a 10-card test deck covering every tricky case from the audits, and exactly which exports to paste back.
- `CLAUDE.md` (open question 15 and the Files list) and `docs/todo.md` point to it.

**What I checked**
- Claude said yes, it's smoother: a small question with no architecture change that unblocks phase 1. Live play is bigger and needs plan mode.
- Read ManaBox's official guide: lines like `3 Verdant Catacombs (MH2) 260`, with set and number optional. Archidekt's FAQ doesn't give the syntax, and nothing official from Moxfield was found, only third-party guides (MTGO-style lines, a `*F*` foil marker in other tools).
- Every card in the test deck exists under that exact name in the cached Scryfall data, and so does the Commander Masters #410 Sol Ring.
- Not checked: any real export. Claude can't log in to my accounts, so I have to export them.

**Decisions**
- Deck import formats before live play.
- I'll import the test deck into each site, set Sol Ring to Commander Masters #410, mark one card foil, add a category on Archidekt, and paste every text export option back, after checking it has no username or private link.

---

## 13. Real deck exports, and importing from a link (2026-10-26)

**What I asked for**
- Pasted real exports of the test deck from Moxfield ("Copy for Moxfield" and "Copy Plain Text") and Archidekt (text). I also said we should consider users pasting a Moxfield or Archidekt link instead of text, for public and unlisted decks only.

**What changed**
- `docs/deck-import.md`: the exports, a table of what they show, a first-draft line parser, and a section on link import. `CLAUDE.md` (open question 15 and the unknowns table), `docs/todo.md` updated to match.

**What I checked**
- All 16 set and number pairs in the exports exist in Scryfall's data and match the right card, and every name resolves with the planned name matching. A draft line parser handles every real line plus awkward names like `B.F.M. (Big Furry Monster)`.
- Findings: set and number appear in "Copy for Moxfield" and Archidekt but not Moxfield's plain text, so the import page should tell Moxfield users which to use. `*F*` marks foil on both. Two-faced cards use `/` on Moxfield and `//` on Archidekt. `plst` numbers like `ELD-115` match Scryfall's exactly.
- Link import: neither site's docs say what "unlisted" allows. No official Moxfield API was found, a third-party note says its terms forbid scraping, and its terms page returned 403 to automation, so I couldn't read them. Archidekt's API is unofficial and in "open beta". My one test request (the package's example deck) returned 404, and its CORS header allowed only `http://localhost:3000`, so a browser on our site probably can't call it. That was on a 404 reply, not a real deck.
- Not checked: ManaBox's export, how sideboards and commanders are marked on Archidekt, anything about a real Archidekt or Moxfield deck link, and Vercel function limits.

**Decisions**
- Paste text stays the main import path for version one. Link import is a convenience to decide later, probably Archidekt only, through a server function that accepts only exact deck-link patterns.
- Moxfield's internal API is not called until its terms are read or Moxfield agrees.
- Still to do: ManaBox exports, sideboard and commander markers, and test decks on Archidekt (public, unlisted, private).

---

## 14. Archidekt link test, Moxfield, and a clause that changes the plan (2026-10-26)

**What I asked for**
- Told Claude the exports were the literal copy-and-paste text, that Moxfield puts the commander on top ("Copy for Moxfield") or at the bottom (plain text), and shared a public Archidekt deck link. Asked whether Moxfield has no API, how Tabletop Simulator turns a Moxfield link into a list, and what to make of Gemini's answer, with the condition that nothing be bypassed.

**What changed**
- `docs/deck-import.md`: the commander and sideboard rows are corrected, and the link-import section is rewritten with the Archidekt test, the terms, Moxfield, and a proposal. `CLAUDE.md` (open question 15, the unknowns table) and `docs/todo.md` updated to match.

**What I checked**
- One request to Archidekt's deck API for the link I shared: 200 OK, 202,700 bytes, and a CORS header allowing only `http://localhost:3000`, so a browser on our site can't read it. Each card's `uid` is Scryfall's id (67 of 67 match), and the deck's categories mark the sideboard, maybeboard and commander.
- Archidekt's terms, read through a summarizing tool: they prohibit automated agents or scripts from generating automated requests to the site. My one test request was that, strictly. It was a single request on a public deck, but there will be no more until a site agrees.
- Moxfield: no official API found, a request thread with no official reply, third-party libraries that rely on scraping. Tabletop Simulator's Moxfield import is a community mod that has broken when Moxfield changed. The Gemini answer's advice to match browser headers or use Puppeteer is a disguise to get past Cloudflare, so I'm not doing it.
- Not checked: Moxfield's terms (403 to automation), an unlisted or private Archidekt deck, ManaBox's exports, anything about Vercel function limits.

**Decisions**
- Paste text is the main import path for version one, and the import page lets the player confirm the commander and move cards to the sideboard, since the exports mark them only by position or not at all.
- Deck-link import is deferred, and happens only if Archidekt or Moxfield agrees. I decide whether to ask them. No requests to either site from this project until then.

---

## 15. First code: the pasted-decklist parser (2026-10-26)

**What I asked for**
- Said to focus on pasted decks only, and leave deck links for another time.

**What changed**
- New `shared/deck-text.mjs`: turns pasted text into entries (quantity, name, set, number, foil, section), plain JavaScript with no dependencies. New `scripts/test-deck-text.mjs` tests it using my real Moxfield and Archidekt exports.
- `CLAUDE.md`, `docs/deck-import.md`, `docs/todo.md`, and the two README files describe it.

**What I checked**
- Ran the test: "All deck text checks passed." All three real exports parse to the same 19 cards.
- Checked the real data first: Scryfall set codes are 3 to 6 characters (my draft said 2 to 6), and collector numbers never have spaces but can contain stars, daggers, Φ and underscores.
- Ran the tests against 20 deliberately broken copies of the parser in a throwaway folder. All 20 failed the test, so it can actually fail.
- Not checked: ManaBox's format, any header name besides `SIDEBOARD:`, matching names to cards, and anything in a browser.

**Decisions**
- Only a header sets a section. A card after a blank line that follows a labeled section is `unlabeled`, because that's where Moxfield plain text puts the commander. The page asks me, and the parser never guesses.
- The 200 card cap counts main, sideboard, commander and companion by quantity, and leaves out the maybeboard. Input over 100,000 characters or 1,000 lines is refused. Those two limits are Claude's guesses.
- Lines that aren't cards are reported with their line number, never skipped silently.

---

## 16. Finding the commander in a pasted deck (2026-10-26)

**What I asked for**
- Suggested assuming the first card in a pasted list is the commander, unless I type "Commander" above a card, with a preview page later to confirm the deck and the commander, and to pick a partner, companion or duo commander that wasn't picked up.

**What changed**
- `shared/deck-text.mjs`: a `Commander` or `Companion` line now marks only the next card, then the parser goes back to the section it was in. An empty one gives a `header_without_card` warning.
- `scripts/test-deck-text.mjs`: new checks for it. `docs/deck-import.md` has a new "Finding the commander" section. `CLAUDE.md` and `docs/todo.md` updated.

**What I checked**
- Claude tried three rules on my three real exports: the first card is right for 1 of 3 (the commander is last in Moxfield plain text, and Archidekt sorts alphabetically with no marker). Using the blank-line block as well gets 2 of 3. Adding "first legendary creature" gets 3 of 3, but that is weak evidence, because my test deck has one other legendary creature and he sorts after the commander.
- Before the change, one typed `Commander` line turned the whole rest of the pasted list into commanders, in the middle of a list and at the top. Both cases are fixed and tested.
- 14 deliberately broken copies of the parser were run against the new tests, and all 14 were caught. The first run passed immediately, which is why Claude checked.
- Scryfall's keywords include `Partner` (143 cards), `Partner with` (54), `Choose a background` (32), `Companion` (12) and `Doctor's companion` (27). `Friends forever` isn't one. So the preview can suggest partners and companions.
- Not checked: the preview page, card matching, and whether a site writes a partner as two lines under one header.

**Decisions**
- Typed headers keep my idea, but Claude changed one thing: `Commander` marks only the next card, so partners need a second `Commander` line or the preview. I can reverse this.
- The first-card guess stays only as the last fallback. In Commander games the player must confirm the commander before they can ready up. The guess saves clicks, and it never decides.
- Commander size check (open): commander plus 99 is the 100, and a companion and a sideboard are outside it.

---

## 17. Reading the course page, and the fan content policy (2026-10-26)

**What I asked for**
- Told Claude the course page is in my Unit 5 folder. I said I think the Wizards of the Coast fan content policy is fine because Moxfield has its own playtest feature, and that we could look at card matching next.

**What changed**
- `CLAUDE.md`: the course page's real requirements and dates replace "not read yet", plus new rows in the unknowns table and a fan content rule under the hard rules. `README.md`: the fan content disclaimer and a current status line. New `docs/fan-content.md`. `docs/todo.md` updated.

**What I checked**
- The page says a complete Artifact 5 is a genuine five-week attempt, a repository log of plans and changes, and the card on my portfolio. It doesn't have to land. The final show and tell is in class **Monday, December 7**, earlier than the December 13 due date, and the card has to show where I am at the end of **each of Weeks 6 to 9**.
- Not on the page: the dates of those weeks, and the linked "Keep a log" and "Labor-Based Grading" pages. Claude inferred Nov 8, 15, 22 and 29 from Artifacts 2 and 3 being due a week apart. That is an inference, so I should confirm it on Canvas. If it's right, the first card update is in about two weeks.
- The page doesn't ask for a model inside the product (that was Artifact 3), but it lists LO 12 and LO 13 among the objectives. My cost and security analysis fits LO 13.
- The fan content policy, read once through a summarizing tool (the page is dated 2017): free access only, no logos or trademarks, a required disclaimer, and Wizards can stop use at any time. A virtual tabletop isn't mentioned. Claude disagreed a little with my reasoning: Moxfield having a playtest feature shows the practice exists but isn't Wizards' permission for us. I still judge it fine for a free class project, and it's recorded as my judgment.
- Not checked: the policy's exact wording in a browser, the week dates, and the log page.

**Decisions**
- The Artifact 5 card does not stay locked until the end. I need a Portfolio session each week from Week 6.
- Free, no sign-up, no Wizards logos, no "Magic: The Gathering" in the site's name, and the policy's disclaimer on every page and in the README.
- Card matching is next. Claude pointed out it isn't a re-review: the rules are decided but nothing is built yet, so this time it becomes code with tests.

---

## 18. Card matching, as code (2026-10-26)

**What I asked for**
- Said we could look at card matching next, and added that we'd mostly be going over it again.

**What changed**
- New `shared/card-match.mjs`: the card matching rules turned into code, with no dependencies. New `scripts/test-card-match.mjs` with a 29-card real-data fixture, and `scripts/check-card-match.mjs`, which runs over every real card name. I also moved the three real exports into one `scripts/fixtures/exports.mjs` so the tests share them.
- `CLAUDE.md`, `docs/deck-import.md`, `docs/todo.md` and the two README files updated.

**What I checked**
- Not a re-review: until now the rules existed only in the notes. They were not code.
- On the real Oracle Cards file (34,785 cards after dropping tokens and collectibles): every card's own name finds it, every two-faced front name finds its card, normalizing twice changes nothing and no two different names collide, typed spellings without accents, with curly apostrophes and with single slashes all find their card, and all three real exports match 10 of 10. Building the index took 48 ms.
- Tests: 17 deliberately broken copies of the matcher were run against the unit tests, all caught. The data check was broken six ways and caught five. The sixth cannot show up in real names (no real name contains `Æ`), so only the unit test covers it.
- Not checked: choosing between ambiguous cards, printings, the card list build, any page, and the matcher in a browser.

**Decisions**
- Whole name before front face (so `Bind` is Bind), back faces only suggest, and at most 75 unmatched names go in one fallback request.
- Next in order: merge repeated lines, resolve printings, build the card list, then the preview page. How the 14 shared names are settled is still open.

---

## 19. Live play and the lobby store: research, plan and decision (2026-10-26)

**What I asked for**
- Committed and pushed the earlier work, then told Claude to continue. It took that as the live-play decision it had recommended, and used plan mode because it changes the architecture.

**What changed**
- New `docs/live-play.md` with the research, a plain-words explainer, the data model, the setup steps, the tools needing my approval, the spike checklist and the sources. `CLAUDE.md` (questions 5, 6, 7, 8 and 10, the Stack and Architecture sections, a new unknowns row, the Files list), `docs/todo.md`, `docs/design-notes.md` and `docs/private-lobby.md` updated to match.

**What I checked**
- Read each service's own docs and printed the numbers. **Vercel Functions can hold WebSocket connections** (public beta since June 22, 2026, on the free plan, at most 300 seconds each, and rooms need Redis because connections pin to one instance). That corrects what I wrote earlier: Claude's notes had said Vercel probably couldn't.
- Firebase's free plan: 100 simultaneous connections, 1 GB stored, 10 GB/month downloads, never billed. Rules can restrict each path to its owner, and a multi-path write is atomic. Supabase's free plan: 200 connections, 2M messages/month, but "we may pause applications ... that exhibit low activity in a 7-day period" and anonymous sign-in is limited to 30 requests per hour per IP. Cloudflare and Redis numbers are in the file.
- Licenses from the npm registry: the Firebase SDK is Apache-2.0, `firebase-tools` MIT (67 direct dependencies, needs Java, and Java 22 is installed), `@firebase/rules-unit-testing` Apache-2.0 (needs Node 24.12 or newer, and I have 24.14.1).
- Not checked: the Firebase console steps themselves, anonymous-account limits per IP, the `numChildren()` and `now` rule functions, round-trip time from Tacoma, and the SDK size on a phone. The spike covers those.

**Decisions**
- Firebase Realtime Database with anonymous sign-in and Security Rules, no server code. The database enforces hidden hands. Supabase is the fallback if the spike fails.
- Claude disagreed with my lean toward Supabase, for the pause rule, the sign-in cap and the heavier setup. I approved the plan anyway as written.
- Before building more, a 1 to 2 session spike: two browsers join by code, an opponent's private read is denied, a refresh keeps the seat, and a measured round trip.
- I still have to create the Firebase project, and approve the two dev tools.

---

## 20. Weighing the Supabase argument from my phone chat (2026-10-26)

**What I asked for**
- Shared what an earlier Claude chat on my phone had said before this project was scoped, which favored Supabase, and said I wasn't trying to change Claude's mind, just to add other considerations.

**What changed**
- `docs/live-play.md` has a new section weighing each point, and a note that the 1.2 KB per action figure is a guess. `docs/todo.md` has one new item: keep every database call behind one small module so the service can be swapped.

**What I checked**
- The "20K writes a day" cap is Cloud Firestore's free quota, per Firebase's quotas page. The Realtime Database we chose has no daily or monthly write cap (only a soft 1,000 writes a second), so that point does not apply.
- The other chat's 100 to 200 games a month on Supabase's 2M messages matches Claude's own estimate of 93 to 116 for four players.
- Not checked: whether Supabase restricts or stops a free project that goes over its message quota.

**Decisions**
- Firebase stays for this scope: no accounts, small temporary state, no deck builder yet. Claude conceded that Supabase is better if I add accounts, saved decks or a deck builder, or move to TypeScript, and that the 7-day pause is a chore, not a blocker. It had weighted that too heavily.
- The spike still decides. If I later want honor-system hidden hands, Supabase Broadcast is the simplest option.

---

## 21. Table lifetime: idle timeout and an absolute limit (2026-10-26)

**What I asked for**
- Suggested that a table should close after an hour with no activity, like a banking app's inactivity check, plus an enforced room limit of something like 8 hours, and asked what Claude thought.

**What changed**
- `docs/live-play.md`: the data model now has `createdAt`, `lastActive` and seat slots, plus a lifetime section with draft rules, the 55-minute warning, throttling, cleanup, and one open table per user. `CLAUDE.md` question 5 and the Firebase unknowns row, `docs/private-lobby.md` and `docs/todo.md` updated.

**What I checked**
- Idle plus absolute timeouts is the standard session pattern. Claude agreed with my numbers: Commander games run about 1.5 to 3 hours, so 8 hours is generous.
- In Firebase's rules reference, `now` is the database server's clock, and `root`, `data`, `newData`, `exists()`, `hasChild()` and `hasChildren([...])` exist. Indexed queries with `orderByChild`, `endAt` and `limitToFirst` exist. That is enough to enforce both timeouts in the rules, with no timers and no server.
- **`numChildren` is not in the rules reference**, so the plan's way of limiting seats by counting members can't work. Seats are now create-only slots.
- Not checked: any rule on the emulator. The rule snippets are drafts, and the spike tests them: arithmetic in rules, the server timestamp matching `now`, and an expired table being deleted by any signed-in user.

**Decisions**
- 1 hour of no player activity or 8 hours from creation, enforced by the rules from the database's clock, with a warning at 55 minutes idle and a "keep it open" button. An open tab doesn't count as activity.
- Claude suggested three additions: throttled activity writes, one open table per anonymous user, and a clear "this table closed" message. It advised against a second shorter "everyone left" timer, which needs presence tracking and would treat a refresh as leaving.
- Open: whether a table still in the lobby needs a shorter idle time than a game.

---

## 22. Shorter lobbies, background activity detection and a "Reconnecting" indicator (2026-10-26)

**What I asked for**
- Said the lobby should close sooner than a game. Instead of an "are you still there" popup, I suggested a background check for activity, if the cost stays low. I also wanted other players to see "reconnecting" with a loading animation on a player's icon or board when they close their tab.

**What changed**
- `docs/live-play.md`: the data model now has `idleLimit`, a separate `activity/lastActive` path and per-tab presence entries. The lifetime section is rewritten, and there is a new presence section. `CLAUDE.md` question 5 and `docs/todo.md` updated.

**What I checked**
- Firebase's offline docs: `onDisconnect` runs on the database server "whether the client disconnects cleanly or not", `/.info/connected` gives each browser its own state, and Firebase's own presence sample stores one entry per browser tab and queues the disconnect operation before marking the user online. That per-tab design is what keeps a refresh from showing "offline".
- Not stated in the docs: how long the server waits before it decides a silently dropped connection is dead. A closed tab should show promptly, a network drop may lag. The spike measures it.
- Not checked: any of it on the emulator or a real project.

**Decisions**
- 30 minutes idle in the lobby, 1 hour once playing, 8 hours absolute.
- Activity is detected in the background from taps, clicks, key presses, scrolling and moves, only while the tab is visible, with no popup. The timestamp goes to a path nobody listens to, so it costs almost nothing. Claude suggested keeping one quiet banner in the last 5 minutes for the case of a screen left on with nobody touching it. That is still my call.
- Players see a "Reconnecting..." avatar and board with a loading animation, then "Disconnected, last seen N min ago" after about 2 minutes. The animation must respect `prefers-reduced-motion`.

---

## 23. Which limit the "last 5 minutes" banner belongs to (2026-10-26)

**What I asked for**
- Asked whether "the last 5 minutes" meant the end of the 1-hour idle check or of the 8-hour limit.

**What changed**
- `docs/live-play.md` and `docs/todo.md` now describe two banners for two different limits.

**What I checked**
- It meant the idle timer (minutes 25 to 30 in a lobby, 55 to 60 in a game). A tap clears it, because activity resets the idle timer.
- The 8-hour limit counts from creation and activity never resets it, and no notice had been defined for it. A game with people actively playing would have ended without warning at hour 8.

**Decisions**
- Claude recommended a banner 30 minutes before the 8-hour limit and a more visible one at 10 minutes, saying when the table closes and that it can't be extended. Nothing clears it. It is my call, and it is on the todo list. A new table starts fresh, so the notice only gives players time to finish.
- The 8-hour cap stays: it is what stops a script from keeping a table alive forever.

---

## 24. Banner decisions, and a list of UI pieces to remember (2026-10-26)

**What I asked for**
- Said I understood the idle banner now and we should definitely have it, with the design to come later and Claude to remember it. I said a 30 and a 10 minute warning before the 8-hour limit is good enough. Then I asked Claude to commit and push.

**What changed**
- `CLAUDE.md` has a new section, "Decided UI pieces, design still to come", listing the idle banner, the 8-hour banners, the "Reconnecting..." indicator, the closed-table message, the deck preview page and the fan content disclaimer, with an instruction to include all of them at design time and remind me if I forget one. `docs/todo.md` and `docs/live-play.md` record the decisions.

**What I checked**
- Nothing new to test. I put the list in `CLAUDE.md` because it is the one file every session loads automatically, as with the table of unknowns.

**Decisions**
- Idle banner: yes. 8-hour warnings at 30 and 10 minutes before the limit: yes.
- The designs themselves come later.

---

## 25. Setting up the Firebase project (2026-10-26)

**What I asked for**
- Asked what the two dev tools do and how to start the Firebase account, then worked through the console steps with Claude, sending screenshots when I got stuck.

**What changed**
- New `.env.example` with names only (`FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_DATABASE_URL`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID`). `docs/todo.md` records what is done and what is left.

**What I checked**
- From my screenshots: Anonymous sign-in is switched on, the Realtime Database is in `us-central1`, and its rules are `.read: false` and `.write: false` (Locked), so nobody can read or write from a browser yet. A web app is registered.
- I pasted the config values in a screenshot by mistake, since Claude had asked me not to. Claude read Firebase's own page: API keys for Firebase services are "public by design", and security comes from the database rules, not from hiding the key. So it isn't a leak, but none of the values went into any file. A search of every file in the repo found none of them.
- The console turned Google Analytics on (the config has a `measurementId`). I don't need it, so the pages will not load the Analytics SDK.
- `git` shows `.env.example` as a new file and ignores a real `.env`, as intended.
- Not checked: that Auto clean-up was saved, that the project is still on the free Spark plan, and that I put the values into my own `.env`.

**Decisions**
- Only five of the config fields are used. The rest are left out of `.env.example`.
- I don't edit rules in the console. They will come from a tested file in the repo.

---

## 26. First checks against the real Firebase project (2026-10-27)

**What I asked for**
- Asked Claude to create my `.env`. Its tool was blocked by my own deny rule, so I created the file myself and told it. Then I said it could continue.

**What changed**
- `docs/live-play.md` has a new section with the results, `docs/todo.md` and `CLAUDE.md` record them, and `.env.example` is still names only.

**What I checked**
- A script checked my `.env` without printing it: all five values present and well shaped, the project id and auth domain consistent, and the file ignored by git.
- Five single requests to my real project, with the endpoints read from Firebase's REST docs first. A read with no sign-in: refused (HTTP 401, "Permission denied"). Anonymous sign-up: worked (HTTP 200, a token and a 28-character uid, no email). A signed-in read and a signed-in write: both refused, because the rules deny everyone. The throwaway user was deleted again (HTTP 200). Plain HTTPS reads took 46 ms at best, 49 ms median and 233 ms at worst, from my machine.
- These do not yet prove the spike. No per-player rules exist, nothing ran in a browser, and no refresh was tested. The round trips are not a held-open connection.
- Not checked: that the project is on the free Spark plan, and whether I saved Auto clean-up.

**Decisions**
- Claude read my "you may continue" as a yes to these two small tests and not as approval to install `firebase-tools` or `@firebase/rules-unit-testing`. I still have to approve those.
- When the file creation was blocked, Claude did not write it with a shell command. The deny rule stands.

---

## 27. Dev tools, the first database rules and emulator tests (2026-10-27)

**What I asked for**
- I said to continue with the dev tools and the console checks, and told Claude to ignore the Week 6 to 9 dates on Canvas, because those are only progress checks.

**What changed**
- New in `backend/`: `package.json` (its own, not workspaces, so Vercel never installs these), `firebase.json` (emulator on port 9000, pointing at the rules file), `database.rules.json` (first draft: a player's `private` branch readable and writable only by them, public zones readable by members and writable by the owner, a person can add only themselves as a member), and `test-rules.mjs` (33 checks after the review below, run with `npm test` in `backend/`).
- Installed `firebase-tools`, `@firebase/rules-unit-testing` and `firebase` as dev dependencies only, with `--ignore-scripts`. `npm audit` lists 11 findings (6 moderate, 5 high), all inside those packages' own dependencies. npm's only fixes are major downgrades, so I did not apply them.

**What I checked**
- `npm test` against the local emulator (project id `demo-overloaded`, which cannot reach my real project): "All 18 rule checks passed." That includes an opponent's read and write of a private path being denied, and a signed-out read being denied.
- A broken copy of the rules (private read allowed to any signed-in user) made the tests fail with "Expected request to fail, but it succeeded", and the real file was restored and passed again.
- Not checked: nothing ran in a browser, no refresh or two-browser test, and the lifetime rules (`lastActive`, 8 hours, seat slots) are not written yet.
- **Then I asked for a review in the style of the API cost audits.** Claude read the files again, checked `assertFails` in the library source (it only accepts a permission-denied error, so a typo or a network failure cannot fake a pass), and probed the rules with a throwaway script. A member reading the whole table, the whole `private` branch or `tables` is denied, and so is a multi-path update that touches an opponent's hand. None of that was in the tests, so all of it is now (33 checks).
- **A bug in my own rules, found by the probe:** a member could not change their own entry or leave, because I had made it create-only. The lobby needs a name change and a ready flag, so a member may now write their own entry. Names must be a string of 1 to 30 characters, `ready` a boolean, and unknown fields are refused.
- **Mutation check, done by a script this time:** 17 deliberately broken copies of the rules, one at a time, each run through `npm test`. 16 failed the tests. One survived: removing the `isString()` check on the name. A number name is still denied without it (a number has no `.length` in the rules language), so I believe it is redundant, but I kept it so the intent is readable. All scratch files were deleted and the rules restored byte for byte.
- **The cmd windows and the leftover process:** I saw console windows pop up and asked if that was normal. It was my 17-run mutation script, since each `npm test` opens windows for npm, Java and PowerShell, nothing hidden or networked. Claude then found why the emulator's Java process stayed alive after every run, and I told it to clean up. `backend/run-tests.mjs` now runs the same test command with windows hidden and stops only a Java process whose command line has `firebase-database-emulator` and `--port 9000`, even when the tests fail. Checked twice: real rules gave exit 0 and "All 33 rule checks passed.", a deliberately broken copy gave exit 1, and both left port 9000 free with the rules file restored byte for byte. Not checked: any other operating system.
- Still open, found by the probe: anyone signed in can create a table out of nothing by writing a member entry under any code, and a player's public zone accepts 1 MB. Both need the `meta`, seat and size rules, which are not written yet (listed in `docs/todo.md`).

**Decisions**
- The dev tools are approved by my "continue" (licenses were shown earlier). The audit findings are accepted because they only run on my machine.

---

## 28. Table creation and lifetime rules, and a saved mutation script (2026-10-27)

**What I asked for**
- After the review I said to continue. Before that I had said I am "pretty sure" the Firebase project is on the free Spark plan and that I ticked Auto clean-up. Claude has not seen either, so they are still unconfirmed in the docs.

**What changed**
- `backend/database.rules.json`: a table now has `meta` (host, `createdAt`, seats 2 to 4, status, idle limit, format) and `activity/lastActive`, both only the database's own time. Writes to members, public, private, `meta` and the heartbeat are refused once a table is 8 hours old or idle past its limit (30 minutes in the lobby, 1 hour playing), so a heartbeat can't revive an expired table. Any signed-in user can delete an expired table and nothing else. A member entry on a table with no `meta` is refused, which closes the hole where anyone could create a table by joining it.
- `backend/test-rules.mjs` went from 33 to 95 checks. New `backend/mutate-rules.mjs` (`npm run mutate`) replaces the throwaway script I deleted last time. `docs/live-play.md` has a new section with the details.

**What I checked**
- `npm test`: "All 95 rule checks passed." The first full run of 91 checks failed once, and a probe showed why: on a table with no `meta`, my member rule evaluated "is the table alive" first, that raised an error, and an error in the first half of `||` denies the whole rule. I put the "host is creating it" branch first.
- Mutation run, 60 broken copies: 52 killed and 8 survived. Four survivors were real gaps in my tests: a host could have reset `createdAt` to the server time to extend the 8-hour limit (my test only tried a client time, so it was denied for the wrong reason), a host's `meta` change after 8 hours, a table without `seats`, and a non-member writing a public zone. I added tests, and those four are now killed (rerun one by one). The other four are rules that duplicate another rule, listed with reasons in the script. I did not rerun the other 52 after adding tests.
- The rules accept `newData.val() === now` with the web SDK's server timestamp, arithmetic and the `?:` conditional, and `newData.parent()` inside a multi-path write. **That was on the local emulator, not my real project.**
- Not checked: any of this against the real project, any browser, seats, presence, size limits.

**Decisions**
- I found a flaw in my own cleanup design: the plan queried all of `tables` for expired ones, which needs a read rule that would expose every table code and every hand. I did not build it. A host's own expired table can be deleted through a per-user slot, but tables of players who never return would linger. I have to decide that before deploying (`docs/todo.md`).
- Heartbeats must be their own write, never part of a move's update, because the 30-second cap would make the whole move fail.

---

## 29. A new table replaces the old one, and what "anonymous" means (2026-10-27)

**What I asked for**
- I answered Claude's open question about cleaning up tables: if a host makes a new table, their previous active one is deleted, and the host gets a popup warning first. I also asked whether we had skipped personal accounts, because the word "user" kept appearing.

**What changed**
- `CLAUDE.md` (decided UI pieces: the new-table popup, and a new reason in the closed-table message), `docs/todo.md` and `docs/live-play.md`. No code or rules changed yet.

**What I checked**
- Nothing was run. This entry is a decision and a clarification.

**Decisions**
- A popup is right for this one because deleting a table is destructive and the host should confirm it, unlike the idle banner, which stays quiet and has no popup. Its design comes later.
- We are still skipping accounts. Firebase's anonymous sign-in has no email, password or name: the browser gets a random id that only the rules see. "Per user" in the notes means per browser.
- That means the one-table limit can be bypassed with a new browser or cleared site data, and clearing site data also loses your seat. Tables whose host never returns still linger; that is still open.

---

## 30. Can a second person take over a code already in use? (2026-10-27)

**What I asked for**
- I said to do options A and C for expired tables, and asked whether anything stops person A creating a lobby with code ABCDEF while person B is playing at that code.

**What changed**
- `backend/database.rules.json`: `meta` and `activity/lastActive` can now be written but not deleted. `backend/test-rules.mjs` went from 95 to 106 checks (a new "code collisions" section), and `backend/mutate-rules.mjs` got two more mutations (62 in all). Docs: `docs/live-play.md`, `docs/todo.md`, `CLAUDE.md`, `backend/README.md`.

**What I checked**
- A throwaway probe on the emulator first. Denied: a full table, a whole-table write or a bare `meta` at a live code; creating at an expired but undeleted code. Allowed, by design: deleting the expired table first and then creating at that code.
- The probe found two holes: the host could delete their own `meta` (leaving a table nobody could delete, with the code open to a bare `meta` write that would make a stranger the host) or delete `lastActive` and write it back (skipping the 30-second cap). Fixed; both new mutations are killed, and `npm test` gives "All 106 rule checks passed."
- Not checked: true simultaneous creation by two people (I believe the database handles writes one at a time, but I did not test that), the real project, and a browser.
- Still open: anyone who knows a code can add themselves as a member of a started table, because there is no seat or status check yet.

**Decisions**
- A and C for cleaning expired tables. A (anyone may delete an expired table, which the rules already allow) needs the client to do it. C (a free scheduled job) needs a plan from me first, with the host, limits, cost and where its admin key lives.

---

## 31. Seat slots and the join gate (2026-10-27)

**What I asked for**
- I asked what the remaining security gap was and told Claude to continue. The gap: anyone who knew a table's code could add themselves as a member of any live table, including one already playing or full.

**What changed**
- `backend/database.rules.json`: seat slots `seats/1` to `seats/4`, each created only while empty, and a member entry that records its seat. Joining is one write that takes a seat and creates the entry, allowed only while the table is in the lobby, alive, and within the host's seat count. One seat per player. The host takes a seat when creating the table. The seat count can no longer change after creation. `backend/test-rules.mjs` went from 106 to 203 checks, and `backend/mutate-rules.mjs` from 62 to 122 mutations. Docs: `docs/live-play.md`, `docs/todo.md`, `CLAUDE.md`, `backend/README.md`.

**What I checked**
- `npm test`: "All 203 rule checks passed" (run twice in a row at 201, once at 203). Nothing ran against my real project or in a browser.
- The first full mutation run had 77 killed and 42 survived. The seat rules are four copies, and my tests only tried each guard on some seat numbers (for example "a taken seat can be overwritten" was caught on seats 2 and 3 but not 1 and 4). I added loop tests that run every guard on all four seats, plus tests for a player re-adding a dropped member entry on a started, idle or expired table.
- The second full run: 112 killed, 8 redundant, 2 survived. One survivor was a real gap (the host re-adding their own member entry on a started table, which my tests only tried with a non-host) and I added tests for it. The other was redundant. After rerunning those two, there are 113 killed and 9 documented as redundant, 0 survivors. I did not rerun the whole set after that last change.
- One test run exited 1 earlier with no output captured, and I do not know why. It passed on the five runs since. It is open.
- Not checked: two people grabbing the same seat at the same moment (I believe the database handles writes one at a time, but I did not test it), the real project, and a browser.

**Decisions**
- Claude made three choices I have not weighed in on, and they are in `docs/todo.md`: the seat count is fixed after creation, a leave mid-game is final (the seat stays held and the member entry cannot be re-added), and anyone with the code can take the free seats of an open lobby, since the code is the join secret.

---

## 32. Ending a table, conceding, end match, and the popping windows (2026-10-27)

**What I asked for**
- I asked whether End game covers conceding. I decided: a player concedes for themselves (a flag), "end match" is host-only and sends everyone back to the lobby to start again, the last player standing can end the table, leaving and freeing seats stays a lobby thing, and host handover can wait. I also said the command windows popping up were annoying and changed my window focus.

**What changed**
- `backend/database.rules.json`: the one-table-per-host slot (`hosts/{uid}`), the host deleting their own table, the last member remaining deleting it, a `conceded` flag, and the status now able to go from `playing` back to `lobby` (host only). `backend/test-rules.mjs` went from 106 to 268 checks, `backend/mutate-rules.mjs` from 62 to 147 mutations. `backend/run-tests.mjs` was rewritten to start the emulator's jar directly with no window. Docs: `docs/live-play.md`, `docs/todo.md`, `docs/scryfall.md` (the Game Changers flag), `CLAUDE.md`, `backend/README.md`.

**What I checked**
- `npm test` passed three times in a row at 268 checks (and 12 in a row at 228 before the new section). The emulator's Java processes have no window attached, and the runner refuses to run when port 9000 is already taken, tested with a dummy listener of my own. I cannot see my screen from here, so whether the flashing is gone is for me to confirm.
- The full mutation run: 130 killed, 12 redundant, 5 survived. I added tests for three real gaps, documented two as redundant, and reran those five: 133 killed, 14 redundant, 0 survivors. I did not rerun the other 142 after those test changes.
- Checked in real data: Scryfall's documentation lists `game_changer` on cards, and my cached bulk file has it on all 38,998 cards with 53 true (no Scryfall request made). Not checked: whether the list changes, and the bracket rules.
- Not checked: any of this on my real project or in a browser, and two people writing at the same instant.

**Decisions**
- Deck name, card count and commander(s) will be visible to the table in the lobby, and changing your deck un-readies you. Sideboard swaps persist with a reset button (I said do what's best). A bracket check from the Game Changers flag is later, after reading Wizards' rules. I have not chosen between a match counter and each page clearing its own flags.

---

## 33. The match counter, and a hole in my concede flag (2026-10-27)

**What I asked for**
- I chose option B, the match counter, over having each page clear its own flags. I also asked whether we should consider a player connecting or disconnecting.

**What changed**
- `backend/database.rules.json`: `meta.match` starts at 1 and goes up by exactly one, only when the host ends a match. `ready` and `conceded` are now match numbers instead of true or false: you can only ready up for the current match, and concede for the current match during a match. A concession that has counted for the current match cannot be changed or deleted. `backend/test-rules.mjs` went from 268 to 307 checks, `backend/mutate-rules.mjs` from 147 to 157 mutations. Docs: `docs/live-play.md`, `docs/todo.md`, `CLAUDE.md`.

**What I checked**
- `npm test`: "All 307 rule checks passed." The full mutation run: 138 killed, 14 redundant, 5 survived. I read each survivor and all five are redundant (strict equality with a number already refuses strings and booleans, and one lock cannot be reached outside a match). They are now listed with reasons, and I reran those five to confirm the script reports them as redundant: 138 killed, 19 redundant, 0 survivors. I did not rerun the 138 kills after that edit, since it only changed the list of documented survivors.
- Each kill now names the check that caught it, and I read the list for kills that looked unrelated. One looked odd (the delete-rule mutation caught by "member overwrites opponent entry"), and it is legitimate: without it the host could write anything to the table.
- Not checked: the real project, a browser, and presence.

**Decisions**
- Connecting and disconnecting is already a decided UI piece but not built. A disconnect does not concede or un-ready anyone, and presence never keeps a table alive. Before writing its rules I have to check whether Firebase evaluates a server-side `onDisconnect` write against our rules when it fires. I proposed building the lobby deck fields next, then presence.

---

## 34. A full audit of everything so far (2026-10-27)

**What I asked for**
- Before moving on, I asked Claude for a big check of everything we have done.

**What changed**
- Only documentation: `backend/README.md` said 147 mutations (now 157), and three bullets in `docs/live-play.md` still described designs that had since changed (the cleanup query over all tables, the one-table slot being replaceable only when expired, and the lifetime rules being "drafts to test in the spike"). They now say what was built.

**What I checked**
- The rules suite 6 times in a row: 307 checks (92 allowed, 215 denied) every time. The 157 mutations all apply, 19 are documented as redundant. The last full mutation run on these rules: 138 killed, 14 redundant, 5 survived, then the five were reviewed and rerun as redundant. The parser and matcher suites pass, and the check of every real card name passes.
- A static scan of the rules file: all 19 read and write rules require `auth != null` (apart from the literal `false` at the root), and the 8-hour, 30-minute, 1-hour and 30-second constants are the right numbers.
- My real Firebase project still refuses signed-out reads of `/tables` and `/hosts` and a signed-out write (all HTTP 401), so the rules are not deployed. Those were three requests to my own project.
- No keys, tokens, phone numbers, IP addresses or Windows user paths in the repo. The one email-shaped string is a third party's public support address quoted in a draft. `.env` is ignored and untracked, the Fan Content disclaimer is in the README, no file has a BOM.
- Not checked: anything in a browser, the rules on the real project, whether the project is on the Spark plan, two people writing at the same instant.

**Decisions**
- None. Claude's honest summary of the biggest risk: the rules are very well tested, but there is still no page, no card list build, no deployment and no browser test, with about five weeks to the Dec 7 show and tell.

---

## 35. The first page: Vite, Firebase from npm, and a lobby (2026-10-27)

**What I asked for**
- After the audit I confirmed the project is on the free Spark plan and will stay there. I said the site should grow far past this class, so Claude revised its CDN suggestion to Vite and npm. I asked what Claude thought of three.js (verdict: not now, maybe a layer later). I said "lets continue", which Claude read as approval of `vite` and `firebase`.

**What changed**
- New: a root `package.json` and lockfile (vite 8.3.5, firebase 13.1.0), `vite.config.js`, `frontend/pages/lobby/` (`index.html`, `lobby.js`), `frontend/src/` (`db.js`, `style.css`), `shared/table-code.mjs`, `shared/player-name.mjs`, and tests `scripts/test-table-code.mjs` and `scripts/test-player-name.mjs`. Updated: `README.md` (status and how to run), `CLAUDE.md`, `docs/live-play.md`, `docs/todo.md`.

**What I checked**
- The two new helpers each passed their tests, and then failed them on deliberately broken copies (18 for the codes, 11 for the names; none survived). All other suites still pass, including 307 rule checks.
- `npm run build` works: 233 KB, 70 KB gzipped, no gRPC or Firestore code in it. A canary secret in the environment did not reach the page. A missing setting fails the build and names only the variable (my first attempt at that test was invalid, because PowerShell deletes a variable you set to an empty string; I redid it in a throwaway folder).
- Headless Chrome at desktop, phone and phone dark mode, with screenshots I looked at: no sideways scroll, buttons 44 px tall, the Fan Content disclaimer visible, no console errors, no network request on bad input. The screenshots caught a dropdown label clipped on the phone, which I fixed.
- `npm audit` at the root shows 4 high findings from `@grpc/grpc-js` through Firestore. The page does not import Firestore and the bundle has no gRPC code, so I judged them not reachable, but that is a judgment.
- Not checked: the page against the real database (the rules are not published yet), two browsers, whether Firebase's sign-in keeps the same id across a refresh by default, and a real phone.

**Decisions**
- Dependencies approved by "lets continue" (licenses MIT and Apache-2.0 shown). Join by link, the heartbeat, presence and the table page are not built. Still open: how the rules get published to my real project (paste into the console, or run `firebase login` once).

---

## 36. The two-browser test script, run once against the locked rules (2026-10-28)

**What I asked for**
- A new day. I said "lets continue" without answering the open question of how to publish my rules to the real Firebase project, so Claude prepared everything that did not need me.

**What changed**
- New `scripts/spike-two-browsers.mjs`: it starts the page, opens two separate headless Chrome profiles (Alice makes a table, Bob joins), and checks live sync, that Bob cannot read or write Alice's private cards, that a stranger cannot read the table, that a refresh keeps Bob's account and seat, that a second table replaces the first, and timings. It deletes its throwaway table and accounts. Docs: `CLAUDE.md`, `docs/live-play.md`, `docs/todo.md`.

**What I checked**
- I ran it once while the rules were still locked. Anonymous sign-in worked in a real browser against my real project, and creating a table was refused with "Permission denied", which is correct. It exited with code 2 ("rules not published") and left no browser processes, profile folders or server behind.
- Not checked: any of the 33 live checks that need the rules published (join, sync, hidden cards, refresh, replacement, timings). The script itself has not yet had a passing run, so I should expect to find bugs in it when it first runs for real.

**Decisions**
- None new. Still open: how to publish the rules (paste into the console, or run `firebase login` once).

---

## 37. The spike passes: two real browsers against my real Firebase project (2026-10-28)

**What I asked for**
- I pasted the rules into the Firebase console and told Claude it was done.

**What changed**
- New `shared/permission-error.mjs` and `scripts/test-permission-error.mjs`. `frontend/src/db.js` now uses the shared check, `frontend/pages/lobby/index.html` has an empty favicon (it silences a harmless 404), and `scripts/spike-two-browsers.mjs` got page-status and console output on failures, a wait for Bob's player list, and a check that its test data was really removed. Docs: `CLAUDE.md`, `README.md`, `docs/live-play.md`, `docs/todo.md`.

**What I checked**
- The first live run passed 20 of 31 and showed a real bug (below). After the fix, 31 of 31 passed, then 31 of 31 twice more, each time with the test table and accounts removed and verified gone (the last run printed "2 test table(s) removed and verified gone" and "host slot cleared"), and no browser processes, profile folders or servers left. The privacy results, in one line: Bob's read and write of Alice's private cards were refused and her cards were unchanged, and a stranger holding the code was refused on all five reads.
- The new `permission-error` tests pass, and 10 of 11 broken copies fail them (the 11th was redundant code I removed).
- Timings: HTTPS reads a median of 46 to 50 ms; a join took 0.8 to 0.9 s. One machine, one network, headless Chrome, and not the live socket.
- Not checked: a real phone, a held-open-connection round trip, per-IP limits on anonymous accounts, and whether the old test accounts are all gone from the Auth list (the script deletes them, but I cannot list them).

**Decisions**
- Firebase stays: the spike passed. Still open: the rules have no size limits yet, so the page stays on my machine until they do; and I paste the rules again each time the file changes.

---

## 38. Commit and push, then a deep quality pass over the page and the real project (2026-10-28)

**What I asked for**
- Commit and push; ignore phones and tablets until there is a working basic UI; keep re-running tests, add new ones, and do deep quality checking and optimization across the database, Firebase and everything else.

**What changed**
- Pushed three commits (`a1f37b0..d23a224`). Then, uncommitted: `frontend/src/db.js` (one shared sign-in attempt, the old-table check reads only what a member may read, `initializeAuth` with only the storage we need), `frontend/pages/lobby/lobby.js` (readable error messages, Enter joins), the shared `shared/friendly-error.mjs`, and new scripts: `scripts/lib/browser.mjs` (the Chrome helpers my scripts had each copied), `check-lobby-ui.mjs`, `check-live-rules.mjs`, `measure-lobby-load.mjs`, `test-friendly-error.mjs` and `test-all.mjs` (`npm test`, `npm run test:quick`, `npm run test:live`). The spike script was rewritten on the shared helpers and grew from 31 to 36 checks. The root `package.json` now allows only the Node versions Vite supports. Docs: `CLAUDE.md`, `README.md`, `docs/live-play.md`, `docs/todo.md`.

**What I checked**
- Before committing I ran everything. The first attempt at the commits failed because PowerShell passed my message as stray arguments, and my redo wrote a byte-order mark into the subject lines; I redid the local commits once more (nothing was pushed in between) and verified there is no mark and no attribution line.
- Three real bugs were found against the real project, each shown failing first and then fixed (see `docs/live-play.md`): simultaneous sign-ins made different accounts; the "you already have a table" warning never appeared; raw SDK text and a dead Enter key. 
- Optimization, measured: the page's JavaScript went from 232.9 KB to 220.9 KB (70.0 to 65.7 KB gzipped, about 6%), with an unchanged load time within noise.
- `npm run test:live`: 10 suites, all passing, about 40 seconds, nothing left behind. The live rules check matched 43 of 43 requests, so what I pasted behaves like the file. 25 broken copies of the new modules and the page all fail their checks.
- Not checked: anything on a phone (on hold), size limits and the table-code format (not built), security headers, slow or flaky connections (only fully offline), the idle and 8-hour limits against the real project (they need time to pass), and that every rule in the published file is present (only behavior was compared).

**Decisions**
- Phones and tablets are on hold until a working basic UI exists: desktop-only checks for now (recorded in `CLAUDE.md` and the todo). Not applied: pre-creating the anonymous account on page load, because it would create an account for every visitor.

## 39. The page's table logic moves to `shared/` and gets tested against the real rules (2026-10-28)

**What I asked for**
- Continue the deep checking. My standing rule says to test the design and the code against each other, so this is the first step: test what the page actually does against the rules file, not just the rules by themselves.

**What changed**
- `shared/table-ops.mjs` (new): find my table, create, join, rejoin and watch the players, moved out of `frontend/src/db.js`. The database functions are passed in, so the file has no Firebase import and Node can run it. `frontend/src/db.js` now only starts Firebase, signs in and hands those functions over; the lobby page needed no change.
- `backend/test-table-ops.mjs` (new, 44 checks) runs that same code as different people against the real `database.rules.json` in the local emulator. `backend/run-tests.mjs` now runs it after `test-rules.mjs` on the one emulator. `scripts/test-all.mjs` now prints every "All N ... passed" line, so the 307 and the 44 both show.
- A bug fix in `createTable`: when the old table was already gone, it still tried to delete it, and the rules refuse deleting a table that does not exist.

**What I checked**
- The first run of the new test failed on a real bug. A host whose old table had expired and been cleaned up (their host slot still names it) could not create any table: every attempt was refused and the page would have said "Could not create a table". My 307 rule tests had shown this case works, but only without the delete the page always sent. The fix tries the write with the delete first and without it second. The same test then passed, and it covers the old table being gone, expired at 8 hours, and still alive.
- Also covered: seats given out in order, a full or started table refused with the right message and nothing left behind, a rejoin keeping the same seat and name, an outsider unable to read the player list, the watcher hearing a leave and then nothing after it stops, a code that is already in use skipped, and five collisions giving a plain error.
- `npm run build` is fine (the page's JavaScript is 221.95 kB, 66.16 kB gzipped), and `npm run test:live` passed all 10 suites against the real project after the move. I have not run the new test file against deliberately broken copies of `table-ops.mjs` yet; the only proof it can fail is that it failed on the real bug before the fix.
- Not checked: the heartbeat and presence (not built), and the other half of the flow review (a model of start, concede, end match and leave compared with the rules), which is next.

**Decisions**
- Table logic lives in `shared/` with the database passed in, so the same code runs in the page and in tests. This is the pattern for the game logic later.

## 40. The game flow reviewed: a model of the design compared with the code, step by step (2026-10-28)

**What I asked for**
- "Ensure quality checking as well as proper gameflow." This is the standing rule I set earlier: test the design and the code against each other, and report each disagreement as a code bug, a model bug or a design question for me.

**What changed**
- `docs/game-flow.md` (new): the flow as designed (create, join, ready, start, concede, end match, leave, close, expire), which rule is enforced by the database rules, by the page, or by neither, and the open design questions.
- `shared/table-flow.mjs` (new): a plain model of that design, written without reading the rules.
- `shared/table-ops.mjs`: the page now has the rest of the flow: ready, un-ready, start, concede, end match, close the table and leave. Each checks who may do it and when and refuses in plain words before writing (`FlowRefusedError`). `frontend/src/db.js` exports them.
- `backend/test-table-flow.mjs` (new): random but repeatable sequences of actions (seeded) run through the model and through the page's operations against the real rules, in the emulator. After every step it compares whether the action was allowed and the whole table. It prints how often each action happened and fails if any action never succeeded in the run. `backend/run-tests.mjs` runs it with the other two files.

**What I checked**
- 120 sequences, about 1,670 steps: the model and the page plus rules agree on all of them, except one finding (below). I do not trust a clean run by itself. My first version never reached "playing" at all, because random moves almost never satisfied "everyone ready, then start", so it agreed on everything and proved little. I changed the generator to prefer moves the model says are possible and to add deliberate near misses, and added the coverage report and the guard.
- 13 deliberately broken copies (10 of the page, 3 of the model): 11 are caught, each by a named disagreement. The 2 that survive are checks the database already enforces (conceding outside a match, and a non-host closing a table), so the page's own check there is a second lock, not the only one. Four copies survived my first generator; two of them were real gaps in the generator (starting alone, readying during a match), now fixed and caught.
- Found by the comparison: **a seat held forever by someone who left mid-match** (design question 1 in `docs/game-flow.md`). The rules free a seat only in the lobby, so after the match ends that seat stays blocked and the person cannot come back. My recommendation is to let a player free their own seat in any state. That changes the rules file, so I did not do it; it is your call.
- Not checked: the heartbeat and real idle expiry (not built; expiry is simulated by moving the creation time), two players acting at the same instant, the host slot after a table closes, and the lobby page itself (it does not use the new operations yet).

**Decisions**
- The page enforces three things the rules do not (start needs two players and everyone ready, ready only in the lobby, the host cannot leave while others are there). I recommended accepting that for a friendly game; it is design question 2 for you.

## 41. Coming back to your seat mid-match, and a table that carries on without its host (2026-10-28)

**What I asked for**
- After the flow review I said a player must be able to rejoin their own seat mid-game, because a browser or computer can crash. I asked how possible it is to let the host hand the role to another player, and said the table must be fine continuing when the host is gone but the others are still playing. I also said playing alone (goldfishing) should be client-side only, not a table.

**What changed**
- `backend/database.rules.json` (two changes, five lines): a member entry can now be created in any state as long as the person holds the seat (a seat can still only be taken in the lobby, so in a match this means exactly "come back to your own seat"), and the host may free a seat whose holder has no member entry, in the lobby only. **The file changed, so it has to be pasted into the Firebase console again.**
- `shared/table-ops.mjs`: `joinTable` falls back to reclaiming a seat you hold, and `endMatch` releases seats nobody sits in once the match is back in the lobby (a second write, because the rules allow it only in the lobby).
- `shared/table-flow.mjs` (the model): a mid-match leaver's seat is reserved for them, they can return to it, and the end of the match releases it.
- `backend/test-rules.mjs`: 307 to 344 checks. Two old checks that said a dropped player could not come back were flipped on purpose; new ones cover who may return and who may not (a wrong seat, the host's seat, a stranger, an extra field, someone else adding the entry), the host freeing empty seats on all four seat rules, and a new block "a match carries on when the host is gone". `backend/test-table-ops.mjs`: 46 checks. `backend/test-table-flow.mjs`: now compares the seat map too, and fails the run if it never reaches a return to a reserved seat or a match ending with reserved seats.
- `backend/mutate-rules.mjs`: one mutation retired (its target rule was removed), the free-a-seat ones rewritten, 11 added: 168 in total, and a mutation that fails for a reason other than a normal denied request now prints what failed.
- `docs/game-flow.md`: the new seat design, "When the host is gone", "Host handover" (a proposal) and "Solo play".

**What I checked**
- All 8 local suites pass: 344 rule checks, 46 table checks, 1,672 flow steps with 0 disagreements. 5 of 5 broken copies of the new behaviour (page and model) are caught.
- The full rule mutation run: 168 broken copies of the rules, 149 caught outright, 19 documented as redundant, 0 survived. The 11 new ones were all caught on each of the four seats.
- The table already carries on without its host: any member can write the heartbeat, their own zones, concede, leave, and the last one standing can close the table. What stops without a host is starting a match, ending a match and closing the table, so the next match is the problem; the proposal for a hand-over is in `docs/game-flow.md`.
- After I pasted the changed rules into the Firebase console, `npm run test:live` passed all 10 suites. The old live check could not have noticed an unpublished change (none of its 43 requests touched the new behaviour), so I added 9 requests that only pass on the new rules (a member drops out and comes back to their own seat mid-match, a stranger cannot take that seat, the host frees an empty seat only after the match ends): 52 of 52 matched the file on the real project.
- Not checked: two players acting at the same instant, and the heartbeat and presence (not built).

**Decisions**
- A mid-match leave reserves the seat (released when the host ends the match); a different browser or cleared browser data is a different person to the database and cannot reclaim it. A returning player's concede mark is cleared, so a concession can be "undone" by leaving and coming back; I accepted that for a casual game.
- Playing alone is a browser-only solo table (Phase 2), not a table with seats.
- The host hand-over is a proposal: a voluntary hand-over now (small), and taking over from a host who vanished together with presence and the heartbeat (bigger). Not built; it needs my go-ahead.

## 42. The host can hand the table to another player (2026-10-28)

**What I asked for**
- "Voluntary host handover can continue", after I asked how possible it is to let the host pass the host role to another table member. I also asked that a table keeps going when the host is gone but the others are still playing (entry 41 covered that part).

**What changed**
- `backend/database.rules.json` (one rule): `meta.host` may now change, written by the current host, to a current member who does not host another live table (a host slot that points at a table that is gone does not count). **The file changed, so it has to be pasted into the Firebase console again.**
- `shared/table-ops.mjs`: `passHost(code, uid)` (the old host's slot is cleared in the same write), `claimHostSlot(code)` (the new host takes the one-table-per-host slot afterwards, because only they can write it), and `leaveTable` for a host with others at the table now hands the table to the player in the lowest seat as they leave, and offers it to the next seat if the rules refuse that player. `frontend/src/db.js` exports them.
- `shared/table-flow.mjs`: the model has `passHost` and the host-leaves hand-over. `backend/test-table-flow.mjs` follows the current host, claims the slot the way the new host's page would, and compares who the host is and who holds the slot after every step. `backend/test-rules.mjs` 344 to 372, `backend/test-table-ops.mjs` 46 to 64, `backend/mutate-rules.mjs` 6 new mutations (173 in all), `scripts/check-live-rules.mjs` 8 new requests that pass only once the rules are published. `docs/game-flow.md` is updated.

**What I checked**
- All 8 local suites pass: 372 rule checks, 64 table checks, 1,675 flow steps with no disagreement. In that run a host left with others at the table and the table was handed on 64 times, and someone other than the original host did a host-only action 57 times.
- I broke the handover 10 ways (7 in the page, 3 in the model): 9 are caught by their real disagreement (the wrong host, a slot left behind, the wrong seat chosen, a verdict that differs). The 10th, the page not checking that you are the host, survives because the database already refuses a non-host: a second lock, not the only one. The 6 new rule mutations: 5 caught, 1 redundant (a host that is not a string cannot be a member's id).
- After I pasted the changed rules into the Firebase console and published them, `npm run test:live` passed all 10 suites: 60 of 60 live rule requests (8 of them are the new hand-over ones, which the old rules refused) and the two-browser run.
- Not checked yet: the full 173-mutation run, which I have not repeated since this change (only the 6 new ones, plus the 5 earlier ones already run). Not built: taking over from a host who vanished, which needs presence.

**Decisions**
- A hand-over to a player who already hosts another live table is refused, to keep the one-table-per-host rule.
- A host who leaves hands the table to the lowest seat. The host can still close the table instead.

## 43. Why every Vercel deployment since the lobby page has failed (2026-10-28)

**What I asked for**
- After the push, the GitHub commit list showed a red cross ("Deployment has failed") on the last three pushes. I asked Claude to look into it.

**What changed**
- Nothing in the code yet. This entry records the diagnosis and the fix I have to make in Vercel.

**What I checked**
- The page's `vite.config.js` stops the build with "Missing Firebase settings" when any of the five Firebase settings is missing, on purpose, so a page that cannot connect never ships. The settings live in my gitignored `.env` locally and have to be added to Vercel as environment variables. `docs/todo.md` already said "Before any real deploy: add the five Firebase setting names to Vercel's environment variables", and I had not.
- Claude reproduced it by running `npm run build` with the five settings forced empty: it fails with exactly that error (exit code 1). With the settings present the build passes (225.91 kB, 67.11 kB gzipped).
- It fits the commit list: the red crosses are on the last commit of each push (`d23a224`, `0c3f72a`, `df8b741`), and Vercel reports on the push's final commit, not the ones before it in the same push.
- Claude cannot read Vercel's own build log (that needs my Vercel login), so this was a reproduction and an inference. I then added the five settings to Vercel's environment variables, redeployed, and the deployment went green, which confirms it.

**Decisions**
- The fix is mine to make in the Vercel dashboard (Project, Settings, Environment Variables: add `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_DATABASE_URL`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID` for Production and Preview, then redeploy). Claude does not read or print my `.env`.
- Not done yet, and it matters right after: the built site has no page at `/` (the lobby builds to `/pages/lobby/`), and `/lobby/CODE` links need a rewrite, so a Vercel config (`vercel.json`) is still to do.

## 44. Shared links, a Vercel config, and the full rule mutation run (2026-10-28)

**What I asked for**
- The Vercel deployment was green again, so I asked what to fix next. Claude proposed a Vercel config (so the site root and `/lobby/CODE` links work, plus security headers) and the full rule mutation run, and I let it decide the order. It started the mutation run and did the config work while that ran.

**What changed**
- `shared/lobby-link.mjs` (new): reads a table code from an address like `/lobby/ABC234` and builds the link to share. `scripts/test-lobby-link.mjs`: 2,035 checks.
- `frontend/pages/lobby/lobby.js`, `index.html`, `style.css`: a shared link fills the code in and says what to do next, and never joins by itself; a table now shows a link to share.
- `vercel.json` (new): rewrites for `/`, `/lobby` and `/lobby/:code` to the lobby page, a strict content policy (no inline scripts or styles, connections only to Firebase's own hosts, no framing), `nosniff`, a referrer policy that does not send the path to other sites, and a year of caching for the hashed files.
- `scripts/check-deploy-config.mjs` (new, part of `npm run test:live`): builds the site, serves it through a small stand-in for how Vercel applies `vercel.json`, and drives headless Chrome against the real Firebase project.

**What I checked**
- The full rule mutation run, all 173 broken copies: 153 caught, 20 documented as redundant (the 19 from before plus the new one for the host's type check), 0 survived, 0 suspicious, and the rules file came back identical to the committed one.
- The link module: 8 of 8 broken copies caught (one mutation was mistyped and "did not apply" at first, so I fixed it and re-ran it).
- The site check passes 37 of 37: the headers, `/` and `/lobby/CODE` serving the lobby page, a link filling the code in, an invalid or over-long link filling nothing in, a table made under the content policy, a second browser joining through the shared link and the host seeing both players live, and nothing blocked by the policy. It cleans up its table, host slot and anonymous accounts. 11 of 11 broken copies of `vercel.json` are caught (missing hosts in the policy, an inline-script allowance, a missing rewrite, a rewrite to a page that does not exist, a missing header, a missing cache rule).
- The whole suite, including the live checks: 12 of 12 suites pass.
- Not checked: Vercel itself (the stand-in is mine, so after a deploy the real headers have to be fetched from the live site), Firebase's long-polling fallback under the content policy (it needs WebSockets blocked), and real phones.

**Decisions**
- A link with extra path parts (`/lobby/ABC234/extra`) is a 404, like on Vercel, not the lobby page.
- The referrer policy is `strict-origin-when-cross-origin`, not `no-referrer`, so a Google Cloud API key restricted by website would not silently break sign-in.

## 45. The deployed site checked for real (2026-10-28)

**What I asked for**
- I pushed, gave Claude the live address (`https://overloaded-spell.vercel.app`), and asked whether I should test the site.

**What changed**
- `scripts/check-deploy-config.mjs` can now check a deployed site: with `DEPLOY_URL=<address>` it skips the build and the stand-in, reads the real response headers, and Chrome and Firebase see the real address. It also checks that none of the repository's own files (`package.json`, `.env`, `vite.config.js`, the rules file, `log.md`, `CLAUDE.md`) can be fetched from the site.
- `CLAUDE.md` now records the live address.

**What I checked**
- Plain GETs to the live site: `/` and `/lobby/ABC234` serve the lobby page, `/lobby/ABC234/extra` is a 404, and every response carries the content policy, `nosniff`, no framing, the referrer policy and the permissions policy.
- The full Chrome check against the live site passed 40 of 40: a table made from the real address (so the Google API key is not restricted away from it), a second browser joining through the shared link, the host seeing both players live, and nothing blocked by the content policy. It cleaned up its table and accounts. Locally it passes 43 of 43.
- Real Vercel answers a path-traversal attempt (`/..%2Fpackage.json`) with 400, not the 404 my stand-in gave; either way nothing is served, and the repository files all return 404.
- I then tried the live site by hand in my own browser: I made a table and the page showed its code, a link to share and my seat; a second browser joined and the database showed both members, seats 1 and 2, the host, and a host slot for the host only. A refresh put me back in the same seat, the shared link works in a private window, and making a second table while I had one showed the warning popup. I cleared my test tables from the console afterwards. A leftover table from an early test run (before the cleanup was verified) was also in the database; I deleted that myself.
- Seen while testing, not a bug: `lastActive` equals `createdAt`, because the heartbeat is not built, so a table stops accepting writes 30 minutes after it was made even if people are active. There are also no Ready or Start buttons yet.
- Not checked: Firebase's long-polling fallback (needs WebSockets blocked), a real phone, and a school network.

**Decisions**
- The test I could run myself, I ran. What is left for me to try by hand is what a script cannot judge: how the page looks and feels in my own browser, a share link opened on a second real device, and a phone.

## 46. The heartbeat, and warnings before a table closes (2026-10-28)

**What I asked for**
- While testing the live site I saw that `lastActive` never moves, so a table would stop working 30 minutes after it was made even with people active. Claude suggested building the heartbeat, and I asked whether 30 seconds is too fast, because I was afraid of cost. Claude explained that 30 seconds is the database's floor, not the page's rate (the page sends at most one a minute), and that nothing here costs money on the free plan. I said to continue.

**What changed**
- `shared/heartbeat.mjs` (new): when to send. Only a tap, key or input in a visible tab sends one, at most one a minute; idle or hidden tabs send none; a failed send is retried, a refused one is not. `shared/table-limits.mjs` (new): when a table closes and when to warn (the idle banner in the last 5 minutes, quiet 30 and firmer 10 minutes before the 8-hour limit, and what to say once it has closed), always judged on the server's time. `frontend/src/banner.js` (new): what the page shows.
- `backend/database.rules.json`: members may now read `activity/lastActive` (one line). **Has to be pasted into the Firebase console again.**
- `shared/table-ops.mjs`, `frontend/src/db.js`: `heartbeat`, and watchers for the activity, the table's limits and the server clock offset.
- `frontend/pages/lobby/lobby.js`, `index.html`, `style.css`: the page sends the heartbeat and shows the banner.
- Tests: `scripts/test-heartbeat.mjs`, `test-table-limits.mjs`, `test-banner.mjs`; 13 new rule tests (385), 14 new table logic checks (78), 2 new live rule requests, 2 new page checks (44), 3 new rule mutations (176), and `scripts/check-heartbeat-live.mjs`, a 70-second check on the real project that is part of `npm run test:live`. I also changed two of my site checks to accept my "(BETA)" heading.

**What I checked**
- All 12 local suites pass: 385 rule checks, 78 table checks, 1,675 flow steps, 44 page checks, and the new unit suites. Broken copies: the heartbeat logic 11 of 11 caught (the first run missed one because my test had activity already pending; I added a case), the limits 21 of 21, the banner 9 of 12 (the 3 survivors are the explicit "missing data" guards, which are redundant: missing numbers become `NaN`, which shows nothing anyway), the closed text 2 of 2, the 3 new rule mutations 2 caught and 1 redundant (a signed-out user has no `auth.uid`, so the member check already refuses it).
- Before I pasted the rules, the live heartbeat check correctly stopped with "rules not published" (exit 2) and cleaned up. After I pasted the rules with the new read permission and published them, `npm run test:live` passed all 16 suites: the live rules check 62 of 62 (the 2 new requests included) and the 70-second heartbeat check 7 of 7 on the real project in a real browser: nothing sent while idle, one heartbeat after a tap that moved `lastActive` by about a minute, none for a second tap straight after, the banner stayed hidden, no page errors. I also looked at screenshots of the three banner looks at desktop width in dark mode.
- Not checked yet: the banner on a real table nearing its limit (I cannot wait 25 minutes in a test; the wording, boundaries and display are tested with a fake clock and forced screenshots), and a full re-run of all 176 rule mutations. Not built: presence.

**Decisions**
- The page sends at most one heartbeat a minute, not every 30 seconds. The database's 30-second cap is only a floor against abuse.
- The warnings use the server's clock, so a wrong clock on one computer cannot hide or invent a warning.
- Left for later: the heartbeat is not in the flow model (its "expire" step only moves the creation time); it is covered by the rule tests and the live check.

## 47. An edge-case pass: names, slow text, seat squatting, blocked storage, and a heartbeat race (2026-10-28)

**What I asked for**
- While the mutation run was going I asked Claude to fix the name gap from its security pass and to look for other edge cases like it in other areas (the database, the logic).

**What changed**
- **Names** (`shared/player-name.mjs`): invisible and direction-changing characters are removed, loose halves of emoji are removed, accents are put in one standard form, a name needs a visible character, emoji joiners stay. The length is now counted the way the database counts it (UTF-16 units): the rules refuse 16 emoji, and the page used to allow 30. The page stores and shows the cleaned name.
- **Card-name matching** (`shared/card-match.mjs`): a regular expression took time growing with the square of the length (100,000 spaces took 10 seconds). Spaces are collapsed first now; a comparison against the old version on 40,000 random strings gives identical answers.
- **Heartbeat wiring** (`frontend/src/keep-alive.js`, new): moved out of the page so a fake clock can test it. A wrong computer clock could close a live table in the page before the server time arrived, and the page believed it for good. Nothing is judged until the server time is known, and newer data corrects an early "closed". The default timers are wrappers, because a browser throws "Illegal invocation" if `setInterval` is called as a method of another object (confirmed in Chrome; Node does not mind).
- **Expired old table**: a host whose old table has expired is replaced without the popup (`findMyTable` now reports `expired`).
- **Seat squatting** (`backend/database.rules.json`, four lines): a stranger who knew a table code could claim every free seat without joining, so real players were refused, and could do it again after the host cleaned up (shown in the emulator first). A seat can now only be claimed in the same write that creates the claimant's member entry for it. **The rules file changed, so it has to be pasted into the Firebase console again.**
- **Blocked browser storage** (`frontend/src/safe-store.js`, new; `db.js`): with storage blocked the page crashed at load and could not save a name; now it works without it, and Firebase sign-in falls back to a memory-only session.
- **Hidden characters in code**: `scripts/check-source-hygiene.mjs` scans every code file. The editing tool turned my `backslash-u-200B` style escapes into the real invisible characters twice (the name cleaner and even the guard's own comment); both files are plain ASCII now.
- New tests: `test-deck-text-fuzz.mjs`, `test-card-match-fuzz.mjs`, `test-keep-alive.mjs`, `test-safe-store.mjs`, bigger `test-player-name.mjs`; page checks 44 to 55; rule tests 385 to 421; table checks 78 to 87.

**What I checked**
- All 17 local suites pass. Broken copies: names 53 of 53, keep-alive 23 of 23 (the original bug included), safe store 9 of 10 (the survivor is redundant), deck parser 15 of 16 (the survivor cannot be reached: the card-line pattern cannot fail after a quantity, so it cannot backtrack), the hidden-character guard 9 of 9 planted characters.
- Rule mutations for the seat change: my first rewrite of the tests left 14 survivors, because the tests now failed at a different guard first. I added scenarios (an existing member with an empty seat) that isolate each guard: 12 of 14 are caught by named checks and 2 per seat-pair are redundant for a reason I documented. Not re-run: the full set of 184 mutations (due).
- Found sound, no change: the deck parser held up against 4,000 random messy decklists and crafted 100,000-character lines in under 1.5 seconds; the matcher treats `__proto__` and `constructor` as ordinary names; the browser-facing code has no risky patterns and other players' text only ever reaches the page as plain text; no key-shaped strings are tracked and `.env` is ignored.
- `npm audit --omit=dev` reports 4 high findings in the Firestore and gRPC packages that Firebase installs but the page does not import; the built page has no gRPC code (the one "firestore" in it is a name in a list). I did not apply the suggested `npm audit fix --force`, which would downgrade Firebase 13 to 9.
- After I pasted the changed rules into the Firebase console, `npm run test:live` passed all 21 suites: 64 of 64 live rule requests (the 2 new squatting requests included) and the rest of the live checks.
- Not checked: the full 184-mutation run (due).

**Decisions**
- Table codes stay at 6 characters (about a billion possibilities); I decided that guessing is not worth 2 more characters to type for now, and will revisit if the site gets real traffic.
- Left for later, recorded in `docs/todo.md`: size limits on `public` and `private` (a griefer could write megabytes there) and one person sitting at several tables at once.

## 48. Two tabs of one browser were two players (2026-10-28)

**What I asked for**
- Claude had said it was starting presence, and I asked: "have you considered what happens when a person opens the same url with the lobby code in multiple tabs in the same browser?" Claude said it had thought about it for presence only, never for join, ready, leave or the heartbeat, and that it could not run the emulator while the mutation run was going. I asked for another round of logic checks while that ran.

**What changed**
- Reading the rules first: two tabs joining at the same moment cannot give one player two seats. The second tab's seat claim is refused, a member's seat cannot change, and its last attempt just rejoins the first seat. That was a conclusion from reading, not a run.
- Then a real test against the real project: one fresh Chrome profile, two tabs opened at once. They became two different anonymous accounts. The browser kept only one, and the other tab went on writing as an account the browser had lost. My earlier fix only covered one tab.
- `frontend/src/db.js`: the tabs now take turns with a Web Lock. A tab that had to wait gives the first tab's saved account up to 3 seconds to arrive before it creates its own. `signIn()` also reads the live signed-in account each time instead of remembering its first answer. A tab with no other tab around signs in as fast as before.
- `scripts/check-two-tabs-live.mjs` (new, part of `npm run test:live`, which is now 22 suites at that point): two tabs on a fresh profile must end up as one player and the browser must hold one account.

**What I checked**
- Before the fix: 1 run, two different players. After the fix: 6 runs in a row, one player each time, and it passed inside the full `npm run test:live`.
- I did not rerun the lobby page test against the new `db.js` until the mutation run finished; then all 18 local suites passed.
- Not checked: what the other tab shows after you leave or replace the table in one tab. Different names typed in two tabs: the first name wins on rejoin, silently.
- The tab that lost the first run's account left an unused anonymous account in the Firebase list. It is harmless.

**Decisions**
- A join from two tabs at once is left to the rules (one seat). The reclaim write replaces the whole member entry, so a `ready` mark set in that gap would be erased; it is rare, so I left it.

## 49. Presence: "Reconnecting..." and "Disconnected" (2026-10-28)

**What I asked for**
- "continue" after the mutation run was going; Claude explained presence in plain words first: each open tab writes a small note and asks the database to remove it if the connection drops, and the database records a last-seen time. I said I would paste the rules when they were ready.

**What changed**
- `shared/presence.mjs` (new): who is connected, reconnecting (under 2 minutes), or disconnected, the words for each, my own "You're offline, reconnecting..." line, and when a host counts as gone (5 minutes).
- `backend/database.rules.json`: a `presence` branch. Members read it; only the owner writes a note under their own id (a 10-character tab name from a fixed alphabet, value `true`) or a last-seen time (must equal the server's clock). A new note needs a live table; removing one is always allowed, so the cleanup after a dropped connection is never blocked. **Had to be pasted into the console; I did.**
- `shared/table-ops.mjs`, `frontend/src/db.js`: `startPresence` (on every connection it first asks the database to remove the note and set the last-seen time if the connection drops, then writes the note), `watchPresence`, `watchConnection`.
- `frontend/pages/lobby/`: the player list shows the status next to each name and a line for my own offline state; the pulse stops under `prefers-reduced-motion`.
- Tests: `scripts/test-presence.mjs` (59 checks), 44 more rule tests (465), 17 more table logic checks that cut and restore the connection in the emulator, 9 new live rule requests (73), 23 rule mutations, and `scripts/check-presence-live.mjs` (two real browsers, 2.5 minutes).

**What I checked**
- Broken copies: the presence logic 18 of 18 caught (one survived first: the "time is not a number" check, which only matters for an infinite time; I added a test). Rule mutations: 19 caught and 4 documented as redundant, 0 survivors.
- After I pasted the rules, `npm run test:live` passed all 24 suites: 73 of 73 live rule requests, and the presence check 11 of 11 with two real browsers. Closing the second browser showed "Reconnecting..." on the first within 263 ms, the database had removed the note and recorded the time by itself, and about two minutes later the page showed "Disconnected, last seen 2 min ago".
- I looked at screenshots at desktop width. My first two were cut off (the list was below the fold, so they showed nothing), so I made the check scroll the list into view and ran it again. The first "Reconnecting..." screenshot caught the pulse at its dimmest and was hard to read, so I raised its dimmest point from 0.35 to 0.65 opacity. I did not take that screenshot again.
- Not checked live: my own "You're offline, reconnecting..." line. Only the logic that drives it is tested.

**Decisions**
- A note per tab (not per player), so a refresh or a second tab never makes the player look gone.
- Left for later: nothing stops a member writing many tab notes with different names; the name shape is checked, the count is not.

## 50. A member can take over from a host who has been gone for 5 minutes (2026-10-29)

**What I asked for**
- Earlier I decided the table must carry on without its host and that the host could hand it over; the rest was a takeover from a host who has vanished. I told Claude to continue in the order: host takeover, a full mutation re-run, then the log. After it built the takeover I published the rules and told Claude to fix any bugs it needed to.

**What changed**
- `backend/database.rules.json` (`meta` write): a member may become host only if the host has no open tab and a last-seen time at least 5 minutes old on the database's clock. A host with no presence record at all is not treated as gone. The taker cannot change the status, format, seats, creation time, idle limit or match number in the same write, the table must be alive, and the new host must not host another live table (the existing host rule).
- `shared/table-ops.mjs`, `frontend/src/db.js`: `takeOverHost` (refuses in words unless the host is really gone; writes the host change and the taker's host slot in one write).
- A bug I would have shipped: after a takeover the old host's slot still names the table and nobody else can clear it. If they came back and tried to make a new table, it would have failed. `findMyTable` and `createTable` now clear a slot that names a table someone else hosts.
- The lobby page marks the host "(host)" and shows a "Take over as host" button only when the host has really been gone 5 minutes. A later fix put a real space between a name and its status, because they ran together for a screen reader.
- `scripts/check-takeover-live.mjs` (two real browsers, about 6.5 minutes, on demand and not part of `npm run test:live`, because `test:live` cannot tell old rules from new here: the refusals look the same).

**What I checked**
- Local: 495 rule checks (30 new), 121 table logic checks (17 new). The page's own code ran against the emulator, including the old host making a new table straight away.
- Rule mutations (14 new, run alone): 7 caught and 7 documented as redundant, 0 survivors. First 4 showed as survivors: one was a gap in my test (the table had no third member, so naming one was refused for the wrong reason), and three were redundant because other rules refuse the same writes.
- After I pasted the rules: `scripts/check-takeover-live.mjs` 12 of 12 against the real project. Nothing was offered at 1 and 3 minutes after the host left, it was offered 308 seconds after, clicking it made the second player the host in the database with the host slot, and no page errors. `npm run test:live` passed all 24 suites after that. I looked at the screenshot at desktop width.
- A flaky older check in `backend/test-table-ops.mjs` (the heartbeat watcher saw a time go back by 1 ms) failed once during a mutation run; it now allows a second of estimate drift.

**Decisions**
- A match in progress can be taken over too (the table carries on without its host).
- A host can still delete their own host slot and hold two tables, so the one-table slot limits honest use, not abuse. That was true before the takeover; I wrote it down.
- Not in the flow model: presence and time, so the model does not cover the takeover; it is covered by the rule tests, the page-logic tests and the live check.

## 51. The full rule mutation run after presence and the takeover (2026-10-29)

**What I asked for**
- In the order I gave Claude, after the takeover: a full re-run of all the broken copies of the database rules, since the last full run was before presence and the takeover.

**What changed**
- Nothing in the code. The run rewrites the rules file one broken copy at a time and always restores it.

**What I checked**
- 221 broken copies, one at a time, about 55 minutes: 187 caught by a named check, 34 documented as redundant with a reason, 0 survived, 0 suspicious. The last full run was 184 copies (161 caught, 23 redundant), so this adds the 23 presence and 14 takeover copies run alone earlier (26 caught, 11 redundant) and now run together with the rest.
- After it ended the rules file was restored with no difference from the committed one, the backup file was gone and no emulator was left running.
- While it ran I committed and pushed without touching the rules file in the working copy: I staged the run's own backup copy, which is the version I had published, and confirmed afterwards that the committed file equals the restored one.

**Decisions**
- Claude does not edit or paste the rules file while a full run is going; it only reads the committed copy.

## 52. The card list build: a second look at the plan, and the first piece (2026-10-29)

**What I asked for**
- I asked which topics need a mutation run, then for the best order to work in. Claude suggested the card list build and deck import first, with the solo table next, and showed a plan before building it, as my notes require. I asked for another round of deep consideration and said it could go ahead after that.

**What changed**
- Before building I checked the things my notes list as unknown. **How often the list changes:** the Oracle file I had cached from 2026-10-26 against a fresh download from 2026-10-29: 198 cards added, none removed, 23 changed, and 162 changed their default printing id. So the weekly reuse rule really does matter. **Vercel:** an agent read Vercel's docs. Files under `.vercel/cache` persist between builds (per project and branch, for a month), Hobby builds get 45 minutes and 8 GB, JSON is compressed automatically, and Vercel offers Node 22.x and 24.x but not 20. **Online-only cards:** the Oracle file's own flag would wrongly drop 1,062 real paper cards, so the build does need the 76 MB Default Cards file as well. All of it is in `docs/scryfall.md`.
- `scripts/lib/card-list.mjs`, `scripts/build-card-list.mjs`, `scripts/test-card-list.mjs` (new; `scripts/test-all.mjs` registers the test): the filters, the sorted list, the checks before writing, and a writer, working from the two cached files on disk. Nothing downloads yet and it is not part of `npm run build` yet.
- I changed my plan in two places after looking at the facts. A card with no printings in the Default file is kept (the audit's rule dropped 198 new cards when the two files were from different days). And I dropped my own first idea of a one-day browser cache for the list: Vercel's default of revalidating with the ETag is simpler and costs one tiny request.

**What I checked**
- Using the Oct 26 files, the build gives exactly 33,974 cards, the audit's number. With the Oct 29 Oracle file and the older Default file it gives 34,172, which is those plus the 198 new cards. I compared seven awkward real cards against their raw Scryfall records field by field (a transform card, a split card, an adventure card, a prepare card, a land, a card whose default printing is online-only), all matched, and the 811 dropped cards are all Arena-only.
- 87 checks pass. 40 of 40 deliberately broken copies of the library fail them. The first run caught 5 survivors: three tests that looped over the library's own sets (so breaking the set also broke the test), a missing check for a printing with no id, and a missing check for ids with extra characters around them. I fixed all of those.
- A test found a real bug: the reader did not pass a missing-file error along, so a missing file would have crashed the build with an unhandled error instead of a message. Fixed.
- Not done: the download, the weekly reuse, wiring it into the build, and the check on Vercel. Whether the cache really persists for our build is still unseen.

**Decisions**
- Build from both bulk files, once a week at most; reuse a stale list if Scryfall is down; tokens, rules text and printings are left for later steps.
- The cost field is Scryfall's as given: a transform card has its front-face cost, a split, adventure or prepare card has both costs joined by " // ". Anything that reads costs later has to allow for both.

## 53. The card list build: download, reuse, fallbacks and the wiring (2026-10-29)

**What I asked for**
- I said to commit what was built so far, and to continue the card list build after rechecking the best and worst cases and always taking costs into account.

**What changed**
- `scripts/lib/card-list-build.mjs` (new): a cached list under 7 days old is reused with no requests; otherwise one request to Scryfall's file list and two downloads (about 100 MB) with the required headers, each checked against the size Scryfall announced; the new list is checked before it is written; a failed try is repeated once, then the last good list is used for up to 30 days with a warning; only a build with no usable list at all fails. A damaged cache, a list that fails its checks, or one more than 5% smaller than the last is never used.
- `scripts/build-card-list.mjs` now does this by default (the earlier from-files mode is `--from-files`). `package.json`: `npm run build` runs it before Vite, and `npm run cards` runs it alone. `.gitignore`: the generated list. `scripts/lib/card-list.mjs`: reads the files one record at a time, so it needs no memory flag. `scripts/check-deploy-config.mjs`: its build never downloads, and 3 new checks that the built site serves the list as JSON.
- Switches: `SKIP_CARD_LIST=1` ships the site without a list (an emergency way out if this step ever blocks a deploy), `CARD_LIST_NO_DOWNLOAD=1` never touches the network (the tests use it), and a Vercel preview build never downloads.

**What I checked**
- The review turned up a cost hazard before any code ran: the live deploy check runs `npm run build`, so it could have started a 100 MB download by itself. It now sets the no-download switch.
- 113 checks against a stand-in Scryfall: first build 3 requests; later days 0; a rebuild after 7 days; Scryfall down (old list used, nothing lost); a cut-off, mis-sized or missing file; a server that never answers; a damaged or too-small list; preview and test modes; 30 daily deploys make 5 rebuilds and 15 requests, not 90. 52 of 54 broken copies of the module fail the tests; the other 2 are redundant checks. The first run of those broken copies had 11 survivors, which led to several stronger checks (a bad-date record that also had a right checksum, an injectable retry delay, a fallback that has to put the file back, a stalled file list and a stalled download for each file).
- With the real Scryfall: the first run took 10 seconds including the download (34,172 cards) and the second 0.4 seconds with no requests. Built with only 256 MB of memory. `npm run build` puts `dist/data/cards.json`, byte for byte the cached list. A simulated preview build with an empty cache skips and exits 0, and so does the skip switch. All 20 local suites pass, and the deploy check passes 46 checks.
- Not checked: any of this on Vercel. Whether the cache really persists across our builds, which Node version runs, and whether `VERCEL_ENV` is exposed are all unseen until the first deploy; the step prints them at the top of its log.

**Decisions**
- One cache folder everywhere, `.vercel/cache/overloaded`, not one chosen by a Vercel variable. I had first picked the folder from `VERCEL`, then saw that the docs say system variables are only exposed when a setting is on; a missing variable would have moved the cache somewhere Vercel does not keep and cost a 100 MB download on every deploy.
- The build never blocks a deploy because Scryfall is down; it blocks only when there is no list at all.

## 54. The card list on Vercel: first build, and the cache (2026-10-29)

**What I asked for**
- I said yes to committing and pushing the card list build so Claude could check the first Vercel builds. Claude first made the build write a small public file, `/data/cards.info.json`, saying what it did (rebuilt or reused, when, which Node, whether Vercel's variables arrived), because Vercel's build logs cannot be read without a login. Then it pushed twice: the code, and a docs-only change with the first results.

**What changed**
- `scripts/build-card-list.mjs` and `scripts/lib/card-list-build.mjs`: the info file, and the result of the card step now carries the reason and the cache record. Nothing in it is secret, and it changes on every build on purpose. The tests went from 113 to 115 checks.
- Pushed `f643f3e..8015c98` (four commits: the earlier card list pieces and this one) and then `8015c98..67f1ff1` (the docs with the first findings).

**What I checked**
- First deploy: Vercel reported success. The info file said `rebuilt` (no cache yet, as expected), 34,172 cards, built in about 26 seconds including the 100 MB download, with the **same SHA-256 as my local build**, so the list is the same bytes on two machines. `vercelEnv` was `production` and `onVercel` true, so Vercel's variables do reach the build.
- **Node on Vercel was v26.13.0**, not the 24.x its docs list as the default: my `engines` range `^20.19.0 || >=22.12.0` takes the newest major. It worked.
- The list is served with Brotli, `max-age=0, must-revalidate` and a weak ETag; a request with the ETag gets 304 and no body.
- Second deploy (a docs-only push): `reuse`, the same `builtAt`, nothing downloaded, so **`.vercel/cache` persists between our builds**, and the list's ETag was identical to the first deploy's. Both unknowns in my notes are answered, and the row is gone.
- The deploy status for each commit came from GitHub's public commit status (`success`).
- Not checked: a preview build (nothing has been pushed to another branch), a stale-list fallback on Vercel, or what happens when a new Node major arrives.

**Decisions**
- Open for Kevin: `engines` floats to the newest Node major (26 today), and the page build and card step have been run locally on 24 only. Pinning it to `24.x` would match local testing; leaving it means a new major could break a deploy by itself.

## 55. Pinning Node to 24.x (2026-10-29)

**What I asked for**
- After the card list build showed Vercel running Node 26.13.0, I asked whether Node needed updating and then found the Node setting in Vercel. My screenshot showed the project setting already at 24.x and the Production Overrides box at 26.x, greyed out. I asked whether to change the setting to 26.x. Claude said no, and I told it to fix and push the change.

**What changed**
- `package.json`: `engines.node` is `24.x` instead of `^20.19.0 || >=22.12.0`. Vercel's docs say `engines` overrides the project setting, which is why a range that allowed any newer major gave 26 while the setting said 24. The Firebase packages I have installed (`@firebase/app`, `@firebase/auth`) declare Node 24.12 or newer, Vite needs 20.19 or 22.12 or newer, and my machine runs 24.14.1, so 24.x matches all three.

**What I checked**
- The build runs on my Node 24.14.1 with no engine warnings. The deploy result is below once I have read it from the live site.

**Decisions**
- I left the Vercel dropdown at 24.x and changed only `package.json`. The deploy is the proof of whether the pin took effect.

## 56. The deck import page, version 1 (2026-10-29)

**What I asked for**
- I said the plan for the next step sounded good (Claude had not written it yet, so it wrote it out: the page's flow, what is left out, the checks and the costs, with four defaults: one saved deck, the URL `/deck`, no Scryfall lookup yet, a plain dropdown for the commander). Then I told it to go on with the deck import plan, and to fix and push the Node setting.

**What changed**
- `shared/deck-preview.mjs` (new): what the page shows and saves: repeated lines merged, sections, problems first, the commander guess in the order the notes decided, a Commander deck detected by a marked commander or a size of 98 to 102, the deck saved in the browser with a version, and a strict reader for what comes back out of storage (it returns a clean copy and refuses anything wrong).
- `frontend/pages/deck/` (new page, `/deck`), the shared stylesheet, `vite.config.js`, `vercel.json` and a link from the lobby. The page is 6 KB gzipped and has no Firebase. `shared/player-name.mjs` gained a small exported cleaning helper for the deck name (no behavior change; its 67 checks still pass).
- `scripts/test-deck-preview.mjs` (172 checks), `scripts/check-deck-ui.mjs` (71 checks in real Chrome against the real card list), and 3 new checks in `scripts/check-deploy-config.mjs` (49) that `/deck` is served.
- Node: `engines` is pinned to `24.x` (entry 55).

**What I checked**
- The Node pin worked: after the deploy the live site's build info said Node v24.22.2. That deploy rebuilt the card list ("no usable cached list") instead of reusing it, with the same list and the same Scryfall file; my reading is that Vercel's build cache is tied to the build settings, so changing the Node version started a new cache. It cost one extra download; I will see on the next deploy whether it goes back to reusing.
- The three real exports all match completely and guess Eowyn as the commander ("legendary" for two, "after a blank line" for the plain Moxfield one). In real Chrome the page and the 34,172-card list were ready in about 1.2 seconds on this machine, a card list that cannot load shows a message and a Try again button, blocked storage does not break the page, pasted markup is shown as text and never runs, and nothing was requested from any other site. I looked at desktop screenshots in dark and light mode.
- Broken copies: 85 of 92 fail the logic tests. The first run had 14 survivors; 7 were tests that passed for the wrong reason (for example my "bad field" tests edited the commander card, so the reader refused the deck for a different reason), now fixed, and 7 are redundant checks that sit next to a stricter one (kept as extra guards).
- Not checked: phones (on hold), a real long Commander deck exported from a site (my real exports are the 18-card test deck), and how the page behaves with a very slow connection.

**Decisions**
- The four defaults above. One saved deck for now, and no card images or Scryfall lookup in version one (images cost player bandwidth and need a policy change; the lookup needs rate-limit code). Names newer than the card list show as not found, and the list refreshes weekly.
- An ambiguous name or a "did you mean" is the player's choice, never decided by the page, and the commander is a labeled guess the player confirms.

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
- **Misread my answer (after entry 11):** Claude asked whether to compare Scryfall's files "in a few days". I answered that it should happen when we're working on something, not after a wait. Claude read that as a new design question and started researching a different way to refresh card data (one Scryfall API call and two header requests, no file changes). I pointed out it was an answer, and the comparison is now a todo item for our next card-data session. I then asked for the list of things still unknown to be kept somewhere Claude will surely check. It is now a table in `CLAUDE.md`, the only file every session loads, with an event that makes each row due.
- **Old tests that asserted the old design, and a test that wanted one event (Claude's slips, entry 46):** the rule test "member reads activity" was written as "denied" when I first locked the database down, so when I opened that read on purpose it failed and I had to flip it knowingly. A watcher test expected exactly one change when a heartbeat is written, but the Firebase SDK reports its own estimate of the server time first and the confirmed value a moment later; I changed the check to "moved forward, never backward". I also edited `index.html`'s heading before noticing, in a tool message, that you had changed it to "(BETA)" and that two of my checks depended on the exact text.
- **A check that assumed my stand-in was the real thing (Claude's slip, entry 45):** the first run against the live site failed one check because it demanded a 404 for a path-traversal attempt and real Vercel answers 400. The site was fine (nothing was served); my expectation copied my stand-in's behaviour. I changed it to accept either and added the repository-file probes. I had also called the earlier headers "verified" while they were only checked against my stand-in; the live GETs are what verified them.
- **A new check whose own test was wrong, and a first policy choice that could have broken sign-in (Claude's slips, entry 44):** the site check first failed with "the check script itself ran without an error" because I had asked Chrome to read the code box on a page that correctly does not exist (`/lobby/ABC234/extra` is a 404); the expectation was wrong, not the site. My first draft of the referrer policy was `no-referrer`, which would have removed the website from requests to Google, and I changed it before it shipped because a website-restricted API key would then fail sign-in. I also tried to read a task output path directly and the sandbox refused it, so I asked a narrower question instead.
- **I let three pushes go out that I knew could not deploy (Claude's slip, entry 43):** `CLAUDE.md` and the todo both said the Vercel project existed but "nothing builds yet", and the todo listed the five Vercel settings as "before any real deploy". Once the Vite build was in the repo and Vercel was importing `main`, every push was going to fail, and I never told Kevin to expect that or to add the settings. He found it from the red crosses on GitHub.
- **The editing tool turned my escapes into invisible characters, again, and my mutation tests hid a gap (Claude's slips, entry 47):** I wrote `backslash-u-200B`-style escapes in the new name cleaner and its test, and the tool saved the actual invisible characters, so the file that deals with invisible characters could not be read; the same happened in a comment in the guard I then wrote. I rewrote both so they are plain ASCII, built from numbers, and added the guard that scans for it. I also made a mess of a throwaway test file (a nonsense placeholder) before rewriting it, tested my guard with a file name that `.gitignore` hides from it (every case "missed" until I used a different name), and, when I tightened the seat rule, rewrote the seat tests so each guard was refused for a different reason than the one it was meant to test; the mutation run found 14 survivors that showed it. Finally I edited the emulator tests and the code they test while the earlier mutation run was going, which produced one false "suspicious" result; re-running that one mutation showed it was still redundant.
- **My own tests tripped my own new rule, twice (Claude's slips, entry 42):** I flipped an old "the host cannot change" check in place, so a later check that still expected Alice to be host failed; and a case that left Bob hosting a live table made my own rule (no hand-over to someone who hosts another table) refuse the next case. Both were test-order mistakes, not rule bugs, and I fixed them by giving each case its own table and clearing the slot. A mutation was also written with the wrong text and "did not apply", and the first version of the flow test printed its coverage warning before the disagreement that caused it, which made two real catches look like coverage problems; it now prints disagreements first.
- **A stale test I did not re-run, and a result I nearly misread (Claude's slips, entry 41):** after changing the rules I re-ran the rule tests and the flow comparison but not `test-table-ops.mjs`, which still asserted the old behaviour (a dropped player cannot come back). It only showed up because the full mutation run reported 19 "suspicious" results: those mutations are the ones I had documented as redundant, and the failing file was this stale test, which made every one of them fail for a reason unrelated to the mutation. I fixed the test and re-ran those 19 one at a time: all equivalent, none survived. Also, my first generator for the new behaviour made players return so fast that no match ever ended with a reserved seat, which the coverage guard caught; and one command had a PowerShell syntax error, so a re-run silently did nothing until I looked at the output.
- **A comparison that agreed with itself (Claude's slip, entry 40):** my first run of the game-flow comparison reported 1,677 of 1,677 steps agreeing, which looked like a good result. The coverage numbers I added showed that no table ever reached "playing" and "start" was never allowed: random moves cannot satisfy "everyone ready, then host starts" often enough. So it had tested only the lobby. I also wrote a label for the one known finding that would have hidden a different bug (a seat not freed after a lobby leave), and tightened it to count only seats left by someone who left mid-match. Both were caught by looking at what the run covered, not by the result.
- **A page that could not replace an old table that was already gone (Claude's slip, entry 39):** `createTable` always asked the database to delete the host's previous table in the same write. If that table had already expired and been cleaned up, the rules refuse the delete, so every attempt failed. I wrote the rules test for this case without the delete, so it passed, and nothing tested the page's own code until the new test ran it. Two smaller slips in that test: the helper I used to read with the rules switched off returns nothing (the emulator library throws away what its callback returns), and a code generator I wrote ran out of codes. Both were my test's fault and are fixed.
- **A feature that never worked and a test that never noticed (Claude's slips, entry 38):** the popup you asked for ("you already have a table, making a new one closes it") never appeared. I wrote the check to read the whole table, which my own rules refuse for everyone on purpose, so it always concluded you had no table; and my spike passed anyway because it only checked that a second table replaced the first, never that a warning was shown. Separately, the page could create two anonymous accounts when two parts asked who you were at once, and it showed raw SDK text offline. All three were found by checks against the real project, not by the 307 rule tests. I also mishandled the commit twice (PowerShell passed my message as arguments, then wrote a byte-order mark), and only one of the three expectations I tried to flip in a throwaway test copy actually applied, which I noticed and reported.
- **A bug in the page that only a real browser could find (Claude's slip, entry 37):** I assumed the Firebase SDK words a refused request one way. It words a refused write "PERMISSION_DENIED" and a refused read "Permission denied" (a space, no code), and my check looked only for the first. So the normal answer to "am I already at this table?" for a newcomer was treated as a crash, and joining and replacing a table failed. All 307 rule tests passed the whole time, because they test the rules and not the page. I also wrote a test with a race in it (it read Bob's list in the same instant his page appeared), and I had claimed my script cleaned up after itself without checking; both are fixed.
- **A recommendation that did not fit the goal, and a test that tested nothing (Claude's slips, entry 35):** I recommended loading the Firebase SDK from a CDN because it needs no build step, which suited a class project. When Kevin said this will grow into something much bigger, I had to reverse it. Separately, my first test of "a missing setting fails the build" passed for the wrong reason: PowerShell removes a variable you set to an empty string, so the setting came from the real settings file and the build succeeded. I redid it in a throwaway folder. And the number checks on the phone layout all passed while the dropdown text was visibly clipped; only looking at the screenshot caught it.
- **A concede flag that could be deleted (Claude's slip, entry 33, found while redesigning it):** the first version of `conceded` had a rule saying it could not be taken back mid-match, but that rule only ran when the value was written, and deleting the field is not a write that rule sees, so a player could have deleted their own concession. I found it by reading the rule while building the counter, not by a test, so I cannot show that it was exploitable; the new version blocks it and has tests for deleting and for rewriting the whole entry. Same lesson as entry 30: a validate rule does not run on a delete.
- **My mutation counts were inflated by a flaky test, and I broke the rules file while stopping a run (Claude's slips, entry 32):** a test sent the exact current time as "a client time", and about 1 run in 3 it matched the emulator's clock to the millisecond and was correctly accepted, failing the suite. My mutation script counts any such failure as the rules catching a mutation, so earlier kill counts (including the 113 in entry 31) may be a little high. I found it only because one mutation was killed once and survived later. Fixed (a time 5 seconds in the past), and kills now print the check that caught them. Separately, when I stopped a mutation run to fix the windows, killing it skipped its restore step and left one deliberately broken rule in my rules file. I rebuilt the file from my own record and diffed it against the broken copy (exactly one rule differed, the mutation in progress), and the script now keeps a backup and repairs itself on the next start. I also spent several turns calling the cmd windows "hidden" before finding that the emulator launcher, not my script, opened them.
- **Tests that looked complete but covered only some copies of a rule (Claude's slip, entry 31, found by the mutation run):** the four seat rules are separate copies, and I tested each guard on only the seat numbers that were convenient. 42 of 122 mutations survived the first run, nearly all "this guard on seat 1 or 4". A test passing on seat 3 says nothing about seat 4. Fixed with loop tests over every seat. Also my first run of the new tests exited 1 once with no output saved and I could not find out why.
- **Forgot that validate rules don't run on deletes (Claude's slip, entry 30, found by Kevin's question):** I made sure `meta` and `lastActive` were well-formed when written, but never forbade deleting them. The host could delete `meta` and leave a table nobody could delete, with the code open to a takeover, or delete `lastActive` to skip the heartbeat cap. A probe found it; fixed and tested.
- **Overstated a risk and used a confusing word (Claude's slips, entry 29, caught by Kevin's questions):** I wrote that "stored decks add up toward the 1 GB limit". Kevin asked what decks, since decks live in the browser. The database holds only the running game's zones (library order, hand, sideboard), and my own data-model draft also listed "the deck list" there, which conflicts with that rule. My size worry was a guess with no measurement (a few tens of KB per table, so tens of thousands of tables per GB), and the real cost of an abandoned table is privacy, not space. I corrected `docs/todo.md` and `docs/live-play.md`.
- **Tests that passed for the wrong reason, and a rule-order trap (Claude's slips, entry 28):** my "host changes createdAt" test used a client time, which two rules denied, so the real danger (a host resetting it to the server time to extend the 8-hour limit) was untested until the mutation run showed it. My member rule also checked "alive" before "host is creating", and the error on a table with no `meta` denied the host's own creation. And I said the cleanup query was fine in the plan without noticing it needs a read rule that leaks every table.
- **Rules too strict, and stale docs (Claude's slips, entry 27, found in the review):** the first member rule was create-only, which would have blocked changing a name, readying up and leaving. The tests had even asserted that block, so they passed while checking the wrong behavior. Also `backend/README.md` still said the backend was empty and unchosen, and `CLAUDE.md` still said there was no `package.json`. Both are fixed.
- **Left processes running and swallowed a test result (Claude's slip, entry 27):** my first mutation check filtered the test output so hard that it showed nothing, so it proved nothing. I redid it with the exit code. Each `npm test` also leaves the emulator's Java process listening on port 9000 on this machine, which made one later run fail with "port taken". I checked the command line (the emulator jar from my `firebase.json`) and stopped only those processes. The leftover process still has to be dealt with in the test script.
- **Made-up conclusions about the exports (Claude's slip, entry 13, corrected in entry 14):** it said the commander had "no marker" and the Archidekt sideboard was "unknown". Kevin pointed out that commanders are marked by position on Moxfield (top in "Copy for Moxfield", bottom in plain text) and that the Archidekt text is the literal export. It also expected a link test to need three deck links from Kevin, but one public link was enough to learn most of it.
- **A request I should have asked about first (Claude's slip, entry 13):** it sent a script's request to Archidekt's API (the package's example deck) before reading Archidekt's terms, which say scripts must not make automated requests. It was one request and returned 404, then one more on Kevin's deck, but the terms should have been read first.
- **Invisible characters in the first parser (Claude's slip, entry 15):** the `﻿` and ` ` escapes in `shared/deck-text.mjs` were saved as real, invisible characters inside the regexes. It worked, but nobody could read or safely edit that line, and my first mutation check couldn't find the text to change, which exposed it. I rewrote the file, and noticed JavaScript's `\s` already covers both, so those two replace calls were removed. A search now shows the only non-ASCII characters are the intended ones.
- **Wrong expected line number in the first test (Claude's slip, entry 15):** I wrote line 11 for Lightning Bolt, but it is line 12 (9 cards, a blank line, then `SIDEBOARD:` on 11). I recounted by hand and fixed the test, not the parser.
- **A typed Commander line swallowed the deck (Claude's slip, entry 15, found in entry 16):** the first parser let a `Commander` header cover every card below it, so typing it above one card made the rest of the list commanders, and a correct paste left the 99 cards `unlabeled`. I only noticed when I tested the idea of typing it into a pasted list. It is fixed and tested.
- **A claim from memory, checked afterwards (Claude, entry 25):** I told Kevin the Firebase config values "aren't passwords" without having read it. When he pasted them in a screenshot I checked Firebase's page, and it says what I had said, but I should have read it before saying it. Also, my first search for Firebase code in the repo was denied because I named `.env` in an `ls`; that was the deny rule working, and I redid it with the search tools.
- **An ambiguous phrase and a missing notice (Claude's slip, entry 22, found in entry 23):** "the last 5 minutes" didn't say which limit it meant, and when I looked, the 8-hour limit had no warning at all, so an active game would have been cut off without notice. Both are fixed in the docs.
- **Overstated an objection (Claude's slip, entry 21, found in entry 22):** I advised against a shorter "everyone left" timer because it "needs presence tracking and a refresh would look like leaving". Presence is a documented Firebase pattern that stores one entry per tab, which makes a refresh harmless. Skipping the extra timer is still reasonable, but the reason was weaker than I made it sound.
- **A rule function that doesn't exist (Claude's slip, entry 19, found in entry 21):** the plan limited seats by counting members with `numChildren()`. I had listed that as "not verified", and when I checked Firebase's rules reference it isn't there. Seats are create-only slots now. It was caught before any code depended on it.
- **A check that couldn't find anything (Claude's slip, entry 21):** my first search of the Firebase docs for these rule functions reported every word "not found", even one on a page that is all about it. The search itself was broken, so I redid it with plain string search and printed counts before trusting any result.
- **Over-weighted the pause risk (Claude's slip, entry 19, found in entry 20):** I called Supabase's 7-day pause a "demo-day risk" in the plan. A request every few days during the term prevents it, so it is a chore to remember, not a reason to rule Supabase out. The decision still holds on other grounds, but the argument was stronger than the facts.
- **A claim about Vercel I never checked (Claude's slip, entries 3 and 5, found in entry 19):** I wrote in `CLAUDE.md` and in the design notes that Vercel's functions probably can't hold live connections, and told me to check it later. When I finally read Vercel's docs, they do (public beta). It cost nothing, because I had marked it "unverified", but it shaped how I framed the question for weeks.
- **An untested line and a blind check (Claude's slip, entry 18):** the first matcher tests passed straight away, so Claude broke the matcher on purpose. One broken copy survived: the lowercase `æ` mapping had no test. Later the data check could not see broken accent handling, because it normalized both sides the same way, so any consistent mistake cancelled out. Both were fixed with new checks (a lowercase `æ` test, and typed spellings built without the module's own code).
- **A bug that reading could not find (Claude's slip, entry 48):** I asked about two tabs, and Claude's first answer from reading the rules was that nothing could go wrong. Running two tabs on a fresh profile showed they became two different players. I should have tested it before saying so.
- **Screenshots that showed nothing (Claude's slip, entry 49):** the first presence screenshots were cut off above the player list, so they proved only that the page had loaded. The check passed because the text was in the page, not because anyone could see it. Fixed by scrolling the list into view before the screenshot.
- **A shell quote that ate code (Claude's slip, entry 49):** Claude put backticks inside a double-quoted shell command while writing a test, and the shell silently deleted the text. It repaired the file with the editing tool; the exact thing the shared notes warn about.
- **Tests that could only pass for the wrong reason (Claude's slips, entry 50):** a takeover test named a player who was not a member, so the rule refused it for that reason and not the one being tested, and another test ordered its steps so an earlier step left a host slot behind. The mutation run exposed the first (4 survivors); I fixed the tests and documented the rest as redundant.
- **Bugs only the browser run found (Claude's slips, entry 56):** the commander list sorted "Eowyn" last because it compared raw character codes (it now sorts for people to read), and the "save without the lines" option said "1 line that were not matched" because it chose was or were by card quantity instead of line count. Claude also first wrote an arithmetic error into a test (it expected 9 cards where 5 + 2 + 1 is 8), and the broken-copy run showed 7 tests passing for the wrong reason before they were fixed. Claude also told me the plan sounded good before having written it, then wrote it out when I answered that way; it should have said at once that the plan had not been shown.
- **Waited on a tool that was not there (Claude's slip, entry 54):** to watch the deploy Claude polled with the GitHub command line tool `gh` in a loop, but `gh` is not installed here, so it spent about five minutes waiting on repeated errors. It should have checked the tool exists first; GitHub's public web API gave the deploy status immediately. Claude also relied on Vercel's docs summary for the Node version (24.x default) and the real build used Node 26.13.0, so the docs were not what the build showed.
- **A cache folder that depended on an unchecked variable (Claude's slip, entry 53):** the first version chose where to keep the list from Vercel's `VERCEL` variable. The docs say system variables are exposed only when a setting is on, so a missing one would have silently moved the cache and cost a 100 MB download on every deploy. Claude noticed this while reviewing its own design and changed it to one folder everywhere. The same entry also had Claude put backticks inside a double-quoted shell command again (the exact mistake the shared notes warn about); the command failed before writing anything, and the edits were redone with the editing tool.
- **Tests that passed without testing (Claude's slip, entry 53):** the first 105 download tests passed on the first run, and the broken-copy run showed 11 of the 54 broken copies survived: some checks rejected a bad record for a second reason, and no test made the server stop answering mid-build. Fixed, 52 of 54 now fail them.
- **Tests that tested themselves (Claude's slip, entry 52):** three of Claude's first card list tests looped over the library's own list of excluded layouts, so deleting a layout from the library also deleted it from the test. The broken-copy run showed it; the layouts are written out in the test now. Claude's PowerShell edit of `scripts/test-all.mjs` also left one Windows line ending in a file with plain ones; Claude noticed it in the diff and fixed it.
- **Mutation checks that checked nothing (Claude's slip, entry 15):** three of my first ten broken copies didn't change the file because of shell quoting, so they proved nothing. I redid them in Node with exact text swaps. The first run also exposed two weak spots (only `\r\n` line ends and runs of spaces were not tested), which got new tests.

---

## Decisions and abandoned ideas

- Not building a full rules engine or an AI opponent in the first plan. They can come back after the requirements are expanded.
- Moved the deck builder to a stretch goal (entry 4). Importing a decklist as text comes first.
- No user accounts (entry 4). Players pick a name in each lobby.
- Skipped Forge's rules engine for now (entry 5). Casual mode only, where players manage their own cards.
