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
