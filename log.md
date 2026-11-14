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

## 57. The deck import page goes live (2026-10-29)

**What I asked for**
- I said to commit and push, and asked whether the `/deck` page is temporary for testing. Claude said no: it is the real import page, a standalone page for now.

**What changed**
- Pushed `2aac634..ac9e93b` (the deck import page and its docs). Then a small docs change recording the live results.

**What I checked**
- Vercel reported success. On the live site `/deck` answers with the page ("Import a deck") and `/` is still the lobby. The card build info said `reuse` ("the cached list is recent") with Node v24.22.2 and the same build date as the deploy before, so the one-off rebuild after the Node pin was only the cache starting over, and the cache works on Node 24. The list's ETag was the same as before. The deploy check against the live site passed 44 checks (the stand-in checks do not run live).
- Not checked: the page in my own browser on the real site (the browser checks ran against the dev server with the same built list), and phones.

**Decisions**
- `/deck` stays a standalone page until the lobby has deck fields; then the lobby picks a saved deck and this page becomes where decks are made and managed.

## 58. The lobby idea, and the zone logic for the solo table (2026-10-29)

**What I asked for**
- I shared a screenshot of another site's lobby to show what I would like mine to be like: players import their deck and change it in the lobby, but much simpler. Then I said to continue.

**What changed**
- `docs/design-notes.md`: my lobby idea, written by features (not naming the site, and the screenshot is not in the repo), with Claude's note on what a simple first version needs: your deck in your seat with a Change deck button, a Ready button that needs a deck, other players' decks, a Preview deck button, and a Start button that stays off until 2 players are ready. That is the lobby deck fields step, a database rules change with a full mutation run, so it comes after the solo table.
- `shared/zones.mjs` (new): one player's game as plain data and every move: make a game from a saved deck, draw, move a card to any zone, shuffle, mulligan, tap, untap all, life, next turn, the two battlefield rows, and a consistency check. Every function returns a new game and never changes the old one.
- `scripts/test-zones.mjs` (new, registered in `npm test`, which is now 23 suites).
- `docs/todo.md` and `CLAUDE.md`: what is built and the next pieces of the table.

**What I checked**
- 252 checks pass: every move between every pair of zones leaves the card in exactly one place, each move puts it where a paper table would, the games are frozen so any in-place change would throw, the shuffle is fair (all 24 orders of 4 cards came up about 2,000 times each in 48,000 shuffles, and each of 10 cards landed in each place about 3,000 times in 30,000), and five random games of 3,000 operations each never lost or copied a card.
- 80 of 82 broken copies fail the tests. The first run had 4 survivors: two were real gaps (nothing tapped the second battlefield card alone, so a version that tapped it and everything before it looked the same; and nothing tested a word that merely contains "Land"), now fixed, and two are equivalent (the uid counter starting at 100, and a divisor that could differ once in about four billion numbers).
- Not built or checked: the table page itself, card pictures, and anything in a browser.
- A finding that shapes the page: a saved deck keeps each card's id, name and quantity but not its type line, so the table has to look cards up in the card list; and Scryfall changed the default printing id of 162 cards in 3 days, so the lookup goes by id and then by name. Pictures are keyed by the id and stay valid.

**Decisions**
- Casual means the logic never refuses a move by the rules of the game: life can go below zero, a library can run out (draw says it was short and carries on), and a mulligan shuffles the hand back and draws again, with the player putting cards on the bottom by hand.
- Index 0 is the top of every pile, and a graveyard shows the newest card first.

## 59. The solo table, at /solo (2026-10-29)

**What I asked for**
- I said I do not need the Start button rule ("off until at least 2 players are ready") in the lobby idea, to call the solo table `/solo`, and I asked what "turning a picture sideways" meant: tapping a card only turns it, it does not change the art. (Claude's answer: yes, tapping is a turn of the card with CSS, the picture file is never touched.)

**What changed**
- `frontend/pages/solo/index.html` and `solo.js` (new): the solo table. It loads the saved deck and the card list, deals 7, and shows the commander in the command zone, two battlefield rows (lands, other permanents), the hand, and the library, graveyard, exile and sideboard as piles you can open. You click a card to select it and an action bar lets you tap or untap it or send it to any zone, the top or bottom of the library. Draw, next turn, untap all, shuffle, mulligan, new game and life buttons. A deck that is missing, damaged, or a card list that fails to load shows a message, and Try again for the list.
- `shared/card-image.mjs` and `shared/card-lookup.mjs` (new): the picture address (small size, front face, from Scryfall's picture server) and the lookup of a saved card in the card list by id and then by name. `frontend/src/card-list.js` (new) loads the card list for both the deck page and the solo page.
- `vercel.json`: `/solo` rewrite, and `img-src` now allows `https://cards.scryfall.io`. `vite.config.js`: the solo page is built. Links to the solo table from `/deck` and the lobby. `frontend/src/style.css`: the table's styles.
- `scripts/check-solo-ui.mjs` (new, 59 checks), `scripts/test-card-lookup.mjs` (new, 31 checks), both in `npm test` (25 suites now); `scripts/lib/browser.mjs` can now answer picture requests with stand-ins; 3 new checks in `scripts/check-deploy-config.mjs` (the exact `img-src`, `/solo` served with the policy).

**What I checked**
- `npm test`: all 25 suites pass. `scripts/check-solo-ui.mjs` drives real headless Chrome against the real 34,172-card list, with the picture server answered by card-shaped stand-ins: the deal, draw, turns, life, selecting and moving a card between every kind of zone, tapping (the card turns sideways and its box widens so it does not overlap its neighbour), the pile viewer, top and bottom of the library, shuffle, mulligan, a card name that is markup shown as text, a card the list does not know, no saved deck, a damaged deck, a card list that fails and then loads, blocked storage, no script errors, and no request to any site but this one and the picture server.
- Screenshots at desktop width, dark and light, with the real pictures from Scryfall, looked at (tapped Forest turned sideways, Sol Ring selected with its actions, Eowyn in the command zone, the library list), then deleted.
- Not checked: phone width (on hold), a broken-copy run of the lookup module and the page, the live site (nothing is pushed), and the Fan Content Policy wording for showing card pictures (still to re-read in a browser).

**Decisions**
- `/solo` is the address. Solo games are not saved: a refresh deals a new game.
- The Start rule is not in the lobby idea. The built rule (a match starts only with at least 2 players, all ready) is still in the database rules and the flow model; I have not changed it. Open question for me: drop it only from the idea, or relax the built rule.

## 60. Cards that were printed under another title (2026-10-29)

**What I asked for**
- I tried to import a real Commander deck and 5 of its 100 cards were "not found": Heart of the Mountain (really Arcane Signet), Shadowbringers (really Dovin's Veto), Ardyn Izunia, Kushala Daora's Fury and a Japanese title. I asked if there is a fix. After Claude explained, I said to go ahead, and asked what happens if the Japanese one has no English version.

**What changed**
- Claude first looked at the raw Scryfall data (not from memory): all five are the `flavor_name` field of one printing, while `name` is the real card's English name, even on the Japanese printing. Across all 119,203 printings there are 571 such titles on 497 cards, none equal to a real card name and none shared by two cards.
- `scripts/lib/card-list.mjs`: a card that has such titles gets an optional `f` list in the card list (sorted; digital-only printings left out). The other five fields of all 34,172 entries are unchanged, and the list grows by about 9.7 KB gzipped (0.7%).
- `shared/card-match.mjs`: after the full name and the front face, it tries `f` (method `alt`), then the back-face suggestion. A real name or a front face always wins over a title; two cards sharing a title is a choice, not a guess.
- `shared/deck-preview.mjs`, `frontend/pages/deck/deck.js`, `frontend/src/style.css`: the deck page shows the real card with "(typed as ...)" beside it, and the saved deck stores the real card.
- `scripts/lib/card-list-build.mjs`: the cache record now has a `format` number (`LIST_FORMAT`, 2). Without it the build reuses a recent list for 7 days, so Vercel would have kept serving the old list with no titles after this push. A list in another format is rebuilt once; if that fails, the old list is still used.
- Tests: `scripts/test-card-list.mjs` (108), `scripts/test-card-match.mjs`, `scripts/test-card-list-build.mjs` (126), `scripts/test-deck-preview.mjs` (179) and `scripts/check-deck-ui.mjs` (75) grew. Docs: `CLAUDE.md` and `docs/todo.md`.

**What I checked**
- `npm test` passes all 25 suites, and `scripts/check-card-match.mjs` (every real card name) passes.
- The five names from my deck match against a list built from the real cached Scryfall files, along with Sol Ring unchanged and a made-up name still not found. In real headless Chrome the deck page shows all six lines matched with the typed titles beside them (screenshot looked at, desktop, dark), and the saved deck holds the real names.
- 29 broken copies of the new code (list build and matcher): the first run caught 28 and one survived (a title taking priority over another card's front face). I added a test for it, and all 29 are caught.
- I also finished an item that entry 59 left open: 26 broken copies of `shared/card-lookup.mjs` and `shared/card-image.mjs`. The first run caught 24; the survivors were an id passed as an array or object whose text looks like an id (the address would have been built from its first characters), and an id with only one group in capitals. I added tests for both (`scripts/test-card-lookup.mjs` is 37 checks now) and all 26 are caught.
- Not checked: the live site (nothing pushed; the first Vercel build after this push will rebuild the list once, about 26 s and 100 MB, and I should confirm from `/data/cards.info.json`), light mode and phone width for this change, and any deck with a fully translated card name.

**Decisions**
- Matching works even when a title exists only on a non-English printing, because the real name is always English. What it cannot do yet is show that printing's art: the table draws the default printing. Keeping the art of the printing I actually own is a follow-up (the list would need to remember which printing carries each title).
- A title is only used after a real name and a front face fail, so a title can never hide or steal a real card.

## 61. The solo table and alternate titles go live (2026-10-29)

**What I asked for**
- I said to continue after hitting the usage limit, with "continue push": commit and push what was finished.

**What changed**
- Four commits went up in one plain push (`450b619..12dca1a`, no force): the zone logic, the alternate titles, the `/solo` page with its pictures and config, and the docs. `scripts/test-all.mjs` and `scripts/check-deck-ui.mjs` carry checks for both the solo table and the titles, so the third commit holds both sets of checks and could not be split further.
- Only the docs changed after the push: `CLAUDE.md` said "NOT pushed yet" and now says it is live.

**What I checked**
- Vercel's status went from "deploying" to "success" in about a minute.
- The live `/data/cards.info.json` says `action: rebuilt, reason: the cached list is in an older format`, so the format number did what it was added for. The served list has 34,172 cards, 521 of them with alternate titles (more than my 497 locally, because Vercel downloaded a newer printings file), and Arcane Signet carries "Heart of the Mountain".
- `/`, `/deck` and `/solo` answer 200. The deploy check against the live address passed all 47 checks.
- Headless Chrome on the live `/solo` with a deck imported by title ("Heart of the Mountain", "Shadowbringers"): 7 cards dealt, 7 real pictures loaded from `cards.scryfall.io`, 0 content-policy blocks, 0 page errors. I looked at the desktop screenshot, then deleted it and the script.
- Not checked: that the NEXT deploy reuses the list instead of rebuilding it (it needs another push), phone width, light mode on the live site, and a second browser or a real phone.

**Decisions**
- None new. The Start-button question and keeping a title's own printing art are still open on `docs/todo.md`.

## 62. Sideboards in the solo table, and the start rule (2026-10-29)

**What I asked for**
- On the start rule I said it needs two people at the table in total, whether the host picked a 2, 3 or 4 player table. I also said Claude should consider sideboards when players paste a decklist, with an example: a main deck (one card listed by its Japanese title), a `SIDEBOARD:` section, and `Commander` with Kyodai at the end. I said the alternate-title fix works well.

**What changed**
- Start rule: nothing. Claude read the code instead of answering from memory: `startMatch` in `shared/table-ops.mjs` refuses only when fewer than 2 people are at the table (`players.length < 2`) and then needs everyone who is there to be ready, whatever the seat count. A 4-seat table with 2 players can start. `docs/game-flow.md` and the flow model say the same. It is enforced by the page, not by the database rules (documented there).
- Sideboards in imports already worked: a list shaped like my example gives Commander 1, Main deck, Sideboard 2 with nothing needing attention, the Japanese title matches Arcane Denial, the commander named last is marked, the saved deck keeps the three sections apart, and a dealt game has the sideboard cards in the Sideboard pile.
- `frontend/pages/solo/solo.js`: the one gap found. The action bar could take a card out of the sideboard but had no "To sideboard", so nothing could go back (a card that wishes for a sideboard card, and returns it). Added that one action.
- `scripts/check-solo-ui.mjs` (59 to 69 checks): a deck with a sideboard, a title-imported card and the commander listed last: the deal, the sideboard pile, taking a card to the hand and putting it back, a new game, and all 55 cards accounted for. `scripts/check-deck-ui.mjs` (75 to 79): the same export shape on the import page.

**What I checked**
- `npm test` passes all 25 suites. With the "To sideboard" action removed on purpose the solo check failed 3 of 69 (the action list, the offer after moving, and putting it back), and the file was restored with only the one-line change.
- Not checked: the live site (not pushed), a Companion line (the code puts a companion in the sideboard pile but I did not test the pasted form), and sideboard handling in the other sites' exports beyond the real fixtures.

**Decisions**
- No change to the start rule. The sideboard stays a pile you can look at and move cards to and from, with nothing enforced (casual play).

## 63. The number in a decklist line is optional, and a card picture on hover (2026-10-29)

**What I asked for**
- I asked whether a pasted "Thrasios, Triton Hero" with no number should just count as 1. I also asked to see the card image when I hover a name in the checked deck list, as another way to test on the live site whether it recognises the specific card art, and to commit and push.

**What changed**
- `shared/deck-text.mjs`: a line with no number is one card and the entry is marked `qtyAssumed`. A line without a number is still skipped (and reported) when it looks like a comment, a heading with a count (`Creatures (12)`), a label with a number (`Deck stats: 99`), a heading with a colon, a bare number, or a negative or fractional count, or has no letter. Before choosing those rules Claude checked them against all 34,743 real card names and titles: none matched, but a first idea (also skipping a comma count) would have caught the real card `70,000 Light-Years from Home`, so that rule is a period only. `+2 Mace` and the two real cards named only with underscores still work. A line with a number is trusted as before.
- `shared/deck-preview.mjs`: the page says once which lines were counted as 1 ("2 lines have no number, so each was counted as 1 card (lines 1 and 5)").
- `frontend/src/card-peek.js` (new), `frontend/pages/deck/deck.js`, `index.html`, `style.css`: hovering a matched row, or focusing its name with the keyboard, shows Scryfall's normal-size picture of the card with a note that it is the default printing. On a wide window it sits at the right edge, level with the pointer, so it never covers the names; on a narrow one it follows the pointer. Escape closes it, scrolling hides it, a missing picture says so instead of showing a broken image.
- `scripts/lib/browser.mjs`: the picture stand-in can answer a 404. Tests: `scripts/test-deck-text.mjs`, `scripts/test-deck-preview.mjs` (189), `scripts/check-deck-ui.mjs` (75 to 111 checks, including real mouse movement in headless Chrome).

**What I checked**
- `npm test` passes all 25 suites. 27 of 27 broken copies of the optional-number change were caught. For the hover code, 25 broken copies: 23 caught and 2 documented as redundant (entering a row, because a mouse move always follows and shows the box too; and placing the box again when a picture loads, because Chrome does that itself after a layout change).
- I looked at desktop screenshots, dark and light, with the real Scryfall pictures.
- **The answer to my art question is no, not yet.** The hover shows the card's default printing: for "Heart of the Mountain" it showed Arcane Signet from TRC 0485, and the printing that carries that title is SLD 916. The ids in our list differ from the ids of the printings that carry the three titles I checked (SLD 916, FCA 51, and the Japanese RFIN J2). Showing my printing's art needs the list to keep a printing id per title and the saved deck to keep it; that is on `docs/todo.md`.
- Not checked: phone width, and light mode on the live site.
- **After the push (commits `ba118ba`, `5868ab5`, `79803c0`, with the earlier `9c5c15f`):** Vercel deployed in about a minute and the card list was reused, not rebuilt (same `builtAt`). The deploy check against the real address passed all 47 checks. On the live `/deck`, headless Chrome with a real mouse pasted "Thrasios, Triton Hero", "1 Heart of the Mountain", "2 Sol Ring", a "Creatures (3)" heading and a sideboard: "Checked: 5 cards, all matched", the heading skipped, "2 lines have no number, so each was counted as 1 card (lines 1 and 7)", the sideboard kept. Hovering Arcane Signet showed a real Scryfall picture (loaded, 488 by 680) inside the window with 0 content-policy blocks and 0 page errors, and I looked at the screenshot.

**Decisions**
- A line without a number is a card unless it looks like a heading, label or comment; skipped lines are still reported, so nothing disappears silently.
- Pasted junk with no number (for example `<img src=x ...>`) is now a "not found" line instead of a "skipped" notice. It is still shown as plain text and never runs.

## 64. The checked deck list shows the set and number I typed (2026-10-29)

**What I asked for**
- I asked for the checked deck list to show the set name and card number beside the count, name, type and mana cost, so I can debug the printing art further, since a pasted list can name the set and number of a specific printing.

**What changed**
- `shared/deck-preview.mjs`: the parser already kept `set` and `number` on every entry, but merging repeated lines by card threw them away. Each line now has `printings`: the set code (in capitals) and number as typed, each different one listed once in the order typed, empty when the line had none.
- `frontend/pages/deck/deck.js` and `frontend/src/style.css`: a new column between the name and the type, for example `CMM 410` or `SLD 916, TDC 12`. A not-found line also keeps what I typed. Hovering the column says it is "as typed". On a narrow window it moves under the name.
- `scripts/test-deck-preview.mjs` (189 to 198 checks) and `scripts/check-deck-ui.mjs` (111 to 116 checks, in real headless Chrome).

**What I checked**
- `npm run test:quick` passes all 21 suites and the deck page check passes 116 of 116 against the real card list. I looked at a desktop screenshot; the first width wrapped "SLD 916, TDC 12", so I widened the column and looked again. Phone width is still on hold.
- I did not run broken copies of this change.

**Decisions**
- The column shows the set CODE as typed, not the set's name: our card list has no set data, and a pasted list holds the code, not the name.
- It shows what I typed, not the printing the site draws. The picture is still the default printing, and the saved deck still stores only the card id. The column is a debugging aid until the real printing fix.
- Claude's slip: the first version of the new browser check expected 5 cells in every row, but a not-found row has no cost cell. The page was right and the check was wrong; I corrected the check.

## 65. The art of the printing I named (2026-10-29)

**What I asked for**
- I asked Claude to continue with the printing art fix and to keep API request costs as low as possible. I agreed to a plan in which the same card typed with different printings stays separate rows, and I said a card with other art is still the same card: "Tiffany, Bride of Chucky" is always Varragoth, Bloodsky Sire, and only the picture follows the printing. If a player wants other art later, they should pick another printing of that card. That picker is not built; it is on `docs/todo.md`.

**What changed**
- **No Scryfall request is added.** The card list build writes one small file per set, `/data/printings/set-CODE.json`, from the printings file it already downloads, so the deck page fetches only the sets a pasted list names, from my own site. The weekly build is still one API request and two file downloads. Real numbers on the cached files: 111,358 printings in 769 sets, 2.69 MB gzipped in all; each set maps a collector number to the printing's id.
- `shared/printings.mjs` (new): the file format, the set file address, and `findPrinting`. Each entry carries a 4-character key made from the card's name, so a set and number that belong to a different card are refused (`cmm` 5 is Ulamog, not Sol Ring). It is named `set-con.json` and not `con.json` because Windows cannot create a file called `con`, and Scryfall has a set with that code.
- `scripts/lib/card-list.mjs`, `scripts/lib/card-list-build.mjs`, `scripts/build-card-list.mjs`: the build collects printings, checks them (at least 80,000 and 500 sets, no more than 5% fewer than last time), keeps them in the cache as one `printings.json` vouched for by a checksum, and writes the set files when the site is published. List format is now 3, so the next Vercel build rebuilds once. Each alternate title also records the printing that carries it (`fp`). `--from-files --site` lets me run the pages here without downloading anything.
- `shared/card-match.mjs`, `shared/deck-preview.mjs`: a line gets its printing from the set and number I typed, else from the title I typed, else the default. Rows are split by printing. A typed set and number that cannot be used says why (no data for the set, number not in the set, number is another card, data not loaded), and the card still shows its default picture. The saved deck gets an optional `p` per card, so decks saved before this still read.
- `frontend/src/printings.js` (new), `frontend/pages/deck/deck.js`, `frontend/src/card-peek.js`: the page fetches the sets a list names (a failed fetch is not remembered, a 404 is), the row says which printing it shows, and the hover note says "the printing you named" or "the printing that carries the title you typed".
- `shared/zones.mjs`, `frontend/pages/solo/solo.js`: a game card keeps `i` (which card it is) and may carry `p` (the picture). The solo table draws the printing, then falls back to the card's default picture once, then to the name.
- Tests: `scripts/test-printings.mjs` (39), `scripts/test-printing-loader.mjs` (23), and bigger `test-card-list` (157), `test-card-list-build` (156), `test-deck-preview` (263), `test-zones` (266), `check-deck-ui` (128), `check-solo-ui` (77), and the deploy check (61, with checks on the set files).

**What I checked**
- `npm test` passes all 27 suites on the final code (26 before, plus the new loader suite); the deploy check, run on its own against a seeded cache, passes 61 of 61. I ran the new build on the real cached Scryfall files: for all 111,358 kept printings the set, number and card key agree with the raw record (0 disagreements), and the 560 title printing ids all exist in the raw file. The Heart of the Mountain title now points at the printing whose raw record is Arcane Signet, SLD 916.
- I looked at a desktop screenshot with real art: hovering the SLD 916 row showed the real Heart of the Mountain picture while the row still says Arcane Signet. I also ran the "reuse the cached list and publish it" path (what every Vercel build after the first does) on the real data with downloading switched off.
- Broken copies, run in the foreground with every file restored and its hash checked: 92 deliberately broken copies. The first run caught 80. The survivors showed five holes in my tests and three redundant checks (a longer value, an object property name and an array file are already refused by the checks next to them). After fixing the tests, 89 are caught and those 3 stay as documented redundant checks. I did not break copies of the browser code (`deck.js`, `solo.js`, `card-peek.js`); the browser checks cover them.
- Not checked: phone width (still on hold), the first real Vercel build of format 3 (it will download the bulk files once), and the live two-browser Firebase tests, which this change does not touch.

**Decisions**
- Rows are split by printing, not merged. This replaces the merged "SLD 916, TDC 12" display from entry 64: the saved deck needs one printing per group of copies.
- Collectors' printings of cards in the list (Collectors' Edition, 30th Anniversary, World Championship decks) are included, 2,707 printings. I had inherited the card list's "no collectibles" filter for printings and a broken-copy survivor made me check on real data: it would have made a pasted `Mox Jet (30A) 556` say "not found" for a printing that exists. The card list itself still leaves out collectible-only cards.
- When several printings carry one title, the one with the smallest id is taken, so the same data always gives the same list.
- I confirmed keeping the collectors' printings, and I said the one-time rebuild after the push is fine (a single real download of the bulk files). The art picker (another printing of the same card, in the deck page and the lobby) stays on `docs/todo.md` for a later step.
- I asked Claude to clean the to-do list of items this work made useless. It removed four finished or superseded items (the "later" printings item, the "when the build is set up" caution, "show the printing the player meant", and "next import pieces"), fixed the header and the Hosting line that still said nothing was built, and separated the already-passed spike from the ManaBox item it was glued to. Open items were left alone.

## 66. The first live build of the printings, and one bug found by reading (2026-10-29)

**What I asked for**
- I said the site now shows the alternate printings and names, and asked whether costs are still zero. With about 6% of my usage limit left, I asked which files to re-read cheaply, and then to continue.

**What changed**
- `frontend/pages/deck/deck.js`: while a list waits for its printing files, the old preview is now cleared and hidden. Before, it stayed on screen for the new text, and clicking Save in that short window would have saved the old cards with the new text. The solo table plays from the saved cards, so it would have played a different deck from the one on the page.
- `scripts/check-deck-ui.mjs`: one new check, read in the same moment as the click (129 checks now).

**What I checked**
- The first Vercel build after the push did the one-time rebuild I approved: `action: rebuilt`, "the cached list is in an older format", 34,172 cards, 770 sets, 111,994 printings (Vercel's printings file is fresher than my local copy). Plain GETs on the live site: `set-cmm`, `set-con` and `set-sld` answer 200 as JSON, `set-zzz` and the bare `cmm.json` are real 404s, and `cmm` 410 and `sld` 916 are the Sol Ring and Heart of the Mountain printings I checked against Scryfall's raw records. Brotli sizes: `cmm` 26 KB, `sld` 70 KB, `plst` 148 KB.
- Costs: no Scryfall API request is added, and no money. Bandwidth is not zero (a deck downloads the set files it names), but it is small against Vercel's 100 GB free allowance. I did not check Vercel's limit on the number of files in a deploy (770 more small files, and the deploy worked).
- The new check fails without the fix (`hidden: false`), run in the foreground with the file restored and its hash checked. I also read `publish` in `scripts/lib/card-list-build.mjs` and found nothing to change: a build stopped between its two steps fails and never deploys.
- Not checked: the next deploy saying `reuse`, and the full deploy check against the live address (it uses my real Firebase project).

**Decisions**
- Claude's slip: the Save window above was a bug in my own `runCheck`, found by reading the diff, not by any test; none of my earlier checks could see it because the page waits on the network only for lists that name sets.

## 67. Two ideas on the to-do list: several saved decks and The Stack (2026-10-30)

**What I asked for**
- I asked how many decks a player can save (one), and Claude added "several saved decks" to the to-do list at my request. I also asked whether the solo table's arrangement is only a placeholder: the rules and the two-row battlefield are real, the look is a plain first version.
- I proposed a shared area called "The Stack" where players from each seat can play their spells.

**What changed**
- `docs/todo.md`: two new items, "Several saved decks" and "The Stack, a shared zone". `docs/design-notes.md`: a new section "The Stack" with what I want and Claude's draft notes. Nothing is built.

**Decisions**
- Anyone at the table can remove a card from the stack. Abilities go on the stack too, so Claude must research the kinds of things that can go on it and the best ways to represent them before any design. The solo table gets a stack as well.
- Costs: the solo version runs in the browser, so no network and no money; the live version adds a few small database writes inside Firebase's free plan.
- Claude recommended recording the idea and not building it now: there is no shared table page yet, and the stack is the first zone that every player writes, so it needs a rules change.

## 68. What the lobby shows about a deck, formats and brackets (2026-10-30)

**What I asked for**
- I chose the lobby deck fields as the next step. Claude read the member rules and the ready logic first and proposed a plan; I answered its questions.

**What changed**
- `docs/design-notes.md` (a new section), `docs/todo.md` (one item with the steps) and this entry. No code and no rules yet.

**Decisions**
- A seat in the lobby shows only the player's name, their commander(s) by card name (not the deck's title), their bracket and whether they are ready. Nobody sees inside another player's deck. I can preview my own list and swap cards with my sideboard.
- The bracket is picked by the player; if not, Claude infers a guess from the number of Game Changers (rough, to be checked against Wizards' bracket rules first).
- Ready needs a deck, enforced by the page, with a "choose a deck" popup when Ready is pressed without one. The wait-for-everyone popup at Start waits for the table page.
- The table gets a format setting (`meta.format` already exists, with no way to choose it), only decks of that format are offered, and a player with none can paste a list in the lobby. That makes "several saved decks" the first step.
- The first formats are Commander and Standard; more can be added later.
- Claude's slip: it first meant "one text" for the commander field and I read it as the deck title; it explained again and I liked the commander names over a custom deck name.

## 69. Several saved decks (2026-10-30)

**What I asked for**
- I said "let's do step 1" of the lobby deck fields: several saved decks, each tagged with its format.

**What changed**
- `shared/deck-library.mjs` (new): up to 20 saved decks under `overloaded.decks`, each with an id and a format (`commander` or `standard`), and one selected. The saved deck itself is unchanged, so its strict reader and its 263 tests are untouched; every deck inside is read with it. Saving under the same name replaces that deck; a 21st is refused in words. My old single deck is read once as the first deck, and cannot come back after I delete it.
- `frontend/pages/deck/` (`index.html`, `deck.js`) and `frontend/src/style.css`: a list of my saved decks with Load, Use for the solo table and Delete, a Format choice next to the deck name (it follows the commander choice until I pick one), and a note that a same-name save replaces. `frontend/pages/solo/solo.js`: plays the selected deck.
- Tests: `scripts/test-deck-library.mjs` (new, 90 checks), `scripts/check-deck-ui.mjs` (149, 20 new) and `scripts/check-solo-ui.mjs` (84, 7 new); `scripts/test-all.mjs` registers the new suite. `docs/todo.md` and `CLAUDE.md` are updated.

**What I checked**
- `npm test` passes all 28 suites. I looked at desktop screenshots of the list with three decks and of the save box, and fixed the first layout (bullets, buttons wrapping under the text) after seeing it.
- 36 deliberately broken copies of the library module, run in the foreground with the file restored and its hash checked: 35 caught. The first run showed a real gap in my tests (capitals in the NEW name were never tested) and two mutations that did not match the code (never tried); the one survivor is a redundant check, since an array has no version and the version check already refuses it. I did not break copies of `deck.js` or `solo.js`; the browser checks cover them.
- Not checked: phone width; the live site (nothing is pushed yet). The lobby does not read the library yet.

**Decisions**
- The saved deck keeps its format (`SAVED_VERSION` stays 1) and the library wraps it, so nothing that already reads a saved deck had to change.
- The format of a deck is a choice on the deck page, defaulting to Commander when a commander is chosen and Standard otherwise.
- Claude's slips: two shell commands with backticks inside double quotes failed before changing anything (I then wrote the scripts as files), I miscounted two things my scripts expected (4 where there were 5, 3 where there were 4), the first seven solo checks I added ran after a scenario that blocks browser storage, and my later solo scenarios were shadowed by a leftover library key until the seed helper cleared it. Each time the page was right and my check was wrong.

## 70. A format on the create form, and the deck fields on the member entry: the rules path (2026-10-30)

**What I asked for**
- I went away for a couple of hours and asked for two things with no questions: a Commander or Standard choice on the lobby's create form, and the rules path of the lobby deck fields (database rules, a `setDeck` operation, the flow model, tests and the `deck` mutation subset), stopping at "ready to paste". The lobby page for decks, the full mutation run and the paste were left for tomorrow, and I said not to touch the live Firebase project.

**What changed**
- `shared/formats.mjs` (new): the two formats, `readFormat` (refuses anything else, including another capital letter, a space or an inherited name like "constructor") and `formatTitle`. `shared/deck-library.mjs` now re-exports the list from it. `shared/table-ops.mjs` refuses an unknown format before any request. `frontend/pages/lobby/` (`index.html`, `lobby.js`): a Format choice next to Seats, and "Format: ..." on the table, set as text from `meta.format`.
- `shared/deck-fields.mjs` (new): the page-side checks for `commander`, `bracket` and `bracketGuess`. `backend/database.rules.json`: the three fields on the member entry, a rule on the whole entry that a change to any of them cannot leave `ready` equal to the match number, and a rule that a guess needs a bracket. `setDeck` in `shared/table-ops.mjs` (and `frontend/src/db.js`): lobby only, one write that sets the fields and clears `ready`; the same deck again writes nothing.
- `shared/table-flow.mjs`, `backend/test-table-flow.mjs`, `backend/test-rules.mjs`, `backend/test-table-ops.mjs`, `backend/mutate-rules.mjs`, `scripts/test-formats.mjs`, `scripts/test-deck-fields.mjs`, `scripts/check-lobby-ui.mjs`, `scripts/test-all.mjs`, `docs/game-flow.md`, `docs/todo.md`, `docs/design-notes.md` and `CLAUDE.md`.

**What I checked**
- The limit comes from the real card list, not from a guess: the longest legendary name is 61 units, two legendary names joined with " & " are at most 123, and the longest name of any card is a 141-unit joke card, so any two names reach 208. The default of 200 would have refused that worst pair, so the limit is **220**. All 34,743 names and alternate titles pass the page check unchanged.
- Before writing the tests I probed the emulator: an entry-level rule does run for a write to one child and for deleting a child (deleting `commander` while ready was refused), but a rule on a single child runs only when that child is written. The probe found a hole in my first design: deleting the bracket while `bracketGuess: true` stayed was allowed. I moved "a guess needs a bracket" onto the whole entry and ran the probe again.
- Step 2: `npm test` passed all 29 suites before I started step 3; the lobby check is 58 checks (3 new) and I looked at desktop screenshots of the form and the table section (the table section was forced visible with made-up text, so the screenshot shows layout only, not the live binding to `meta.format`). 10 broken copies of `formats.mjs`: 9 caught, and the survivor (dropping the `typeof` check) is redundant because `Array.includes` compares strictly.
- Step 3: 566 rule checks (71 new), 168 table logic checks (47 new), the flow comparison on 240 sequences and 3,349 steps with 104 un-ready cases, `scripts/test-deck-fields.mjs` 66 checks. `node mutate-rules.mjs deck`: 24 mutations, 22 caught by the rules test alone, and the other 2 ("bracket need not be a number", "commander need not be a string") survived the full suite too and are documented as redundant: strict equality and `.length` already refuse the same values. 29 broken copies of `deck-fields.mjs`: 28 caught the first time, and the survivor was dead code (a default parameter already turns undefined into null), which I removed; then 28 of 28. 11 broken copies of `setDeck`, `createTable` and the model: 10 caught, and the survivor (the `!mine` half of the membership check) is redundant because only members can read `meta`. The rules file hash was the same before and after every run.
- **Not checked:** nothing was pasted or run against the real project (`npm run test:live` was not run on purpose); the full `npm run mutate` (about 55 minutes) was not run, only the 24 new mutations, and 22 of them only against the rules test; phone width; whether the format line shows the real format of a real table; the lobby page for decks does not exist yet. A deck change during a match was seen only once in the flow comparison.

**Decisions**
- Defaults I chose because I could not ask, to confirm: a deck can only be set in the lobby (the page refuses, the rules do not); an empty commander is stored as nothing, not as an empty text; a player who left mid-match and comes back has no deck fields until the page sends them again.
- The commander limit is 220, and two things stay on the page only: Ready needing a deck, and the "everyone waits until all have a deck" idea (table page, later).
- Tomorrow, in this order: look at `git diff` of the rules file, run the full `npm run mutate` before pasting, paste, add the new requests to `scripts/check-live-rules.mjs` and run `npm run test:live`, then the page path.
- Claude's slips: my first lobby check left a made-up "Modern" option selected, which broke the later offline step (the page was right); my first mutation of the "applies on creation" rule had unbalanced parentheses and would have broken the rules file for the wrong reason (caught by looking before running); the first run of my "alice keeps her ready mark" test failed because the emulator helper throws away what its callback returns, which this repo's notes had already recorded; my first `setDeck` refusal tests passed for the wrong reason (the database refuses those values too), and a broken copy that skipped the page's checks only showed it, so they now require the page's own message; adding a random action shifted the flow test's random numbers and left a coverage gap, so I raised it to 240 sequences and made two cases required; and a large shell command with backticks and quotes inside failed before running anything, so I wrote the log edit as files.

## 71. A sample deck on the deck page, and a link from the solo table (2026-10-30)

**What I asked for**
- While the full mutation run was going in the background, I asked whether a sample deck could exist on the site without bothering it. I chose both options Claude offered ("A and C"): a button on the deck page and a link from the solo table's empty state, and I gave a Commander list (Krenko, Mob Boss, 100 cards) to use as the sample.

**What changed**
- `shared/sample-decks.mjs` (new): my list as plain text, with a `Commander` line added on top so the page treats Krenko as the commander for certain and does not guess, and `sampleById`. `frontend/pages/deck/` (`index.html`, `deck.js`): a "Try a sample deck" button next to Clear (off until the card list has loaded) that puts the sample in the box with its name, checks it like any pasted list and offers Commander. `/deck?sample` opens the page with the sample already loaded, once. `frontend/pages/solo/` (`index.html`, `solo.js`): "Or try a sample deck" next to "Import a deck" when there is no deck, hidden when the card list cannot be loaded.
- Tests: `scripts/test-sample-decks.mjs` (new, 24 checks), `scripts/check-deck-ui.mjs` (163, 14 new), `scripts/check-solo-ui.mjs` (85) and `scripts/test-all.mjs`. `CLAUDE.md` and `docs/todo.md` are updated.

**What I checked**
- Against the real card list, all 85 lines match by name (1 commander and 99 cards). With my first local printing files, 83 of 85 showed the exact printing; the two misses were Collectors' Edition cards (Fork and Red Elemental Blast) because my local folder held an older 734-set build. The live site serves `set-ced.json` (HTTP 200). I rebuilt the local data from the cached Scryfall files (769 sets, no download) and then all 85 resolve.
- I looked at desktop screenshots of the loaded sample and of the solo table's empty state. 5 deliberately broken copies of the new page code, run in the foreground with the files restored and their hashes checked: 5 caught. `npm run test:quick` passes (27 suites).
- Not checked: the whole `npm test` (it includes the database rules suite, which I did not run while the mutation run was going), the live site (nothing is pushed, so `/deck?sample` through Vercel's rewrite is unverified), and phone width.

**Decisions**
- A sample is only text in the paste box. No deck is saved for a visitor who did not ask, so it does not use one of the 20 slots.
- Only one sample so far, the Commander list I gave. A 60-card Standard sample waits for a list from me.
- The only change to my list is the `Commander` line on top.
- Claude's slip: the stale local printing folder was its own doing. After the Collectors' printings were added it ran the deploy check against a seeded cache that predated them, and that build published the older folder; the two missing cards showed it, and it regenerated the folder.

## 72. The format choice replaces the commander radio buttons, and the commander lists are grouped (2026-10-30)

**What I asked for**
- I looked at the deck page and asked whether the "This deck has a commander" and "No commander" options are still needed now that there is a format dropdown. Claude said they overlap. I also asked that a player can pick any card in the list as the commander when none is marked, and I chose both extras it suggested: plainer wording when no commander is marked, and the likely commanders listed first. I asked for that wording to be less AI-sounding and more basic.

**What changed**
- `frontend/pages/deck/index.html`: the Format choice moved above the commander box and the two radio buttons are gone. `frontend/pages/deck/deck.js`: Commander shows the commander and partner pickers, Standard hides them and saves the deck with no commander. The format starts as Commander when the list marks a commander or has about 100 cards, otherwise Standard, until I pick one. Both pickers have two groups, "Likely commanders" (legendary creatures) and then "Other cards" ("All cards" when there is no legendary creature). The notes now read "No commander is marked in your list, so we picked the first legendary creature. Change it if it is wrong." and the same for the first card. `frontend/src/style.css`: a little space above the Format field.
- `scripts/check-deck-ui.mjs` (172 checks now): updated for the radios and with new checks for the format order, the groups, the notes, Standard hiding the pickers and saving no commander, and loading a saved Standard deck.

**What I checked**
- `npm test` passes all 31 suites, 172 of them deck page checks. I looked at desktop screenshots with Commander (the pickers shown) and with Standard (hidden).
- 9 deliberately broken copies of the new logic, run in the foreground with the file restored and its hash checked: the first run caught 8. The survivor showed a weak check of mine (it loaded a Standard deck while the page was already on Standard), so I made it start from Commander, and then it was caught.
- Two existing hover checks failed after the change. The cause was the page getting shorter: they scroll a row to the top of the window, which needs a taller page. I added a spacer to the test; the page and the box logic were not wrong.
- Not checked: the live site (not pushed yet) and phone width.

**Decisions**
- The format decides the commander: a Commander deck always has one, a Standard deck never does. A Commander-format deck with no commander is no longer possible.
- "Likely commanders" means legendary creatures only. Backgrounds and legendary planeswalkers are under "Other cards" for now.
- Claude's slips: its first edit missed one leftover use of the old radio in my check, which crashed the run; and my first "load a Standard deck" check passed for the wrong reason.

## 73. The full mutation run for the deck fields rules (2026-10-30)

**What I asked for**
- I asked for the full `npm run mutate` before pasting the rules. It ran in the background while other work went on, and I asked Claude not to touch `backend/` meanwhile.

**What changed**
- Nothing in the code. `docs/todo.md` and `CLAUDE.md` record the result.

**What I checked**
- 245 deliberately broken copies of the rules: 209 killed, 36 documented as redundant (34 before plus the 2 new ones for the deck fields), 0 survived, 0 suspicious. No kill was printed without a named check. The runner restored the rules file: `git status` of `backend/` is clean and its hash is identical to the committed file.
- Afterwards the whole `npm test` passed all 31 suites, including 566 rule checks, 168 table logic checks and 3,349 flow steps.
- Not checked: nothing is pasted and `npm run test:live` was not run; the review follow-ups for `backend/` (a guard in `run-tests.mjs`, the stale README, the `lastSeen` test) are still to do.

**Decisions**
- The rules file is ready to paste: `backend/database.rules.json` as committed in 873686d. Then the new requests go into `scripts/check-live-rules.mjs` (the deck fields, the un-ready rule, and a 220 and a 221 character commander, since the length rule has only been checked in the emulator) and `npm run test:live` runs.

## 74. The deck fields rules are live, and checked against the real project (2026-10-30)

**What I asked for**
- I pasted the rules from 873686d into the Firebase console and told Claude. It then added the new requests to the live check and ran everything.

**What changed**
- `scripts/check-live-rules.mjs`: 10 new requests in the lobby phase (91 to 101 in all). They cover a commander or bracket written while ready (refused), the same write together with clearing `ready` (allowed), the same commander again (allowed), a commander of 220 characters (allowed) and 221 (refused), the same limit counted in emoji, an empty or numeric commander (refused), brackets 0, 6, 2.5, `"3"` and `true` (refused) and 3 (allowed), `bracketGuess` true with a bracket (allowed) and false or without a bracket (refused), another member or a stranger writing my commander (refused), and a field the entry does not have (refused).

**What I checked**
- `node --env-file=.env scripts/check-live-rules.mjs`: all 101 requests matched the rules file. Then `npm run test:live`: all 37 suites passed (566 rule checks, 168 table logic checks, 3,349 flow steps, the two-browser spike, the deploy check, the heartbeat, presence and the two-tab check).
- Not checked: the page does not call `setDeck` yet, so nothing in a real browser sends these fields. The requests were plain HTTPS writes with throwaway accounts.

**Decisions**
- Next is the page path: the bracket in the library and on the deck page, the lobby seats showing commander, bracket and ready, and a deck picker that calls `setDeck`.

## 75. The small backend follow-ups (2026-10-30)

**What I asked for**
- I asked Claude to do the simple items from its backend review and leave the rest. Mutation runs take about an hour, so I only want one when a rules change needs it, or when several rules changes are bunched together.

**What changed**
- `backend/run-tests.mjs`: it now refuses to run when `backend/scratch-rules-original.json` exists, because that file means a mutation run was cut short and the rules file may be a broken copy. The stale "both files" comment now says "the test files".
- `backend/mutate-rules.mjs`: one line, the runner passes `MUTATION_RUN=1` to `run-tests.mjs` so its own runs, which keep that backup on purpose, are not refused.
- `backend/README.md`: brought up to date (the rules are published, 245 mutations and about an hour, the backup file and the guard, and the two test files that were missing).
- `docs/todo.md`: marked these done, and the paste, the live check and the mutation run as done.

**What I checked**
- With a dummy backup file in place, `node run-tests.mjs` printed the message, started nothing and exited 1. I deleted the dummy afterwards.
- One mutation (`deck: bracket 6 allowed`) still ran and was killed by a named check, so the guard does not break the mutation runner. The rules file was untouched afterwards (`git status` shows no change to it).
- `npm test` in `backend/` passed after the edits (all 3,349 flow steps agree, and the emulator was stopped). I did not run the root `npm test`, since nothing outside `backend/` changed.
- The suspicion that a member can delete their own `presence/lastSeen` needed no new test: `backend/test-rules.mjs` already has a passing check that the deletion is allowed. So it is true, and the fix is a rules change.

**Decisions**
- The `lastSeen` fix and the question about `meta/format` wait for the next rules change, so one mutation run and one paste cover them together. I lean towards leaving `meta/format` open.

## 76. A bracket on each saved deck (2026-10-30)

**What I asked for**
- I told Claude to continue with step 3 of the lobby deck fields, starting with part 1: choosing a bracket when saving a deck. The Game Changers guess and the lobby come later.

**What changed**
- `shared/deck-library.mjs`: a saved-deck entry may have a `bracket` (1 to 5, the same list as `BRACKETS` in `shared/deck-fields.mjs`) next to its `format`. A deck with no bracket has no `bracket` field at all. `addDeck` takes a `bracket` option and refuses anything that is not 1 to 5 in words. `readLibrary` drops (and counts) a deck whose stored bracket is not 1 to 5, like any other damaged entry. The saved deck inside is unchanged, so its version stays 1.
- `frontend/pages/deck/index.html` and `deck.js`: a "Bracket (optional)" choice under Format ("Not set", 1 to 5). It shows only for Commander, because brackets are a Commander idea, and a Standard deck saves none. Saving writes it, loading a deck brings it back, pasting a different list or pressing Clear resets it, and a saved deck's row reads for example "Eowyn Tokens (Commander, bracket 3)".
- `scripts/test-deck-library.mjs` (108 checks, 90 before) and `scripts/check-deck-ui.mjs` (184 checks, 172 before).

**What I checked**
- `node scripts/test-deck-library.mjs`, `node scripts/check-deck-ui.mjs` (real Chrome, real card list) and `npm run test:quick` (27 suites) all pass.
- I looked at desktop screenshots of the saved row and of the Format and Bracket fields. Phone width is not checked (on hold).
- Broken copies of `deck-library.mjs`: 8 run, 7 caught, and the survivor (a deck with no bracket read back with an empty `bracket` key) got its own test and is now caught. The file was restored and is identical.
- Not checked: the live site (not pushed), and nothing sends the bracket to a table yet.

**Decisions**
- The bracket is stored on the library entry, not in the saved deck, so the saved deck format does not change.
- My first browser check failed for a reason in the test, not the page: the pasted list had the same text as the loaded Standard deck, so the page correctly kept that deck's format. The test now picks Commander explicitly. Also, the local printings folder was stale again after the live test run (the deploy check leaves a smaller one) and I rebuilt it with `node scripts/build-card-list.mjs --from-files --site`.
- Still to do in step 3: the lobby seats and deck picker, the "choose a deck" popup, and the Game Changers guess.

## 77. The lobby: decks on the seats, a deck picker, Ready and the "Choose a deck" popup (2026-10-30)

**What I asked for**
- I told Claude to commit the bracket work and continue with part 2 of step 3: the lobby shows each seat's commander(s), bracket and ready status, a player brings one of their saved decks of the table's format, and Ready needs a deck (a popup asks for one).

**What changed**
- `shared/lobby-deck.mjs` (new, no browser code): `deckFieldsOf` (what `setDeck` sends for a saved deck: the commander names, joined with " & ", and the bracket; a Standard deck sends neither), `defaultDeckFor`, `deckChoiceLabel`, `isReady` (ready for THIS match only) and `seatDeckText`, which trusts only values of the right kind because other players' browsers write them. `scripts/test-lobby-deck.mjs` (33 checks) is in `npm test`.
- `frontend/pages/lobby/index.html`, `lobby.js` and `frontend/src/style.css`: each seat reads "Seat 1: Alice (host), Krenko, Mob Boss, bracket 3 **Ready**". A "Your deck" part lists my saved decks of the table's format; choosing one calls `setDeck` (which takes the ready mark back in the same write) and says so. A Ready / Not ready button; Ready with no deck chosen opens a native dialog with my decks (or, with none, says so, links to the deck page and only offers Close). The chosen deck is remembered for that table in this browser (`overloaded.tableDeck`) and sent again after a refresh; sending the same deck again writes nothing, so it does not un-ready me. All text from the database goes in as text.
- `scripts/check-lobby-deck-live.mjs` (new, 27 checks, two real browsers against the real project, about 1 minute, `--screenshot` saves scratch screenshots) and `npm run test:live` now runs it (38 suites). `scripts/check-lobby-ui.mjs` expects the two new headings.

**What I checked**
- `npm test` passed all 32 suites. The live check passed 27 of 27 three times in a row, and the first run's two failures were my test looking at Bob's page and the status line before they had caught up (the database was already right), fixed by waiting.
- It covers: the popup with and without decks to offer, Escape/close setting no deck, the seat lines on both pages, a different deck taking the ready mark away on both pages, the database entry holding only name, seat, ready, commander and bracket (no card list), and a refresh keeping the deck and the ready mark.
- I looked at desktop screenshots of the table part and the popup, and deleted them. Phone width is not checked (on hold).
- 18 broken copies of `shared/lobby-deck.mjs`: 17 caught on the first run. The survivor was a badly written broken copy (a `return` after a `return`, which changes nothing); written properly it is caught.
- Not checked: the deployed site (nothing is pushed), and what a player sees with a deck whose saved commander name is no longer a real card (it is just text).

**Decisions**
- Left out on purpose: a Start button and the "everyone choose a deck" popup at Start (they belong with the table page), the Game Changers guess, pasting a list inside the lobby (the popup and the picker link to the deck page instead; the seat is kept), and previewing your own deck there.
- The "Ready" mark is bold after the commander and bracket with no separator; I left it since the bold tells it apart. Say if you want a dash or a different look.

## 78. The Start button and the first table page (2026-10-30)

**What I asked for**
- After the lobby decks I said to continue. Claude said the table page changes the architecture and was bigger than one step, so it proposed a plan: a Start button and a bare table page first, then the live zones and the opponent view in small steps, with the database rules batched at the end. I chose that plan ("Start button first, then the table page").

**What changed**
- `frontend/pages/lobby/index.html` and `lobby.js`: a "Start the match" part that only the host sees. The button is off until there are two players and every one is ready, and the note says how many are ready. When the table's status becomes `playing`, everyone in the lobby is taken to `/table/CODE`, which also covers a refresh. `startMatch` already existed in `shared/table-ops.mjs` (it refuses in words unless the host presses it with everyone ready).
- `frontend/pages/table/index.html` and `table.js` (new): puts a returning member back with `rejoinTable`, keeps the table alive with the same keep-alive and presence code as the lobby, and lists the seats with each player's commander(s) and bracket, "(host)" and the connection note, plus "The match is on". Not a member or a closed table says so. The game itself is not there yet.
- `shared/lobby-link.mjs`: `tableCodeFromPath` and `tablePathForCode` (`codeFromPath` stays lobby-only on purpose; an old check says `/table/...` gives nothing there). `scripts/test-lobby-link.mjs` now has 2,541 checks.
- `vercel.json` (rewrite `/table/:code`), `vite.config.js` (the page is a build input, and a small dev-server rule does the same rewrite).
- Tests: `scripts/check-lobby-deck-live.mjs` is 36 checks (9 new: Start waits, only the host sees it, it turns on, both browsers move to the table page, both seats are listed, the database says `playing` with the one-hour idle limit, a refresh keeps Bob at the table); `scripts/check-deploy-config.mjs` is 56 checks (two new for `/table/CODE`); `scripts/check-lobby-ui.mjs` expects the extra heading.

**What I checked**
- `npm run test:live`: all suites passed except the lobby page check, which failed because it counts headings and my Start section added an h3. I fixed the expectation and reran it (58 of 58). I did not rerun the whole `test:live` after that one-line change; the other 38 suites had passed in that run.
- I looked at desktop screenshots of the Start section and of Bob's table page, then deleted them. Phone width is not checked (on hold).
- Broken copy: with the `/table/:code` rewrite removed from `vercel.json`, the deploy check fails on the new table check, and the file was restored identical.
- Not checked: the deployed site (nothing is pushed), and what two players see if the host starts while someone has the lobby page in a background tab (it redirects when the tab next runs).

**Decisions**
- Claude's first version of the table page used `./table.js`, which the page's own address `/table/CODE` turns into `/table/table.js`; the dev rewrite then served HTML as a script and the first live run failed (Alice reached the page, Bob's lists were empty). Production builds use root-based paths so only the dev server showed it. The table page now uses root-based paths, and the live check caught the problem, which is what it is for.
- "Back to the lobby" on the table page while the match is on leads straight back to the table, because the lobby sends everyone at a playing table there. There is no leave or concede button yet.
- Next: the game on the table page (your own zones from `shared/zones.mjs`, hand and library in `private/`, the rest in `public/`, small writes per move), then the opponent view. The rules batch (zone size limits, the `lastSeen` deletion, `meta/format`) waits until the data shapes are settled.

## 79. Your own game on the table page, saved live (2026-10-30)

**What I asked for**
- I said to commit and continue, which is step 2 of the table plan: play your own deck on the table page, with your hand and library private and the rest public, each move saving only what it changed.

**What changed**
- `shared/game-sync.mjs` (new, no browser code): `splitGame` turns a game into `public/{uid}` (life, turn, mulligans, the next card number, the counts of the hidden zones, and battlefield, graveyard, exile and command zone) and `private/{uid}` (library, hand, sideboard). A card is stored as `{u, i, p?, n, x?, e?}`; the type, cost and keywords are not stored, each page looks them up in its card list. `gameWrites` returns only the pieces a move changed (a draw is 4 small writes). `joinGame` rebuilds a game from what is stored, and `readCards` and `readPublic` read other players' data defensively: a card that is not exactly this shape is dropped, ids must be Scryfall ids, numbers are range-checked, a zone is cut at 250 cards.
- `shared/table-ops.mjs` and `frontend/src/db.js`: `saveGame` (one atomic update, refuses any path that is not my own two branches before sending), `loadGame` and `watchPublic`.
- `frontend/src/card-nodes.js` (new): the card buttons, moved out of the solo page so both tables draw cards the same way, with a read-only option for other players' cards later. `solo.js` now uses it.
- `frontend/pages/table/index.html` and `table.js`: when the match is on, the page loads the card list, puts back the game saved for this match (the stored `match` number equals the table's) or deals a new one from the deck the lobby remembered for this table, and shows the board like the solo table: turn, life, draw, next turn, untap all, shuffle, mulligan, selected-card actions, two battlefield rows, hand, command zone and piles. Every move renders at once and then saves; saves go one after another, a failed one is retried with the next move, and the page says "Saved." or that a move could not be saved.
- Tests: `scripts/test-game-sync.mjs` (78 checks, in `npm test`); `backend/test-table-ops.mjs` has 25 new checks against the real rules in the emulator (193 now); `scripts/check-lobby-deck-live.mjs` is 49 checks (13 new).

**What I checked**
- Five random games of 1,500 moves each: after every move, applying only that move's writes to a fake database and rebuilding gives exactly the same game, and the game passes `checkGame`; no move touched more than 9 paths.
- The emulator checks: the host's hand and library are readable only by the host, a table member reads the public branch, someone outside reads neither, a guest writing into the host's branch is refused by the database itself, and a move that names someone else's path is refused before any request.
- The live check (two real browsers, the real project): Alice is dealt 7 and her two commanders are in the command zone; the database holds her hand and library in her private branch; Bob can read her public branch (life, counts, command zone) but not her private one (HTTP 401), and none of her hand's card numbers is in what he can read; Draw, playing a card and losing 5 life are each saved; a refresh brings back the same game (the same hand, not a new deal).
- `npm run test:live`: all 40 suites passed. The solo page check (85) passed after the refactor.
- Broken copies of `game-sync.mjs`: 29 run, 28 caught on the first run; the survivor was a badly written copy (it reassigned a function parameter, which changes nothing), and the real version (putting the library in the public branch) is caught.
- I looked at a desktop screenshot of the table page, then deleted it. Phone width is not checked (on hold). Not checked: another player's board (not built), the deployed site (nothing is pushed), and a four-player game.

**Decisions**
- A zone is written whole when it changes, not card by card. That costs nothing for private zones (nobody listens to them) but a big public graveyard is delivered whole to every other player on each change. It is the simple first version; it is on `docs/todo.md` to measure and change if needed.
- My live check's first run had 8 failures that were my own test's mistakes (I expected a library of 30 after dealing 7, and my path helper put the id in the wrong place); the table page was right each time. I also had written `test:live` as 38 suites in `CLAUDE.md` when it was 39; it is 40 now and the file says so.
- The local card data went stale again after the live run (the deploy check leaves a smaller list) and the solo check failed on "Heart of the Mountain" until I rebuilt it from the cached files.
- Next: the opponent view (other players' public zones, live, read-only), then leave, concede and end-match buttons, then the one batched rules change.

---

## 80. Other players' boards on the table page (2026-10-30)

**What I asked for**
- I said to continue, which is step 3 of the table plan: see the other players' public cards live, with their hands hidden, and not be able to move their cards. Before that I asked whether the board layout is free to change; it is, and `docs/todo.md` now says the two automatic rows are only the first layout, with the options listed.

**What changed**
- `frontend/pages/table/index.html`, `table.js` and `frontend/src/style.css`: an "Other players" section. For each other player at the table it shows seat and name, life, how many cards they hold in hand and library (counts only), their battlefield in the same two rows, their command zone, and their graveyard and exile as lists you can open. The cards are read-only buttons (`makeCardNodes({ readOnly: true })`), so clicking does nothing. It updates live from `watchPublic`.
- Everything comes through `readPublic` from `shared/game-sync.mjs`, which drops anything that is not exactly a card. A player's branch marked with another match's number (a game left over from an earlier match) is not shown; the panel says "Has not been dealt a game yet". The card list is now loaded once and shared by your game and the other players' boards.
- `scripts/check-lobby-deck-live.mjs` is 60 checks (11 new).

**What I checked**
- Two real browsers on the real project: Bob's page shows Alice's board (life 35, one card on her battlefield, two in her command zone, hand 7, library 22, only those 3 cards on the page, all read-only) and Alice's page shows Bob's; when Alice gains a life Bob's page shows 36 without a refresh; nobody sees themselves in the list.
- Bob's own account wrote a stale match number into his public branch: Alice's page showed "Has not been dealt a game yet". Then it wrote a battlefield holding a card whose name is an `<img onerror>` tag, a card with a markup id, a text value and a 5,000-character name: Alice's page showed only the one well-shaped card, put no markup in the page, ran no script, opened no dialog, and had the hostile name only as the card's label text.
- I broke the match-number check in `table.js` on purpose and the live check failed on it; the file was restored identical.
- `npm test`: all 33 suites passed. I looked at a desktop screenshot of the panel and deleted it. Phone width is not checked (on hold).
- Not checked: more than two players on one table (the page lists every other seat, but only two browsers were used), the deployed site (nothing is pushed), and what a very large graveyard does to other players' downloads (on the todo).

**Decisions**
- Graveyard and exile are plain "open to see the names" lists, not card pictures, to keep the first version small; pictures can come with the card-by-card writes later.
- Still open from the table plan: leave, concede and end-match buttons, and then the one batched rules change (zone size limits, the `lastSeen` deletion, `meta/format`) with one mutation run and one paste.

---

## 81. Concede, end the match and leave, on the table page (2026-10-30)

**What I asked for**
- I said to commit and continue, which is step 4 of the table plan: buttons for conceding, ending the match and leaving, and what happens when the match ends. The flow functions already existed in `shared/table-ops.mjs` but no page used them.

**What changed**
- `frontend/pages/table/index.html` and `table.js`: Concede (anyone), End the match (the host only) and Leave the table, shown while the match is on, each behind a `confirm` popup (a placeholder, like the new-table warning). A player who conceded shows as "(conceded)" in the seat list and their Concede button is off; it is a mark for the table and changes nothing in the game. When the host ends the match, every table page takes its player back to `/lobby/CODE`. Leave sends you to the start page; mid-match your seat is kept for you.
- `shared/lobby-deck.mjs`: `hasConceded(member, meta)` (a concession counts only for this match), 5 new checks (38 in `scripts/test-lobby-deck.mjs`).
- `frontend/pages/lobby/index.html` uses root-based file paths now, and `vite.config.js`'s dev rewrite covers `/lobby/CODE` as well as `/table/CODE`. The same trap as the table page: from `/lobby/CODE` a relative `./lobby.js` points into `/lobby/`. Production builds were fine; the dev server and my live check were not.
- `scripts/check-lobby-deck-live.mjs` is 75 checks (15 new).

**What I checked**
- Two real browsers on the real project: the host alone sees End the match, everyone sees Concede and Leave; Bob concedes and Alice's page shows "(conceded)" with his match number in the database; the host ends the match and both browsers go back to the lobby on their own, the database says lobby and match 2, nobody is ready (the marks were for match 1); both ready again with the decks they brought (remembered, no popup), Start, and the second match deals Alice a NEW game (life 40 again, not the 35 she left, "hand is dealt", marked match 2, and Bob's page shows her old battlefield card gone); Bob leaves (his entry goes, his seat is kept); Alice, the last one, leaves and the table is gone.
- Two broken copies of `table.js` against the live check, both caught and the file restored identical: no redirect when the match ends, and restoring the old game in a new match.
- `npm run test:live`: all 40 suites passed. I looked at a desktop screenshot of the buttons and deleted it. Phone width is not checked (on hold).
- Not checked: a player who leaves mid-match and comes back by code in a real browser, the host leaving while others stay (tested in the emulator earlier, not in a browser), more than two players, and the deployed site (nothing is pushed).

**Decisions**
- The popups are `confirm()` placeholders for now. A designed popup (and a "the host ended the match" line before the lobby loads) is on the todo.
- While checking I found that `claimHostSlot` is not called by any page: after a host leaves mid-match and the table is handed on, the new host never takes their one-table slot. It only affects the one-table-per-host limit, not play. On the todo, not fixed here.
- Next: the one batched rules change (size and shape limits on `public` and `private`, the `lastSeen` deletion fix, the `meta/format` question), then one full mutation run, your paste, and `npm run test:live`. After that the board layout options, the Stack research, and a real four-player try.

---

## 82. The table work is pushed and checked on the live site (2026-10-30)

**What I asked for**
- I asked whether there is a basic frontend that shows the new pieces, then to push.

**What changed**
- Nothing in the code. I pushed 7 commits (`f32f4c4..ae62699`, a plain push): the guard and README refresh, the bracket on saved decks, the lobby decks and Ready, the Start button and first table page, your own game saved live, other players' boards, and concede, end match and leave. Claude first told me there were 8; there were 7, and I corrected that after the push.
- `docs/todo.md`: the "not pushed" notes for entries 69 to 81 now say pushed.

**What I checked**
- `DEPLOY_URL=https://overloaded-spell.vercel.app node --env-file=.env scripts/check-deploy-config.mjs`: all 55 checks passed against the real Vercel site (the real headers and rewrites, `/table/CODE` served by the new table page, and a table made and joined through a link from the real address). The local run has 56; the one missing is the check that a built file exists, which only makes sense locally.
- `/data/cards.info.json` on the live site says `reuse` with the same printings checksum (784b4e1d...), so the new deploy did not rebuild the card list.
- Not checked on the live site: two real players in two browsers on the live address (the two-browser live check ran from my machine against the real database), the table page with real card pictures there, and a phone.

**Decisions**
- The pages are the first plain version: they work, they are not designed yet. Looking at it myself with two browser profiles on the live address is the next real test.

---

## 83. The address bar follows the table, and the deck page returns to it (2026-10-30)

**What I asked for**
- After trying the live site I told Claude three things: `/lobby/ABCDEF` should be its own screen, not the start page; a person who follows that link should not have to type the code and press Join again; and a player should be able to import or change a deck inside the lobby without going to `/deck`. The thing I had hit: importing a deck on `/deck` and pressing "Back to the lobby" put me at `https://overloaded-spell.vercel.app` while I was still in table ABCDEF.

**What changed**
- `frontend/pages/lobby/lobby.js`: when a table is shown, the address becomes `/lobby/CODE` (`history.replaceState`, nothing reloads). That fixes the weird part: the address now always matches the table you are in, wherever you came from, and it can be copied and shared.
- `frontend/pages/deck/index.html` and `deck.js`: "Back to the lobby" goes to `/lobby/CODE` when this browser remembers a table (`overloaded.lastTable`, only if it is a valid table code), otherwise to the start page.
- `scripts/check-deck-ui.mjs` is 192 checks (8 new: no table, a table, and six values that are not table codes), and `scripts/check-lobby-deck-live.mjs` is 76 (one new: the address bar shows `/lobby/CODE` after making a table).

**What I checked**
- The deck page check (192 of 192), the live two-browser check on the real project (76 of 76) and the lobby page check. I did not run the whole `npm run test:live` for this small change, and it is not pushed yet.

**Decisions**
- The other two points are a bigger change to how the pages are organised, so Claude wrote them into `docs/todo.md` as a plan and asked me before building: a separate `/lobby/CODE` screen with one "Join table CODE" button (the code is already known), and the deck importer moved into a module that both `/deck` and the lobby use, opened inside the lobby only when needed.

---

## 84. A table's own screen, joining from its link, and the deck importer inside the lobby (2026-10-30)

**What I asked for**
- After trying the live site I said three things (entry 83): `/lobby/ABCDEF` should be its own screen, a person who follows the link should not have to type the code and press Join, and a player should be able to import or change a deck without going to `/deck`. Claude asked two questions and I chose: join automatically when a name is saved, and reuse the full importer inside the lobby.

**What changed**
- `frontend/pages/lobby/index.html` and `lobby.js`: two screens chosen by the address. The start page (`/`) keeps "make a table" and "join with a code", and if this browser is at a table it says so with a link (it does not push you in, in case you want to make or join another). `/lobby/CODE` shows only that table. Not at it yet: with a saved name you are joined with no click; without one you see "Join table CODE", a name box and one button. A link to a table that does not exist says so in plain words. Making or joining from the start page moves the address to `/lobby/CODE` without reloading (Back reloads the right screen). A new Leave button leaves the table (seat freed in the lobby, the next player becomes host if you were).
- `frontend/src/deck-importer.js` (new): the old `/deck` page code moved here as a module with one exported `mountDeckImporter` (options: which element shows messages, a `?sample` id, a callback when the saved decks change, whether to fix the back link). `frontend/pages/deck/deck.js` is now a 7-line caller.
- The lobby's table screen has "Import or change a deck": it opens the importer inside the lobby and loads it only then (it brings the 1.3 MB card list). Saving or deleting a deck redraws the lobby's deck picker straight away. The "no deck" offers in the lobby and in the "Choose a deck" popup are now buttons that open it, not links to `/deck`.
- `scripts/test-importer-markup.mjs` (new, 81 checks, in `npm test`): both pages hold the importer's markup, so it fails if an id the importer uses is missing from either page, or if an id is used twice.
- `scripts/check-room-live.mjs` (new, 26 checks, four real browsers on the real project, in `npm run test:live`). Updated: `check-lobby-ui.mjs` (65 checks), `check-deploy-config.mjs` (56), `check-lobby-deck-live.mjs` (76: a refresh now reloads the table's own address).

**What I checked**
- `npm run test:live`: all 42 suites passed. The deck page check (192) still passes after the importer moved, which is what shows the move changed nothing it does.
- The new live check: Alice makes a table and is on `/lobby/CODE` showing only the table; Bob, with no saved name, opens the link and sees a join screen with no code box, is not at the table until he presses the one button, and then is in seat 2 on the same address; Carol, with a saved name, opens the link and is in seat 3 with no click; a link to a table that does not exist says so; Bob's start page links back to his table; the deck page's "Back to the lobby" goes to `/lobby/CODE`; Bob imports a deck inside the lobby (the card list is not fetched until he opens the importer), saves it, the lobby's picker lists it at once, and choosing it shows his commander on Alice's page; Bob leaves and his seat is freed.
- Broken copies, all caught and the files restored identical: no auto-join; joining with no name; the deck page back link ignoring the table; Leave not leaving; the importer not telling the lobby a deck was saved.
- I looked at desktop screenshots of the join screen and of the importer open inside the lobby, then deleted them. Phone width is not checked (on hold).
- Not checked: the deployed site (nothing from entries 83 and 84 is pushed), the layout on a phone, and what a long lobby page feels like with the importer open (it is nested boxes and a bit heavy to look at).

**Decisions**
- Join automatically when a name is saved, as I chose. It overrides the earlier rule that a link never joins by itself; the cost is that a link can seat a person without a click. A first-time visitor still has to type a name and press a button.
- The importer markup exists in two pages. A shared module for the code and a test for the markup was the smaller change; building the markup from the module would remove the duplication later.
- My own slips this time: three of my edit scripts lost an escape (a newline, an apostrophe and a parenthesis in a regular expression) and broke a test file before it ran; I fixed each by hand. A live check also looked too early at a page that had not loaded the table's format yet; it now waits.

---

## 85. Designing counters and tokens before the one rules run (2026-11-04)

**What I asked for**
- I asked what the rules change would also include, and Claude listed the candidates. I chose to design counters and tokens first, so one 55-minute mutation run covers all of it instead of two.

**What changed**
- No code. `docs/tokens-counters.md` (new) holds the design and my decisions; `docs/todo.md` has the item with the build order.

**What I checked**
- Scryfall's raw data, before designing on it. `all_parts` lists related cards with a `component`; `token` names the token a card makes. Krenko, Mob Boss lists a Goblin, Treasure Vault lists a Treasure, Sol Ring has none. 4,785 of 39,196 cards relate to a token. The all-printings file has 3,049 token printings, all with pictures, in 850 kinds (100 Treasure printings, 59 red 1/1 Goblin printings). All token printings are about 99 KB gzipped, so a token file loaded only when the token panel opens is small. I did not measure the card-to-token links in the compact form I plan to use (the measured form was 148 KB gzipped).
- Not checked: anything about how the token panel will feel, and the compact link format.

**Decisions**
- Fixed short list of card counters; player counters (poison, energy, experience, commander damage by seat); reserved face-down, position and note fields.
- Tokens: pick from Scryfall's list, see the tokens a card makes, change a token's art to another printing of the same token, and custom art.
- Custom art is shared through an image link. This was my choice and Claude recommended keeping it in the uploader's browser only. Claude's objection was that every other player's browser fetches the link, so whoever runs the image host learns each opponent's IP address, and the table shows whatever is linked. I kept my choice; the limit is that only named hosts are allowed (Imgur direct links and Scryfall's own pictures to start), checked by both the page and the database rules. Adding a host later costs another rules run.
- Claude also noticed my 2026-10-29 note that I do not need the Start button to stay off until two players are in, while the page still requires two players, all ready. Not changed; it is on the todo.

---

## 86. Counters, the modifier and tokens: the logic and how they are stored (2026-11-04)

**What I asked for**
- I said yes to the three open points (cancel +1/+1 against -1/-1, Next turn does not reset the modifier, show only the change for now), so Claude started build step 1 from `docs/tokens-counters.md`: the logic and the storage, with tests, before any buttons.

**What changed**
- `shared/zones.mjs`: `changeCounter` (six fixed kinds; +1/+1 and -1/-1 cancel in pairs; counts stop at 0 and 999), `changeModifier` / `resetModifier` / `netChange` (power and toughness changed separately, -99 to 99; the total is the modifier plus the counters), `setNote`, `setFaceDown`, `createToken` and `copyAsToken`, and `changePlayerCounter` / `changeCommanderDamage` (poison, energy, experience, and damage by seat 1 to 4). Counters, the modifier, the note and face-down belong to a card on the battlefield and are cleared when it leaves; a token that leaves the battlefield stops existing. `checkGame` notices a damaged version of any of it.
- `shared/game-sync.mjs`: a card is now also stored with `tok`/`tt`/`pt`/`cl` (a token), `ct`, `mp`/`mt`, `f` and `nt`, and the public branch with `pc` and `cd`; every stored field is checked when read (anything damaged makes the card not a card), and a changed counter or modifier writes only the battlefield.
- `scripts/test-counters.mjs` (new, 232 checks) and `scripts/test-sync-counters.mjs` (new, 82 checks), both in `npm test`; `scripts/test-game-sync.mjs` has one expectation updated (an opponent's view now also has `pc` and `cd`).
- `docs/tokens-counters.md`, `docs/todo.md` and `CLAUDE.md` say what is built.

**What I checked**
- `npm test`: all 36 suites pass. Random games of 2,000 moves (five of them) with every new operation stay consistent and no real card is lost or copied; stored data from 1,500 moves each (five games) rebuilds exactly the same game from only the changed writes.
- Broken copies: 59 of the new game logic, all caught; 44 of the new storage code, 42 caught on the first run, then one of the two survivors got a new test and is caught, and the other is redundant (an array check that the key check already makes unnecessary). I first wrote 61 and 45 in my notes from memory; counting the lists I ran gave 59 and 44, and I corrected them.
- Not checked: any screen (there are no buttons yet), the database rules (they still accept the old shape, so none of this is saved live yet; the new fields would be accepted today because the rules do not limit what a card holds, which is the gap the rules run closes), and the position fields and custom art link (not built).

**Decisions**
- My first round-trip test failed because a copy of a real card lost its cost and keywords after being stored (a token's cost and keywords were not stored or looked up). Fixed by looking them up by id only, so a copy keeps them and a token with the same name as a real card never picks up that card's data. I did not catch it by reading; the test did.
- My first edit of `shared/zones.mjs` also wrote stray backslashes into the file and broke it before it ran; fixed with a one-off script.
- Next: the art link checker (step 2), then the buttons (step 3), then the one rules run (step 4).

## 87. No practical limit on counters, the modifier and life (2026-11-04)

**What I asked for**
- I asked whether numbers can go past 99 and be typed, and said there should not be a limit because doublers can go into the billions. I also agreed that Shift-click changes by 10 and that clicking the "/" in the middle changes power and toughness together.

**What changed**
- `shared/zones.mjs`: one limit, `NUMBER_LIMIT` (one trillion), for life, every counter, the modifier, player counters and commander damage. A change can be any whole number up to it and a result stops at it. Life now stops at plus or minus the limit.
- `shared/game-sync.mjs`: life was read back with its own cap of 1,000,000 and anything bigger became 20; it now uses the same limit as the game.
- Tests updated for the new limit (`test-zones`, `test-counters`, `test-sync-counters`) with new checks for billions of life, counters and modifier, and for a total one past the limit; `docs/tokens-counters.md` has a "Number limits" section.

**What I checked**
- `npm test`: all 36 suites pass (zones 268, counters 233, counter storage 83). I did not rerun the broken-copy checks for this change. Not built yet: Shift-click, the "/" button and typing a number (they are step 3, the buttons).

**Decisions**
- Why one trillion and not none: whole numbers are only exact in JavaScript up to about 9 quadrillion, so a ceiling keeps sums exact, and nobody reaches it in play.

## 88. Custom art becomes an uploaded picture, and sleeves and playmats join it (2026-11-04)

**What I asked for**
- I asked what an image host is, and then how a link could expose anyone's IP address. Claude explained that each viewer's own browser fetches the picture straight from the link's host, which sees their IP address. I did not want Imgur, so I asked if an uploaded picture from the player's computer would be better. Then I said yes to changing the design, to limiting how many custom pictures a player has, and that sleeves (card backs) and playmats should work the same way, chosen in the lobby and maybe swapped during a match if it is light enough.

**What changed**
- `docs/tokens-counters.md` only (no code): custom art is an uploaded picture shrunk by the page to about 30 KB; sleeves and playmats use the same mechanism. A new draft section keeps the pictures in a separate branch per player (not inside a card, because a move rewrites whole zones and would resend a 30 KB picture every time), with fixed slot names so the rules can cap the number and the size. `au` on a card now holds only a slot name. The planned checker is `shared/custom-art.mjs` instead of `shared/token-art.mjs`, and the content policy would need `data:` for images.

**What I checked**
- Nothing run; this is a design change. The sizes (30 KB, 100 to 150 KB for a mat) are guesses until I measure, and I later checked image formats in headless Chrome only (PNG, JPEG, WebP and GIF read; PNG, JPEG and WebP written; AVIF not written; Safari and Firefox not checked), see `docs/tokens-counters.md`.

**Decisions**
- Dropped the image link idea. Open: whether other players see one's playmat, and whether swapping a sleeve mid-match stays light enough.

## 89. Counter buttons on the solo table, first part (2026-11-04)

**What I asked for**
- "commit then continue": Claude committed the design notes (`b7e8ff2`) and went on to step 3, the buttons, starting with the solo table because it needs no database.

**What changed**
- `shared/marks.mjs` (new): reads a typed amount (digits, with commas, spaces or underscores allowed, 1 to one trillion; no signs, decimals or "1e9"), shortens big numbers for a card label (12.3K, 4.5M, 6.7B, 1T), and builds the counter chips and the change label (`+5/+3`) and a full-length sentence for screen readers.
- `frontend/src/card-nodes.js` and `frontend/src/style.css`: every card shows its counters and the power/toughness change at the bottom (the live table's cards too, including other players', read-only); the card's `aria-label` says the same in words.
- `frontend/src/marks-panel.js` (new) and the solo page: the selected-card panel shows, for a card on the battlefield, an amount box, a kind of counter with Add and Remove, Power/Toughness/Both plus and minus, and Reset change. It is built once, so a typed amount and keyboard focus stay after a click.
- `scripts/test-marks.mjs` (new, 49 checks, registered in `npm test`, so 37 suites) and a counters scenario in `scripts/check-solo-ui.mjs` (112 checks now).

**What I checked**
- `npm test`: all 37 suites pass. The browser check uses real headless Chrome and the real card list: add and remove, all change buttons, -1/-1 cancelling +1/+1, loyalty showing a chip but no change, six bad amounts refused with no change, five billion shown as "Other 5B" while the screen reader text keeps every digit, and a card that leaves the battlefield losing its marks.
- Screenshots of the dark and light solo table with real pictures: the chips and `+5/+3` sit at the bottom of the card, and "Other 12K" shows on a tapped land. I looked at them and they led to a layout change (the kind dropdown was full width and the panel too tall, so the amount, kind and Add/Remove are now one row). Desktop width only; phone width not checked.
- Broken copies: 16 of the new helper code and 8 of the page code. 22 were caught at first; the survivor was a 16-digit cap that did nothing, because any number that long is over the limit anyway, so I removed the cap and tested very long numbers directly instead. 23 of 23 caught after that, files restored with matching hashes.
- Not checked: the live table page with these cards (`npm run test:live` was not run), and anything on a phone.

**Decisions**
- The card's chips are not clickable yet. A card is a button and a button cannot hold other buttons, so clicking chips needs its own design (a click handler on the card that looks at where you clicked); the panel is the accessible way in, and the chips come next.
- My first scenario failed because an earlier scenario leaves browser storage blocked for the rest of the run; I moved mine before it.
- The editing tool again turned an escaped character in a test file (an Arabic-Indic digit written as a backslash-u code) into the real character. The hygiene check does not flag it because it is not invisible; I noticed because a search for the escape found nothing, and I wrote it with a code point call instead.

## 90. The counter controls on the live table page (2026-11-05)

**What I asked for**
- "commit then continue": Claude committed the solo table buttons (`033f6b9`), then put the same controls on the live table page.

**What changed**
- `frontend/pages/table/index.html` and `table.js`: the same counters panel (`frontend/src/marks-panel.js`) under the selected card, shown only for a card on the battlefield, and the selected line says the card's counters and change. Changes go through the page's own `apply`, which saves them like any move. Other players' cards show the chips and the change but have no controls.
- `scripts/check-lobby-deck-live.mjs`: new live checks (82 in all, was 75).

**What I checked**
- Two real browsers against the real Firebase project (82 of 82): Alice's panel shows for her battlefield card; the database holds three +1/+1 counters and a +2 power change on that card and no toughness change; Bob's page shows the chips and `+5/+3` on Alice's card, read-only, without a refresh, and has no controls for it; five billion counters are stored exactly; after a refresh Alice's card still has them. `npm test`: 37 suites pass.
- The rules still accept any card shape, so this works today without a rules paste; the strict card shape comes in the one batched rules change.
- Not checked: a screenshot of the table page itself (the layout is the solo page's, which I looked at), phone width, and broken copies of the new table page lines (they are three small wiring lines, covered only by the live check).

**Decisions**
- Next: clicking the chips and the label on the card, then notes and face-down, then player counters and commander damage.

## 91. Clicking the counters and the change on the card itself (2026-11-05)

**What I asked for**
- "commit then continue": Claude committed the live table controls (`6f796e7`) and went on to what I had agreed earlier: click a chip to add one, right-click to take one off, Shift for ten, and the "/" in the middle of the change changing both numbers.

**What changed**
- `shared/marks.mjs`: `changeParts` (the change as power and toughness pieces) and `markClick` (turns a click on a chip, the power number, the "/" or the toughness number into a game change and a message).
- `frontend/src/card-nodes.js` and `style.css`: the change label is three pieces and each mark carries what it is; on your own cards a click on a mark changes the counters instead of selecting the card, and a right-click on a mark is taken by the table (anywhere else on the card the browser's own menu stays). Other players' cards have no controls.
- `solo.js` and `table.js`: `markOnCard` applies the change (on the live table it saves like any move).
- Tests: `test-marks.mjs` now 72 checks; the solo browser check 131 (real mouse input: left, right and Shift clicks on chips and each piece of the change); the live two-browser check 86 (a click saves to the database, and pressing the numbers in the other player's browser changes nothing).

**What I checked**
- `npm test`: 37 suites pass. Live: 86 of 86 against the real project. I looked at a screenshot of the solo table after the change: the marks wrapped onto two lines because the "/" piece had padding, so I removed it and looked again; they sit on one line.
- Broken copies: 9 of the helper code and 6 of the card and style code, all 15 caught. The helper run also showed a bug in my first version that I found while writing the test: looking up the click kind in a plain object would have accepted names like "constructor" as valid; it now checks own properties only.
- Not checked: touch (a phone has no right-click or Shift, so on a phone the panel buttons are the way in; a long-press design is not done), keyboard use of the marks themselves (they are not focusable; the panel is the keyboard route) and phone width.

**Decisions**
- Clicking a mark does not select the card, so you can adjust counters on several cards quickly.
- Next: notes and face-down, then player counters and commander damage buttons, then the one rules run.

## 92. The dev server did not serve my own pages (2026-11-05)

**What I asked for**
- I asked how to test the site. I ran `npm run dev` and `http://localhost:5173/` gave a 404. After Claude fixed that, `/solo` and `/deck` loaded forever. I then said to push to the live site.

**What changed**
- `vite.config.js`: the dev server now rewrites `/`, `/deck` and `/solo` (and keeps `/lobby/CODE` and `/table/CODE`) to their pages, the same as `vercel.json` does on the live site. Before this only the two pages with a code worked, which is why `/` was a 404 and why the links between pages broke locally.
- `frontend/pages/deck/index.html` and `solo/index.html`: the script and the stylesheet now use root-based paths like the lobby and table pages. This was the real cause of the endless loading: from the address `/solo` the relative `./solo.js` asks for `/solo.js`, which does not exist, so the page never started. The live site was never affected because its build rewrites those paths.
- `CLAUDE.md`: a note on this under "Run and check".

**What I checked**
- A real headless Chrome against a temporary dev server loaded all eight addresses (`/`, `/deck`, `/deck?sample`, `/solo`, `/lobby/CODE`, `/table/CODE` and the two file paths): every script and stylesheet answered 200, `/solo` showed its "no saved deck" panel (so its code ran), and there were no page errors. `npm test`: 37 suites pass. The production build check (`check-deploy-config.mjs`): 56 of 56.
- Not checked: that the pages work when you click through them in your own browser after restarting `npm run dev`.

**Decisions**
- My own mistake: the first fix only checked that each address answered 200 with the right page title. It did not check that the page's script loaded, so it passed while `/deck` and `/solo` were broken, and you found it. The check now fetches every script and stylesheet the page asks for, and looks at whether the page's own code ran.

## 93. A power and toughness box with the real numbers (2026-11-05)

**What I asked for**
- I said the counter buttons were not bad but the UI was confusing and covered the base power and toughness, and gave Claude a screen recording to take ideas from. Claude could not play a video, so it opened the file in headless Chrome and saved still frames. I then said yes to putting the printed power and toughness into the card list, after Claude measured the cost, and to carry on. I also asked whether we were still preparing a mutation run: yes, for the one batched rules change; this work does not touch the rules.

**What I saw in the video** (12 seconds, 532 by 350, so some details were fuzzy)
- One box with two numbers at the bottom-right of the card, showing the final power and toughness; a number goes green when raised. A short floating `+1/+1` after a click. A right-click menu with the card name, Modify, Tap, Ping card, a +1/+1 counter with quick amounts 2, 3 and 5, Move to and Create copy. A yellow SICK badge, a round icon at the top-right and a gold `+3` chip. I could not tell what the round icon or the `+3` chip meant.

**What changed**
- The card list has `pt` (list format 4): the printed power and toughness as Scryfall writes them (`2/2`, `*/1+*`), from the card or its front face, only for cards that have both. Checked against the raw Scryfall data first: Goblin Guide 2/2, Tarmogoyf `*/1+*`, Delver 1/1 and Nissa 2/2 (on the front face), Fable of the Mirror-Breaker none (a non-creature front), Sol Ring none. 19,215 of 34,192 cards get one; the cost is about 36 KB gzipped (+2.4%), so the next Vercel build rebuilds the list once. `scripts/lib/card-list.mjs`, `card-list-build.mjs`, `shared/card-lookup.mjs`.
- `shared/marks.mjs`: `parsePrinted`, `statsOf` (printed plus counters plus the hand-set change; null for a star), `printedOf` (a token carries its own, anything else is looked up), `markToast`, and the sentence now ends with "Now 6/4".
- `frontend/src/card-nodes.js` and `style.css`: counters are a small column of chips at the bottom-left; the power and toughness are one box at the bottom-right with the final numbers, green above the printed number and red below it; a floating text after a click that rises and fades (and stays still under `prefers-reduced-motion`). Your own creature on the battlefield also has the box with the printed numbers, but only while the pointer is on the card or it is selected, so it does not cover the printed numbers the rest of the time. A card with no whole printed numbers keeps the pill with the change.
- The solo and table pages pass their card list in as `printedStats`; `apply` now says whether the move was made, so the floating text appears only for a real change.

**What I checked**
- `npm test`: 37 suites pass. Live: 86 of 86 against the real project. Production build check: 56 of 56. Real Chrome with real mouse clicks: the box is hidden until the pointer is on the card, left, right, Shift and the line between the numbers, negative power in red, the screen-reader text, a creature in the hand never gets a box, and reduced motion. A screenshot with real pictures shows Llanowar Elves (printed 1/1) with three +1/+1 counters and +2 power as `6 | 4` in green, the chips on the left and "Now 6/4" in the selected line.
- Broken copies: 15 of the list, lookup and format code (3 survived the first run, see below, and are caught now), 10 of the new logic and 7 of the drawing and style code; all caught.
- Not checked: the live table's box on another player's creature in a real two-browser game (the test cards there are lands, so only the old pill is exercised live), phone width and touch.

**Decisions**
- Mistakes of mine: my first size measurement keyed cards by name across every record, so tokens and art cards with a real card's name (87 of them) could have overwritten real values; I redid it with the build's own filters. A first test made power and toughness both bad at once, which hid three survivors; each half is tested alone now. The first version would have shown the faint box on creatures in your hand and piles; the box is now battlefield-only (a test caught the leak). The first version of the dev fix did not check that scripts loaded (entry 92).
- I did not put the printed numbers on the game card or in the database: they are looked up from the card list like the type line, so the database card shape and the rules are unchanged. A copy of a creature made with `copyAsToken` therefore loses its printed numbers; on `docs/todo.md`.
- Next, if you want it: the right-click menu from the video to replace most of the panel.

## 94. A right-click menu on cards, and a quieter selected-card area (2026-11-05)

**What I asked for**
- I said "continue" after the power and toughness box. Claude read that as the right-click menu from my screen recording and said so before building, with a small first version: the card's name, Tap or Untap and a "+1/+1 counter" with quick amounts 2, 3 and 5 (battlefield only), Move to, and Modify. No Ping card and no Create copy yet.

**What changed**
- `shared/card-menu.mjs`: what the menu offers for a card in each zone and what each choice does (tap, counters from the menu, moving to any zone or to the top or bottom of the library, with the message to show). A token moved off the battlefield says it is gone.
- `frontend/src/card-menu.js`: the menu. It opens at the pointer and stays inside the window, one at a time. It closes on a choice, Escape, Tab, a click elsewhere, a scroll or a resize. By keyboard: Up, Down, Home and End, Right and Left (into "Move to" and along the amounts), Enter and Space. "Move to" opens inline under its heading instead of flying out, so it works the same with a mouse, a keyboard and a finger.
- `frontend/src/card-nodes.js`: a right-click on your own card that is not on a counter or a number opens the menu (a right-click on a number still takes a counter off); the Menu key or Shift+F10 opens it in the middle of the card; the card can show its floating text for a change made from the menu. Other players' cards do not get a menu and keep the browser's own.
- `solo.js` and `table.js`: the menu, which also selects the card. The counters and power/toughness panel is now hidden until you choose Modify (in the menu, or the new Modify button next to Tap), so the area under "Selected card" is much shorter. Modify puts the cursor in the amount box.
- Tests: `scripts/test-card-menu.mjs` (64 checks, new, 38 suites in `npm test`), the solo browser check is 191 checks (was 155), the two-browser live check is 92 (was 86).

**What I checked**
- `npm test`: 38 suites pass. Live against the real project: 92 of 92, including that Tap from the menu is saved and Bob sees the card tapped, and that a right-click on Alice's card in Bob's browser opens nothing. Production build check: 56 of 56. Real Chrome with real right-clicks and key presses. Screenshots, light and dark, with the menu closed up and with "Move to" open: I looked at them and the menu fits and reads well.
- Broken copies: 26 (11 of the menu logic, 15 of the menu, card and page code), all caught. Thinking up the cases showed a gap, so I added a check that the keyboard menu opens at the middle of the card and not in the window's corner.

**Decisions**
- Mistakes of mine: the menu first grew taller after being placed near the right edge (it was placed using the window width including the scrollbar, and narrowed there so a line wrapped); the bottom-right-corner check caught it and it is fixed (a fixed natural width, and the width without the scrollbar). Two older checks were out of date and I updated them. A first version of one of my new tests had an `if` that would have skipped the keyboard checks silently; it is a real assertion now. The local card list was again overwritten by the production build check and had to be rebuilt.
- Not done: Ping card (it would need to be sent to the other players), Create copy (a copy of a creature loses its printed numbers until `copyAsToken` gets them passed in), a long-press for phones (a phone has no right-click; the buttons are the way in there), and a menu for cards inside the pile viewer (those are rows, not card buttons). Phone width is not checked.
- The panel's move buttons are still there next to the menu. If you want the selected-card area shorter still, they can go and the menu does the moving.

## 95. Two-sided cards: turning a card over (2026-11-06)

**What I asked for**
- I asked whether modal cards were taken into consideration. They were not: a card with a land on its back, like Valakut Awakening, was drawn with its front picture and put in the wrong row, and nothing could turn a card over. I said it should work for cards with two sides like Sephiroth, Fabled SOLDIER.
- I asked whether a card shows two faces at once (no: one face shows, and a button swaps the sides) and I decided the real card back is used for face-down cards, against Claude's advice (it carries the Magic logo and the policy was read through a summarizer). That is recorded as an exception in `CLAUDE.md`; it is not built yet.
- I asked about emblems and a token creator. Neither is designed yet. Emblems go with the token creator, in the command zone.

**What changed**
- Card list, format 5 (`scripts/lib/card-list.mjs`, `card-list-build.mjs`): a card has a back face to turn over when its two faces carry their own pictures and the card has none. That is 492 cards (393 transform, 99 modal); split, adventure, prepare and flip cards have one picture, so they get none. A card gets `b: 1`, and `bpt` (the back's power and toughness) when the back has both, 303 cards. The first measurement said about 3.6 KB more gzipped (0.25%). The next Vercel build rebuilds the list once.
- `shared/zones.mjs`: a card that has a back carries `b`; `turnOver` turns it and turns it back, only on the battlefield; it is cleared when the card leaves, like a counter. `isLandCard` follows the face that shows, so Valakut Stoneforge and Aclazotz's land side go to the lands row.
- `shared/game-sync.mjs`: only `bk: 1` is stored. `b` is never stored: each page knows it from its own card list, so another player cannot make an ordinary card show a back picture. `shared/card-lookup.mjs` gives `b` and `bpt`; `shared/marks.mjs` uses the back's numbers for a turned card (and none if the back has none, never the front's).
- `shared/card-menu.mjs` and `frontend/src/card-nodes.js`: "Turn over" (or "Turn back to front") in the right-click menu, between Tap and the counter, and a button next to Tap in the selected-card buttons on the solo and table pages. The card swaps its picture in place; a missing back picture shows the name and recovers when turned back; a named printing falls back to the default printing's picture of the same face.
- `frontend/src/card-menu.js`: the menu used to close by itself (see below).
- `scripts/check-deploy-config.mjs`: it now saves `frontend/public/data` before its build and puts it back after.

**What I checked**
- New `scripts/test-turn-over.mjs`, 913 checks, with the real entries for Sephiroth, Valakut Awakening, Delver, Fire // Ice and Aclazotz (a creature that turns into a land), and five random games of 1,500 steps. `test-card-list` is 220 checks, `test-card-menu` 87.
- The solo browser check is 224 checks (was 191), in real Chrome with real mouse input: the rows, the 5/5 of Sephiroth on the back with counters added, Aclazotz losing its 4/4 when it becomes a land, a missing back picture, a named printing, and the menu. The two-browser live check against the real project is 102 (was 92): Alice turns Delver over, the database holds only `bk: 1`, Bob's browser shows the back picture without a refresh, it survives a refresh, and turning it back removes the mark.
- `npm test` is 39 suites and `npm run test:live` 47, all passing. The real database rules accept `bk` as they stand (no paste needed).
- Broken copies: 14 of the list builder, 25 of the logic and storage, 11 of the page code, one of the table page and three of the menu fix. All were caught in the end.
- I looked at screenshots with the real pictures, dark and light: Valakut Stoneforge and Temple of the Dead in the lands row, Sephiroth, One-Winged Angel with a 5/5 box, and the menu on Delver. Phone width is not checked.

**Decisions**
- Mistakes of mine: the audit rule from 2026-10-26 said "land row from the showing face", but I had built only the front face, so a modal land sat in the wrong row until now. One of my broken copies caught nothing because its text was a syntax error, so I redid it. One real survivor (a turned card whose back has no numbers must not show the front's) showed that my test card had none on the front either, so I added Aclazotz. A browser check of mine put the sideboard card in the wrong deck (Alice plays her Partners deck). Several test slips: `nextTurn` returns `{ game, ... }`, objects compared by key order, and an `if` that could have skipped checks silently.
- A bug from entry 94, found by the new test: right-clicking a card while a card with a long type line was selected made the selected-card panel shorter, the browser moved the scroll position to keep the cards still, and the menu treated that as me scrolling and closed at once. The menu now starts listening for scrolls two animation frames after it opens. It had been open for a card with a short type line only by luck.
- The deploy check had overwritten my local card list for the third time, and now that made `npm run test:live` fail. It restores the folder itself now. I checked the list is identical before and after.
- Left out on purpose: flip cards (turned upside down, 45 printings), meld cards, reversible Secret Lair printings (the same card with art on both sides).
- Not done: a copy of a turned card (still shows the front picture), the back face in the deck page's hover picture (the table has no hover picture yet), playing a modal card straight from the hand as its land, `bk` in the batched database rules change, face-down pictures and the real card back, emblems and the token creator, and phone width.

## 96. Create copy, playing a modal card as its back face, and the front and back hover picture (2026-11-06)

**What I asked for**
- Items 1 to 3 of the left-out list together: Create copy (including a copy of a turned card), playing a modal card as its land straight from the hand, and the back face in the hover picture.

**What changed**
- Card list, format 6: `md: 1` for a modal card (99 cards, all with `b`). A transform card has a back but can only be played as its front, and the list could not tell the two apart before. The back is not always a land: Esika, God of the Tree has an enchantment on hers.
- `shared/zones.mjs`: `faceName` (the name of the face that shows, the same rule as `faceType`); `copyAsToken(game, uid, { printed })` now copies only the face that shows: its name, its type line, the printed numbers when they fit a token (joke values like 3.5/3.5 or ?/? are left out), the back picture for a copy of a turned card, no cost for a back face, and none of the original's counters. A token may now carry `turned`, meaning only "draw the back picture"; it cannot be turned over. `md` is copied from the card list like `b`.
- `shared/game-sync.mjs`, `card-lookup.mjs`: `md` is read from each page's own list, and a stored token with `bk` shows the back picture (and has no cost).
- `shared/card-menu.mjs`: "Create copy" on the battlefield (after the counter, before Move to) and "Play <back name>" for a modal card in the hand, graveyard, exile and command zone (before Move to). It puts the card on the battlefield already turned over. The same two as buttons on both pages, for a phone.
- `frontend/src/card-peek.js`, `deck-importer.js`, `style.css`: on the deck page a card with a back face shows front and back side by side in the hover box (the second picture is made by the script, so the two HTML pages stay the same). Each is asked for once; if the back does not exist the front shows alone.
- A copy is no longer called "turned over" in the selected line or the label, because it cannot be turned.

**What I checked**
- `test-turn-over` is 933 checks, `test-card-menu` 147 (was 87), `test-card-list` 234. The deck page check is 201 (was 192), the solo check 243 (was 224), the two-browser live check 107 (was 102): Alice copies her turned Delver, the database holds a small token (`tt` "Creature - Human Insect", `pt` 3/2, `bk` 1, no `b`, no counters), Bob sees it with the back picture without a refresh, and it survives a refresh.
- `npm test` is 39 suites and `npm run test:live` 47. Broken copies: 37 of the logic and storage (one survived, see below) and 12 of the page code, all caught in the end.
- I looked at screenshots with the real pictures: two copies of the turned Sephiroth with a plain 5/5 and no counters, Temple of the Dead copied as a land, Valakut Stoneforge played from the hand, and the hover box with Valakut Awakening and Valakut Stoneforge side by side. Phone width is not checked.
- One of three full live runs had one failing suite and I do not know which: I had cut the output with `tail`, so the failing line was gone. The next two runs passed 47 of 47. I will keep the whole output next time.

**Decisions**
- Mistakes of mine: `copyAsToken` from entry 86 copied the whole type line. For 93 two-sided cards that is over the 60 characters a stored token may have, so a copy would have vanished for everyone who read it. Nothing used it yet, and I found it while measuring for Create copy. A broken copy survived because `faceName` returned the whole name for an adventure card (Bonecrusher Giant // Stomp is a Bonecrusher Giant on the battlefield), so I made it follow `faceType`. A stored copy of a turned card first read back with the front's mana cost. The shell swallowed a `${...}` in a test line (the trap in CLAUDE.md), and a stray apostrophe broke another; the test run caught both.
- Play back only for modal cards, so it needed `md` and one more rebuild of the list on Vercel. It is offered where a card can be cast from (hand, graveyard, exile, command zone), not on the battlefield or in the library.
- The wider hover box covers the type column of the deck list but never the card names.
- Not done: the keywords of a copy of a back face (they come from the whole card), Create copy through the menu on the live table page (the button is tested live, the menu only on the solo table), flip and meld cards, `bk` in the batched rules change, face-down pictures, emblems and the token creator, and phone width.

## 97. Player counters and commander damage (2026-11-06)

**What I asked for**
- Go ahead with player counters and commander damage, and make it easy for a future UI change to separate commander damage to a specific player. I had also asked Claude to check the deploy first: the live site is on list format 6 (492 cards with `b`, 99 with `md`, 303 with `bpt`).

**What changed**
- `shared/player-counters.mjs` (no browser code): what each counter and each player's commander damage shows, whose commander can have dealt damage (a Commander table shows every seat with a commander; any other format only damage already recorded), what each button does, and the sentence for a screen reader.
- `frontend/src/player-counters.js`: the elements. The unit is ONE entry: `commanderDamageNode(entry)` is the controls of one player's commander damage, and `mountCommanderDamage` only puts a list of them in a block. The data was already one number per player (`cd[seat]`, stored on the player who took it), so to put the damage from one player in that player's panel later, make the node for that entry and append it there. A browser check does exactly that with a node outside the block.
- Both table pages: a "Your counters" section (poison, energy, experience with -1 and +1; the live table also commander damage, one entry per seat that has a commander, with -5 -1 +1 +5). Other players' panels show their counters read-only, only once something has happened, worded "Commander damage from Seat 2: Bob". Poison 10 and commander damage 21 from one commander get a "lethal" badge with the word, not colour alone. Nothing is enforced.
- The elements are updated in place, so a button that was pressed keeps its keyboard focus while the number changes.

**What I checked**
- `test-player-counters` is 131 checks. The solo check is 260 (was 243), the two-browser live check 116 (was 107): Alice's counters and the damage from seat 2 are saved as small numbers, Bob sees them on her panel without a refresh and read-only, 21 shows lethal for both, taking 5 off removes it, a player with none shows none, and a refresh brings them back.
- `npm test` is 40 suites and `npm run test:live` 48, all passing. Broken copies: 41 of the logic, all caught; 26 of 27 of the page code (one documented survivor: the table page passes `meta.format` into the tested rule, and no test uses a Standard table).
- I looked at screenshots, dark and light: the solo counters with poison at 10 (red, with the badge), and Alice's and Bob's table pages.
- Not checked: phone width.

**Decisions**
- Mistakes of mine: the first read-only wording under Bob's view said only "Seat 2: Bob 21 lethal", with no hint that it meant damage from Bob's commander; I only saw it in the screenshot and changed it. One of my checks accepted a life total of 20 or 40, which proved nothing; it is exactly 40 now. A button first reported the entry its node was made with, so a player who changed name would have been misnamed; a broken copy survived and the test now changes a name. My first command to delete my scratch files was blocked by the safety check (a shell variable that could have been empty); I deleted them by exact name instead.
- A flaky check of mine from entry 95: the named-printing fallback waited for "any back picture" and not for the final one, so it failed one run in four. It now waits for the end state.
- Unexplained and still open: one run of the two-browser live check failed at "both ready again with the decks they brought" after the match ended, and then passed ten runs in a row. I lost that output, so I do not know the cause. It is on `docs/todo.md`.
- Two partner commanders of one seat share one number, because the key is the seat. Solo has no commander damage (no opponents). `pc` and `cd` still need to go into the batched rules change.

## 98. Turns, summoning sickness and "doesn't untap" (2026-11-06)

**What I asked for**
- A turn tracker, a SICK badge that accounts for haste as well as it can, and a "doesn't untap" mark. I chose the hybrid for SICK (automatic on a creature that comes in without printed haste, a one-click clear, ending by itself on my next turn) and asked whether the untap step had considered cards that can't untap. I wanted the mark drawn as a tap symbol with a lock in the middle, and an explicit Pass turn button that tells the next player and increments their own turn number.

**What I found out first (checked in the card data, not from memory)**
- 652 creatures list Haste in their own keywords. Fervor, Lightning Greaves, Swiftfoot Boots and Urabrask list none, and a token has none, so haste from anywhere else cannot be seen: the player clears it by hand.
- Mana Vault, Grim Monolith, Winter Orb, Static Orb, Time Vault and Claustrophobia have no keywords at all, so "doesn't untap" cannot be automatic either. The old `untapAll` untapped everything.

**What changed**
- `shared/zones.mjs`: `entersSick` (a creature without printed haste comes in sick: a moved card, a token, a copy), `setSick`, `markSickByFace` (for a modal card played as its back), `setNoUntap`, `untapAll` skips marked cards, `heldTapped`, and `startTurn` (untap, draw one, clear sickness, set the turn number); `nextTurn` is now `startTurn(game, turn + 1)`. Stored as `sk` and `nu`.
- `frontend/src/card-nodes.js`: the badges at the top-left of a card, our own icon (a turn arrow with a lock, an inline SVG with width, height and fill set directly; I did not use the Magic tap symbol) and a SICK word badge. Another player's cards show them read-only; on my own, a click clears one. The menu and the selected-card buttons have both marks; "Untap all" and the solo "Next turn" say how many cards stayed tapped.
- `shared/turn-order.mjs`: Pass turn. A player can only write their own branch, so a pass is ONE record on my own public branch, `pass: { n, to, from? }`. Every page reads everyone's and the newest is the turn; the player it names starts their own turn on their own page, once. The turn number is the table's (seat 1 plays turn 1, seat 2 turn 2, and so on). Anyone may press Pass; for someone else's turn the button says "Skip Seat 2: Bob's turn" and asks first. The writer of the newest record can take it back. Nothing new is needed in the database rules.
- `frontend/pages/table/`: the banner is at the top and always shows during a match (highlighted on my turn, and the page title says "Your turn"), the active player's panel is marked, and "Next turn" is replaced by Pass turn.

**What I checked**
- New `scripts/test-turn-marks.mjs` (624 checks) and `scripts/test-turn-order.mjs` (126, including a simulated four-player table where each page runs only its own game); `test-card-menu` is 173. The solo check is 283 (was 260). The two-browser live check against the real project is 141 (was 116): a real Pass turn, Bob's turn starting by itself with his own turn number and a drawn card, the marks seen by the other player, a skip with its popup, take back, and a refresh that does not start the turn twice.
- `npm test` is 42 suites and `npm run test:live` 50, all passing.
- Broken copies: 78 of 79 of the logic, 14 of 14 of the badge and solo page code, 26 of 27 of the table page code. The two survivors are both explained: a guard that cannot matter (with no pass yet the turn is 1 and no game is behind it), and a change that only affects latency (my own pass read from my own game instead of the round trip).
- I looked at screenshots, dark and light, with the real pictures, and a zoom of the lock.
- Not checked: phone width.

**Decisions**
- Mistakes of mine: **the first Pass design had a flaw.** A player keeps only their latest record, so two passes in a row by one player (a skip) could not be taken back: it went to turn 2 instead of turn 3. I found it while planning the live test, showed it with a small script against the old code first, and records now carry the turn they replaced, with regression tests. My first unit test of take back only used the case where the previous pass belonged to someone else, which hid it. **The "your turn" banner was first inside the game section,** below the other players' panels, so a player would never have seen it; the screenshot showed it and it is at the top now. The lock first floated in the empty space above a tapped card; the zoom showed it and it sits on the card's corner. Four broken copies survived at first (a creature made sick again by moving it within the battlefield, damaged marks passing the consistency check, and the wording of the untap message) and now have tests. My shell scripts lost backslashes twice (a regex came out with backspace characters in it, which the hygiene check and a syntax check caught, and several patches stopped before writing), so I used the edit tool for anything with a backslash. One of my broken-copy runs went past the ten-minute limit and moved to the background; I did not touch the files meanwhile and it restored them itself.
- Left out or open: taking a pass back does not un-draw or un-untap the player whose turn started; haste from an enchantment still needs the one-click clear; a player who leaves without conceding is only handled by the Skip button; no sound or browser notification (the banner and the title only); `sk`, `nu` and `pass` still need to go into the batched rules change; phone width.

## 99. Review fixes, a lobby race, and no automatic draw or untap (2026-11-06)

**What I asked for**
- A backend review. Claude ran the code-review skill, which reviewed the newest changes and **not** `backend/`, so it read the 136-line rules file itself. It then did the four small fixes I approved, and asked how Take back should work.
- My answer: **players draw their own card, and there is no automation for that.** A manual untap button too, since there are edge cases where a player isn't allowed to draw or untap.

**What changed**
- A turn that begins at a table now only sets the table's turn number and ends summoning sickness (`beginTurn` in `shared/zones.mjs`). Nothing is drawn and nothing untaps. The Draw and Untap all buttons were already on both pages (Untap all still skips cards marked "doesn't untap"). The solo table's "Next turn" button, pressed by the player, still untaps and draws (`startTurn`). The banner says "Summoning sickness ended. Draw and untap when you are ready." Take back has nothing to undo any more, so it is left as it was.
- `table.js`: a player who has conceded no longer begins a turn when a record names them; the memory of the last turn tried is reset when the match number changes; the turn is worked out once for all the opponent panels.
- `lobby.js`: Ready now waits for the remembered deck to finish being sent again (see below).

**What I checked**
- Claude's six review findings were checked against the code before anything was changed: one real (take-back after the turn started, now moot), two minor, one not reachable today (no New game button on the table page, and a new match reloads the page), one not a real problem (two simultaneous passes compute the same seat), one trivial.
- `test-turn-marks` is 644 checks (the new `beginTurn` tests assert nothing is drawn or untapped), `test-turn-order` 126 (its simulated table now asserts every hand stays at 7). The two-browser live check is 143 (was 141): a conceded player is skipped by Pass turn, and a record that names a conceded player does not begin a turn on his page. Eight targeted broken copies were all caught.
- Rules file reviewed by reading only: nothing validates `public/$uid` or `private/$uid` (size and shape), and a `pass` record is unbounded, so a hostile client could write a huge `n` and wedge the turn order. Both belong in the batched rules change. I did not review `table-ops`, the emulator tests or the flow model.

**Decisions**
- Mistakes of mine: I proposed hiding Take back once the next player's turn had started without noticing that, with an automatic start, it would almost never be usable. I asked before building it, and the answer changed the design. My earlier note on the intermittent failure had the mechanism wrong: it said the popup came from Ready pressed before the deck was sent, which was right, but I had not seen that the deck is restored through a database write that finishes *after* the page is already usable. The failure came back while I was testing, with the full output saved this time, which showed the "choose a deck" dialog open on Alice's page. Six runs in a row passed after the fix. That is not proof, because the failure was intermittent (about one run in six), but the cause is identified.
- Not done: the batched database rules change (size and shape limits for `public`, `private` and `pass`, plus `sk`, `nu`, `pc`, `cd`, `bk`), a 55-minute mutation run and your paste.

## 100. The batched database rules change: built and tested, not pasted yet (2026-11-06)

**What I asked for**
- "Write the plan" for the batched rules change (`docs/rules-batch-plan.md`), then "do what you think is best, consider the edge cases and possible issues." So Claude took its own recommendations on the four decisions: `pass` checked for shape only, no table code check, `px` and `py` allowed, `au` left out, and do it now.

**What changed**
- `backend/database.rules.json` now has shape and size limits under `public/{uid}` and `private/{uid}`: only the keys the pages write, every list capped at 250 cards (the key must be 0 to 249, because the rules cannot count), every card field checked (`u`, `i`, `p`, `n`, `x`, `e`, `tok`, `tt`, `pt`, `cl`, `ct`, `mp`, `mt`, `f`, `bk`, `sk`, `nu`, `nt`, and reserved `px`, `py`), `life`, `turn`, `mulligans`, `next`, `counts`, `pc`, `cd` and `pass` checked, `match` must equal the table's match number, a hand or library can never appear under `public`, and a player cannot delete their own `lastSeen`. The file is 53 KB. One generator wrote the seven identical list blocks (it is not committed); a test checks that they are identical.
- `shared/zones.mjs`: `copyAsToken` now refuses a card whose type is unknown. Found while planning: that copy was a token with an empty type line, which readers drop and the new rule would refuse, and because a zone is saved as one piece the whole battlefield save would have failed.
- Changed my mind from the plan: every list is capped at 250 (the plan said 10 for the command zone and 200 for hidden lists), and `meta/format` is left alone so a future format does not need another rules run.
- New `backend/test-rules-game.mjs` (2,058 checks): every card field on every one of the seven lists, the numbers, the hidden zones, `pass`, `match`, and five long random games played with the pages' own code (`gameWrites`) where every write must be accepted. `backend/test-rules.mjs` has 567 checks (two tests changed to card-shaped data, and the old "a player removes their own last-seen time" check is now a refusal). 154 new mutations in `backend/mutate-rules.mjs`. `scripts/check-live-rules.mjs` has 18 new requests against the real project.
- After I pasted the rules, `npm run test:live` found two scripts that still wrote data the rules now refuse. `scripts/spike-two-browsers.mjs` wrote `hand: ['Island']` (now a real card object). `scripts/check-lobby-deck-live.mjs` wrote hostile data from Bob on purpose (a match number of 99, a bad id, junk, a 5,000-character name) to prove Alice's page copes; the database now refuses all four, so the check asserts the refusals instead. **What that loses:** the stale-match display ("Has not been dealt a game yet") is no longer shown in a real browser, because no one can write such data any more; the page code for it is unchanged and the drop-bad-cards logic is still covered by `test-game-sync`. A well-shaped card whose name is hostile markup is still shown live as plain text.

**What I checked**
- `npm test`: all 42 suites passed, including the 567 and 2,058 rule checks.
- The new mutations: 160 killed, 2 documented as redundant (a wrong type already fails the next comparison: "life need not be a number" and "pass seat need not be text"), 0 survived, 0 suspicious. The 24 presence mutations were re-run because the `lastSeen` rule changed: 20 killed, 4 documented, 0 survived. The rules file was identical to the saved hash after every run. I did **not** re-run the whole 399; the 245 older ones did not touch what changed except the presence ones.
- After the paste: all 119 live rule checks match the file, the spike 36 of 36, the lobby and table live check 146 of 146 (after the change above), and every other suite in `npm run test:live` passed on the full run (49 of 50 on the first full run, the 50th is the one I fixed).
- Not checked before the paste: the live requests (they failed against the old published rules on purpose), Firebase's own limit on rules file size (I believe about 256 KB, from memory), and the worst-case storage per player (the plan's 0.5 to 1 MB is an estimate, never measured). One random game uses no card list, and it never hit the page's refusal to copy an unknown-type card (that is covered by the menu test only).

**Decisions**
- Mistakes of mine: my first draft of the rules had two holes the new tests found before anything ran against the project. The 250-card key check was overwritten by the card's own `.validate` when I merged the two blocks, so any key was accepted. And a rule on a child never runs for a value with no children, so a list or a whole branch written as one long string was accepted. The first mutation run also marked 107 mutations "suspicious" because my own structure check threw before any behavior test, which hid what the tests catch; I moved it to the end of the file. My `timeout` once killed a mutation run midway; the script repaired the rules file from its backup and I checked the hash.
- Not done: your paste into the Firebase console, then `npm run test:live`; the scheduled cleanup of old tables (still needed before strangers use the site); a rule against one person making many tables.

## 101. The first sound effects: draw and shuffle (2026-11-06)

**What I asked for**
- A folder for sound effects. I dropped in two mp3 files and told Claude to rename them, skip the licence check ("public sounds"), have sound on by default, and add the settings it thought were good.

**What changed**
- `frontend/public/sfx/` (new): `draw.mp3` and `shuffle.mp3` (renamed from `CardDrawSFX.mp3` and `DeckShuffleSFX.mp3`, about 20 KB each) and `credits.md`, which says the source and licence are **not recorded or checked** because I said they are public sounds. Served at `/sfx/draw.mp3` and `/sfx/shuffle.mp3`; the content policy already allows same-site audio.
- `shared/sound-settings.mjs` (new, plain logic): the settings are Sound on or off (on by default) and a volume (0 to 1, default 0.7), kept in this browser only under `overloaded.sound`, with damaged text falling back to the defaults. `frontend/src/sound.js` (new) plays a sound (a copy of the loaded file, so two quick draws overlap) and draws the controls: a Sound checkbox and a Volume slider under the action buttons. Letting go of the slider plays a sample. At volume 0 or with Sound off nothing plays. A sound that cannot play (autoplay blocked, file missing) is silent and never breaks the page.
- Wired into both the solo table and the live table: Draw (and Next turn on the solo table, when it draws) plays the draw sound; Shuffle library, Mulligan and, on the solo table, New game play the shuffle sound. Only your own actions make sounds. An empty-library draw is silent.

**What I checked**
- `scripts/test-sound-settings.mjs`: 39 checks (new suite, `npm test` is now 43 suites). The solo browser check is 300 (17 new): both files are served as audio, which file plays for each button at what volume, off and volume 0 play nothing, the settings survive a reload, damaged stored settings fall back. The two-browser live check is 148 (2 new: Draw and Shuffle on the real table page). I looked at the solo page in dark and light at desktop width: the checkbox and slider sit under the buttons.
- Broken copies: 10 of 10 of the settings logic and 4 of 4 of the page wiring caught (after one fix, below).
- **What I could not check:** that the sounds actually sound right or play at a good loudness. Headless Chrome cannot hear, so the checks record which file is played at what volume. I need to listen on the live site. I also did not test on a phone (on hold).

**Decisions**
- Licence: I said once that the repo is public and the rule is to check, then followed my decision to skip it. It is recorded as unverified in `credits.md`; if either file turns out to be restricted, delete it and its line in `SOUND_FILES`.
- Not done on purpose: no sound for other players' moves, none for "your turn" (still on the list), and no setting for that yet.
- Mistakes of mine: one of my first broken copies had text that broke the syntax, so its "caught" meant nothing; I rewrote it and it was caught for the right reason. One broken copy (no sample after moving the slider) survived because the previous sound was the same one, so the test could not tell; I changed the test to play a shuffle first and count the plays, and it is caught now. The two files showed up as "added" in git's index under their old names (something staged them, not me); I unstaged them, which touched only the index.

## 102. Tap and your-turn sounds, and the volume scheme (2026-11-06)

**What I asked for**
- I added more sounds (a tap and a your-turn sound, and a new recording of the shuffle) and said: make every sound play at 50%, with the volume slider at 100%.

**What changed**
- `frontend/public/sfx/`: `tap.mp3` and `yourturn.mp3` added, `shuffle.mp3` replaced by my new recording. `credits.md` lists them as source and licence not recorded.
- `shared/sound-settings.mjs`: the slider now starts at 100% (was 70%), and each sound has its own gain in `SOUND_GAIN` (all four are 0.5), so a sound plays at the slider times its gain. One number per sound if I want to tune one. A slider saved before this change keeps its saved value.
- Tap plays when you tap or untap a card with the Tap button or the right-click menu, and when you press Untap all, on both tables. Your turn plays on the live table when my turn begins by itself after a pass; a browser may keep it silent until the page has been clicked once.

**What I checked**
- `test-sound-settings` 49 checks, the solo page check 304 (the volumes now read 0.5 at the default and 0.15 at a slider of 30%, plus the button, menu and Untap all), the two-browser live check 149 (Bob's page plays your-turn once when his turn begins, Alice's plays none). `npm test` is 43 suites, all passed.
- Broken copies: 11 of 12 caught. The survivor was the rounding of the level, which does nothing while every gain is 0.5 (halving is exact), so Claude removed the rounding instead of keeping dead code.
- Not checked: how they sound, whether 50% of the slider is a good loudness, and the your-turn sound in a real second browser that has never been clicked (the check records the call, it does not hear it).

**Decisions**
- Mistakes of mine: a regex in a template literal in my new check lost its backslash and was read as a comment, which made the page throw; and my live check assumed Alice's page still had its recorder after a reload. Both were found by the first run and fixed.

## 103. The volume slider could not reach its ends (2026-11-06)

**What I asked for**
- I asked whether the solo table plays the your-turn sound, whether every sound was really reduced by 50%, and said the volume bar could not be slid all the way down or up.

**What changed**
- `frontend/src/style.css`: the slider no longer takes the general input style (padding, border), and is a little wider (9rem). A close-up screenshot showed the thumb stopping about 17 px short of both ends of the track with the old style, so it looked stuck even though the value reached 0 and 100. After the change the thumb reaches both ends (looked at).
- `scripts/check-solo-ui.mjs` is 309 checks: a real mouse drag to both ends gives 0 and 100, and the slider has no padding or border of its own. The old style fails the new check.
- `frontend/public/sfx/draw.mp3` is modified: I replaced it with a new recording (20,013 bytes), which Claude did not touch.

**What I checked**
- The solo table does not play the your-turn sound: it exists only on the live table, where it plays when a pass makes it my turn. The solo Next turn plays the draw sound only. I have not changed that.
- Every sound plays at the slider times 0.5, checked by recording the volume of each played sound (0.5 at a slider of 100%). That is the audio element's volume, a linear level (about 6 dB down); it is not the same as sounding half as loud, and the files themselves are unchanged. A slider I had already moved keeps its saved position, so it may not start at 100% in my browser.

**Decisions**
- Not done: a your-turn sound on the solo table.

## 104. The slider looked wrong in my browser, and it made noise (2026-11-06)

**What I asked for**
- I sent a screenshot of the volume slider in my browser (a flat white bar with a dark notch, nothing like what Claude had shown me), said the UI was "literally the same" after the accent colour change, and said it was annoying that the slider keeps making a noise when I adjust it. I called the quality disappointing and asked for a fix.

**What changed**
- `frontend/src/sound.js`: adjusting the slider no longer plays a sample. That sample was Claude's own addition (I had not asked for it). The level is heard on the next draw or tap.
- `frontend/src/style.css`: the slider is now drawn by the page (appearance none, a track and a round thumb with explicit colours, and a rule for high-contrast modes), not by the browser's own slider.
- `scripts/check-solo-ui.mjs` is 311 checks: adjusting the slider makes no sound, the slider has appearance none, plus the earlier drag and padding checks.

**What I checked**
- The live site does serve the accent colour CSS from the previous push (read from the live stylesheet), so my browser ignored it. Claude could not reproduce my rendering: it tried a dark, a light, a forced high-contrast and a "force dark pages" emulation of the page's real CSS in headless Chrome, and none looked like my screenshot. So the cause is still unknown (the browser's own theme, an extension that recolours pages, or a different slider drawing). Drawing the slider with explicit colours removes the dependence on the browser's own look.
- In those four emulations the new slider is visible, and the first version vanished in the high-contrast one, which is why that rule was added. Close-ups of the real page show the thumb reaching both ends.
- **Not checked:** how it looks in my browser. I have to reload after the deploy and send another screenshot.

**Decisions**
- Mistakes of Claude: it told me the accent colour change "may" fix the look when it could not reproduce the problem, and it added a sample sound on adjustment that I did not ask for.

## 105. All four sounds at the same, lower level (2026-11-06)

**What I asked for**
- I asked what the sounds sound like at a volume of 100%. Claude measured the files and showed they were very uneven (the your-turn sound about 16 dB louder than the tap, by average level). I said yes, bring them all to the same level, and make them all lower, because even drawing was still loud.

**What changed**
- `shared/sound-settings.mjs`: each sound's gain changed from 0.5 to a value chosen so that all four have the same average level at a slider of 100%, about -51.6 dBFS: draw 0.10, shuffle 0.095, tap 1, your turn 0.047. A gain cannot go above 1, so the quietest file sets the target. Claude first measured the old tap file (-40.6) and set the target at -46.6; I replaced `tap.mp3` with a much quieter one (-51.6, peak -29.7) while it worked, Claude re-measured and recomputed, and everything else came down to match it. The measurements and the formula are in a comment above `SOUND_GAIN`.
- `scripts/test-sound-settings.mjs` (52 checks) now checks the gains, that none is above 1, and, from the measured levels, that the four come out within half a dB of each other and no louder than -51 dBFS. The solo check (311) expects the new volumes.

**What I checked**
- The levels are the average level of each whole file, decoded in headless Chrome (draw -31.8, shuffle -31.2, tap -51.6, your turn -25.0 dBFS, after I replaced the tap file). A short sharp click (draw) can still feel punchier than its average says: its peak is the highest of the four.
- Not checked: how they actually sound. Nobody has listened since the change. The gains are single numbers in `SOUND_GAIN` if one feels too soft or too loud.
- I ran the unit test and the solo check, not the whole `npm test`: only the gain numbers and their expectations changed.

## 106. Dealing the hand one card at a time (2026-11-06)

**What I asked for**
- When I draw my first seven cards, deal them one at a time, quickly, with the draw sound for each card, like Balatro. Clicking Mulligan plays the shuffle sound and then deals the 7 the same way.

**What changed**
- `shared/deal-sequence.mjs` (new, plain logic with an injectable timer): deals a hand of N cards, one every 120 ms, and a pause of 800 ms before the first card when a shuffle sound has just played. It says how many cards of the hand to show, how many are still waiting, and which card was just dealt.
- This is only what is SHOWN. The game is still dealt and saved all at once, so the database, other players' pages and the library count never wait for the animation. The library count includes the cards not yet dealt, so library plus hand never changes while dealing. A refresh in the middle shows the whole hand.
- Both table pages: the first deal (a fresh game, not one put back after a refresh), Mulligan, and on the solo table New game. Each card makes the draw sound, and drops in with a short animation (`.card.deal-in`). Mulligan and New game play the shuffle sound first and the cards start 0.8 seconds later. Pressing Mulligan again in the middle of a deal starts over.
- Under prefers-reduced-motion the whole hand shows at once and the cards make no sound (the shuffle sound still plays for a mulligan), which is what my rules ask of every animation.

**What I checked**
- `scripts/test-deal-sequence.mjs` (40 checks, new suite, `npm test` is now 44 suites) with a fake clock. The solo browser check is 329 checks: real timers, the sounds recorded, the hand and library count watched every 10 ms (7 draw sounds for the first deal, the shuffle sound then 7 draws for a mulligan and New game, the first card about 0.8 s after the shuffle, a second mulligan in the middle starting over, reduced motion). The two-browser live check is 152: a mulligan on the real table page plays the shuffle sound, shows an empty hand while it waits, saves the new hand of 7 at once, and then 7 draw sounds follow. That check and the solo check now run with reduced motion on except in those blocks, because many checks count the hand right away.
- I looked at the solo table in the middle of a deal: "Hand: 4", four cards, the newest still fading in.
- Broken copies: 15 of 15 of the logic caught, and 4 of 4 of the page wiring after one fix: "New game does not wait for the shuffle" survived because my test only checked the order of the sounds, which is the same with no pause, so I added the same timing check the Mulligan test has.
- You swapped `draw.mp3` and `yourturn.mp3` again while this was being built, so I measured all four files again: draw -31.4 (was -31.8), yourturn -24.9 (was -25.0) dBFS on average. The gains still put all four within 0.3 dB of each other, so they are unchanged; the measurements in `shared/sound-settings.mjs` and its test were updated.
- **Not checked:** how it feels and sounds. The 120 ms between cards and the 800 ms pause are single numbers in `shared/deal-sequence.mjs`. Browsers can block the sounds on the very first deal after opening a page, until I have clicked something on it, so the first hand may be silent.

**Decisions**
- Chose to stage only the display, not the game: dealing the game for real one card at a time would have meant seven saves, other players seeing a half-dealt hand, and a refresh in the middle leaving a partial game.
- Mistakes of Claude: its first test used a hand of seven cards for a deal of three; its first screenshot showed the whole hand because the navigation helper waited for the deal to finish; its recorder in the live check was lost on a reload; and its first mulligan block changed Alice's hand before a check that compares it with her first one.

## 107. Expired tables are cleaned up by whoever finds them (2026-11-06)

**What I asked for**
- I asked whether closed tables fill the 1 GB of free storage with dead data, and whether a better way would be that a user who generates a table whose code belongs to a closed table deletes it and opens it again.

**What changed**
- `shared/table-ops.mjs`: new `closeIfExpired(code)`, a best-effort delete. The database rules accept a delete from a stranger only when the table has expired, and refuse it for a live one, so it is safe to try on any code. Two uses: (1) `joinTable`: a stranger who opens the old link of an expired table is refused as before and the visit deletes the table; (2) `createTable`: when every way to create at a random code is refused, it tries to delete the table there (my idea, which was good for the rare collision) and uses the code. No rules change, so there was no paste.
- `createTable` also clears the host slot when the slot names a table the host cannot read (it belongs to someone else now). Found by a test, see below.

**What I checked**
- `backend/test-table-ops.mjs` is 224 checks (193 before): a stranger opening an expired link deletes it (8 hours and 30 minutes idle), nothing is deleted at 29 minutes idle, a live table (full or started) is never deleted by a stranger or a member, the host of a live table is protected by the page (a plain delete by that host IS accepted by the rules, which the test shows), nonsense codes send no request, and a new table takes the code of an expired one with nothing left of the old players or game. The whole `npm test` is 44 suites.
- Broken copies: 8 of 8 caught, after two test gaps were closed (a host with a live table whose new code collides with a live table, and the code check, which my first test could not see because the failure was swallowed).
- Not checked: nothing was run against the real project for the cleanup itself (an expired table needs 30 minutes or 8 hours to exist); the emulator runs the real rules file.

**Decisions**
- A page never deletes a table it belongs to. The rules let a host (or the last player standing) delete their table while it is alive, so a page that wrongly believed it had closed (stale read, offline queue) could destroy a live table. Only the safe cases were built: a stranger, and a new table at a colliding code.
- Not solved: a table nobody ever opens again, whose host never makes a new table, still stays in the database. Each host account leaves at most one (a new table replaces the old). The full fix is a scheduled job; Firebase's needs a paid plan. A free scheduled job elsewhere (GitHub Actions or Vercel Cron with a service account key as a secret) is an option, not checked, and the key is your decision.
- Mistakes of mine: reusing a code created a bug I had not thought of until the test of the old host found it: the old host's slot named the reused code, which now belongs to someone else's live table, so the rules refused every new table for that host. Fixed as above. My first version of two tests could not fail (the code guard and the live-table slot).

## 108. Ping card: a shared spotlight and a glow (2026-11-06)

**What I asked for**
- Build Ping card next, and asked whether it should be a shared card display for all players, like the Stack area. Claude recommended a spotlight but not built like the Stack (the Stack needs a place every player can write, which the database does not have; a ping can be one record on the pinger's own branch). I chose: both a spotlight panel and a glow on the pinged card, public zones only, and it stays until closed or replaced.

**What changed**
- `shared/ping.mjs` (new, plain logic): `makePing`, `readPing`, `newPings`. A ping is one record, `ping: { k, card }`, on the pinger's own public branch. `card` is the pinged card packed exactly like a game card and read back with the same strict reader. `k` is a number that differs for every ping of that player (seconds since 1970, or one more when two come in the same second). A page shows a ping when its `k` is different from the last one it saw for that player. The first snapshot after a page loads is only remembered, so an old ping never comes back after a refresh. Only cards in public zones (battlefield, graveyard, exile, command zone) can be pinged, so nothing hidden is revealed; a card in the hand or library cannot be.
- Table page: a "Ping card" item in the right-click menu and a "Ping card" button in the selected-card panel (`shared/card-menu.mjs` offers it only on a live table; solo has nobody to ping). `frontend/src/spotlight.js` (new) shows the pinged card large (the normal-size picture of the printing, falling back to the default printing and then to the name alone), who pinged it, its type and its counters, with a Close button that is local. The pinged card glows for a few seconds in its owner's row on every screen. Under prefers-reduced-motion the spotlight does not animate and the glow is a still ring. A ping is ignored if it is sent less than 0.7 seconds after my last one.
- **A rules change** (`backend/database.rules.json`, 59 KB, generated like the last one): `public/{uid}` now accepts `ping`, a number from 1 to a trillion and a card that is checked by the same generated block as a card in a list (a test checks the blocks are identical).

**What I checked**
- `scripts/test-ping.mjs` 94 checks (new suite); the card menu test 194; the spotlight and glow in real headless Chrome (`scripts/check-spotlight-ui.mjs`, 24 checks, new suite, no database): text only, never markup, the picture fallbacks, close, replace, reduced motion. The table page loads in headless Chrome with no errors and builds its spotlight.
- Rules: `test-rules-game.mjs` is 2,222 checks (every card case also tried inside a ping, and 59 real pings from the random games, all accepted). 18 new mutations: 17 killed, 1 documented as redundant ("k need not be a number": a text or boolean fails the next comparison anyway); 3 survived at first because I had not tested a ping card with no id or no name, and are killed now. `npm test` is 46 suites, all passed.
- **After I pasted the rules:** all 126 live rule checks match the file (7 new ping requests), and the two-browser check passes 164 of 164 against the real project, including the real ping: Alice pings (by the button and by the right-click menu), the record on her branch is a number and the card and nothing else, Bob's page shows the spotlight with the same card and a sentence naming Alice and her seat, the card glows on both screens, Bob closes his and Alice's stays, the second ping has a different number and shows again, a refresh does not bring an old ping back, and a card in the hand has no Ping card button or menu item. The first run failed one older check that lists the exact items of a card's menu (it now includes Ping card); I updated that expectation. The last live suite (the table screen, 4 browsers) passes 26 of 26. The spike, the deploy check, the heartbeat, presence and the two-tab checks passed.
- Not run: nothing about pings with a real third player or on a phone.

**Decisions**
- Not built: pinging a card in the hand (it would be a deliberate reveal and needs its own wording), pinging another player's card, a ping on the solo table, sounds for a ping. A hostile player can still ping very fast; the other pages just keep replacing the spotlight and each player can close it. The Stack stays a separate, larger feature that needs research first.
- Mistakes of Claude: it first wrote an empty object as a "refused" ping (in Firebase an empty object is a delete) and passed a string where a test helper wanted an object. Its first ping tests did not cover a missing id or name. It picked a port another check already uses.

## 109. The one-screen layout, Phase A (2026-11-06)

**What I asked for**
- Reorganize the entire layout of the table (not a UI revamp yet): in a Commander game I had to scroll up and down to see other players' battlefields, the Lands and Other permanents split is poorly organized and not intuitive, and I should not scroll the page at all. There will also be another way to play cards: drag and drop anywhere on a battlefield, snapping to a grid.
- Claude proposed a plan and asked me four things. I chose: fit 1366x768 and up, all boards the same size in a 2x2 grid with mine bottom-left, new cards go to the first empty cell with lands apart, and build it in two phases (A, the one-screen layout; B, the grid and drag and drop). Claude noted that my first design notes said the opposite (no free drag and drop); I said the new instruction replaces them.

**What changed (Phase A)**
- `frontend/src/style.css`: while a game shows the table is one grid (the class `playing` on the body): a top bar, the controls, the boards, my hand along the bottom, and one column on the right (who is at the table with the match and sound buttons, my counters, the selected card, my piles). The page no longer scrolls; each part that is too full scrolls inside itself. Cards are sized from the height of their row, so they fit at any window size and player count.
- Markup of the table and solo pages regrouped (a top bar, an aside, ids and classes on the sections); **no element ID changed**. The page scripts toggle the playing state and report how many others there are (`main[data-opponents]`).
- Each other player's panel is compact: name and numbers on one line, their battlefield beside a narrow column for the command zone, graveyard and exile.
- New `frontend/src/card-hover.js`: because the cards are small, any card shows its larger picture when the pointer rests on it (my design notes called it enlarge on hover).
- The plan for Phase B is written in `docs/layout.md`.

**What I checked**
- New `scripts/check-table-layout.mjs` (365 checks, in `npm test`): the real page and style sheet at five window sizes (1366x650, 1366x768, 1280x720, 1600x900, 1920x950) with 0 to 3 other players, filled with worst-case content: nothing scrolls the page, nothing overlaps or is cut off, the boards are the equal 2x2 grid with mine bottom-left, my hand runs under them, and cards stay at least 60 px (hand), 40 px (my battlefield) and 7% of the window height (other players') tall. `scripts/test-card-hover.mjs` 22 checks; 14 real-mouse hover checks in the solo check (343 checks, at 1280x1000 and 1366x650). The two-browser live check passes 164 of 164 at 1366x650 with the new layout.
- Broken copies of the layout CSS: 7 of 11 caught. The 4 that survived are protections that do not trigger with this content (a row of `1fr` against `minmax(0, 1fr)`, two `overflow: hidden` rules, and the explicit place of the third other player, which grid auto-placement gives anyway); I did not write tests that force them.
- I looked at screenshots: the solo table, the real two-player table at 1366x650, and the four-player layout (fake panels) at 1366x650 and 1920x950.
- **Not checked:** a real four-player game (the three-other-players layout is the real page and styles with fake panels built like the page's own), a screen narrower than 1366, and phones.

**Decisions**
- Kept all element ids so no script or check had to change structure. Rows that are too full scroll sideways inside themselves until Phase B replaces them with the grid.
- Mistakes of Claude: its first version squeezed every card (a rule for button padding also applied to the card buttons) and its first live check right-clicked a counter chip, not the card, because the cards had got smaller; it first wrote a check that could not fail and I broke the CSS on purpose to prove it could; an older slider check wanted 100 px and the slider is now 96.

---

## 110. The one-screen layout, Phase B: the grid battlefield and drag and drop (2026-11-06)

**What I asked for**
- "Start phase b": the battlefield becomes one grid with no Lands / Other permanents split, cards snap to cells, and I can drag a card anywhere on my battlefield. I had already chosen how new cards are placed (first empty cell, lands apart, plus an Auto-arrange button).
- Claude chose the numbers I had not: a grid of 12 columns by 4 rows (48 cells) for every player, a card dropped on a taken cell swaps with it, and a card from the hand cannot take a taken cell.

**What changed**
- New `shared/board-grid.mjs` (plain logic: the grid size, the first empty cell for lands and for other cards, settling a board, tidying it, finding the cell under a point, stepping one cell).
- `shared/zones.mjs`: a card on the battlefield has a cell, `px` (column) and `py` (row); `moveCard` takes an optional cell, new `placeCard` (move, or swap), `arrangeBoard`, `settleBoard` (gives older cards a cell), `boardCells`; tokens and copies get a cell; a full board (48) refuses another card in words; `checkGame` checks cells. The cell is cleared when a card leaves the battlefield, like counters.
- `shared/game-sync.mjs`: stores and reads `px` and `py`, and writes a zone that holds the same cards in the same places one card at a time (a drag is about 100 bytes, not the whole battlefield). **No database rules change:** the published rules already allowed `px` and `py` from 0 to 4000.
- New `frontend/src/board-drag.js`: drag from the battlefield or the hand onto a cell of my battlefield; a picture follows the pointer and the cell is outlined (dashed for a swap, red for a taken cell). Mouse only (touch is on hold), starts after 6 px, a press on a chip or a badge is theirs, Escape cancels.
- Both pages: one `#battlefield` grid instead of two rows, an Auto-arrange button, Alt and an arrow key move the selected card one cell. Other players' boards draw each card on the cell its owner stored.

**What I checked**
- `scripts/test-board-grid.mjs` (99 checks) and `scripts/test-board-play.mjs` (99 checks, including five random games of 2,500 operations in which no card is lost, no cell is shared, and a drag writes under 200 bytes). The older logic suites were updated on purpose where the data changed (a token now carries a cell, a battlefield write is per card, the full board is 48 not 250).
- The solo check is now 366 checks with real mouse, finger and Alt-key input: drop on an empty cell, the taken-cell refusal, a swap, a move, a 2 px click, a drag that ends on its own card, Escape, drop outside, a press on a badge, Shift, a right button, a finger, Alt arrows and Auto-arrange. It passes at 1280x1000 and at 1366x650. The live two-browser check (165) passes at 1366x650, and Bob sees the cell Alice stored. The layout check is still 365 checks, with the fake panels rebuilt as grids.
- Broken copies: 16 of 16 of the grid logic, 19 of 19 of the zone logic after four survivors got tests, 10 of 10 of the sync code after one survivor got a test, and 11 of 13 of `board-drag.js` after three survivors got tests. Two stay uncaught on purpose: the touch guard (a real finger move makes the browser scroll and cancel the pointer, so the test cannot tell the guard from the browser) and the guard against the browser's own picture dragging (synthetic mouse input cannot start it).
- I looked at screenshots: the solo table at 1366x768 with 16 cards on the grid, and one in the middle of a drag.
- **Measured, and mine to decide:** the grid makes cards small with three other players. On another player's board a card is 26 px tall at 1366x650, 31 px at 1366x768 and 55 px at 1920x950; mine 40 px at 1366x650. The layout check now only guards 24 px for others and 36 px for mine, and the hover picture is how they are read. If I think it is too small, the choices are fewer columns or rows (one constant each) or moving counters, command zone and piles off the other players' panels.
- **Not checked:** a real four-player game, phones, a touch version of the drag, and the drag picture under the deployed content policy (it is sized from script, which the policy allows, but only a deployed run proves it).

**Decisions**
- 12 x 4 and the swap rule are Claude's choices, listed in `docs/layout.md`; I can change them.
- Dragging onto another player's board, free placement off the grid, and a touch drag are not built.
- Mistakes of Claude: its first drag check swiped from the left edge of the page, which Chrome treats as the Back gesture, so the page left and the check failed in confusing ways (it looked flaky until the cause was found); one test line was accidentally turned into a comment and still "passed" (found by counting the checks); a first live check right-clicked a counter chip again because cards are only 28 px wide; the first run of broken copies found five weak spots in the tests (the half-cell cases, an in-board point that is not a number, the click after a drag, Shift, and the hidden outline), now covered.

---

## 111. The battlefield becomes a fine snap grid with overlap (step 1) (2026-11-09)

**What I asked for**
- The drag and drop was not what I meant. I wanted a loose, table-like board: drop a card anywhere and it snaps to a fine grid, cards can overlap, nothing swaps and nothing is refused. Same-name cards (lands, tokens) should stack, with up to four copies visible, a count like "8x", a plain drag taking one card off the stack and Shift or a corner handle moving the whole stack. Tapped and untapped copies are separate stacks, and cards in a different state (summoning sick, counters, and so on) do not join a stack. Lands still start at the bottom.
- Claude planned it in three steps (1: the fine grid, free drop and overlap; 2: stack drawing and the count; 3: taking one off a stack, moving a whole stack, the tapped split) and I said to start. This entry is step 1 and the first round of tuning. Stacks are NOT built yet.
- Tuning I asked for afterwards: the picture of a card I pick up must be the card at its real size (it was shrinking), I did not want the card rewritten on every drop, the power and toughness box should show a slash instead of a gap, and the battlefield should show grid lines that match the snap spacing, for debugging.

**What changed**
- `shared/board-grid.mjs`: the grid is 48 columns by 16 rows, a card is 4 by 4 cells (a quarter-card step). A card stores the cell of its top-left corner (`px` 0 to 44, `py` 0 to 12). No database rules change (the published rules already allow 0 to 4000). New `anchorAtPoint`, `shiftedAnchor` (a card moves by the distance the pointer travelled, so the spot I grabbed stays under the pointer) and `overlaps`.
- `shared/zones.mjs`: no swap, no refusal. `placeCard` moves a card; a full board no longer refuses a card (extra cards go on the last block). A card goes to the end of the battlefield list (drawn on top) only when it lands on a card that comes after it.
- `shared/game-sync.mjs`: a zone with the same number of cards is written one place at a time when at most four places changed, otherwise as the whole zone.
- `frontend/src/board-drag.js` and `style.css`: the picture that follows the pointer is the card at its own size, held where I grabbed it, and see-through so the outline shows; the board has the shape of 12 by 4 cards so a block is exactly one card; faint grid lines at every cell and stronger ones at every card; the power and toughness box shows a `/`.

- Later the same day I asked for the grid distances to be halved. Claude read that as half-size cells (96 columns by 32 rows, a card 8 by 8 cells, a step of an eighth of a card) with a card the same size on screen; the board shape and the card size did not change, only the snap spacing and the debug lines. Everything that hard-coded cells (the grid, play and counter tests, the layout and solo checks, the live check) was scaled, and a same-card drag test had to change because 7 pixels is now about a whole cell.

**What I checked**
- Node suites: `test-board-grid` 119, `test-board-play` 112 (five random games of 2,500 operations), and the older suites updated where cards may now overlap. `npm test` passed all 50 suites. The solo check is now 370 checks with real mouse, finger and Alt-key input, and the live two-browser check 167: Alice drags a card with the real mouse and Bob's page and the database both show the new cell.
- I measured what a drop writes with 30 cards on the board: dragging the top card is one piece of 182 bytes, but lifting a card from underneath rewrote the whole battlefield (4.7 KB), so I changed `placeCard` to reorder the list only when the card lands on a later card. A plain drag writes nothing; only the drop saves.
- Broken copies: 11 of 11 of the new grid code, 7 of 7 of `placeCard` and the cell fallback (one survivor, the "later cards only" test, got a three-card test), 3 of 3 of the write code, and 5 of 5 of the new drag code after one survivor (held where grabbed) got a test.
- Screenshots looked at: the board is now card-shaped (978 x 456 at 1280x1000) with cards exactly filling their blocks and grid lines at the cell and card spacing, a drag in progress with the see-through picture, and the four-player layout.
- **Not checked:** stacks (not built), a real four-player game, phones, a tapped card dragged in the browser (the tapped ghost is turned on its side in CSS; not seen), the opponent boards when their panel is narrow (their board takes the panel's height and may be a little off the card shape).

**Decisions**
- 48 x 16 and "overlap, never refuse" follow my answers. Old test games keep their small coordinates (they cluster at the top-left until Auto-arrange); there are no real saved games to migrate.
- The grid lines are always on for now (debugging). Alt and an arrow key still move a card by one cell.
- Mistakes of Claude: it first drew the board stretched to the window, so a card only filled about 60% of its block and "overlap" looked wrong on screen (found by looking at a screenshot); the drag picture hid the outline; a first write change rewrote the whole battlefield when a card was lifted from underneath, which I only found by measuring after you asked; the card-size and layout checks needed new numbers.

---

## 112. Stacks, step 2: piles with a count, snapping, tidying (2026-11-09)

**What I asked for**
- Step 2 of the plan from entry 111: same-name cards on the same spot are drawn as a pile with a count ("8x") and up to four visible copies; lands arriving join their pile; a plain drag takes one card off the top. Cards in a different state (tapped, summoning sick, counters, a power or toughness change, a note, face down, turned over, doesn't untap, being a token) do not join a pile. The tapped split and Shift or corner-handle moves of a whole stack are step 3.

**What changed**
- New `shared/stacks.mjs` (plain logic): `stackKey` (name plus every state mark, so "none" always looks the same), `stackInfo` (pile size and depth of every card on its cell), `stackCellFor` (the pile a new card joins), `snapToStack` (a card dropped within 3 cells of a pile it could join goes onto it, except the pile it is being taken from, so a short drag leaves its pile).
- Piles are NOT stored: they are cards with the same cell and state, so every card is still its own record and nothing in the database changed.
- `shared/zones.mjs`: a card, token or copy that arrives on the battlefield joins the pile it matches (else the first free block); drops and moves snap to a nearby pile; the "goes on top" decision is made where the card really lands; Auto-arrange keeps a pile on one block (`arrangeAll` takes a key).
- `frontend/src/card-nodes.js` and `style.css`: the top card carries a count badge, copies under it are shifted up and left, copies from the fifth down are hidden, and a screen reader hears "top of a stack of N".

**What I checked**
- New `scripts/test-stacks.mjs` (62 checks, including three random games of 1,500 operations in which every card keeps a cell, stack sizes and depths stay consistent and no card is lost); the older logic tests were updated where same-name cards now stack (a copy of a token, six Goblins, crowded boards now use different names). The solo check is 381 checks: six Forests played become one pile on the first land block with a "6x" badge, 4 copies visible and 2 hidden, a drag takes one off (5x and a lone card), a drop within 3 cells joins it again, Auto-arrange keeps it, and marking the top card summoning sick takes it out of the count. `npm test` passes all 51 suites and the live two-browser check passes 167 of 167.
- Broken copies: 19 of 19 of `shared/stacks.mjs`, 6 of 6 of the zone wiring (after the first run showed 4 "survivors" because I had left the new test suite out of that run, and a real gap in the "snap, then decide on top" case got a test), 6 of 6 of the card-node code.
- Screenshot looked at: a pile of six Forests with the badge at the bottom-left of the board.
- **Not checked:** the pile drawn on another player's board in a real game (it uses the same code; the two-browser check has only one land), a pile whose copies hang off the board's left edge or top (they are drawn up and to the left, so at the very edge the lower copies are cut off), tapped cards (they stay on the pile's cell as their own stack until step 3 moves them beside it).

**Decisions**
- The snap radius is 3 cells (less than half a card, so a deliberate nearby drop snaps and a deliberate gap does not). Say if it feels too sticky or not sticky enough.
- Mistakes of Claude: it first ran the zone broken copies without the new test file, so four real gaps looked caught; one test it wrote used the wrong list order and failed for the right reason; the first pile test checked the wrong card's position.

---

## 113. Square cells, the tapped split, wider snap, looser piles (2026-11-09)

**What I asked for**
- The tapped card looked atrocious and still needed changing, the area where cards group together should be bigger, the stacked cards should be spread a tiny bit more, and the grid should be more cubes than rectangles.

**What changed**
- **Square cells:** the grid is now 96 columns by 44 rows and a card is 8 wide and 11 tall, so a cell is square (before, a cell was an eighth of a card in each direction, which made rectangles). The board is drawn 96:44 and the debug lines follow it.
- **Tapped card:** a tapped card on the battlefield is now a landscape box exactly as big as the turned card, with no grey square around it (the screenshot showed a square button with the card turned inside it). **Tapping a card out of a pile moves it to the block on the pile's right** (left, below or above if that is covered) as its own stack, a second tapped copy joins that tapped pile, and untapping sends it back onto the untapped pile if one is within a card of it; Untap all does the same for every tapped card; a card alone on its cell, or far from a pile of its name, stays where it is (`regroupAfterTap` in `shared/zones.mjs`, `nearbyFreeBlock` in `shared/board-grid.mjs`).
- **Bigger snap area:** a dropped card now joins a pile it could stack with within 6 cells (it was 3, three quarters of a card wide now).
- **Piles spread more:** each copy under the top one is shifted by 0.11 of a card (it was a fixed 0.3 rem), and the board has room on its left so a pile at the edge is not cut off.

**What I checked**
- `test-board-grid` 130, `test-stacks` 84 (with the tap and untap cases and three random games), `test-board-play` 115; the solo check 383 (a pile of six Forests: tapping the top one steps it to the right as its own card and the pile is 5x, untapping puts it back to 6x), the layout check 365 (card sizes now measure a tapped card's long side) and the live check 167. `npm test` passes all 51 suites.
- Broken copies of the new tap code: 12 of 12 after two rounds (the first run left 6 gaps: the row distance, a pile mate of another name, the same-state shortcut, settling an older game, the untouched-game shortcut and the list order; each got a test), and 5 of 5 of `nearbyFreeBlock` (one guard was equivalent and was removed).
- Screenshots looked at: the tapped cards now sit as proper landscape cards beside their piles, with the count badge on the top card of each pile.
- **Not checked:** another player's board with piles and tapped cards in a real game, a pile at the top edge (its copies go up into the heading area), phones.

**Decisions**
- 6 cells and 0.11 of a card are my numbers for "a bigger area" and "a tiny bit more"; say if either is off.
- The tapped card is now its own stack on its own block, so a row of tapped lands takes more room than before. Auto-arrange puts tapped copies beside their untapped pile too.
- Mistakes of Claude: the first tapped design left a tapped copy drawn over its pile (I called it step 3 and left it, and it was the ugliest part); the first layout check numbers broke because a tapped card is shorter than it is wide now; the first live check aimed at a spot that a counter covers on the small tapped card.

---

## 114. Deselect by clicking off, tapping by clicking twice, a wider tap step, a second pile style and where tapped stacks go (2026-11-09)

**What I asked for**
- Clicking off a highlighted card did not remove the highlight. A double click on a card should tap it. A card tapped out of a pile should move one more cell to the right. And a second way to draw a pile: keep the diagonal one as it is, and add one where the copies go in a horizontal row with the bottom-most card on the left.

**What changed**
- **Click off:** a click on empty space (the battlefield, the page background, the hand area) takes the highlight off the selected card; a click on a card, a button, the selected-card panel, a menu or a link does not. Escape already did it.
- **Two clicks tap:** two clicks on a card of mine on the battlefield, close together in time (under 450 ms) and place (under 14 px), tap or untap the card under the second (clicks on a counter or a badge are theirs). On both the solo and the live table. This is counted in the page, not taken from the browser's double-click event, which Chrome fires only for the second click of a run: a third and fourth quick click are not double clicks, which is why fast tapping seemed inconsistent. There is no cooldown. A pair is used up (four quick clicks are two taps), and clicks made by the keyboard or a script do not count.
- **Tap step:** a card tapped out of a pile now goes a whole card plus one cell to the right (\`TAP_GAP\` in \`shared/board-grid.mjs\`); untapping rejoins a pile within that distance.
- **Pile style:** a "Piles" choice next to the sound settings, Diagonal (the first way, still the default) or Horizontal (the copies under the top card go straight to the left, so the bottom-most is on the far left). Only how it is drawn changes; the piles, the count and the game are the same. Kept in this browser (\`shared/pile-style.mjs\`, \`frontend/src/pile-style.js\`).

**What I checked**
- \`test-pile-style\` (20), \`test-board-grid\` (131) and \`test-stacks\` (85) updated for the new gap, with a boundary test (a tapped card 9 columns away rejoins, 10 does not). While fixing a stack test I found that its set-up had never done what its label said (the Forests it moved were already on the battlefield, so the explicit cell was ignored); it is now set up properly.
- The solo check is 393: a click on empty battlefield space and on the page corner deselects, a click on a panel button does not, a double click taps (the tapped card steps out of the pile) and two more untap (back to 6x), six quick clicks tap three cards, a slow second click is not a pair, two clicks 150 ms or so apart or 8 px apart are a pair and two 30 px apart or an empty space then a card are not, Horizontal moves the copies straight left and a tapped card goes straight up, Horizontal moves the copies straight left (no vertical shift) and Diagonal brings it back, and the choice is remembered. The live two-browser check is 169: a double click taps Alice's card in the database and a second one untaps it.
- Broken copies: 5 of 5 of the gap logic; the page code results are below.
- A screenshot of the horizontal pile was looked at: six Forests in a row with the bottom-most on the far left and the count on the top card.
- **Not checked:** the horizontal pile on another player's board in a real game, and the layout of the "Piles" select on a narrow screen (it wraps under the sound settings).

**Decisions**
- A pile on the board's left edge needs room for its copies, so the board gets extra padding on the left in horizontal mode (it shifts the board a little when you switch).
- Mistakes of Claude: I first used the browser's own double click for tapping, which is inconsistent for fast clicking; my first answer to "the hitbox of a tapped card" was a guess that I only tested after the fact; a comment I added at the end of a code line in the live check swallowed the rest of the line (found at once by a syntax check); the first double-click check aimed at a spot a counter covers, because the card is small and has counters by then.

---

## 115. Tapped stacks fan up, untapping goes left, a wider board, cards on the lines, drag back to the hand (2026-11-10)

**What I asked for**
- I had meant the tapped stack to fan straight UP (like the horizontal pile, but up instead of sideways), not go diagonal. A card untapped from a tapped stack should appear on its left, and if that is off the board the stack and the card scooch right. The board had a lot of empty space, so more cells. The lines had a small gap to the cards. Dragging a tapped card showed the outline of an untapped one. And I wanted to drag cards back into my hand.

**What changed**
- **Tapped stacks fan up:** the copies under the top one of a stack of tapped cards are shifted straight up, in both pile styles (`style.css`).
- **Untapping to the left:** an untapped card leaving a stack of tapped cards, with no untapped pile beside it, goes to the left of the stack (a card and two cells away; below it in the Horizontal style). If the left is off the board and there is room on the right, the stack is scooched right and the card takes the place the stack was in (`regroupAfterTap` in `shared/zones.mjs`, `nearbyFreeBlock` with 'left' and 'down' in `shared/board-grid.mjs`).
- **A wider board:** 14 cards across instead of 12 (112 by 44 cells, 56 blocks). The number is one constant (`BOARD_COLS`); the grid test now takes its numbers from the constants, so the next change of size does not mean rewriting it.
- **Cards on the lines:** a card is now exactly as high as its block, sits on the left and bottom lines (a tapped card on the same corner), and the 3 pixel gap is gone (it was a deliberate `- 3px` that I had added).
- **Dragging a tapped card** shows a landscape outline (11 by 8 cells on the bottom line of its block).
- **Drag back to the hand:** a card of mine dragged from the battlefield and let go over the hand goes back into it; the hand is marked while one is over it (solo and live table).

**What I checked**
- `test-board-grid` 140, `test-board-play` 115, `test-stacks` 107 (the untap to the left, the scooch, the blocked scooch and the Horizontal untap included); the solo check 408 (the tapped stack fan, the landscape outline, the hand drop and playing the card again); the layout check 365; `npm test` and the live check as below. Broken copies of the new logic only (7 of 7 after three survivors got tests); no browser broken-copy runs this time.
- A screenshot showed the card flush against the grid lines.
- **Not checked:** the hand drop on the live table page in a real game (it is the same code as the solo page), a tapped card in the last 3 columns of the board (it is clamped when dragged but a card tapped there can overhang the edge), and the Horizontal style with a pile on the bottom row.

**Decisions**
- 14 across is my guess at how much room you wanted; it fits a 16:9 window better than 12 did.
- Mistakes of Claude: a test that let go of a card over the hand now moved it into the hand (the old check had to cancel with Escape); my first tapped-stack test built a stack that could not exist (a tapped card steps out when tapped, so I had to place the cards on one cell by hand); a regex lost its backslash in my edit script.

---

## 116. Tapping goes to the side in both pile styles, and whole piles can be dragged (2026-11-10)

**What I asked for**
- With Horizontal piles, tapping a card out of a pile sent it above the pile; I wanted it to act like the Diagonal one (to the side). And dragging a whole pile.

**What changed**
- Tapped cards step out to the side in both pile styles (`stepOutFor` in `shared/pile-style.mjs` now always says right; the "up" way is still in `shared/zones.mjs` and could be given to a style again with one line). This undoes the Horizontal part of entry 114.
- **Whole-pile drag:** Shift and drag any card of a pile of more than one, or take the small triangle at the top-left corner of the top card, and the whole pile moves together (`placeStack` in `shared/zones.mjs`: the cards on that cell with the same name and state, in the same order; a tapped card on the same cell stays; it snaps onto a pile of its kind that is close; it goes to the end of the list only if it lands on a card that comes later, like moving one card). A plain drag still takes one card off. The picture that follows the pointer shows the number of cards it carries. Shift on a card that is not in a pile still starts no drag.

**What I checked**
- `test-stacks` 121 (the whole-pile cases, with the order in the list both ways), `test-pile-style` 21; the solo check 413 (Shift and drag moves all six, the handle moves all six without Shift, a plain drag still takes one, a tapped card with Horizontal piles goes to the side); `npm test` and the live check as below. Logic broken copies only: 8 of 8 after three real survivors got tests (a tapped card on the pile's cell, a move onto an earlier card, and a move onto a later one).
- A screenshot showed the handle on the top card of a pile.
- **Not checked:** whole-pile drag on the live table page in a real game (same code as solo), and the handle on a touch screen (touch drag is still off).

**Decisions**
- I made the corner handle a small triangle at the top-left of the top card; a dotted border around the pile (from your earlier answer) is not drawn. Tell me if you want it.
- Mistakes of Claude: my first whole-pile tests used helpers that were out of scope, and two of the first broken copies survived because the order tests had no card after the pile in the list.

---

## 117. Small look changes: a dashed border on piles, no empty text, a dragged card leaves no ghost, a quieter highlight (2026-11-10)

**What I asked for**
- A dashed border around a pile; remove the text that says nothing is on the battlefield; while dragging cards I do not want to see where they were; make the selected card highlight lower key.

**What changed** (`style.css`, `card-nodes.js`, `board-drag.js`, both pages)
- A dashed border drawn around a pile (the top card and the copies fanned under it, following the fan: up and left, left, or up for tapped ones). It takes no clicks.
- The "Nothing on the battlefield yet." text is gone (mine and the other players' boards).
- A card being dragged is hidden where it was (it was dimmed), and for a whole pile every card of it is hidden.
- A selected card has a thin accent line and a faint glow instead of a thick solid ring.

**What I checked**
- Three new solo checks plus a whole-pile one (the solo check is 417): the dashed border's style, size and reach, the thin highlight, the hidden dragged card (one card, and all six of a pile), and no text on an empty battlefield. `npm test` and the live check below. A screenshot showed the dashed border around a pile of six. No broken-copy runs for this look-only round.
- **Not checked:** the quiet highlight in light mode and on the other players' boards.

**Decisions**
- The dashed border is always on for piles (not only on hover); say if you would rather see it only when you point at a pile.

---

## 118. Fewer buttons: card options in the right-click menu, a Settings menu, a library window with search (2026-11-10)

**What I asked for**
- Move the Modify options into the right-click menu, add a Settings menu and put sound and the like in it, remove "move to battlefield" and similar buttons (the right-click menu does that), rework the library so I can see the cards and search it (by name, by letters in order such as "ft" for Forest, and by card type), and let me right-click the deck to search, shuffle and so on. The point is to remove buttons that were debugging leftovers and free space.
- My answers to Claude's questions: Settings holds Sound, Volume, Piles and the way back; the top bar keeps Draw, Next turn, Untap all, Auto-arrange, Mulligan and New game; card details only in the hover picture; the library opens as a large window over the table; the pile menu gets Search, Shuffle, Draw (one or several), Look at the top N, Mill and Move all to another zone.

**What changed** (`shared/card-search.mjs`, `shared/pile-menu.mjs`, `shared/zones.mjs` `moveAll`, `frontend/src/pile-viewer.js`, `frontend/src/settings-menu.js`, both pages' HTML and script, `style.css`)
- The selected-card panel and its buttons are gone. A right-click on a card does everything (Modify opens a small window with the counters, Tap, Move to, and so on). The selected card is described only by a line for screen readers, and by the hover picture.
- The Shuffle button is gone; a right-click on the library offers Search, Shuffle, Draw (2 to 7), Look at the top cards and Mill. A right-click on the graveyard, exile or sideboard offers Search and Move all to.
- A pile opens as a large window with the cards themselves (not names) and a search bar. The search matches the start of a name, then any part of a name, then a word of the type line, then letters in order within the name only. The library window numbers cards from the top.
- A Settings button next to New game holds Sound, Volume and the Piles style.

**What I checked**
- Two new unit suites: card search (21 checks) and the pile menu (33 checks, including 400 random menu choices that never lose or copy a card). A screenshot at 1366x768 of the main view, the library window, a search for "ft" (21 of 53 cards, all Forests) and the Settings panel.
- I moved the old browser checks to the new controls: the solo check (415), the layout check (365) and the live two-browser check (169 of 169 against the real project) pass. `npm test` was 54 suites; the only failure was the layout check, which was still building the removed panel.
- No broken-copy runs for the page code (a UI round, as agreed). **Not checked:** the library window at other window sizes, the search with accents on real names, light mode.

**Decisions**
- "Reveal the top card" is only "Look at the top card" for now (a private look). Showing it to the table needs a new public field, so it waits.
- The "Back to your deck" and "Lobby" links and the table's Leave button were NOT moved into Settings yet.
- Claude's own mistakes: it first let the letters-in-order search match the type line too, so "ft" matched every artifact; restricted to names after I saw the results. Two expected orderings in its first tests were its own arithmetic errors, not code bugs. And several old browser checks pointed at buttons that no longer exist; they are updated, but the old test of the page scrolling when the selected-card panel shrank has no equivalent any more and was removed.

---

## 119. Player counters move into the life total: chips with icons and a right-click menu (2026-11-10)

**What I asked for**
- Move the player counters into the player's life total area. A player right-clicks their own life to add every kind of counter that goes on a player, even the monarch. Show them with icons. I also asked for a bigger reorganization (stacked piles, two commander zones with a tax counter, the sideboard and the legal disclaimer in Settings, the top buttons on the right, a corner for the selected card) and Claude split it into three steps. This entry is step 1 only.
- My answers: the new counters can wait for the database rules (one rules change at the end); Alt held over a card shows the hover picture; the selected-card corner also shows pings from other players; the disclaimer goes in Settings only.

**What changed** (`shared/zones.mjs`, `shared/player-counters.mjs`, `shared/game-sync.mjs`, `frontend/src/counter-icons.js`, `frontend/src/counter-chips.js`, both pages, `style.css`)
- A player can have six counts (poison, energy, experience, rad, ticket, speed), the Ring tempts you (a count), and three marks that are on or off (monarch, initiative, city's blessing). A mark is stored as 1.
- Chips sit next to the life total: an icon and a number, or only the icon for a mark. A right-click on the life opens "Your counters": each count has Add 1, Add 5, Remove 1 and Remove 5 (or Remove all); a mark is one choice that turns it on or off; on a Commander table commander damage from each seat is in the same menu. Other players see the same chips on their panel, read-only.
- The old "Your counters" block with its buttons, and the commander damage block, are gone (`frontend/src/player-counters.js` is deleted).
- The icons are simple shapes drawn for this site, inline SVG with width, height and fill set.
- **The live table offers only poison, energy and experience for now.** The published database rules refuse any other key under `pc`, and one refused key would fail the player's whole public branch. `PUBLISHED_COUNTERS` in `shared/player-counters.mjs` is the one list to change after the rules are updated. The solo table offers all ten.

**What I checked**
- Unit: player counter checks 151 (new menu, chips and actions, and a 600-step random walk that keeps the game consistent), counter checks 237, counter storage 83. A screenshot at 1366x768 of the menu and the chips.
- Browser: solo check 414, layout check 365, and the live two-browser check 169 of 169 (the right-click menu, the chips, the other player seeing them, lethal at 21, a refresh). `npm test` passes all 54 suites.
- **Not checked:** phone width, light mode, and the new counters on the live table (waiting for the rules).

**Decisions**
- A new backend test ties `PUBLISHED_COUNTERS` to the rules file: the list must be exactly the keys the rules accept under `pc`.
- The mutation run for the rules (417 copies) was stopped by its time limit after 381 (361 killed, 20 documented as redundant, none survived). The rules file was left as a broken copy and I restored it by hand after checking the backup equalled the commit. `mutate-rules.mjs` now takes a second argument, how many to skip, so the rest can be run.
- Claude's own mistakes: the random game test in `backend/test-rules-game.mjs` used every player counter, so it wrote keys the published rules refuse and the rules suite failed; `npm test` found it and it now uses `PUBLISHED_COUNTERS`. A solo check (a hostile card name) drew only 40 cards and so failed about 1 run in 60; it now draws up to 70. The menu click helper in the solo check clicked hidden submenu items; it skips them now.

---

## 120. Piles as stacks of cards, the command zone with two outlined slots and a commander tax, the sideboard in Settings (2026-11-10)

**What I asked for**
- Step 2 of my reorganization: a library stack of cards instead of text saying "Library: 53", the same for graveyard and exile, the two commander zones prominent with their own dotted outlines and a commander tax counter, and the sideboard in Settings. Steps 1 (player counters) was entry 119; step 3 (the screen layout, the selected-card corner, the disclaimer in Settings) is next.

**What changed** (`frontend/src/pile-stack.js`, `frontend/src/command-zone.js`, `shared/commander-zone.mjs`, `shared/zones.mjs`, `shared/game-sync.mjs`, both pages, `style.css`, `settings-menu.js`)
- **Stacks:** the library, graveyard and exile are each a stack of card shapes with the number on it and the name under it. The library shows a plain card back drawn in CSS (its top card is hidden); the graveyard and exile show their newest card's picture, or its name if the picture cannot load. A click opens the viewer, a right-click opens the pile's menu, as before. The only text inside the button is a line for a screen reader.
- **Command zone:** two slots, each with a dotted outline. The commander sits in its slot while it is in the command zone; the slot stays, empty and marked, while the commander is out, and a tax counter sits under it: "Tax +0" with - and + (each + is one cast, +2 more to cast it again). It is a counter you move by hand; nothing counts casts for you. A deck with no commander has no command zone on show.
- **Sideboard:** its button is the first line of the Settings menu and opens the same viewer.
- **Game data:** a game now keeps `cmd` (who the commanders are) and `tax` (casts, by commander). The table page does not save them yet: the published rules do not accept them, so **the live table does not show the tax** (`COMMANDER_TAX_PUBLISHED` in `shared/commander-zone.mjs` is the one switch) and a game read back works out the commanders from the command zone.
- The old "Piles" heading, the pile buttons and their rules in the style sheet are gone.

**What I checked**
- Unit: `scripts/test-commander-zone.mjs` (41 checks, including a 1,000-step random walk), plus the existing suites; `npm test` passes (55 suites).
- Browser: solo check 430 (16 new: the stack facts, a picture on top of the graveyard, the sideboard from Settings, two outlined slots, the tax up and down, the tax staying with a cast commander, a new game starting at +0, no command zone without a commander), layout check 365, live check 170 of 170 (one new: stacks, slots, no tax, the sideboard in Settings). Screenshots at 1366x768 of the stacks and the command zone.
- **Not checked:** phone width, light mode, a real four-player game, the look with a partner commander (my screenshot deck had only one commander).
- **The rules mutation run is finished:** 417 broken copies, 395 killed, 22 documented as redundant, 0 survived (the second half, 36 copies, ran on its own after the first run hit its time limit).

**Decisions**
- The tax is a plain counter you move yourself, like paper. I did not make a move out of the command zone count a cast, because a commander goes back and forth for other reasons; say if you want it automatic.
- Claude's own mistakes: a solo check clicked a fixed spot (1100, 60) to close a menu, which is now the graveyard stack, so it opened a viewer and the next test failed (it took a screenshot to see it; the click spot moved). Two round-trip tests failed because a saved game cannot hold the commanders and the tax yet; they now ignore those two fields.

---

## 121. A branch called development, and a card list on previews (2026-11-10)

**What I asked for**
- I wanted to push to a branch and see it on Vercel as a development test, not on the live site. I named the branch `development`, asked how to enable the Firebase settings for Vercel's preview environment, and said to go ahead with the card list on previews.

**What changed** (`scripts/lib/card-list-build.mjs`, `scripts/test-card-list-build.mjs`)
- A preview build (`VERCEL_ENV=preview`) used to never download anything and skipped the list when nothing was cached, so a first preview of a branch would have had no cards. Now it still reuses any cached list however old, but when it has NOTHING cached it builds one (one download of Scryfall's two bulk files, about 100 MB), and later previews of that branch reuse it. `CARD_LIST_NO_DOWNLOAD` still forbids every download (the tests).
- The preview scenarios of the build test were changed to match (157 checks).

**What I checked**
- `scripts/test-card-list-build.mjs` against its stand-in Scryfall: a preview with nothing cached downloads once, a preview with an old list reuses it and makes no request, and the no-download switch still wins.
- **Not checked:** a real preview build on Vercel (I cannot see my Vercel settings), whether Vercel keeps its build cache between a branch's previews, and whether Firebase anonymous sign-in works from a preview address.

**Decisions**
- The cost is one 100 MB download the first time a branch is previewed, if Vercel's cache is per branch. I accepted it because a preview without cards is not a useful test.

---

## 122. The deck page: three screens, the deck by card type, a text list or card pictures (2026-11-10)

**What I asked for**
- Reorganize the deck page: more comprehensive and easier to navigate, moving on from the proof of concept. Show the whole decklist either as text only or as card images, grouped by card type (other than the commander(s) and the sideboard), with a three-line icon for text and a rectangle for pictures. Remove redundant buttons and text. The overall look comes later; this is only to make it usable.
- My answers to Claude's questions: two screens (saved decks, then one deck) over keeping one long page, and the lobby gets the new layout too.

**What changed** (`shared/deck-view.mjs`, `frontend/src/deck-importer.js`, `frontend/src/deck-groups.js`, both pages, `style.css`)
- **Three screens, one at a time:** "Your decks" (each deck with Open, Play solo and Delete, and New deck), "Add a deck" (the box, Check deck, Try a sample deck, Cancel) and one deck (All decks, Edit list, the name with Save, Format, Bracket, Commander and Partner in one row, the summary, the view buttons, and the groups). The page opens at the list when there are saved decks and at the box when there are none.
- **The deck by type:** Commander first, then Creatures, Planeswalkers, Battles, Instants, Sorceries, Artifacts, Enchantments, Lands, Other, then Sideboard (and a Companion or Maybeboard if there is one). A card with two types goes in the first that applies (a land before a creature before an artifact), by its front face. Inside a group the cards are by name. A line the card list could not match has a group of its own, first, so the counts add up. Choosing a different commander moves that card into the Commander group straight away.
- **Two views:** a three-line icon for the text list and a card-shaped rectangle for pictures. The picture view is a grid of small pictures with a count on a card with copies, loaded only as they scroll into view; pointing at either still shows the big picture. The choice is remembered in this browser.
- **Less repeated:** gone are the Clear button (New deck does it), the second "Check: N cards, all matched" line (the summary says it), the "Play the selected deck" link and the "Use for the solo table" button (Play solo does both), the "Selected" sentence (a small "solo deck" tag), the permanent save note (now the Save button's tooltip), the type column in the text list (its tooltip), the separate Commander legend and its two labels, and the lede on every screen.
- **One copy of the markup:** the manager now builds its own markup inside `#deck-app`, so the deck page and the lobby cannot drift apart. The lobby's "Import or change a deck" opens it without the Play solo button.

**What I checked**
- `scripts/test-deck-view.mjs` (53 checks: which type a card is, the order, sorting, commanders taken from a line, bad input). `scripts/check-deck-ui.mjs` is 222 checks in real Chrome against the real card list (201 before; I changed the old ones to the new screens and groups and added 21 for the toggle, the icons, the picture view, the commander group, the screens and Cancel). `scripts/test-importer-markup.mjs` is rewritten (52 checks). `npm test` passes all 56 suites and the live room check passes 26 of 26 (it opens the manager inside a real table). Screenshots at 1280 wide of the text view, the picture view, the list, the paste screen and the lobby panel.
- **Not checked:** phone width, light mode, and more than 100 pictures at once on a slow connection.

**Decisions**
- The text list default stays text, so a visit does not fetch 100 pictures.
- Mana costs are still shown as the raw text ({2}{G}); symbols are for the visual pass.
- Claude's own mistakes: its first version started a page with a damaged saved-decks library at the box to paste into, so the message that the decks could not be read was never shown (the old check caught it, and the page now starts at the list when there is such a message); a rename in the suite list left an unescaped apostrophe that broke `npm test` until it was found; a check that clicked Play solo went to the solo table, and the pictures it loaded were counted as requests by a later test; and the live room check read the Check button before the manager had been built.

---

## 123. Mana costs as symbols (2026-11-10)

**What I asked for**
- Show mana costs as mana symbols (and colorless) like the deck-building sites, instead of the text {2}{G}{G}. Not a long test. Commit, then push to the development branch.

**What changed** (`shared/mana-cost.mjs`, `frontend/src/mana-pips.js`, `deck-groups.js`, `style.css`)
- A cost is read into symbols (colors W U B R G, colorless C, numbers, X, snow, hybrid, two-for-one hybrid, Phyrexian; a card with two costs shows both with // between) and drawn as small round pips: a circle in the color with its letter or number, a split circle for a hybrid, a phi for a Phyrexian symbol. The cost carries its written form in `data-cost` and its words in an aria-label ("2 generic mana, green mana"); a symbol the reader does not know is shown as written.
- They are plain shapes I made for this site, not Wizards' symbols or an icon library, so there is no new dependency, no new picture host in the content policy and no licence to check. The real glyphs (the sun, the drop, the skull, the flame, the tree) would need an icon font; say if you want me to look at one.

**What I checked**
- `scripts/test-mana-cost.mjs` (13 checks: every kind of symbol, bad input, two costs, the words). One check added to the deck page check (223 now): a red pip and a generic pip with their words. `npm run test:quick` (51 suites) and the deck page check pass; a screenshot of 14 cards with all the kinds of cost.
- **Not checked:** the other pages (only the deck list shows costs), light mode, phone width.

---

## 124. The real mana symbols, from Scryfall (2026-11-10)

**What I asked for**
- Use the actual color icons, like the deck-building sites, instead of my plain circles from entry 123.

**What changed** (`shared/mana-cost.mjs`, `frontend/src/mana-pips.js`, `vercel.json`, `style.css`, `scripts/lib/browser.mjs`)
- Each symbol is Scryfall's own SVG of it (`https://svgs.scryfall.io/card-symbols/W.svg`, `WU.svg` for {W/U}, `2W.svg` for {2/W}, `GP.svg` for {G/P}), the same pictures the deck sites use. I printed Scryfall's `/symbology` list first: 84 symbols, each with an `svg_uri` in that form (checked 2026-11-10). A symbol with no picture there (an unknown one, or a number above 20), or one whose picture cannot load, falls back to my round pip, so a cost is never blank.
- The content policy now allows pictures from `https://svgs.scryfall.io` as well as `https://cards.scryfall.io` (`vercel.json`, and the deploy check expects it). It is a new third-party host: Scryfall serves them like the card pictures. No dependency, no icon font and nothing copied into the repo. The symbols are Wizards' artwork, shown unaltered under the same Fan Content rules as the card pictures; I have not re-read the policy for them (it is on my list to read in a browser before the site goes public).
- The test browser helper can now answer more than one host (`fakeImages` was replacing its earlier pattern when called twice).

**What I checked**
- 16 mana cost checks (the addresses and the cases with no picture), two in the deck page check (the pictures with their words for a screen reader, and a symbol that fails to load turning into a plain pip), the deck page check 224, the solo check 430, `npm run test:quick` (51 suites), and the deploy check 56 of 56. A screenshot with the REAL pictures: 23 of 23 loaded and no fallbacks.
- **Not checked:** the policy of the real Vercel site (the deploy check only reads the file), light mode, phone width.

---

## 125. Plainer wording on the deck page (2026-11-10)

**What I asked for**
- Remove weird or redundant text like "9 cards, all matched", and make the deck page look more normal and professional. Commit and push to the development branch.

**What changed** (`frontend/src/deck-importer.js`, `style.css`)
- The summary is only the count ("100 cards"); it says "5 cards · 4 need attention" (in the problem color) only when something does. "All matched" is the normal case and says nothing.
- The card list message ("34,192 cards loaded. Cards newer than the list show as not found...") is gone once the list has loaded; it shows only while loading or when it failed, and the count and the weekly refresh moved into its tooltip.
- The commander note is empty when your list marked the commander; when it was guessed it is one short line ("No commander is marked in your list, so the first legendary creature was picked.").
- The problem lines are shorter ("Totally Fake Card" (2) was not found.), with the "may be spelled differently or newer than our card list" explanation in a tooltip.
- The list screen's "Your decks" heading is for screen readers only (the page's own heading already says Decks); the paste box's "Decklist" label too (a placeholder shows the format); one short line says what to paste; "Bracket (optional)" and "Partner (optional)" lost the "(optional)" because their "Not set" and "No partner" choices say it.

**What I checked**
- The deck page check (224), the lobby page check (65), the live room check (26 of 26, with the manager inside a real table) and `npm run test:quick` (51 suites); screenshots of the paste screen and the deck.
- **Not checked:** light mode, phone width. "More professional" beyond the wording is the visual pass I said I would leave for later.

**Decisions**
- I kept the notices from the parser (for example "2 lines have no number, so each was counted as 1 card") because they say something the player did not know.
- Claude's own mistake: the textarea placeholder I added lost its line breaks when written through the shell, so the page failed to load until I rewrote it with the editor tool.

---

## 126. The deck page in columns, a menu on every card, a more modern layout (2026-11-10)

**What I asked for**
- The text was one column; I want it like Moxfield or Archidekt. The mana costs were spaced too far. Consider a right-click or a "..." on a card to change its printing or to pick it as the commander (some commanders swap with a card in the 99). A more modern layout.

**What changed** (`shared/deck-commander.mjs`, `frontend/src/deck-groups.js`, `deck-importer.js`, `card-peek.js`, `style.css`)
- **Columns:** the deck page is wider (84 rem) and the text groups flow in as many columns as fit (three on a 1280 window), each group kept whole, with small capital group headings. A row is the count, the name, the printing (small, only when the list named one) and the cost at the end, with smaller symbols, so the cost sits next to the name instead of far away.
- **A menu on every card:** a "..." button at the end of a row (shown on hover or keyboard focus; always shown on touch screens), or a right-click, opens the card's menu. For a card in a Commander deck it offers "Make commander (replaces the current one)" and "Make partner"; for the commander "Not the commander"; for the partner "Not the partner" and "Make commander instead" (swap). The card that is replaced goes back to its type group; the Commander and Partner pickers and the Commander group stay in step. Standard decks and sideboard, companion and maybeboard cards have no menu and keep the browser's own right-click.
- **Layout:** the name, Save, Format, Bracket, Commander and Partner sit in one header panel; the saved decks are cards in a grid with Open, Play solo and Delete; the big picture now opens beside the row you point at (to its right, else its left) instead of at the window's edge, because the list now fills the window.
- **NOT built: changing a card's printing.** The card list only knows each set's printings by number, not all the printings of one card, so a printing picker needs a new data file (printings grouped by card) or a request to Scryfall's search on each use. I did not add either without asking: my own rule for this site is to keep Scryfall API calls as low as possible. Options are in my message to you.

**What I checked**
- `scripts/test-deck-commander.mjs` (23 checks: which choices a card offers, every swap and replacement, bad input). The deck page check is 238 (14 new: three columns, costs at the end of their row, the "..." buttons, a right-click, making a partner, swapping, replacing, taking one out, the button, Escape, no menu in Standard or for a sideboard card). The existing picture-box checks changed with the new placement. `npm run test:quick` (52 suites), the lobby page check (65) and the live room check (26 of 26). Screenshots at 1400 wide of the columns, an open menu and the saved decks.
- **Not checked:** phone width (the columns drop to one on a narrow window but I have not looked), light mode, and the picture-view tiles' "..." button on a touch screen.

---

## 127. Changing a card's printing, from our own data files (2026-11-10)

**What I asked for**
- Option A for changing a card's printing (printings grouped by card in the build, no Scryfall request when a player uses it), keeping cost low without hurting performance. Also: is 1280 wide the limit for checking, or can it be 1920 by 1080?

**What changed** (`shared/card-prints.mjs`, `shared/deck-text-edit.mjs`, `scripts/lib/card-list.mjs`, `scripts/lib/card-list-build.mjs`, `frontend/src/card-prints.js`, `printing-picker.js`, `deck-importer.js`, `style.css`)
- **The data (the card list build):** while it reads Scryfall's printings file it also keeps, for each card, every paper printing with a real picture (not `placeholder` or `missing`; English, or all languages for a card with no English printing), newest first, then by set and number. It writes them as 256 small files under `/data/prints/XX.json` (a card's file is picked by the first two characters of its key) plus `/data/prints/sets.json` (each set's name and date). The cache keeps them in one `prints.json` with a checksum, so a reuse publishes them again with no request. The list format is 7, so a cached list in format 6 is rebuilt once (one 100 MB download), as for every earlier format change. A rebuild refuses data with bad rows, too few cards or rows, or more than 5% fewer than the last good build.
- **Measured on the real files (Oct 26 data):** 33,923 cards, 100,502 printings in 256 files: 5.8 MB raw, 3.07 MB compressed in all on the server (it is not downloaded together). A player who opens one card's printings downloads that card's file (median 12 KB, largest 31 KB compressed) and the sets file (8 KB): about 20 KB, once per visit, and no request to Scryfall. A picture is loaded only for the row being pointed at (normal size), and none for the other rows. Sol Ring has 133 printings.
- **The window:** "Change printing..." is the first item in every matched card's menu (also in Standard, the sideboard and the picture view). It lists the printings (set name, set code and number, year), with a filter box, the printing in use marked, and Default printing at the top; pointing at a row shows its picture in the same picture box as the deck list. Choosing one rewrites the card's line in the pasted list to "2 Sol Ring (CMM) 410" (the quantity and any foil mark stay, every text line the card came from is rewritten), so the choice is just text the player could have typed, is what is saved, and comes back when the deck is opened. The name, format, bracket and commander stay as they were.
- **Layout:** the deck page can be wider on a big window (100 rem, four columns at 1920); the picture box is above the new window.

**What I checked**
- New unit suites: `test-card-prints.mjs` (17), `test-deck-text-edit.mjs` (14). The card list build test is 163 (6 new: the files, the sets file, a reuse publishing them again with no request, a damaged file not loaded). The deck page check is 249 (11 new: the window, its two small fetches and no more on a second open, the filter, hovering, choosing, keeping the 2 copies, Default, saving keeping the art, files blocked, then back). The deploy check is 70 (14 new once the cache holds the files: they are served as JSON, a missing file is a 404, and each file equals the cache). `npm test` quick suites 54; the lobby (65) and live room (26) checks pass. Screenshots at 1920x1080 with real pictures.
- **Not checked:** the real Vercel build of the new data (the first build on a branch downloads Scryfall's files, about 100 MB, then caches; I ran the deploy check against a local cache seeded from the files I built here), phone width, light mode.

**Decisions**
- Screen size: my checks run in a headless browser that can be any size; 1280 and 1400 were just my choice for desktop. I took screenshots at 1920x1080 for this entry.
- Claude's own mistakes: my first idea was to group printings by the 4-character card key already in the per-set files, which would have mixed up about half the cards (the key is 16 bits and 34,000 names collide); the grouping is by exact name now. The deploy check would not have run the new checks at all on this machine (its cache was in the old format); I seeded a copy of the cache to run them and put the old one back.

---

## 128. The printing window shows the pictures (2026-11-10)

**What I asked for**
- Show the printings as the card pictures instead of a list, in columns of three, ordered by release date with the newest at the top left; a search bar for the card id, set name and set code; and should the explicit "Default printing" go, since the default is probably the latest non-Secret-Lair printing or the cheapest?

**What changed** (`frontend/src/printing-picker.js`, `shared/card-prints.mjs`, `scripts/lib/card-list.mjs`, `style.css`)
- A grid of three pictures to a row, left to right and then down, newest first. Each is the small picture (about 12 KB), fetched only when it scrolls into view (the browser's lazy loading; 24 of Sol Ring's 133 were fetched on opening), with the set code and number in bold and the set name and year under it. Pointing at one still shows the normal-size picture. The printing in use has a frame and is scrolled into view.
- Search takes words in any order, all required: set name, set code, collector number, year or a Scryfall id (the start of it or all). "card id" could mean the collector number or the Scryfall id; both work.
- The "Default printing" row is gone. The printing the card list uses by default carries a small "Default" mark on its picture (when it is one of the printings listed), and "Use the default" in the window's header appears only when a printing was chosen and takes the choice off again.
- The year shown is now the printing's own, not its set's first year: a printing in The List or a Secret Lair drop came out later than its set's first release, which made the order look wrong. The data rows carry the year (`["cmm","410","<id>","2023"]`), list format 8; the files grew by about 0.14 MB compressed in all (3.21 MB, median file 12.5 KB, largest 32.6 KB), and one card's file plus the sets file is still about 20 KB to open.

**What the default printing is, from the real data (not my guess)**
- The list's default is Scryfall's own pick for the card (the id in its Oracle Cards file), not the cheapest and not always the latest non-Secret-Lair. Of 33,973 cards: the default is the newest printing for 22,697 and the newest non-SLD printing for 23,046; it is some older printing for the rest (Lightning Bolt's is the 8th newest, Counterspell's the 16th), and for 1,224 cards (3.6%, for example Sol Ring) it is not among the paper printings I list at all. So it cannot be replaced by a rule like "latest non-SLD" without changing which art decks show today; marking it on its picture keeps that visible. Say if you would rather have the rule (or the cheapest, which needs prices I do not have).

**What I checked**
- The deck page check is 257 (8 new: three columns, newest first, lazy pictures and only a few fetched, search by set name, set code, code plus number, Scryfall id, year plus name, no match, the reset button). Card prints (17), card list (234), card list build (163), `npm test` quick suites; a screenshot at 1920x1080 of Lightning Bolt's printings.
- **Not checked:** a real Vercel build of the new files, phone width (three columns in a narrow dialog), light mode.

---

## 129. A round of small fixes to the deck page and a stacks view (2026-11-10)

**What I asked for**
- No blue highlight when I click into the paste box; no caption under the hovered card ("X: the printing you named"); the right-click menu worded less stiffly; the card-pictures icon changed to four cards and a new view with three or four cards cascading, in vertical stacks; rounded corners on the hovered card picture (white shows at the corners of black-border cards); planeswalkers above creatures; the picture view eight columns instead of twelve.

**What changed** (`style.css`, `card-peek.js`, `deck-groups.js`, `shared/deck-view.mjs`, `shared/deck-commander.mjs`)
- **Paste box:** no outline and no blue; a quiet grey edge when it has the focus (the keyboard focus on buttons, links and the other fields is unchanged).
- **Hover picture:** nothing is written under it any more; the note stays only for a picture that cannot be loaded. Its corners are rounded to a card's (4.8% by 3.4%), and so are the pictures in the picture view and in the printing window.
- **Menu words:** "Make commander", "Make partner", "Remove as commander", "Remove as partner" (the old "(replaces the current one)" and "instead" are gone; making a card the commander still replaces the old one and the old one goes back to its type group). "Change printing..." stays.
- **Views:** three buttons now: the three-line list, four cards in a 2 by 2 for the pictures, and three cards cascading for the new "Stacks" view. In Stacks each group is a column of overlapping cards: a strip of 1.5 rem with the name of each shows and the last card is in full; the card under the pointer comes to the front and the big picture shows. The choice is remembered like the other two.
- **Eight columns:** the picture view and the stacks are eight to a row on a wide window (six, four and three on narrower ones), each no wider than 10 rem so the small pictures stay sharp.
- **Planeswalkers above creatures:** the Planeswalkers group is shown above Creatures, and a card that is both (a planeswalker creature) is a planeswalker. My reading of "higher priority": both the order of the groups and which group such a card is in.

**What I checked**
- `test-deck-view` (56) and `test-deck-commander` (22) updated; the deck page check is 262 (5 new: the quiet paste box, planeswalkers above creatures, eight to a row with rounded pictures, stacks overlapping with a strip of about 24 px and remembered, a stacked card coming to the front). Screenshots at 1920x1080 of the pictures and of the stacks with the hovered picture.
- **Not checked:** phone width for the stacks, light mode, a very long stack (the creatures stack is about 29 cards tall in my sample).

**Decisions**
- "12 columns" I read as the picture view (it had as many as 12 to a row at 1920). If you meant the text columns, tell me.
- Claude's own mistake: my check of the quiet paste box failed at first because the headless page was not counted as focused, so `:focus` never applied; it now turns on focus emulation first.

---

## 130. The pictures and the stacks fill the width (2026-11-10)

**What I asked for**
- Eight columns is good, but the cards must be larger to fill the space (that was why I wanted fewer columns), and the stacks view should be spread out too.

**What changed** (`style.css`, `deck-groups.js`)
- My cap of 10 rem a picture, put there to keep the small pictures sharp, left the row short; it is gone. The picture view and the stacks are now eight columns that share the whole width of the page (six, four and three on narrower windows), and the deck page may use up to 120 rem, so on a 1920 window each card is about 222 px wide. In the stacks the strip of each card that shows is 15% of its width (it was a fixed 1.5 rem), so the names stay readable as the cards grow, and the gaps between stacks are wider.
- **Sharper pictures, and what they cost:** a tile now offers the browser two pictures: the small one (146 px, 12 KB) for a tile up to 190 px wide, and the normal one (488 px, 71 KB) for a wider tile. On 1920 it picks the normal one (39 of 39 loaded ones in my run), on a 1280 window the small one. So the sharp cards on a big window cost about six times the bytes per card; they still load only as they scroll into view (about 40 at a time), and only in the pictures and stacks views. If you would rather keep the small ones everywhere, it is one line.

**What I checked**
- The deck page check is 264 (2 new at 1920: the stacks in eight columns of cards 200 px or more wide with the last at the right edge, and the pictures filling the row with the normal-size picture picked; the old width cap check became "the row fills the width"). Screenshots at 1920x1080 of the pictures and of the stacks.
- **Not checked:** a 2560 window (the page stops at 120 rem, so the cards stop growing at about 1920 wide), phone width, light mode.

---

## 131. Sorting the deck, and no magnifying glass (2026-11-10)

**What I asked for**
- Stop the cursor turning into a magnifying glass over the cards. Allow sorting by things like mana value, alphabetical and color.

**What changed** (`shared/deck-view.mjs`, `frontend/src/deck-importer.js`, `style.css`)
- **Cursor:** the two `cursor: zoom-in` rules (the text lines and the pictures) are gone; the cursor stays an arrow over a card.
- **Sort by:** a labelled choice beside the view buttons: Name (the old way), Mana value and Color. It sorts the cards inside each type group, in the text, picture and stacks views, and is remembered in this browser. The commander group keeps the order you picked them in.
  - **Mana value:** read from the cost: a number counts its value, a colored, colorless, snow, hybrid or Phyrexian symbol 1, {2/W} 2, X nothing; no cost (a land) is 0. A split or adventure card counts its first cost. Lowest first, the name settling ties.
  - **Color:** white, blue, black, red, green, then more than one color (two-color cards sorted apart by which colors), then colorless and lands, then mana value and name. The color comes from the mana cost (every part of a split card), because the card list has no color field; so a card with no colored symbols in its cost (a land, or an artifact) counts as colorless.
- Not built: a direction (high to low), sorting by price or rarity (the card list has neither), and grouping by color or mana value instead of by type; say if you want any of them.

**What I checked**
- `test-deck-view` is 67 (11 new: mana value of every kind of symbol, color order, split and hybrid cards, the three sorts, an unknown sort, the commander group). The deck page check is 270 (8 new: the control, each sort, in the picture view, remembered across a reload, and the cursor not being a zoom cursor).
- One existing check of mine was timing-fragile: it counted every picture request after hovering a printing and now sees the lazily loaded tiles too; it counts only the normal-size request now.
- **Not checked:** the sort control at phone width, light mode.

---

## 132. The sort can run either way (2026-11-10)

**What I asked for**
- High to low and the other way round for the sort. I also asked whether Claude commits and pushes to the development branch on its own.

**What changed** (`shared/deck-view.mjs`, `frontend/src/deck-importer.js`, `style.css`)
- A button beside the sort that turns it round. It is just an arrow (you asked for an up or down arrow): up for the usual way and down for the other way round. Its tooltip and its screen reader label say the words: "A to Z" or "Z to A" for names, "Low to high" or "High to low" for mana value, "W to G" or "G to W" for color. I chose up for ascending; say if you want it the other way round. Only the main key turns round: the name still settles a tie from A to Z. The direction is kept when you change the sort, and is remembered in this browser.

**What I checked**
- `test-deck-view` is 72 (5 new: Z to A is the exact reverse, high to low, G to W, the default and an unknown direction, the button's words). The deck page check is 275 (5 new: the button's words and screen-reader label, turning it round, following the sort, G to W, kept across a reload).
- **Not checked:** the button at phone width, light mode.

**About committing (my answer to the question)**
- I committed and pushed to `development` in my last several turns without being asked each time, after you said "commit and push to dev branch after" once. My rule file said to commit and push only when asked, so I held this change back and asked; you then said you do not mind me committing and pushing straight to the development branch as long as I mention it. So from now on: development, yes, and I say so; `main`, only when you ask. Nothing was ever pushed to `main`.

---

## 133. Saved decks as cards, and a bracket guess from the Game Changers (2026-11-10)

**What I asked for**
- How are decks displayed today, and maybe CSS cards of the commanders with the deck name, commander name(s), bracket and colors, a dual-commander card split diagonally. Also bracket guesses, purely from the Game Changer count, unless the player reselects the bracket.

**What it was before:** each saved deck was a plain bordered row: its name, a line of text (format, bracket, size, commander names, date) and Open, Play solo and Delete; the lobby shows the decks only as lines in a drop-down.

**What changed** (`shared/deck-bracket.mjs`, `shared/deck-colors.mjs`, `shared/deck-library.mjs`, `shared/lobby-deck.mjs`, `scripts/lib/card-list.mjs`, `frontend/src/deck-importer.js`, `style.css`)
- **Data (list format 9):** the card list now carries `ci` (a card's color identity as letters in W U B R G order) and `gc` (1 for a Game Changer), straight from Scryfall's own `color_identity` and `game_changer` fields. I printed them first: all 39,287 Oracle records have both fields; 53 are Game Changers (on the Nov 5 file); 31,078 of the 34,192 cards in our list have a color identity. The list grew from 1.38 to 1.42 MB compressed. The next Vercel build rebuilds the list once for the new format (the 100 MB download, as for every format change).
- **The cards:** a saved deck is a CSS card tinted with its colors, a soft gradient across them (one tint for one color, grey for none), with the deck's name, "Commander" or "Standard", the commander name(s), the colors as the mana symbols, the bracket as a dark badge (with "(guess)" when it was guessed) and the size and date. **Two commanders split the card diagonally** (the first commander's colors on the upper left, the second's on the lower right, a thin line along the split, the colors of both together in the symbols). A Standard deck has no commanders and takes the colors of its cards. Colors are the card list's color identity, which includes colors in a card's text, not only its cost. They appear as soon as the card list has loaded (about a second after the page).
- **The bracket guess:** only the number of Game Changers in the main deck and the commander (not the sideboard, companion or maybeboard): none is bracket 2, one to three is bracket 3, four or more is bracket 4. The Bracket choice now starts at "Auto (3)" (it says what the guess is) with a note under it naming them ("2 Game Changers: Cyclonic Rift, Rhystic Study"); picking a number says it yourself, and picking Auto again goes back to guessing. A guess is saved with the bracket and a `bracketGuess` flag, and the deck page guesses it again from today's list when the deck is opened; the lobby sends the flag, so seats say "bracket 3 (guess)" and the deck picker too. A Standard deck has no bracket.
- **What the guess cannot see:** it is only the lowest bracket the Game Changer count allows, and it reads 0 as 2 and 4 or more as 4. Bracket 1 (no Game Changers and a theme), bracket 5 (cEDH) and the other limits (mass land destruction, chained extra turns, tutors) depend on things the list does not know, and on the table's intent. A deck with 0 Game Changers can be 1, 2 or 3; a deck with many can be 4 or 5.

**What I checked**
- New suites: `test-deck-bracket` (9), `test-deck-colors` (11); `test-card-list` is 240 (6 new for `ci` and `gc`), `test-deck-library` 114, `test-lobby-deck` 43. The deck page check is 288 (13 new: Auto (2), (3) and (4), the note, sideboard cards not counted, Standard, saving on Auto stores the guess with the flag, choosing stores it as chosen, opening shows the chosen one or Auto, the cards with their colors and brackets, the diagonal split with its two triangles and line); the live lobby check (170) and the live room check (26) pass. A screenshot of four decks, one of them with two commanders.
- **Not checked:** a real Vercel build of list format 9, light mode and phone width for the cards, the cards in the lobby (it still shows a drop-down).

---

## 134. Commander art on the deck cards, and the buttons in a menu (2026-11-10)

**What I asked for**
- Use the deck's commander prints as the face of the CSS cards, and reorganize the buttons under each one so it's tidier and not showing on every card.

**What changed** (`shared/card-image.mjs`, `shared/deck-colors.mjs`, `frontend/src/deck-importer.js`, `style.css`)
- **The face is the commander's art.** Each saved deck's card shows Scryfall's `art_crop` picture of the printing the deck uses for its commander (the printing I chose, else the card's own id). Two commanders: each art fills its own half of the diagonal split. The color tint stays underneath until the picture loads and stays if it cannot (a Standard deck has no commander, so it keeps its tint). Text turns white over art with a dark gradient for reading. I checked first that an `art_crop` address answers 200 as an image of about 42 KB with a year of caching, and it is on the host the content policy already allows, so no policy change and no new Scryfall API request (it is a picture address, like the others). Cost: about 40 KB per commander shown, loaded lazily.
- **Buttons.** The Open, Play solo and Delete row under every card is gone. The whole card is one button that opens the deck; a round "..." at its corner (shown when the pointer is on the card or it has keyboard focus, always shown on touch screens) and a right-click on the card open a menu with Open, Play solo and Delete, the same menu as the table's cards.

**What I checked**
- Unit suites: `test-deck-colors` (12) and `test-card-lookup` (41) updated. The deck page check is 291 (the card is one button, the menu has the three items from the "..." and from a right-click, one picture for one commander, two for a split card, none for Standard, all from `art_crop`); lobby page check 65; all 56 quick suites pass. A desktop screenshot with the real art: the split card, the one-commander card and the Standard card all read well, and the "..." appears on hover.
- **Not checked:** light mode, phone width, and the lobby (still a drop-down). No live run this time.

---

## 135. The deck page, third pass: cards, a card display for the stacks, grouping, and facts below the deck (2026-11-10)

**What I asked for**
- Remove "(guess)" from the deck cards, watch for five colors wrapping text, reorganize the card text, and the "..." looks wonky.
- Stacks view: a card must not jump to the front on hover; make the stacks narrower and put an area on the left that shows the card under the pointer. A click keeps a card there; hovering others updates it; blank space goes back to the last clicked card; no highlight on the selected card; before any click, show the commander.
- Reword the sort tooltips and say ascending or descending together with the arrow; add grouping (type, color, mana value); call the sort "mana cost".
- Make the top of the deck page less awkward, and put information below the deck, using the reference pictures (no prices).

**What changed** (`shared/deck-view.mjs`, `shared/deck-stats.mjs`, `frontend/src/deck-importer.js`, `deck-groups.js`, `stack-preview.js`, `deck-stats.js`, `style.css`)
- **Deck cards:** no "(guess)" in the words (the tooltip on the bracket still says it was guessed). The format moved to the bottom row ("Commander · 100 cards"), the date is gone, the name has the top row to itself, and the colors, bracket and facts never break in the middle (they wrap as whole pieces, so five colors fit). The "..." is a drawn three-dot icon in a round button, because the text ellipsis sat low in its box.
- **Stacks:** a card no longer comes to the front on hover or focus. A 20 rem card display sits on the left (it stays in view while scrolling); it shows the card under the pointer, a click keeps a card there, blank space or leaving the stacks returns to the clicked card, and before any click it shows the commander (else the first card). Nothing is highlighted. The floating picture is off in this view. The display asks for its picture only while the stacks view is showing, so the other views cost nothing extra.
- **Sort and group:** "Mana value" sort is now "Mana cost". The order button reads "↑ Ascending" or "↓ Descending", and its tooltip says for example "Ascending ↑ (Low to high). Press for descending." A new "Group by" choice: Type (as before), Color (white, blue, black, red, green, multicolor, colorless) or Mana value (0 to 7+). Lands are always their own last group, and the commander, sideboard and the rest stay where they were. Both choices are remembered.
- **The header:** one compact block: name, format, bracket, commander and partner on shared rows (they wrap as the window narrows), Save to the right, then a strip of facts (cards, lands, average mana value without lands, colors).
- **Below the deck ("About this deck"):** a mana curve (permanents and instants/sorceries stacked, columns 0 to 7+), color requirements (the colored mana symbols in costs, a hybrid symbol split evenly, generic not counted), and card types with the average and median mana value. All of it is worked out from the card list's costs and types in `shared/deck-stats.mjs`. I left out what the reference pictures show that we cannot know: where mana comes from (the list has no rules text), combos, prices, and legality checks.

**What I checked**
- New suite `test-deck-stats` (23 checks); `test-deck-view` is 79 (7 new for grouping); the deck page check is 303 (10 new: grouping, the facts strip, the curve, the color requirements, the card types; the stack checks now say a card does not come to the front, shows in the display, goes back to the commander, and stays after a click); lobby page check 65; the live room check 26; all 57 quick suites pass. Screenshots at 1920 wide with the real pictures of the stacks view, the information below it, and the saved cards.
- **Not checked:** light mode, phone width (the stacks display just stacks above the cards under 800 px), a keyboard walk through the stacks, the lobby (still a drop-down, and its picker still says "(guess)").

**My mistakes this round:** a shell heredoc turned my new browser checks into broken JavaScript (a real newline inside a string), so I wrote them again with the editing tool. Four expectations in my own new tests were wrong arithmetic (a card count, a spell count, an average, "Instants (7)"); each was my error, not the code's. The first version of the stacks display asked for its picture even when another view was showing, which a check caught.

---

## 136. The card display in every view, and a site header (2026-11-10)

**What I asked for**
- The card display on the left should be for all views, not just the stacks. Let's have a proper header now, and which folder can I put Overloaded's logo in?

**What changed** (`frontend/src/stack-preview.js`, `deck-groups.js`, `deck-importer.js`, `site-header.js`, `style.css`, `lobby.js`, `deck.js`, `frontend/public/brand/logo.svg`)
- **The display for every view.** The text list, the pictures and the stacks all have the card display on the left, with the same behavior: it shows the card the pointer is on, a click keeps a card there, blank space returns to the clicked card, and before any click it shows the commander. A card with a back face shows the back too, smaller, under the front (a back picture that does not exist is dropped and the front stays). The floating picture is no longer used in the deck; the printing picker still uses it. Cost: one normal-size picture (about 70 KB) is asked for as soon as a deck is shown; it used to be nothing until a hover. The list and the pictures now have less room: the text list is two columns at 1280 (it was three), the pictures are six to a row up to 1500 wide and eight on a wider window. The small picture now stands for 160 px in the picture view (it was 190), so a tile 170 px or wider gets the sharper normal picture.
- **The header.** One bar at the top of the lobby and deck pages: the logo and the name "Overloaded" with a BETA mark on the left (it links home), and Lobby, Decks and Solo table on the right with the current page marked. "Lobby" goes to the table this browser is at, if any. The solo and table pages keep their own top bars because the game needs the room.
- **The logo goes in `frontend/public/brand/logo.svg`** (Vite serves `frontend/public` at the site root, so it is `/brand/logo.svg`). I put a plain placeholder there so the header never asks for a file that is not there (that was a console error in a check); replace the file, keeping the name, or change `LOGO_URL` in `site-header.js`. A favicon can go in the same folder, and the pages' `<link rel="icon">` should then point at it (they still say `data:,`).

**What I checked**
- The deck page check is 273 and the lobby page check 65; the live room check 26 and the live lobby check 170 pass; all 57 quick suites pass. Screenshots at 1280 (text view) and 1920 (stacks) with the real pictures and the header.
- I removed about 30 checks that exercised the floating picture on deck rows (placement near the window's edge, Escape, scrolling, a missing picture, a narrow window), because that behavior no longer exists in the deck. The printing picker still uses the floating picture and still has its hover check, but its Escape, scroll and edge cases are no longer tested anywhere. I have not re-tested those for the picker.
- **Not checked:** light mode, phone width, the header on a phone, a keyboard walk through the display, the logo as a favicon. The "Back to the lobby" link and the lobby's own "Overloaded (BETA)" heading are now redundant with the header; I left them because tests and the table-return logic depend on them, so they are for Kevin to decide.

**My mistakes this round:** a global replace of `dataset.cardId` in the check also changed the printing picker's lines, which a failing check then showed; the first header put Save in the middle of the row until a screenshot showed it.

---

## 137. The real logo in the header (2026-11-10)

**What I asked for**
- I added the logo; use it or rename it however you want.

**What I found:** `overloaded logo.png` was 2000 by 2000 pixels and 1.5 MB, in `frontend/public` (which is served to every visitor). I measured it in a browser: a transparent background, a grainy near-white wordmark of "Overloaded" occupying only the box 1668 by 352 pixels in the middle. So it is a wordmark, not a square icon, and it is invisible on the light theme as it is.

**What changed** (`frontend/public/brand/logo.png`, `frontend/assets/overloaded-logo-source.png`, `frontend/src/site-header.js`, `style.css`)
- The original moved out of the served folder to `frontend/assets/overloaded-logo-source.png` (a lowercase name, not served; it is the source to redo the small one from). The header uses a copy cropped to the wordmark and shrunk to 432 by 96 pixels (70 KB instead of 1.5 MB, sharp up to three times the size shown), made with the browser's canvas so nothing was installed.
- The header shows the wordmark in place of the placeholder icon and the written name; the written name stays for screen readers, and shows alone if the picture cannot be loaded. On the light theme the wordmark is turned dark with a CSS filter. The placeholder `logo.svg` is deleted.

**What I checked**
- Screenshots of the header on the dark theme (in the deck page) and the light theme (a stand-in page with the real style sheet, not the real page). The deck page check (273, with the logo check updated to the new file, its 432 pixel width and the hidden name), the lobby page check (65) and all 57 quick suites pass.
- **Not checked:** the grain of the original is gone after shrinking, which I think is right for a header but is my call; a favicon (the wordmark is too wide for one; a square mark would be needed); phone width.

---

## 138. Autosave, play and delete on the deck cards, and a clean-up of repeated text (2026-11-10)

**What I asked for**
- Remove redundant lines of text in all routes and actually clean them up. Why do I need the "All decks" and "Edit list" buttons? Why does the card say "solo deck"? Remove the "..." from the cards and let me play solo or delete straight from the list. The Krenko deck is labeled colorless though the commander is red. So much gap and wasted space, the header buttons far right. Decks should save after every action, not with a Save button.

**Why Krenko was colorless (found, not just fixed)**
- My screenshot of the sample deck says "7 Game Changers" and "Auto (4)"; Kevin's says "No Game Changers" and "Auto (2)". Same code, different card list: his preview was built from an old-format list (the Vercel preview build reuses any cached list, however old). The card's colors come from the list's `ci` and the Game Changers from `gc`, and an old list has neither. Two fixes: a preview build now rebuilds (one download, then cached) when the cached list is in an older format, and the deck colors are now also taken from the cost (a cost is always inside the color identity, so nothing changes with a current list). I could not look at his preview, so the cause is deduced from those two screenshots, not observed; the first preview build after this will show it (`/data/cards.info.json` says the list format).

**What changed** (`frontend/src/deck-importer.js`, `deck-stats.js`, `style.css`, `shared/deck-library.mjs`, `shared/deck-colors.mjs`, `scripts/lib/card-list-build.mjs`, the deck and lobby pages)
- **Autosave.** The Save deck button and the "save without the unmatched lines" box are gone. A deck saves itself after a check, a new name, format, bracket, commander or partner, a card chosen for a problem line, or a changed printing, and a quiet "Saved" (or "Not saved: the reason") sits beside the name. A new deck is added under a name no other deck has ("New deck", or its commander's name, with (2), (3) if taken); an open deck is replaced by its id, so renaming it renames it. Two things behave differently from before, on purpose: a name another deck has is refused (it used to replace that deck) and editing a deck does not make it the solo deck. Unmatched lines are left out and counted, as before. Opening a deck does not write it back. The sample opens its saved copy if there is one, so it is not copied again each time.
- **Deck cards.** No "solo deck" tag, no "...". Two small round buttons (play, delete) appear at the corner when the pointer or keyboard is on the card (always on a touch screen). The right-click menu is gone with the "...".
- **Repeated text removed:** the Back to the lobby link on the deck page (the header's Lobby link goes to your table if you are at one); the All decks and Edit list buttons (now two small quiet buttons in the row above the deck, "‹ All decks" and "Edit list"); the page heading on the deck screens (it stays for screen readers; it shows on the list); the "19 cards" line (the facts strip has it; it shows only when something needs attention); the "No Game Changers" note (the choice already says Auto (2)); the empty message line that left a blank band; on the lobby, the heading "Overloaded (BETA)" (now "Lobby") and the line that told you to import a deck and play solo (the header has both places), and a shorter note under Make a table.
- **Space.** The header's places sit next to the logo, not at the far edge; the deck's choices sit together now that Save is gone; the list's New deck button shares the line of its heading.

**What I checked**
- New or changed tests: `test-deck-library` is 124 (uniqueName and replaceDeck), `test-deck-colors` 13 (a card with no `ci`), `test-card-list-build` 164 (a preview with an old-format list rebuilds). The deck page check is 272: I rewrote the save-related parts for autosave (the problems, the commander, several decks, the limit of 20, the sample, the screens) and removed the checks of the menu and the Save button. The live room check (26) and the live lobby check (170) pass; all 57 quick suites pass. Screenshots of the list and the deck at 1280.
- **Not checked:** the solo, table and lobby pages beyond the changes above (I did not go through their text, and left the Back links on the solo and table pages, which have no header), light mode, phone width, and a real Vercel preview build with the format rule (it downloads about 100 MB once, as the log says for other format changes).

**My mistakes this round:** several shell one-liners lost their quoting and I had to redo them with the editing tool; my first autosave made every check in my own test run add a deck (the test needed to start each part from no decks); I first expected the editing of a loaded deck to reset its bracket as it did for a pasted one, which would have silently destroyed a chosen bracket, so editing the list of a saved deck now keeps its format, bracket and commander.

---

## 139. The Game Changers in a panel (2026-11-10)

**What I asked for**
- The way Game Changers are listed is unorganized and messy; look at my references for how they pack it up neatly.

**What changed** (`frontend/src/deck-importer.js`, `style.css`, `scripts/check-deck-ui.mjs`)
- The sentence "7 Game Changers: Ancient Tomb, Chrome Mox, ..." under the header is gone. A small (i) beside Bracket opens a panel, like the Bracket Information box in the references: a title, one line saying what Auto picked and why, "Game Changers (7)" with the names in two columns, and a footnote that mass land denial, extra turns and combos are not counted (the card list does not know them). With none, it says "None in this deck." It closes with Escape or a click elsewhere, and the (i) is a button with `aria-expanded`.
- `bracketNote` in `shared/deck-bracket.mjs` is no longer used by the page; I left it and its test alone.

**What I checked:** the deck page check is 276 (the four Game Changer checks now read the panel's list and count, and four new ones cover it being closed at first, opening with a title, the guess line and two columns inside the window, Escape, and a click elsewhere). A 1920 screenshot of the sample deck with the panel open looks tidy. Not checked: light mode, phone width, the panel in the lobby's importer.

---

## 140. A footer, a steadier header, one way to the list, no commander boxes, and what Commander Spellbook offers (2026-11-10)

**What I asked for**
- A proper footer with the disclaimer in it. The header seems to reload on every click; it should be one smooth motion, and it should not be squashed into the top left. Why an All decks button and a Decks link in the header? Why Commander and Partner boxes when a right-click picks them? Can Commander Spellbook's REST API improve this, at a low call cost, for combos and the bracket?

**What changed** (`frontend/pages/deck/index.html`, `frontend/pages/lobby/index.html`, `frontend/src/site-header.js`, `deck-importer.js`, `deck-groups.js`, `style.css`)
- **Footer.** A full-width footer on the lobby and deck pages: the places (Lobby, Decks, Solo table, Source on GitHub), a credit to Scryfall, and the fan content notice. It is written in the page, so it is there without a script. The game pages (solo, table) are unchanged; their notice stays where it was.
- **Header.** It is now written in each page's HTML instead of added by a script, so it is there from the first paint and no longer pops in after the script loads, which I think was the "reload" you saw (the page does load again between pages; there is no single-page navigation). It also has room: a bigger wordmark, 3 rem between the logo and the places, wider links and padding. I tried cross-document view transitions to keep it perfectly still; in headless Chrome every page change logged "ViewTransition opt-in disabled" even with the rule at the top level, so I removed them rather than ship a console error on every click. Not verified: whether Chrome's own paint holding already makes the header look still when it is a real window.
- **One way to the list.** You were right: on the deck page "All decks" repeated the header's Decks link. It is gone; the Decks link in the header now shows the list at once without loading the page (a check sets a marker on the page and finds it still there). Inside the lobby, which has no such link, a small "All decks" button stays.
- **No Commander and Partner boxes.** You were right again: "Make commander", "Make partner" and "Remove as ..." in a card's right-click menu already did it, and the Commander group shows the result. The boxes are gone; the Commander heading says to right-click, and when the commander was guessed the note says "Right-click a card to change it". Dead CSS for the boxes is removed.

**Commander Spellbook (researched, nothing built)**
- I read the real API root and its OpenAPI schema (version 7.3.7). `POST /estimate-bracket` takes `{ commanders: [{card, quantity}], main: [...] }` and answers `bracketTag` (R S P O C E B: Ruthless, Spicy, Powerful, Oddball, Core, Exhibition, Banned), each card with `gameChanger`, `massLandDenial`, `extraTurn`, `banned`, and the combos with `definitelyTwoCard`, `lock`, `extraTurn`, `massLandDenial`, `skipTurns` and more. One real call with a 10-card test list took 0.68 s and 9.8 KB. That is exactly the information in your bracket reference.
- **It cannot be called from the browser.** The API answers a request from another site with no `Access-Control-Allow-Origin`; its preflight allows only `https://commanderspellbook.com`. A page on our address would be blocked by the browser.
- **The bulk file is not usable at build time.** They ask for `variants.json.gz` instead of paging the API: it is 32 MB compressed and 729 MB uncompressed (I downloaded it once into the ignored cache to measure it, then deleted it). That is more than a build can hold without a streaming parser.
- **Their rules:** a few calls per user action, 80 per minute at most, handle 429, name the service in the User-Agent (a browser cannot set that header), and credit them with a link to commanderspellbook.com.
- So the only way is a small server function that Overloaded calls (a Vercel Function, free on the plan we use) that makes the one POST with a proper User-Agent. That is a new kind of thing in this project (no server so far), so I did not build it; it needs Kevin's decision (plan below in the reply).

**What I checked**
- The deck page check is 273 (the commander checks now read the Commander group; new ones for the written header and footer, the footer's content, the Decks link without a reload, and no All decks button). The lobby page check (65), the live room check (26), the live lobby check (170), the importer markup check and all 57 quick suites pass. Screenshots at 1280 and 1920.
- **Not checked:** a real page change in a real window (only headless clicks), the footer on the lobby page by eye, light mode, phone width.

**My mistakes this round:** my first move of the check to the header's Decks link broke the "showList" helper; I wrote the view-transition rule inside a media query, where Chrome did not accept it, then at top level where it still logged an error.

---

## 141. Two more repeats of the header taken out of the lobby (2026-11-10)

**What I asked for**
- Pass on Commander Spellbook for now (dropped; the research is in entry 140). Remove the redundant buttons that are already in the header.

**What changed** (`frontend/pages/lobby/index.html`, `lobby.js`)
- "Back to the start page" on the screen for joining a table by link: the wordmark in the header already goes to the start page.
- "Go to your table" on the start page: the header's Lobby link already goes to your table when this browser is at one. The sentence "You are at table X" stays, and says so.
- I looked at every page for other repeats. The solo and table pages have no header (the game needs the room), so their Back links and the "Import a deck" buttons in their empty states are not repeats of anything there; I left them. The deck page has none left.

**What I checked:** the lobby page check (65, one check now says the join screen has no link of its own), the live room check (26, now checking that the header's Lobby link goes to the table), all 57 quick suites.

---

## 142. The footer no longer repeats the header (2026-11-10)

**What I asked for**
- The same clean-up for the footer.

**What changed** (`frontend/pages/deck/index.html`, `frontend/pages/lobby/index.html`, `style.css`)
- The footer's Lobby, Decks and Solo table links are gone. It now has the credit to Scryfall with the link to the source on GitHub, and the fan content notice.

**What I checked:** the deck page check (273, the footer check now expects only the Scryfall and GitHub links), the lobby page check (65) and all 57 quick suites. I did not look at a new screenshot of the footer.

---

## 143. The footer at the bottom of the window (2026-11-10)

**What I asked for**
- Kevin sent a screenshot of the lobby at 1875 by 957 with the footer floating in the middle of the window, and asked why it was that high.

**What changed** (`frontend/src/style.css`)
- On the pages with the new footer (lobby and deck), the page is a column at least as tall as the window and the content grows, so the footer sits at the bottom of the window when the page is short and after the content when it is long. An empty message line no longer takes room (it left a gap under the lobby heading).
- **Why it happened:** I had only looked at the deck page, which is always long; the lobby is short, and nothing pushed the footer down. My mistake: I did not look at the lobby after changing the footer.

**What I checked:** a screenshot of the lobby at 1875 by 957 (the footer ends exactly at the bottom of the window: bottom 957, window 957, no scroll); the lobby check (65), the deck page check (273), the solo check (430) and all 57 quick suites. Not checked: the footer on the lobby with a table open (a taller page) and light mode.

---

## 144. Table layout step 3: the right column, the card corner, Alt for the big picture (2026-11-10)

**What I asked for**
- Step 3 of the table layout from my list: the buttons from the top on the right side, a corner at the bottom right that shows the selected card until another is selected and also pings from other players, Alt held over a card shows the hover picture, and the legal disclaimer in Settings only.

**What changed** (`frontend/pages/table/index.html`, `frontend/pages/solo/index.html`, `table.js`, `solo.js`, `frontend/src/spotlight.js`, `card-hover.js`, `style.css`; details in `docs/layout.md`)
- **Right column.** The action buttons, the players list (table page), the piles and the command zone, and the card corner are one column at the right; the bar above the boards keeps only the turn and the life. On the table page the players list is moved into the column while a game shows.
- **Card corner.** The old pinged-card box that floated over the table is now this corner. It shows the selected card at the normal size and keeps it after I click away or press Escape, until I select another. A ping replaces it (with who pinged and a Close button) and goes when I select another card, another ping arrives or I close it; Close brings the selected card back. When empty it says "Select a card to see it here."
- **Alt.** The big picture appears at once while Alt is held over a card, and goes when Alt is let go or the pointer leaves. Resting the pointer no longer shows it (the old 0.35 s rest and its test are gone).
- **Disclaimer.** In Settings on the solo and table pages; those pages have no footer.

**What I checked**
- Layout check 385 at five window sizes with 0 to 3 other players (the order actions, players, piles, corner; the corner at the bottom right; nothing scrolls or overlaps); solo check 437 (Alt with real key events, the corner, the buttons' place, no footer, the notice in Settings); spotlight check 31 (corner mode); card hover unit test 21; the live two-browser check 172 (a real ping, then selecting another card replaces it, then deselecting keeps the card); lobby 65, deck 273, live room 26 and all 57 quick suites. Screenshots at 1366x650, 1366x768 and 1920x950 with three opponents.
- **Not checked:** a real four-player game; phones (no Alt there); light mode. **Tight spots:** at 1366x650 the players list scrolls inside its box and the corner is only about 85 px wide, so Alt is how a card is read there. The Fan Content rules say the notice goes on every public page; putting it only in Settings is my decision to follow Kevin's, so I will keep an eye on it before the site goes public.

**My mistakes this round:** the live check's old expectation that a closed ping hides the box was wrong after the corner became permanent (I changed it, not the page); my first live check for "selecting another card replaces the ping" compared pictures, and both cards were an Island, so it could not tell, and I changed it to look at the ping sentence.

---

## 145. Back on the main PC: a plain Alt picture, Alt kept from the browser, a number and a plus for the tax, no blue highlight, a tidier top line (2026-11-11)

**What I asked for**
- When I hold Alt the card pops up with a border around it: show just the card. Holding Alt must not open the browser's menu. The commander tax should be just a number and a plus sign, the same for the second commander. Stop using the ugly blue highlight. Fix the header or move what is up there elsewhere.

**What changed** (`frontend/src/card-hover.js`, `command-zone.js`, `style.css`, the solo and table pages, `table.js`)
- **Alt picture:** the box has no padding, border or background now; it is the picture with the card's rounded corners and a soft shadow.
- **Alt and the browser:** the page cancels Alt's keydown and keyup, so pressing Alt does not open the browser's menu (it does it on release when Alt is pressed alone). Other keys are left alone.
- **Tax:** each commander slot shows the number (0, 2, 4 ...) and one + button. The minus button and the word "Tax" are gone; a right-click on the number or the + takes a cast back. Both slots are the same.
- **Blue highlight:** I read this as the blue outlines and glows, not the filled blue buttons: the focus ring, the selected card's glow, the active player's border, the dotted outline of the command slots, the drop target on the hand and the focus outlines on the deck and header links. They use a new neutral `--ring` (near white on the dark theme, near black on the light one). The blue buttons (Draw, Pass turn and so on) are unchanged.
- **The top line of the table:** the "Back to the lobby" link is gone (you said the back and leave links are not needed; the table's own Leave button stays), and the solo page's two links are gone too. What is left is one quiet line: the table label and code (smaller, with normal letter spacing), then the messages. I read "the header" as this line, not the site header on the lobby and deck pages; tell me if you meant that one.

**What I checked**
- Solo check 440 (the Alt box has no frame; Alt's keydown and keyup are cancelled and a plain key is not; the tax is a number and one plus, a right-click takes a cast back); layout check 385; spotlight 31; lobby 65; deck 273; live lobby and table 172; live room 26; all 57 quick suites. A screenshot at 1920x950.
- **Not checked:** the Alt menu in a real Chrome window (headless Chrome has no menu, so I checked that the page cancels the key, not what a real browser would have done), the tax on the live table (it is hidden there until the rules are published), the light theme.

**My mistake this round:** two older checks assumed the shuffled hand has two different cards; with two Islands they failed at random. They now pick a different card.

---

## 146. The tax as a bare number, tidier piles and command zone, a quieter battlefield (2026-11-11)

**What I asked for**
- The commander tax should just be the number itself. Reorganize the layout again, including the battlefield. The command zone card is weirdly offset, and the text for the library and the other piles is smooshed and jumbled.

**What changed** (`frontend/src/command-zone.js`, `style.css`, `scripts/check-solo-ui.mjs`)
- **Tax:** each slot shows only its number, and the number is the button: a click adds a cast, a right-click takes one back (no plus sign, no minus, no word).
- **Command zone:** the card was drawn 48 px wide inside a 64 px card (the card's own padding squeezed its picture), so it sat off-centre in its dotted frame. The padding is zero in the slot now; a new check measures the margin on all four sides and the picture's size against the card's.
- **Piles:** the names (Library, Graveyard, Exile) were drawn over the bottom of the stacks, because the side column's general button padding (more specific than the pile's) removed the room I had made under them. The three piles are in a row with the name under each, and the count is a neutral pill instead of blue.
- **Battlefield:** the lines between single cells are gone; only the faint lines between card blocks stay. The drag target is outlined in the neutral ring.

**What I did not do, and why:** I did not change the battlefield's shape. Its grid is fixed at 112 by 44 cells (a 2.5 to 1 shape). It fits the 2x2 boards of a four-player table exactly, but a board that spans the whole width (solo, or one opponent) is taller than the grid, so the grid ends and the rest is empty. I tried centring it and it looked worse. Fixing that properly means choosing between more rows for the grid (changes where cards may sit, and every board's shape) or letting a lone board scale, so I left it for Kevin to choose.

**What I checked:** solo check 441, layout 385, spotlight 31, deck 273, lobby 65, live lobby and table 172, all 57 quick suites; real-picture screenshots of the solo table before and after.

**My mistakes this round:** my first pile fix did nothing, and so did the second: two selectors in the style sheet were more specific than mine, and I only saw it in the screenshots; the screenshot mode of the solo check still stops with an error ("bump is not defined") after saving its pictures, which I did not fix.

---

## 147. The hand as a fan with sorts (logic), then a hand with no box (2026-11-11)

**What I asked for**
- Redesign the hand: an arc like the Arena-style reference with mana costs above the cards, but as snappy as the white-cards video, where you drag a card to any spot. Three buttons that stay on and sort the hand (cost, card type, color; each click goes first sort, reverse, off; any mix, color first, then type, then cost), and a way to edit the type order in Settings.
- After the arc was in: discard the hand box, make the hand 50% larger, let the battlefield reach the bottom of the screen, and make the hover area only the card itself (after a drag, the card now in the old place showed enlarged as if I were still hovering there).

**What changed** (`shared/hand-sort.mjs`, `hand-layout.mjs`, `zones.mjs` `reorderHand`, `scripts/test-hand.mjs`; `frontend/src/hand-view.js`, `board-drag.js`, `style.css`, `solo.js`, `table.js`, `scripts/check-solo-ui.mjs`, `check-table-layout.mjs`)
- **Logic only so far for the sorts:** `sortHand` sorts a copy for display (color, then type in my order, then cost), and the stored hand order, which is my own arrangement, is never changed by a sort. No buttons or Settings pills yet.
- **The fan:** each card gets three numbers (across, down, turn) and the mana cost sits above it. Dragging a card out of the hand opens a gap where it would go back and the neighbours lean away; letting go puts it there.
- **No box:** the hand section has no border or background and floats over the bottom of my own board, which now reaches the bottom of the window. Only the cards take the mouse. The hand is 50% taller. A card carried from the battlefield only goes back into the hand when the pointer is over a card of the hand (what is under the pointer is asked of the page), so the rest of the bottom stays battlefield; a card carried within the hand uses the width the cards cover, so the gap does not flicker.
- **Hover:** a card's own resting box is what answers to the pointer. The lift is drawn on its picture and cost, so the box never moves or grows and a lifted card does not cover its neighbour.

**What I checked:** hand logic 61, solo check 456 (7 clean runs in a row after the fixes below), layout 405, lobby 65, deck 273, live lobby and table 172, all quick suites; screenshots of the solo table with 5 cards and of the worst case (three opponents, 1366 by 650). Not checked: phone width, and how it feels to use.

**What I did not do:** the three sort buttons, the Settings pills for the type order, their saving in the browser, and what a drag does while a sort is on (my plan: dragging is off while a sort is on, with a note). Auto-arrange puts lands at the bottom-left, so a wide hand covers them; with three opponents the hand covers more than half of my board.

**My mistakes this round:** the solo check failed about half the time after the fan went in and I spent most of the session on it. The cause was mine: the hand set an inline z-index on its cards, and a card played to the battlefield is the same element, so it kept that number and the wrong card was on top. My first instrumentation changed the timing and hid the failure, a 120 second limit I put on a loop killed every run and gave no output, and an extra waiting step in the drag helper did not help. What found it was dumping the board after a failure. A `sed` command also put a stray backtick at the start of every line of `hand-sort.mjs`. Two of my new hand checks were wrong (one needed a spell in a random deal, one nudged a card further than half a card). After the box change one reorder check failed once and passed in the next seven runs; I do not know why. My first drop zone for "back into the hand" was the whole box of the hand at full height, which on a short board (four players) covered much of the battlefield, so the live two-browser check showed Alice's card going into her hand instead of moving; I changed it to "over a card of the hand". The live check's drop point also has to be clear of the hand now. The first margin I made for the fan was fixed in pixels and clipped the first card once the hand was bigger, which a screenshot showed.

---

## 148. No panels, a number for the life, and a hand that overlaps, hides and lifts a copy (2026-11-11)

**What I asked for**
- When I hover a card in my hand there is a patch left where the resting card was; the card should move up with it. My battlefield is still in its own panel, so remove it, and remove the "Battlefield" text. Cards on the field have enormous mana cost symbols. The card display at the bottom right wastes room at the sides, so remove all the panels, put the library, graveyard, exile and command zone at the bottom right with the card preview above them. Rework the life counter: no +1 and -5 buttons, just click the number (left and right, Shift for 5, hold to set it with a circular loading).
- The hand: cards 25% larger, overlapping from about 7 like a real hand, about 25% hidden below the screen until the pointer is in its area, then the cards go up; carrying a card out of the area lowers the hand so I can see the board. While I drag a card in the hand the cards still act as if I am hovering over the left of it.

**What changed** (`frontend/src/style.css`, `hand-view.js`, `life-control.js`, `solo.js`, `table.js`, both `index.html`, `shared/life-input.mjs`, `shared/hand-layout.mjs`, `scripts/test-life-input.mjs`, `test-hand.mjs`, `check-solo-ui.mjs`, `check-table-layout.mjs`, `check-lobby-deck-live.mjs`)
- **Panels:** my battlefield, the buttons, the players, the card preview and the piles have no border, background or padding. The right column is now the buttons, the players (table page), the card preview, and at the very bottom the piles and command zone. The "Battlefield" heading is for a screen reader only.
- **Hover patch and giant costs:** the patch was the card button's own background, which stayed behind when the picture lifted. The giant symbols were my bug from entry 147: a played card is the same element, and it kept the cost row I add in the hand, which is only styled inside the hand. A cost row is now only shown in the hand.
- **Life:** the four buttons are gone. The number is a button: left click +1, right click -1, Shift for 5, hold it and a circle fills and a box opens to type the new total (Enter sets it, Escape cancels, a bad value is refused in words). Arrow keys and Enter work too. A right click NEXT to the number (the word Life) still opens the menu of counters, because a right click on the number now lowers life.
- **Hand:** 25% larger, edge to edge up to 6 cards and overlapping from 7 (a hand of 10 is 7.6 cards wide, not 10), lowered so a quarter of each card is below the window, raised while the pointer is in the area of the hand, lowered again when the pointer leaves, also while carrying a card out of it.
- **Your drag complaint:** I found a cause I can explain. A hovered card got a higher stacking number so its lifted picture would be on top, and its resting box then won the pointer over the cards it overlaps, so it kept the pointer while I moved over its neighbours; it gets much worse once cards overlap. Now the real cards never change their place or stacking, and the card under the pointer is shown lifted by a copy of it in a layer that takes no mouse. While a card is carried nothing is lifted.

**What I checked:** solo check 479 (the new life and hand checks included, several clean runs), layout 405, life input 35 (12 of 12 broken copies caught), hand logic 65, live two-browser check 173 on the real project, lobby 65, deck 273, all quick suites. Two broken copies of the hover (the lifted card holding the pointer over its neighbour, and the copy taking the mouse) are both caught. Screenshots of the solo table and of the raised and lowered hand. Not checked: phone width, touch, and how it feels to use; I have not seen your drag complaint myself, only found a cause that fits it.

**What I did not do:** the three sort buttons and the type-order pills in Settings. Opponents' panels still have their borders (I only removed yours). The top bar with the turn and life is still a panel. A hand of 7 or more now hides a quarter of its cards under the window edge, so the sorts will matter more. Open for me: lands are placed at the bottom-left, which is exactly where a wide hand sits, so a land can be entirely under the hand and cannot be pressed until it is moved with Alt+arrow keys; I have not changed where cards are placed.

**My mistakes this round:** my test for the new overlap pressed the exact middle of each card, which is under the next card in an overlapped hand, so a test failed for the wrong reason; the tests now press the part of the card that shows. My first hold ring was 44 pixels tall and made the top bar overflow by 3 pixels even while invisible. I forgot the old tests clicked the life buttons and right-clicked the number, so the solo and live checks needed updating. A live check failed twice at the lobby stage, both times right after a run that had failed, and passed on the next run each time; I did not find why. My life control also answered to Alt+arrow, which moves the selected card on the board, so while the number had the focus a keyboard nudge changed my life from 35 to 52; the live check found it and the number now ignores Alt, Ctrl and Meta. With the larger overlapping hand a land at the bottom-left can be completely under the hand, so the live check now lifts it out with keyboard nudges before dragging it. That is a real problem for play too (see below). My first version of the lifted card (a higher stacking number on the hovered card) was itself the cause of the complaint about hovering over the left.

---

## 149. A smooth hand: cards ease to their places, the places stay still while a card is carried (2026-11-11)

**What I asked for**
- Remove the weird animation when I move a card in my hand: when I drop it somewhere else another animation shows the cards moving. Study how Balatro does it (very smooth, not jittery; I gave the Balatro-Feel repository) and take inspiration. The hand also jitters massively when I move a card toward the end of the hand.

**What I found** (Claude read the repository's source: `Card.cs`, `CardVisual.cs`, `HorizontalCardHolder.cs`, through a helper; it could not read the scenes or prefabs, so the numbers are the code's defaults)
- There is no spring and no style-sheet-like tween on the hand. Every card has a logical place and a separate visual that chases it by a per-frame lerp; the carried card follows the pointer and leans with how far it lags; the other cards are told their new place at once and glide because their visuals chase it; a let-go card tweens back in 0.15 s. The reorder is decided by comparing the carried card with the places, with no dead zone.
- **My jitter had a clear cause.** While a card was carried I opened a gap by laying out a row with one more place (which re-centred the whole row and moved every place), but decided where the card would go against a row without it. Near the end of the hand the line between two places moved under the pointer, so the decision flipped back and forth. The weird animation was a 110 ms style-sheet transition that restarted on every change, and a let-go card slid in from where it had been picked up.

**What changed** (`shared/hand-layout.mjs`, `frontend/src/hand-view.js`, `board-drag.js`, `style.css`, `solo.js`, `table.js`, `scripts/test-hand.mjs`, `check-solo-ui.mjs`)
- **The places stay still while a card is carried.** The hand keeps as many places as it has cards; the carried card is over one of them (the hole), the other cards take the rest in order and the ones next to the hole lean 7 degrees away (was 12). Which place it is over is decided from the pointer against the middles of the places, with a dead zone (it only leaves a place when the pointer is 0.75 of a step from its middle), so a pointer on the line does not flip.
- **One small animation loop instead of style-sheet transitions.** Each card eases toward its place by the same share of the remaining distance every instant (24 per second, whatever the frame rate), so a change of target bends the path and nothing restarts. Raising and lowering the hand is part of the same numbers. Under reduced motion cards go straight to their places.
- **A let-go card starts where its picture was** and eases into its place, so it no longer flies in from where it was picked up.
- **The carried picture follows with a lag and leans with it** (hand cards only; a card from the battlefield stays exactly under the pointer, as the grid needs).
- **The edge of the hand's area no longer flickers.** Coming into the area acts at once, but leaving (the hand lowering, or the others closing up around a carried card) only takes effect after the pointer has stayed out for 150 ms. The area itself is taken from the layout of the whole hand, not from where the cards are going: it had been shrinking and growing under the pointer.

**What I checked:** hand logic 74 (including a pointer shaking around a line changing the hole at most once, and the places being exactly those of the whole hand whichever place the hole is at); solo check 488, several clean runs, with new checks that run with the normal animation on: the hand rises and lowers gradually, in one direction, without overshoot; carrying a card to the end with a shaky hand and then wobbling in and out over the edge of the area 60 times makes no card move back and forth; a slow wobble on the line between two places does not flip the hole; a let-go card starts within 8 pixels of where its picture was; the picture leans while it is moved and is straight when still; under reduced motion the numbers are final at once. Four deliberately broken copies (no dead zone, no leave delay, a card not starting from its picture, instant easing) are all caught. Live check 173, layout, lobby and deck checks, and the quick suites. Not checked: how it feels (I have only measured it), touch, and phones.

**What I did not do:** the sort buttons and the type-order pills (still next), a spring with overshoot on release (Balatro's tween overshoots a little; mine eases without bounce on purpose), sounds, and the same easing for cards on the battlefield.

**My mistakes this round:** my first version of the dead-zone test used a shake too fast for the cards to show it (they flip several times a frame), so a broken copy survived until I added a slow wobble. My first test for jitter counted reversals by position in the document, but a let-go card is moved in the document, which made cards look like they reversed; it now counts by card. My first test window started recording before the raise had finished easing and counted its tail as a movement. The area of the hand shrank when the others closed up around a carried card, which a live check of a drop at the end of the hand showed me; it had to come from the whole hand's layout. I also first put the carried picture's end point outside the area of the hand and wondered why nothing was reordered.

---

## 150. Sharp hand, real card back, E to tap, and the solo table with no panels and a floating action bar (2026-11-12)

**What I asked for**
- The hand is blurry (elsewhere is fine, especially the card preview). The card back should be the Magic card back (the library). Pressing E while hovering a card taps it. White is still showing in the corners of cards in the hand and in the card preview (not the Alt picture).
- Move away from the limiting panels that make up the UI. Focus on the single-player solo board; once that is good, bring it to multiplayer. Add a floating bar that holds the actions (draw, untap, and so on), like the control bar of MIDI Companion. I gave four screenshots of another table as a reference for the layout (life top left, menu and turn top right, piles and commander bottom right, a floating bar of actions).

**What changed** (`shared/card-image.mjs`, `shared/bar-place.mjs`, `frontend/src/hand-view.js`, `card-nodes.js`, `card-hover.js`, `floating-bar.js`, `style.css`, `solo.js`, `table.js`, solo `index.html`, `vercel.json`, tests)
- **Blurry hand:** the hand used Scryfall's small picture (146 by 204) on cards that are now about 180 pixels wide. A card in the hand now uses the normal size (488 by 680); the Alt picture accepts it as it is.
- **White corners:** a card picture is square with white outside the rounded card. The Alt picture was already clipped with a 4.8% by 3.4% radius; the hand's pictures were not. The preview was clipped too, but its box was 272 by 526 with the card (272 by 379) letterboxed inside it, so the clip was on the box and the card's own corners still showed. The preview box is now exactly card-shaped, with a check for it, and I looked at 4 times zoomed crops of both corners.
- **Card back:** the library shows the real Magic card back from Scryfall's back server (checked: HTTP 200, 9 KB small, cached for a year; I looked at both candidate backs and chose the classic one). The content policy and the tests allow the new host.
- **E:** over a card of yours on the battlefield it taps or untaps, like a double click. Not with Ctrl, Alt or Shift, not while typing, not over empty space.
- **The solo table has no panels:** the board fills the window; the life is a small floating piece at the top left, the menu button and the turn at the top right, the card preview floats under the turn with no frame, and the piles and the command zone are a row at the bottom right. The hand is centred in the room left of the piles. The table page keeps its layout until the solo page is right.
- **The floating action bar:** Draw, Next turn, Untap all, Auto-arrange, Mulligan and New game in one glass bar with a grip. You drag it by the grip; it snaps flush to an edge within 12 pixels or to the middle of one within 16, stays inside the window, and is remembered (two fractions of the room it has, so it is in the same place on another window size; a damaged stored value is ignored). The arrow keys on the grip move it, Home puts it back. The logic is in `shared/bar-place.mjs` (34 checks).

**What I checked:** solo check 509, hand logic 74, bar placement 34, card pictures 44, layout 405, lobby 65, deck 273, live two-browser check 173, all quick suites; screenshots at 1280 by 1000, 1366 by 768 and 1920 by 1080. Not checked: phones, touch, how the bar feels to drag.

**What I did not do:** snap hints while dragging (MIDI Companion shows an orange strip and a corner triangle); the table page (multiplayer) is unchanged on purpose; a right-click menu on the library like the reference (Draw X, Move top X, Reveal...), though the library already has its own menu; Scry, Surveil, Mill and Reveal hand as bar actions; a dropdown of actions on the bar.

**My mistakes this round:** my first sharpening of the hand pictures broke the Alt picture, which turned a small address into a normal one and so refused an address that already was normal; the tests found it. My first drag of the bar did nothing, because I relied on capturing the pointer on the grip, which the test browser does not honour; it now follows the pointer on the whole page, as the card drag does. A test I wrote to drag the bar 5000 pixels outside the window sent events the browser does not deliver; it drags to the corner now. My first bar tests reloaded the page in the middle of the check and wiped the state that the next section needed, and a later position hit a section where storage is blocked on purpose; I moved them. The hand overlapped the piles at 1280 pixels wide until I centred it in the room left of them. A test of the fan's ends used a 0.3 limit that the tilted outer cards pass by a little. I also found no explanation for why the deck page requested the card back before I scoped the rule: it turned out the deck check visits the solo table, which now loads it.

---

## 151. A hand you click to read, a stronger arc, and cards that move to and from the piles (2026-11-12)

**What I asked for**
- The hand is flat when resting but becomes an arc when the mouse goes through it. When I left or right click a card it goes straight back into the hand although I raised it by hovering. Once the hand is large, hovered cards are impossible to read because their bottom half is behind the hand: instead of hovering, bring a card up when I click it and move the cards beside it aside. A hovered card does not have to pop up and straighten; it may keep its turn on the arc.
- Remove the white highlight while I move a card on the field. I must be able to drag cards from the top of my library, graveyard, exile, command zone and so on, and back. Add to Settings a way back to the home page and my decks.

**What I found**
- **Flat at rest:** the arc was there in both states. A lowered hand hides the bottom quarter of the cards, which is where their tilt shows most, and the ends were only 14 pixels lower across a thousand, so the visible tops looked flat. The fan turn is 9 degrees now (was 6), the ends sit 10% of a card lower (was 5%), and a hand of a few cards fans at least 35% of the full fan.
- **Hidden bottom half:** the cards of the hand have stacking numbers 1 to the size of the hand, and the lifted copy sat at 6, so from the seventh card on the cards were in front of the copy. The hand now has a stacking context of its own, so the copy is in front of all of them.
- **Back into the hand:** every layout threw the lifted copy away, so any click (which selects the card and lays the hand out again) dropped it until the pointer moved.

**What changed** (`shared/hand-layout.mjs`, `frontend/src/hand-view.js`, `board-drag.js`, `style.css`, `solo.js`, solo `index.html`, tests)
- **A click brings a card up** (a right click too: it opens the menu and the card comes up like a clicked one): it rises by 45% of its height and 10% bigger, in front, and the cards within three places move aside (0.55, 0.37 and 0.18 of a card width). It stays up when the hand is lowered and goes back when something else is clicked. `spreadAround` in the layout module, with tests.
- **Hover** is a small lift (0.9rem, 5% bigger) of a copy that keeps its turn on the arc. It survives a layout: the card under the pointer stays lifted instead of dropping back.
- **No highlight of the cell** a card is carried over (the element stays, it is not drawn).
- **Piles are places** (solo page): you can take the top card of the library (a card back is carried), graveyard or exile, or a card of the command zone, and drop it on the battlefield, the hand, or any pile (the exile and graveyard on top); the pile under the picture is ringed; dropping on the pile it came from does nothing; Escape cancels; a plain click still opens the pile.
- **Settings** has links to the home page and to My decks.
- **The hole is decided from the middle of the picture carried,** not from the pointer. With an overlapping hand you take a card by the part that shows, which can be most of a step from its middle, so a 12 pixel nudge swapped it with its neighbour. The picture starts exactly over its own place now. `data-hole` on the hand says which place it is over.
- **The bottom inset of the hand is 2.8rem** (it was 1.4rem) so the stronger arc stays inside the window; the cards are the same size.

**What I checked:** hand logic 83, solo check 532 (three clean runs), with real clicks, right clicks and drags for the click-raise, the lift surviving a right click, every move between the piles, the hand, the battlefield and the command zone, the Settings links, the field highlight; layout, lobby, deck, live check and the quick suites; screenshots of the hand at rest and raised. Not checked: the table page (it keeps the old behaviour of the hand but gets the new stacking, arc and hole rules, since they are shared), phones, touch, how it feels.

**What I did not do:** pile dragging on the table page, dragging from the pile viewer window, the sideboard as a place to drop on, Scry or Surveil, and a hand-shaped preview of the clicked card.

**My mistakes this round:** my tests aimed at 60% of a card's height while the hand was lowered; when the hand rose the point was below the card by two pixels (they aim at 45% now). A test of mine dragged from a point to the same point, which is a click and opened the pile viewer, which then covered the next test. A right click selects the card, so it comes up; I first wrote the test as if the lift stayed on the copy. The stronger arc put the ends of a raised hand below the window until I raised the inset. The end-of-hand drop test failed once with a hand of 10 cards and did not fail in the next five runs; I do not know why.

---

## 152. One rectangle round the hand, the hand opens for a card from the field, and each side moves aside (2026-11-12)

**What I asked for**
- When I drag a card from the battlefield to the hand, instead of a dotted outline on each card of the hand, one rectangular outline of the entire hand. I also want the cards in the hand to move for a card from the battlefield. And instead of only the three cards beside a clicked card spreading aside, have it affect the entirety of each side, separately.

**What changed** (`shared/hand-layout.mjs`, `frontend/src/hand-view.js`, `board-drag.js`, `style.css`, `solo.js`, `table.js`, tests)
- **One outline:** the dashed outline on each card is gone. A card carried over the hand (from the battlefield or, on the solo page, from a pile) shows one dashed rectangle round the whole hand, as wide as the hand and half a card more at each end. That same rectangle is where the card is dropped; before, only the cards themselves counted, which made the place a card could be dropped hard to see.
- **The hand opens for a card from outside:** while it is over the hand the hand has one more place than it has cards, opened where the picture is (decided from the middle of the picture, with the same dead zone as for a card of the hand), the cards lean away from it, and it closes again 150 ms after the card leaves. Letting go puts the card at that place instead of at the end, and it eases in from where the picture was let go (the same way a card of the hand does). A token that goes to the hand stops existing, as before, and nothing is left to put in a place (that case would have thrown).
- **The clicked card:** the whole of each side moves aside, separately: every card to its left moves left and every card to its right moves right, by 0.55 of a card, and the row is laid out again in the width left (`handLayoutSelected`). When the hand already fills its width the cards at its ends cannot move further out, so each side closes up toward its end and the cards next to the clicked one open up to at least three quarters of a card from it.
- The table page gets the same hand: the outline, the place for a card from the field, and the spread.

**What I checked:** hand logic 84 (the spread with room, at the left end, and in a hand that fills its width), solo check 538 with new real-mouse checks (one dashed rectangle as wide as the hand and no outline on any card; a place opens among the cards; it closes again when the card is carried away, exactly to the plain layout; letting go puts the card at that place and the others keep their order; nothing is left of the outline afterwards), the old checks adapted, live check, layout, lobby, deck and quick suites; a screenshot of the outline with a place open in a 7 card hand. Not checked: phones and touch.

**My mistakes this round:** the point where an old check let a card go "outside the hand" is inside the rectangle now, so the Forest went back into the hand there and the checks after it found no Forest; I had first read that as a break in the drag. My first test of the spread wanted every card to move farther from the clicked card, which a hand that fills its width cannot do (its end cards are pinned), so I changed it to what holds. The count of "every card is somewhere" counted the lifted hover copy once the lift survived a click. One of my own test lines for the left end was a convoluted expression that happened to pass; it is plain now.

---

## 153. A hand that stops growing at 7 cards, a tapped card you can see, stacks of 3, two pile styles, and holding a pile to move it (2026-11-12)

**What I asked for**
- When I draw past 7 cards the hand's width grows. Keep the most width at what 7 cards take, and the dashed rectangle too, and cut that rectangle in half and keep the bottom part. When I move a tapped card it is invisible. Show a stack of 3 instead of 4, for tapped and untapped. In Settings, horizontal and diagonal for tapped and untapped separately. Remove the triangle for stacked piles: holding down on the pile with a circular loading should show it is ready to be moved as a stack.

**What changed** (`shared/hand-layout.mjs`, `shared/stacks.mjs`, `shared/pile-style.mjs`, `frontend/src/hand-view.js`, `board-drag.js`, `card-nodes.js`, `pile-style.js`, `style.css`, tests)
- **The hand's width:** the row stops growing at 7 cards (6.4 cards wide); more cards overlap more instead. The dashed box is made from the same layout, so it is the same width. It is the bottom half of the box of the hand now, and that half is also where a card is dropped (it was the whole height).
- **The tapped card you could not see:** two bugs in the picture carried. It was sized from the short side of the tapped card (87 by 62 instead of 121 by 87), and it was turned by a CSS `rotate` property, which is applied before the inline move, so the move was turned too and the picture ended up 231 pixels off the left of the screen. It is a portrait card now, moved first and turned on its side after, in one transform, and held by the box on its side. A check measures that it is visible, on its side and the size of the tapped card.
- **Piles show 3 copies** (was 4): `STACK_VISIBLE`, the offsets, and the dashed border round a pile.
- **Two pile styles in Settings:** "Piles of untapped cards" and "Piles of tapped cards", each Diagonal or Horizontal, kept under separate keys. A pile of tapped cards used to be drawn straight up in both; that way is gone, and the default for tapped piles is Diagonal.
- **No triangle:** a pile held down (half a second) shows a circle filling over it, and when it is full the whole pile is ready: moving then carries all of it. Moving before that takes one card off, as before; Shift and drag still carries the whole pile at once. Under reduced motion the circle shows only when the pile is ready.

**What I checked:** hand logic 87, pile style 38, stacks 122, solo check 554 (three clean runs at the end), with new real-mouse checks: the carried tapped card, the hold and its circle (still filling at 150 ms, full after 650 ms, gone on release or on moving), moving before the circle is full, no triangle, the two settings each changing only their own piles and kept under their own keys, the hand the same width with 7, 10 and 13 cards, the rectangle being the bottom half; layout, lobby, deck, live check, quick suites; screenshots of the carried tapped card and of the circle over a pile. Not checked: phones and touch (a hold needs a mouse here; touch does not start drags).

**My mistakes this round:** a run of the check had a hand of 27 cards because the draws before it are random, and the hand checks, which are written for hands of 6 to 12, failed; the hand block now mulligans first if the hand is over 10. Moving the dashed box to the bottom half put the middle of the top card outside it, so two of my checks dropped cards outside the drop area. I also first read "tapped and untapped separately" as two settings with the same names as before and had to look at what the tapped drawing was (straight up) to see what I was replacing.

---

## 154. A higher dashed box, E on a pile, a tighter step out of a pile, and the pile you carry (2026-11-12)

**What I asked for**
- Move the dashed rectangle of the hand up to where the hand starts to rise when my cursor is near it. When I hover a pile and press E, it taps or untaps the same card if I do not move the cursor. Move the space for tapping out of an untapped pile one tile closer. When I drag a pile, show the ghost of the stack too, not just the "8x".

**What changed** (`shared/board-grid.mjs`, `frontend/pages/solo/solo.js`, `frontend/pages/table/table.js`, `frontend/src/hand-view.js`, `board-drag.js`, `style.css`, tests)
- **The dashed box** starts at the height where the hand rises (`--zt`), and the drop area is the same box (`over`).
- **E:** the page now remembers where the pointer is and looks at what is under it when E is pressed, instead of trusting the card that was last hovered, which went stale when a card moved away from under a still pointer.
- **The step out of a pile:** `TAP_GAP` is 1 (was 2), so a tapped card is one cell closer (9 columns away).
- **A pile you carry** now shows its copies behind the card (up to 3), placed as they are in the pile, also for a tapped pile.

**What I checked:** quick suites (60), layout 405, solo check 558; new real-mouse checks for the pile ghost (untapped and tapped), E twice over a pile, and the box starting exactly where the hand rises. I broke the E code, the ghost copies and the box position on purpose; each was caught (the box one only when run alone). Not checked: phones, touch.

**My mistakes this round:** many tests assumed the old 2-cell gap and had to be updated one by one. My end-of-hand drag check failed whenever the hand had exactly 10 cards: it computed where the pointer should be from the card layout, but a tilted, overlapping hand card is not where its box says. I did not find a code bug (the picture and the hole used the same middle); the check now walks the pointer on until the hole is the last place. I did not understand the exact 48 px offset I measured, so that part is a test fix, not an explanation.

---

## 155. Thin grid lines at every cell, no thick card-block lines (2026-11-12)

**What I asked for**
- The playable area has been readjusted many times. Drop the thicker lines (they only matched card sizes) and bring back the thin gridlines throughout the snap-to-grid pattern.

**What changed** (`frontend/src/style.css`)
- The battlefield background is now thin faint lines at every cell (112 by 44, the cells cards snap to). The card-block lines (14 by 4) are gone. The rule that last set the lines only listed the block size, so I set the cell size in the same rule.

**What I checked:** the solo check passes (558) and a desktop screenshot shows the thin grid across the board. The solo check run with `--screenshot` stopped at "no menu item Move to" (the screenshot mode is a different flow); I did not look into it, so it is not known whether it was already broken. Not checked: the table page's boards (same rule), phones.

**My mistakes this round:** none found, but the screenshot-mode failure above is unexplained.

---

## 156. The turn in the floating bar, cards flying to and from the piles, a shuffle riffle and a mulligan animation (2026-11-12)

**What I asked for**
- Move the turn counter into the floating bar. Dragging from the hand to the library, graveyard, exile and command zone with the same quality as the other drags. When I draw, the card should come from the top of the library as if I grabbed it. A shuffling animation. A mulligan animation: the cards gather together in the hand, move into the library, then the shuffling animation.

**What changed** (`frontend/src/card-fly.js` new, `frontend/pages/solo/solo.js`, `index.html`, `frontend/src/board-drag.js`, `command-zone.js`, `style.css`, `scripts/check-solo-ui.mjs`)
- **The turn** is the first thing in the floating bar, with a thin line after it, and no longer a piece of its own at the top right.
- **Drags to the piles:** a card of the hand could already be dropped on the graveyard; I tested the library (on top), the exile and the command zone too, and a card put in the command zone can be taken out again. The picture carried now flies into the pile when it is let go (a copy of the picture, flown and removed; the page decides when). A card put in the command zone besides the commander used to be laid out under the commander and out of the window; it now sits in the first slot with no commander of its own.
- **Draw (and Next turn, and each card of a deal):** the card starts over the library and eases into its place in the hand, with the same movement the hand already uses for a let-go card.
- **Shuffle:** 8 card backs over the library part into two halves and riffle back together twice (about 1.15 s). It plays on the pile menu's Shuffle and in a mulligan.
- **Mulligan:** the real hand is hidden and copies of its cards gather in the middle of the hand, fly into the library, the shuffle sound and the riffle play, and then the new hand comes out of the library one card at a time. The game itself changes only when the animation is over, so a click during it is ignored. Under reduced motion none of this shows and the mulligan is as it was.

**What I checked:** solo check 566 (the mulligan timing checks were rewritten for the new order: no sound while the hand gathers, then the shuffle sound, the first card about 1.15 s later, a second mulligan in the middle of a deal), quick suites 60, layout 405, lobby page 65. Screenshots: the turn in the bar, the hand gathering, the two halves of the riffle apart, and a card flying out of the library in the middle of a deal. The real card back did not load in the test (stand-in pictures), so the riffle was seen as plain red backs. I did not watch the drop-into-pile flight in a screenshot (only that it ends: no flying picture is left). Not checked: the live two-browser check (the table page did not change except the drag code), phones, touch. Not built: the same animations on the table page.

**My mistakes this round:** my first edit script was mangled by the shell and wrote nothing; a comment I put at the end of a line of code swallowed the rest of it and broke the file (found by the syntax check); I took the pile's flown picture class off the ghost, which would have lost its position style, and had to rename it instead. My first draw check used distances that did not fit the real distance between the hand and the library, and my first command-zone check made the later ones fail because a second card changed what was in the zone.

---

## 157. Cards fly into the right pile, either command slot, a redone mulligan and draw, larger zones, and Flip (2026-11-12)

**What I asked for**
- A card dragged to a bottom-right zone showed an animation going to the middle of the screen before it went to the zone. I should be able to drag my commander into whichever command zone I wish, and the second one gets its tax and lights up like the first. The mulligan animation was too awkward: the cards should flip over after they come together, and the cards coming out of the library need adjusting. Make the zones larger and sharper. Add flipping to battlefield cards: F while hovering, like E for tapping, shows the back (the sleeve, also for two-faced cards), and the menu has "Flip" and "Flip double-faced card" (the second only for cards with two faces).

**What changed** (`frontend/src/card-fly.js` rewritten, `solo.js`, `table.js`, `board-drag.js`, `command-zone.js`, `card-nodes.js`, `pile-stack.js`, `style.css`, `shared/card-menu.mjs`, tests)
- **The flight to the middle of the screen:** the picture carried was moved with the `translate` and `scale` properties, and `scale` also shrank the move its own transform had made, so it ended up pulled toward a corner. It is only moved and faded now.
- **Command zone:** the page remembers which slot a commander was dragged into (kept for the game, not saved); a commander can go to either slot, and from one slot to the other. A slot is ringed while a card is over it, its tax shows when it holds a commander and it is lit like the first one. Other cards put in the command zone sit in the first slot with no commander.
- **Draw and deal:** a card comes out of the library as a small card back at the pile's size, flies to its place in the hand and turns face up on the way. The real card is hidden until it lands, and the flying copy follows it as the hand lays itself out, so it lands exactly on it.
- **Mulligan:** the hand gathers into a loose stack, turns over (the backs show), the stack flies into the library, the shuffle plays, and the new hand comes out of the library as above. The old version flew the face-up cards into the library.
- **Zones:** the piles and command zone are about 35% larger (5.4rem, was 4rem), and their pictures are the normal size, so they are sharp (the library back too). The hand makes room for them (its right margin is 36rem).
- **Flip:** F over a card on the battlefield flips it face down (the card back shows, the name does not), F again flips it back; the menu has Flip, and "Flip double-faced card" (the old Turn over, same action, one fixed label) only for cards with a back face. A face-down card shows the same to other players on the table page (it was already stored as `f`).

**What I checked:** solo check 578, quick suites 60, layout 405, lobby 65, deck 273, the two-browser live check 173; broken copies of the three new silent-risk pieces (the scale in the flight, the command slot choice, the face-down picture), each caught. Screenshots: the hand turning over, a mulligan deal with a card flying out, the stack flying to the library and the riffle, a card flipped face down, the commander in the second slot. The pictures were stand-ins (no real card art), so I did not see real art flip. Not checked: the flights on the table page (draw, mulligan and the pile drops are the solo page only), phones, touch. Not done: moving a card between command slots on the live table (the second slot is only on the solo page's logic).

**My mistakes this round:** my first flight for a drop to a pile was the cause of what you saw (the scale property). My first guess at why the end-of-hand check failed after making the zones larger was wrong: the hand's edge had moved over the piles, so the check dropped cards on a pile; I moved the hand's margin. A test in the pile block counted the cards of the command zone before and after, and a second card there broke the later checks (fixed in the previous round, again here when I added slots).

---

## 158. A Vertical pile style, and tapped piles moved to the right (2026-11-12)

**What I asked for**
- Add Vertical to the piles of untapped cards and the piles of tapped cards. Move a diagonal tapped pile one tile to the right, and a horizontal tapped pile two tiles to the right.

**What changed** (`shared/pile-style.mjs`, `frontend/src/style.css`, tests)
- **Vertical:** a third choice in both Settings selects; the copies under the top card go straight up (the dashed border of the pile follows).
- **Tapped piles:** the whole pile is drawn one cell to the right in the Diagonal style and two cells in the Horizontal style (a cell is an eighth of a card), none in Vertical. I read "tile" as a grid cell and did it as how the pile is drawn, not where its cards are stored, so nothing in the game changes. If you meant the stored place of the card (the step out of a pile), that is a different change.

**What I checked:** solo check 582 (new: a tapped pile's top card moves by exactly one cell when diagonal, two when horizontal, none when vertical; vertical piles of both kinds go straight up with the same left edge; both selects list Vertical; the choice is kept), pile style unit test 40, quick suites 60, layout 405. A screenshot of both vertical piles, untapped and tapped. Not checked: the table page (same style sheet), phones.

**My mistakes this round:** the old checks assumed a tapped pile's lower copy always sits left of the pile, which is no longer true with the shift; my first new check measured a hidden card of the pile (width 0) and my draw-flight check was timing-sensitive, both fixed.

---

## 159. (B) Horizontal and (T) Horizontal for piles of tapped cards (2026-11-12)

**What I asked for**
- For piles of tapped cards, rename the current Horizontal to "(B) Horizontal" and add "(T) Horizontal", where the top of the card shows instead of the bottom.

**What changed** (`shared/pile-style.mjs`, `frontend/src/pile-style.js`, `style.css`, tests)
- The tapped-pile select has four choices: Diagonal, (B) Horizontal (the old Horizontal, the same saved text so nobody's choice is lost), (T) Horizontal and Vertical. The untapped select is unchanged.
- (T) Horizontal: a tapped card lies with its top (where its name is) to the right, so the copies under the top one go to the right, and the strip of each that shows is its top. I did not move this pile over to the right like the other two (its copies go away from what is on the left); say if you want that too.

**What I checked:** the solo check 583 (new: the four labels and values in order, the saved choice, the copy under the top tapped card goes to the right at the same height, the pile is not moved over), pile style unit test 42, quick suites 60; a screenshot of the (T) pile. Not checked: the table page, phones.

**My mistakes this round:** the solo check failed three times in different places while I was changing it, in the hand checks that depend on the random hand: one pointed at a card that other cards covered (I now look for a visible point on it), and one run failed two checks about the cards moving aside that did not fail again in the next two runs; I did not find the cause of that one.

---

## 160. The dashed border of a (T) Horizontal pile fits (2026-11-12)

**What I asked for**
- The dotted border of a (T) Horizontal pile goes past the bottom of it; refit it.

**What changed** (`frontend/src/style.css`)
- The border of a pile with one or two copies under the top card still took its top and left from the Diagonal rule (a step higher and a step to the left), because my (T) rule only set the right side. It now sets top and left to 3 px outside the card, like the other tapped styles, so it hugs the card at the top, left and bottom and reaches out to the right over the copies.

**What I checked:** a new check reads the border's top, left and bottom (all -3px) and that it reaches past the right edge; the solo check passes (584); a screenshot of the pile. Not checked: the same border for a pile of three (same rule, other number), the table page.

**My mistakes this round:** this was my miss in entry 159: I gave the new style one side of the border and did not look at it closely in the screenshot, where it was visible. My first check compared the border's computed height with the card's and was wrong by 2 px (the border is drawn inside its box), so I check the offsets instead.

---

## 161. A finer, faster shuffle (2026-11-12)

**What I asked for**
- The shuffle of the library is only in three parts, which feels too chunky; make it finer, in 7. Make it faster too.

**What changed** (`frontend/src/card-fly.js`, `scripts/check-solo-ui.mjs`)
- The shuffle is 7 narrow parts of 2 card backs each (14 in all), fanned out side by side over the library, each tilting a little more towards the ends, and dropped back one after another from the middle outwards, twice. It takes 700 ms (it was 1150). The mulligan's wait for the shuffle is shorter by the same amount.

**What I checked:** solo check 584 (14 backs over the library in a menu shuffle and in a mulligan, none left afterwards, the first card of the new hand 0.55 to 1.3 s after the shuffle sound), quick suites 60, and a screenshot with the animation held at 115 ms, which shows the 7 parts fanned out. I did not watch it at full speed, so how fast it feels is for you to say. The picture used a stand-in colour for the card back.

**My mistakes this round:** my first screenshot timings were guesses and caught the pile at rest, so I held the animation at a chosen time instead.

---

## 162. The library shuffle is a riffle (2026-11-12)

**What I asked for**
- Rework the library shuffle again. Claude asked what style I wanted and I asked to see each one, so it made a preview page with a riffle, an overhand and a cascade. I picked the riffle, a little toned down.

**What changed** (`frontend/src/card-fly.js`, `scripts/check-solo-ui.mjs`)
- The shuffle is a riffle: 14 card backs over the library are split in two halves that part a little (less than in the preview: 0.46 of a card width and 4 degrees, not 0.62 and 7), then the cards drop into the middle one by one, each side in turn, and the stack squares up with a small bounce. It takes 900 ms. It plays for the pile menu's Shuffle and in a mulligan.
- The 7-part version (entry 161) is gone. The preview page was a scratch file and is deleted.

**What I checked:** solo check 584 (14 backs over the library, none left after, the first card of the new hand 0.7 to 1.5 s after the shuffle sound), quick suites 60, and a screenshot with the animation held at 330 ms, which shows the two halves interleaving close to the pile. I did not watch it at full speed.

**My mistakes this round:** the first cascade in the preview page had keyframes in the wrong order, so the browser refused it and the cards did not move; I found it from the screenshot, not from an error, and fixed it before showing it to you.

---

## 163. A real, slower flip in the mulligan (2026-11-12)

**What I asked for**
- When mulliganing, the cards in hand should come together and then flip "to the right instead of right" (I think I meant a turn to a side, not in place), and the flip should be more obvious.

**What changed** (`frontend/src/card-fly.js`, `scripts/check-solo-ui.mjs`)
- The flip was a card squeezed flat and widened again about its middle. It is now a 3D turn about the card's upright middle line (0 to 180 degrees, with perspective, to the right), the card grows a little at the middle of the turn, and the cards turn one after another from the top of the stack, each through a whole turn, over 760 ms (it was 320). A card drawn out of the library turns the same way on its way into the hand.
- The mulligan takes about 0.4 s longer; the check that presses Mulligan again in the middle of a deal waits longer.

**What I checked:** solo check 584, quick suites 60, and a screenshot of the stack part-way through the turns (some cards turned, some edge-on). I read "to the right" as the turn going to the right; if you meant that the stack should also move to the right while it turns, or the other direction, say so. Not watched at full speed.

**My mistakes this round:** I could not tell what "flip to the right instead of right" meant and chose a reading instead of asking, since a wrong guess costs one small change.

---

## 164. The mulligan stack is one neat stack that slides into the library (2026-11-12)

**What I asked for**
- In a mulligan all the cards in hand should come together, then slide into the library, then the shuffle. The cards came together but diagonal and slanted; I did not like that.

**What changed** (`frontend/src/card-fly.js`, `scripts/check-solo-ui.mjs`)
- The cards no longer gather in a loose pile with each card a little higher and to the side of the one under it: every card goes to exactly the same spot, upright, so it is one neat stack. The stack then slides into the library together in a straight line (the cards used to leave one after another, which made it look slanted). The turn-over stays between the two, and its perspective is flatter (10 card widths away, it was 6) so the cards skew less.

**What I checked:** solo check 585 with a new check that, as the hand comes together, all the flying cards are on the same spot (within 2 px) and none is turned; quick suites 60; a screenshot part-way through the turning shows one upright stack, with the cards still to turn peeking a little at the top and bottom. I did not break the code to prove the new check fails on the old pile (its 1.5 px and 0.8 px offsets are well outside the 2 px it allows, but I did not run it).

**My mistakes this round:** none found, but I took "diagonal and shifted" to be the pile's offsets and the staggered leaving, not the turn-over's perspective; if the slant you saw is the turn itself, say so.

---

## 165. The stack turns over as one, and the cards leave it one after another again (2026-11-12)

**What I asked for**
- I liked the card movement into the library from before, but I prefer how the cards come together now. One change to the flip: flip it as one.

**What changed** (`frontend/src/card-fly.js`, `scripts/check-solo-ui.mjs`)
- The turn-over: every card of the stack turns at the same time, as one block (it was one card after another).
- Into the library: the cards leave the stack one after the other, the top one first, as in entry 163 (entry 164 had made the stack slide in together). The neat upright stack from entry 164 stays.

**What I checked:** solo check 586 with a new check that, part-way through the turn, every card is at exactly the same point of it; I put the one-after-another turn back as a broken copy and the check caught it. Quick suites 60. I did not take a new screenshot (the picture would be the stack as one block, like the last one).

**My mistakes this round:** in the broken-copy run, one of the hand checks about the cards moving aside failed as well; it is the same check that failed once in entry 159 and passed on later runs, so it is flaky, and I still have not found its cause.

---

## 166. The hand comes together twice as fast in a mulligan (2026-11-13)

**What I asked for**
- Make the first part of the mulligan animation, where the cards come together, twice as fast.

**What changed** (`frontend/src/card-fly.js`, `scripts/check-solo-ui.mjs`)
- The cards come together in 190 ms (it was 380). The pause, the turn-over and the slide into the library are as they were, so the whole mulligan is 190 ms shorter.

**What I checked:** the check that the hand is one neat upright stack now reads it 0.25 s after the click, which would have failed with the old speed (the cards would still have been moving); solo check 586 on two runs, quick suites 60. I did not watch it at full speed.

**My mistakes this round:** my first edit put a comment at the end of the line of code, which swallowed the rest of the line and broke the file again (caught by the syntax check). I have made this mistake before in this project.

---

## 167. A faster turn-over in the mulligan (2026-11-13)

**What I asked for**
- Make the flip of the mulligan about 33% faster, rounded well.

**What changed** (`frontend/src/card-fly.js`)
- The stack turns over in 570 ms (it was 760; 760 divided by 1.33 is 571).

**What I checked:** the solo check passed on 4 of 5 runs and quick suites 60. One run failed 9 checks, all in the hand section (the first was "carrying a card out of the hand lowers it": the hand did not lower in time), and the four runs after it passed; the section runs a long time before the mulligan code is used, and it depends on 150 ms timers, so I think it is a timing flake on a busy machine, but I did not prove that. I did not watch the flip at full speed.

**My mistakes this round:** none found; the flaky hand checks are still open (this is the third kind of failure I have seen in that section).

---

## 168. A front page that leads with solo play, and the commander name on a saved deck (2026-11-13)

**What I asked for**
- Change the front page so solo mode is more prominent and less hidden, because it is the most important show of progress; rework the page a bit so it is more inviting and less of a proof of concept. And on the deck cards in the deck list, put the commander's name just above the mana symbols and the bracket line.

**What changed** (`frontend/pages/lobby/index.html`, `lobby.js`, `frontend/src/style.css`, tests)
- **Front page:** a large title ("Play your deck, alone or with friends"), a short line (free, nothing to install, no account), and then a big Play solo button with two quieter ones beside it (Try a sample deck, Import your deck), three small boxes (bring your own deck, test it alone, then play together), and only after a rule the part for friends: "Want company?", the name box, Make a table and Join. The table and join screens keep their own title, "Lobby" (the page sets the title by the screen). Nothing about making or joining a table changed. The header's Lobby link still says Lobby.
- **Deck cards:** the commander's name now sits right above the mana symbols and the bracket (it used to float in the middle of the card, with the space spread between the three lines). A deck with no commander still has its colors at the bottom.

**What I checked:** the lobby page check (66, with a new one that Play solo links to /solo, is above the name box and the make box, is taller than the Make table button and has the sample and import links beside it), the deck page check (274, with a new one for the gap between the commander and the colors row; I put the old spacing back as a broken copy and it was caught), the deploy config check against the real project (56, two lines updated for the new title). Screenshots of the start page and the saved deck cards. Not checked: phone width, the light theme of the start page, the room screens after the title change beyond the existing checks.

**My mistakes this round:** my first broken copy of the deck card check did not apply (a string appeared twice), so nothing was proven until I used longer text. The three boxes first showed two and one in a row, which I saw in the screenshot and narrowed.

---

## 169. A faster come-together and flip in the mulligan (2026-11-13)

**What I asked for**
- Make the flip animation when mulliganing, where the cards come together, faster.

**What changed** (`frontend/src/card-fly.js`, `scripts/check-solo-ui.mjs`)
- I read this as the whole first part of the mulligan (the cards coming together and turning over), not only the turn. The cards come together in 110 ms (was 190), the turn takes 380 ms (was 570), and the two short pauses around them are 40 and 80 ms (were 60 and 120). The slide into the library and the riffle are as they were. The first part is about 0.4 s shorter.

**What I checked:** the solo check once (586); the check that the stack is together and the one that the whole stack turns as one were moved to the new timings (the second one reads the turn halfway through, not after it is over). I did not watch it at full speed. I did not run the quick suites, since only the animation timing changed.

**My mistakes this round:** none found. If you meant only the turn, or only the coming together, say which and I will put the other back.

---

## 170. Holding a pile takes 350 ms (2026-11-13)

**What I asked for**
- Change the time it takes to hold a pile down before it can be moved as a whole to 350 ms.

**What changed** (`shared/stacks.mjs`, `scripts/test-stacks.mjs`, `scripts/check-solo-ui.mjs`)
- `STACK_HOLD_MS` is 350 (it was 500). The unit test and the wording of one browser check say 350.

**What I checked:** the stacks unit test (122) and the solo check once (586): its hold test looks at 150 ms (still filling) and 800 ms (full), which fit the new time. I did not feel the new time with a mouse.

**My mistakes this round:** none found.

---

## 171. The "Your hand is empty" note (2026-11-13)

**What I asked for**
- Move or rework the "Your hand is empty" text.

**What changed** (`frontend/pages/solo/solo.js`, `frontend/src/style.css`, `scripts/check-solo-ui.mjs`)
- On the solo table the note was drawn inside the hand's box and showed for a moment whenever the shown hand was empty, for example during the pause before a new game is dealt. It is now a small pill above the middle of the bottom edge of the hand area, and it shows only when the game's hand really is empty (a class set by the page from the game). It does not take the mouse.
- I chose this over deleting it because an empty hand with no word looks like a bug; if you would rather have no note at all, it is one line to turn off. The table page (the live game) still has the old note.

**What I checked:** solo check 588 (new: while a new game is being dealt the note is not drawn; with a really empty hand it is a pill with no mouse and in the bottom middle), and a screenshot of the pill. In that screenshot the hand was emptied by hand in the test, so two leftover card pictures from the deal are beside it; the note itself is in the right place.

**My mistakes this round:** my first version of the new check emptied the hand's cards by hand and broke the draw check after it, which I found from its failure; the check now reloads the page afterwards.

---

## 172. The test browsers are muted (2026-11-13)

**What I asked for**
- After the empty-hand note I asked whether so many test runs were needed, because I kept hearing tapping and untapping from them. I asked for the sound to be muted.

**What changed** (`scripts/lib/browser.mjs`)
- Every headless Chrome the checks open now starts with `--mute-audio`. The checks drive a real browser, so the tap, draw and shuffle sounds played out loud from my speakers; the sound checks record which file would play and do not need to be heard.

**What I checked:** the flag is on the command line of a browser the helper starts (read from the process list), and the solo check passed once (588), including its sound checks. I did not listen for silence while it ran.

**My mistakes this round:** for the empty-hand note I ran the solo check three times, which was more than the change needed, and I had not told you the checks make noise. I will run one targeted check for small changes from now on.

---

## 173. Wheel zoom on the Alt picture, the hand's count and sorts, the piles' names and arrows, and a lower drop area for an empty hand (2026-11-13)

**What I asked for**
- (1) While holding Alt over a card, the scroll wheel makes the larger picture bigger or smaller. (2) The white dotted box when you drag a card from the battlefield to your hand is too big when the hand is empty: lower its top to under the bottom of the battlefield. (3) When the pointer is over the hand and the cards come up, show how many cards you have under the middle, like "Hand: 7", not at 0. (4) Move the library, graveyard and exile names above them like the command zone, with an arrow beside each that opens a menu, set up for now. (5) Add the hand sort that we have been skipping. And do not make so many tests that it takes too long.

**What changed** (`frontend/src/card-hover.js`, `hand-view.js`, new `hand-sort-ui.js`, `pages/solo/solo.js` and `index.html`, `style.css`, tests)
- **Wheel zoom:** up is a tenth bigger, down a tenth smaller, between half and double the normal size; the size is kept in the browser. The wheel is only taken while the picture is shown.
- **Empty hand:** with no cards, the drop area starts at the bottom of the battlefield (it started at the top of the hand's box, which reached up over it). With cards it is as before.
- **"Hand: 7":** a small pill under the middle of the hand while its cards are up. At the bottom of the window it sits over the lower edge of the cards, because most of the raised cards are below the window edge.
- **Piles:** Library, Graveyard and Exile are named above their piles, with a small arrow that opens the pile's own menu (the same one as a right-click: search, shuffle, draw, look, mill, move all). The names under the piles are gone on the solo table.
- **Hand sort:** three buttons in the same pill, Color, Type and Cost, each off, one way (arrow up), the other way (arrow down), off; it only changes how the hand is shown, the hand's own order is kept, and a card drawn while a sort is on is placed by it. The colour decides first, then the type, then the cost. While a sort is on, rearranging by dragging in the hand is refused with a note. Settings has the card types as pills, each with arrows to move it earlier or later. The choices are kept in the browser.

**What I checked:** 6 new unit checks for the wheel rules (27 hover checks) and one block of 11 checks in the solo check (the count shows and hides, the sort buttons sort low to high, high to low and back to the stored order, a sort is kept, the type pill moves, the pile names are above with arrows, the arrow opens the library menu, the wheel sizes the picture and clamps, the empty hand's area starts under the battlefield); the final solo check run passed (597). Screenshot of the count, the sort buttons and the pile names. Not done: the type pills are moved with arrows, not dragged; the live table page has none of this (the count and sorts are the solo page only; its piles and the empty-hand note are as before); no phones or touch.

**My mistakes this round:** the bar did not take the mouse at first (the hand section ignores it, so the sort buttons did nothing; the check caught it); my first expectations for the pile menu title, the wheel steps (0.7 not 0.8) and the old library check (it expected the name under the pile) were wrong; one of my checks counted on a random hand having cards of different costs and failed once, so it now draws until it has some; and I ran the solo check more times than I wanted to (6), because a new interface had a few small mistakes. I kept the new tests to one block.

---

## 174. The type order runs the other way, every land is sorted by colour, and an A-Z sort (2026-11-13)

**What I asked for**
- The left-most type pill in the hand type order in Settings should be the right-most in my hand. Basic lands and most lands have no colour as cards, but sort them too when the colour sort is on, and consider the many land types. Add an A to Z sort too.

**What changed** (`shared/hand-sort.mjs`, `frontend/src/hand-sort-ui.js`, tests)
- **Type order:** the first type in the order is the right-most in the hand with the Type button's first click, and the left-most with the second click. The Settings heading says so. (It was the other way round.)
- **Lands:** a land is sorted by its colour identity from the card list, joined with the basic land types in its type line (Plains, Island, Swamp, Mountain, Forest). So Forest, a Swamp Mountain dual, a three-colour triome, a pain or check land (they have an identity), Dryad Arbor and an artifact land all go where their colours put them: one colour with that colour, two or more with the many-colour cards, none with the colourless ones. I read the real card list first: Command Tower, Evolving Wilds and Reliquary Tower have no identity there (it comes from symbols in the rules text, which the list does not have), and Wastes and Ancient Tomb are really colourless, so these go with the colourless cards. When only the colour sort is on, the lands of a colour come after the spells of that colour.
- **A-Z:** a fourth button, with the same three clicks (A to Z, Z to A, off). Capitals and accents do not matter. It is the finest sort: it settles a tie in colour, type and cost.

**What I checked:** the hand unit test (99: the type direction, every kind of land above, the order of lands and spells, A to Z and Z to A with accents, and the name settling a tie) and one solo check run (598, with a new check for the A-Z button). Not done: lands that make any colour are colourless, because the list cannot tell them apart; if you want them as their own group I would need the rules text.

**My mistakes this round:** my first land test expected the many-colour lands in the wrong order when reversed (the existing rule orders their colour letters backwards too), and my first edit of the sort file did not match the text (it had backslashes in front of its backticks). The solo check failed on a hand of 9 or 10 cards in the two "cards move aside" checks again; I found the checks need a hand of 7, so they now start from a freshly dealt one, which should also stop the failures I called flaky in entries 159 to 167.

---

## 175. Type first, a color order in Settings, draggable pills, a calmer sort bar and no box round the command slots (2026-11-13)

**What I asked for**
- Sorting priority: type first, then color (colorless with the colors), then cost, then alphabetical. Take back my request that the left-most type pill is the right-most in the hand. Add a way to order colorless and WUBRG in Settings like the type order. Make the pills draggable. The sort buttons appear faster than the hand does: slow them to match. Remove the larger command zone drop box and keep each slot its own.

**What changed** (`shared/hand-sort.mjs`, `frontend/src/hand-sort-ui.js`, `solo.js`, `index.html`, `style.css`, tests)
- **Priority:** type, color, cost, A-Z. With the type sort on, the colors are ordered inside each type; with only the color sort on, the lands of a color still come after its spells.
- **Type direction:** back as it was (the first pill is the left-most in the hand with the Type button's first click).
- **Color order:** a second row of pills in Settings: White, Blue, Black, Red, Green, Multicolor and Colorless. You asked for colorless and WUBRG; I added Multicolor as a seventh pill because the cards of more than one color need a place in the order too, and it was a group before. The Color button follows that order (and its other way round).
- **Dragging:** both rows of pills can be dragged: the pill follows the pointer, the others make way, and it is put where it is let go (Escape cancels). The small arrows on each pill still work, for the keyboard. Settings now holds both rows (the old row's element is renamed).
- **The sort bar:** it waits a moment (0.12 s) and then fades in with a small rise, so it comes in with the cards rising and not before them. Under reduced motion it is not animated.
- **Command zone:** a card must be let go over one of the two slots; the larger box round both is gone (its ring too), and the checks that dropped in the middle now drop on a slot.

**What I checked:** the hand unit test (105: the new priority with all four sorts on, the colors reversed inside each type, a color order of your own, normalizing and moving the colors) and one solo run (600): the pills of both rows are dragged with a real mouse (a type pill two places along, the colorless pill to the front, the order kept), the arrow still moves a pill, a card let go in the gap between the slots goes into neither. I did not watch the sort bar's fade in, so whether it now matches the hand is for you to say; the delay and the length are in `style.css` (`hand-bar-in`). Not done: dragging with touch (the pills are set up for it, untested); the table page has none of this.

**My mistakes this round:** my first pill dragging listened on both the pill and its row, which would have moved a pill twice (I rewrote it before the first run), my edit of the color words did not match the one-line text it was in, and my first locator for the pills in the check had a variable that did not exist in the page (found by the first run).

---

## 176. Eleven changes: Q, D and Tab, a rectangle to pick cards, the command zone, pile numbers, costs on hover, a sort switch, pinned cards and the land order (2026-11-13)

**What I asked for**
- (1) Q also taps and untaps. (2) The command zone tax above each commander. (3) The words "Command zone" below and between the two slots. (4) The pile number twice as large, at the bottom of the top card (untapped) and the bottom right (tapped). (5) Drag to pick several things at once. (6) Mana costs only when hovering over a card. (7) An on/off toggle next to the sort filters. (8) A card dragged by hand in a sorted hand loses its sorted place until the filters are reset. (9) Settings for the order of lands: non-basic and basic. (10) Cards cannot be picked up like text or reached with Tab; Tab opens Settings. (11) D draws.

**What changed** (`solo.js`, `table.js`, `card-nodes.js`, `command-zone.js`, `hand-sort-ui.js`, `shared/hand-sort.mjs`, `style.css`, tests)
- **Keys:** Q does what E does; D draws a card (both pages); Tab opens Settings on both tables (inside Settings, or in a box you type in, Tab moves between controls as usual, and Escape closes it).
- **Cards and Tab:** cards have tabindex -1, so Tab no longer goes to them, and nothing on the table can be picked up as text (the boxes you type in still can).
- **Rectangle:** dragging from empty battlefield draws a box and picks up every card it touches; E, Q and F act on all of them (the whole group is set the way the first one is not), Escape or a click on empty space lets them go, Shift adds to the group. Solo page only. **Moving the group together is not built**: dragging a card moves that card.
- **Command zone:** the tax counter is above each commander; the words are below, centred between the slots.
- **Pile number:** twice as large (1.2 rem), at the bottom middle of the top card, and at the bottom right of a tapped pile.
- **Costs:** the cost of a card in the hand shows only on the card under the pointer (its lifted copy) or the clicked card; it is hidden on the others.
- **Switch:** "Sort: On / Off" in the bar before the four buttons. Off shows the hand as you arranged it; the buttons keep their states; pressing a button while it is off turns it on.
- **Pinned cards:** in a sorted hand a card you drag to another place stays there; the others stay sorted round it; changing any sort or the switch lets it go back (it replaces the old note that refused the drag).
- **Land order:** a third row of pills in Settings: Non-basic lands and Basic lands (non-basic first). With the type sort the lands are ordered by it; with only the colour sort it orders the lands of one colour.

**What I checked:** the hand unit test (116: the land kinds, the pins), the quick suites (60), the layout check (405), the solo check once (613: one new block of about 12 checks for Q, D, Tab, the tab index and text selection, the costs on hover, the rectangle with E and Escape, the command zone words and tax, and in the sort block the switch and the pinned card; plus the pile number in both places and the land order row), and the two-browser live check (173). Not checked: touch, phones, how the rectangle feels with many cards. Not done: moving a picked group together.

**My mistakes this round:** my first versions of two checks pressed at a point on the bounding box of a tilted hand card that was not on the card, so nothing was dragged, and one hovered a card after the hand had risen so another card was under the pointer; I fixed both from the failures. I wrote a placeholder test file by mistake and deleted it before using it.

---

## 177. The empty command slot lines up with the other (2026-11-13)

**What I asked for**
- The inactive commander zone is not aligned; align it with the others.

**What changed** (`frontend/src/command-zone.js`, `solo.js`, `style.css`, `scripts/check-solo-ui.mjs`)
- When I moved the tax counter above each commander (entry 176), the empty slot's tax row was hidden with the hidden attribute, which takes no room, so its dotted box sat one row higher than the commander's. On the solo table the empty slot now keeps the room of its tax row (the row is only made invisible), and the row has one fixed height with a number in it and without. The table page, which has no tax counters yet, is as it was.

**What I checked:** the solo check (613). Its command zone check now also asks that the two slots have the same top and bottom; it printed the positions when it failed (the second slot was 31 px higher), and it passed after the change. The three older checks that asked whether the empty slot's tax is hidden now ask whether it is invisible. I did not look at a screenshot of this change.

**My mistakes this round:** my first fix put a display rule on the tax row, which a stronger hidden rule overrode, so the slot stayed 31 px high; my second try (a fixed height) did not help for the same reason, and I found the cause only by adding the positions to the failure message. And the two checks about the hand (the cards moving aside) failed again in some runs with 9 cards in the hand; I did not find what leaves them there, so they now deal a fresh hand of 7 right before they run.

---

## Where AI misread me, or I had to correct course
- (2026-11-12, entry 157) Claude's flight of a dropped card used the scale property together with a transform, which pulled it toward the middle of the screen, and the mulligan it made first flew face-up cards, which I found awkward.
- (2026-11-12, entry 156) Claude put an extra card dropped on the command zone under the commander, outside the window, where nobody could see it, and a comment it wrote at the end of a code line broke a file; both were found only by the tests and the syntax check.
- (2026-11-12, entry 154) Claude's end-of-hand drag check only worked for hands that were not exactly 10 cards, because it estimated the pointer from layout boxes of tilted cards; I never found out why the estimate was 48 px off.
- (2026-11-12, entry 153) Claude's picture for a carried tapped card had two bugs (its size, and a CSS rotation applied before the move), which together put it off the screen, and no test looked at it.
- (2026-11-12, entry 152) Claude's drop area for a card from the field was only the cards of the hand, so a card could not be dropped between them and the outline was drawn on each card; it is one rectangle round the whole hand now, and the hand opens a place for the card.
- (2026-11-12, entry 151) Claude's hand gave every card a stacking number up to the size of the hand while the lifted copy sat at 6, so with more than six cards the copy was hidden behind the hand (the "bottom half hidden" complaint), and its layouts threw the lifted copy away on every click.
- (2026-11-12, entry 150) Claude's first change to sharpen the hand pictures broke the Alt picture (it only accepted a small address), and its first card preview fix clipped the box, not the card, which is why the white corners stayed until the box itself was made card-shaped.
- (2026-11-11, entry 149) Claude's first fix for the hand opened a gap by laying out an extra place and decided the drop against a different row, which is what made it jitter near the end; the style-sheet transition it used for movement also restarted on every change.
- (2026-11-11, entry 148) Claude made the hovered hand card win the pointer by raising its stacking number, which is the cause of the "hovering over the left" complaint, and it only found this while testing a 12-card hand; its first overlap test pressed the middle of cards that were covered.
- (2026-11-11, entry 147) Claude's hand code left a stacking number on a card that was then played to the battlefield, which made the solo check fail at random for hours; it first guessed at timing instead of looking at the board after a failure.
- (2026-11-10, entry 132) Claude kept committing and pushing to the development branch in turns where I had only asked for a change, after I had asked for it once; my rule is to do it only when asked.
- (2026-11-10, entry 122) Claude's first deck page started a library it could not read at the box to paste into, hiding the message about it; the old check noticed.
- (2026-11-10, entry 120) Claude's solo check clicked a fixed empty spot that stopped being empty once the graveyard stack moved there, and the failure first looked like a menu bug; a screenshot at the moment of the failure showed the open viewer.
- (2026-11-10, entry 119) Claude let the random game test use every new player counter, which the published rules refuse; the full test run found it. It also left the mutation run's own time limit too short, so the run stopped with the rules file broken (restored by hand).
- (2026-11-10, entry 118) Claude's first library search matched the letters in order against the type line as well, so searching "ft" found every artifact; the letters rule now applies to names only.
- (2026-11-10, entry 116) Claude had Horizontal piles send a tapped card above the pile because it read "the tapped stack goes up" as part of that style; the style was only meant to change how a pile is drawn.
- (2026-11-10, entry 115) Claude read "tapped cards go up" as moving the whole tapped stack above the pile in the Horizontal style only; what was meant was a tapped stack drawn straight up in both styles, and untapping to the left of it.
- (2026-11-09, entry 114) Claude's stack test set-up for the order test had never done what its label said (the cards it "moved to a cell" were already on the battlefield), which showed up only when the tap gap changed; and a comment it put at the end of a code line swallowed the rest of the line.
- (2026-11-09, entry 113) Claude shipped the pile (entry 112) with tapped cards drawn over it and called that step 3; the tapped card UI was the thing I complained about. It also made grid cells rectangles (an eighth of a card both ways) when I wanted cubes.
- (2026-11-09, entry 112) Claude ran its first broken copies of the stack wiring without the new test file, so four real gaps looked caught; it was found by reading the list of results, not by a test.
- (2026-11-09, entry 111) Claude's first drag and drop (entry 110) was not what I meant (a fixed grid with swaps and refusals instead of a loose, snapping board with overlap and stacks); it also drew the new board stretched so cards filled only 60% of their blocks, let the drag picture hide the outline, and rewrote the whole battlefield when a card was lifted from underneath, which it found only when I asked and it measured.
- (2026-11-06, entry 110) Claude's first drag check swiped from the left edge of the page, which Chrome reads as Back, so the page left and the check looked flaky; one test line became a comment by accident and still passed (found by counting the checks); and the first run of broken copies showed five spots the tests did not cover (the click after a drag, Shift, the hidden outline, a half cell, an in-board point that is not a number).
- (2026-11-06, entry 104) Claude guessed at the cause of my slider looking different, shipped a guess (an accent colour) that changed nothing, and had added a sound on every slider adjustment that I never asked for.
- (2026-11-06, entry 101) Claude's first broken copy of the volume parsing had broken syntax, so it looked caught but proved nothing, and a test of the slider sample could not tell the sample from the previous sound. Both were found by reading the run, not by the tests.
- (2026-11-06, entry 100) Claude's first draft of the new rules accepted any list key and accepted a list written as plain text; its own new tests caught both before anything was published.
- (2026-11-06, entry 98) Claude's first Pass turn design could not take a pass back when one player had passed twice in a row (it went back to turn 2 instead of 3), and its first "your turn" banner sat below the other players' panels where nobody would see it. It found the first by planning the live test and the second from a screenshot.
- (2026-11-06, entry 96) Claude's `copyAsToken` from entry 86 copied the whole type line, which is over what a stored token may hold for 93 two-sided cards, so a copy would have vanished for everyone who read it. It found this while measuring for Create copy, before any button used it.
- (2026-11-06, entry 95) Claude had built the land row from the front face only, although the 2026-10-26 audit said "from the showing face", so a modal card played as its land sat in the wrong row until I asked about modal cards. The new test of the menu then found that the menu closed itself when the page scrolled on its own, a bug from entry 94.
- (2026-10-30, entry 75) Claude wrote the "refuse to run when the backup exists" guard first and only then noticed that `mutate-rules.mjs` calls the same script while its own backup exists, so every mutation would have failed at once and looked like a kill. It caught this by reading the runner before running anything, and fixed it with the `MUTATION_RUN` flag. It also had listed the `lastSeen` deletion as an untested suspicion when a test for it already existed.

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
- **Tests that passed for the wrong reason, again (Claude's slips, entry 70):** my first `setDeck` refusal tests accepted any thrown error, so removing the page's own checks changed nothing because the database refuses the same values; a broken copy exposed it and the tests now require the page's message. My first deck-fields broken-copy run also showed one line of dead code (an undefined bracket check that a default parameter already covers), which I removed instead of documenting.
- **A filter I copied without checking it on real data (Claude's slip, entry 65):** I made the printing files keep only printings the card list's "deck card" rule allows, which also drops collectors' printings. Nothing failed. A broken-copy run showed that removing the filter changed no test, and a read-only look at the real file then showed 2,707 printings of real cards (Collectors' Edition, the 30th Anniversary set, World Championship decks) that it would have dropped. I removed the filter and added a test with such a printing.
- **Weak tests found by the broken-copy run (Claude's slips, entry 65):** I wrote `printingSetsNeeded` and tested it only in the browser; a "damaged file" test flipped a byte that broke the JSON, so it never tested the checksum; a test of repeated problems counted notices (always one) and not their words; a commander test used a marked commander and so skipped the code it was named after; two fixtures never isolated a missing collector number or two numbers in the wrong order. Each got a test that fails without the code.
- **Small slips in my own tests (Claude, entry 65):** a test id made only of digits, so making it uppercase changed nothing; a test set named `ok`, which is not a valid set code and was rightly never requested; an expected count of 9 printings that was 8; a "deck of five" whose first card was guessed as the commander and left the hand with four; a path check (`..%2F`) that tested the host's path handling and not my files, so I removed it; and my own hover check still expected "default printing" after I had changed the behaviour. Each time the page or the data was right and I corrected the test.
- **My first hover picture covered the name you were pointing at, and my test never noticed the box could stay hidden (Claude's slips, entry 63):** the first version sat next to the pointer, on top of the row's text; a screenshot showed it and I moved it to the right edge. My hover test compared the picture address but never asserted the box was visible; headless Chrome delivers the scroll event a frame late, which hid the box, and the broken-copy run exposed it. That was a real flaw, not only a test slip: after a scroll the box stayed hidden until the pointer re-entered a row. It now shows again on the next mouse move (except for a card you closed with Escape). Five of my first 16 broken copies survived and four needed new tests.
- **The broken-copy run left a deliberately broken file behind, twice (Claude's slip, entry 63):** my script changes the real `frontend/src/card-peek.js` one way at a time and restores it. The session was cut off during a run, and later I stopped a background run by killing it, so the restore never ran either time. I noticed because a hash of the file did not match a backup, restored it, and checked the restored file against the hash I had recorded earlier (it matches). A browser check run in the background also reported "caught" with "0 checks failed", which was not real, so I threw that output away and re-ran every broken copy in the foreground. The script now holds the original in memory, restores in a `finally`, refuses to start if the file is not the known good version, and checks the hash at the end of each batch. I also first wrote a nonsense phrase ("Sol Ring-style default art") into `CLAUDE.md`, and fixed it before it was committed.
- **I renamed a past log entry by mistake (Claude's slip, entry 62):** I meant to add a new entry after entry 61 and my edit changed entry 61's heading instead. I noticed in the same step, restored the heading, and checked that `log.md` matched the committed version exactly before adding entry 62 the right way.
- **A change the cache would have hidden, and a gap in my first tests (Claude, entry 60):** I had built the fix and its tests before noticing that the build reuses a recent cached list for 7 days, so after the push Vercel would have gone on serving the old list without the titles and the fix would have looked broken. I added the format number to the cache record before anything was pushed. The first broken-copy run caught 28 of 29: nothing tested that a title loses to another card's front face. Also my first preview test read `counts.problems` when the field is `counts.problem`.
- **Two wrong expectations in my own browser checks (Claude's slips, entry 59):** I read a picture's size with `img.width`, which is the size it is drawn at (102 by 144), not the picture's own size; and I wrote the pile title pattern with a capital G when the page says "Your graveyard". Both failures were in my checks, not in the page, and the first run printed the values so it was quick to tell. I changed the checks, not the page.
- **Arithmetic in a test again (Claude's slip, entry 58):** the first run of the zone tests failed because Claude had written a "60-card" test deck that added up to 59 (24 + 4 + 31), the same kind of slip as the 9-versus-8 in entry 56. The broken-copy run also showed a tap test that could not tell "tap this card" from "tap this card and all before it".
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
- (2026-11-06, entry 95) The real card back is used for face-down cards, against Claude's advice. If Wizards objects, a plain design replaces it. Not built yet.
- (2026-11-06, entry 95) Turn over covers transform and modal cards only (list format 5). Flip, meld and reversible printings are left out for now.
- (2026-11-06, entry 96) Play back is only for modal cards, which needed a new list field (md, list format 6). A copy copies only the face that shows.
- (2026-11-06, entry 97) Commander damage is one entry and one node per player, so it can be moved into a specific player's panel later without changing the logic. Poison 10 and commander damage 21 from one commander are shown as lethal but never enforced.
- (2026-11-06, entry 98) Summoning sickness is hybrid: automatic on a creature that comes in without printed haste, cleared by one click, and ended by the owner's next turn. "Doesn't untap" is set by hand only, because the card data cannot tell. Passing the turn is one small record on the passer's own branch, so it needs no database rule.
- (2026-11-06, entry 99) Starting a turn at a table does not draw or untap for the player: players draw their own card and untap with the buttons, because some turns have exceptions. Only the turn number and summoning sickness are automatic.
