# scripts

Plain Node scripts, named `test-*.mjs` for tests (they print "All ... checks passed." and exit non-zero on failure) and `make-*.mjs` or `fetch-*.mjs` for tools, the same approach as `../../midi-companion/scripts/`. Tests are for logic with no browser or server code in it. Node 20.11 or later.

- `fetch-scryfall.mjs`: research tool. `sample` makes one batch lookup; `bulk [oracle_cards|default_cards]` downloads a bulk file into the gitignored `data/cache/scryfall/` and prints sizes.
- `audit-card-data.mjs`: reads those cached files (no network) and reports what would break matching decklists by name.

No tests yet: there is no game logic to test.
