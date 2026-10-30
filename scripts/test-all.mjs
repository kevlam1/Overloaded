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
  { name: 'game zones: draw, move, tap, shuffle', cmd: node, args: ['scripts/test-zones.mjs'] },
  { name: 'saved card lookup (id, then name)', cmd: node, args: ['scripts/test-card-lookup.mjs'] },
  { name: 'refused-request check', cmd: node, args: ['scripts/test-permission-error.mjs'] },
  { name: 'friendly error messages', cmd: node, args: ['scripts/test-friendly-error.mjs'] },
];
if (!quick) {
  suites.push({ name: 'lobby page in headless Chrome', cmd: node, args: ['scripts/check-lobby-ui.mjs'] });
  suites.push({ name: 'deck page in headless Chrome (needs the card list)', cmd: node, args: ['scripts/check-deck-ui.mjs'] });
  suites.push({ name: 'solo table in headless Chrome (needs the card list)', cmd: node, args: ['scripts/check-solo-ui.mjs'] });
  suites.push({ name: 'database rules (local emulator)', cmd: process.platform === 'win32' ? 'npm.cmd' : 'npm', args: ['test'], cwd: 'backend', shell: true });
}
if (live) {
  suites.push({ name: 'LIVE: published rules match the file', cmd: node, args: ['--env-file=.env', 'scripts/check-live-rules.mjs'] });
  suites.push({ name: 'LIVE: two browsers against the real project', cmd: node, args: ['--env-file=.env', 'scripts/spike-two-browsers.mjs'] });
  suites.push({ name: 'LIVE: built site, vercel.json and share links', cmd: node, args: ['--env-file=.env', 'scripts/check-deploy-config.mjs'] });
  suites.push({ name: 'LIVE: the heartbeat keeps a table alive (70 s)', cmd: node, args: ['--env-file=.env', 'scripts/check-heartbeat-live.mjs'] });
  suites.push({ name: 'LIVE: presence, reconnecting and disconnected (2.5 min)', cmd: node, args: ['--env-file=.env', 'scripts/check-presence-live.mjs'] });
  suites.push({ name: 'LIVE: two tabs of one browser are one player', cmd: node, args: ['--env-file=.env', 'scripts/check-two-tabs-live.mjs'] });
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
