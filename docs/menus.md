# Right-click menus: plan (draft, 2026-11-15; Kevin's first answers are in, nothing is built)

Kevin asked for a plan for menu options on more parts of the table: for example, right-clicking the library to choose "View library", "Draw card", "Draw X cards". This file lists every place a menu could live, what each place has today (checked in the code on 2026-11-15), what we will add, and what is still open. Lines marked "Proposed" are drafts until Kevin says yes; lines marked "Decided" are Kevin's answers.

## Decided so far (Kevin, 2026-11-15)
1. Scry and Surveil get their own small window, and "Exile top X" is in the library menu.
2. The commander's tax stays by hand. "Cast commander" does not change the tax.
3. No "Tidy the battlefield" line. (The Auto-arrange button was removed from the solo table on 2026-11-14 and it does not come back in a menu.)
4. A picked group (the cards picked with a rectangle): still to be answered, see area 7.
5. Tokens: a "Tokens" menu with three sections: tokens made by the cards in your deck, the most commonly used tokens, and a search bar for every token. See area 11.
6. A random discard is wanted, and the hand menu gets a Mulligan line (as well as the button on the bar).

7. **Library menu, from Kevin's sketch (2026-11-15):** Draw card; Draw X cards (popup); View library; View, which opens Top card and Top X cards; Shuffle; Scry, Surveil and Mill, each with a small number box inside its own line (starts at 1, changeable, click the word to do it with that number); Exile top X (popup); Reveal top X (popup); Play with top revealed. Reveal top X also works on the solo table (a window marked "revealed"). Play with top revealed shows the real top card face up on your library for you and, on the live table, for the other players (that needs a new public field and a rules change that Kevin pastes, so the live part comes with the table page).
8. A right-click on a picked card acts on the whole group (area 7).
9. Common tokens: the list in area 11, plus the ones the data adds (Eldrazi Spawn, Thopter, Elf Warrior, Squirrel, Beast, Angel 4/4, Dragon 5/5). The data (the 3,000 most played Commander cards) has no 4/4 Dragon token: the dragons are a 5/5 and a 6/6.

10. **Graveyard window and battlefield card, from Kevin's notebook (2026-11-15, two photos):** the graveyard's "View" opens a pop-up window with a search bar, a right-click on its cards to label or note them (and the search also looks in the notes), a filter for type, color and so on, and dragging over several cards to pick them, then sending all of them to the battlefield, exile, library and so on. A battlefield card's menu: Tap / Untap, Add +1/+1 counter, Add counter (a list that starts with Stun, "etc"), Move to (hand, GY, Exile, "etc", and something called "custom"), Phase out, Create copy, Create token (only when the card is related to a token), Add loyalty token (only for a planeswalker and the like). Details in areas 2 and 7; nothing built yet.

## Built so far
- 2026-11-15, log entry 203: the X box, the library / graveyard / exile menu changes (View, Draw card, Draw X, Look at top X, Mill X, Exile top X, Exile all, Shuffle into library) and the counters X line. Not built yet: the View submenu, the inline number boxes, Scry and Surveil, Reveal top X, Play with top revealed.

- 2026-11-15, log entry 204: the library menu from the sketch (View submenu, number boxes inside Scry, Surveil and Mill, the Scry / Surveil window, Reveal top X, Play with top revealed, solo only). Not built: showing revealed cards to other players (needs a rules change).- 2026-11-15, log entry 205: the hand menu (an arrow next to the hand count: Mulligan, Shuffle hand into library, Discard X at random, Discard hand), the lines of a hand card (Play, Discard, Exile, top and bottom of the library) and Flip double-faced card as a look at the back face. Solo only. Kevin said "custom" in his battlefield-card notes is under Add counter (a typed counter name), not under Move to.
- 2026-11-15, log entry 206: Draw card flies like the button, Auto starts off, the library's Mill and Exile top X became Move top X cards (Graveyard, Exile, Exile face down on solo), View has top and bottom, headings open boxes beside them with a turning arrow, thin pill hand bar and pile names.
- 2026-11-15, log entry 207: Shift+click picks several cards of the hand; a right-click on a picked card opens a menu for all of them (Play, Discard, Exile, Top and Bottom of library with an order window, Move to). The group menu of the battlefield's picked cards is still to build.
- 2026-11-15, log entry 208: every picked hand card comes up, the order window glides and has Random order, a click on the library does not open it, pile windows in 7 columns with Top and Bottom marked, a picked group can be dragged (onto the battlefield or a pile), hand menus without the sideboard. Still to decide: the card details popup (needs rules text in the card data).
- 2026-11-15, log entry 209: View details on every card (the window with the large card and its rules); the rules are built into /data/rules/XX.json by the card list build (list format 10).
- 2026-11-15, log entries 210 and 211: group drag as one picture, the order window fixes, sharp pile windows, Alt picture turns with Q and E, and Add counter on battlefield cards (99 counters from the real rules text, a search field, Custom... for a name of your own, Mana icons). Solo only. Rulings in the details window: waiting for Kevin.

## How the menus work today (so the plan fits it)
- One menu component, `frontend/src/card-menu.js`, draws every menu (a title, items, items with quick amounts, headings that open a submenu, keyboard use).
- What a menu offers and does is plain data in `shared/` with Node tests, and the page runs the action through its own `apply()`: `shared/card-menu.mjs` (a card), `shared/pile-menu.mjs` (a pile), `shared/player-counters.mjs` (the life total).
- Rule already in use: nothing is offered that could not do anything (no Shuffle for a library of one card).
- Right-click handlers exist today on: a card (hand, battlefield, command zone and a pile's cards in the viewer), the library, graveyard, exile and sideboard piles, and the life total. Nothing else has a menu: the hand bar, the empty battlefield, the turn number, the floating bar, the command-zone slots.

## One new piece every area would share
A small "X" box: choosing "Draw X...", "Mill X...", "Look at top X...", "Exile top X..." or "Create X tokens" opens a tiny number field next to the menu (Enter to do it, Escape to cancel, it remembers the last number). The life total already has a typed-number control (`shared/life-input.mjs`), so this is the same idea.

## The areas

### 1. Library (your pile at the left of the zones row)
- Today: Search..., Shuffle, Draw (click = 1, or 2, 3, 4, 5, 7), Look at the top card (2, 3, 4, 5, 10), Mill (2, 3, 5, 10).
- Decided/Proposed: "View library" (the existing Search...), "Draw card" and "Draw X...", "Look at top X...", "Mill X...", **"Exile top X..."**, **"Scry X..." and "Surveil X..."** (each opens its own small window: the top X cards shown, each one sent to the top or the bottom of the library, and for surveil also to the graveyard, then Done), "Shuffle", "Reveal top card" (live table only, shows it to the table), and a toggle "Keep the top card revealed".

### 2. Graveyard
- Today: Search..., Move all to (hand, battlefield, exile, sideboard, top or bottom of the library).
- Proposed: "View graveyard", keep Move all to, add "Exile all" and "Shuffle into library" as direct lines.
- Open: should the top card of the graveyard be right-clickable on its own (the menu of that card), or is the viewer enough?
- **Kevin's notebook (2026-11-15), the graveyard window ("View"), which every pile window would share:** search bar (exists: `shared/card-search.mjs`); right-click a card in the window to give it a label or note, and the search matches notes too (new: notes exist today only on battlefield cards, `setNote` in `shared/zones.mjs`, and are cleared when a card leaves it); a filter for types, colors and so on (new: the card list has the type line, colors and cost, so this is a row of toggles above the cards); drag across several cards to pick them, then one action sends all picked cards to the battlefield, exile, library and so on (new: the "Move all to" line works on the whole pile today, not on a pick). How I read it: these four go in the pile window of every pile (library when viewed, graveyard, exile, sideboard), not only the graveyard.

### 3. Exile
- Today: same as the graveyard.
- Proposed: "View exile", keep Move all to.
- Open: do you exile cards face down, and should the pile say so?

### 4. Command zone (the two gold slots)
- Today: the commander is a card: its menu has Move to and so on; the tax is a number you change by hand.
- Decided/Proposed: on the commander: "Cast commander" (moves it to the battlefield, **the tax is not touched**), "Tax +2 / -2 / Reset" lines for the hand setting; on an empty slot: "Choose a commander..." (a card of the deck).
- Open: when a commander goes to the graveyard or exile, offer "return to the command zone?" or leave it to Move to?

### 5. Hand: a card, the count, and the gap
- Today: a card in the hand has only Move to (and Play back for modal cards). The "Hand: N" bar has the sort buttons and no menu.
- Proposed on a hand card: "Play" (to the battlefield), "Discard" (to the graveyard), "Exile", "Put on top of library", "Put on bottom of library", "Reveal" (live table).
- Decided/Proposed on "Hand: N" or the gap between the cards: "Draw card", "Draw X...", **"Discard X at random..."**, "Discard hand", "Shuffle hand into library", **"Mulligan"**, "Reveal hand" (live table), and the two sort lines ("Auto sort on/off", "Sort").

### 6. Battlefield: the empty space
- Today: nothing; a right-click on empty space does nothing.
- Proposed: "Untap all", "Tap all" (rare), "Pick all lands", "Pick all creatures" (feeds the group that E, Q, F and drag already work on), "Tokens" (see 11), "Clear the picked group". **No Tidy (decided).**
- Open: do you want "Pick all lands" and friends, or is the rectangle enough?

### 7. A card on the battlefield, and a picked group
- Today: Modify..., Tap/Untap, Flip, Turn over (two-sided only), Doesn't untap, Summoning sick, +1/+1 counter (2, 3, 5), Create copy, Ping (live), Move to.
- Proposed: "Add counter..." (a choice of kinds: +1/+1, -1/-1, loyalty, charge, and a typed name later), "Remove all counters", "Set note...", "Untap all of this name" (e.g. all Forests), "Move to" stays last.
- **Kevin's notebook (2026-11-15), the card's menu, in his order:** Tap / Untap; Add +1/+1 counter; Add counter, which opens a list (Stun first, "etc"); Move to, which opens Hand, Graveyard, Exile and "etc" and a "custom"; Phase out; Create copy; Create token (offered only when the card is related to a token: the `all_parts` data in the plan for tokens); Add loyalty token (only for a planeswalker or the like). How I read it: "Add counter" is a submenu of kinds (+1/+1, -1/-1, loyalty, charge, time, stun, other); "loyalty token" means a loyalty counter, offered on a card whose type has Planeswalker (and Battle, for its defense counters). Stun is not one of the six kinds the game stores today (`COUNTER_KINDS` in `shared/zones.mjs`), and Phase out does not exist at all yet: both need new stored fields (and a rules change before they work on the live table).
- **A picked group, question for Kevin (the answer is not in yet):** when several cards are picked with a rectangle, E, Q and F act on all of them and dragging moves all of them, but right-clicking one of the picked cards opens the menu for that one card only. Should the menu act on every picked card when the card is one of them? Proposed: yes, the title says "3 cards", and Tap, Move to, counters, Create copy all apply to the whole group.

### 8. Face-down and notes (card level, a possible later piece)
- Flip exists. The plan would add "Exile face down" to the exile menu and the card menu. Not urgent.

### 9. Life total
- Today: the counters menu (poison, energy, experience, rad, ticket, speed, Ring, monarch, initiative, city's blessing).
- Proposed: add "Set life..." (typed number) and "Reset life" at the top; commander damage lines on the table page (the data exists, `game.cd`).

### 10. Turn number (in the floating bar)
- Today: nothing.
- Proposed: "Next turn", "Set turn...", "Untap all and draw" (what Next turn does on the solo table).

### 11. Tokens (Decided: three sections)
The menu is "Tokens" (on the empty battlefield, and later on a card). Its three sections:
1. **From your deck:** the tokens that the cards of your deck make (Krenko, Mob Boss lists a Goblin; Smothering Tithe lists a Treasure).
2. **Common:** the most used tokens, a fixed short list: Treasure, Food, Clue, Blood, Map, 1/1 Goblin, 1/1 Soldier, 1/1 flying Spirit, 2/2 Zombie, 1/1 Saproling, 1/1 Squirrel, 1/1 flying Thopter, 0/1 Eldrazi Spawn, 3/3 Beast, 4/4 flying vigilance Angel, 5/5 flying Dragon (checked against the 3,000 most played Commander cards on 2026-11-15: log entry 203).
3. **Search all tokens...:** a small window with a search bar over every token, by name or type, and a "How many" number (the X box).
Choosing one makes it on the battlefield with the logic that exists (`createToken`: name, type line, power and toughness, colors); tokens with the same name and look pile up as a stack. A token that leaves the battlefield stops existing, as now.

What the data gives us (read from Scryfall's bulk file `oracle_cards`, cached 2026-11-05, on 2026-11-15):
- 938 token records, 862 different faces (name, type line, power and toughness, colors). A token record has the name, `type_line`, `power`, `toughness`, `colors`, `oracle_text`, `keywords` and `image_uris`, so everything a token needs is there.
- 4,891 of the 39,287 cards have a `related card` list (`all_parts`) with entries marked `component: "token"`, each with the token's name, type line and Scryfall id (Krenko, Mob Boss: `Goblin`, `Token Creature — Goblin`; Smothering Tithe: `Treasure`). That is the "from your deck" link.
- A catch: the entry's id is one specific printing of the token, and only 1,655 of the 4,699 token entries match a token record in `oracle_cards` (that file keeps one printing per card). The other file the build downloads, `default_cards` (every printing), has the rest, so the token list has to be built from it. `default_cards` has 3,049 token printings. Tokens share a name and type line with different power and toughness or colors: checked in that file, `Goblin` (`Token Creature — Goblin`) is 1/1 red on 59 printings (Krenko, Mob Boss points at one, set tfdn), 1/1 black and red on 1 and 2/1 red on 2. So the id, not the name, is what the link must follow, and the token list must keep each different face.
- Size guess, to be measured when it is built: about 860 faces is roughly 60 KB as plain JSON and under 20 KB compressed; the card-to-token links for 4,891 cards are more (an estimate of 100 to 150 KB, compressed less). They would be a separate file fetched when the Tokens menu is first opened, not part of the 1.4 MB card list.
- Fan-content note: token pictures are Scryfall card images, the same kind as the card pictures already used.

### 12. The floating bar (its grip)
- Proposed: right-click the grip: "Dock top / bottom / left / right", "Reset position".

### 13. Other players' areas (the table page, later)
- Their battlefield cards: "Ping" (exists), "Look" (the hover picture already does it). Their graveyard and exile: "View" (public zones, read only). Their library and hand: nothing (hidden). Commander damage to you belongs on YOUR panel (the data path exists).

### 14. Not menus (kept for completeness)
- The deck page already has a right-click on its cards for the printing; the lobby needs none.

## Cross-cutting decisions still to make
1. Order inside a menu: most used first, "Move to" and destructive lines last, no confirmation for anything the player can undo by hand.
2. Show the keyboard shortcut beside a line where there is one (E and Q tap, D draws, F flips).
3. Wording: "View" or "Search" for a pile (the plan uses "View"); "Draw card" or "Draw 1".
4. Touch: a long press opens the menu (the hover features still have no touch version; phones are on hold).
5. Undo: a menu cannot undo a mis-click; should we plan an "Undo" at the same time (a list of the last actions with a way back)? It is a bigger piece.
6. Tests: each area gets its items and actions as plain data (as `pile-menu.mjs` does) with Node tests, plus one browser check that the right-click opens the right menu.

## Suggested order of building (smallest first)
1. The X box and the library, graveyard and exile changes (areas 1, 2, 3): most of it is already data in `pile-menu.mjs`. Scry and surveil windows after it.
2. The hand card and hand bar menus (5), including the random discard and Mulligan.
3. The battlefield empty-space menu and the picked-group menu (6, 7).
4. The command zone (4), the life and turn lines (9, 10), the grip (12).
5. Tokens (11): first the token list and the card links in the build (a data step with its own tests), then the three-section menu and the search window; then the table-page areas (13).
