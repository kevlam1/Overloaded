# Design notes (from Kevin's "First in-depth thoughts", 2026-10-25)

Claude's restatement of Kevin's notes. The original PDF is outside the repo, in `../Unit 5/`, and is not copied here on purpose. **Do not name the reference products from that PDF in any file.** Describe them by what they do instead ("a digital Magic client", "a web tabletop site").

Each section has **Kevin wants** (his notes) and **Claude's notes** (questions and risks, written 2026-10-25 before any checks; where a later check changed a note, the note says so and points to `scryfall.md`).

## The product
**Kevin wants**
- A web site for playing Magic: The Gathering on phones, tablets, laptops and desktops.
- Players bring their own decks from popular deck-building sites (Moxfield, Archidekt, ManaBox and so on).
- The focus is the tabletop game itself. A deck builder comes later, if there is time.
- Players see life totals and cards, as if playing in person or in a digital Magic client.

**Claude's notes**
- Phones and tablets mean touch: no hover and no `Alt` key. Each hover feature needs a touch version, such as a long press.
- Import is safest as pasted text (the export each site offers). Reading a site's API directly is unverified, and some may not have a public one. Check each site's export format before building.

## Lobby
**Kevin wants**
- A "create lobby" button. The host shares a link like `overloaded.vercel.app/lobby/ABC1234` or a code typed into a box. Same concept as PokeGuess.
- Players pick any name. **No accounts.**
- The host picks the number of seats. Players ready up, then the host starts.

**Claude's notes**
- This settles "who starts" (the host) and "custom link" (a generated code, not a chosen name). See `private-lobby.md`.
- Still open: does changing a deck unready a player?

**Kevin's lobby layout idea (2026-10-29, from a screenshot of another site he shared; the screenshot is not in the repo, and he wants a much simpler version)**
- Players import their deck and can change it in the lobby, not only on a separate page.
- What the screenshot had, to pick from: a deck picker (a search box, sort and filters, a grid of deck tiles with art, name, size and colors, the chosen one highlighted, a "random deck" choice and a "My decks: paste to add more" entry); a large preview of the chosen deck's commander with a short description; a table panel with the share link and a Copy button, a private or public toggle, the format, the player count and a few setting chips; the list of seats ("1 / 4") with a badge for the host and for you, open seats that say "anyone with the link", an "add chair" button; and at the bottom a "Preview deck" button and a start button that stays off until at least 2 players are in (**Kevin, 2026-10-29: he does not need this "off until 2 are ready" rule in his version**).
- Claude's notes: this fits the plan. A first version needs only: your saved deck (name, card count, commander) shown in your seat, a Change deck button that opens the import and picker, a Ready button that needs a deck, other players' deck names and commanders shown in their seats, and a Preview deck button. (The host's Start button staying off until at least 2 players are ready was in this list; Kevin does not need it. The current flow still requires it, see `docs/game-flow.md`; whether to relax that is an open design question.) Art tiles, search, sort, filters, a random deck, public tables and AI seats are not in the plan and cost images, rules or code; add them only if there is time. Putting the deck in the seat means a database rule change (the deck name, card count and commander on each member entry, and changing the deck un-readies the player), so it comes with a full mutation run.

## Rules
**Kevin wants**
- Undecided: use Forge's rules engine, or let players manage their own cards like paper Magic. Maybe both, a "casual" mode and a "rules enforced" mode, if Forge costs about nothing.

**Decided 2026-10-25:** skip Forge for now. Casual mode only. The notes below were not researched further.

**Claude's notes (unverified)**
- Forge is, as far as I know, a Java desktop program under a copyleft license (GPL). If so, three costs: it needs a Java server running all game long, which Vercel does not provide; its license may cover code combined with it; and wiring a web table to it is a large job by itself. Read its repo and license before deciding anything.
- Recommendation: build casual mode first. Rules-enforced mode is a stretch, after a time-boxed look at Forge.

## Card data and storage
**Kevin wants**
- Decks are cached in the browser, and only as text, which is light.
- Scryfall identifies the cards. Be courteous to its rate limits.
- Choose between a one-time cache of all cards in each browser, or a light copy of card data in our own database (store image links as text, not images). Claude should explore the cheapest option.
- Lobby codes are stored like PokeGuess: only while the lobby is active, then cleaned up.
- **Do not store anything unnecessary.** Cost means more than money.

**Claude's notes** (Scryfall checked 2026-10-25, details in `scryfall.md`: free, 2 batch lookups a second of up to 75 cards, a trimmed list of every deck card at about 1.4 MB gzipped (audited 2026-10-26), image links rebuilt from the card id)
- **No card database at all** still holds. The first idea was to look up each deck's cards from the browser. **Replaced 2026-10-26:** our own trimmed card list (about 1.4 MB gzipped), built from Scryfall's bulk file and served by Vercel, so imports make no API calls. Image links point at Scryfall. The server stores only live lobbies.
- The full bulk file is too heavy for phones (24 MB download, 200 MB unpacked), which is why the trimmed list exists. Measured, see `scryfall.md`.

## Database and real-time
**Kevin wants**
- Supabase looks best and might also hold decks for the deck builder later. Firebase is the other candidate. Compare them and others on free tiers.

**Claude's notes**
- The real question is where the live game runs. **Decided 2026-10-26** (`live-play.md`): Firebase Realtime Database with anonymous sign-in and Security Rules, so the database itself keeps each hand hidden and we write no server. The earlier note here that Vercel's functions probably can't hold live connections was wrong: they can (public beta), but they aren't used. Supabase is the fallback.
- Free tiers can pause or limit idle projects. Check each one's current terms.
- This changes the architecture, so it gets a plan-mode session.

## Look and feel
**Kevin wants**
- Simple but interactive. Gameplay first, then visuals (as with MIDI Companion).
- Players can upload their own playmat and card back, or pick a Magic card's art as a playmat.
- The battlefield arranges itself: one row for lands and one for other permanents, not free drag-and-drop with flat cards. Visually cleaner and less cluttered than existing web tabletops.
- Cards on the battlefield show icons for their abilities (flying, and so on) and states (summoning sickness). Holding a key such as `Alt` while hovering enlarges the card, with a side panel explaining each icon.
- The hand feels snappy, like Slay the Spire and Balatro.

**Claude's notes**
- Two rows for lands and other permanents do **not** need a rules engine. A card's type line says if it is a land, so the table can sort it. **Checked 2026-10-26:** use the type line of the face that is showing, since 82 cards are lands only on their back face.
- Ability icons can come from card data. **Checked 2026-10-26:** Scryfall lists keywords for the whole card only, not per face, so the build works out each face's keywords from its text. Summoning sickness needs only a turn counter and "entered this turn", not a rules engine. Effects from other cards (like "can't attack") would need either rules or a manual marker.
- Uploaded playmats and card backs conflict with "store nothing unnecessary" and bring moderation risk if strangers see them. Suggest: uploads stay in the uploader's browser and only they see them. A card-art playmat is a link, so others can see it for free.
- Every animation respects `prefers-reduced-motion`.

## Gameplay features
**Kevin wants**
- Maybe: show whether a card in hand can be paid for, based on the lands on the battlefield, either with Forge or with Scryfall's data.

**Claude's notes**
- A simple "can I afford this" check from mana costs and the colors of untapped lands is possible without a rules engine. It gets things wrong for unusual lands and cost reducers, so it is a hint, not a rule. Stretch.

## The Stack (a shared area; Kevin, 2026-10-30)
**Kevin wants**
- A shared area called "The Stack", where players from every seat can play their spells.
- Anyone at the table can remove a card from the stack (decided).
- Abilities on the stack too, not only spells (decided). Kevin wants deep research first on the different kinds of things that can go on the stack and the best ways to represent them.
- The solo table gets a stack too (decided).

**Claude's notes (a draft; nothing here is researched yet)**
- The stack is last in, first out: the newest item is on top and resolves first. Shown by the card's real name and art, newest on top.
- It is the first zone that every player writes. The live design so far is "each player writes only their own zones" (`public/{uid}` for public zones, a private branch for the hand and library), so the stack would live on the table itself, with each entry saying who played it and when. That is a database rules change: a mutation run, and Kevin pastes the rules again.
- Casting would be one atomic write that removes the card from the player's private hand and adds it to the stack, so nobody ever sees it in both places or in neither.
- Casual mode has no rules engine: the stack is a shared ordered pile. The card's owner (or anyone, by Kevin's decision) moves a card off it to the battlefield, graveyard or wherever it goes. No priority, no passing. Because anyone can remove, the rule is "any member may delete any entry"; it still needs a size limit on the stack, like the zone size limits already on the list.
- A spell is a card, but an ability is not one, so the page needs something that stands for it. Open questions for the research: a marker that names its source card and carries a short note the player types, or the text copied from the card; a copy of a spell; a trigger that goes on the stack when something happens (the app cannot know, so a player adds it). From memory, NOT checked: playing a land, mana abilities and static abilities do not use the stack. Check all of this in the Comprehensive Rules before designing, and look at how other tabletop tools show it.
- Solo: a plain pile for testing. `shared/zones.mjs` keeps the same zones as the live data model, so a `stack` zone there would be your own in solo and shared in live play; decide that when building.
- Cost: solo runs in the browser with no network and no money. The live version adds a few small database writes inside Firebase's free plan.
