// Checks the /logs/ page in real headless Chrome: the weeks, opening entries, a link to one entry, search, expand all, no page errors, no inline script or style (the site's content policy forbids them).
// Run: node scripts/check-logs-page.mjs [--screenshot]   (it starts the dev server itself; the page must have been built with node scripts/make-logs-page.mjs)
// --screenshot saves scratch-logs-*.png in the project folder (delete them after looking).
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { openBrowser, closeAllBrowsers, sleep } from './lib/browser.mjs';

const PORT = 5204;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const shots = process.argv.includes('--screenshot');
const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };

const html = readFileSync(new URL('../frontend/public/logs/index.html', import.meta.url), 'utf8');
const log = readFileSync(new URL('../log.md', import.meta.url), 'utf8');
const logCount = (log.match(/^## \d+\. /gm) ?? []).length;
check('the page has no inline script, no inline style and no style attribute (the content policy forbids them)', !/<script(?![^>]*\bsrc=)/i.test(html) && !/<style/i.test(html) && !/\sstyle=/i.test(html));
check('the page is built from this log.md: it has every numbered entry', (html.match(/<article class="entry" id="entry-\d+"/g) ?? []).length === logCount, `${logCount} in log.md`);

let server = null; let exitCode = 0;
try {
  server = await createServer({ configFile: 'vite.config.js', logLevel: 'error', server: { port: PORT, strictPort: true, host: '127.0.0.1' } });
  await server.listen();
  const browser = await openBrowser('logs-page', { width: 1280, height: 800 });
  await browser.goto(`${ORIGIN}/logs/`);
  await sleep(500);
  const ev = (code) => browser.eval(code);

  const names = await ev(`Array.from(document.querySelectorAll('.week-link .wl-name')).map((n) => n.textContent)`);
  check('the week bar lists Week -1, Week 0, Week 1 and the reflection', JSON.stringify(names.slice(0, 3)) === JSON.stringify(['Week -1', 'Week 0', 'Week 1']) && names.at(-1) === 'Reflection', JSON.stringify(names));
  const ranges = await ev(`Array.from(document.querySelectorAll('.week-link .wl-range')).map((n) => n.textContent)`);
  check('the weeks run Oct 25 to Nov 1, Nov 2 to Nov 8 and Nov 9 to Nov 15', ranges[0] === 'Oct 25 to Nov 1' && ranges[1] === 'Nov 2 to Nov 8' && ranges[2] === 'Nov 9 to Nov 15', JSON.stringify(ranges));
  const placed = await ev(`Array.from(document.querySelectorAll('.week .entry')).filter((e) => e.closest('#reflection') === null).length`);
  check('every numbered entry is under a week', placed === logCount, String(placed));
  // each day heading is in the week its date belongs to
  const wrong = await ev(`(() => {
    const bad = [];
    const months = { January: 0, February: 1, March: 2, April: 3, May: 4, June: 5, July: 6, August: 7, September: 8, October: 9, November: 10, December: 11 };
    for (const day of document.querySelectorAll('.week .day')) {
      const title = day.querySelector('.day-title'); if (!title) continue;
      const m = /(\\d+) (\\w+)/.exec(title.firstChild.textContent); if (!m) continue;
      const date = Date.UTC(2026, months[m[2]], Number(m[1]), 12);
      const week = Math.floor((date - Date.UTC(2026, 10, 9, 12)) / (7 * 86400000)) + 1;
      const id = day.closest('.week').id;
      const expected = date === Date.UTC(2026, 9, 25, 12) ? 'week-m1' : (week < 0 ? 'week-m' + (-week) : 'week-' + week);
      if (id !== expected) bad.push(title.textContent + ' in ' + id);
    }
    return bad;
  })()`);
  check('every day is under the week its date belongs to (Monday to Sunday, Oct 25 in Week -1)', wrong.length === 0, JSON.stringify(wrong));

  check('every week starts folded, with its days hidden and aria-expanded false', await ev(`Array.from(document.querySelectorAll('.week')).every((w) => w.classList.contains('collapsed') && getComputedStyle(w.querySelector('.days')).display === 'none' && w.querySelector('.week-head button').getAttribute('aria-expanded') === 'false')`));
  const closed = await ev(`Array.from(document.querySelectorAll('.entry')).every((e) => !e.classList.contains('open') && getComputedStyle(e.querySelector('.body')).display === 'none')`);
  check('all entries start closed, showing a title and a summary', closed);
  await ev(`document.querySelector('#entry-1 .entry-head button').click()`);
  const opened = await ev(`(() => { const e = document.getElementById('entry-1'); return e.classList.contains('open') && getComputedStyle(e.querySelector('.body')).display !== 'none' && e.querySelector('button').getAttribute('aria-expanded') === 'true'; })()`);
  check('a click opens an entry and sets aria-expanded', opened);
  await ev(`document.querySelector('#entry-1 .entry-head button').click()`);
  check('a second click closes it', await ev(`!document.getElementById('entry-1').classList.contains('open')`));

  await ev(`document.getElementById('expand-all').click()`);
  check('Expand all opens every entry', await ev(`Array.from(document.querySelectorAll('.entry')).every((e) => e.classList.contains('open'))`));
  await ev(`document.getElementById('collapse-all').click()`);
  check('Collapse all closes them again, and folds every week', await ev(`Array.from(document.querySelectorAll('.entry')).every((e) => !e.classList.contains('open')) && Array.from(document.querySelectorAll('.week')).every((w) => w.classList.contains('collapsed') && getComputedStyle(w.querySelector('.days')).display === 'none')`));
  await ev(`document.querySelector('#week-0 .week-head button').click()`);
  check('a click on a week heading opens that week only, and sets aria-expanded', await ev(`getComputedStyle(document.querySelector('#week-0 .days')).display !== 'none' && document.querySelector('#week-0 .week-head button').getAttribute('aria-expanded') === 'true' && document.getElementById('week-1').classList.contains('collapsed') && document.querySelector('#week-1 .week-head button').getAttribute('aria-expanded') === 'false'`));
  await ev(`document.querySelector('#week-0 .week-head button').click()`);
  check('a second click folds it again', await ev(`document.getElementById('week-0').classList.contains('collapsed')`));
  await ev(`document.querySelector('.week-link[data-target="week-1"]').click()`);
  check('the week bar link for a folded week opens it', await ev(`!document.getElementById('week-1').classList.contains('collapsed')`));
  await ev(`document.getElementById('expand-all').click()`);
  check('Expand all opens the weeks again', await ev(`Array.from(document.querySelectorAll('.week')).every((w) => !w.classList.contains('collapsed'))`));
  await ev(`document.getElementById('collapse-all').click()`);

  check('a search opens a folded week that holds a match', await (async () => { await ev(`(() => { const s = document.getElementById('log-search'); s.value = 'riffle'; s.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(500); return ev(`!document.getElementById('week-1').classList.contains('collapsed') && getComputedStyle(document.querySelector('#week-1 .days')).display !== 'none'`); })());
  await ev(`(() => { const s = document.getElementById('log-search'); s.value = 'riffle'; s.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(500);
  const found = await ev(`({ shown: document.querySelectorAll('.entry:not([hidden])').length, marks: document.querySelectorAll('mark').length, note: document.getElementById('search-note').textContent, hiddenWeeks: document.querySelectorAll('.week[hidden]').length })`);
  const expected = log.split(/^## /m).filter((s) => /^\d+\. /.test(s) && /riffle/i.test(s.replace(/`/g, ''))).length;
  check('searching for "riffle" shows exactly the entries that contain it, with the word marked', found.shown === expected && found.shown > 0 && found.marks > 0, JSON.stringify({ ...found, expected }));
  if (shots) await browser.screenshot('scratch-logs-search.png');
  await ev(`(() => { const s = document.getElementById('log-search'); s.value = 'zzzqqqxx'; s.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(500);
  check('a search with no match says so', await ev(`!document.getElementById('no-results').hidden && document.querySelectorAll('.entry:not([hidden])').length === 0`));
  await ev(`(() => { const s = document.getElementById('log-search'); s.value = ''; s.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(500);
  check('clearing the search brings every entry back and removes the marks', await ev(`document.querySelectorAll('.entry[hidden]').length === 0 && document.querySelectorAll('mark').length === 0 && document.getElementById('no-results').hidden`));

  await browser.goto(`${ORIGIN}/logs/#entry-100`);
  await sleep(500);
  check('an address ending in #entry-100 opens that entry', await ev(`document.getElementById('entry-100').classList.contains('open')`));
  await ev(`document.getElementById('collapse-all').click()`);
  await browser.goto(`${ORIGIN}/logs/#entry-100`);
  await ev(`document.getElementById('collapse-all').click()`);
  await ev(`location.hash = ''; location.hash = '#entry-100'`);
  await sleep(400);
  check('a link to an entry inside a folded week opens the week too', await ev(`!document.getElementById('week-0').classList.contains('collapsed') && document.getElementById('entry-100').classList.contains('open')`));
  if (shots) await browser.screenshot('scratch-logs-deeplink.png');

  await browser.goto(`${ORIGIN}/logs/`);
  await sleep(300);
  if (shots) await browser.screenshot('scratch-logs-top.png');
  await ev(`document.getElementById('expand-all').click()`);
  await ev(`window.scrollTo({ top: document.getElementById('week-1').getBoundingClientRect().top + window.scrollY - 100, behavior: 'instant' })`);
  await sleep(400);
  check('scrolling to Week 1 marks it in the week bar', await ev(`document.querySelector('.week-link.current')?.dataset.target === 'week-1'`));
  const noScroll = await ev(`document.documentElement.scrollWidth <= document.documentElement.clientWidth`);
  check('no sideways page scroll at desktop width', noScroll);
  const phone = await openBrowser('logs-phone', { width: 390, height: 800 });
  await phone.goto(`${ORIGIN}/logs/`);
  await sleep(500);
  check('no sideways page scroll at phone width', await phone.eval(`document.documentElement.scrollWidth <= document.documentElement.clientWidth`));
  if (shots) await phone.screenshot('scratch-logs-phone.png');
  const errors = [...browser.logs, ...phone.logs].filter((l) => /^(exception|error)/.test(l));
  check('no page errors or console errors', errors.length === 0, JSON.stringify(errors));
} finally {
  await closeAllBrowsers();
  if (server) await server.close();
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
if (failed.length) { console.log('FAILED:', failed.map((r) => r.name).join('; ')); exitCode = 1; }
process.exit(exitCode);
