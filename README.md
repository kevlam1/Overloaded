# Overloaded

A browser-based virtual Magic: The Gathering tabletop simulator. Artifact 5 of TCSS 490, "The Moonshot".

**Status:** early build. A plain lobby page (make a table, join one by code) runs locally, and a live test with two real browsers against the Firebase project passes (join by code, live sync, hidden cards stay hidden, a refresh keeps your seat; `scripts/spike-two-browsers.mjs`). The rules in `backend/database.rules.json` have to be published to the Firebase project for any of it to work. The pasted-decklist parser, the card matcher, the table-code and player-name helpers, and the database rules each have tests.

**Run the page:** copy `.env.example` to `.env` and fill in the five Firebase settings (the project's web app config; the real values never go in the repo), then `npm install` and `npm run dev`. `npm run build` makes the site in `dist/` and fails, naming the missing setting, if one is not set.

**Run the tests:** `node scripts/test-deck-text.mjs`, `node scripts/test-card-match.mjs`, `node scripts/test-table-code.mjs`, `node scripts/test-player-name.mjs`, `node scripts/test-permission-error.mjs`, and for the database rules `npm install` then `npm test` inside `backend/` (needs Java and Node 24.12 or newer).

## Idea

Play Magic with friends in the browser: build a deck, join a table, and move cards around a shared play area in real time. The goal is a simulator for playing the game, not a rules engine that stops you from doing things (how much the site enforces is still an open question, see `CLAUDE.md`).

## Layout

- `frontend/`: the pages and browser code (`pages/lobby`, `pages/deck-builder`, `pages/table`, shared `assets/`, shared `src/`).
- `backend/`: the server and its API.
- `shared/`: code and types both sides use, such as card and game-state shapes.
- `docs/`: notes and open work.
- `scripts/`: tests and tools, written as plain Node scripts.

The structure is a starting point and will change as the requirements are decided.

## Fan content notice

Overloaded is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.

This is a student project. The wording above is the policy's own disclaimer as read on 2026-10-26 through a summarizing tool, and still has to be checked against the policy page itself before the site goes public. Card data and images come from Scryfall.
