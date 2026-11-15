# Right-click menus: plan (draft, 2026-11-15, nothing decided yet)

Kevin asked for a plan for menu options on more parts of the table: for example, right-clicking the library to choose "View library", "Draw card", "Draw X cards". This file lists every place a menu could live, what each place has today (checked in the code on 2026-11-15), what I propose to add, and the questions for Kevin. Nothing here is built. Each "Proposed" line is a draft.

## How the menus work today (so the plan fits it)
- One menu component, `frontend/src/card-menu.js`, draws every menu (a title, items, items with quick amounts, headings that open a submenu, keyboard use).
- What a menu offers and does is plain data in `shared/` with Node tests, and the page runs the action through its own `apply()`: `shared/card-menu.mjs` (a card), `shared/pile-menu.mjs` (a pile), `shared/player-counters.mjs` (the life total).
- Rule already in use: nothing is offered that could not do anything (no Shuffle for a library of one card).
- Right-click handlers exist today on: a card (hand, battlefield, command zone and piles' cards in the viewer), the library, graveyard, exile and sideboard piles, and the life total. Nothing else has a menu: the hand bar, the empty battlefield, the turn number, the floating bar, the command-zone slots.

## One new piece every area would share
A small "X" box: choosing "Draw X...", "Mill X...", "Look at top X..." opens a tiny number field next to the menu (Enter to do it, Escape to cancel, it remembers the last number). The life total already has a typed-number control (`shared/life-input.mjs`), so this is the same idea. Without it the menus need a long list of fixed amounts.

## The areas

### 1. Library (your pile at the left of the zones row)
- Today: Search..., Shuffle, Draw (click = 1, or 2, 3, 4, 5, 7), Look at the top card (2, 3, 4, 5, 10), Mill (2, 3, 5, 10).
- Proposed: rename Search... to "View library" and keep Search inside the viewer; "Draw card" (1) and "Draw X..."; "Look at top X..."; "Mill X..." ; "Exile top X..." (for effects that exile from the top); "Scry X..." and "Surveil X..." (look at the top X, then send each card to the top or the bottom, or to the graveyard for surveil: needs a small viewer with buttons); "Shuffle"; "Reveal top card" (live table only, shows to the table); a toggle "Keep the top card revealed" (some cards play with it revealed).
- Questions: do you want Scry and Surveil built as their own little window? Is "Exile top X" worth a line?

### 2. Graveyard
- Today: Search..., Move all to (hand, battlefield, exile, sideboard, top or bottom of the library).
- Proposed: "View graveyard" (the viewer, as now), keep Move all to, add "Exile all" and "Shuffle into library" as direct lines (the two most common), "Return a random card to hand" is probably too rare.
- Question: should the top card of the graveyard be right-clickable on its own, like a card (the menu of that card), or is the viewer enough?

### 3. Exile
- Today: same as the graveyard.
- Proposed: "View exile", keep Move all to; later, cards exiled face down (a card-level mark, see 8).
- Question: do you ever exile face down, and should the pile say so?

### 4. Command zone (the two gold slots)
- Today: the commander is a card: its menu has Move to and so on; the tax is a number you click.
- Proposed: on the commander: "Cast commander" (to the battlefield and the tax goes up by 2, with the tax shown), "Tax +2 / -2 / Reset"; on an empty slot: "Choose a commander..." (a card of the deck). Partner commanders: both slots are used.
- Questions: should "Cast commander" raise the tax by itself, given that you manage the tax by hand today? What about "Move to" for a commander that goes to the graveyard: ask "return to the command zone?" (a rule you would do by hand).

### 5. Hand: the card, the count and the empty space
- Today: a card in the hand has only Move to (and Play back for modal cards). The "Hand: N" bar has the sort buttons and no menu.
- Proposed on a hand card: "Play" (to the battlefield), "Discard" (to the graveyard), "Exile", "Put on top of library", "Put on bottom of library", "Reveal" (live table). Proposed on "Hand: N" or the gap between the cards: "Draw card", "Draw X...", "Discard X at random...", "Discard hand", "Shuffle hand into library", "Mulligan" (it is a button on the bar today), "Reveal hand" (live table), and the two sort lines ("Auto sort on/off", "Sort").
- Questions: is a random discard something you use, and do you want "Mulligan" here as well as on the bar?

### 6. Battlefield: the empty space
- Today: nothing; a right-click on empty space does nothing.
- Proposed: "Untap all", "Tap all" (rare), "Pick all lands", "Pick all creatures" (feeds the group that E, Q, F and drag already work on), "Create token..." (see 11), "Tidy the battlefield" (the old Auto-arrange, which you removed from the bar; it could live here), "Clear the picked group".
- Questions: do you want Tidy back here at all? Should "Pick all lands" and friends exist, or is the rectangle enough?

### 7. A card on the battlefield
- Today: Modify..., Tap/Untap, Flip, Turn over (two-sided only), Doesn't untap, Summoning sick, +1/+1 counter (2, 3, 5), Create copy, Ping (live), Move to.
- Proposed: "Add counter..." (a choice of kinds: +1/+1, -1/-1, loyalty, charge, and a typed name later), "Remove all counters", "Set note...", "Untap all of this name" (e.g. all Forests), "Move to" stays last.
- With a PICKED GROUP (the rectangle): the same menu acts on the whole group ("Tap group", "Move group to", "Create copies", "Counters on all"). Right now E, Q and F act on the group but the menu acts on one card.
- Questions: should the menu of a picked card act on the group when the card is in the group? (My recommendation: yes, and the title says "3 cards".)

### 8. Face-down and notes (card level, a possible later piece)
- "Exile face down" and "Put face down" marks already exist as Flip; the plan would add them to the exile menu. Not urgent.

### 9. Life total
- Today: the counters menu (poison, energy, experience, rad, ticket, speed, Ring, monarch, initiative, city's blessing).
- Proposed: add "Set life..." (typed number) and "Reset life" at the top; commander damage lines on the table page (the data exists, `game.cd`).

### 10. Turn number (in the floating bar)
- Today: nothing.
- Proposed: "Next turn", "Set turn...", "Untap all and draw" (what Next turn does on the solo table).

### 11. Tokens
- "Create token..." needs the token list (the plan in `docs/scryfall.md` keeps tokens in their own small list, which is not built). A first version could offer the common ones with fixed text (Treasure, Food, Clue, Blood, a 1/1 Soldier, a 1/1 Spirit, a 2/2 Zombie) and a "Custom..." line using the existing `createToken` logic.
- Question: which tokens do you make most?

### 12. The floating bar (its grip) and the zones row
- Proposed: right-click the grip: "Dock top / bottom / left / right", "Reset position". Right-click the zones row's empty space: nothing needed.

### 13. Other players' areas (the table page, later)
- Their battlefield cards: "Ping" (exists), "Look" (the hover picture already does it). Their graveyard and exile: "View" (public zones, read only). Their library and hand: nothing (hidden). Their life: nothing to change; "Commander damage to me" belongs on YOUR panel (the data path exists).
- Question: should you be able to right-click another player's card to "Ask for a move" (probably not: out of scope).

### 14. Not menus (kept for completeness)
- The deck page already has a right-click on its cards for the printing; the lobby needs none.

## Cross-cutting decisions to make
1. Order inside a menu: most used first, "Move to" and destructive lines last, no confirmation for anything the player can undo by hand.
2. Show the keyboard shortcut beside a line where there is one (E and Q tap, D draws, F flips).
3. Wording: "View" or "Search" for a pile; "Draw card" or "Draw 1".
4. Touch: a long press opens the menu (the hover features still have no touch version; phones are on hold).
5. Undo: a menu cannot undo a mis-click; should we plan an "Undo" at the same time (a list of the last actions with a way back)? It is a bigger piece.
6. Tests: each area gets its items and actions as plain data (as `pile-menu.mjs` does) with Node tests, plus one browser check that the right-click opens the right menu.

## Suggested order of building (smallest first)
1. The X box and the library and graveyard changes (areas 1, 2): most of it is already data in `pile-menu.mjs`.
2. The hand card and hand bar menus (5).
3. The battlefield empty-space menu and the group menu (6, 7).
4. The command zone (4), the life and turn lines (9, 10).
5. Scry and surveil, tokens (1, 11), then the table-page areas (13).
