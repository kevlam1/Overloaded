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
