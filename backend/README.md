# backend

There is no server. Live play runs on the Firebase Realtime Database, and this folder holds the rules that decide who may read and write what, and the tests that prove it (see `../docs/live-play.md`).

- `database.rules.json`: the Security Rules (draft): a player's private branch, members, public zones, table creation (`meta`), seat slots and the join gate, the idle and 8-hour lifetime, the heartbeat and deleting expired tables. Not deployed: the real project is still locked. Also: a one-table-per-host slot (`hosts/{uid}`), the host ending a table or a match, conceding, and the last player standing ending a table. Not written yet: presence, `inbox`, the lobby deck fields, the match counter (undecided), size limits.
- `mutate-rules.mjs`: `npm run mutate` breaks the rules one way at a time (157 ways, about 25 minutes, no windows; each kill is printed with the check that caught it) and requires the tests to fail each time. It always restores the rules file. Mutations that survive because the rule is redundant are listed with reasons in the script. `node mutate-rules.mjs "text"` runs only the mutations whose name contains that text. Do not edit the rules file while it runs.
- `firebase.json`: points the local emulator at the rules file. Without this the emulator runs open.
- `test-rules.mjs`: the rule tests. Run `npm install` once, then `npm test`. They start the local database emulator (needs Java and Node 24.12 or newer) under the project id `demo-overloaded`, which cannot reach the real project. Prints "All N rule checks passed."
- `package.json`: dev tools only (`firebase-tools`, `@firebase/rules-unit-testing`, `firebase`). It is separate from the repo root so Vercel never installs them, and nothing here ships to players.
- `src/`: unused placeholder.

- `run-tests.mjs`: what `npm test` runs. On Windows the emulator's Java process outlives the test run, keeps port 9000 and makes the next run fail with "port taken", so after every run (pass or fail) this wrapper stops a Java process whose command line has both `firebase-database-emulator` and `--port 9000`, and nothing else. It also hides the console windows, and exits with the tests' own exit code.

Secrets go in the gitignored `.env` at the repo root (with a committed `.env.example` listing only the names), never in the repo.
