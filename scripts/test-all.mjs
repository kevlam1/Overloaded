// Runs every test in one go and prints a summary.   node scripts/test-all.mjs [--quick] [--live]
//   (no flag)  the unit suites, the lobby page check (needs Chrome) and the database rules suite (needs Java and the
//              emulator jar; run `npm install` in backend/ once)
//   --quick    only the unit suites (no Chrome, no Java), a few seconds
//   --live     also the two checks against the REAL Firebase project (they create and delete a throwaway table and
//              throwaway accounts): the rules conformance check and the two-browser spike. Needs the settings file.
import { spawnSync } from 'node:child_process';

const quick = process.argv.includes('--quick');
const live = process.argv.includes('--live');
const node = process.execPath;

const suites = [
  { name: 'no hidden characters in code', cmd: node, args: ['scripts/check-source-hygiene.mjs'] },
  { name: 'pasted decklist parser', cmd: node, args: ['scripts/test-deck-text.mjs'] },
  { name: 'card name matcher', cmd: node, args: ['scripts/test-card-match.mjs'] },
  { name: 'deck parser stress and fuzz', cmd: node, args: ['scripts/test-deck-text-fuzz.mjs'] },
  { name: 'card matcher stress and fuzz', cmd: node, args: ['scripts/test-card-match-fuzz.mjs'] },
  { name: 'table codes', cmd: node, args: ['scripts/test-table-code.mjs'] },
  { name: 'player names', cmd: node, args: ['scripts/test-player-name.mjs'] },
  { name: 'shared table links', cmd: node, args: ['scripts/test-lobby-link.mjs'] },
  { name: 'heartbeat decisions', cmd: node, args: ['scripts/test-heartbeat.mjs'] },
  { name: 'table limits and warnings', cmd: node, args: ['scripts/test-table-limits.mjs'] },
  { name: 'warning banner', cmd: node, args: ['scripts/test-banner.mjs'] },
  { name: 'heartbeat and warning wiring', cmd: node, args: ['scripts/test-keep-alive.mjs'] },
  { name: 'browser storage that never throws', cmd: node, args: ['scripts/test-safe-store.mjs'] },
  { name: 'presence decisions', cmd: node, args: ['scripts/test-presence.mjs'] },
  { name: 'exact printings: keys, files, lookup', cmd: node, args: ['scripts/test-printings.mjs'] },
  { name: 'printing file loader (which sets are fetched)', cmd: node, args: ['scripts/test-printing-loader.mjs'] },
  { name: 'card list build', cmd: node, args: ['scripts/test-card-list.mjs'] },
  { name: 'card list download, reuse and fallbacks', cmd: node, args: ['scripts/test-card-list-build.mjs'] },
  { name: 'deck preview and saved deck logic', cmd: node, args: ['scripts/test-deck-preview.mjs'] },
  { name: 'several saved decks: library, formats, selection', cmd: node, args: ['scripts/test-deck-library.mjs'] },
  { name: 'sample decks: shape and parsing', cmd: node, args: ['scripts/test-sample-decks.mjs'] },
  { name: 'table formats (Commander, Standard)', cmd: node, args: ['scripts/test-formats.mjs'] },
  { name: 'deck fields: commander, bracket, guess', cmd: node, args: ['scripts/test-deck-fields.mjs'] },
  { name: 'lobby decks: what is sent, offered and shown', cmd: node, args: ['scripts/test-lobby-deck.mjs'] },
  { name: 'mount points of the deck manager: deck page and lobby', cmd: node, args: ['scripts/test-importer-markup.mjs'] },
  { name: 'game zones: draw, move, tap, shuffle', cmd: node, args: ['scripts/test-zones.mjs'] },
  { name: 'moving a group of cards together', cmd: node, args: ['scripts/test-place-group.mjs'] },
  { name: 'the number typed into a menu line (Draw X...)', cmd: node, args: ['scripts/test-number-input.mjs'] },
  { name: 'the Mana icons and their credits', cmd: node, args: ['scripts/test-mana-icons.mjs'] },
  { name: 'the version number from log.md', cmd: node, args: ['scripts/test-version.mjs'] },
  { name: 'sound settings', cmd: node, args: ['scripts/test-sound-settings.mjs'] },
  { name: 'effects', cmd: node, args: ['scripts/test-effects.mjs'] },
  { name: 'top commanders for the home page card', cmd: node, args: ['scripts/test-top-commanders.mjs'] },
  { name: 'keybinds: which keys, swapping, saving, matching an event', cmd: node, args: ['scripts/test-keybinds.mjs'] },
  { name: 'dealing a hand one card at a time', cmd: node, args: ['scripts/test-deal-sequence.mjs'] },
  { name: 'pinging a card: the record, reading it back, which pings show', cmd: node, args: ['scripts/test-ping.mjs'] },
  { name: 'the battlefield grid: cells, order, settling, tidying', cmd: node, args: ['scripts/test-board-grid.mjs'] },
  { name: 'playing cards on the grid: drops, overlaps, tidying, writes', cmd: node, args: ['scripts/test-board-play.mjs'] },
  { name: 'stacks: what makes a pile, where new cards go, the snap, tidying', cmd: node, args: ['scripts/test-stacks.mjs'] },
  { name: 'how piles are drawn: the saved choice', cmd: node, args: ['scripts/test-pile-style.mjs'] },
  { name: 'searching a pile: names, letters in order, types', cmd: node, args: ['scripts/test-card-search.mjs'] },
  { name: 'the right-click menu of a pile: shuffle, draw, mill, move all', cmd: node, args: ['scripts/test-pile-menu.mjs'] },
  { name: 'the type and mana value filters of the pile windows', cmd: node, args: ['scripts/test-pile-filter.mjs'] },
  { name: 'how much of a card shows when the hand is resting', cmd: node, args: ['scripts/test-hand-rest.mjs'] },
  { name: 'the hand card size setting', cmd: node, args: ['scripts/test-hand-size.mjs'] },
  { name: 'the first-time help of each view', cmd: node, args: ['scripts/test-view-help.mjs'] },
  { name: 'a card added from the card list', cmd: node, args: ['scripts/test-add-card.mjs'] },
  { name: 'rotating a card a quarter turn', cmd: node, args: ['scripts/test-rotate.mjs'] },
  { name: 'who goes first', cmd: node, args: ['scripts/test-first-player.mjs'] },
  { name: 'the stack window (a list of card copies and text boxes, with Undo)', cmd: node, args: ['scripts/test-stack.mjs'] },
  { name: 'where the stack window arrows start and end', cmd: node, args: ['scripts/test-arrow-geometry.mjs'] },
  { name: 'the pause between the cards of Draw X', cmd: node, args: ['scripts/test-draw-pace.mjs'] },
  { name: 'the game history list', cmd: node, args: ['scripts/test-game-history.mjs'] },
  { name: 'the shared game history of the live table (never names a hidden card)', cmd: node, args: ['scripts/test-live-history.mjs'] },
  { name: 'the shared stack of the live table: stored and read back', cmd: node, args: ['scripts/test-stack-sync.mjs'] },
  { name: 'foil marks on cards and the Foil menu line', cmd: node, args: ['scripts/test-foil.mjs'] },
  { name: 'foil kinds: finishes, tags, the stored suffix', cmd: node, args: ['scripts/test-foil-kinds.mjs'] },
  { name: 'foil looks: kinds to the 8 drawn looks', cmd: node, args: ['scripts/test-foil-looks.mjs'] },
  { name: 'card rulings: the files the details window reads under the rules', cmd: node, args: ['scripts/test-card-rulings.mjs'] },
  { name: 'card tokens: tokens and emblems for the Create token menus', cmd: node, args: ['scripts/test-card-tokens.mjs'] },
  { name: 'the turn clock: text, time taken, the page memory of the turn', cmd: node, args: ['scripts/test-turn-clock.mjs'] },
  { name: 'the tool docks: the layout saved as text and read back per mode', cmd: node, args: ['scripts/test-tool-dock.mjs'] },
  { name: 'the board summary on a seat card: kinds, rows, counts, nothing face-down named', cmd: node, args: ['scripts/test-board-summary.mjs'] },
  { name: "the players' colors: ten, seat defaults, no two alike", cmd: node, args: ['scripts/test-player-colors.mjs'] },
  { name: 'the phase of a turn and undo', cmd: node, args: ['scripts/test-phase-undo.mjs'] },
  { name: 'the notes beside the Alt picture: keywords, counters, state', cmd: node, args: ['scripts/test-card-notes.mjs'] },
  { name: "the Shared view's plane: homes, the commons, where a card shows", cmd: node, args: ['scripts/test-plane.mjs'] },
  { name: 'counters a card can be given: the catalog and named counters', cmd: node, args: ['scripts/test-counter-catalog.mjs'] },
  { name: 'card rules: the files the details window reads', cmd: node, args: ['scripts/test-card-rules.mjs'] },
  { name: 'the menu of several cards picked in the hand', cmd: node, args: ['scripts/test-group-menu.mjs'] },
  { name: 'the menu of the hand: mulligan, shuffle into library, discard', cmd: node, args: ['scripts/test-hand-menu.mjs'] },
  { name: 'scry and surveil: the top cards, top or bottom or graveyard', cmd: node, args: ['scripts/test-scry.mjs'] },
  { name: 'the command zone: commanders and the commander tax', cmd: node, args: ['scripts/test-commander-zone.mjs'] },
  { name: 'the deck view: type groups, commanders, sorting', cmd: node, args: ['scripts/test-deck-view.mjs'] },
  { name: 'the floating action bar: where it sits, snaps and is stored', cmd: node, args: ['scripts/test-bar-place.mjs'] },
  { name: 'the life total: clicks, keys, typed numbers', cmd: node, args: ['scripts/test-life-input.mjs'] },
  { name: 'the hand: sorts, type order, fan layout, rearranging', cmd: node, args: ['scripts/test-hand.mjs'] },
  { name: 'the deck stats: curve, color demand, averages', cmd: node, args: ['scripts/test-deck-stats.mjs'] },
  { name: 'mana costs: reading the symbols', cmd: node, args: ['scripts/test-mana-cost.mjs'] },
  { name: 'the deck view: choosing the commander from a card', cmd: node, args: ['scripts/test-deck-commander.mjs'] },
  { name: 'printings grouped by card: files, reading, build checks', cmd: node, args: ['scripts/test-card-prints.mjs'] },
  { name: 'changing a card printing in the pasted text', cmd: node, args: ['scripts/test-deck-text-edit.mjs'] },
  { name: 'the bracket guess from the Game Changers', cmd: node, args: ['scripts/test-deck-bracket.mjs'] },
  { name: 'the colors of a deck and its commanders', cmd: node, args: ['scripts/test-deck-colors.mjs'] },
  { name: 'the card hover preview: which picture, where the box goes', cmd: node, args: ['scripts/test-card-hover.mjs'] },
  { name: 'counters, modifier, tokens, player counters', cmd: node, args: ['scripts/test-counters.mjs'] },
  { name: 'counters and tokens: how they are stored and read back', cmd: node, args: ['scripts/test-sync-counters.mjs'] },
  { name: 'counter chips, the change label and typed amounts', cmd: node, args: ['scripts/test-marks.mjs'] },
  { name: 'summoning sickness, the no-untap mark and starting a turn', cmd: node, args: ['scripts/test-turn-marks.mjs'] },
  { name: 'whose turn it is: passing, skipping and taking back a turn', cmd: node, args: ['scripts/test-turn-order.mjs'] },
  { name: 'player counters and commander damage: what they show and do', cmd: node, args: ['scripts/test-player-counters.mjs'] },
  { name: 'turning a two-sided card over: logic, storage and numbers', cmd: node, args: ['scripts/test-turn-over.mjs'] },
  { name: 'the right-click menu of a card: what it offers and does', cmd: node, args: ['scripts/test-card-menu.mjs'] },
  { name: 'game sync: public and private branches, writes', cmd: node, args: ['scripts/test-game-sync.mjs'] },
  { name: 'saved card lookup (id, then name)', cmd: node, args: ['scripts/test-card-lookup.mjs'] },
  { name: 'refused-request check', cmd: node, args: ['scripts/test-permission-error.mjs'] },
  { name: 'friendly error messages', cmd: node, args: ['scripts/test-friendly-error.mjs'] },
];
if (!quick) {
  suites.push({ name: 'the /logs/ page in headless Chrome', cmd: node, args: ['scripts/check-logs-page.mjs'] });
  suites.push({ name: 'lobby page in headless Chrome', cmd: node, args: ['scripts/check-lobby-ui.mjs'] });
  suites.push({ name: 'the pinged card: spotlight and glow in headless Chrome', cmd: node, args: ['scripts/check-spotlight-ui.mjs'] });
  suites.push({ name: 'the table fits one screen: 5 window sizes, 0 to 3 other players (headless Chrome)', cmd: node, args: ['scripts/check-table-layout.mjs'] });
  suites.push({ name: 'deck page in headless Chrome (needs the card list)', cmd: node, args: ['scripts/check-deck-ui.mjs'] });
  suites.push({ name: 'solo table in headless Chrome (needs the card list)', cmd: node, args: ['scripts/check-solo-ui.mjs'] });
  suites.push({ name: 'stack window in headless Chrome (needs the card list)', cmd: node, args: ['scripts/check-stack-ui.mjs'] });
  suites.push({ name: 'history bar and hand selection in headless Chrome (needs the card list)', cmd: node, args: ['scripts/check-history-and-select-ui.mjs'] });
  suites.push({ name: 'the first-time help of a view in headless Chrome (needs the card list)', cmd: node, args: ['scripts/check-view-help-ui.mjs'] });
  suites.push({ name: 'effects in headless Chrome: the commander burst and the hand hop (needs the card list)', cmd: node, args: ['scripts/check-effects-ui.mjs'] });
  suites.push({ name: 'the Settings menu and keybinds in headless Chrome (needs the card list)', cmd: node, args: ['scripts/check-settings-ui.mjs'] });
  suites.push({ name: 'Create token on the solo table in headless Chrome (needs the card list and tokens file)', cmd: node, args: ['scripts/check-token-ui.mjs'] });
  suites.push({ name: 'database rules (local emulator)', cmd: process.platform === 'win32' ? 'npm.cmd' : 'npm', args: ['test'], cwd: 'backend', shell: true });
}
if (live) {
  suites.push({ name: 'LIVE: published rules match the file', cmd: node, args: ['--env-file=.env', 'scripts/check-live-rules.mjs'] });
  suites.push({ name: 'LIVE: two browsers against the real project', cmd: node, args: ['--env-file=.env', 'scripts/spike-two-browsers.mjs'] });
  suites.push({ name: 'LIVE: built site, vercel.json and share links', cmd: node, args: ['--env-file=.env', 'scripts/check-deploy-config.mjs'] });
  suites.push({ name: 'LIVE: the heartbeat keeps a table alive (70 s)', cmd: node, args: ['--env-file=.env', 'scripts/check-heartbeat-live.mjs'] });
  suites.push({ name: 'LIVE: presence, reconnecting and disconnected (2.5 min)', cmd: node, args: ['--env-file=.env', 'scripts/check-presence-live.mjs'] });
  suites.push({ name: 'LIVE: two tabs of one browser are one player', cmd: node, args: ['--env-file=.env', 'scripts/check-two-tabs-live.mjs'] });
  suites.push({ name: 'LIVE: lobby decks, Ready and the popup (two browsers)', cmd: node, args: ['--env-file=.env', 'scripts/check-lobby-deck-live.mjs'] });
  suites.push({ name: 'LIVE: the table screen and joining from its link (four browsers)', cmd: node, args: ['--env-file=.env', 'scripts/check-room-live.mjs'] });
  suites.push({ name: 'LIVE: the host adds and removes test bots (one browser)', cmd: node, args: ['--env-file=.env', 'scripts/check-bots-live.mjs'] });
  suites.push({ name: 'LIVE: the Seats table layout for 2, 3 and 4 seats (real browsers and bots)', cmd: node, args: ['--env-file=.env', 'scripts/check-seats-live.mjs'] });
  suites.push({ name: 'LIVE: the Shared view, everyone on one plane (two browsers)', cmd: node, args: ['--env-file=.env', 'scripts/check-shared-live.mjs'] });
}

let failed = 0;
for (const suite of suites) {
  const started = Date.now();
  const result = spawnSync(suite.cmd, suite.args, { cwd: suite.cwd ?? '.', encoding: 'utf8', windowsHide: true, shell: suite.shell ?? false, timeout: 600000 });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.split('\n').map((l) => l.trim()).filter(Boolean);
  // Every "All N ... passed" line, so a suite made of several test files (the database one) shows each count.
  const summaryLines = output.filter((l) => /^(All \d+.*(passed|matched)|RESULT:.*passed)/.test(l));
  const summary = summaryLines.length ? summaryLines.join('  +  ') : (output.at(-1) ?? '(no output)');
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const pass = result.status === 0;
  if (!pass) failed++;
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${suite.name.padEnd(46)} ${seconds.padStart(6)} s  ${pass ? summary : output.slice(-4).join(' | ')}`);
}
console.log(failed ? `\n${failed} of ${suites.length} suites FAILED.` : `\nAll ${suites.length} suites passed.`);
process.exit(failed ? 1 : 0);
