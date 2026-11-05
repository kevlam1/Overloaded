# Counters, tokens and the card shape (designed 2026-11-04; build step 1, the logic and the storage, built the same day)

Why this comes before the database rules change: every new field on a card or a player is another edit to the strict shape in
`backend/database.rules.json` and another full mutation run (about 55 minutes). So the shape is settled here first, and one rules
run covers it together with the size and shape limits, the `lastSeen` deletion fix and the table code check (see `docs/todo.md`).

## Decisions by Kevin (2026-11-04)
- **Counters on cards:** a fixed short list, not free-form names (the database rules cannot count children, so only a fixed set can be capped).
- **Counters on players:** poison, energy, experience and commander damage per seat (1 to 4).
- **Reserved optional fields now** (allowed by the rules, built later or only as needed): face-down, position, a short note.
- **Tokens:** pick from Scryfall's token list; a card that makes tokens shows them ("what it creates") for one-click creation; the art
  can be changed to another printing of the same token; and custom art.
- **Custom art is an UPLOADED picture, not an image link (Kevin, 2026-11-04, replacing his earlier choice of an image link).** The player picks a
  file, the page shrinks it in their browser to a small picture (about 30 KB) and it is stored in the table's data, so every player's browser
  gets it from Firebase and no outside host is contacted. Why the link idea was dropped: a browser that shows a linked picture fetches it
  straight from the link's host, which then sees that viewer's IP address and the time; Kevin does not want Imgur, and any free-form address
  would let a player log everyone at the table from their own server. The number of custom pictures per player is limited. Space is not a
  worry because the pictures are deleted with the table. Not saved between games unless a later step keeps them in the player's browser.
- **Sleeves (card backs) and playmats use the same mechanism** (Kevin, 2026-11-04), chosen in the lobby, and swapped during a match if that is
  light enough to do without a reset (see "Custom pictures: sleeves, playmats and token art" below).

## What was checked in Scryfall's data (2026-11-04, the cached files from 2026-10-26 and 2026-10-29)
- `all_parts` on a card lists related cards, each `{ object: "related_card", id, component, name, type_line, uri }`; `component` is
  `token`, `combo_piece`, `meld_part` or `meld_result`. Krenko, Mob Boss lists a token named Goblin, type line "Token Creature — Goblin",
  id `70f8a1de-cd4c-4afa-bf03-0245d375d42e`; Treasure Vault lists "Token Artifact — Treasure"; Sol Ring has no `all_parts` at all.
- In the oracle file (one record per card, 39,196): 6,628 cards have `all_parts`, 4,785 have a `token` part (5,027 links to 1,599
  distinct token ids). Those token ids are NOT records in the oracle file; they are printings, found in the all-printings file.
- In the all-printings file (119,203 records): 3,049 token printings, every one with a picture, none digital-only, in 850 distinct kinds
  (same name, type line, power/toughness and colors). The biggest kinds: Treasure 100 printings, black 2/2 Zombie 86, white 1/1 Soldier 74,
  Food 63, red 1/1 Goblin 59. 4,017 card names (across printings) have a related token.
- Sizes measured: all token printings with id, name, type line, power/toughness, colors and set: 368 KB, 99 KB gzipped. The card-to-token
  links as written out by id: 379 KB, 148 KB gzipped; stored as small numbers pointing into the token list they should be much smaller
  (not measured). Plan: one separate file loaded only when the token panel is opened, built from the all-printings file the build already
  downloads (no new download, no new Scryfall request). The main card list is unchanged.

## The card shape (what a card in `public/` and `private/` may hold)
Today: `{ u, i, p?, n, x?, e? }` (see `shared/game-sync.mjs`). Planned additions, all optional, all bounded so the rules can check them:

| Field | Meaning | Bound the rules would enforce |
|---|---|---|
| `tok` | this card is a token | exactly `1` |
| `tt` | a token's type line (it is not in the card list, and other pages need it to place the card in the lands or other row) | text, 1 to 60 characters |
| `pt` | a token's power/toughness | `^[0-9*+-]{1,3}/[0-9*+-]{1,3}$` |
| `cl` | a token's colors | `^[WUBRG]{1,5}$` |
| `ct` | counters on the card | an object whose keys are only `p` (+1/+1), `m` (-1/-1), `l` (loyalty), `c` (charge), `t` (time), `o` (other), each a whole number 1 to 1,000,000,000,000 (one trillion) |
| `mp`, `mt` | the power and toughness modifier you set by hand (pump spells, equipment, "until end of turn"): NOT counters | whole numbers -1 trillion to 1 trillion (stored only when not 0) |
| `f` | face down | exactly `1` |
| `px`, `py` | position on the table (reserved for the free-placement idea; the two automatic rows stay) | whole numbers 0 to 4000 |
| `nt` | a short note on the card | text, 1 to 40 characters |
| `au` | custom art: the NAME of one of the owner's uploaded pictures (see "Custom pictures"), not the picture itself | text from a small fixed set of slot names |

A token's `i` is the id of the token printing, which is a Scryfall id, so the existing picture code works and "change its art" just
swaps which printing the card points at (`p` is used the same way as for real cards). Without `tok`, `i` still has to be a real card.

On the player (`public/{uid}`): `pc` with the keys `poison`, `energy`, `experience` (whole numbers 0 to 1 trillion) and `cd` (commander damage
taken) with the keys `1` to `4`, the seat of the commander's owner (whole numbers 0 to 1 trillion). Fixed keys, so the rules can cap them.

## Number limits (Kevin, 2026-11-04: "doublers can literally go into the billions")
One limit, `NUMBER_LIMIT` in `shared/zones.mjs` (one trillion), for life, every counter, the modifier, player counters and commander damage; a change can be any whole number up to it, and a result past it stops at it. Whole numbers are exact in JavaScript up to about 9 quadrillion, so a few sums of trillion-sized numbers stay exact. Planned buttons: Shift-click changes by 10, the "/" in the middle of the modifier changes power and toughness together, and a number can be typed. Life storage used its own cap of 1,000,000 that would have reset a bigger total to 20; it now uses the same limit.

## Power and toughness: counters and the modifier are different things (Kevin, 2026-11-04)
A +1/+1 counter stays on the creature (other cards can remove, double or move it) and a plain +1/+1 from a pump spell or an equipment
is not a counter, so the card holds both and both add to the same total:
- the counters `p` (+1/+1) and `m` (-1/-1) in `ct`, shown as chips on the card (`+1/+1 x3`); click a chip to add one, right-click to remove one;
- the modifier `mp` / `mt`, shown as a label in the bottom-right corner (where the printed power and toughness sit): click the left half
  for power +1, the right half for toughness +1, right-click to subtract. The selected-card panel has plus and minus buttons for the
  same (no right-click on a phone, and some people cannot use it) and a "+1/+1 counter" shortcut.
- the total shown is the modifier plus the counters: three +1/+1 counters and a +2/+0 modifier show as `+5/+3`. Only the CHANGE is shown
  until the printed power and toughness are added to the card list (then it can show the final `5/4`; not measured, a list format change).
- Claude's suggestions, not yet confirmed: adding a +1/+1 counter to a card that has -1/-1 counters removes one -1/-1 instead (the real
  rules cancel them in pairs); Next turn does NOT reset the modifier (it would wipe permanent effects such as an equipment); the modifier
  and the counters are cleared when the card leaves the battlefield; a "reset modifier" button.
- Other players see the chips and the label on your cards but cannot change them.

## Game rules for casual play (to build in `shared/zones.mjs`, with tests)
- A token that leaves the battlefield stops existing; counters are cleared when a card leaves the battlefield (like tapped is today).
- Counters are changed only on your own cards; putting a counter on another player's permanent would need the `inbox` and is not planned.
- Creating a token: from a card's related tokens, from the token search, or a copy of one of your permanents (as a token).

## Custom pictures: sleeves, playmats and token art (draft, 2026-11-04)
Proposed, not decided; the rules run needs the shape settled first.
- **Where the picture data lives:** NOT inside a card. The game writes whole zones when one card changes (see `docs/todo.md`), so a 30 KB picture inside a battlefield card would be rewritten to every player on every move. Instead each player has their own branch, for example `art/{uid}/{slot}`, written once when the picture is chosen. Slots: `sleeve`, `mat`, and `t1` to `t6` for token art. A card holds only the slot name in `au`, and a viewer looks the picture up there. Fixed slot names mean the rules can cap the count (rules cannot count children) and each value's length.
- **Size limits (to be measured):** token art and sleeve about 30 KB (a card is 5:7, so a small portrait picture); a playmat is wide and needs more, perhaps 100 to 150 KB. The limit is a text length on the stored picture, checked by the page and by the rules. Total worst case per player is under 400 KB, small next to Firebase's 10 GB a month, and it is deleted with the table.
- **Who may write:** only the owner, like their other branches. Everyone at the table may read it (that is the point). Nothing in it is private.
- **Swapping during a match:** a sleeve or a mat is one small write to the player's own art branch and the page redraws, so nothing about the game state changes and no reset is needed. The cost is one more download for each viewer (a few tens of KB), which is why the sizes are small. If it proves heavy, the fallback is lobby only.
- **Whose sleeve shows:** each player's cards (in their hand, the library pile and the opponents' view of your hidden cards) show that player's sleeve. A playmat is shown under that player's own board. Whether one player can see another's mat or only their own, or whether the table shares one, is an open question.
- **Picture formats (checked 2026-11-04 in headless Chrome 156 on Windows only, not in Firefox, Safari or on a phone):** a player may pick PNG, JPEG, WebP or GIF (a GIF becomes a still picture); SVG is refused because it is code, not pixels. Chrome decoded all four and encoded PNG, JPEG and WebP; it does NOT encode AVIF and silently returns a PNG when asked, so the page must check the type it got back. The page draws the file on a canvas (which keeps only pixels and drops file details such as location data) and stores WebP, or JPEG when the browser did not return WebP, never PNG (too large for real art). Believed but NOT checked: Safari cannot encode WebP from a canvas, so iPhone players would get the JPEG fallback; a friend with an iPhone should try it. AVIF files as input are untested. The 30 KB and 100 to 150 KB sizes were not measured on real art.
- **What the content policy needs:** `img-src` gains `data:` (the pictures are text that starts with `data:image/webp;base64,`). That is a looser policy for images only; scripts stay as strict as before. The image checker module is now about the stored picture's shape and size, not a host list, so `shared/token-art.mjs` in the build order becomes `shared/custom-art.mjs`.

## Open questions
- **Face-down hides nothing yet.** A face-down card's name is in the public data, so a technical opponent could read it. Real hiding means
  publishing a masked card and keeping the real identity in the private branch. Decide when face-down is built; until then it would be
  a visual flag only and the page should not claim more.
- Whether a player can hide other players' custom pictures (a setting). Less pressing now that nothing is fetched from an outside host.
- Whether one player's playmat shows to others, or only their own screen.

## Build order (each step small, tested, committed when Kevin asks)
1. **DONE 2026-11-04** `shared/zones.mjs` and `shared/game-sync.mjs`: counters (with +1/+1 and -1/-1 cancelling), the modifier, notes, face-down,
   token creation and copying (a token that leaves the battlefield disappears, everything battlefield-only is cleared on leaving), the
   player counters and commander damage, all stored and read back, with `scripts/test-counters.mjs` (232 checks, 59 of 59 broken copies caught)
   and `scripts/test-sync-counters.mjs` (82 checks, 44 broken copies run: 42 caught at first, one survivor then got a test and is caught, one is
   redundant because an array already fails the counter key check). NOT done in this step: the position fields
   `px`, `py` (reserved in the plan, no code yet), custom pictures `au` and the art branch (step 2), and `faceDown` hides nothing from other players.
   Decided while building: a copy of a real card keeps its cost and keywords through the database because a token's cost and keywords are
   looked up by id only (never by name, since 87 token names equal real card names).
2. `shared/custom-art.mjs`: the checks for a stored custom picture (shape, size, slot names; used by the page and mirrored in the rules), the page code that shrinks an uploaded file, with tests.
3. The buttons for counters, notes, face-down and player counters on the solo and live tables. **3a DONE 2026-11-04 (solo table), and 3b DONE 2026-11-05 (the same controls on the live table page, saved and shown to other players; log entry 90):** every card shows its counters as chips and the power/toughness change at the bottom (`frontend/src/card-nodes.js`, so the live table shows other players' cards the same way, read-only), and the selected-card panel has a typed amount, a kind of counter with Add and Remove, and Power/Toughness/Both plus and minus and Reset change (`frontend/src/marks-panel.js`; the pure parts are in `shared/marks.mjs`, `scripts/test-marks.mjs` 49 checks, 23 of 23 broken copies caught, and `scripts/check-solo-ui.mjs` has a counters scenario). **3e DONE 2026-11-05 (log entry 94): a right-click menu on your own cards (Modify, Tap, +1/+1 counter with 2, 3 and 5, Move to) and the counters panel hidden until Modify.** **3d DONE 2026-11-05 (log entry 93): the printed power and toughness are in the card list (`pt`, list format 4) and a creature's box shows the FINAL numbers, with a floating text after a click.** **3c DONE 2026-11-05 (solo and live table, your own cards only): clicking a chip adds 1, right-click takes 1 off, Shift makes it 10, and the change label is three pieces (power, the "/", toughness) where the "/" changes both; log entry 91.** **Not done yet in 3:** touch versions of the clicks (no right-click or Shift on a phone; the panel is the way in), notes, face-down, player counters and commander damage buttons, and a phone-width look.
4. The ONE rules change: this shape, plus the size and shape limits, the `lastSeen` deletion fix and the table code format check. Then the full mutation run, Kevin pastes, `npm run test:live`.
5. Token data build (`tokens.json`), then the token panel: related tokens, search, art picker and the custom art link, on top of the fixed shape.
