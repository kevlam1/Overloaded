# Overloaded

A browser-based virtual Magic: The Gathering tabletop simulator. Artifact 5 of TCSS 490, "The Moonshot".

**Status:** planning and research, with the first code written: a pasted-decklist parser (`shared/deck-text.mjs`, tests in `scripts/test-deck-text.mjs`, run with `node scripts/test-deck-text.mjs`). There is no site to open yet. This file will be rewritten once there is something to run.

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
