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
- **Custom art is shared with the table through an image link** (Kevin's choice over Claude's recommendation of keeping it in the
  uploader's browser only). Claude's objection, recorded: every other player's browser fetches that link, so whoever runs the image host
  learns each opponent's IP address and when they looked (a player could log everyone at the table with their own server), and the
  table shows whatever image a player links. To limit that, ONLY named hosts are allowed: to start, Imgur direct links
  (`https://i.imgur.com/<id>.<png|jpg|jpeg|webp|gif>`) and Scryfall's own pictures (already allowed). The page and the database rules
  both check the link against that list. **Adding a host later means a change to `vercel.json` (`img-src`), the rules and the checks, and
  another mutation run, so say now if more hosts are wanted.** Not decided: whether to allow more hosts (Discord's links expire, so they are a poor fit).

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
| `au` | custom art link | the allowed hosts only, at most 120 characters (see above) |

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

## Open questions
- **Face-down hides nothing yet.** A face-down card's name is in the public data, so a technical opponent could read it. Real hiding means
  publishing a masked card and keeping the real identity in the private branch. Decide when face-down is built; until then it would be
  a visual flag only and the page should not claim more.
- Which image hosts besides Imgur (above).
- Whether a table sees a token's custom art only when the viewer opts in (a setting like "show other players' custom art") as a
  safety valve. Not planned; worth it if the privacy concern above bothers us in practice.

## Build order (each step small, tested, committed when Kevin asks)
1. **DONE 2026-11-04** `shared/zones.mjs` and `shared/game-sync.mjs`: counters (with +1/+1 and -1/-1 cancelling), the modifier, notes, face-down,
   token creation and copying (a token that leaves the battlefield disappears, everything battlefield-only is cleared on leaving), the
   player counters and commander damage, all stored and read back, with `scripts/test-counters.mjs` (232 checks, 59 of 59 broken copies caught)
   and `scripts/test-sync-counters.mjs` (82 checks, 44 broken copies run: 42 caught at first, one survivor then got a test and is caught, one is
   redundant because an array already fails the counter key check). NOT done in this step: the position fields
   `px`, `py` (reserved in the plan, no code yet), custom art `au` (step 2), and `faceDown` hides nothing from other players.
   Decided while building: a copy of a real card keeps its cost and keywords through the database because a token's cost and keywords are
   looked up by id only (never by name, since 87 token names equal real card names).
2. `shared/token-art.mjs`: the one function that says whether an art link is allowed (used by the page and mirrored in the rules), with tests.
3. The buttons for counters, notes, face-down and player counters on the solo and live tables.
4. The ONE rules change: this shape, plus the size and shape limits, the `lastSeen` deletion fix and the table code format check. Then the full mutation run, Kevin pastes, `npm run test:live`.
5. Token data build (`tokens.json`), then the token panel: related tokens, search, art picker and the custom art link, on top of the fixed shape.
