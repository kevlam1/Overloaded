# Deck import formats (open question 15)

Goal: know the exact text each deck site exports before writing the decklist parser (phase 1). Started 2026-10-26.

## What the sites document publicly (read 2026-10-26, not a substitute for real exports)
- **ManaBox** (official guide, `manabox.app/guides/decks/import-export/`): lines like `4 Tarmogoyf` and `3 Verdant Catacombs (MH2) 260`; "the set and number are optional"; some sites use different set codes. **Export** makes a file meant for re-importing; **Share → Custom text file** can group cards and can drop printing details. Foil markers and sections are not described.
- **Archidekt** (FAQ and third-party guides): the text export includes category headers and edition info; a "basic" option gives only main deck and sideboard; there is an Arena-style option. The FAQ points to "Formatting Examples" inside the import menu instead of giving the syntax.
- **Moxfield** (third-party only): the clipboard export is reportedly MTGO style (`1 Lightning Bolt`); its CSV has `Count, Name, Edition, Condition, Language, Foil, Collector Number` columns. Other tools' import guides mention `*F*` as a foil marker. Nothing from Moxfield itself was found.

## The test deck
Import this into Moxfield, Archidekt and ManaBox. Each line tests something the parser must handle (see the audits in `scryfall.md`):

```
Commander
1 Éowyn, Lady of Rohan

Deck
1 Sol Ring
1 Delver of Secrets
1 Fire // Ice
1 Bonecrusher Giant
1 Lim-Dûl's Cohort
1 Jötun Grunt
1 Kongming, "Sleeping Dragon"
10 Forest

Sideboard
1 Lightning Bolt
```

| Line | Tests |
|---|---|
| `Éowyn, Lady of Rohan` in a Commander section | Accent, comma, and how a commander is marked |
| `Sol Ring` | Change it to the Commander Masters printing, number 410, to see how a chosen printing is written |
| `Delver of Secrets` | Double-faced card: front name only, or both faces? |
| `Fire // Ice` | Split card: `//`, `/`, or front name? |
| `Bonecrusher Giant` | Adventure card (two names on one face) |
| `Lim-Dûl's Cohort`, `Jötun Grunt` | Accents kept or stripped? |
| `Kongming, "Sleeping Dragon"` | Quotes in a name: straight or curly? |
| `10 Forest` | Quantity above 1: `10 Forest` or `10x Forest`? |
| `Lightning Bolt` in Sideboard | How the sideboard is marked |

**After importing, before exporting:** set Sol Ring to Commander Masters #410, mark **one card as foil**, and (Archidekt only) put one card in a custom category.

**Export every text option each site offers**, and paste each one as-is, labeled with the site and the option name:
- Moxfield: each "Export" / copy option (for example MTGO, Arena, plain text).
- Archidekt: Export → Text with each format choice.
- ManaBox: **Export**, and **Share → Custom text file** with printings included.

Before pasting, check the text has no username, email or private deck link. Real exports may be saved later as test fixtures in the repo, which is public.

## Real exports (pasted by Kevin, 2026-10-26)
Collected from Kevin's accounts with the test deck above. They contain only card lines, no username or deck link. **Still missing: ManaBox (both Export and Share), and how Archidekt marks a sideboard, a commander and a custom category.**

Moxfield, "Copy for Moxfield":
```
1 Éowyn, Lady of Rohan (LTR) 10
1 Bonecrusher Giant / Stomp (PLST) ELD-115
1 Delver of Secrets / Insectile Aberration (MID) 47
1 Fire / Ice (DMR) 215
10 Forest (RTR) 274
1 Jötun Grunt (CMD) 16
1 Kongming, "Sleeping Dragon" (A25) 20 *F*
1 Lim-Dûl's Cohort (ICE) 145
1 Sol Ring (CMM) 410

SIDEBOARD:
1 Lightning Bolt (SUM) 162
```

Moxfield, "Copy Plain Text":
```
1 Bonecrusher Giant
1 Delver of Secrets
1 Fire/Ice
10 Forest
1 Jötun Grunt
1 Kongming, "Sleeping Dragon"
1 Lim-Dûl's Cohort
1 Sol Ring

SIDEBOARD:
1 Lightning Bolt

1 Éowyn, Lady of Rohan
```

Archidekt, "Export type: text":
```
1x Bonecrusher Giant // Stomp (clb) 781
1x Delver of Secrets // Insectile Aberration (inr) 457
1x Éowyn, Lady of Rohan (ltr) 10
1x Fire // Ice (dmr) 215
10x Forest (mdd) 301
1x Jötun Grunt (plst) CSP-8
1x Kongming, "Sleeping Dragon" (a25) 20
1x Lightning Bolt (msc) 806 *F*
1x Lim-Dûl's Cohort (ice) 145
1x Sol Ring (cmm) 410
```

### What they show (checked against Scryfall's data, 2026-10-26)
| Question | Answer |
|---|---|
| Do the exports carry set and number? | **Yes** in "Copy for Moxfield" and in Archidekt's text. **No** in Moxfield's plain text. So the import page should tell Moxfield users to use "Copy for Moxfield" |
| Are the printings real? | All 16 set and number pairs exist in Scryfall's Default Cards, and match the right card. Sol Ring `cmm 410` is the printing Kevin chose |
| Quantity | `1` on Moxfield, `1x` on Archidekt, both `10`/`10x` |
| Set code case | Uppercase on Moxfield, lowercase on Archidekt. Scryfall's codes are lowercase |
| Collector numbers | Text. `ELD-115` (Moxfield) and `CSP-8` (Archidekt) are Scryfall's own format for The List (`plst`), so they match exactly |
| Two-faced cards | Moxfield "for Moxfield": `Fire / Ice`, `Bonecrusher Giant / Stomp` (` / `). Moxfield plain: front name only, or `Fire/Ice`. Archidekt: ` // ` like Scryfall. All resolve with the planned normalization |
| Foil | `*F*` at the end, on both sites (Moxfield: Kongming; Archidekt: Lightning Bolt). Moxfield plain text drops it |
| Sideboard | Moxfield (both options): a `SIDEBOARD:` line. **Archidekt's text export has no marker at all** (Kevin confirmed the paste is the literal export), so a sideboard cannot be told apart from the main deck in Archidekt text |
| Commander | **No header on any export; it is marked only by position** (Kevin, 2026-10-26): "Copy for Moxfield" puts the commander(s) on **top**, Moxfield plain text puts them at the **bottom after a blank line**, and Archidekt's text gives no sign. A position rule is fragile (a deck with no commander also starts with a normal card), so **the import page should ask the player to confirm or pick the commander**, and let them move cards to and from the sideboard |
| Order | Alphabetical, with accents sorted by letter (`Éowyn` after `Delver`) on Archidekt |

### The parser: `shared/deck-text.mjs` (built 2026-10-26, tests in `scripts/test-deck-text.mjs`)
Text in, entries out; it never looks a card up. `parseDeckText(text)` returns `{ entries, warnings, errors, counts, total }`. An entry is `{ qty, name, set, number, foil, section, line, block }`.
- **Line:** quantity (`1` or `1x`), name, optional `(SET) number`, optional trailing `*F*` for foil. Set codes are lowercased and must be 3 to 6 letters or digits (all 119,203 Scryfall printings are 3 to 6; an earlier draft said 2 to 6). Collector numbers are kept as exact text (never whitespace, but `★ † Φ _ -` occur).
- **Sections** come only from a header line: `Deck`/`Main`/`Mainboard` (main), `Sideboard`, `Commander(s)`, `Companion`, `Maybeboard`, any case, optional colon. **Only `SIDEBOARD:` is confirmed from a real export**; the other names are my guesses at common ones and are reported, not guessed, when something else appears.
- **`Commander` and `Companion` mark only the next card** (changed 2026-10-26), then the parser goes back to the section it was in. Before the change, one typed `Commander` line turned the whole rest of the pasted list into commanders (checked on three realistic pastes). A partner is a second `Commander` line, or is marked on the preview page. A `Commander` line with no card under it gives a `header_without_card` warning.
- **Blank lines:** each blank line starts a new `block`. A blank line straight after a header is ignored. A card after a blank line that follows a labeled section gets `section: 'unlabeled'`. That is exactly where Moxfield plain text puts the commander (Éowyn, line 13 of the pasted sample), and the parser leaves it to the page to ask the player instead of calling it sideboard or main.
- **Warnings** (line number and text): lines that are not a card or header, and a quantity of 0. Nothing is skipped silently.
- **Limits:** 200 cards for main, sideboard, commander and companion together, counted by quantity (maybeboard excluded). Over the limit gives a `too_many_cards` error but still returns the entries so the page can show them. Input over 100,000 characters or 1,000 lines is refused. These are guesses at sensible guards, easy to change.
- **Whitespace:** tabs, extra spaces, non-breaking spaces, a byte order mark and `\r`, `\r\n` or `\n` line ends all work (JavaScript's `\s` covers them).
- **Tests:** all three real exports parse to the same 19 cards (18 main + 1 sideboard in "Copy for Moxfield", 17 + 1 + 1 unlabeled in plain text, 19 main in Archidekt), plus odd names (`B.F.M. (Big Furry Monster)`, `SP//dr, Piloted by Peni`, `12★`), junk lines, and the limits. 34 deliberately broken copies of the parser were run against the tests in two rounds (20 on the first version, 14 on the commander header change) and all were caught.
- **Not done:** matching names to cards (rules are in `scryfall.md`), merging duplicate lines, the page that asks which card is the commander, and any format not seen yet.
- **Unknown:** whether ManaBox or other sites add suffixes (condition, language, category tags) or section names the parser doesn't know. Collect ManaBox's exports first.

## The matcher: `shared/card-match.mjs` (built 2026-10-26)
Turns parser entries into cards. `buildCardIndex(cards)` takes the planned card list (`{ n, t, m, k, i }`), `matchEntry(index, entry)` returns `{ entry, status, method, card, candidates }`, and `matchDeck(index, entries)` does a whole deck and also returns `fallbackNames`.
- **Order:** the whole name first, then the front face. So `Bind` is the card Bind, not `Bind // Liberate`, and `Smelt` likewise (the only two such cases in the data).
- **Statuses:** `matched` (one card; method `full` or `front`), `ambiguous` (two or more cards share the name; the page asks, or a printing decides later), `suggestion` (only a back face has that name: "did you mean ..."; back faces never match by themselves because 29 clash with real cards), `not_found`.
- **Normalizing:** removes accents, turns `Æ`/`æ` into `Ae`/`ae`, curly quotes into straight ones, the modifier colon in `Ratonhnhaké꞉ton` into `:`, any `/` or `//` into ` // `, collapses spaces and lowercases. The same function runs on the list and on what was typed, so a consistent change can't break matching.
- **Fallback:** `fallbackNames` are the `not_found` names, each spelling once, at most 75 (one batch request); `fallbackOverflow` says some were left out. Suggestions and ambiguous names are not sent: they are not "newer than the list".
- **What it does not do:** pick a printing (set and number stay on the entry), merge repeated lines, or decide between ambiguous cards. Those are the next steps. The 14 shared names (mostly joke-set cards) could be settled at build time by preferring the non-joke card, or by the page; not decided.
- **Checked on all real data** (the Oracle Cards file, 34,785 cards after dropping tokens and collectibles; online-only cards left in): every card's own name finds it (34,721 matched, 64 cards ambiguous because their name is shared); every two-faced front name finds its card; normalizing twice changes nothing and no two different names collide; typed spellings made independently of the module (94 names without accents, 2,462 with curly apostrophes, 895 with a single slash) all find their card; all three real exports match 10 of 10. Building the index took 48 ms and matching every name 42 ms on this machine.
- **Tests:** 17 deliberately broken copies of the matcher were run against the unit tests and all were caught (one only after I added a lowercase `æ` test). The data check was broken six ways: five were caught, and the sixth (`Æ` not replaced) cannot show up in real names, since Scryfall spells it `Aether`.

## Finding the commander (Kevin's idea, and what the data says, 2026-10-26)
**Kevin's idea:** assume the first card in a pasted list is the commander, unless the player types `Commander` above a card. Later, a preview page lets the player check every card and the commander, and pick a partner, companion or second commander that wasn't picked up.

**What the real exports say.** The commander is Éowyn in all three. Rules tried on them (cached card data, no network):

| Rule | Copy for Moxfield | Moxfield plain text | Archidekt text |
|---|---|---|---|
| 1. First card (Kevin's) | right | **wrong** (commander is last) | **wrong** (alphabetical, Éowyn is third) |
| 2. Unlabeled block after a blank line, else first card | right | right | **wrong** |
| 3. Unlabeled block, else first *legendary creature*, else first card | right | right | right |

Rule 1 is right for 1 of 3. Rule 3 gets 3 of 3, but **that is weak evidence**: the test deck has only one other legendary creature (Kongming) and he happens to sort after Éowyn. A real Commander deck often has several legendary creatures among the 99, so on an alphabetical Archidekt list the first one is close to arbitrary. Archidekt's text export carries no information about the commander at all.

**Proposal (Kevin decides):**
1. **Order of trust, in the matching step** (it needs card data, so it isn't in the parser): a typed or exported `Commander` header; else the unlabeled block (Moxfield plain text); else the first legendary creature; else the first card. Only the first is certain. The others are guesses and the page says so.
2. **In a Commander game the preview is required, not optional:** the player confirms the commander before they can ready up. The guess saves clicks; it never decides.
3. **The preview** shows the deck grouped by section with counts, the commander(s) on top, unmatched names, and for any card the player can pick "Commander", "Partner or second commander", "Companion" or "Sideboard".
4. **Partner suggestions** can come from Scryfall's `keywords`, checked on 2026-10-26: `Partner` (143 cards), `Partner with` (54), `Choose a background` (32), `Companion` (12), `Doctor's companion` (27). `Friends forever` does not appear as a keyword. A Background is a legendary enchantment, not a creature, so rule 3 won't find it.
5. **Format size check (open):** a Commander deck is the commander plus 99 = 100, so commanders count toward the 100; a companion and a sideboard do not. The parser's 200-card cap counts everything, as a guard only.
6. **The guess only applies to Commander-style games.** A 60-card game has no commander, so no card is guessed. The format comes from the lobby.

**Built 2026-10-29 (version 1, `/deck`):** the matching step and the guess are in `shared/deck-preview.mjs` and the preview page is `frontend/pages/deck/`. Rule 3 is used as the order of trust (marked header, then the cards after a blank line, then the first legendary creature in the main deck, then the first main deck card), and the page labels it as a guess unless the list marked the commander. The page offers a commander and an optional partner and treats a deck of 98 to 102 cards (main deck plus commander, not the sideboard or companion) or a marked commander as a Commander deck by default. Ambiguous names and "did you mean" suggestions get a choice; names not in the list show as not found. Still to do: partner suggestions from the keywords above, a companion pick, moving cards to the sideboard, the Scryfall lookup for names newer than the list, and the format size check at the lobby.

## Importing from a deck link (Kevin's question, 2026-10-26)
Kevin wants users to paste a Moxfield or Archidekt deck link, for **public and unlisted** decks only. Kevin does not want to bypass anything a site doesn't allow.

### Archidekt: tested once on a real public deck (Kevin's link, one request, 2026-10-26)
`GET https://archidekt.com/api/decks/26549969/` with `User-Agent: Overloaded/0.1 (+repo link)`, `Accept: application/json` and `Origin: https://overloaded.vercel.app`:
- **HTTP 200, 202,700 bytes** for a 100-card deck (about 3 KB per entry, mostly prices and other data we don't need). The npm package's notes mention a smaller `small` variant; not tested.
- **CORS: `access-control-allow-origin: http://localhost:3000`, `vary: Origin`** even though we sent our own origin. A browser would refuse to let our page read this, so **a browser on our site can't fetch Archidekt decks; a server function would have to** (not tested in a real browser; this follows from the header).
- Top-level fields include `private` and `unlisted` (both `false` here), `name`, `deckFormat`, `cards`, `categories`, and also `owner` and `editors`, which our code must never keep.
- Each entry in `cards` has `quantity`, `categories` (a list of names), `modifier` (`"Normal"` or `"Foil"`) and a `card` with `uid`, `collectorNumber`, and `edition.editioncode` (`"fdc"`).
- **`card.uid` is Scryfall's id.** All 67 printings in the deck have a `uid` identical to the id Scryfall has for the same set and number (67 of 67). So link import needs **no name matching at all**: exact printing, foil, quantity, in one step.
- **Sideboard and commander are real data here.** The deck's `categories` list defines `Sideboard` (counts toward the deck), `Maybeboard` (does not), and `Commander`, and each card carries its category names. The 100 quantities add up exactly: 99 in normal categories plus 1 in `Commander`.
- Not tested: an unlisted deck, a private deck, a deck with a sideboard, the `small` variant, rate limits, and what a failure looks like.

### The catch: Archidekt's terms (read through a summarizing tool, so verify in a browser)
The terms prohibit using "software or automated agents or scripts … to generate automated searches, requests, or queries to the Site", and creating an "undue burden on servers". They do not mention an API, rate limits or third-party apps. The API is "unofficial" and in "open beta" according to community docs. **A server function that fetches decks for our users is automated requests in the literal sense of that clause.** My own single test request was also a script's request; it was one request on a public deck at Kevin's request, but it falls under the same reading, and no more should be made without permission.

### Moxfield
- **No official API found.** A feedback thread on Moxfield's board asks for one (no official reply seen), a third-party library is described as "unofficial" and "relies on scraping", and a third-party note says Moxfield's terms forbid scraping. Moxfield's terms page returns 403 to automated fetches, so the terms are unread.
- **Tabletop Simulator:** Moxfield import there comes from community mods, not the base game. A mod's changelog says it updated to a "new API version", so it appears to call Moxfield's API (an inference). The mod has broken more than once when Moxfield changed things ("Moxfield API Broken"). I did not find what the request looks like. In a mod, the request is probably sent from each player's own computer, which is different from our server sending every user's request from one address (unverified).
- **The Gemini answer Kevin pasted:** its endpoint line is garbled, the `api2.moxfield.com/.../export` URL is unverified, and its advice for Cloudflare blocks, "supply matching browser headers" or use Puppeteer or Playwright, means disguising a script as a browser to get past a protection the site put there. **Not doing that.** A 403 from Cloudflare is the answer; the fix is permission, not a disguise.
- **Decision so far:** no request to Moxfield's internal API from this project.

### What it means (proposal, Kevin decides)
1. **Paste text is the main path for version one.** It needs nobody's permission, works for private decks, and the exports above carry exact printings. Both sites have a copy button for it.
2. **Link import is deferred**, and only worth doing if a site agrees. The honest way is to **ask**: Archidekt (contact on its site) and Moxfield (the address named by one third-party note was `support@moxfield.com`, not verified). A short message that says what Overloaded is, that each import is one request per pasted link with the owner's visibility setting respected, and asks whether that is acceptable. Kevin decides whether to send it.
3. **If Archidekt agrees,** the plan is a small Vercel function. It accepts only `https://archidekt.com/decks/<digits>/…`, builds the request URL from the digits alone (so it can never be pointed elsewhere), returns only `uid`, quantity, category and foil, caps the size, rate-limits each visitor, caches nothing about the owner, and refuses private decks. Vercel Hobby function limits and cost are not checked yet.
4. **Make paste text excellent instead:** on the import page, show the exact steps per site ("Moxfield: Export, Copy for Moxfield; Archidekt: Export, Text"), parse each format, and let the player confirm the commander and move cards to the sideboard.

**To test, only if a site says yes:** public, unlisted and private deck links on that site.
