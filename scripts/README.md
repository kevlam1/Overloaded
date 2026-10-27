# scripts

Plain Node scripts, named `test-*.mjs` for tests (they print "All ... checks passed." and exit non-zero on failure) and `make-*.mjs` or `fetch-*.mjs` for tools, the same approach as `../../midi-companion/scripts/`. Tests are for logic with no browser or server code in it. Node 20.11 or later.

- `test-deck-text.mjs`: checks `../shared/deck-text.mjs` against the real Moxfield and Archidekt exports and edge cases. Run `node scripts/test-deck-text.mjs`.
- `test-card-match.mjs`: checks `../shared/card-match.mjs` against a small real-data fixture (`fixtures/cards-sample.json`, 29 real card records) and the three real exports. Run `node scripts/test-card-match.mjs`.
- `check-card-match.mjs`: runs the matcher over every real card name in the cached Oracle Cards file, plus typed spellings (no accents, curly apostrophes, single slashes). Needs the bulk download first. Run `node --max-old-space-size=2048 scripts/check-card-match.mjs`.
- `fixtures/exports.mjs`: the three real Moxfield and Archidekt exports, shared by the tests.
- `fetch-scryfall.mjs`: research tool. `sample` makes one batch lookup; `bulk [oracle_cards|default_cards]` downloads a bulk file into the gitignored `data/cache/scryfall/` and prints sizes.
- `audit-card-data.mjs`: reads those cached files (no network) and reports what would break matching decklists by name.
