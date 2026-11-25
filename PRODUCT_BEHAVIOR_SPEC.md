# Overloaded: Product Behavior Specification

**Status of this document:** an audit of the application as it exists at commit `243f848` on the `development` branch (the same commit is on `main` and live), written 2026-11-24. It describes what the code does today. It does not propose a redesign. Where the code and the older project notes (`CLAUDE.md`, `docs/*.md`, `README.md`) disagree, this document follows the code and says so.

**How it was made:** six read-only audits of the repository (deck import and card data; the solo table; the shared game logic; multiplayer, lobby and database rules; the UI shell, settings and presentation; the product history in `log.md`, `docs/` and git), followed by spot checks of the most important findings. About 80 unit suites were run during the audit and all passed. **No browser checks and no live checks against the real Firebase project were run for this document**, so nothing here about how a page looks, animates or times out in a real browser is newly verified; it comes from reading the code and the CSS.

**Evidence markers used throughout:**
- **[V]** verified: read in the current code (and, where named, asserted by a passing unit test).
- **[I]** inferred: reasoned from the code, not executed.
- **[D]** documented only: stated in `log.md`, `CLAUDE.md` or `docs/`, not re-checked in code.

**Classification codes (section 15 has the full checklist):**
- **MUST PRESERVE**: core functionality or an established product behavior.
- **PRESERVE INTENT**: short for "preserve intent, implementation flexible": keep the concept and the user experience, change the technique freely.
- **OPEN TO REDESIGN**: mainly visual or positional.
- **NEEDS INVESTIGATION**: incomplete, inconsistent, possibly broken, or not verified enough.

**Coverage limits of this audit (read before relying on it):**
- `log.md` entries 1 to 92 and 252 to 276 were read in full. Entries 93 to 251 were covered through `CLAUDE.md`'s per-feature summaries (which cite entry numbers), the log's closing "misread" and "decisions" sections, and spot checks. Small decisions recorded only inside entries 93 to 251 may be missing from section 19.
- The CSS (2,245 lines) was mapped by its blocks, layers and media rules, not rendered.
- Whether the newest database rules (the commander tax, 2026-11-23) have been published to the Firebase project is not recorded anywhere; it is treated as unknown.

---

## Table of contents

1. [Project overview](#1-project-overview)
2. [Application architecture and scope](#2-application-architecture-and-scope)
3. [Complete feature inventory](#3-complete-feature-inventory)
4. [Navigation and page functionality](#4-navigation-and-page-functionality)
5. [Card systems and interactions](#5-card-systems-and-interactions)
6. [Game zones and card movement](#6-game-zones-and-card-movement)
7. [Battlefield and player management](#7-battlefield-and-player-management)
8. [Gameplay flow and mechanics](#8-gameplay-flow-and-mechanics)
9. [Multiplayer and lobby systems](#9-multiplayer-and-lobby-systems)
10. [Quality-of-life features](#10-quality-of-life-features)
11. [Interaction patterns and edge cases](#11-interaction-patterns-and-edge-cases)
12. [Data structures and state management](#12-data-structures-and-state-management)
13. [Backend and synchronization behavior](#13-backend-and-synchronization-behavior)
14. [Product behavior versus implementation versus presentation](#14-product-behavior-versus-implementation-versus-presentation)
15. [Feature preservation checklist](#15-feature-preservation-checklist)
16. [System dependencies and regression risks](#16-system-dependencies-and-regression-risks)
17. [Incomplete, broken, or uncertain functionality](#17-incomplete-broken-or-uncertain-functionality)
18. [Testing recommendations](#18-testing-recommendations)
19. [Important accumulated product decisions](#19-important-accumulated-product-decisions)

---

## 1. Project overview

**Overloaded** is a browser-based tabletop for playing the Magic: The Gathering card game with friends who are not in the same room. A player pastes a decklist exported from a deck-building site, the site matches it against its own card list, and the player can then play that deck alone on a solo table or with up to three other people at a shared live table. There are no accounts, no payments and nothing to install.

**What kind of product it is [V, D]:**
- A **casual simulator**, not a rules engine (decided 2026-10-25, log entry 5). Players move their own cards like paper; the site never refuses a move because of the game's rules. Helpers such as summoning-sickness marks and lethal markers are **reminders only**, never enforced.
- **Bring your own deck** by pasting text. Decks live only in the browser that imported them (`localStorage`).
- **Private tables** identified by a 6-character code or a `/lobby/CODE` link. The host picks 2 to 4 seats, a format (Commander or Standard), a view (Grid or Sidebar) and an optional bracket limit.
- **Hidden information is protected by the database itself**: each player's hand, library and sideboard are stored in a branch only that player can read.

**Who built it and why it matters for the redesign [D]:** a single student (Kevin Lam) with an AI coding agent, as the "Moonshot" artifact of a university course (final show and tell 2026-12-07, due 2026-12-13). Development ran from 2026-10-25 to 2026-11-24 in 276 logged steps. Many behaviors exist because the owner tried something, disliked it and asked for a change; section 19 records those decisions so they are not lost.

**Live site:** `https://overloaded-spell.vercel.app` (Vercel project "Overloaded", builds `main`). The site's version is `0.N`, where N is the number of numbered entries in `log.md` (0.276 at this audit) [V `shared/version.mjs`].

**Scope limits that are deliberate [D]:** desktop browsers only (phones and tablets "on hold" since 2026-10-28; designed for 1366x768 and up); no AI opponent; no deck builder (paste import only); no trading; no accounts; English card data.

---

## 2. Application architecture and scope

### 2.1 Stack [V]

| Layer | Technology | Where |
|---|---|---|
| Pages | Plain JavaScript ES modules, no framework, built with Vite 8 | `frontend/pages/*`, `frontend/src/*` |
| Shared game logic | Plain `.mjs` modules with no browser or network code, tested in Node | `shared/*.mjs` |
| Live play | Firebase Realtime Database + anonymous Firebase Auth, Security Rules; **no server code** | `frontend/src/db.js` (the only Firebase importer), `shared/table-ops.mjs`, `backend/database.rules.json` |
| Card data | A static card list and side files, built from Scryfall's bulk data during the Vercel build, served as static files | `scripts/build-card-list.mjs`, `scripts/lib/*`, output `frontend/public/data/` (git-ignored) |
| Card pictures | Loaded directly from Scryfall's image hosts (`cards.scryfall.io`, `backs.scryfall.io`, `svgs.scryfall.io`) | `shared/card-image.mjs`, `frontend/src/mana-pips.js` |
| Hosting | Vercel (static site + build step); routes and headers in `vercel.json` | `vercel.json`, `vite.config.js` |
| Tests | Node scripts (`scripts/test-*.mjs`), headless Chrome checks (`scripts/check-*.mjs`), Firebase emulator suites (`backend/test-*.mjs`), live checks against the real project | `scripts/test-all.mjs` runs them |

Dependencies: `firebase ^13.1.0` (page), `vite ^8.3.5` (build); the backend test package adds Firebase emulator tooling. Node 24.x. Every new dependency needs the owner's approval (a hard rule) [D].

### 2.2 Routes [V `vercel.json`, `vite.config.js`]

| URL | Page file | Purpose |
|---|---|---|
| `/` and `/lobby` | `frontend/pages/lobby/index.html` (`data-screen="start"`) | Home: hero, make or join a table |
| `/lobby/CODE` | same page, room screen | A table's waiting room |
| `/table/CODE` | `frontend/pages/table/index.html` | The live multiplayer table ("Seats" table) |
| `/solo` | `frontend/pages/solo/index.html` | The solo table |
| `/deck` (`?sample`, `?sample=<id>`, `?play`) | `frontend/pages/deck/index.html` | Deck import and saved decks |
| `/logs/` | `frontend/public/logs/index.html` (generated) | The build log page linked from the owner's portfolio; **its URL must never move** |
| `/data/...` | static JSON from the build | Card list and side files |
| `/sfx/*.mp3`, `/icons/mana/*.svg`, `/brand/logo.png` | static assets | Sounds, icons, logo |

All pages load scripts and styles with root-based paths (`/pages/solo/solo.js`), because relative paths break under the rewrites [V, D entry 92]. The dev server mirrors the rewrites except bare `/lobby` (404 in dev only) [V].

### 2.3 Source map

| Area | Main files |
|---|---|
| Deck import | `frontend/src/deck-importer.js` (one component used by `/deck` and inside the lobby), `deck-groups.js`, `deck-stats.js`, `deck-tiles.js`, `deck-face.js`, `printing-picker.js`, `printings.js`, `card-prints.js`, `stack-preview.js`, `card-peek.js`; `shared/deck-text.mjs`, `card-match.mjs`, `deck-preview.mjs`, `deck-library.mjs`, `deck-view.mjs`, `deck-commander.mjs`, `deck-bracket.mjs`, `deck-fields.mjs`, `deck-text-edit.mjs`, `sample-decks.mjs`, `printings.mjs`, `card-prints.mjs`, `foil-kinds.mjs`, `foil-looks.mjs` |
| Game state | `shared/zones.mjs` (the hub: every move), `board-grid.mjs`, `stacks.mjs`, `marks.mjs`, `player-counters.mjs`, `commander-zone.mjs`, `turn-order.mjs`, `stack.mjs`, `scry.mjs`, `card-tokens.mjs`, `counter-catalog.mjs` |
| Menus (what is offered, what it does) | `shared/card-menu.mjs`, `pile-menu.mjs`, `hand-menu.mjs`, `group-menu.mjs`; drawn by `frontend/src/card-menu.js` |
| Solo table page | `frontend/pages/solo/solo.js` |
| Live table page | `frontend/pages/table/table.js` |
| Lobby page | `frontend/pages/lobby/lobby.js` |
| Shared page modules | `card-nodes.js` (card buttons), `board-drag.js` (drag and drop), `hand-view.js` (the hand fan), `hand-sort-ui.js`, `pile-stack.js`, `pile-viewer.js`, `order-window.js`, `scry-window.js`, `command-zone.js`, `card-fly.js` (animations), `card-hover.js` (Alt picture), `card-details.js`, `token-picker.js`, `marks-panel.js`, `stack-window.js`, `history-bar.js`, `floating-bar.js`, `tool-dock.js`, `players-panel.js`, `life-control.js`, `counter-panel.js`, `counter-chips.js`, `settings-menu.js`, `keybind-settings.js`, `keybinds.js`, `sound.js`, `confirm-box.js`, `text-box.js`, `number-box.js`, `spotlight.js`, `keep-alive.js`, `banner.js`, `safe-store.js` |
| Live sync | `shared/game-sync.mjs` (game to database and back), `live-history.mjs`, `stack-sync.mjs`, `ping.mjs`, `presence.mjs`, `heartbeat.mjs`, `table-limits.mjs`, `table-ops.mjs` |
| Database rules | `backend/database.rules.json` + `backend/test-*.mjs` |
| Styles | `frontend/src/style.css` (one file; the last blocks are the Seats table and the newest additions) |

### 2.4 Scope as a system diagram (text)

```
 Scryfall bulk files ──(Vercel build, at most weekly)──> /data/cards.json + side files
                                                              │ (static fetch, no API calls while playing)
 Pasted decklist ──> deck importer ──> overloaded.decks (localStorage, this browser only)
                                              │
                    ┌─────────────────────────┴───────────────────────┐
              /solo (in memory only;                      /lobby/CODE ──> /table/CODE
              a refresh deals a new game)                 (Firebase: meta, seats, members,
                                                           public/{uid}, private/{uid},
                                                           presence, stack, activity)
```

---

## 3. Complete feature inventory

A one-line inventory of everything found, grouped by area, with the section that details it. Every row reappears in the checklist (section 15) with its classification.

**Entry and navigation**
- Home screen with hero, Play solo, Try a sample deck, Import your deck, Make a table, Join a table (§4.1)
- Site header with conditional Lobby link and "BETA" pill; footers with version, credits and fan-content notice (§4.1)
- `/logs/` build-log page generated from `log.md`, `docs/feedback.md`, `docs/todo.md` (§4.5)

**Deck import and saved decks** (§4.2)
- Paste box, Check deck (Ctrl+Enter), parser with headers, optional counts, set and number, foil `*F*` and etched `*E*`
- Name matching (full name, front face, alternate printed titles), ambiguous and "did you mean" choices
- Exact printing per line from per-set files; printing picker ("Change printing...")
- Commander and partner from the card menu; guess with a stated certainty
- Format (Commander/Standard), bracket (Auto guess from Game Changers, or 1 to 5) with an info panel
- Views: text list, picture grid, stacked columns; group by type/color/mana value; sort by name/cost/color with direction
- Card display beside the list; deck facts strip and "About this deck" (curve, colors, types)
- Autosave (no Save button), up to 20 decks, unique names, delete with confirmation, damaged-storage handling
- Sample deck (Krenko, Mob Boss), `/deck?sample&play`
- Play solo from a deck
- Card data build, caching, format versioning, `/data/cards.info.json` (§13.6)

**Solo table** (§4.3, §5 to §8)
- Deal with a commander in the command zone; life 40 with a commander, 20 without; one-card-at-a-time dealing with sound
- Draw, Draw X, Next turn (untap + draw), Untap all, Mulligan (with gather and shuffle animation), New game
- Floating action bar, floating life piece, player counters and marks
- Battlefield grid (112x50 square cells), drag and drop, same-name piles, tapped piles, rectangle multi-select, Alt+arrow nudge
- Hand fan: resting and raising, hover lift, selection, reordering, sorting (Auto and one-off), pins, hand menu, group menu
- Library, graveyard, exile, sideboard piles with menus and a searchable, filterable pile window
- Scry, Surveil, mill, reveal, play with top revealed, exile face down, order window
- Command zone with two slots, commander tax, emblems
- Tokens and emblems from a token catalog
- Card menu per zone: Modify window, tap, flip, turn over, doesn't untap, sick, counters (fixed and 218 named), copy, play back face, stack, details, move
- Card details window with rules and rulings
- Alt big picture with wheel zoom and turning
- Stack window with notes and arrows
- Game history bar with Moves and Messages
- Settings (General, Hand sorting, Keybinds, About), rebindable keys, sound

**Live multiplayer** (§9)
- Anonymous sign-in, one account per browser, tab coordination
- Create a table (seats, format), new-table warning, join by code or link, auto-join with a saved name, rejoin a reserved seat
- Lobby room: seat cards with commander art, bracket, Ready, presence; host switches for format, view, bracket limit; copy code and link
- Deck choice in the lobby (only commander names and bracket are shared), import overlay, Ready dialog
- Test bots (Add bot / Remove bot)
- Start (host, everyone ready, 2 or more players); host leave hand-over; takeover of a vanished host (lobby only)
- Live table ("Seats"): your own game saved on every move, other players' public boards, Grid and Sidebar views, facing
- Tool docks (Players, Stack, History, Action bar) and the Players panel
- Turn passing, skipping, reverting, turn clock, your-turn sound and title
- Ping a card (spotlight + glow), shared game history that never reveals hidden cards, shared stack
- Concede, End the match, Leave (seat kept mid-match)
- Presence, heartbeat, idle and 8-hour limits with banners, closed-table messages, expired-table cleanup
- Commander tax stored live (own write), commander damage, poison/energy/experience

---

## 4. Navigation and page functionality

### 4.1 Home and site shell (`/`) [V `frontend/pages/lobby/index.html`, `lobby.js`, `site-header.js`]

- **Hero:** "Welcome to Overloaded", a lede, and three buttons: **Play solo** (`/solo`), **Try a sample deck** (`/deck?sample`), **Import your deck** (`/deck`). Three feature cards with inline SVG icons.
- **Play with friends:** "Who are you?" name field (max 30), **Make a table** (seats 2/3/4, default 4; format Commander (default) or Standard), **Join a table** (code field, max 9 characters; Enter joins).
- **Resume hint:** when this browser remembers a table (`overloaded.lastTable`) and the database confirms you are still a member, the page says "You are at table X. The Lobby link above goes back to it." It does not redirect. If you are no longer a member the key is removed [V].
- **Header** (lobby and deck pages only): logo (falls back to text if the image fails; inverted in light theme), "BETA" pill, nav Home, Lobby (only when `overloaded.lastTable` holds a valid code; read once at page load), Decks, Solo table, and Build log (lobby page only). `aria-current` marks the page.
- **Footers:** lobby footer has the Scryfall credit, source link, "Version 0.N" linking to `/logs/`, and the fan-content notice. The deck page footer has the credit and notice but **no version or Build log link** (inconsistent). The solo and table pages have **no header or footer**; their fan-content notice is only in Settings > About [V]. (The owner chose this in log entry 144; the project's own hard rule asks for the notice on every public page, so this is an open compliance question [D].)
- Classification: routes and links MUST PRESERVE; layout OPEN TO REDESIGN.

### 4.2 Deck page (`/deck`) and the importer [V `deck-importer.js` and shared modules]

The importer is one component, `mountDeckImporter({ root, sampleId, autoPlay, onLibraryChange, play = true, startOn, format })`, mounted by `/deck` and lazily inside the lobby's import overlay (§9.4). It builds its own markup and has three screens (`root.dataset.screen`):

1. **List** (`#saved`): your saved decks as cards (§4.2.9), "New deck".
2. **Paste** (`#paste`): "Add a deck", the textarea `#deck-text`, **Check deck**, **Try a sample deck**, **Cancel** (only when there is somewhere to go back to). Ctrl/Cmd+Enter runs Check.
3. **Deck** (`#preview`): the checked deck with its header (name, save state, Format, Bracket with an (i) panel, commander note, facts strip), "‹ All decks", "Edit list", "Play solo" (only when `play`), the view controls, problems, the deck body, and "About this deck".

It starts on the list when decks exist (and no sample is pending), otherwise on paste; `startOn: 'paste'` forces paste. Each screen moves focus to its heading (or the textarea). Status messages go to a polite live region `#deck-status`. All user text is inserted as text, never markup.

**4.2.1 Loading the card list.** `loadCardList()` fetches `/data/cards.json`; it fails on a non-OK response, a non-array, fewer than 1,000 entries or a malformed first entry. While loading, Check and Sample are disabled ("Loading the card list..."). On failure: "The card list could not be loaded. Check your connection and try again." with **Try again**. Gap [V]: opening a saved deck while the list is still loading or after it failed does nothing and says nothing.

**4.2.2 Parsing** (`shared/deck-text.mjs` `parseDeckText`) [V, probed]:
- Limits: 100,000 characters, 1,000 lines, **200 cards** (all sections except the maybeboard). Over 200 is an error but the lines are still shown.
- A card line is `[count[x]] Name [(SET) number] [*F*|*E*]`. Count is optional: a line with no count is **one card** and is flagged `qtyAssumed` (the page says which lines were counted as 1). Set codes are 3 to 6 characters; collector numbers are kept as typed (`242s`, `CNS-36`). `*F*` means foil, `*E*` etched.
- Skipped with a warning: comments (`//`, `#`, `--`), headings with counts (`Creatures (12)`), labels with numbers (`Deck stats: 99`), headings with a colon (`Lands:`), bare numbers, negative or fractional counts, zero counts (`zero_quantity`), a Commander/Companion header with no card after it.
- Headers (case-insensitive, colon optional): deck/main/mainboard → main; sideboard; commander(s); companion; maybeboard. **Commander and Companion headers mark only the next card**, then the parser returns to the previous section. A blank line after a labelled section's cards switches to an "unlabeled" section (Moxfield's plain export puts the commander there).
- Parsed but likely unwanted: `1 Sol Ring (CMM)` (set without number) becomes the name "Sol Ring (CMM)" and is not found; an Archidekt category suffix `[Ramp]` becomes part of the name.
- Saved decks store the raw text and are **re-parsed on every open**, so any parser change changes old saved decks (regression risk).

**4.2.3 Matching** (`shared/card-match.mjs`) [V]: names are normalized (accents removed, Æ to Ae, curly quotes straightened, `/` and `//` to ` // `, lowercase). Order: full name, then front face, then alternate printed titles (`f`, from Scryfall's `flavor_name`, e.g. "Heart of the Mountain" is Arcane Signet). Several cards for one name gives **ambiguous** with candidates; a back-face name never matches on its own and gives a **"did you mean"** suggestion (29 back faces clash with real names). Otherwise **not found**. There are **no Scryfall API calls**; `matchDeck` still computes `fallbackNames` for a batch lookup that was never built (dead code).

**4.2.4 Problems and choices** (`shared/deck-preview.mjs` `makePreview`): repeated lines merge (by section, card, printing and foil look). "Needs attention" lists ambiguous lines and suggestions with a `<select>` each, then not-found lines ("It may be spelled differently, or newer than our card list."). A choice re-renders, autosaves and says "Chose X." Notices summarize parser errors, up to 10 skipped lines, assumed counts and printing problems.

**4.2.5 Printings** [V]: a line that names a set and number shows that printing's picture, found in `/data/printings/set-CODE.json` (the `set-` prefix exists because Windows cannot create `con.json`). Each entry carries a 4-hex key derived from the card's name, so a set and number that belongs to a different card is refused. Order: typed printing, then the printing that carries a typed alternate title, then the default printing. Problems are shown per line: "(not found)", "(not loaded)" (a network failure, retried on the next check). The sample deck's first check fetches 69 small set files.
- **Printing picker** ("Change printing..." in a line's menu): loads `/data/prints/XX.json` (one shard per card-key prefix) and `/data/prints/sets.json`; tiles of every paper printing, newest first, with a search box, "Default" tag, foil labels, `aria-current` on the printing in use, "Use the default". Choosing rewrites the deck text line to `qty Name (SET) number[ *E*| *F*]` (side effects: CRLF becomes LF, a line with no count gains "1 ", an alternate typed title is replaced by the real name). Escape, backdrop or Close closes it. No focus trap despite `aria-modal`.

**4.2.6 Foil** [V]: decided only by the decklist (`*F*`, `*E*`, or a printing that exists only as foil). A line's menu offers only the finishes that printing has (Non-foil / Foil / Etched, current one ticked), rewriting the `*F*`/`*E*` mark. Each printing's foil kind (30 kinds from Scryfall's `promo_types` plus set rules) is kept as data and shown as a tag, but **every foil is drawn with one traditional look** (owner's decision, log entry 237).

**4.2.7 Commander, format, bracket** [V]:
- **Guess** (`guessCommander`): marked commander section, then the unlabeled block, then the first legendary creature, then the first card. A note under the header says how it was guessed. Changing it is only through a card's menu: Make commander, Make partner, Remove as commander, Remove as partner (Commander decks only).
- **Possible defect [V]:** the view always refills the commander slot, so "Remove as commander" on the only commander silently makes another card the commander; the fallback list includes sideboard cards, so a sideboard card can become commander (NEEDS INVESTIGATION).
- **Format:** Commander or Standard. Until the player touches the select it follows "looks like Commander" (a marked or unlabeled commander, or 98 to 102 cards). Standard hides the bracket and the commander group and saves no commander. Inside a Standard lobby "Try a sample deck" still makes a Commander deck.
- **Bracket:** Auto (guessed from the count of Game Changers: 0 → 2, 1 to 3 → 3, 4+ → 4) or 1 to 5. An (i) panel lists the Game Changers and says mass land denial, extra turns and combos are not counted. A guessed bracket is stored with `bracketGuess: true` and re-guessed on open.

**4.2.8 Views** [V]: three view buttons (text list, picture grid, stacked columns; `overloaded.deckView`), Group by Type (default)/Color/Mana value (`overloaded.deckGrouping`), Sort by Name/Mana cost/Color with an ascending/descending toggle (`overloaded.deckSort`, `overloaded.deckSortDirection`). Fixed groups: Not matched first, then Commander, Companion, the grouped deck, Sideboard, "Maybeboard (not counted)". A sticky card display (`stack-preview.js`) shows the card under the pointer or focus; a click keeps it; it starts on the commander; two-sided cards show the back smaller. Facts strip: Cards, Lands, Avg mana value (without lands), Colors. "About this deck": mana curve 0 to 7+ split permanents versus spells, color requirements, card types. **Possible defect [V, probed]:** an unmatched line in the sideboard or companion section is shown twice (in Not matched and in Sideboard) and counted twice.

**4.2.9 Saving** (`autosave()`, `shared/deck-library.mjs`) [V]:
- **Autosave** after every change (check, choice, commander, format, bracket, name, printing, finish); there is no Save button. Save state line: "Saved" or "Not saved: <reason>".
- Name: typed, else saved, else commander name, else "New deck". A new deck gets a unique name ("Name (2)") and **becomes the selected deck** for the solo table. An open saved deck is replaced in place by its id; renaming to another deck's name is refused.
- Unmatched lines are saved without them (`skipped` counts them). Misleading message [V]: a list over 200 cards shows "Not saved: There is nothing to save yet: no card was matched."
- If an edit makes an existing deck unsaveable, the stored copy stays the old version and Play solo plays that old version without saying so [V].
- **Library:** `overloaded.decks` = `{version: 1, selected, decks: [{id, format, bracket?, bracketGuess?, deck}]}`, at most 20 ("Delete one first"). Invalid JSON, a wrong version or more than 20 decks marks the library damaged ("Your saved decks could not be read, so they were ignored. Saving a deck starts a new list."), and the next save overwrites it. A single bad deck is skipped and counted. The old single-deck key `overloaded.deck` is migrated once. Storage blocked: "Your browser is not letting this page save anything..." and the page still works. A failed write is rolled back in memory with a message.
- **Deck cards** (`deck-face.js`, also used in the lobby): commander art (two commanders split diagonally), color tint, name, commander names, color symbols, "Bracket N", "N cards" (**counts every section, including sideboard and commander**, although the owner asked for main-deck count only in log entry 234: NEEDS INVESTIGATION), Play solo and Delete icon buttons. Delete asks first with `askConfirm` ("Delete "X"? It is removed from this browser.", Cancel focused).
- **Sample deck** (`shared/sample-decks.mjs`): one Commander deck (Krenko, Mob Boss, 100 cards, 48 foil lines). "Try a sample deck" puts it in the box, checks it and **autosaves it** (comments saying "nothing is saved" are stale). If an identical saved copy exists it opens that. `/deck?sample&play` saves it and opens `/solo` (linked from the solo table's empty state).

### 4.3 Solo table (`/solo`) [V `solo.js`]

- Reads the **selected** saved deck (`overloaded.decks`) and the card list, then deals (§8.1). With no deck: "Nothing to play yet" with **Play the sample deck** and **Import your own deck**. A damaged library: "Your saved deck could not be read, so it was ignored. Import it again." Card list failure: message and **Try again**.
- One screen, no scrolling (`body.playing.solo`): the battlefield fills the window; a floating life piece (top left), menu button (top right), floating action bar (top middle by default), the hand fan at the bottom, the pile row and command zone at the bottom right, the Stack tab on the left edge, the history bar on the right edge.
- **Nothing is saved**: a refresh deals a new game, and there is no "leave page?" warning [V]. Settings, keybinds and positions are kept in the browser.

### 4.4 Lobby room (`/lobby/CODE`) and live table (`/table/CODE`)

Described in section 9.

### 4.5 Logs page (`/logs/`) [V `scripts/make-logs-page.mjs`]

A static page generated from `log.md`, `docs/feedback.md` and `docs/todo.md` (run the script after any change to them and commit `frontend/public/logs/index.html`). Entries are grouped in weeks Monday to Sunday (Week -1 starts Oct 25), with search, Expand all/Collapse all, week links, and a word check that fails if any source word is dropped. Summaries come from `scripts/log-summaries.mjs`, which is empty, so each entry shows the first sentence of "What I asked for". The URL is linked from the owner's portfolio and must never move.

---

## 5. Card systems and interactions

### 5.1 The card object (in memory) [V `shared/zones.mjs`]

Every card in a game is a plain object. Fields:

| Field | Meaning | Lifetime |
|---|---|---|
| `uid` | `c1`, `c2`, ... unique within one player's game (each copy of a deck line gets its own). Stack copies are `stack-s<N>`. | assigned at deal; tokens/copies/emblems take `c${nextUid}` |
| `i` | Scryfall id: what the card is, and its default picture | permanent |
| `p` | optional printing id: only which picture to show | from the deck |
| `n` | name; two-faced cards are `"Front // Back"` | permanent |
| `t`, `m`, `k` | type line, mana cost, printed keywords: looked up from the card list, never stored live | from lookup |
| `b`, `md` | has a back face (transform or modal) / modal (playable as either face); from the card list only | from lookup |
| `foil`, `look` | foil (only ever `true`) and its kind; only from the deck list | from the deck |
| `tapped`, `turnEntered` | tapped state; the turn it arrived on the battlefield | battlefield |
| `ct` | counters `{kind: n}`, at most 12 kinds; fixed kinds `p` (+1/+1), `m` (-1/-1), `l` loyalty, `c` charge, `t` time, `o` other, plus named slugs (solo only) | battlefield |
| `mp`, `mt` | hand-set power / toughness change (separate from counters) | battlefield |
| `nt` | note (1 to 40 chars); **no UI sets it** | battlefield |
| `faceDown` | shown as the card back ("Flip") | battlefield |
| `turned` | back face showing ("Turn over" / "Flip double-faced card") | battlefield |
| `sick` | summoning-sickness reminder | battlefield |
| `noUntap` | "Doesn't untap" mark | battlefield |
| `px`, `py` | grid cell (top-left corner) | battlefield |
| `tok`, `pt`, `cl` | token, its power/toughness text, its colors | tokens |
| `emb`, `ec` | emblem and its count (2 to 99) | command zone |
| `xd` | exiled face down (solo only) | exile only |
| `src` | stack copies only: the real card's uid | stack |

**Battlefield-only state** (`BATTLEFIELD_STATE`: `ct, mp, mt, faceDown, turned, nt, sick, noUntap, px, py`) is cleared whenever a card leaves the battlefield; the card is also untapped and `turnEntered` reset. **A token that leaves the battlefield is removed from the game**, wherever it was going ("X is a token, so it is gone.") [V, tested]. Classification: MUST PRESERVE.

### 5.2 Rendering a card [V `frontend/src/card-nodes.js`]

- **One button per card uid, reused across zones** (`makeCardNodes` keeps a Map), so a moved card keeps its loaded picture. Cards are `tabIndex = -1` (not reached with Tab) and carry an `aria-label` listing their states.
- **Picture:** printing `p`, else default `i`, at Scryfall's `small` size; the battlefield (solo and the player's own live board, and other players' boards since 2026-11-23), the hand, pile windows and the command zone ask for `normal`. On a load error it tries the default printing's picture once, then shows the name (`.noimage`). Every card picture is clipped to card-shaped corners (4.8% by 3.4%).
- **Face shown:** `faceDown` shows the real card back (from `backs.scryfall.io`; an owner decision against the agent's advice, see §19); `turned` shows the back face of the same printing (a missing back picture falls back to the default printing's back, a 404 shows the name and recovers on turning back); `xd` adds a dashed outline and "Face down" label in exile; `.foil` adds one traditional foil sheen.
- **Tapped:** the card turns on its side (CSS only, the picture is never altered), is greyed, and shows the mana tap symbol in the middle (in a tapped pile only on the top card). Its box becomes landscape.
- **Badges (top left):** a lock for "Doesn't untap", "SICK" for summoning sickness. On your own cards a click on a badge clears that mark.
- **Marks (bottom):** counter chips at the bottom left (icon and number); a single power/toughness box at the bottom right showing the **final** numbers (printed + counters + change), green above printed, red below. On your own battlefield creature the box with plain printed numbers shows only on hover or while selected. A card whose printed numbers are not two whole numbers (a star) or that has none shows the change as a "+X/+Y" pill. On your own cards: click a chip or number +1 (Shift +10), right-click -1, the "/" changes both; a floating "+1/+1" toast shows for 1 s.
- **Read-only mode** for other players' cards on the live table: same drawing, no interaction.
- Classification: states visible MUST PRESERVE; their look OPEN TO REDESIGN.

### 5.3 Card size and the grid [V `shared/board-grid.mjs`, `table.js`, `style.css`]

- A battlefield card occupies **7 by 10 square cells** (`CARD_COLS`, `CARD_ROWS`).
- **Solo:** 112 by 50 cells (16 cards across, 5 down). The board is flush with the top and sides of the window.
- **Live table:** **30 rows** (`TABLE_ROWS` in `table.js`, `--rows: 30` in CSS) and as many square columns as fit the seat (`fitBoard` → `setBoardSize`). Cards are a third of the board's height. `setBoardSize` **silently refuses** any row count that is not a multiple of 10; when 32 rows were tried on 2026-11-23 the drag worked in the old size and drops landed too low (log entry 274). Each player's board is flush with the seat border on three sides and runs the full width over the pile row.
- Board sizes are **module-level mutable state** shared by every importer (a regression risk).
- On other players' boards, a card stored at a column beyond the viewer's column count is drawn clamped at the right edge, so players with different window shapes see different arrangements [V, I].

### 5.4 Selection [V `solo.js`, `table.js`]

- **Click** a card (battlefield, hand, command zone, pile window): it becomes the selected card, shown by a thin line and faint glow; a screen-reader line `#selected-line` names it. A selected **hand** card rises (0.225 of its height, scale 1.1) and the rest of the hand moves aside; its mana cost shows.
- **Shift+click** a hand card: add or remove it from a picked group (hand only).
- **Rectangle:** press on empty battlefield and drag 6 px: every card the rectangle touches is picked (`multi`); started inside the hand's area it picks hand cards instead; Shift at the start adds to the picks. Hand and battlefield picks never mix.
- **Deselect:** Escape, or a click on empty space (clicks on buttons, menus, the piles column and popovers do not deselect). Edge: clicks inside the card-details window and the token picker bubble out and deselect [V].
- A pick group is cleared as soon as any picked card leaves its zone.

### 5.5 Hover and inspection

- **Alt picture** (`card-hover.js`) [V]: hold **Alt** with the pointer over any card or token tile (yours or another player's, any zone) and a large `normal` picture appears beside it, on the side with more room. While shown: the **wheel** sizes it 0.5x to 2x in steps of 0.1 (`overloaded.hoverScale`); **Q / E** (rebindable "picture" keys) turn it a quarter turn (for rooms and battles). It hides on Alt release, leaving the card, any press, a right-click, Escape, a scroll or window blur. Alt's default browser action is suppressed. Mouse only (not touch or pen). This replaced "enlarge after resting the pointer" (log entry 144). Classification: MUST PRESERVE (the main way to read small cards).
- **Hand hover lift:** the hand card under the pointer is shown lifted by a **copy** in a separate layer (0.9 rem up, scale 1.05, cost shown); the real card keeps its place and hit area. Never by raising its z-index (that kept the pointer over neighbours; log entries 147 and 148).
- **Card details window** (`card-details.js`; menu line "View details", not for tokens): large picture with "Show the back face" for two-sided cards, rules from `/data/rules/XX.json` (mana value, colors, color identity, keywords, legality in seven formats, faces with text), rulings from `/data/rulings/XX.json`, each with loading, error and Try again states. Close, Escape or a click on the overlay.
- **Pile window** and **deck card display**: see §6.5 and §4.2.8.

### 5.6 Dragging and dropping [V `frontend/src/board-drag.js`, page handlers]

- **Input:** mouse or pen, left button, starts after 6 px. Not with Alt, Ctrl or Meta, and not when pressing a mark or badge. **No touch drag.**
- **Sources:** battlefield cards; hand cards; the top card of the library (drawn as a card back), graveyard or exile; command zone cards. Pile-window, scry, order and stack cards cannot be dragged (they use menus).
- **Carried picture:** a battlefield card follows the pointer exactly, held where it was grabbed, at its real size (a tapped one as a landscape box). Hand, pile and command cards follow with a lag and a lean (up to 18 degrees), with no lag under reduced motion; a hand card carries its cost. The original is hidden while carried.
- **Shift while carrying** locks the move to a row or column (after 8 px, switching with 12 px of give).
- **Cancel:** Escape, window blur, pointer cancel or any right-click; the following click is swallowed.
- **Drop on the battlefield:** a battlefield card moves by the pointer's travel in cells; a card from elsewhere lands centred on the pointer. Snaps onto a same-key pile within 6 cells (§5.8). Never swaps, never refused, cards may overlap. Message "Moved X." / "Played X."
- **Drop on the hand:** the dashed rectangle round the whole hand shows while a card from outside is over it, and the hand opens a gap; the card goes back to the hand at that gap (in a sorted hand, not reordered). A token dropped there vanishes (message wrongly says "back to your hand").
- **Drop on a pile** (library, graveyard, exile, either command slot): the target is ringed; the card goes on **top** of that pile (or into the command zone, remembering the slot; command-to-command switches slot); a copy of the picture flies into the pile.
- **Whole pile:** Shift at the press, or **hold the pile still for 250 ms** (a ring fills), carries the whole pile (`placeStack`). Moving before the ring fills takes one card off the top. **Defect [V]:** a whole battlefield pile dropped onto a library, graveyard or exile pile moves **only the top card** (`board-drag.js:334` passes the group's uids only for hand groups).
- **Groups:** a rectangle-picked battlefield group moves together keeping relative positions (`placeGroup`, clamped to the board), cannot be dropped on a pile, and goes into the hand if dropped there. A Shift-picked hand group dragged to the board lands with each card offset 2 columns and 1 row; dropped on a pile it goes in hand order (no order window).
- **Keyboard nudge:** **Alt+Arrow** moves the selected battlefield card one cell (may snap onto a nearby pile); "That is the edge of the battlefield." at the edge. Risk [I]: Alt+Left with nothing selected is not intercepted and may trigger the browser's Back, losing an unsaved solo game.
- **Double-click tap:** two clicks on a battlefield card within 450 ms and 14 px tap or untap it (counted by the page, not the browser's `dblclick`, which proved unreliable for fast clicking; a pair is used up, so four quick clicks are two taps). On a card inside a rectangle group, the whole group flips to the opposite of that card.
- Classification: drop semantics MUST PRESERVE; feel and visuals PRESERVE INTENT.

### 5.7 Tapping and the untap step [V `zones.mjs` `setTapped`, `untapAll`]

- Tap/untap from the card menu, a double click, or the **tap key** (E or Q by default) on the battlefield card under the pointer (or the picked group). Plays the tap sound.
- **Untap all** untaps every tapped card except those marked **Doesn't untap**; the message counts the held-back cards ("Untapped everything except 2 cards that do not untap."). A held card can still be untapped by hand. The tap sound plays even if nothing was tapped.
- Tapping or untapping regroups the card (§5.8).

### 5.8 Same-name piles ("stacks" on the battlefield) [V `shared/stacks.mjs`, `zones.mjs`]

**What groups:** cards on the **same cell** with the **same `stackKey`**. The key is the name plus every state that matters: `tok, tapped, sick, noUntap, ct, mp, mt, nt, faceDown, turned, foil, look` (absent, false, 0 and `{}` all mean "none"; counter order does not matter). So a token, a tapped copy, a card with a counter, a face-down card, a turned card or a foil never pile with plain copies. Not in the key: the printing, a token's power/toughness and colors, the type line (so two different "Spirit" tokens pile together: design question) [V].

**Piles are never stored**: they exist only as cards sharing a cell. Grouping is re-derived every render.

**Drawing:** up to **3 copies** are drawn (`STACK_VISIBLE`), offset by whole pixels (diagonal up-left by default); deeper copies are hidden; the top card (the last in the list) carries an "Nx" count; the pile has a dashed border. Settings offers styles for untapped piles (Diagonal, Horizontal, Vertical) and tapped piles (Diagonal, (B) Horizontal, (T) Horizontal, Vertical) (`overloaded.pileStyle`, `overloaded.tappedPileStyle`); these are CSS only.

**Joining a pile:**
- A card arriving with no target cell (Play from a menu, Move to battlefield, tokens, copies) joins the pile of the **last** same-key card anywhere on the board (no distance limit), else takes the first free block (§7.1).
- A dropped card snaps to the nearest same-key pile within 6 cells (reach widened for a tapped card: 9 columns by 4 rows), ignoring the pile it is leaving.

**Tap regrouping** (`regroupAfterTap`):
1. If a pile with the card's new key (the last such card) is within 8 columns and 10 rows, the card joins it.
2. Else, if tapped out of a pile, it steps to a nearby free block: right, then left, below, above (`TAP_GAP` 1 cell beyond a card width).
3. Else, if untapped out of a tapped stack, it goes to the left (if the left is off the board, the tapped stack shifts right instead).
4. A card alone stays put.
`untapAll` runs card by card so each can rejoin an untapped pile. Known weakness [I]: "the pile" is found by the last matching card in the list, not the nearest.

**Individual access:** a plain drag or a click takes/selects the **top card**; holding or Shift-dragging takes the whole pile; menus act on the single card clicked. There is no "expand pile" view on the battlefield.

Classification: grouping concept PRESERVE INTENT; exact reach numbers implementation-flexible; visuals OPEN TO REDESIGN.

### 5.9 Card menus [V `shared/card-menu.mjs` `menuItems`, `frontend/src/card-menu.js`]

Right-click a card (or the Menu key / Shift+F10, placed at the card's centre). One menu at a time; it closes on a choice, Escape, Tab, an outside press, resize, blur or a scroll (from the second animation frame, after a bug where the page's own scroll closed it). Up/Down/Home/End/Enter/Space; Right/Left open fly-outs; lines ending in "..." open a number box (last value remembered in `overloaded.lastNumber`; inline number boxes in menus remember per line in `overloaded.menuNumbers`). Solo passes `{peek, details, counters, stack}`; the live table passes `{live, details, peek, stack}` (no named counters).

| Zone | Items, in order |
|---|---|
| Battlefield | Modify...; Tap/Untap; Flip (face down/up); Flip double-faced card (two-sided only); Doesn't untap / Untaps normally; Summoning sick / Not summoning sick; +1/+1 counter; +1/+1 counters X... (1 to 99); **Add counter** ▸ (solo only: Custom..., +1/+1, -1/-1, 13 keyword counters, loyalty, charge, time, 78 common, 122 rare; searchable); Create copy; Add to the stack; View details (not tokens); **Ping card** (live only); Move to ▸ Hand, Graveyard, Exile, Command zone, Sideboard, Top of library, Bottom of library |
| Hand | Play; Discard; Exile; Move to command zone; Move to top of library; Move to bottom of library; Flip double-faced card (a local **peek** at the back, not stored); Play <back name> (modal only); Add to the stack; View details. No ping, no sideboard. |
| Graveyard, exile, command | Play <back name> (modal only); Add to the stack; View details; Ping card (live); Move to ▸ every other zone plus top/bottom of library |
| Library, sideboard (seen in a pile window) | View details; Move to ▸ every other zone plus top/bottom of library |
| Emblem (command zone) | Remove emblem, or Remove one / Remove all |
| Empty battlefield | Create token...; Create emblem... |
| Empty command zone | Create emblem... |

Notable action semantics: **Create copy** makes a token of only the face that shows (name, type line up to 50 chars, printed numbers only if they fit, the back picture if turned, no counters or marks; refused if the face has no type line). **Play <back>** puts a modal card onto the battlefield already turned over, then sets sickness from the shown face (defect [I]: its cell and pile are chosen from the front face before turning, so a spell//land played as the land lands in the non-land area). The **Modify window** (`#marks`, `marks-panel.js`) has an amount (1 to 1 trillion), a kind select of the six fixed kinds, Add/Remove counters, Power ±, Toughness ±, Both ±, Reset change (counters stay), Close; it closes when the card leaves the battlefield or the selection changes. Classification: actions MUST PRESERVE; menu layout PRESERVE INTENT (the item sets were decided from the owner's sketch, 2026-11-15).

### 5.10 Counters, modifiers and printed numbers [V `zones.mjs`, `marks.mjs`, `counter-catalog.mjs`]

- +1/+1 and -1/-1 counters **cancel** in pairs (adding one removes the other first).
- At most 12 counter kinds per card; counts and changes clamp at **one trillion** (`NUMBER_LIMIT`; "doublers can go into the billions", log entry 87). A 0 count deletes the kind.
- Named counters (solo only): 218 catalog names + Custom (2 to 24 letters, slug rules); icons from the Mana icon set where one exists. The live table cannot store named counters: a card carrying one would be dropped entirely when read back, which is why the live menu omits "Add counter" (a regression trap).
- Final power/toughness = printed (from the card list's `pt`, or `bpt` when turned; a token's own `pt`) + counters (p - m) + the hand-set change.

### 5.11 Two-sided cards [V]

`b: 1` cards (393 transform, 99 modal) can be **turned over** on the battlefield ("Flip double-faced card"); the face that shows decides the land row placement, the printed numbers, the name used by copies and the picture. In the hand the same menu line only **peeks** locally. **Play <back>** exists for modal cards only. A page ignores a stored "turned" flag for a card its own list says has no back (so another player cannot make an ordinary card show a back picture). Not supported: flip cards, meld, reversible printings.

### 5.12 Tokens and emblems [V `token-picker.js`, `shared/card-tokens.mjs`, `zones.mjs`]

- **Create token...** (empty battlefield right-click) loads `/data/tokens.json` once ("Loading the tokens..."; a failure is retried next time). The picker lists "Tokens from your deck" (from the names of the non-token cards in all your zones), then "Common tokens" (16 names, each the token with the most printings), and searches every token by name or type (up to 60). A tile click makes the token with its newest art; "Art (N)" lists other printings; the window stays open for several creations ("Made a X token."). Alt over a tile shows the big picture.
- A token joins a matching pile or the first free block and is **always summoning sick if it is a creature** (tokens carry no keywords, so printed haste cannot be seen). At most 250 cards on the battlefield for creation.
- **Create emblem...** (empty battlefield or command zone): emblems stay in the command zone, in a row beside the slots; a second emblem of the same name raises a count (up to 99); emblems cannot be moved anywhere else.

### 5.13 Card quantities and ordering

- Each copy of a deck line is its own card (no quantity field on game cards).
- Within a pile zone, **index 0 is the top**. The graveyard shows the newest first. Default move positions (`DEFAULT_POSITION`): top of library and graveyard; bottom (end) of hand, battlefield, exile, command and sideboard [V].
- **Inconsistency [V]:** menu moves to exile append at the end, while a drag onto the exile pile puts the card first; the exile pile face shows `exile[0]`, so after menu exiles it shows the oldest card (NEEDS INVESTIGATION).

---

## 6. Game zones and card movement

### 6.1 Zones [V `zones.mjs` `ZONES`]

`library, hand, battlefield, graveyard, exile, command, sideboard`, plus the **stack window** (a visual aid, not a game zone; §6.8). Visibility on the live table: library, hand and sideboard are **private** (only their counts are public); battlefield, graveyard, exile and command are public.

### 6.2 The universal move: `moveCard(game, uid, to, { position, cell, faceDown })` [V]

- Unknown zones and positions other than top/bottom throw. Emblems may not leave the command zone.
- Leaving the battlefield: a token vanishes; any other card is untapped and loses all battlefield state.
- Exile face down sets `xd` (solo); any other move clears it.
- Arriving on the battlefield from elsewhere: marked **sick** if it is a creature without printed Haste; placed at the given cell (snapped to a pile) or by the arrival rule (§7.1).
- Battlefield to battlefield keeps tapped, sickness and turn entered.
- `moveAll` keeps source order (the first card of the source ends first, or on top of a library).
- Every function returns a **new** game and never mutates the old one (tests freeze games to prove it). Classification: MUST PRESERVE.

### 6.3 Hand

- **Fan** (`hand-view.js`, `shared/hand-layout.mjs`): no box; cards overlap from the start (step 0.75 of a card), the row stops widening at 7 cards (about 5 card widths) and squeezes beyond that; a 9-degree arc and a small drop at the ends, **only while raised**.
- **Resting:** the hand sits lowered with part of each card below the window edge (Settings "Resting hand", 20 to 100% showing in steps of 5, default 50%; `overloaded.handRest`). Moving the pointer into its area raises it at once; leaving lowers it after 150 ms.
- **Motion:** each card eases toward its place every frame (independent of frame rate); under reduced motion cards snap. Places do not change while a card is carried (no jitter), with a dead zone for the gap.
- **Reorder:** drag a hand card within the hand; with a sort on, the card is **pinned** at that place until the sorts change ("That card stays where you put it until you change the sorts.").
- **Hand bar** (shown while raised and not empty): "Hand: N", menu arrow, **Auto** switch, **Sort** (one-off, only while Auto is off), and Color, Type, Cost, A-Z buttons.
- **Sorting** (`shared/hand-sort.mjs`): a **view** over the stored order. Each sort cycles off → forward → reversed; priority type, then color, then cost, then name. Type order, color order and land order (non-basic/basic) are rows of draggable pills in Settings > Hand sorting (`overloaded.handTypeOrder`, `handColorOrder`, `handLandOrder`). Auto on keeps the shown order sorted (`overloaded.handSortOn`); turning it off keeps the shown order. Sort with nothing chosen: "Press Type, Color, Cost or A-Z first..."; already sorted: "The hand is already in that order."
- **Hand menu** (arrow or right-click the bar): Mulligan; Shuffle hand into library; Move all to ▸ Library top / Library bottom (both open the order window) / Graveyard / Exile; Discard X at random...; Discard hand.
- **Group menu** (right-click a card of a Shift-picked hand group of 2+): Play, Discard, Exile, Move to command zone, Move to top of library..., Move to bottom of library... (top/bottom open the order window). One summary message.
- **Empty hand:** "Your hand is empty." and a small drop area in the middle.
- Classification: fan, resting, lift and sorting PRESERVE INTENT (explicit owner requests, log entries 147 to 153, 173, 176, 223).

### 6.4 Battlefield

See §5.3 to §5.8 and §7.1.

### 6.5 Library, graveyard, exile, sideboard (piles) [V `pile-stack.js`, `pile-viewer.js`, `shared/pile-menu.mjs`]

- **Pile stacks:** each a button with layered shapes, a count bubble, and a short name. The library shows the card back (or its top card while "Play with top revealed" is on); graveyard and exile show their top card at normal size. On the live table the names appear as a pill **only on hover or keyboard focus**, and an empty pile shows its short name (Library, GY, Exile) faintly in its middle (2026-11-23).
- **Clicks:** graveyard and exile open/close the pile window. **The library click does nothing on solo** (it opens from its menu; log 2026-11-15); on the live table a click on your library opens it. The sideboard is a button in Settings.
- **Library menu:** Draw card; Draw X...; View library; View ▸ Top card, Top X cards..., Bottom card, Bottom X cards...; Shuffle (2+ cards; shuffle sound and riffle animation); Scry [n] and Surveil [n] (inline number boxes); Move top X cards ▸ Graveyard..., Exile..., Exile face down... (solo only); Reveal top X... (solo only; nobody else sees it, a "reveal to the table" is not built); Play with top revealed / Stop (solo only; page state, not stored).
- **Graveyard menu:** View graveyard; Exile all; Shuffle into library; Move all to ▸ Hand, Battlefield, Exile, Sideboard, Top of library, Bottom of library. **Exile menu:** the same without Exile all. **Sideboard menu:** View sideboard; Move all to ▸ ...
- **Pile window:** large pictures; title such as "Graveyard: 12 cards" or "Library: the top 3 of 60"; Top/Bottom/#n labels in the library; a search box (name start, name contains, type words, letters in order in the name); Type and Mana value (0 to 8+) checkbox filters with Reset; Graveyard/Exile tabs (only in those two windows); an **eye** that hides the window leaving a "Back to your graveyard" pill; Close, Escape or a click on the dim area closes it. Cards inside are selected by click and moved by their right-click menu; they cannot be dragged. Other players' graveyard and exile open read-only.
- **Order window** (`order-window.js`; used for putting several cards on top/bottom of the library): pictures side by side labelled Top/#n/Bottom; drag to reorder (others glide aside) or use ‹ ›; Random order, Done, Cancel; Escape cancels. It draws its own pictures (not the shared card buttons; a 2026-11-15 bug fix).
- **Scry / Surveil window** (`scry-window.js`): the top N cards with Top / Bottom (/ Graveyard for surveil) choices and ◀ ▶ arrows; Done applies (`shared/scry.mjs` refuses if the library's top changed: "Those are not the top cards of your library any more."), plays the shuffle sound and posts "Scried 3: 2 on top, 1 on the bottom." Risk [I]: it uses the shared card buttons and does not block game keys, so a draw (D) during a scry makes Done fail.

### 6.6 Command zone [V `command-zone.js`, `shared/commander-zone.mjs`]

- Two outlined slots with a gold, glowing frame. Commanders fill the slots in order; a commander can be dragged into either slot (slot choice is not saved). An empty slot keeps its outline ("X is on the battlefield.") so you can see where it returns.
- **Commander tax:** counted **by hand** (nothing counts a cast automatically). Solo: a number above each slot. Live table (2026-11-23): a gold bubble at the top right of the slot. Click adds a cast (+2 tax), right-click takes one back. Message "Atraxa: cast 2 times, tax +4." Other players see a gold `+N` bubble on your command zone (hidden at 0).
- Emblems sit in a row beside the slots with "2x" counts.
- The zone is hidden when there is no commander, no other card and no emblem (a Standard deck).
- **Which cards are commanders:** on solo, the command-zone cards at the deal (`game.cmd`). On the live table `cmd` is not stored; after a refresh it is rebuilt from the cards now in the command zone plus any card with a stored tax. Defect [I]: an emblem or any other card in the command zone then counts as a commander, and a commander out of the zone with no tax drops out (NEEDS INVESTIGATION).

### 6.7 Sideboard

Holds the sideboard and companion cards of an import. Opened from Settings (General on solo, Game on the table); cards move out via their menu. Not reachable from the hand menu.

### 6.8 The stack window (a visual aid) [V `stack-window.js`, `shared/stack.mjs`, `shared/stack-sync.mjs`]

- **Never changes the game.** "Add to the stack" (card menu; hand, battlefield, graveyard, exile, command) puts a **copy** of the card as it is now on top. Later changes to the real card do not touch the copy. (Adding from the hand on the live table reveals that card to everyone, by design.)
- Head buttons: Resolve top (removes the top card and any notes above it; the game is untouched), Undo (30 steps; per page), Add note, Clear (no confirmation; Undo restores). Hint: "Drag to reorder. Shift+drag a card to aim an arrow."
- Items: focusable; drag to reorder (mouse/pen, 6 px; others slide aside, everything glides home); right-click menu: Move up/down/to top/to bottom, Note below, Aim arrow... (cards), Remove arrows, Remove; keyboard Alt+Up/Down moves, Up/Down moves focus, Delete removes. Notes: up to 160 characters, saved on blur (one undo step), empty notes removed, Escape restores.
- **Arrows:** Shift+drag from a stack card, or "Aim arrow..." then a click, to another stack card or a real battlefield card (on the live table any player's card; the arrow stores the owner). Right-angle paths with rounded corners, a dot and an arrowhead, redrawn every frame while visible; hidden while the target is off screen; right-click an arrow to remove it. Limits: 40 items, 24 arrows.
- **Placement:** solo, a panel sliding out from a tab at the left edge. Live table, Grid view: **pinned open in a dock** (no tab, Escape does not close it); Sidebar view: the tab.
- **Live:** one shared stack per table (`tables/{code}/stack`), any member edits it, each change writes the whole stack, **last write wins**, Undo is per page.
- Classification: MUST PRESERVE (visual-aid stack with reorder, notes, arrows, undo, sharing); menu wording OPEN TO REDESIGN.

---

## 7. Battlefield and player management

### 7.1 Placement on arrival [V `zones.mjs`, `board-grid.mjs`]

- Blocks are 7 columns by 10 rows. **Lands** take the first free block from the **bottom-left**, row by row upward; **other cards** from the **top-left** downward. "Land" is judged on the face that shows.
- When every block is covered the card takes the last block in that order. **Nothing is ever refused and overlap is allowed.**
- A stored cell is never moved because of other cards. A card with no usable cell (an older game) is given one when the board is drawn (`settleBoard`, which returns the same object when nothing changes).
- `placeCard` moves a card to the end of the list (drawn on top) **only** if it now overlaps a later card; otherwise its list index is kept, so a live save is one small write. This is a cost property of the live sync: MUST PRESERVE.
- **Auto-arrange** (`arrangeBoard`: lands and others sorted by name, piles kept on one block) exists only as an unbound keybind on the live table. Its buttons were removed from both pages at the owner's request.

### 7.2 Life [V `life-control.js`, `shared/life-input.mjs`]

| Input | Result |
|---|---|
| Click the number | +1 (Shift +5) |
| Right-click the number | -1 (Shift -5) |
| Hold 600 ms | a ring (appears after 250 ms so a click never shows it) fills, then a box opens to type the total; Enter sets (whole numbers, ± one trillion, minus signs incl. U+2212), Escape or leaving cancels |
| Arrow keys on the number | Up/Right +1, Down/Left -1 (Shift 5); Enter or Space opens the box |
| − / + buttons | ±1 (Shift ±5) |

Life can go below 0; nothing happens at 0. Steps write no message except a typed total ("Life is N."). Solo: the life piece floats (drag "LIFE"; `overloaded.lifeBar`). Live table: in Grid view the life controls live in **your row of the Players panel**; in Sidebar view in your seat head. Classification: MUST PRESERVE.

### 7.3 Player counters and marks [V `shared/player-counters.mjs`, `counter-chips.js`, `counter-panel.js`]

- Kinds: **poison, energy, experience**, rad, ticket, speed, the Ring (counts) and **monarch, initiative, city's blessing** (on/off marks).
- **Live table: only poison, energy and experience** (`PUBLISHED_COUNTERS`): the published rules refuse other keys, and counters are written inside the main game save, so allowing others before a rules change would break every save.
- Solo: right-click the life area opens "Your counters" (each with Add 1, Add 5, Remove 1, Remove 5/Remove all; marks toggle); a **Counters** button opens "Add a counter" (one click adds 1).
- Live table: the arrow beside your life opens the **counter panel** (commander damage per other seat with that seat's commander name, then counters; − / count / +, Shift 5; stays open while numbers change; Escape, outside press or the arrow closes it).
- **Chips** show each non-zero counter or mark with an icon (our own inline SVGs) and number; written out in words for screen readers.
- **Lethal marks (never enforced):** poison 10, and 21 commander damage from **one** commander, show the count in red and the word "lethal" (never color alone).
- Owner decision not implemented [D log 252]: player counters should become only poison, energy, experience, rad and tickets, with monarch and similar marks turned into "Create Misc" battlefield objects (a crown with a gold glow).

### 7.4 Commander damage [V]

One number per source seat, stored on the **damaged** player's branch (`cd[seat]`). Commander tables show every seat that has a commander; other formats only seats with recorded damage. The counter panel never lists your own commander. Built so one player's damage can be shown in that player's panel later. Limit: two partner commanders of one seat share one number.

### 7.5 Players panel (live table, Grid view) [V `players-panel.js`]

One row per player in turn order starting from you: name, life, commander(s) with "(tax +N)", counter chips. The active player's row has a gold border. Your row holds your real life controls (moved there from your seat); while the panel is on the table, the life boxes in other players' seat heads are hidden. It shows **no** conceded or connection state. It is a dockable tool (§9.7).

### 7.6 Player identity and status

Identity is the anonymous Firebase uid of the browser; a different browser is a different person. Names 1 to 30 UTF-16 units, cleaned of invisible and direction characters. Seat numbers 1 to 4 are the key for turn order and commander damage. Status shown: host pill, Ready pill, presence pill (lobby); "their turn" gold border and the Players row (table); "(conceded)" only in a visually hidden list (gap, §17).

---

## 8. Gameplay flow and mechanics

### 8.1 Starting a game [V `zones.mjs` `makeGame`, `shared/deal-sequence.mjs`]

- Deck routing: commander section → command zone; main → library; sideboard and companion → sideboard. Each copy gets its own uid.
- **Life 40** when the command zone has a card, otherwise 20.
- The library is shuffled with a fair Fisher-Yates using `crypto.getRandomValues` (a statistical test checks fairness), then **7 cards are drawn**.
- The game is dealt and (live) saved at once; only the **display** is staged: one card every 120 ms with the draw sound, flying from the library and turning face up; after a shuffle sound there is an 800 ms pause first. Under reduced motion the hand shows at once with no card sounds.
- Solo message: "Dealt 7 cards. Your commander is in the command zone. Life is 40."

### 8.2 Mulligan [V]

The hand goes back, the library is shuffled, 7 are drawn, `mulligans` + 1. With motion: the hand gathers, flips to backs, flies into the library, the shuffle sound plays and the library riffles. **Nothing is bottomed automatically**: the player puts cards on the bottom by hand (no London-mulligan enforcement). The solo button shows "Mulligan (N so far)". A flag ignores a second click mid-animation. Stale message: "Put N cards on the bottom... with the card buttons" (there are no card buttons; it is the right-click menu).

### 8.3 Drawing [V]

Draw (button, D key, library menu) draws one; an empty library says "Your library is empty." (the game never ends on it). Draw X draws one at a time with a sound and flight each, pausing 140 ms per card for the first 10, then ×0.7 every 5 cards, at least 25 ms (none under reduced motion); a second Draw X while one runs is ignored.

### 8.4 Turns

- **Solo:** "Next turn" = turn + 1, clear sickness, untap all (except doesn't-untap cards), draw 1.
- **Live table** (§9.8): passing the turn only sets the table turn number and clears sickness for the player whose turn begins. **Players draw and untap themselves** (owner, 2026-11-06: "some turns have exceptions").
- **Summoning sickness** is a hybrid reminder: set automatically on a creature that enters without printed Haste (tokens always, since they have no keywords), cleared by a click on the badge or the menu, and cleared automatically when the owner's own turn starts. Haste granted by other cards is not seen.
- **Doesn't untap** is set only by hand.

### 8.5 Game phases, combat, priority, winning

**Not implemented** [V by absence]: there are no phases or steps, no combat system (attacking and blocking are done by moving or tapping cards), no priority, no rules checks, no automatic game end. Life at 0, 10 poison or 21 commander damage only show marks. The live table's match ends only when the host presses **End the match**; conceding marks a player but ends nothing.

### 8.6 Game history

- **Solo** (`history-bar.js`, `shared/game-history.mjs`): every successful action with a message, plus draws, Draw X, Next turn, Mulligan and New game, as "T{turn}" + text, at most 200 entries of 100 characters; cleared by New game. Life steps, hand reorders and stack adds are not recorded.
- **Live:** each player keeps their last 30 entries (`public/{uid}/log`), worded from **what changed**, never from the player's own status text, and never naming a card that moves between library and hand or into the library, scry order, mulligan cards or face-down cards (§9.10). Every page merges all players' entries.
- **Messages tab:** the lines that used to be the news line (what you did, hints, errors in red), at most 100, on your screen only. The news line itself is hidden during a game (owner's choice, log entries 266 and 269, made over the agent's warning that errors could go unseen).

### 8.7 Ownership and control

Each player only ever moves **their own** cards. There is no way to give a card to another player, control another player's card, or drop onto another player's board (live rules make every branch writable only by its owner). Stack arrows can point at any player's card.

### 8.8 Ending

- Solo: New game (native `confirm()`: "Start a new game? This one will be lost.") or closing the page.
- Live: End the match (host), which returns everyone to the lobby with a new match number; the next Start deals new games.

---

## 9. Multiplayer and lobby systems

### 9.1 Identity and sign-in [V `frontend/src/db.js`]

- **Anonymous Firebase sign-in**, lazy (on the first database call; no account is made on page load). All callers share one sign-in promise (three simultaneous calls once made three accounts).
- **One account per browser:** stored by Firebase (IndexedDB, then localStorage, then memory). Tabs coordinate through a Web Lock `overloaded-sign-in`: a tab that waited polls up to 3 s for the first tab's account. With storage blocked a refresh makes a new account.
- No accounts, no email, no lobby browsing: you can only reach a table by its code or link. Classification: MUST PRESERVE (every rule keys off `auth.uid`).
- Risk [I]: two **table** tabs of the same player hold separate in-memory games and can overwrite each other's zones.

### 9.2 Creating a table [V `lobby.js`, `table-ops.mjs createTable`]

- Validates the name (§7.6) and format before any request. One atomic write creates `meta {host, createdAt, seats, format, status: 'lobby', idleLimit: 30 min, match: 1}`, `activity/lastActive`, your member entry in seat 1, `seats/1`, and your **host slot** `hosts/{uid}: code`.
- Code: 6 characters from a 32-character alphabet with no look-alikes (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`), from secure randomness. Up to 5 codes are tried; a code held by an **expired** table is reclaimed (`closeIfExpired`).
- **One table per host:** if you already host a live table, a native `confirm()` warns "You already have a table (code X, N at it). Making a new one closes it. Continue?" (a placeholder for a designed popup). An expired old table is replaced silently.
- The address becomes `/lobby/CODE` (history push; Back reloads). `overloaded.lastTableInfo` remembers seats and format for remaking a closed table.

### 9.3 Joining [V]

- By code on the home screen, or by opening `/lobby/CODE`. `joinTable` returns you to your seat if you are already a member; otherwise claims the first free seat in one write with your member entry (a taken seat refuses the whole write); otherwise reclaims a seat you still hold (the **reserved seat of a mid-match leaver**).
- **Auto-join:** a visitor with a saved name (`overloaded.name`) who opens a link is seated without a click (owner's choice over a one-button join, 2026-10-30). Without a saved name: "Type your name to join table X."
- A former **host** whose table closed and who opens its link gets a **new table with the same seats and format** automatically ("Your old table closed. This is a new one."); others are sent home with "That table has closed."
- Failure: "Could not join that table. It may not exist, may be full, may have started, or may have closed."
- Mid-match, strangers cannot join; the holder of a reserved seat rejoins and is sent to `/table/CODE`.

### 9.4 The lobby room [V `lobby.js`, `lobby/index.html`]

- **Header:** table code and invite link, each with Copy (falls back to selecting the text and "Press Ctrl+C"). Host-only switches: **Format** (Commander/Standard), **View** (Grid/Sidebar, stored as `meta/view`), **Bracket limit** (Any, 1 to 5; Commander only; only warns "Over limit" beside a name).
- **Seat cards** (fixed size, in seat order): the commander's art behind the card (looked up by name in the card list, fetched only when needed), "Seat N", Host pill, name (with a pencil to rename your own, lobby only), commander text or "No deck yet", bracket pill (with "guessed"), Ready pill, presence pill ("Reconnecting..." pulses, stops under reduced motion; "Disconnected, last seen N min ago"). Empty seats say "Empty seat" (and offer "Add bot" to the host).
- **Your deck:** tiles of your saved decks of the table's format, a search box, an "Import a deck" tile, a "Selected" tick. Choosing a deck sends **only the commander names, bracket and guess flag** (`setDeck`); the list never leaves the browser and nobody sees inside anyone's deck. Changing the deck clears your Ready ("Not ready: press Ready again."); sending the same deck writes nothing. Remembered per table in `overloaded.tableDeck` and re-sent after a refresh.
- **Import overlay:** the same importer as `/deck`, in its own layer (not a native dialog, so its menus stay on top), starting on the paste box with the table's format; Done brings the newest deck of that format.
- **Format switch by the host:** every open lobby page clears its own deck and Ready if the deck no longer fits. Edge [I]: a member with no open lobby page keeps a stale mark.
- **Ready:** toggles. With no deck it first waits for the remembered deck, then opens a "Choose a deck" dialog, or the importer if you have none of that format.
- **Start** (host only): enabled with at least 2 members, all ready ("N of M players are ready..."). Writes `status: 'playing'` and a 60-minute idle limit; every lobby page goes to `/table/CODE`.
- **Leave:** `confirm()` then: last member deletes the table; in the lobby your seat is freed; mid-match your seat stays reserved; a leaving host hands the table to the lowest-seat member who hosts nothing else.
- **Take over as host:** shown to members when the host has had no open tab for 5+ minutes (server time); one write moves `meta/host` and claims your host slot. **Only on the lobby page**, so a host who vanishes mid-match cannot be replaced (§17).

### 9.5 Test bots [V `lobby.js addBot/removeBot/adoptBots/readyBots`, `db.js botClient`]

The host sees **Add bot** on each empty seat. A bot is a separate anonymous account (its own Firebase app per seat, persisted in this browser) that joins that seat as "Bot N", keeps presence from the host's lobby page and readies up for each match. **Remove bot** frees the seat. Bots have no deck, no game and no turns: on the table page a player with no game for the current match is drawn as a **blank game** (starting life, empty grid, empty piles, "Hand 0", `data-blank`); nothing is written for them; turns passed to a bot must be skipped by a human. Purpose: "so one person can try a full table" (owner, 2026-11-13). Concerns [I]: shown to every host in production; a leaving host can hand the table to a bot; bots linger after the host leaves. Classification: NEEDS INVESTIGATION (keep the tool; decide its exposure).

### 9.6 Entering the table [V `table.js start/beginGame`]

- Checks the address and membership ("You are not at this table, or it has closed."). Starts keep-alive, presence and watchers for meta, members, everyone's public branch, the stack, presence, the server clock and your connection.
- Loads the card list (failure blocks the game with Try again), then your saved game. **If the stored game's match number equals the table's, it is restored** ("Back at your game."); otherwise a new game is dealt from the deck remembered for this table (or the selected/first deck of the table's format). No deck of that format in this browser: a message, an Import link and Try again. The first save of a match writes the whole game, the match number and clears the old history.
- When `status` returns to `lobby` (the host ended the match), every table page goes back to `/lobby/CODE`. If the table is deleted: "This table has closed." (the game stays on screen; saves fail).

### 9.7 Seats layout, views, docks [V `table.js layoutSeats`, `style.css` Seats blocks, `tool-dock.js`]

- **Every seat is a small solo table:** a head (name; life in Sidebar view), the battlefield (flush with the seat border on three sides, full width), the hand (yours a fan; others' a fan of up to 12 card backs with "Hand N"), and one row of piles at the bottom right (Library, GY, Exile, CMD). Whose turn it is shows as a gold seat border.
- **Grid view** (host's choice): other players ordered clockwise from you. 2 seats: the other above you. 3 seats: two on top, you centred below. 4 seats: 2 by 2 with you bottom left. The layout follows the number of members present (a 4-seat table with 2 players uses the 2-seat layout).
- **Sidebar view:** one seat large, every player as a live scaled copy in a right column (name, ♥ life); click a copy to show that seat large; your hand stays along the bottom (moved into the large seat). Boards are always upright in Sidebar view.
- **Facing:** other players' boards are turned 180° to face you in Grid view by default; Settings offers Upright (`overloaded.facing`).
- **Tool docks (Grid view only):** the Players panel, Stack, Game history and Action bar sit in docks, stacked top to bottom, the stack taking the leftover height. 2 and 4 seats: one 16 rem column on the left (seats move right). 3 seats: the two empty spaces beside your seat (default: Stack then Action bar on the left; Players then History on the right). Drag a tool by its grip out of a dock to float it; over a dock a line shows where it would go; drop to dock. Docks are drawn under floating tools so a grip is never covered. In Sidebar view there are no docks; tools float and the stack has its tab. **Defect [V]:** the dock arrangement is meant to be kept in `overloaded.toolDocks` but `tool-dock.js` passes an object to a string store, so it is never kept across reloads or layout changes (§17).
- **Players panel:** §7.5.
- Card corner (`spotlight.js`) shows only pinged cards.

### 9.8 Turns on the live table [V `shared/turn-order.mjs`, `table.js`]

- **No shared turn field.** A pass is one record on the **passer's own** public branch: `pass {n, to, from?, at}` (n the new table turn, to the seat, from the turn it replaced, at the server time). The record with the largest n across this match's branches is the current turn (a tie goes to the larger uid). With no pass, turn 1 belongs to the lowest seat.
- **Next turn** button on your turn; otherwise it reads "Skip Bob's turn" and asks with `confirm()` ("Use this when that player has left the table or cannot play."). Conceded players and non-members are skipped. Messages "Passed the turn to X." / "Skipped X's turn."
- **Revert pass** (only for the writer of the newest record): restores the previous turn. Limits [I]: one remembered level per record; it does not undo the receiver's turn start.
- **Your turn begins** once (a refresh never starts it twice): the turn number is set, your sickness marks clear, the "yourturn" sound plays (the browser may block it until the page was clicked), the page title becomes "Your turn - ...", and "Draw and untap when you are ready." No automatic draw or untap.
- **Turn clock:** "0:09" style, counting up from each pass's server time (or from when the page first saw the turn); a personal Settings option, on by default (`overloaded.turnClock`).

### 9.9 Ping [V `shared/ping.mjs`, `spotlight.js`]

"Ping card" on a card in a public zone (never hand or library) writes `ping {k, card}` on your own branch. Other pages show a ping whose k is new for that player (the first snapshot after a load is only remembered, so an old ping never replays): the card corner shows "Seat N: Name pinged X." with the picture and marks and a Close button, and the card glows on every screen for 4 s. Pings closer than 700 ms are ignored. Leak [V]: pinging a face-down card shows its real face. Possible bug [I]: the ping is not cleared at a new match and may pop up again.

### 9.10 Shared game history [V `shared/live-history.mjs`]

After each successful move the page describes the **change** (not its own message) and stores it in one of 30 slots of `public/{uid}/log`. Names cards entering or leaving public zones face up, taps, turning over, face up/down, counter changes, life ("went from A to B life"), player counters, commander damage, passes. **Never reveals:** cards drawn or moved between library and hand ("drew N cards"), cards put into the library from hand, shuffles and scry order, face-down cards, mulligan cards. Not logged: grid moves, hand order, pings, the stack. Every page merges everyone's entries ("You ... your" / "Name ... their"). Classification: the no-leak rule MUST PRESERVE.

### 9.11 Shared stack

See §6.8 (one stack per table, whole-stack writes, last write wins, writable only while the match is on and only with the current match number).

### 9.12 Concede, End the match, Leave (Settings > Game > Match) [V]

- **Concede:** `confirm()`, then `conceded = match number`; locked for the match; your turns are skipped; nothing else changes (you can keep moving cards). Others see it only in a visually hidden list. Leaving and returning clears it [D].
- **End the match** (host): `status: lobby`, idle limit 30 min, `match + 1`; seats held by people who left are freed; everyone returns to the lobby; old ready and conceded marks stop counting; deck fields stay.
- **Leave:** mid-match your seat is kept until the match ends; you return by joining with the code from the same browser.

### 9.13 Presence, activity and table lifetime [V `presence.mjs`, `heartbeat.mjs`, `table-limits.mjs`, `keep-alive.js`, `banner.js`]

- **Presence:** each open tab registers a server-side removal and last-seen write first, then a tab note; again after every reconnect. States: connected (any tab), reconnecting (last seen under 2 min: "Reconnecting..."), disconnected ("Disconnected, last seen N min ago"), unknown. Your own: "You're offline, reconnecting...". **On the table page other players' presence is only in a visually hidden list** (the decided "Reconnecting..." on avatar and board is not visible during a game; §17).
- **Heartbeat:** a pointer press, key, input or touch in a **visible** tab marks activity; at most one write per minute per page (`activity/lastActive`, server time; the rules require 30 s between beats table-wide). Game writes do not count as activity.
- **Lifetime, judged on server time:** closes after **30 min idle in the lobby, 60 min idle while playing**, and never lives past **8 hours** from creation.
- **Banners:** a quiet banner in the last 5 idle minutes ("Nobody has done anything for a while. This table closes in N minutes unless someone does something."); banners 30 and 10 minutes before the 8-hour limit ("...closes at 3:42 PM, in N minutes. The limit cannot be extended."); closed messages ("This table was idle for too long and has closed." / "...reached its 8-hour limit..."). No popups. Nothing is judged until the server clock offset is known.
- **Expired tables are deleted by whoever finds them** (a stranger opening the link, a new table drawing the same code, a host's reopen); a table nobody opens again stays in the database (a scheduled job would need paid features or an admin key).

### 9.14 Errors [V `shared/friendly-error.mjs`, `permission-error.mjs`]

Permission refusals: "The server refused that. If it keeps happening, the table may have closed." Offline: "Can't reach the server. Check your internet connection and try again." Sign-in: "Could not sign in. Please try again in a moment." Other Firebase errors: a generic sentence. The page's own refusals pass through in words. SDK errors are never shown raw. **Save failures** appear only in `#save-state` inside Settings > Game, so they are invisible during play (§17).

### 9.15 Refresh, disconnect, reconnect [V, I]

- Lobby refresh: you are put back, the remembered deck is re-sent (no write if unchanged), bots are re-adopted.
- Table refresh: the game for this match number is restored. Lost: dealing animation state, peeks, command-slot choice, pins, top-revealed, selection, stack Undo, **foil** (not stored live). Pings are remembered, not replayed.
- Disconnect: Firebase queues writes; saves wait and are sent on reconnect. If the table expired meanwhile, the queued writes are refused and only the hidden save state says so.

---

## 10. Quality-of-life features

Every convenience found, with where it lives. All verified unless marked.

| Convenience | Behavior | Where |
|---|---|---|
| Optional counts in decklists | A line with no number is one card; the page says which lines were assumed | `deck-text.mjs` |
| Alternate printed titles match | Secret Lair / Universes Beyond titles find the real card, shown "(typed as ...)" | `card-match.mjs` |
| Autosave | No Save button; every change is saved; unique names | `deck-importer.js` |
| Sample deck | One click to a playable Commander deck; `/deck?sample&play` straight to the table | `sample-decks.mjs` |
| Commander guess with certainty note | The page says how the commander was guessed | `deck-preview.mjs` |
| Bracket auto-guess and info panel | Bracket from Game Changers, with the list shown | `deck-bracket.mjs` |
| Ctrl+Enter to check a list | | `deck-importer.js` |
| Deck search in the lobby | Every word must be in the name or commanders | `lobby-deck.mjs` |
| Auto-join by link | Saved name seats you without a click | `lobby.js` |
| Remake a closed table | The host's old link makes a new table with the same settings | `lobby.js reopenMyTable` |
| Copy code / Copy link | With a select-and-Ctrl+C fallback | `lobby.js` |
| Ready opens the deck chooser | Ready with no deck opens a dialog or the importer | `lobby.js` |
| Dealing one card at a time | With sound; instant under reduced motion | `deal-sequence.mjs` |
| Draw X pacing | Fast but countable | `draw-pace.mjs` |
| Double-click tap | Page-counted, reliable for fast clicking | `solo.js`, `table.js` |
| Tap/flip key on the hovered card | E/Q tap, F flip, no selection needed | keybinds |
| Rectangle multi-select | E/Q/F act on the group; drag moves the group | `board-drag.js` |
| Shift-pick hand cards | Group menu for several hand cards | `group-menu.mjs` |
| Same-name piles | Copies stack automatically; tapped copies step aside and rejoin | `stacks.mjs`, `zones.mjs` |
| Hold to carry a pile | 250 ms hold ring or Shift | `board-drag.js` |
| Snap to piles | A drop within 6 cells joins a matching pile | `stacks.mjs` |
| Axis lock while dragging | Shift holds a row or column | `board-drag.js` |
| Alt+Arrow nudge | One cell at a time | page handlers |
| Hand resting / raising | More board visible; the hand rises on approach | `hand-view.js` |
| Hover lift copy | Read a hand card without shuffling the fan | `hand-view.js` |
| Hand sorting with pins | Sorted view, Auto mode, manual placement sticks | `hand-sort.mjs` |
| Settings pill rows | Drag to set type, color and land orders | `hand-sort-ui.js` |
| Alt big picture with zoom and turn | Read any card; wheel sizes; Q/E turn | `card-hover.js` |
| Mana cost on hover only | Less clutter in the hand | CSS |
| Pile names on hover (live) | Piles sit level; empty piles name themselves faintly | CSS 2026-11-23 |
| Pile window search and filters | Name, letters in order, type words; Type and Mana value filters | `card-search.mjs`, `pile-filter.mjs` |
| Pile window eye | Hide the window to look at the board, a pill brings it back | `pile-viewer.js` |
| Remembered numbers | Number boxes start with the last value; menu scry/surveil numbers remembered per line | `number-box.js`, `card-menu.js` |
| Click-to-adjust marks | Click a counter chip or P/T: +1, right-click -1, Shift 10 | `marks.mjs` |
| Life by click, right-click, Shift, hold-to-type | | `life-control.js` |
| Counter chips with icons and lethal words | | `counter-chips.js` |
| Commander tax bubbles | Click / right-click | `command-zone.js` |
| Token picker with your deck's tokens first | | `card-tokens.mjs` |
| Create copy of the face that shows | | `zones.mjs copyAsToken` |
| Order window with Random order | For putting several cards on top/bottom | `order-window.js` |
| Scry/Surveil window | | `scry-window.js` |
| Untap all respects "Doesn't untap" | and says how many were held back | `zones.mjs` |
| Summoning sickness auto-mark, auto-clear | | `zones.mjs` |
| Floating, snapping tools | Action bar, life, history; edge hints; arrow keys and Home on grips; positions remembered per page | `floating-bar.js` |
| Tool docks with drag-in/drag-out | (layout not persisted: defect) | `tool-dock.js` |
| Players panel | Everyone's life, commanders, tax and counters in one place | `players-panel.js` |
| Rebindable keys | Actions with two slots, swap with confirmation, hold-to-reset | `keybinds.mjs`, `keybind-settings.js` |
| Game history with Messages tab | Errors in red | `history-bar.js` |
| Stack window with arrows and notes | | `stack-window.js` |
| Turn clock | | `turn-clock.js` |
| Ping a card | | `ping.mjs`, `spotlight.js` |
| Sounds at one quiet level | Per-file gains; only your own actions | `sound-settings.mjs` |
| Card picture fallbacks | Default printing, then the name | `card-nodes.js` |
| Storage never throws | Pages work with storage blocked | `safe-store.js` |
| Confirm before destructive actions | `askConfirm` for deck delete and keybind swap; native `confirm()` elsewhere | `confirm-box.js` |
| Background activity detection | No "are you still there?" popups | `keep-alive.js` |

**Undo:** only the stack window has Undo. There is no undo for game moves (owner question left open in `docs/menus.md`).

---

## 11. Interaction patterns and edge cases

### 11.1 Conventions that apply everywhere [V]

- **Right-click is the main action surface.** Cards, piles, the hand bar, the life area, empty battlefield, empty command zone, stack items and stack arrows all have menus. There are no per-card buttons (the selected-card panel was removed in log entry 118).
- **Click +1, right-click -1, Shift ×5 (life) or ×10 (marks)** is the universal number gesture.
- **Hold to confirm or set:** hold life 600 ms to type it; hold a pile 250 ms to carry it; hold keybind resets 2 s.
- **Escape** cancels the innermost thing (drag, menu, window, selection).
- **Short UI text:** labels, hints and messages are a few words (owner rule 2026-11-18).
- **Reduced motion:** every animation has an instant path (hard rule).
- **Other people's text** (names, card names from the database) is always inserted as text, never markup.

### 11.2 Detailed interactions

| # | Action | Response and feedback | State change | Multiplayer | Edge cases / failure |
|---|---|---|---|---|---|
| 1 | Drag a hand card onto the battlefield | lag-and-lean picture, release: card appears on the cell (snapped to a pile within 6 cells), "Played X." | `moveCard(hand→battlefield, {cell})`, sick if creature | partial zone writes (≤4 changed places) or whole zone; history "played X" | tapped card can't start in last 10 columns; a token can't be in the hand |
| 2 | Drag a battlefield card | exact-follow picture; release moves by cells travelled | `placeCard`; list order kept unless it now overlaps a later card | usually one small write | may snap onto another pile; overlap allowed |
| 3 | Hold a pile 250 ms then drag | ring fills; picture shows copies and count | `placeStack` | one write per card moved | onto a library/graveyard/exile pile: **only the top card moves** (defect) |
| 4 | Tap a card in a pile | card steps out to the right (or joins a tapped pile within reach) | `setTapped` + `regroupAfterTap` | cell and tapped written; history "tapped X" | left edge: the tapped stack shifts instead |
| 5 | Untap all | tap sound; message counts held cards | `untapAll` card by card, rejoining piles | many writes | doesn't-untap cards stay tapped |
| 6 | Move a battlefield card with counters to the hand | counters, marks, cell cleared; untapped | `moveCard` | public zone loses it; history "returned X to their hand" (named because it left a public zone) | a token vanishes instead |
| 7 | Rectangle-pick then E | all picked cards set to the opposite of the first | many `setTapped` | many writes | picks cleared if a card leaves the battlefield |
| 8 | Shift-pick hand cards, right-click, Move to top of library... | order window opens; Done | cards moved in chosen order (first = top) | private writes; history "put 3 cards from their hand into their library" (unnamed) | Cancel changes nothing; throws in words if a card left the hand |
| 9 | Scry 3 | window with top 3, choices; Done | `applyScry` | private write; history "rearranged their library" | if the library top changed (e.g. a D key draw behind the window) Done fails |
| 10 | Play a modal card's back from the graveyard | card enters turned over | `moveCard` → `turnOver` → `markSickByFace` | `bk` stored | cell chosen from the front face (defect for spell//land) |
| 11 | Hold life 600 ms | ring, then input box; Enter sets | `adjustLife` | `life` write; history "went from A to B life" | invalid text: "Type a whole number..." |
| 12 | Pass the turn when it is not yours | `confirm()` "Skip X?"; then "Skipped X's turn." | own `pass` record | the skipped player's turn ends for everyone | revert restores only one level |
| 13 | Ping a face-down card | spotlight on every screen | `ping` record | **reveals the real card** (leak) | |
| 14 | Refresh mid-match | game restored for this match number | `joinGame` | none | foil marks lost; commander list rebuilt from the command zone (emblems may count, defect) |
| 15 | Host leaves mid-match | seat reserved; table goes to lowest-seat member | `meta/host` | everyone continues | new host gets no host slot (`claimHostSlot` never called); may be a bot |
| 16 | Host disappears mid-match (closes the laptop) | nothing; nobody can End the match | none | table ends only by idle expiry (1 h) or the 8-hour limit | takeover exists only in the lobby |
| 17 | Format switched by the host in the lobby | each open page clears its own non-fitting deck and Ready | `setDeck({})`, `clearReady` | | a member with no open page keeps a stale mark |
| 18 | Drop a card on the command slot that already holds the other commander | swaps slot ("Put X in command zone slot 2.") | page-only `commandSlots` | not stored | lost on refresh |
| 19 | Drop a battlefield token on the hand | token vanishes | `moveCard` | | message wrongly says "back to your hand" |
| 20 | Draw with an empty library | "Your library is empty." | none | | the game never ends |

### 11.3 Edge cases worth keeping in mind [V unless marked]

- A game card the card list does not know still plays, with an empty type (placed with non-lands).
- Card ids from Scryfall's default printings change often (162 in 3 days); saved cards are looked up by id, then by name.
- On the live table type, cost and keywords are never stored: each page looks them up in its own card list, so a page with an older list can see slightly different data.
- A stored battlefield cell beyond the viewer's board is drawn at the edge, not moved.
- Commander tax over 99 casts is refused on the live table (rules cap 99, memory allows more).
- Moving the 251st card onto a live battlefield would be refused by the rules (no client cap on moves) [I].
- New game on solo does not clear Shift-picks or hand pins; uids restart at c1, so they may attach to different cards [I].
- Alt+Left with no battlefield card selected may navigate Back and lose an unsaved solo game [I].
- `deal()` on solo does not clear the stack window (by design it is only a visual aid; not stated).

---

## 12. Data structures and state management

### 12.1 Browser storage (`localStorage`, all through `safe-store.js`) [V]

| Key | Page(s) | Meaning |
|---|---|---|
| `overloaded.decks` | deck, lobby, solo, table | Deck library v1: `{version, selected, decks[{id, format, bracket?, bracketGuess?, deck}]}` |
| `overloaded.deck` | (legacy) | Old single deck; migrated once, removed on first write |
| `overloaded.storage-probe` | deck | Storage availability check |
| `overloaded.deckView`, `deckSort`, `deckSortDirection`, `deckGrouping` | deck, lobby import | Deck view choices |
| `overloaded.name` | lobby | Saved player name |
| `overloaded.lastTable` | lobby, header | Last table code (Lobby link) |
| `overloaded.lastTableInfo` | lobby | `{code, seats, format, host}` to remake a closed table |
| `overloaded.tableDeck` | lobby, table | `{code, id}` deck brought to a table |
| `overloaded.keybinds` | solo, table | `{version: 1, binds}` |
| `overloaded.sound` | solo, table | `{on, volume}` (default on, 100%) |
| `overloaded.handRest` | solo, table | Resting hand share, 20 to 100 (default 50) |
| `overloaded.pileStyle`, `tappedPileStyle` | solo, table | Pile drawing styles (default diagonal) |
| `overloaded.facing` | table | turned / upright |
| `overloaded.turnClock` | table | "1"/"0" |
| `overloaded.hoverScale` | solo, table | Alt picture size 0.5 to 2 |
| `overloaded.actionBar`, `lifeBar`, `historyBar` | solo | Floating positions `{dock, fx, fy}` |
| `overloaded.seatsBar4`, `seatsHistoryBar`, `playersBar` | table | Floating positions |
| `overloaded.historyOpen`, `historyTab` | **shared by solo and table** | History window open state and tab |
| `overloaded.toolDocks` | table | Dock layout per mode, `{column, split}` with `float` lists. **Stored as "[object Object]" (defect)** |
| `overloaded.handSort`, `handSortOn`, `handTypeOrder`, `handColorOrder`, `handLandOrder` | solo, table | Hand sorting |
| `overloaded.lastNumber`, `menuNumbers` | solo, table | Remembered numbers |
| (orphans, no longer read) `overloaded.seatsLife`, `seatsBar`, `seatsBar2`, `seatsBar3`, `seatsView` | | Left behind by earlier versions; nothing removes them |

Firebase sign-in uses IndexedDB, not these keys.

### 12.2 Saved deck (v1) [V `shared/deck-preview.mjs readSavedDeck`]

`{version: 1, name (1 to 60 code points), savedAt (ISO), commander: [id ≤ 2], cards: [{i, n, qty 1–200, section 'commander'|'companion'|'main'|'sideboard', p?, foil?: true, look?}], skipped, text (≤ 100,000)}`. At most 200 cards; no duplicate (section, i, p, foil, look). Unlabeled cards save as main; the maybeboard is not saved. The reader is strict and returns a clean copy or refuses. MUST PRESERVE (users' stored data).

### 12.3 Card list entry (`/data/cards.json`) [V]

`{n, t, m, k: [keywords], i, pt?, ci?, gc?: 1, b?: 1, bpt?, md?: 1, f?: [titles], fp?: [printing ids]}` sorted by name, then id (byte-stable). About 34,000 cards. Side files: `/data/printings/set-CODE.json` (`{number: id + 4-hex card key + optional foil suffix}`), `/data/prints/XX.json` + `sets.json` (printing picker), `/data/rules/XX.json`, `/data/rulings/XX.json`, `/data/tokens.json`, `/data/cards.info.json` (build record).

### 12.4 Game state

In memory (§5.1 card fields; game: `zones`, `life`, `turn`, `mulligans`, `nextUid`, `cmd`, `tax`, `pc`, `cd`, `pass`). Every function returns a new game (immutable updates). Page-only state not in the game: selection, picks, pins, sorts, peeks, top-revealed, command-slot choice, stack window, history, dealer state, drag state.

### 12.5 Database (Firebase Realtime Database) [V `backend/database.rules.json`]

Root read/write is false. "Alive" = created less than 8 h ago and last active within the idle limit.

| Path | Shape | Read | Write |
|---|---|---|---|
| `hosts/{uid}` | table code | owner | owner; set only if that table's host is you and any previous slot's table is gone |
| `tables/{code}` (whole) | | nobody | delete: host; a member when every seat is empty, theirs or a non-member's; anyone once expired |
| `.../meta` | `{host, createdAt, seats 2–4, status lobby/playing, idleLimit 30/60 min matching status, format, match, bracketLimit?, view?}` | members | create with your host slot; host on a live table; takeover by a member when the host has no tabs and last seen ≥ 5 min. createdAt and seats immutable; playing → lobby needs match + 1 |
| `.../activity/lastActive` | server time | members | members, ≥ 30 s after the previous value |
| `.../seats/{1-4}` | uid | members | claim only with your member entry for that seat, one seat each; release your own (lobby) or the host frees a non-member's (lobby) |
| `.../members/{uid}` | `{name 1–30, seat, ready? = match, conceded? = match, commander? ≤ 220, bracket? 1–5, bracketGuess?}` | members | owner; a deck change cannot leave ready set; concede locked while playing |
| `.../public/{uid}` | `life, turn, mulligans, next, match (= meta.match), counts{library, hand, sideboard}, pc{poison, energy, experience}, tax{cN: 1–99}, cd{1–4}, pass{n, to, from?, at}, log{0–29}, battlefield/graveyard/exile/command (keys 0–249), ping{k, card}` | members | owner, member, alive |
| `.../private/{uid}` | `library, hand, sideboard` (keys 0–249) | **owner only** | owner, member, alive |
| `.../presence/{uid}/tabs/{tabId}` | true | members | owner while a member |
| `.../presence/{uid}/lastSeen` | server time | members | owner; never deleted |
| `.../stack` | `{next, by = you, m = match, items (≤ 40), arrows (≤ 24)}` | members | member, alive, status playing |

**Stored card shape:** `{u, i, p?, n, x?(tapped), e?(turn entered), tok?, tt?, pt?, cl?, em?, ct?{p,m,l,c,t,o}, mp?, mt?, f?(face down), bk?(turned), sk?(sick), nu?(no untap), nt?, px?, py?}`; `i` and `p` must be lowercase Scryfall ids. **Not stored:** type, cost, keywords (looked up per page), foil, look, `xd`, named counters, `cmd`. Every unknown key is refused (`$other: false`), so **any new stored field needs a rules change published first**, or the whole save of a move fails.

---

## 13. Backend and synchronization behavior

### 13.1 Model

No server. Each player's page is the only writer of that player's branches. Every page watches every public branch and the shared paths. Hidden zones are protected by read rules, not by trust.

### 13.2 Writing a move [V `shared/game-sync.mjs gameWrites`, `table.js sync`]

- After every move the page diffs the new game against the last saved one and sends **only the changed pieces** in one atomic multi-path `update()`: small fields (`life`, `turn`, `mulligans`, `next`, each hidden-zone count) separately; `pc`, `cd`, `pass` whole; a zone with the same length and at most 4 changed places is written place by place (a drop is about 180 bytes), otherwise whole; an empty zone is null.
- Saves are serialized on one promise chain; each sends the newest game; a failed save is retried with the next move (the diff is always against what is saved).
- A new pass is stamped with the server time placeholder.
- The page refuses (client side) to write outside your own branches.
- **Commander tax** is a separate write after the move's save, so a database whose rules do not know it refuses only that write (one message, then silent retries).
- **History** entries are written after the save on the same chain; failures are ignored.

### 13.3 Reading others [V `readPublic`, `readCards`, `unpackCard`]

Untrusted input: exact shapes only, Scryfall-id pattern, at most 250 cards per zone, stored "turned" ignored for cards without a back, names inserted as text. A branch from an older match number is ignored (drawn as a blank game).

### 13.4 Conflict handling

- Per-player data: one writer, no conflicts (two tabs of one player excepted).
- Turn order: newest pass record wins; ties by uid.
- Shared stack: last write wins; no transactions [I: simultaneous edits can clobber].
- Seats: create-only slots in atomic writes (rules cannot count members).

### 13.5 Time

Server time (`.info/serverTimeOffset`) judges banners, presence, takeover and the turn clock; server timestamps are written for `createdAt`, `lastActive`, `lastSeen`, `pass.at`, `log.at`.

### 13.6 Card data pipeline [V `scripts/lib/card-list-build.mjs`]

- `npm run build` runs the card step and then Vite. A cached list under 7 days old and of the current `LIST_FORMAT` (14) is reused with **no requests**. Otherwise one request to Scryfall's bulk-data index and three downloads (oracle cards, default cards, rulings; about 100 MB; size-checked; required User-Agent and Accept), two attempts. Every output is validated (at least 30,000 cards, not 5% smaller than the last list, Sol Ring, Lightning Bolt, Island and Delver present, sorted, ids valid) before replacing the cache. On failure the last good list up to 30 days old is used with a loud warning; with none, the build fails and Vercel keeps serving the previous deploy.
- Preview builds reuse any same-format cache. `CARD_LIST_NO_DOWNLOAD=1` never touches the network; `SKIP_CARD_LIST=1` ships without a list (emergency switch). `/data/cards.info.json` records what the build did.
- **No Scryfall API call is ever made from a page**; only pictures and symbol SVGs are loaded from Scryfall's CDNs. MUST PRESERVE (cost and policy).

### 13.7 Security headers [V `vercel.json`]

Strict Content-Security-Policy (`default-src 'self'`; scripts self and Firebase; no inline scripts or styles; images self, data and the three Scryfall hosts; connections only to Firebase), `X-Frame-Options: DENY`, `nosniff`, `strict-origin-when-cross-origin` (needed because the API key is referrer-restricted), Permissions-Policy denying camera, microphone, geolocation, payment, USB; year-long immutable caching for `/assets/`. The Firebase web key is restricted to the live site, the development preview and localhost/127.0.0.1 port 5173 [D entry 251].

---

## 14. Product behavior versus implementation versus presentation

The redesign should keep the left column, may replace the middle column, and may freely change the right column.

| Area | Product behavior (keep) | Implementation (may change) | Presentation (open) |
|---|---|---|---|
| Deck import | Paste text from deck sites; optional counts; headers; set/number; `*F*`/`*E*`; alternate titles; problems shown with choices; no external API calls | Regex parser, name index maps, per-set JSON files with name keys | Three screens, the card display, tiles |
| Saved decks | Up to 20 per browser, autosaved, unique names, safe on damaged or blocked storage, confirm before delete | `overloaded.decks` v1 JSON | Deck cards with art and tint |
| Card data | One static list rebuilt at most weekly from Scryfall bulk data, byte-stable, fallback to last good | Vercel build step, `.vercel/cache`, `LIST_FORMAT` | `/data/cards.info.json` |
| Casual play | Nothing is refused by game rules; reminders only | Pure functions in `shared/zones.mjs` returning new games | |
| Zones | Seven zones; index 0 is top; default positions; tokens vanish off the battlefield; battlefield state cleared on leave | `moveCard`, `BATTLEFIELD_STATE` | Pile stacks, names on hover |
| Battlefield | A grid of square cells; cards 7x10; lands placed from bottom-left, others top-left; overlap allowed; nothing refused; stored cells never moved by others | `board-grid.mjs` mutable sizes, `setBoardSize` multiple-of-10 rule | Cell lines, outlines, flush edges |
| Same-name piles | Same name + same state on one cell form a pile; tapped copies step aside and rejoin; whole pile carried by hold or Shift | `stackKey`, `snapToStack`, `regroupAfterTap` | 3 drawn copies, offsets, dashed border, count badge, pile styles |
| Card states | Tapped, face down, turned over, counters (+1/+1 and -1/-1 cancel), P/T change, sick, doesn't untap, token, emblem, foil from the deck | Card object fields, stored short keys | Badges, chips, P/T box colors, foil sheen, tap symbol |
| Reading cards | Hold Alt for a big picture; resize and turn it | `card-hover.js` | Placement, frame |
| Menus | Right-click menus are the action surface; the item sets per zone (§5.9, §6.5) | `card-menu.mjs` etc. + `card-menu.js` | Menu look, fly-outs |
| Hand | Private; resting/raising; hover to read; reorder; sorted view with pins; group menu | `hand-view.js` per-frame easing, `hand-sort.mjs` | Fan geometry, arc, lift copy |
| Life & counters | Click/right-click/Shift/hold rules; one-trillion limit; lethal marks never enforced | `life-input.mjs`, `player-counters.mjs` | Life piece, chips, counter panel |
| Turns (live) | One pass record per own branch; newest wins; anyone may skip with a prompt; revert; no auto draw/untap; refresh-safe | `turn-order.mjs` | Turn line, gold border, title |
| Hidden information | Hand, library, sideboard unreadable by others; history never names hidden cards | Private branch + read rules; `describeMove` | |
| Live sync | Own-branch-only writes, atomic per move, minimal writes, refresh restores by match number | `gameWrites`, `saving` chain | Save state text |
| Lobby | Code/link tables, 2 to 4 seats, formats, ready-up, host starts, deck stays private (only commander names and bracket shared), auto-join | `table-ops.mjs`, rules | Seat cards with art |
| Table lifetime | Idle 30/60 min, 8-hour cap, server time, background activity, banners | Rules + `table-limits.mjs` | Banner wording and placement |
| Multiplayer layout | Each player gets a full small solo table; Grid and Sidebar as a table setting; others face you in Grid | `layoutSeats`, CSS container queries | Slot arrangement, docks |
| Tools | Stack (visual aid), history (Moves/Messages), action bar, Players panel; draggable; dockable | `floating-bar.js`, `tool-dock.js` | Dock positions, styling |
| Keybinds | Actions, two slots, swap with confirmation, hold-to-reset; defaults E/Q tap, F flip, D draw, Tab settings | `keybinds.mjs` | Keybinds page layout |
| Sound | Four sounds at one quiet level, only for your own actions, on by default | `sound.js`, per-file gains | Volume slider look |
| Accessibility | Reduced motion respected everywhere; text names for icons; keyboard paths for menus | | |

---

## 15. Feature preservation checklist

Legend: **MP** MUST PRESERVE, **PI** PRESERVE INTENT (implementation flexible), **OR** OPEN TO REDESIGN, **NI** NEEDS INVESTIGATION. "Risks" names what breaks if the feature is changed carelessly.

### 15.1 Deck and card data

| Feature | Class | Current behavior and nuances | Dependencies / regression risks | Files |
|---|---|---|---|---|
| Decklist parser | MP | Optional counts (qtyAssumed), headers, one-card Commander/Companion headers, set/number, `*F*`/`*E*`, 200-card cap, skip rules (§4.2.2) | Saved decks are re-parsed on open: any change alters old decks | `shared/deck-text.mjs` |
| Name matching | MP | Full → front face → alternate title; ambiguous and back-face suggestions; normalization | Card list fields `n`, `f` | `shared/card-match.mjs` |
| Problems and choices | PI | "Needs attention" with selects; choices keyed by typed line | Autosave | `deck-preview.mjs`, `deck-importer.js` |
| Exact printings | PI | Typed printing, else titled printing, else default; name-keyed refusal of wrong cards | `/data/printings`; saved `p` feeds game pictures | `shared/printings.mjs`, `printings.js` |
| Printing picker | PI | Tiles from `/data/prints`, search, Use the default; rewrites the line | Text rewrite side effects | `printing-picker.js`, `card-prints.js`, `deck-text-edit.mjs` |
| Foil from the decklist | MP (data) / OR (look) | Only from `*F*`/`*E*`/foil-only printing; one traditional look | Part of `stackKey`; not stored live | `foil-kinds.mjs`, `foil-looks.mjs` |
| Commander/partner picking | PI | Menu-only; guess with certainty note | Fallback refill can pick an unintended card (NI) | `deck-commander.mjs`, `deck-preview.mjs` |
| Format choice | PI | Commander/Standard; auto until touched | Lobby forces table format on new decks | `formats.mjs` |
| Bracket + Game Changers | PI | Auto guess 2/3/4 from count; info panel | Sent to lobby member entry | `deck-bracket.mjs` |
| Deck views, grouping, sorting | OR (rules PI) | Three views; group/sort/direction remembered | Unmatched sideboard line shown twice (NI) | `deck-view.mjs`, `deck-groups.js` |
| Card display and deck stats | OR | Sticky preview; facts strip; curve/colors/types | | `stack-preview.js`, `deck-stats.*` |
| Autosave | PI | Every change; unique names; replace by id | Edits that become unsaveable leave the old copy (NI) | `deck-importer.js` |
| Deck library | MP | 20 decks, strict reader, damaged/blocked handling, legacy migration | Users' data | `shared/deck-library.mjs` |
| Deck delete confirm | PI | `askConfirm`, Cancel focused | | `confirm-box.js` |
| Deck card count | NI | Counts every section, though the owner asked for main deck only | | `deck-face.js` |
| Sample deck | PI | Autosaves (comments say it does not); `?sample&play` | Solo empty state links to it | `sample-decks.mjs` |
| Card list build and caching | MP | Weekly at most, byte-stable, validated, fallback, format version, no downloads in tests | Vercel build; `LIST_FORMAT` must rise with content | `scripts/lib/card-list-build.mjs` |
| No runtime Scryfall API calls | MP | Only image CDNs | CSP hosts | `card-image.mjs`, `vercel.json` |
| Rules and rulings files | PI | Sharded, fetched per card | Details window | `card-rules.mjs`, `card-rulings.mjs` |

### 15.2 Cards and battlefield

| Feature | Class | Current behavior and nuances | Dependencies / regression risks | Files |
|---|---|---|---|---|
| Card object and battlefield-state clearing | MP | §5.1; tokens vanish; untap on leave | Every move path must go through `moveCard` | `shared/zones.mjs` |
| Immutable game updates | PI | Functions return new games | Tests freeze games | `zones.mjs` |
| One card button per uid | PI | Reused across zones; `--hz` variable for stacking, never inline z-index | Hand, battlefield, pile windows, stack copies share nodes (scry window reuse is NI) | `card-nodes.js` |
| Picture fallbacks | PI | Printing → default → name | | `card-nodes.js`, `card-image.mjs` |
| Card states display | MP (visible) / OR (look) | Tapped, face down, turned, badges, chips, final P/T box with colors | | `card-nodes.js`, `marks.mjs` |
| Click-to-adjust marks | PI | Chip/P-T click +1, right -1, Shift 10, "/" both, toast | Own cards only | `marks.mjs` |
| Grid battlefield | MP (concept) / PI (numbers) | 7x10 cards; solo 112x50; live 30 rows (multiple of 10 only) and fitted columns; flush | `setBoardSize` silently ignores bad rows: keep drag and draw in step | `board-grid.mjs`, `table.js fitBoard`, CSS |
| Arrival placement | MP | Lands bottom-left, others top-left, join last matching pile, nothing refused | | `zones.mjs` |
| Minimal-write ordering | MP | Card moves to end of list only if it now overlaps a later card | Live write cost | `zones.mjs placeCard` |
| Same-name piles | PI | Same cell + same `stackKey`; 3 drawn; count; snap 6 cells | Any new card field must be considered for `stackKey`; tokens with different P/T pile together (NI) | `stacks.mjs` |
| Tap regrouping | PI | Step out right / rejoin; untapped leaves left | Last-match heuristic (NI) | `zones.mjs regroupAfterTap` |
| Pile styles setting | OR | 3 untapped, 4 tapped styles | CSS only | `pile-style.*` |
| Drag and drop | MP (semantics) / PI (feel) | §5.6 | Shared with the live table; checks drive real drags | `board-drag.js` |
| Whole-pile carry | PI | Hold 250 ms ring or Shift | Pile→pile drop moves one card (NI) | `board-drag.js` |
| Rectangle multi-select | PI | Picks battlefield or hand; E/Q/F and drag act on the group | No battlefield group menu | `board-drag.js`, pages |
| Shift-pick hand group + group menu | PI | Play, Discard, Exile, Command, Top/Bottom (order window) | | `group-menu.mjs` |
| Double-click tap | PI | 450 ms/14 px, counted by the page | Do not replace with `dblclick` | pages |
| Alt+Arrow nudge | PI | One cell, may snap | Alt+Left with nothing selected may go Back (NI) | pages |
| Card menus per zone | MP (actions) / PI (layout) | §5.9 | Live menu must not offer named counters | `card-menu.mjs`, `card-menu.js` |
| Modify window | OR | Amount, six kinds, P/T ±, reset | Kinds differ from the catalog | `marks-panel.js` |
| Counters rules | MP | +1/+1 and -1/-1 cancel, 12 kinds, one-trillion clamp | Rules accept only fixed kinds live | `zones.mjs` |
| Named counters (solo) | PI | 218 + Custom, icons | Would drop the card on the live table | `counter-catalog.mjs` |
| Two-sided cards | MP | Turn over (battlefield), peek (hand), Play back (modal), face shown decides row, numbers, copies | Play back placement uses the front (NI) | `zones.mjs`, `card-nodes.js` |
| Create copy | PI | Copies shown face only, no counters | | `zones.mjs copyAsToken` |
| Tokens | PI | Catalog with deck tokens first; creature tokens sick | `/data/tokens.json` | `token-picker.js`, `card-tokens.mjs` |
| Emblems | PI | Command zone only, counts to 99 | Live stores `em` | `zones.mjs` |
| Alt big picture | MP | Alt, wheel 0.5–2x, Q/E turn, mouse only | Suppresses browser Alt | `card-hover.js` |
| Card details window | PI | Rules, rulings, back face, retry | Data shards | `card-details.js` |
| Summoning sickness reminder | MP | Auto on non-haste creatures (tokens always), click to clear, clears at own turn | Live `sk` | `zones.mjs` |
| Doesn't untap | MP | Manual; Untap all skips and reports | Live `nu` | `zones.mjs` |
| Exile ordering | NI | Menu appends, drag prepends, face shows `[0]` | | `zones.mjs`, `pile-stack.js` |

### 15.3 Hand, piles, command zone, tools

| Feature | Class | Current behavior and nuances | Dependencies / regression risks | Files |
|---|---|---|---|---|
| Hand fan, resting/raising | PI | Rests lowered (setting 20–100%), rises on approach, lowers after 150 ms | Browser checks must point at the visible part | `hand-view.js`, `hand-layout.mjs` |
| Hover lift copy | PI | Copy in a separate layer, never z-index | Neighbour hit areas | `hand-view.js` |
| Hand reorder + pins | PI | Pins until sorts change | | `hand-view.js`, `hand-sort.mjs` |
| Hand sorting (view) | PI | 4 sorts × 3 states, priority, Auto/Sort, orders in Settings | Stored order unchanged | `hand-sort.mjs`, `hand-sort-ui.js` |
| Hand menu | PI | Mulligan, Shuffle into library, Move all to, Discard X random, Discard hand | | `hand-menu.mjs` |
| Pile stacks | OR | Back/top card, count, names (hover on live), faint empty names | | `pile-stack.js` |
| Pile menus | MP (actions) | §6.5; Reveal/Play revealed/Exile face down solo only | | `pile-menu.mjs` |
| Pile window | PI | Search, filters, tabs, eye, read-only for others | | `pile-viewer.js`, `card-search.mjs`, `pile-filter.mjs` |
| Library click | NI | Does nothing on solo; viewLibrary key therefore dead on solo | | `solo.js` |
| Order window | PI | Drag or arrows, Random order | Own pictures (do not reuse shared nodes) | `order-window.js` |
| Scry/Surveil | MP | Top/bottom/graveyard choices; refuses if top changed | Game keys not blocked (NI) | `scry.mjs`, `scry-window.js` |
| Mill / Move top X | MP | To graveyard one at a time (deepest ends on top), exile, exile face down (solo) | | `pile-menu.mjs` |
| Command zone slots | PI | Two outlined slots; drag between slots (not saved) | | `command-zone.js` |
| Commander tax | MP | By hand; click/right-click; live own write; others see bubble | Rules paste pending; stale tax across matches (NI); `cmd` rebuild (NI) | `commander-zone.mjs`, `game-sync.mjs`, `table.js saveTax` |
| Stack window | MP | Copies, notes, arrows, undo 30, limits; live shared, last write wins; pinned in Grid docks | Arrow targets need owner uid live | `stack-window.js`, `stack.mjs`, `stack-sync.mjs` |
| Game history (solo) | PI | 200 entries, Moves/Messages | | `history-bar.js`, `game-history.mjs` |
| Floating bar | PI | Grip drag, edge/middle/corner snap, column icons, keys, positions per page | Labels must change via `.act-label` (else icons vanish) | `floating-bar.js`, `bar-place.mjs` |
| Tool docks | PI | Layout per seat count; drag in/out; floated list | **Persistence broken** (NI); no tests | `tool-dock.js` |
| Players panel | PI | Rows per player; holds your life controls | Must render before life controls move | `players-panel.js`, `table.js` |
| Settings panel | MP (options) / NI (keyboard) | Tabs per page (table below); Tab key opens/closes and therefore closes it mid-navigation; no focus move/trap | Ids used by page code | `settings-menu.js` |
| Keybinds | MP | 23 actions, defaults, swap confirm, hold reset 2 s, cross-tab sync | 2 s in JS and CSS | `keybinds.mjs`, `keybind-settings.js` |
| Sound | PI (behavior) / NI (files' licence) | Four sounds, per-file gains, only own actions | Re-measure gains if files change | `sound.js`, `sound-settings.mjs` |
| Life control | MP | Click/right/Shift/hold/arrows | | `life-control.js`, `life-input.mjs` |
| Player counters + chips | PI | 10 kinds solo, 3 live; lethal words | Live allow-list tied to rules | `player-counters.mjs`, `counter-chips.js` |
| Counter panel (live) | PI | Commander damage per other seat, then counters | | `counter-panel.js` |
| Commander damage | MP | Per source seat on the damaged player's branch; lethal 21 | Partners share one number | `player-counters.mjs` |
| Confirm, text, number boxes | PI | askConfirm (Cancel focused), askText, askNumber with memory | Native `confirm()` still used for 6+ actions | `confirm-box.js`, `text-box.js`, `number-box.js` |
| Dealing animation + sounds | PI | 120 ms per card, 800 ms after shuffle, reduced-motion instant | | `deal-sequence.mjs`, `card-fly.js` |
| Mulligan animation | PI | Gather, flip, fly, riffle | | `card-fly.js` |
| Reduced motion everywhere | MP | Hard rule | | CSS, JS checks |

### 15.4 Multiplayer

| Feature | Class | Current behavior and nuances | Dependencies / regression risks | Files |
|---|---|---|---|---|
| Anonymous identity per browser | MP | Lazy sign-in, one shared promise, Web Lock across tabs | Every rule keys off uid | `db.js` |
| Create table | MP | Atomic write, host slot, 6-char codes, expired-code reuse | Rules | `table-ops.mjs` |
| One table per host + warning | PI | `confirm()` placeholder | Inherited tables have no slot (NI) | `lobby.js`, `table-ops.mjs` |
| Join by code/link, auto-join | MP / PI | Atomic seat claim, reserved-seat return, auto-join with saved name | | `table-ops.mjs`, `lobby.js` |
| Remake closed table (host) | PI | Automatic, no confirmation | | `lobby.js reopenMyTable` |
| Lobby seat cards | OR | Art, pills, presence | Card list fetched lazily | `lobby.js` |
| Deck privacy in the lobby | MP | Only commander names, bracket, guess flag sent | Rules field limits | `lobby-deck.mjs`, `deck-fields.mjs` |
| Ready / Start | MP | Ready needs a deck (page), 2+ all ready, host only | Rules looser than page (documented) | `lobby.js`, `table-ops.mjs` |
| Host switches: format, view, bracket limit | PI | Lobby only; view fixed during the game | Format switch clears decks only on open pages | `table-ops.mjs` |
| Test bots | NI | Add/Remove bot; blank board on the table | Production exposure; host hand-over to bots | `lobby.js`, `db.js` |
| Host leave hand-over | PI | Lowest-seat member who hosts nothing else | No `claimHostSlot` | `table-ops.mjs` |
| Takeover of a vanished host | PI / NI | Lobby only, 5 min, server time | Not possible mid-match | `table-ops.mjs`, `lobby.js` |
| Restore game by match number | MP | Refresh restores; new match deals new | | `table.js beginGame` |
| Public/private split | MP | Hidden zones private; counts public | Rules | `game-sync.mjs` |
| Minimal atomic writes | MP | §13.2 | Cost | `game-sync.mjs` |
| Strict reading of others' data | MP | Exact shapes, ids, 250 cap, text only | | `game-sync.mjs readPublic` |
| Other players' boards | MP (data) / OR (look) | Life, hand backs, piles, command zone + tax, battlefield at stored cells, chips, read-only windows | Different window shapes see different arrangements (NI) | `table.js renderOpponents` |
| Blank board for players with no game | PI | Bots and loading players | | `table.js` |
| Grid/Sidebar views | PI | Host's table setting | | `table.js layoutSeats`, CSS |
| Facing | PI | Turned by default in Grid; Sidebar always upright | | `facing.js` |
| Turn passing / skip / revert | MP | §9.8 | One-level revert (NI) | `turn-order.mjs` |
| No automatic draw/untap live | MP | Owner decision | | `zones.mjs beginTurn` |
| Turn clock | PI | Server time, personal toggle | | `turn-clock.*` |
| Your-turn sound and title | PI | Once per turn start | | `table.js` |
| Ping | PI | Public zones only; first snapshot remembered | Face-down leak (NI); stale ping (NI) | `ping.mjs`, `spotlight.js` |
| Shared history, no leaks | MP | §9.10 | | `live-history.mjs` |
| Shared stack | MP | §6.8 | Last write wins | `stack-sync.mjs` |
| Concede / End match / Leave | MP | Match-number semantics, reserved seats | Concede invisible to others (NI) | `table-ops.mjs`, `table.js` |
| Presence | MP (data) / NI (display) | States computed; hidden during games | Decided UI not visible | `presence.mjs` |
| Heartbeat + lifetime + banners | MP | §9.13 | Server time | `heartbeat.mjs`, `table-limits.mjs`, `keep-alive.js`, `banner.js` |
| Expired-table cleanup by finder | PI | No scheduled job | Unvisited tables linger | `table-ops.mjs closeIfExpired` |
| Friendly errors | PI | Never raw SDK text | Save failures hidden in Settings (NI) | `friendly-error.mjs` |
| Security headers / CSP | MP | §13.7 | New hosts need CSP entries | `vercel.json` |

### 15.5 Shell

| Feature | Class | Notes | Files |
|---|---|---|---|
| Routes and `/logs/` URL | MP | Linked from the portfolio; never move | `vercel.json` |
| Home hero and entry points | OR | Play solo, sample, import, make/join | `lobby/index.html` |
| Header/footer, version | PI | Deck footer lacks version (inconsistent) | `site-header.js`, `version.mjs` |
| Fan-content notice | MP | On solo/table only in Settings > About (compliance question) | pages |
| Light/dark themes | NI | OS preference only; play pages likely low contrast in light theme (dark glass + dark text) [I] | `style.css` |

**Settings options per page** [V]:

| Tab | Solo | Live table |
|---|---|---|
| Game | (none) | Sideboard; Concede, End the match (host), Leave; save state |
| General | Sound (on, volume), Piles (untapped, tapped styles), Resting hand, Sideboard | Table (facing; pile styles), Hand (resting), Turns (turn clock), Sound |
| Hand sorting | Card types, Colors, Lands pill rows with Reset | same |
| Keybinds | all actions except Auto-arrange | all actions |
| About | Home, My decks, fan-content notice | same |

**Keybind actions and defaults** [V `shared/keybinds.mjs`]: tap (E, Q), flip (F), draw (D), settings (Tab), pictureLeft (Q, while Alt shows a picture), pictureRight (E); unbound by default: nextTurn, untapAll, mulligan, shuffle, arrange (table only), lifeUp, lifeDown, viewLibrary, viewGraveyard, viewExile, sortType, sortColor, sortCost, sortName, autoSort, history, stack. Bindable keys: one printable character, Tab, F1–F4, F6–F10; never Escape, Enter, Space, modifiers alone, F5, F11, F12, arrows, or Shift combinations.

---

## 16. System dependencies and regression risks

1. **Rules file ↔ page writes.** Every stored key is whitelisted (`$other: false`). A new stored field (on a card or a player branch) refuses the **whole** move until the rules are published. Use separate writes for new optional data (as the tax does) or publish rules first. Lists `PUBLISHED_COUNTERS` and `COMMANDER_TAX_PUBLISHED` must match the published rules.
2. **`stackKey` ↔ card fields.** Any new card state must be decided: does it split piles? Forgetting it makes different cards pile together; adding it wrongly splits piles.
3. **Card grouping ↔ movement ↔ ordering.** Arrival joins the last matching pile; drops snap within 6 cells; tapping regroups; `placeCard` list order controls drawing order and write size. Changing one changes how piles form and how much is written.
4. **Grid size ↔ drag math ↔ CSS.** `setBoardSize` silently refuses rows not a multiple of 10; the CSS repeats the numbers (`--rows`, spans, `data-col` rules to 105 on solo). Changing one without the others breaks snapping (log entry 274).
5. **Board sizes are global module state.** On the live table every placement uses the viewer's own board size; other players' cards are clamped at draw time.
6. **Shared card buttons.** A card's button moves between containers; placing it in a window (scry) removes it from the board until the next render.
7. **Hand stacking.** Card stacking uses the `--hz` variable and the hand's own stacking context; a real z-index on a hand card breaks battlefield stacking and hover.
8. **Floating bar labels.** Change `.act-label`, never a button's text (the icon is removed).
9. **Players panel ↔ life controls.** `#life-area` moves between the seat head and the panel; it must only move into a slot that is already on the page (a crash was caught on 2026-11-24).
10. **Selection ↔ menus ↔ keys.** Tap/flip keys act on the hovered battlefield card or the picked group; the hand ignores them; picks are cleared when a card leaves its zone.
11. **Game state ↔ history.** Live history is computed from diffs; any new move type must be described without naming hidden cards.
12. **Lobby configuration ↔ game start.** The table page deals from **this browser's** deck library and `overloaded.tableDeck`; a different browser has no deck. The format must match.
13. **Player status ↔ turns.** Conceded players and non-members are skipped; bots must be skipped by hand.
14. **Match number everywhere.** `ready`, `conceded`, public branches and the stack are valid only for the current match; anything not keyed by it (ping, tax) can leak across matches.
15. **Settings ↔ keybinds ↔ focus.** Tab is both a keybind and the browser's focus key.
16. **CSS shared between solo and live.** Solo rules are written `body.playing:is(.solo, .seats)`: a solo style change changes the live table.
17. **Card list format.** Raise `LIST_FORMAT` whenever the list's content changes, or Vercel serves the old shape for up to 7 days.
18. **Content Security Policy.** Any new external host (images, fonts, APIs) must be added to `vercel.json` or it silently fails in production only.

---

## 17. Incomplete, broken, or uncertain functionality

Ordered by likely impact. Each was found in this audit; "confirmed" means re-checked in code by the author of this document.

| # | Issue | Evidence | Where |
|---|---|---|---|
| 1 | **Tool dock layout is never saved**: an object is stored through a string store ("[object Object]"), so the arrangement and floated tools reset on every reload and layout change. Log entries 273 and 276 and `CLAUDE.md` claim it is kept. No test covers `tool-dock.js`. | confirmed | `frontend/src/tool-dock.js save()` |
| 2 | **No host takeover mid-match**: the takeover button is only on the lobby page, which redirects during play; a vanished host blocks End the match until the table expires. | [V] | `lobby.js`, `table.js` |
| 3 | **Presence and concede are invisible during a game**: only in a visually hidden list; the decided "Reconnecting..." on the board is not shown. | [V] | `table.js`, CSS |
| 4 | **Save failures are invisible during play**: shown only in Settings > Game. | [V] | `table.js saveState` |
| 5 | **Face-down cards are public**: name and id stored in public data; aria-label names them; a ping shows the real face; adding to the stack copies them. | [V] | `game-sync.mjs`, `card-nodes.js`, `spotlight.js` |
| 6 | **Whole pile dropped on a library/graveyard/exile pile moves only the top card.** | confirmed | `board-drag.js:334` |
| 7 | **View library key does nothing on solo** (the library has no click handler there). | confirmed | `solo.js` |
| 8 | **Settings and Tab**: Tab (default Settings key) closes Settings while navigating it; no focus moved into the panel; Escape in the keybind swap popup likely closes Settings behind it. | [V code, I effect] | `settings-menu.js` |
| 9 | **Commander list rebuilt on refresh (live)**: emblems and other command-zone cards may count as commanders; a commander out with no tax may drop. | [I] | `game-sync.mjs commandersOf` |
| 10 | **Stale tax and ping across matches**: neither is cleared by the first save of a new match. | [I] | `table.js sync` |
| 11 | **Exile order inconsistency** (menu appends, drag prepends). | [V] | `zones.mjs`, `board-drag.js` |
| 12 | **Play back of a spell//land** placed by the front face. | [I] | `zones.mjs` |
| 13 | **Scry window uses shared card buttons and does not block game keys**; a draw during scry makes Done fail. | [I] | `scry-window.js` |
| 14 | **Deck page:** unmatched sideboard line shown twice; deck card count includes sideboard; "Remove as commander" picks another card; misleading save message over 200 cards; opening a saved deck while the list loads does nothing. | [V, probed] | deck modules |
| 15 | **Hand-over and close-table have no UI**; inherited tables lack a host slot; bots can become host. | [V] | `db.js` exports unused |
| 16 | **Two table tabs of one player** can overwrite each other. | [I] | `table.js` |
| 17 | **Light theme on play pages** likely dark text on dark glass. | [I] | `style.css` |
| 18 | **History tabs not reachable by keyboard** (no arrow-key handler). | [V] | `history-bar.js` |
| 19 | **Native `confirm()`** for New game, Concede, End match, Leave, Skip turn, new table (placeholders). | [V] | pages |
| 20 | **Rules publication unknown** for `tax` (2026-11-23). Last confirmed match of file and published rules: log entry 265. | [D] | `backend/database.rules.json` |
| 21 | **Monarch/initiative/blessing and other counters** cannot be used live; the owner's "Create Misc" decision (entry 252) is not built. | [V, D] | `player-counters.mjs` |
| 22 | **Foil not stored live**; lost on refresh, never seen by others. | [V] | `game-sync.mjs` |
| 23 | **Licences**: sound files' source unrecorded; three untracked `commander-play-*.mp3`; Mana icons and the real card back unsettled under the fan-content policy. | [D] | `frontend/public/sfx/credits.md`, `icons/mana/credits.md` |
| 24 | **Alt+Left may navigate Back** on solo with nothing selected; no unload guard. | [I] | `solo.js` |
| 25 | **Stale documentation**: README ("early build", a server in `backend/`); CLAUDE.md (hold 500 ms vs 250, TAP_GAP 2 vs 1, two pile styles, Auto-arrange on solo); `docs/todo.md` (live stack "solo only"); `docs/game-flow.md` (presence and takeover "not built"); code comments in `commander-zone.mjs`, `turn-order.mjs`, `stack.mjs`, `keybinds.mjs`, `sample-decks.mjs`, `board-grid.mjs`, `solo.js` ("swap", "card buttons"). | [V] | various |
| 26 | **Dead code**: Scryfall fallback names, `setNote` (no UI), `battlefieldRows`, `setFoilInText`, `bracketNote`, the "Swapped" message, `group:sideboard`. | [V] | various |
| 27 | **Not verified at all**: phones, touch, a real four-player game, docks at other window sizes, the blur fix, another player's chips in the Players panel. | [D] | |

---

## 18. Testing recommendations

### 18.1 What exists [V `scripts/test-all.mjs`, `backend/run-tests.mjs`]

- `npm run test:quick`: about 84 Node unit suites (game logic, parsing, sync shapes, menus, keybinds, limits). Fast; always run.
- `npm test`: the unit suites, local headless Chrome checks (`check-solo-ui` 471, `check-deck-ui` about 290, `check-table-layout` 145, `check-stack-ui`, `check-settings-ui`, `check-history-and-select-ui`, `check-lobby-ui`, `check-spotlight-ui`, `check-token-ui`, `check-logs-page`), and the Firebase emulator suites in `backend/` (`test-rules` 578, `test-rules-game` 2,397 including random games built from the pages' own writes, `test-table-ops`, `test-table-flow`: a model of the intended flow compared step by step with page code plus rules).
- `npm run test:live` (needs `.env`, port 5173): checks against the real project, including `check-live-rules` (published rules behave like the file), the two-browser spike, `check-lobby-deck-live` 193, `check-seats-live` 36 (2, 3, 4 seats with bots, real drags, grid snapping), `check-room-live`, `check-bots-live`, `check-presence-live`, `check-heartbeat-live`, `check-two-tabs-live`, `check-deploy-config`.
- `backend/mutate-rules.mjs`: deliberately broken copies of the rules (last full run 2026-11-10; not re-run after later rules changes).
- Owner's testing rules [D]: small tests, one check per player action; broken-copy (mutation) runs prove tests catch bugs; for sync, two real browsers; look at screenshots at desktop sizes.

### 18.2 What a redesign must re-prove

1. **Hidden information:** another player can never read your hand, library or sideboard (rules + a live two-browser check); history never names hidden cards; decide and test face-down privacy.
2. **Every move's semantics** (`test-zones`, `test-board-play`, `test-stacks`, `test-turn-marks`, `test-counters`): keep these unit suites as the contract and run them against any new state layer.
3. **Drag and drop with a real mouse**: hand→board, board→board by a known number of cells (the 2026-11-24 grid check), board→hand, board→each pile, pile→board, whole pile, groups, Shift axis lock, cancel paths.
4. **Same-name piles**: join on arrival, snap on drop, tap out and rejoin, untap all, state differences that must split piles.
5. **Live sync**: a move by one player is seen by others; a refresh restores the game; a new match deals new games; minimal writes (measure bytes per move); two tabs of one player.
6. **Turn order**: pass, skip with prompt, revert, refresh during a turn, conceded players skipped, simultaneous passes.
7. **Lifetime**: idle and 8-hour banners on server time; closed messages; expired cleanup.
8. **Keyboard and accessibility**: menus by keyboard, Settings reachable and escapable, focus returns, reduced motion removes every animation, text names for icons.
9. **Card data build**: reuse without requests, rebuild on format change, fallback, validators (`test-card-list-build`).

### 18.3 Gaps to add

- A unit test for `tool-dock.js` persistence (it would have caught defect 1).
- A test that the Players panel and life controls survive every layout change.
- A two-browser test of commander tax after the rules are published, and of a mid-match host disappearance.
- A pile-to-pile whole-pile drop test.
- A light-theme screenshot of the play pages.
- Re-run the full rules mutation run after the latest rules changes.

---

## 19. Important accumulated product decisions

Final states only; earlier versions noted where they explain the current behavior. Sources are `log.md` entry numbers (#) unless marked.

### 19.1 Scope and platform
- **Casual simulator, no rules engine** (#5): players manage their own cards like paper. Nothing is refused; reminders only.
- **No accounts; decks live in the browser; store nothing not needed** (#4, hard rule). Tables are deleted when inactive.
- **Firebase Realtime Database over Supabase** (#19, #20): Supabase pauses idle free projects (risky before a demo) and caps anonymous sign-ins per IP (a classroom shares one). Supabase remains the fallback. **No server code.**
- **Plain JavaScript + Vite + Firebase SDK from npm, no framework** (#35): the owner plans to grow the project past the course. TypeScript only with the owner's agreement. Every dependency needs approval.
- **Our own static card list from Scryfall bulk data, no runtime API calls** (#7 to #11, #52 to #54): the owner wants Scryfall cost "as low as possible"; rebuilt at most weekly, byte-stable so returning players do not re-download.
- **Desktop only for now** (2026-10-28): phones and tablets on hold; every hover/Alt feature still needs a touch version later.
- **Paste import only**; link import deferred until a deck site agrees; no more automated requests to deck sites (#14 and docs).
- **Fan content:** free, no logos, the disclaimer on public pages (on play pages it lives in Settings, #144), card images never altered. **The real card back is used** for face-down cards and libraries (owner's decision against the agent's advice, #95).

### 19.2 Decks
- 200 cards maximum (#7); deck sizes are hints only (casual).
- A line with no count is one card (2026-10-29); Commander/Companion headers mark only the next card; the player confirms the commander (the guess "saves clicks, and it never decides", #16).
- Alternate printed titles match the real card; the picture is the named printing ("a card with other art is still the same card", #65).
- Up to 20 decks, autosave with no Save button (#138), one importer component for the deck page and the lobby (#122), delete asks first (#233).
- **Foil comes only from the decklist; nothing is made foil in the game; one traditional look for every foil** (#235 to #237; twenty photo-based looks were scrapped as "not possible to get right").
- Formats: Commander and Standard.

### 19.3 Table and hand
- **The battlefield is a grid of square cells with free placement**, not self-arranging rows (2026-11-06, replacing the original "Lands / Other rows" plan). The owner repeatedly asked for square cells and bigger cards; the live table is 30 rows (#274).
- **Overlap allowed, nothing refused, no swapping** (#110, #111: the first strict grid "was not what I meant").
- **Same-name piles** with tapped cards stepping aside (#112 to #116, #153); hold to carry a whole pile (500 → 350 → 250 ms).
- **No Auto-arrange buttons** (removed from solo 2026-11-14 and the table #260).
- **Everything a card can do is in its right-click menu**; no per-card buttons (#118); menus decided from the owner's sketch (2026-11-15, `docs/menus.md`).
- **The hand is a fan with no box, resting lowered and rising on approach**; hover lifts a copy, never by z-index; a "snappy" feel (#147 to #153, #223).
- **Hold Alt for the big picture** instead of resting the pointer (#144); wheel zoom and Q/E turning from friend feedback (#173, #210).
- **Keys are actions** with two slots, swap with confirmation, hold-to-reset (#239, #240). Q taps like E, D draws, Tab opens Settings (friend feedback #176).
- **Summoning sickness is a hybrid reminder**; "doesn't untap" is manual (#98).
- **One trillion as the number limit** ("doublers can go into the billions", #87).
- **Commander tax is counted by hand** ("Cast commander" does not change it).
- **Sounds:** four, at one quiet level, only your own actions; slider makes no sound (#101 to #104). Source licence not checked (owner chose to skip).
- **Every animation respects reduced motion** (hard rule).
- **Short UI text and small tests** (2026-11-18).
- **No news line during a game**; messages go to the history's Messages tab (#266, #269; the agent warned errors could go unseen; the owner accepted).

### 19.4 Multiplayer
- **Private tables by code or link**, 2 to 4 seats, host starts when everyone is ready (2+ players), **auto-join with a saved name** (#84, reversing #44).
- **Nobody sees inside another player's deck**; only commander names and bracket are shared (#68).
- **Bracket limit only warns** (#250).
- **The view (Grid/Sidebar) is a table setting chosen in the lobby**, not switchable during a game (#263).
- **Every player gets a full small solo table** in the multiplayer layout (#252 to #254; the owner rejected cramped layouts repeatedly, #254, #261, #270, #273).
- **Other boards face you in Grid view; Sidebar is always upright** (#267).
- **Tool docks**: 2 and 4 seats a left column, 3 seats the spaces beside your area; Players panel holds life (#272 to #276).
- **Turns:** one pass record per player's own branch; anyone may skip with a prompt; revert; **players draw and untap themselves** ("some turns have exceptions", #99).
- **Table lifetime:** 30 min idle lobby, 60 min idle game, 8 hours max, background activity detection with quiet banners, no popups (the owner's "banking app" idea, 2026-10-26).
- **A table carries on without its host:** hand-over on leave, takeover after 5 minutes away (#41, #42, #50); **a mid-match leaver keeps their seat** ("a browser or computer can crash", #41).
- **Concede does not end the match; only the host ends it** (#32, #33); match numbers make stale marks harmless.
- **One table per host**; a new one replaces the old after a warning (#29).
- **Expired tables are cleaned up by whoever finds them** (Cloud Functions need a paid plan, #107).
- **Custom art, sleeves and playmats** (designed, not built): uploads stored with the table, never image links, because a linked host would see players' IP addresses (#85, #88).

### 19.5 Reversed or abandoned (do not reintroduce without the owner)
Rules engine (Forge); Supabase; SDK from a CDN; Lands/Other rows; the strict 12x4 grid with swaps; rectangular cells; stretched cells; 32-row table grid; the selected-card panel and Shuffle button; the selected-card corner on solo; enlarge-on-rest; play-page footers; the pile triangle handle; Auto-arrange buttons; the 2x2 table and Seats versions 1 and 2; a view switch on the table page; the news line; the in-game Foil menu line and per-kind foil looks; a single saved deck; commander radio buttons; the Save button; automatic draw and untap on the live turn start; a final (non-returnable) mid-game leave; image links for custom art; deck name and card count shown to others.

### 19.6 Recurring corrections the owner gave (what they reveal)
- He describes **outcomes** (a full, square, large board) and expects intent over literal wording.
- **Screens over numbers**: checks that pass while the screen looks wrong are not acceptable; look at screenshots, play it.
- **Parity between solo and live**: a decision on one table applies to the other.
- **Use the space**: every player gets a full area; cards as big as fit.
- **Verify before claiming**: no claims from memory; prove tests catch bugs.
- **Privacy**: no third-party hosts that leak players' addresses; nothing bypassed.

