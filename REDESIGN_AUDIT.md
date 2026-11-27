# Overloaded: Redesign audit

**What this is:** the last step (7) of the redesign. It checks the redesigned site against the feature preservation checklist in `PRODUCT_BEHAVIOR_SPEC.md` section 15, and goes through the spec's list of known problems (section 17) to say which the redesign fixed, which it left, and which it created.

**What it covers:** the `redesign` branch, commits `660f649` to `bc9b034` (log entries 278 to 290, 2026-11-24 to 2026-11-26), compared with `development` at `279ba88`. Written 2026-11-26.

**Evidence markers:**
- **[T]** a test that passed on the final code covers it (named, or "the suites" for `npm test` and `npm run test:live` as a whole).
- **[S]** a screenshot was looked at during the redesign.
- **[C]** read in the code for this audit.
- **[N]** not verified.

## 1. Summary

- **Nothing on the MUST PRESERVE list was removed.** Every MP row is still in the code and still covered by the suites that covered it before.
  - On the final code, `npm test` passed 103 of 103 suites and `npm run test:live` passed 114 of 114 (section 6).
  - These are the same suites the spec's section 18.2 says a redesign must re-prove: hidden information, every move's meaning, real-mouse drag and drop, piles, live sync, turns, table lifetime, the card data build.
- **What the redesign changed on purpose:** the look of everything, and the arrangement of the play pages:
  - a top bar, a rail on the right, seat cards;
  - a console with life and the action buttons;
  - player colors, Settings with a theme and a battlefield pattern;
  - one design for every window and menu.
- **What the redesign added:**
  - the step of the turn and Undo;
  - player colors;
  - a light theme;
  - notes that explain keywords on the Alt picture;
  - a third table view, Shared, where everyone moves cards on one plane, and the card a player carries is shown to everyone;
  - commander and hand-sort effects with sound;
  - React islands on the home page.
- **Decisions in the spec's section 19 that Kevin changed during the redesign** (each recorded in the log):
  - **The tool docks** (19.4: "2 and 4 seats a left column, 3 seats the spaces beside your area") were replaced by one rail on the right (direction B, "Focus Table", entry 279).
  - **"Plain JavaScript, no framework"** (19.1) now has one exception: React and Tailwind on the home page's hero (entries 288 to 290). The tables are unchanged.
  - **"Four sounds"** (19.3) is now seven: Kevin added three commander sounds (entry 287). They play at the same measured level.
  - **"The real card back is used for face-down cards"** (19.1) is unchanged. The home page's card shows our logo instead, because the exception covers only cards in play (entry 288).

## 2. Section 15 checklist, row by row

Only rows whose status changed, or that the redesign touched, are listed with detail. A row not listed is **kept unchanged**: its code was not edited by the redesign, or only its look was, and the suites that covered it before still pass [T].

### 15.1 Deck and card data

| Feature | Class | Status after the redesign |
|---|---|---|
| Parser, matching, printings, picker, foil data, library, card list build, rules and rulings | MP / PI | **Kept.** Logic not touched [C]; `test-deck-text`, `test-card-match`, `test-printings`, `test-deck-library`, `test-card-list-build`, `check-deck-ui` 292 [T]. |
| Deck views, card display, stats | OR | **Restyled** (step 6: panels, header, the page's shared look) [S]. Same markup and ids; `test-importer-markup` [T]. |
| Saved decks screen | OR | **Changed:** an "Add a deck" tile after the last deck, doing what New deck does (entry 286) [S][T]. |
| Deck delete confirm | PI | **Kept**, in the new window design [T]. |
| Deck card count | NI | **Unchanged: still counts every section** [C]. |
| No runtime Scryfall API calls | MP | **Kept.** The home page's card picture comes from the image CDN, and only after the visitor shows interest. `check-lobby-ui` requires that loading the home page contacts no other site [T]. |

### 15.2 Cards and battlefield

| Feature | Class | Status after the redesign |
|---|---|---|
| Card object, immutability, arrival, minimal writes, piles, counters rules, two-sided cards, sickness, doesn't untap | MP | **Kept.** `shared/zones.mjs` logic untouched except Undo, which stores whole games and changes none [C]. `test-zones`, `test-board-play`, `test-stacks`, `test-turn-marks`, `test-counters`, `test-turn-over` [T]. |
| Card states display | MP visible / OR look | **Kept visible, restyled** (step 5) [S]. |
| Grid battlefield | MP concept | **Kept**, and the cell marks are now a choice: Dots, Crosses or Graph paper. They are drawn per cell, so off-block cards and cut edges no longer look wrong (entry 283) [S]. The sizes are unchanged: solo 112 by 50, live 30 rows. Solo now fits about 112 columns with whole card rows to the window (step 3) [T `check-table-layout`]. |
| Drag and drop, whole pile, rectangle, double-click tap, Alt+Arrow | MP / PI | **Kept** [T `check-solo-ui`, `check-seats-live` real drags]. **New on the live table:** the card a player carries is shown to the others, and only one player moves it at a time (Shared view, entry 285) [T `check-shared-live`]. |
| Card menus | MP actions / PI layout | **Kept.** A menu now opens above or to the left when there is no room below or to the right (step 2; a submenu had opened under the pointer and chosen itself) [T]. |
| Modify window | OR | **Rebuilt** in sections with buttons named for screen readers ("Power +") (step 5) [S][T]. |
| Alt big picture | MP | **Kept, and extended:** a panel explains each keyword on the card in our own words (`shared/keyword-glossary.mjs`, about 120 keywords; `test-card-notes`) [T][S]. |
| Summoning sickness, doesn't untap | MP | **Kept** [T]. |
| Exile ordering | NI | **Unchanged** (menu appends, drag prepends) [C]. |

### 15.3 Hand, piles, command zone, tools

| Feature | Class | Status after the redesign |
|---|---|---|
| Hand fan, lift copy, reorder, sorts, hand menu | PI | **Kept**; sorting a hand now makes the cards hop one after another (anime.js, not under reduced motion) [T `check-effects-ui`]. |
| Pile stacks, menus, window, order window, scry, mill | MP / PI | **Kept, restyled** (one window design, `overlays.css`) [T][S]. |
| Command zone, commander tax | PI / MP | **Kept.** On solo the tax is a pill that stays in the slot's flow (step 5) [S]. **New:** a commander that comes from the command zone onto the battlefield sets off an effect and a commander sound, for every player at the table, with no database change [T `check-effects-ui`, `check-lobby-deck-live`]. |
| Stack window | MP | **Kept**, in the rail [T `check-stack-ui`, `check-seats-live`]. Its hint text is shorter. |
| Game history | PI | **Kept**, in the rail. |
| Floating bar | PI | **Kept** on both tables (`mountFloatingBar`, `.actions-panel`) [C]. It now sits in the console with the life total (steps 2 and 3). |
| Tool docks | PI | **Changed on purpose:** one rail on the right in every mode (`DOCKS` in `tool-dock.js`: grid, focus, solo) instead of the left column and beside-the-area spaces. It is saved as JSON text [C]. |
| Players panel | PI | **Changed:** seat cards in the rail (`players-panel.js`, `shared/board-summary.mjs`) [S][T]. |
| Settings panel | MP options / NI keyboard | **Options kept, and new ones:** Theme (Dark, Light), Battlefield pattern, Effects, Commander sound. **The keyboard problem is unchanged:** Tab still opens and closes Settings, also while the focus is inside it [C]. |
| Keybinds | MP | **Kept, two new actions:** Undo (Z) and Next step (P) [T `test-keybinds`]. |
| Sound | PI / NI licence | **Seven sounds,** the three new ones measured and set to the same level [T `test-sound-settings`]. **Licence still unrecorded for all seven.** |
| Life, counters, counter panel, commander damage | MP / PI | **Kept**; life sits in the console [T]. |
| Confirm, text, number boxes | PI | **Changed for the better:** every native `confirm()` is gone (step 1). New game, Concede, End match, Leave, Skip turn and the new-table warning use the designed window [C: no `confirm(` left in the page code]. |
| Dealing and mulligan animations | PI | **Kept** [T]. |
| Reduced motion | MP | **Kept as a rule for everything new:** the effects, the hand hop, the Shared camera's glide, the carried card's glide, Dot Field and Flick Card all stop under reduced motion [T `check-effects-ui` for the effects; the KokonutUI parts check it themselves, seen in their code; a reduced-motion screenshot of the home page was looked at]. |

### 15.4 Multiplayer

| Feature | Class | Status after the redesign |
|---|---|---|
| Identity, create, join, auto-join, ready, start, host switches, hand-over, takeover, restore by match, public/private split, minimal writes, strict reading, turns, history, stack, concede/end/leave, heartbeat, CSP | MP / PI | **Kept** [T: the emulator suites, `check-live-rules`, spike, `check-room-live` 41, `check-lobby-deck-live` 194, `check-seats-live`, presence, heartbeat, two tabs, `check-deploy-config` 54]. |
| Lobby seat cards | OR | **Restyled; player colors added:** ten named colors, two players cannot share one, stored as `members/{uid}/color` (rules pasted) [T]. The generated faces were added and taken out again (entries 289, 290). |
| Grid / Sidebar views | PI | **Kept, and a third view, Shared:** every battlefield on one 224 by 130 plane, any member moves any card (only the place is shared), wheel zoom, pan, Fit and Mine (entries 284, 285; `shared/plane.mjs`, `test-plane`, `check-shared-live` at 2 and 4 seats and in light mode) [T][S]. |
| The step of the turn | new | **New:** Untap to End strip, stored as `public/{uid}/phase` (rules pasted) [T]. |
| Undo | new | **New:** 30 steps on each page, cleared by a change of turn, a mulligan or a new game (`shared/undo.mjs`) [T]. |
| Presence display | MP data / NI display | **Unchanged since entry 277** (shown on the seat and Players row) [T]. |

### 15.5 Shell

| Feature | Class | Status after the redesign |
|---|---|---|
| Routes and `/logs/` | MP | **Kept** [T `check-deploy-config`, `check-logs-page`]. |
| Home hero and entry points | OR | **Redesigned** (step 6 and entry 288): a shorter hero, solid gold Play solo, three points as pills, Play with friends on the first screen, and a React island with a dot field and a card to flip. Every id and heading is kept [T `check-lobby-ui` 66][S]. |
| Header, footer, version | PI | **Header restyled** (the current page is a pill with a gold line). The deck page now links the build log. **Still inconsistent:** only the home page's footer shows the version [C]. |
| Fan-content notice | MP | **Unchanged:** in the footer of home and the deck page, and in Settings > About on the tables [C]. |
| Light/dark themes | NI | **Fixed:** a Theme choice in Settings (Dark, Light), on every page, kept in the browser. The light theme was looked at on the tables, the Shared view, the home page and the deck page [S]. |

## 3. Section 17 problems, status after the redesign

Rows 1 to 4, 6 and 7 were fixed before the redesign (log entry 277).

| # | Problem | Status |
|---|---|---|
| 5 | Face-down cards are public in the data | **Open** (needs a database change). |
| 8 | Settings and Tab | **Open** [C]. |
| 9 | Commander list rebuilt on refresh | **Open** [N]. |
| 10 | Stale tax and ping across matches | **Open** [N]. |
| 11 | Exile order | **Open** [C]. |
| 12 | Play back of a spell//land | **Open** [N]. |
| 13 | Scry window and game keys | **Open** [N]. |
| 14 | Deck page details | **Open**, card count still includes the sideboard [C]. |
| 15 | Hand-over and close-table have no UI | **Open** [N]. |
| 16 | Two table tabs of one player | **Open** [N]. |
| 17 | Light theme on play pages | **Fixed** (a real light theme, looked at) [S]. |
| 18 | History tabs not reachable by arrow keys | **Open**: `history-bar.js` has no key handler [C]. |
| 19 | Native `confirm()` | **Fixed** (step 1) [C]. |
| 20 | Rules publication | **Confirmed current:** Kevin pasted the rules for color, phase, plane, view `shared` and carry during the redesign, and `check-live-rules` found the published rules match the file, 145 of 145 [T]. |
| 21 | Monarch and other counters live | **Open.** |
| 22 | Foil not stored live | **Open.** |
| 23 | Licences | **Partly:** the KokonutUI and anime.js licences are recorded (`frontend/src/components/kokonutui/credits.md`; anime.js MIT, log entry 287). **Still unrecorded:** the source and licence of all seven sounds. Mana icons and the real card back are still unsettled under the fan content policy. |
| 24 | Alt+Left may go Back | **Open** [N]. |
| 25 | Stale documentation | **Partly:** `CLAUDE.md` records React, Tailwind and anime.js; the README is still old. |
| 26 | Dead code | **Open.** |
| 27 | Not verified | **Still not verified:** phones, touch, a real four-player game with people, docks at other window sizes. |

**New problems the redesign brought:**
- **`check-room-live` failed once in four runs** after the home page's React island (entry 288), at "Alice makes a table and is on its own screen". The cause is unknown; it passed every run since.
- **`check-lobby-deck-live --screenshot` crashes** on `pressStep is not defined`. The bug is in the check's screenshot code, which is older than the redesign.
- **The home page carries 84 KB more JavaScript** (93.6 to 177.7 KB) for its two decorative KokonutUI parts.
- **Hot reload is off for React parts** in the dev server: the React plugin was removed because its inline script broke the content policy checks.

## 4. Section 18 gaps, status

- **A test for `tool-dock.js` persistence:** done in entry 277 (`readDockStore`, `writeDockStore`).
- **A light-theme screenshot of the play pages:** done [S].
- **A pile-to-pile whole-pile drop test:** done in entry 277 (live check).
- **A two-browser commander tax test, and a mid-match host disappearance test:** not added.
- **Re-run the full rules mutation run:** not done. The rules gained color, phase, plane, view `shared` and carry since the last full run (2026-11-10).

## 5. What was not checked

- Phones and touch: the whole redesign was checked at desktop width only, as Kevin decided on 2026-10-28.
- How the sounds sound.
- The commander effect on the Shared view's plane: the code looks there, but no test casts on it.
- A real game with four people.

## 6. Test runs on the final code (`bc9b034`)

Both run on 2026-11-26 on `bc9b034` plus this file:
- `npm test`: **103 of 103 suites passed.** These are the unit suites, the local headless Chrome checks (solo, deck, layout, stack, settings, history, lobby, spotlight, tokens, effects, logs page) and the database rules in the emulator: 578 rule checks, 2,408 game rule checks, 270 table logic checks and 3,349 flow steps.
- `npm run test:live`: **114 of 114 suites passed**, against the real Firebase project. They include "published rules match the file", 145 of 145.
