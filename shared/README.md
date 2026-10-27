# shared

Code and types the frontend and backend both use, so they cannot drift apart: the shape of a card, a deck, the game state, and the messages sent over the live connection.

Keep it free of browser-only and server-only code, so the plain Node tests in `../scripts/` can load it.

- `deck-text.mjs`: turns pasted decklist text into entries (quantity, name, set, number, foil, section). It does not look cards up. Plain ES module with no dependencies, so it needs no stack decision. Tested by `../scripts/test-deck-text.mjs`.

The rest is empty on purpose until the stack is chosen.
