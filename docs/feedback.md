# Feedback from people outside the project

My friends played the game and gave me feedback, and I passed their lists to the AI as they were written. This page keeps each thing they asked for, what I changed because of it, and the log entry where the change is written up. It answers two comments from my professor: "For Artifact 5, record in the log when someone outside the team plays the game and what they said", and "When you do the UI overhaul, note in the log which friend feedback led to each change."

## Who played, and what is not recorded yet
- Friends played the solo table and gave me four lists of feedback. Two lists reached the log on 13 November 2026 and two on 15 November 2026.
- I did not write down who played or on which day, so the dates here are the days I gave each list to the AI. From now on I add each playtest here when it happens, with the day, who played and what they said.

## List 1, 13 November (log entry 173)
- **Wheel zoom on the Alt picture.** While holding Alt over a card, the scroll wheel should make the larger picture bigger or smaller. Up now makes it a tenth bigger and down a tenth smaller, between half and double the normal size, and the size is kept in the browser.
- **A smaller drop area for an empty hand.** The dotted box shown when you drag a card from the battlefield to an empty hand was too big. With no cards in the hand, the drop area now starts at the bottom of the battlefield.
- **A card count for the hand.** They wanted to see how many cards they hold, like "Hand: 7", when the pointer is over the hand. A small pill under the middle of the hand now shows it.
- **Pile names with menu arrows.** The library, graveyard and exile should be named above the pile like the command zone, with an arrow that opens a menu. Each pile now has its name above it and an arrow that opens the pile's menu.
- **Sorting the hand.** They wanted the hand sort that I had been skipping. I added Color, Type and Cost buttons that change how the hand is shown without changing its real order.

## List 2, 13 November (log entry 176)
- **Q taps and untaps.** Q should do what E does. It now does.
- **The commander tax above each commander.** The tax counter now sits above each commander.
- **Words under the command zone.** The words "Command zone" now sit below the two slots, centred between them.
- **Bigger pile numbers.** The number on a pile should be twice as large, at the bottom of the top card, or at the bottom right when the pile is tapped. It is now twice as large and placed there.
- **Picking several cards at once.** Dragging a rectangle over empty battlefield now picks every card it touches, and E, Q and F act on all of them. Moving the whole group together was not part of this change.
- **Mana costs only on hover.** The cost of a card in the hand now shows only on the card under the pointer or the clicked card.
- **A switch for sorting.** A "Sort: On / Off" switch now sits next to the sort buttons.
- **Cards you place by hand stay put.** A card dragged by hand in a sorted hand now keeps its new place until a sort changes.
- **Land order in Settings.** Settings now has a row for the order of non-basic and basic lands.
- **No text picking, and Tab opens Settings.** Cards can no longer be picked up like text or reached with Tab, and Tab now opens Settings.
- **D draws.** D now draws a card.

## List 3, 15 November, eight points (log entries 210 and 211)
- **The carried group looked alone.** Dragging picked cards showed one card with the others as a separate pile behind it. The cards are now layers inside one picture, with a count like "2x".
- **An empty order window.** Clicking outside the order window left it empty, because it borrowed the hand's card buttons. It now draws its own pictures, and a click on the dark space around it does nothing else.
- **The order window should shift cards aside.** While a card is dragged, the cards between its old and new place now slide aside like in the hand, and the arrows are new icons.
- **Blurry pile windows.** The pile windows looked blurry and had a border round each card. They now use the normal-size pictures, have no frame and are wider.
- **Q and E turn the Alt picture.** With Alt held over a card, Q and E now turn the larger picture a quarter turn each way.
- **Mana symbols.** They suggested the open-source Mana icons for the tap symbol and others. I added 43 of them and draw them in a card's rules text and on counters.
- **Add counter.** A menu item on battlefield cards with the common counters, using the wiki's full list as the reference. It has 99 counters, a search box and a Custom option.
- **A question about rulings.** They asked if the card details would include rulings. I measured the cost, and built them after I said yes (list 4).

## List 4, 15 November (log entry 212)
- **Rulings in the card details.** They said to add them, and that the storage cost on the player's side is fine. The card details now end with a Rulings section with each ruling's date and author.
- **Picked hand cards in a row overlap.** Picked cards that are next to each other should overlap as if resting. They now do.
- **Dragged hand cards overlap on the battlefield.** Several cards dragged from the hand should overlap on the battlefield and not go to a corner. The one dragged lands where it is let go and the others sit behind it.
- **Missing counters.** They asked me to check the wiki's list for counters I had missed. I compared it with the rules text of our cards and added 119, so there are 218.
- **Top and Bottom labels off centre.** The labels in the library window pushed the card off centre. The label is now drawn over the card's top edge and the card keeps its place.

## List 5, 26 November (log entries 295 to 299, and the steps after)
Friends played live tables and the Shared view and sent 60 points, in the file `Overloaded_feedback_11-26.txt`. I gave it to the AI and asked it to work through them in steps, like the redesign. Each point is listed with what happened to it; "planned, step N" means it is not built yet.

Done before the steps:
- **Piles move faster.** A pile now moves as a whole after 175 ms (entry 297).
- **Bigger piles under the battlefield.** The library to the commanders are larger and sit just under the battlefield (entry 295).

Step 1, bugs:
- **Two commander taxes shown as one** for other players (+2 and +2 shown as +4). Done in step 1 (entry 298).
- **Tax hidden from others once the commander is out.** Done in step 1 (entry 298).
- **Last match's tax still there in a new match.** Done in step 1 (entry 298).
- **Both command zones always shown,** also for other players. Done in step 1 (entry 298).
- **The moves history repeating the same line** (setting tax to 0). Done in step 1 (entry 298).
- **Players not shown in the color they chose,** and everything of theirs (name, tax, highlights) in their color. Done in step 1 (entry 298).
- **Foil disappearing under the pointer.** Done in step 1 (entry 298).
- **Stack arrows glitching** when cards scroll in and out, and no scrolling while dragging an arrow. Done in step 1 (entry 298).
- **A left click on the library should not open it** on the live table. Done in step 1 (entry 298).
- **Surveil should offer only top and graveyard.** Done in step 1 (entry 298).
- **Moxfield tags in a decklist should be ignored.** Done in step 1 (entry 298).

Step 2, decks and the lobby:
- **Adding a deck in the lobby:** Done did nothing until Check deck was pressed. Done in step 2 (entry 299): Add deck reads the list, Done appears with the deck, and a card shows the name on its art.
- **Edit and remove decks from the lobby.** Done in step 2 (entry 299): Edit and Delete on each deck tile.

Step 3, table controls and settings:
- **Buttons for numbers in menus** (Scry, Surveil, Draw X and the rest). Done in step 3 (entry 300): − and + and buttons 1 to 7.
- **Right-click on Draw draws 3.** Done in step 3 (entry 300).
- **Untap all and Draw move the step of the turn on,** and a button that moves to the next step. Done in step 3 (entry 300): Next step in the control bar.
- **A keybind to send a card to the command zone** (unbound at first). Done in step 3 (entry 300).
- **A key that toggles the big card picture.** Done in step 3 (entry 300): Alt toggles it.
- **The "Back to your graveyard" pill in the center** instead of the top right. Done in step 3 (entry 300).
- **An eye button in Settings** to look at the board, like the pile windows have. Done in step 3 (entry 300).
- **A hand card size setting.** Done in step 3 (entry 300): Card size, 70% to 150%.
- **Louder sounds and a volume slider.** Done in step 3 (entry 300): 12 dB louder; the slider was already there.
- **A vertical style for untapped piles.** Done in step 3 (entry 300): (B) Vertical.
- **Easier Shift-picking of hand cards.** Done in step 3 (entry 300): Shift and a drag from a card.
- **Hand sorting in Settings as columns,** collapsible, with the up and down arrows stacked on the right. Done in step 3 (entry 300).

Step 4, tools that move:
- **The turn bar movable like the control bar.** Done in step 4 (entry 301): a grip on the turn; it floats and docks like the control bar.
- **The stack movable and collapsible** like the game history. Done in step 4 (entry 301): a click on its title folds it, a drag moves it out of the rail.

Step 5, help:
- **A help window when a game starts,** with the keys and basics of that view, and "don't show again" that Settings can undo. Done in step 5 (entry 302): one per view, with switches in Settings > About.

Step 6, multiplayer (one database rules change):
- **Foil on other players' boards.** Done in step 6b (entry 304): foil is stored with the card, so others see it and a reload keeps it.
- **Rotate a card 90 degrees,** separate from tapping. Done in step 6b (entry 304).
- **The pinger closes a ping for everyone,** and the pinged player can acknowledge it. Done in step 6b (entry 304): Close for all, and Seen.
- **Choosing who goes first in the lobby,** with a slot-machine animation. Done in step 6b (entry 304).
- **Swapping seats, kicking a player, a "Ready?" ping from the host,** and the lobby's seat order deciding where players sit. Done in step 6b (entry 304): Sit here, the host's seat menu (move or swap), Ready? and Remove.
- **Other players' hand and piles turned like their board.** Done in step 6a (entry 303): "Turned, with hand and piles" in Settings.
- **"Add a card" from the battlefield's menu,** from the card list. Done in step 6a (entry 303).
- **Random token art,** and choosing an art also changes the token's front. Done in step 6a (entry 303).
- **Flipping cards in the hand,** playing them face down, and face-down exile that others must ask to see. Cut from step 6 (entry 304): the largest item; still on the to-do list.

Step 7, the Shared view:
- **The table turned to each player's seat,** Ctrl+Q and Ctrl+E to turn it, and clicking a player turns to their board. Done in step 7 (entry 307): a top seat sees the table turned half a turn, and cards face their owner.
- **A 12-dot gap between the left and right players.** Done in step 7 (entry 307).
- **No "Commons" text.** Done in step 7 (entry 307).
- **Name, life and hand count pills in the middle of each board,** life adjusted there, and Life gone from the control bar. Done in step 7 (entry 307): every pill has - and +, another player's after the rules paste.
- **Each player's hand face down below their board.** Done in step 7 (entry 307).
- **The piles and command zones on the board,** at each player's edge. Planned, step 7b (the rules already allow the wider table).
- **Tapping and dragging other players' cards,** several at once. Tapping done in step 7 (entry 307, after the rules paste); dragging several of anyone's at once still planned.
