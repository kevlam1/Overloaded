# Overloaded

A browser-based virtual Magic: The Gathering tabletop simulator. Artifact 5 of TCSS 490, "The Moonshot".

**Status:** planning only. The folder structure and `CLAUDE.md` are set up, and nothing is built yet. This file will be rewritten once there is something to run.

## Idea

Play Magic with friends in the browser: build a deck, join a table, and move cards around a shared play area in real time. The goal is a simulator for playing the game, not a rules engine that stops you from doing things (how much the site enforces is still an open question, see `CLAUDE.md`).

## Layout

- `frontend/`: the pages and browser code (`pages/lobby`, `pages/deck-builder`, `pages/table`, shared `assets/`, shared `src/`).
- `backend/`: the server and its API.
- `shared/`: code and types both sides use, such as card and game-state shapes.
- `docs/`: notes and open work.
- `scripts/`: tests and tools, written as plain Node scripts.

The structure is a starting point and will change as the requirements are decided.

## Not affiliated with Wizards of the Coast

Magic: The Gathering is a trademark of Wizards of the Coast. This is a student project, not endorsed by them. The exact wording the site must carry is still to be checked.
