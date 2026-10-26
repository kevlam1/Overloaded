# Build log: Artifact 5 (Overloaded)

**AI:** Claude Code | **Editor:** IntelliJ IDEA Ultimate | **Host:** not chosen yet (public repo `kevlam1/Overloaded`)
**Stack:** not chosen yet.

---

## What I set out to build

Artifact 5 is the moonshot, due Sunday 13 December. I want to build Overloaded, a browser-based virtual Magic: The Gathering tabletop simulator where friends can build a deck, join a table and play together in real time. I have about 5 to 7 weeks, and I expect it to be the hardest thing I build, so I started planning before the artifact opened. Nothing is built yet. This section will be rewritten once the project is further along. The numbered entries below are left as they were.

---

## 1. Setting up the folder and the Claude files (2026-10-25)

**What I asked for**
- Asked Claude Code to prepare Artifact 5 early: a folder named `Overloaded` in my `TCSS 490` folder, set up the same way my three finished artifacts were, as a large multi-page project with a backend, and a thorough `CLAUDE.md`.
- Told it that my Artifact 5 is now the MTG simulator, and that my old Artifact 5 idea (the game reference tool) moves to Artifact 4. I also gave it the GitHub repo link.

**What changed**
- Claude read the `CLAUDE.md` files of the Portfolio, MIDI Companion and readme-architect, their `.gitignore` files, and the layout of their folders. My first message said "my Portfolio project", but the artifact folders sit next to the Portfolio, so I corrected it to the `TCSS 490` folder.
- Created `Overloaded/` with `CLAUDE.md`, `log.md` (this file), `README.md`, `docs/todo.md`, a `.gitignore`, and `.claude/settings.json` (the `.env` and key deny rules from readme-architect). It ran `git init` on `main` and added my repo as `origin`. Nothing is committed or pushed.
- Starting structure: `frontend/` (pages for the lobby, deck builder and table, plus shared assets and code), `backend/`, `shared/` (types both sides use), `scripts/` for tests and tools, and `docs/`. Each has a short README, and empty folders have a `.gitkeep`. I wanted it flexible, so there is no `package.json`, no framework and no hosting.
- `CLAUDE.md` has the vision, phased scope, a proposed architecture, rules, the log protocol, and 14 open questions. It says plainly that the requirements will be expanded and the layout will change.
- The Portfolio's Artifact 4 and 5 ideas were swapped. See the Portfolio's `log.md`.

**What I checked**
- The repo URL returned HTTP 200 and `git remote -v` shows it as `origin`.
- Not checked: anything about the course page for Artifact 5. It isn't in my Unit folders yet, so the scope in `CLAUDE.md` comes only from the one-line overview in my notes.
- Not checked: Scryfall, Wizards of the Coast's fan-content rules, or any hosting. They are listed as open questions on purpose.

**Decisions**
- No stack, hosting or database yet. Those come after I answer the open questions.
- Started with a sandbox table (moving cards), not a rules engine, as the recommended first version. I can change this.
- The repo already existed, so the name `Overloaded` is final, and the card will link to it.

---

## Where AI misread me, or I had to correct course

- In my first message I said to put the folder in my Portfolio project, which was wrong: the other artifacts live next to the Portfolio. I corrected it in my next message.

---

## Decisions and abandoned ideas

- Not building a full rules engine or an AI opponent in the first plan. They can come back after the requirements are expanded.
