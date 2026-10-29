# Scryfall: what was checked (2026-10-25, audited twice on 2026-10-26)

Read from `scryfall.com/docs/api` (the main page, `rate-limits`, `bulk-data`, `cards/collection`, `images`, `http-concerns`) and from real responses saved by `scripts/fetch-scryfall.mjs` into `data/cache/scryfall/` (gitignored). Re-check before launch: these pages can change.

## Rules we must follow (quoted or close to the docs)
- **Required headers:** every request to `api.scryfall.com` needs `User-Agent` and `Accept`. A script names the app (we send `Overloaded/0.1 (+repo link)`). From browser JavaScript, keep the browser's own User-Agent.
- **Rate limits** (hard limits on `api.scryfall.com`):
  - `/cards/search`, `/cards/named`, `/cards/random`, `/cards/collection`: **2 per second** (500 ms apart).
  - `/cards/manifest`: 10 per minute.
  - All other methods: 10 per second.
  - Files on `*.scryfall.io` (images, bulk downloads): **no rate limit**.
- **HTTP 429** means our access is limited for 30 seconds. Ignoring 429s can get the app banned temporarily or permanently. We must slow down.
- **Cache** what we download, for at least 24 hours. "If you need to rapidly look up card names ... or resolve a large number of card images, you must use the bulk data files."
- Gameplay data (names, rules text, costs) changes rarely: weekly or after a set release is enough.
- **Data use:** free, as part of the Wizards of the Coast Fan Content Policy. No paywall, no implying Scryfall endorses us, no using the data for a different game, and no plain repackaging (the site must add value).
- **Images:** do not crop off the copyright or artist name, stretch, blur, recolor, or watermark card images. If we show an `art_crop` (for example as a playmat), show the artist and copyright somewhere on the same screen.
- **CORS:** the API and image servers send CORS headers, so browser JavaScript can call them directly. The request must carry an `Origin` header (browsers add it). If we set a Content Security Policy: `connect-src api.scryfall.com`, `img-src *.scryfall.io`.

## Batch lookup: `POST /cards/collection`
- Up to **75 cards per request**, `Content-Type: application/json`, body `{"identifiers": [...]}`.
- Identifiers can be `{"name"}`, `{"name","set"}`, `{"set","collector_number"}`, `{"id"}` and others. A decklist line usually gives a name and often a set and number.
- Names that are not found come back in `not_found`. Don't match results to requests by position.
- A 100-card Commander deck is 2 requests, at least 0.5 s apart.

## Fields we would use (seen in the sample reply)
- `id`, `oracle_id`, `name`, `layout`, `type_line`, `mana_cost`, `cmc`, `oracle_text`, `colors`, `keywords`, `produced_mana`, `image_uris`, `card_faces`, `artist`.
- `type_line` contains "Land" for lands (`"Basic Land — Forest"`), so the land row needs no rules engine. **Corrected 2026-10-26:** for multi-face cards, `type_line` joins both faces, and 82 cards say "Land" only on the back (`"Instant // Land"`). Use the face that is showing (`card_faces[0].type_line` until flipped).
- `keywords`: Serra Angel `["Flying","Vigilance"]`. It lists abilities for the whole card, including the other face (Delver of Secrets has `["Flying","Transform"]`, but only its back face flies). **Corrected 2026-10-26:** faces have no `keywords` field (0 records do), so "per-face data" doesn't exist. The build can work it out by checking which keywords appear in each face's `oracle_text`, then ship only the result.
- `produced_mana`: Forest `["G"]`, missing on cards that make no mana. Useful later for a "can I afford this" hint.
- **Double-faced cards** (`layout` `transform`, `modal_dfc` and others) have no top-level `image_uris` or `mana_cost`. They are under `card_faces[n]`.

## Commander Game Changers (checked 2026-10-27, for a possible bracket check)
- **Verified:** Scryfall's card documentation (`scryfall.com/docs/api/cards`) lists `game_changer` as "Boolean, Nullable: True if this card is on the Commander Game Changer list". The cached `oracle_cards` file (38,998 cards, downloaded 2026-10-25) has the field on every record, and **53 are `true`** (first samples: Teferi's Protection, Jeska's Will, Survival of the Fittest, Smothering Tithe, Imperial Seal, Thassa's Oracle). It needs no extra request, since it is in the bulk file we already use.
- **Cheapest way to carry it:** a separate list of the flagged names (53 names, roughly 1 to 2 KB, not measured) instead of a field on every card, so the card list barely changes and the weekly-rebuild rule is not affected.
- **Not verified:** whether the list is static (Wizards can change it, and I did not check how often; the flag stays current through the weekly rebuild), and the bracket rules themselves (which bracket allows how many Game Changers). Read Wizards' official bracket page before building a check.
- **What it can and cannot do:** counting Game Changers in a deck is automatic. Other bracket criteria that need judgment (for example mass land denial, extra-turn chains, tutors) cannot be checked automatically, so the page could show "N Game Changers" and the bracket those would allow, not a ruling.

## Images
- Sizes include `small` 146×204, `normal` 488×680, `large` 672×936, `png` 744×1040, `art_crop`.
- The link is `https://cards.scryfall.io/<size>/<front|back>/<id[0]>/<id[1]>/<id>.jpg`. Scryfall adds `?<timestamp>`, but the link works without it (checked: HTTP 200, `image/jpeg`, about 70 KB for `normal`, `Access-Control-Allow-Origin: *`, cached for a year). So **an image link can be rebuilt from the card id, and there's no need to store it**. The trade-off: without the timestamp, a re-scanned image can stay stale in caches.

## Bulk data (measured 2026-10-25 and 2026-10-26)
- `GET /bulk-data` lists the files. Each item has `type`, `jsonl_download_uri`, `compressed_size` and `updated_at`. The files are gzipped JSON Lines, rebuilt every 12 to 24 hours.
- Compressed sizes: Oracle Cards 23.9 MB (one record per card), Unique Artwork 36.8 MB, Default Cards 76.3 MB (every printing in English), All Cards 382.5 MB, Rulings 5.2 MB.
- Measured with `node scripts/fetch-scryfall.mjs bulk oracle_cards` and `bulk default_cards`. Art cards, vanguards, planes and schemes are dropped; tokens and emblems are kept.

| File | Records | Unpacked | Kept for decks | Card list (name, type, cost, keywords, id), gzipped | Printing list (set, number, id), gzipped |
|---|---|---|---|---|---|
| Oracle Cards | 38,998 | 199.5 MB | 36,230 | **1.51 MB** | 0.84 MB |
| Default Cards | 119,203 | 620.1 MB | 115,869 | 4.49 MB | **2.67 MB** |

## Vercel's free limits that apply (read 2026-10-26 from `vercel.com/docs/plans/hobby` and `/docs/limits`)
- Hobby includes the first **100 GB of Fast Data Transfer**, 10 GB of Fast Origin Transfer and 1,000,000 CDN requests. "If you exceed your usage limits on the Hobby plan, you will have to wait until 30 days have passed before you can use the feature again." So going over costs no money, but the site can stop working.
- Hobby is "non-commercial, personal use only". A class project fits.
- A CLI deploy can upload at most 100 MB of source files.

## Deck size, sideboards, and how many requests (Kevin's concerns, 2026-10-26)
**The concern:** main boards can be over 100 cards, and some sideboards hold hundreds. Looking all of that up one deck at a time could break Scryfall's limits and get the site banned. Kevin's idea: cap the first import at 100 cards, and keep the sideboard as its own category that players swap from without new lookups.

**What the batch lookup would cost.** At 75 cards a request and 2 requests a second:

| Deck | Requests | Shortest time |
|---|---|---|
| 60-card main | 1 | 0 s |
| 100-card Commander | 2 | 0.5 s |
| 100 main + 300 sideboard | 6 | 2.5 s |
| 500 cards | 7 | 3 s |

One player importing one deck is well inside the limit. The risk comes from many players at once. The docs don't say whether the limit counts per user or for the whole site (not checked), and they say large lookups "must use the bulk data files". If the limit counts for the whole site, ten players importing at the same moment would go over it.

**Options:**
1. **Batch lookup per deck.** No file to build or host. Costs: Scryfall's limit is shared by every player, there's a wait for big decks, and new decks need a network trip.
2. **Our own card list, built from the bulk file (recommended).** A script turns Oracle Cards into a 1.5 MB gzipped list, and Vercel serves it as a static file that the browser caches. A deck of any size, sideboard included, is matched by name **in the browser with zero Scryfall API calls**. Images still load straight from `cards.scryfall.io`, which has no rate limit, so they cost us nothing.
   - Cost on Vercel: 1.5 MB per player's first visit. With 100 GB a month, that's about 68,000 first visits before the limit, and repeat visits are served from the browser cache. (Recomputed after the audit below: 1.41 MB, about 67,000 visits; the 68,000 here mixed binary and decimal units and was really about 63,000.)
   - New cards: a name that isn't in our list (a set released after the last build) falls back to the batch lookup for just those few names.
   - Freshness: rebuild the list weekly or after a set release, as Scryfall suggests. Building it in Vercel's build step keeps a generated 4 MB file out of git history. Not decided.
   - Scryfall says not to "simply repackage" its data. Our list only serves our game, which adds value, but that's my reading and not confirmed with Scryfall.
3. **Exact printings** (a decklist line like `1 Sol Ring (CMM) 410`) need the printing list: 2.7 MB more for every printing, or split into one small file per set so a deck loads only its sets. Version one can match by name only and show each card's default printing. Exact art comes later.

**Caps and sideboards (proposal):**
- With option 2, a cap isn't needed to protect Scryfall. A cap is still worth having so a pasted 10,000-line text can't freeze a browser or flood a lobby. Proposal: one generous limit on main plus sideboard (for example 250), plus a warning when a main deck is outside the format's size. Numbers are Kevin's call.
- The sideboard is its own section of an imported deck, matched against the same list at import. Swapping cards between main and sideboard in the lobby only changes the deck stored in the browser, with no new lookups.
- In a game, other players get only card ids from the server and look up names and types in their own copy of the same list. Version one uses one printing per card, so both sides always agree.

## Decided 2026-10-26
- **Our own card list (option 2).** It's a static JSON file, not a database: the cards that can be in a deck (33,974 after the audit below, not the 36,230 first counted), with name, type, cost, keywords and id. New cards do not join it on their own. They appear when the list is rebuilt from Scryfall's newest bulk file. Until then, names the list doesn't have go to the batch lookup.
- **Built during Vercel's build step, not committed** (Claude's choice; Kevin said to do what is best). The build downloads the Oracle Cards file from `data.scryfall.io` (no rate limit) and writes the list into the site's output. Reasons: no 1.5 MB file changing in git history on every refresh, and every deploy gets current cards. If Scryfall is down, the build fails and Vercel keeps serving the previous deploy. A weekly rebuild (for example, a scheduled GitHub Action calling a Vercel deploy hook, with the hook URL kept as a secret) is for later. This needs a build command, so it comes with the stack choice.
- **Cap: 200 cards for main plus sideboard together**, checked at import (Kevin's number, 2026-10-26). Bigger pastes are refused with a message saying how many cards were found.
- **The format decides if a game can start, not the import.** For example, Commander needs exactly 100 cards in the main deck, and 60-card formats need at least 60. Proposal: the host picks the format in the lobby, and a player can't ready up with a deck that doesn't fit it. Which formats to offer is open.

## Rules text and exact printings (measured 2026-10-26)
- **Rules text** would double the list: 1.51 MB without it, 3.00 MB with it. The card image already shows the text, so version one leaves it out. If search by text or a text view is wanted later, it can be a second file that loads only when needed.
### Exact printings, rethought (2026-10-26)
**What a printing changes:** only the picture. Name, type, cost and keywords are the same in every printing, so they always come from the card list. The image link needs the printing's **id** (`cards.scryfall.io/normal/front/<id[0]>/<id[1]>/<id>.jpg`). Our list holds one id per card, the default printing's.

**Facts checked in the Default Cards file:**
- Set code plus collector number names exactly one printing: 119,203 pairs, 0 duplicates.
- One card can have many printings (Sol Ring has 144). In Commander Masters (`cmm`) it is number 410 or 703.
- Collector numbers are text, not always numbers: `268p`, `213★`, `XLN-217`, `S3`. Match them exactly. Set codes are lowercase in Scryfall (`cmm`), so lowercase the decklist's code.

**The flow:**
1. **At import, once.** For each line, find the card by name in the card list (game data). If the line gives a set and number, find that printing's id; otherwise use the default id.
2. **Save the id with the deck** in the browser. A saved deck never looks anything up again.
3. **In a game**, the server sends other players the card with its printing id when it becomes visible. They build the image link from the id, with no lookup and no list of printings.
4. **If the printing isn't found** (a typo, or a set newer than our files), show the default printing and mark the line, so the player still gets the right card.

**Where step 1 gets the printing id:**

| Option | Download | Scryfall API calls | Work |
|---|---|---|---|
| A. One small file per set | Only the deck's sets: median 0.5 KB each, largest 140 KB | 0 | The build writes about 1,000 small files |
| B. One file of every printing | 2.67 MB gzipped, once per browser | 0 | Simplest code; heavy on a phone |
| C. Batch lookup by set and number | none | Up to 3 per 200-card import | No build work, but it depends on Scryfall's shared limit again |

**Recommendation: A.** It is the only option that is both small and free of API calls. The lookup runs only at import, and opponents never need it. If per-set files prove awkward, B is the simple fallback.
- Not checked yet: whether Moxfield, Archidekt and ManaBox exports actually include set and number, and in what form (open question 15).

## Audit (2026-10-26): bugs found, fixes, and costs again
Run with `node --max-old-space-size=4096 scripts/audit-card-data.mjs` on the cached bulk files. Every number below comes from that run or from the docs quoted.

**What was wrong or missing in the plan, and the fix:**

| Found | Count | Fix |
|---|---|---|
| Tokens and emblems share names with real cards (`Storm Crow` is both) | 87 names; 1,095 tokens | Tokens go in their own small list (0.04 MB) for making tokens in a game, never matched against a decklist |
| Collectible records that are not game cards (`Surprise!`, type "Card"; decklist and bio cards) | 442 | Drop `set_type` `memorabilia` and layout `front_card` |
| Online-only cards: **every** printing marked `digital: true`, almost all from Scryfall's `alchemy` set type | 811 | **Dropped** (Kevin, 2026-10-26: drop if confirmed not paper and no extra calls; the check uses the same cached file) |
| "No paper printing" is the wrong test: a **preview card of an unreleased set** has an empty `games` list (`Geordi La Forge, Innovator`, Star Trek Commander, releases 2026-11-13) | 1 today, more before each set release | Drop only when every printing is `digital: true`, never because `paper` is missing |
| Cards on paper whose chosen picture is an online-only printing (`Palinchron`) | 1,062 | Keep the card. The build can pick a paper printing's id as the default picture, since it reads every printing anyway |
| The `games` field describes one printing, not the card, so "drop if not on paper" would drop `Palinchron` | - | Decide paper availability from every printing (Default Cards), as the audit does |
| Land row read from the joined `type_line` | 82 cards | Use the showing face's type line |
| "Per-face keywords" don't exist | 0 faces have them | The build works out each face's keywords from its text |
| Decklists may give only the front name of a multi-face card (`Delver of Secrets`) | 975 multi-face names | Match the full name first, then the front name |
| Front names shared by two cards (`Fast`, `Monster`, `Royal`, `Start`) or equal to another card (`Smelt`, `Bind`) | 6 | Full-name match wins; a shared front name asks the player to pick |
| Two deck cards with the same name, mostly joke-set variants (`Everythingamajig` x6) and two playtest cards | 14 names | Prefer the non-joke set; joke variants need set and number, otherwise ask the player |
| Accented names (`Lim-Dûl's Cohort`, `Éowyn, Lady of Rohan`) | 107 | Match after removing accents, turning `Æ` into `Ae`, curly quotes into straight ones, and `/` into ` // ` |
| A typo or junk paste would send its unmatched names to the batch lookup | - | Send at most one batch request (75 names) per import, remember names that weren't found, and never retry a 429 automatically |
| `fetch-scryfall.mjs` saved whatever came back, even an error page, and never checked HTTP status | - | Fixed: it stops on any failed request and checks the download size before saving. Tested with a fake `fetch` (no network): a 429 stops both modes with exit code 1, and a 10-byte download against an expected 999 is refused; the cached files kept their size and time |

**Sizes of the cleaned list** (33,974 deck cards after the corrected online-only rule, current shape `{n,t,m,k,i}`):
- 3.99 MB raw, **1.41 MB gzip**, 1.05 MB Brotli at maximum quality.
- A compact array shape is 1.37 MB gzip. Not worth the extra code.
- Vercel compresses `json` automatically (its compression page lists `json` among the auto-compressed types, Brotli when the browser supports it). Brotli at the CDN's quality may not reach the 1.05 MB measured here, so the cost math uses gzip.

**Costs, recomputed:**

| Item | Cost |
|---|---|
| Scryfall data and images | $0. Images load from `cards.scryfall.io` (no rate limit) straight to the player |
| Scryfall API calls per import | 0 normally; at most 1 for names newer than our list |
| Card list per player's first visit | about 1.41 MB, then from the browser cache |
| Vercel Hobby transfer | 100 GB a month ÷ 1.41 MB ≈ **67,000 first visits** before the limit. Going over pauses the site for up to 30 days; it never bills. (Sizes here are binary MB, 1,048,576 bytes; Vercel's GB is taken as 10⁹ bytes, the conservative reading, not verified. The earlier "68,000 at 1.51 MB" mixed the two and was really about 63,000) |
| Per-set printing files | a few dozen KB per import |
| Build | Hobby builds run on the included Basic machine (2 CPUs, 8 GB memory). The build cache holds 1.5 GB, enough for both bulk files (about 100 MB) |

**The build-download fix is now checked against the docs** (`vercel.com/docs/deployments/troubleshoot-a-build`): "Files under `.vercel/cache` ... persist across builds." The cache is restored before the build command runs, is kept per branch (and per account, project and Node version), and lasts a month. So the build can keep the bulk files in `.vercel/cache/scryfall/` with their `updated_at`, make one `GET /bulk-data` call, and download only when Scryfall has published a newer file: at most once a day per branch, since Scryfall rebuilds daily. Not tested on Vercel yet.

**Checked again, still open (2026-10-26):**
- **Per player or per site?** Scryfall's docs say nothing, and they mention no app registration, tokens or sign-up; a web search found no statement from Scryfall either. Only Scryfall could answer. It no longer matters much: imports make 0 API calls, at most 1 for brand-new cards, and even a site-wide 2 a second allows about 7,200 such lookups an hour. Testing it by sending many requests is ruled out, since that is what gets apps banned.
- **Vercel's GB, decimal or binary?** Not defined in the docs pages read or found by search. The difference is about 7%, and the math above uses the smaller (decimal) reading. The Vercel dashboard's usage page will show real numbers once the site has traffic.
- **The build cache on a real build:** can only be tested with a deploy, which needs the build step and a push. Planned for when the build exists.
- **Request count so far (2026-10-25 and 26):** 2 batch lookups and about 10 `GET /bulk-data` calls to the API, never more than 2 a minute, and no 429. Far inside the limits.

## Second audit (2026-10-26): name matching, caching, and costs again

**Name matching, tested** (`scripts/audit-card-data.mjs` and a throwaway test of typed spellings):
- The normalization (remove accents, `Æ` to `Ae`, curly quotes to straight, `꞉` (U+A789, in `Ratonhnhaké꞉ton`) to `:`, any `/` to ` // `, lowercase) makes **0** different names collide.
- Typed spellings that resolved correctly: `sol ring`, `Lim-Dul's Cohort`, `Æther Vial` and `Aether Vial`, `Jotun Grunt` (stored as `Jötun Grunt`), `Fire/Ice`, `Urza’s Saga` with a curly apostrophe, `Kongming, “Sleeping Dragon”`, `Who/What/When/Where/Why`.
- Two names have a lone `/` (`SP//dr, Piloted by Peni`, `Summon: Choco/Mog`). They still match, because the list and the typed text are normalized the same way.
- **Back-face names must not auto-match.** `Insectile Aberration` (Delver's back) isn't found, and matching back faces automatically would be wrong: 29 back-face names clash. For example, `Ancestral Recall` is a real card and also the back of `Emeritus of Ideation`, and `Peer Review` is the back of three cards.
- **Matching order:** full name, then front-face name, then (if still not found) a "did you mean …?" suggestion from back-face names, then the one fallback batch request.

**Caching, checked on a real Vercel site** (headers of `midi-companion.vercel.app`, which is mine):
- Static files, even hashed bundles, are served with `Cache-Control: public, max-age=0, must-revalidate` and an `ETag`. A repeat request that sends the ETag gets `304 Not Modified` with no body.
- Vercel's CDN docs: static files are cached on its network "for the lifetime of the deployment"; for the browser to keep a file, the site must send `max-age=N` itself.
- So an **unchanged** card list costs a returning player one small request and almost no transfer. A **changed** list makes every returning player download all 1.41 MB again.

**What this changes in the cost math** (100 GB a month, decimal reading, 1.41 MB list):

| How often the list changes | A returning player downloads | Regular players that fit |
|---|---|---|
| Daily | 42.3 MB a month | about 2,250 |
| Weekly | 6.1 MB a month | about 15,500 |
| Monthly | 1.4 MB a month | about 67,600 |

- **Bug in the plan:** the build fetched new card data whenever Scryfall's file changed, and Scryfall rebuilds daily. Every deploy would then ship a new list, and every returning player would re-download it. **Fix:** refresh card data at most once a week (reuse the cached list if it is younger than 7 days), and write the list in a fixed order (sorted by name) so unchanged data gives identical bytes and the same ETag. That ETags match across deploys for identical bytes is not verified; the 32-character ETags look like content hashes.
- A content-hashed file name with `Cache-Control: public, max-age=31536000, immutable` would skip even the 304 request. It's optional and only saves CDN requests (1,000,000 a month included).
- Cards released between weekly refreshes use the one fallback batch request, as planned.

**Card images, cost to the player** (one card, headers from `cards.scryfall.io`): `small` 146×204 is 12 KB, `normal` 488×680 is 71 KB, `large` 105 KB, `art_crop` 38 KB. A 100-card deck at `normal` is about 7 MB on a phone, or about 1.2 MB at `small`. Images cost us nothing but cost players data. **Plan:** load an image only when its card is showing (never the library), use `small` where cards are drawn small, and `normal` when a card is enlarged. Scryfall's image server lets browsers cache images for a year.

**Node version bug:** both scripts use `import.meta.dirname`, which Node's docs say was "Added in: v21.2.0, v20.11.0". `CLAUDE.md` said "Node 18 or later". Corrected to Node 20.11 or later; tested on Node 24 only.

### How often to rebuild (2026-10-26)
- "Rebuild" means a build script does what `fetch-scryfall.mjs bulk` does today (download the bulk file and trim it), but writes the card list and per-set files into the site instead of only printing sizes. It runs inside Vercel's build, so every deploy rebuilds.
- **How often:** Scryfall says gameplay data changes rarely, and weekly or right after a set release is enough. Recommendation: an automatic weekly rebuild, plus a manual redeploy on a set's release day if players want the new cards at once. **Updated in the second audit:** deploying often must not refresh card data more than weekly, because each change makes every returning player re-download the list.
- **Caveat on my build-step choice:** per-set files need the Default Cards file (76 MB) as well as Oracle Cards (24 MB). Rebuilding on every push would download about 100 MB from Scryfall each time, many times a day while developing. That is allowed (no rate limit on `data.scryfall.io`) but not courteous. Fix to check when the build is set up: skip the download when the bulk file's `updated_at` hasn't changed (needs Vercel's build cache to keep files between builds, not verified), or only rebuild card data on production deploys.

## Card list build: what was checked on 2026-10-29

**How often the list changes (measured).** The cached Oracle Cards file from 2026-10-26 against the one downloaded 2026-10-29 (`oracle-cards-20261029210158`): 38,998 records became 39,196. After the same filters, **198 cards added** (a Star Trek set), **0 removed**, **23 changed** name, type, cost or keywords, and **162 changed their default printing id** (`i`). So the list is not byte-identical from one Scryfall file to the next, which is why the weekly reuse rule matters: a rebuild every deploy would change the list's bytes every few days. No layout was new in those three days (`prepare`, 72 cards such as "Adventurous Eater // Have a Bite", was already there and is a deck card).

**Online-only needs the Default Cards file.** The Oracle record's own `digital` flag marks 1,873 cards, but only **811** are online-only by the every-printing rule; the simple rule would wrongly drop **1,062 real paper cards** whose chosen printing is an online-only reprint set (for example Wyluli Wolf, whose Oracle record is the MTGO set `me1`). It missed none. So the build reads both files (about 100 MB, once a week at most). The 811 dropped are Arena-only Alchemy cards (`games: ["arena"]`).

**A card with no printings in the Default file is kept.** The audit's `onlineOnly = !notDigital.has(oracleId)` is true for a card with no printings at all. With files from different days that dropped 198 new cards; `scripts/lib/card-list.mjs` drops a card only if at least one printing was seen and every one is digital.

**Sorted list size.** Sorting by name makes the list compress better: 3.99 MB raw, 1.31 MB gzipped, 1.01 MB brotli (the unsorted measurement in the audit was 1.41 MB gzipped).

**Vercel (read from vercel.com/docs on 2026-10-29; quotes are verbatim).**
- Build cache: "At the beginning of each build, the previous Build's cache is restored prior to the Install Command or Build command executing." "Files under `.vercel/cache`, except pnpm's cache directory." "Files that tools write here persist across builds." "Anything under `.vercel/output` is never cached." "It is not possible to manually configure which files are cached at this time." Kept "one month"; keyed by account, project and Git branch ("If you create a new Git branch ... the last production Deployment cache is used to create a preview deployment"); "failed builds will not modify the existing cache"; Basic build machine cache maximum 1.5 GB. Pages: `/docs/deployments/troubleshoot-a-build`, `/docs/limits`. (`/docs/deployments/build-cache` returned 404.) Not yet seen working for our build.
- Hobby builds: 45 minutes, 8 GB memory, 32 GB disk. Outbound traffic during a build: not stated. Page: `/docs/limits`, `/docs/builds/managing-builds`.
- Node: "By default, a new project uses the latest Node.js LTS version available on Vercel"; available **24.x (default) and 22.x**, not 20; "You can define the major Node.js version in the `engines#node` section of the `package.json`". Our range `^20.19.0 || >=22.12.0` is not in the docs' table. Page: `/docs/functions/runtimes/node-js/node-js-versions`.
- Compression: with `Accept-Encoding`, "only the following list of MIME types will be automatically compressed", and `json` is on it; Brotli takes precedence over gzip. Page: `/docs/how-vercel-cdn-works/compression`. The default browser `Cache-Control` and ETag of an ordinary static file are not stated on the pages read; on my own `midi-companion.vercel.app` I measured `max-age=0, must-revalidate` with an ETag (second audit above).
- `VERCEL_ENV` is `production`, `preview` or `development`, available at build and run time when "Enable access to System Environment Variables" is on; "The first deployment of a new project is always a production deployment." Page: `/docs/environment-variables/system-environment-variables`.

**What the list's cost field means.** `m` is Scryfall's `mana_cost` as given: a transform card has none on the record, so the front face's cost is used; split, adventure and prepare cards carry both costs on the record, joined by ` // `. Anything that reads costs later (the "can I afford this" hint) has to allow for both shapes.

**First real run of the build (2026-10-29).** `npm run cards` with nothing valid cached: 10 seconds including the download of both bulk files (about 100 MB); 119,839 printings and 39,196 card records read; 4,213 records not for decks, 811 online-only dropped, 0 kept without printings (the two files were from the same hour); **34,172 cards**, 4.21 MB (the cache record holds the date, count and SHA-256). The second run, the same minute: 0.4 seconds and no requests. With the files measured the same day, the online-only count stayed 811. The build works with 256 MB of memory because both files are read one record at a time.

**Cost design of the build** (all free; the point is to stay courteous to Scryfall and cheap for players): a list under 7 days old makes zero requests; a rebuild is one API request plus two file downloads; a failed rebuild is retried once (at most 6 requests) and then the last good list is used for up to 30 days; preview builds and the tests never download; the bulk files are deleted after the build, only the 4 MB list and a small record are kept. A simulated month of daily deploys makes 5 rebuilds and 15 requests, not 90. Players: the list is about 1.0 MB with Brotli, fetched only by the import page, revalidated with the ETag on each visit.
