# shared

Code and types the frontend and backend both use, so they cannot drift apart: the shape of a card, a deck, the game state, and the messages sent over the live connection.

Keep it free of browser-only and server-only code, so the plain Node tests in `../scripts/` can load it.

Empty on purpose until the stack is chosen.
