# Open work (as of 2026-10-25)

Setup only so far. Nothing is built, and no requirement below is final.

- [ ] Read the Artifact 5 page on the course site (the moonshot) as soon as it is posted, and copy its real requirements into `CLAUDE.md`. It is not in `../Unit 3/` yet, so everything about it in `CLAUDE.md` is from the overview in the Portfolio notes.
- [ ] Pick the stack (frontend and backend), after the questions in `CLAUDE.md` "Open questions" are answered. Show me each option's license and cost before adding it.
- [ ] Decide the smallest playable version (two players, one shared table, cards you can move) and write it into `CLAUDE.md` as phase 1.
- [ ] Check the card data source (Scryfall) by printing real responses: fields, rate limits, image rules, and whether bulk data can be downloaded. Write what was found in `log.md`.
- [ ] Read Wizards of the Coast's rules for fan projects (card images, names, disclaimers) and write down what is allowed and what the site must say.
- [ ] Decide how two browsers stay in sync (WebSockets or something else) and who is the source of truth, the server or a player.
- [ ] Pick hosting that can run a backend. The Portfolio is on GitHub Pages and MIDI Companion on Vercel, and neither is a given for a long-running real-time server. Check current docs and limits, and check the cost.
- [ ] Decide accounts and saved decks: none (saved in the browser), or logins. Logins mean storing personal details, which has to be decided before building.
- [ ] Choose a test plan: plain Node scripts for game logic with no browser code (like MIDI Companion), plus headless Chrome for pages.
- [ ] Plan a week-by-week schedule once the scope is chosen (5 to 7 weeks, due Sun Dec 13).
- [ ] Tell the Portfolio session when this is real enough to put a card on: its card is "Artifact 5" and stays locked until then.
