// Checks the deck import page in a real headless Chrome (desktop width), against the REAL card list. No database traffic
// and nothing leaves this machine: the page reads /data/cards.json from the dev server (frontend/public/data, made by
// `npm run cards`) and keeps a saved deck in the browser's own storage. Run from the repo root: node scripts/check-deck-ui.mjs
// Skipped (exit 0, and it says so) when no card list has been built here yet.
// Optional: --screenshot saves scratch-deck-ui.png (git ignores scratch files; delete it afterward).
import { existsSync } from 'node:fs';
import { createServer } from 'vite';
import { openBrowser, closeAllBrowsers, waitFor, sleep, click } from './lib/browser.mjs';
import { ARCHIDEKT, MOXFIELD_FOR_MOXFIELD, MOXFIELD_PLAIN } from './fixtures/exports.mjs';

if (!existsSync('frontend/public/data/cards.json')) {
  console.log('Deck page checks skipped: there is no card list here yet. Run `npm run cards` to build one.');
  process.exit(0);
}

const PORT = 5195;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const PAGE = `${ORIGIN}/pages/deck/index.html`;
let checks = 0;
const failures = [];
function check(label, pass, detail = '') {
  checks++;
  if (!pass) { failures.push(label); console.log(`FAIL  ${label}${detail ? '  (' + detail + ')' : ''}`); }
}

let server = null;
try {
  server = await createServer({ configFile: 'vite.config.js', logLevel: 'error', server: { port: PORT, strictPort: true, host: '127.0.0.1' } });
  await server.listen();
  const browser = await openBrowser('deck-ui', { width: 1280, height: 900 });
  const ev = (expression) => browser.eval(expression);
  const $text = (id) => ev(`document.getElementById(${JSON.stringify(id)}).textContent`);
  const $hidden = (id) => ev(`document.getElementById(${JSON.stringify(id)}).hidden`);
  const paste = (value) => ev(`(() => { const t = document.getElementById('deck-text'); t.value = ${JSON.stringify(value)}; t.dispatchEvent(new Event('input')); })()`);
  const press = (id) => ev(`document.getElementById(${JSON.stringify(id)}).click()`);
  const ready = () => waitFor(async () => (await ev(`!document.getElementById('check').disabled`)) || null, 15000, 50);
  const load = async () => { await browser.goto(PAGE); await ready(); };

  const started = Date.now();
  await browser.goto(PAGE);
  check('the card list loads and the Check button comes alive', Boolean(await ready()), await $text('list-state'));
  console.log(`   (page and card list ready in ${Date.now() - started} ms)`);

  // ---- structure and basics ----
  const facts = await ev(`(() => {
    const fields = Array.from(document.querySelectorAll('input, select, textarea'));
    return {
      title: document.title, lang: document.documentElement.lang, h1s: document.querySelectorAll('h1').length,
      withoutLabel: fields.filter((f) => !document.querySelector('label[for="' + f.id + '"]') && !f.getAttribute('aria-label')).map((f) => f.id),
      buttonsWithoutText: Array.from(document.querySelectorAll('button')).filter((b) => !b.textContent.trim()).length,
      footer: document.querySelector('footer')?.textContent ?? '',
      statusIsLive: document.getElementById('status').getAttribute('role') === 'status' && document.getElementById('status').getAttribute('aria-live') === 'polite',
      back: document.querySelector('.back a')?.getAttribute('href'),
      inlineStyles: document.querySelectorAll('[style]').length, inlineScripts: Array.from(document.scripts).filter((s) => !s.src).length,
    };
  })()`);
  check('the page has a title, a language and one h1', /import a deck/i.test(facts.title) && facts.lang === 'en' && facts.h1s === 1);
  check('every field has a label', facts.withoutLabel.length === 0, facts.withoutLabel.join());
  check('every button has text', facts.buttonsWithoutText === 0);
  check('the fan content disclaimer is on the page', /unofficial Fan Content/.test(facts.footer) && /Fan Content Policy/.test(facts.footer) && /Not approved\/endorsed by Wizards/.test(facts.footer) && /property of Wizards of the Coast/.test(facts.footer));
  check('messages are announced politely', facts.statusIsLive);
  check('there is a way back to the lobby', facts.back === '/');
  check('no inline styles and no inline scripts (the content policy forbids them)', facts.inlineStyles === 0 && facts.inlineScripts === 0);
  check('nothing is shown before a deck is checked', (await $hidden('preview')) && (await $hidden('saved')));
  check('a card list message says how many cards were loaded', /[\d,]{5,} cards loaded/.test(await $text('list-state')), await $text('list-state'));

  // ---- an empty paste ----
  await press('check');
  check('checking nothing says so', (await $text('status')) === 'Paste a decklist first.' && (await $hidden('preview')));

  // ---- the three real exports ----
  const checkExport = async (label, exportText, expect) => {
    await load(); await paste(exportText); await press('check');
    await waitFor(async () => !(await $hidden('preview')) || null, 5000, 50);
    const view = await ev(`(() => ({
      status: document.getElementById('status').textContent, summary: document.getElementById('summary').textContent,
      headings: Array.from(document.querySelectorAll('#sections h3')).map((h) => h.textContent),
      lines: document.querySelectorAll('#sections .card-line').length, unmatched: document.querySelectorAll('#sections .card-line.unmatched').length,
      problemsHidden: document.getElementById('problems').hidden,
      commander: document.getElementById('commander-1').selectedOptions[0]?.textContent ?? '',
      commanderOptions: document.getElementById('commander-1').options.length,
      mode: document.getElementById('mode-commander').checked ? 'commander' : 'none',
      selectsDisabled: document.getElementById('commander-1').disabled,
      note: document.getElementById('commander-note').textContent,
      focus: document.activeElement?.id, saveDisabled: document.getElementById('save').disabled,
    }))()`);
    check(`${label}: checked, 19 cards, all matched`, view.status === 'Checked: 19 cards, all matched.' && /Every card was matched/.test(view.summary) && view.problemsHidden && view.unmatched === 0, view.status);
    check(`${label}: sections ${expect.headings.join(' and ')}`, JSON.stringify(view.headings) === JSON.stringify(expect.headings), JSON.stringify(view.headings));
    check(`${label}: one line per card, 10 lines`, view.lines === 10, String(view.lines));
    check(`${label}: the guessed commander is Eowyn`, /^Éowyn, Lady of Rohan$/.test(view.commander), view.commander);
    check(`${label}: ${expect.mode === 'commander' ? 'commander mode is on' : 'no-commander mode is on'} (and the pickers ${expect.mode === 'commander' ? 'are usable' : 'are greyed out'})`, view.mode === expect.mode && view.selectsDisabled === (expect.mode === 'none'), `${view.mode} ${view.selectsDisabled}`);
    check(`${label}: ${expect.noteWords ? 'the note explains the guess' : 'no note while commander mode is off'}`, expect.noteWords ? expect.noteWords.test(view.note) : view.note === '', view.note);
    check(`${label}: focus moves to the deck heading`, view.focus === 'preview-heading', String(view.focus));
    check(`${label}: it can be saved`, !view.saveDisabled);
  };
  await checkExport('Moxfield "Copy for Moxfield"', MOXFIELD_FOR_MOXFIELD, { headings: ['Main deck: 18', 'Sideboard: 1'], mode: 'none' });
  await checkExport('Moxfield plain text', MOXFIELD_PLAIN, { headings: ['Main deck: 17', 'Sideboard: 1', 'Cards after a blank line (no label): 1'], mode: 'commander', noteWords: /after a blank line/ });
  await checkExport('Archidekt text', ARCHIDEKT, { headings: ['Main deck: 19'], mode: 'none' });

  // ---- turning the commander on: the note explains the guess ----
  await load(); await paste(MOXFIELD_FOR_MOXFIELD); await press('check');
  await ev(`document.getElementById('mode-commander').click()`);
  check('turning the commander on enables the pickers and explains the guess', !(await ev(`document.getElementById('commander-1').disabled`)) && /A guess: the first legendary creature/.test(await $text('commander-note')));
  const optionNames = await ev(`Array.from(document.getElementById('commander-1').options).map((o) => o.textContent)`);
  check('the commander list has each card once, 10 cards', optionNames.length === 10 && new Set(optionNames).size === 10, JSON.stringify(optionNames));
  check('and is sorted for people to read, with the accented name under E', optionNames.every((n, i) => i === 0 || optionNames[i - 1].localeCompare(n, 'en') <= 0) && optionNames.indexOf('Éowyn, Lady of Rohan') < optionNames.indexOf('Fire // Ice'), JSON.stringify(optionNames));
  check('the partner list starts with "No partner"', (await ev(`document.getElementById('commander-2').options[0].textContent`)) === 'No partner' && (await ev(`document.getElementById('commander-2').value`)) === '');

  // ---- problems: not found, ambiguous, a "did you mean" ----
  await load();
  await paste('1 Sol Ring\n1 B.F.M. (Big Furry Monster)\n1 Insectile Aberration\n2 Totally Fake Card');
  await press('check');
  const problems = await ev(`(() => ({
    items: Array.from(document.querySelectorAll('#problem-list li')).map((li) => li.textContent),
    selects: document.querySelectorAll('#problem-list select').length, hidden: document.getElementById('problems').hidden,
    summary: document.getElementById('summary').textContent, unmatched: document.querySelectorAll('#sections .card-line.unmatched').length,
    missingBoxHidden: document.getElementById('missing-box').hidden, label: document.getElementById('allow-missing-label').textContent,
  }))()`);
  check('three problems are listed, two with a choice to make', !problems.hidden && problems.items.length === 3 && problems.selects === 2, JSON.stringify(problems.items));
  check('the not-found card says it may be newer than the list', problems.items.some((t) => /Totally Fake Card" \(2\) was not found/.test(t) && /newer than our card list/.test(t)));
  check('the summary counts the cards that need attention (3 of 5)', /5 cards on 4 lines\. 4 cards need attention\./.test(problems.summary), problems.summary);
  check('unmatched lines are marked in the list', problems.unmatched === 3, String(problems.unmatched));
  check('a way to save without them is offered, and says how many', !problems.missingBoxHidden && /3 lines/.test(problems.label), problems.label);
  await ev(`document.getElementById('deck-name').value = 'Problems deck'`);
  await press('save');
  check('saving is refused while lines are unmatched, in words', /3 lines are not matched/.test(await $text('status')), await $text('status'));
  check('nothing was saved', (await ev(`localStorage.getItem('overloaded.deck')`)) === null);
  // settle the ambiguous name and the suggestion with their selects
  for (let n = 0; n < 2; n++) {
    await ev(`(() => { const s = document.querySelector('#problem-list select'); s.value = s.options[1].value; s.dispatchEvent(new Event('change')); })()`);
  }
  const after = await ev(`({ items: Array.from(document.querySelectorAll('#problem-list li')).map((li) => li.textContent), label: document.getElementById('allow-missing-label').textContent, status: document.getElementById('status').textContent })`);
  check('choosing a card settles both, leaving only the not-found card', after.items.length === 1 && /Totally Fake Card/.test(after.items[0]), JSON.stringify(after.items));
  check('and the save option now counts one line', /1 line that was not matched/.test(after.label), after.label);
  await press('save');
  check('still refused until the player agrees to leave it out', /1 line is not matched/.test(await $text('status')), await $text('status'));
  await ev(`document.getElementById('allow-missing').click()`);
  await press('save');
  check('with permission it saves', /^Saved "Problems deck": 3 cards\.$/.test(await $text('status')), await $text('status'));

  // ---- the saved deck: it is there, it survives a reload, it loads back, it can be deleted ----
  const stored = JSON.parse(await ev(`localStorage.getItem('overloaded.deck')`));
  check('the browser holds the saved deck, with its text and the cards that were matched', stored.name === 'Problems deck' && stored.cards.length === 3 && stored.skipped === 1 && stored.text.includes('Totally Fake Card'));
  check('the saved deck panel appears', !(await $hidden('saved')) && /Problems deck: 3 cards/.test(await $text('saved-summary')) && /1 line was left out/.test(await $text('saved-summary')), await $text('saved-summary'));
  await load();
  check('after a reload the saved deck is still shown', !(await $hidden('saved')) && /Problems deck/.test(await $text('saved-summary')));
  await press('saved-load');
  const loaded = await ev(`({ text: document.getElementById('deck-text').value, name: document.getElementById('deck-name').value, preview: !document.getElementById('preview').hidden })`);
  check('loading puts the list and the name back and checks it', loaded.text.includes('Insectile Aberration') && loaded.name === 'Problems deck' && loaded.preview);
  await press('saved-delete');
  check('deleting removes it from the browser and the page', (await ev(`localStorage.getItem('overloaded.deck')`)) === null && (await $hidden('saved')));

  // ---- a commander is saved when chosen ----
  await load(); await paste(MOXFIELD_PLAIN); await press('check');
  await ev(`document.getElementById('deck-name').value = '  Eowyn   Tokens '`);
  await press('save');
  const commanderDeck = JSON.parse(await ev(`localStorage.getItem('overloaded.deck')`));
  check('a saved commander deck keeps its commander and a cleaned name', commanderDeck.name === 'Eowyn Tokens' && commanderDeck.commander.length === 1 && commanderDeck.cards.find((c) => c.section === 'commander')?.n.endsWith('Lady of Rohan'));
  check('the replace note shows once a deck is saved', !(await $hidden('save-note')));
  await ev(`document.getElementById('deck-name').value = ''`);
  await press('save');
  check('an empty name is refused with a message', (await $text('status')) === 'Give the deck a name first.');
  await ev(`(() => { const s = document.getElementById('commander-2'); s.value = document.getElementById('commander-1').value; s.dispatchEvent(new Event('change')); })()`);
  await ev(`document.getElementById('deck-name').value = 'Same twice'`);
  await press('save');
  check('the same card as commander and partner is refused, with what to do', /two different cards/.test(await $text('status')), await $text('status'));
  await press('saved-delete');

  // ---- cards pasted under another title they were printed under (real cases from a real export, 2026-10-29) ----
  // These need the list built with the alternate titles (format 2); an older cached list would fail here, on purpose.
  const katakana = String.fromCharCode(0x30d5, 0x30a7, 0x30a4, 0x30bf, 0x30ea, 0x30ba, 0x30e0);
  await load();
  await paste(`1 Ardyn Izunia\n1 Heart of the Mountain\n1 Kushala Daora's Fury\n1 Shadowbringers\n1 ${katakana}\n1 Sol Ring`); await press('check');
  const titled = await ev(`({ problems: !document.getElementById('problems').hidden, lines: Array.from(document.querySelectorAll('#sections .card-line')).map((li) => li.querySelector('.name').textContent), noted: document.querySelectorAll('#sections .typed-as').length, unmatched: document.querySelectorAll('#sections .card-line.unmatched').length })`);
  check('the five titles are found: no problems, nothing unmatched', !titled.problems && titled.unmatched === 0 && /Checked: 6 cards, all matched/.test(await $text('status')), JSON.stringify(titled) + ' ' + (await $text('status')));
  check('each is shown by its real name, with what was typed beside it', ['Varragoth, Bloodsky Sire (typed as "Ardyn Izunia")', 'Arcane Signet (typed as "Heart of the Mountain")', 'Snap (typed as "Kushala Daora\'s Fury")', "Dovin's Veto (typed as \"Shadowbringers\")", `Arcane Denial (typed as "${katakana}")`].every((text) => titled.lines.includes(text)), JSON.stringify(titled.lines));
  check('a card typed by its own name has no such note', titled.lines.includes('Sol Ring') && titled.noted === 5);
  await ev(`document.getElementById('deck-name').value = 'Titles'; document.getElementById('deck-name').dispatchEvent(new Event('input'))`);
  await press('save');
  const savedTitles = JSON.parse(await ev(`localStorage.getItem('overloaded.deck')`));
  check('the saved deck holds the real cards, with their real names', ['Varragoth, Bloodsky Sire', 'Arcane Signet', 'Snap', "Dovin's Veto", 'Arcane Denial', 'Sol Ring'].every((n) => savedTitles.cards.some((c) => c.n === n)) && !JSON.stringify(savedTitles.cards).includes('Shadowbringers'), JSON.stringify(savedTitles.cards.map((c) => c.n)));
  await press('saved-delete');

  // ---- keyboard, clear ----
  await load(); await paste('1 Sol Ring');
  await ev(`document.getElementById('deck-text').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }))`);
  check('Ctrl+Enter in the box checks the deck', !(await $hidden('preview')) && /Checked: 1 card, all matched/.test(await $text('status')), await $text('status'));
  await press('clear');
  check('Clear empties the box and hides the preview', (await ev(`document.getElementById('deck-text').value`)) === '' && (await $hidden('preview')));

  // ---- limits and odd input ----
  await paste('201 Forest'); await press('check');
  check('too many cards: shown, with the limit, and cannot be saved', /limit is 200/.test(await $text('notices')) && (await ev(`document.getElementById('save').disabled`)));
  await paste('Deck stats: 99\n1 Sol Ring\n0 Island\nCommander'); await press('check');
  const notices = await $text('notices');
  check('skipped lines are explained with their line numbers', /Line 1 was skipped/.test(notices) && /Line 3 was skipped: the quantity is 0/.test(notices) && /Line 4 says "Commander" but no card follows it/.test(notices), notices);
  await paste('<img src=x onerror="window.__pwned=1">\n<script>window.__pwned=2<\/script>\n1 Sol Ring'); await press('check');
  const injected = await ev(`({ imgs: document.querySelectorAll('#preview img, #notices img').length, scripts: document.querySelectorAll('#preview script, #notices script').length, pwned: typeof window.__pwned, shown: document.getElementById('notices').textContent.includes('<img src=x') })`);
  check('pasted markup is shown as text and never runs', injected.imgs === 0 && injected.scripts === 0 && injected.pwned === 'undefined' && injected.shown, JSON.stringify(injected));
  await paste('1 Sol Ring\n'.repeat(1500)); await press('check');
  check('a huge paste is refused with the limit, without freezing', /too many lines/.test(await $text('notices')) || /limit/.test(await $text('notices')), await $text('notices'));

  // ---- the card list cannot be loaded, then can ----
  await browser.send('Network.setBlockedURLs', { urls: ['*cards.json'] });
  await browser.goto(PAGE);
  await waitFor(async () => !(await $hidden('retry')) || null, 8000, 50);
  check('a card list that cannot load says so, offers to retry, and Check stays off', /could not be loaded/.test(await $text('list-state')) && !(await $hidden('retry')) && (await ev(`document.getElementById('check').disabled`)));
  await browser.send('Network.setBlockedURLs', { urls: [] });
  await press('retry');
  check('after the network is back, Try again works', Boolean(await ready()) && (await $hidden('retry')));

  // ---- storage blocked ----
  await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });` });
  await browser.goto(PAGE); await ready();
  check('with storage blocked the page still loads and says it cannot remember a deck', !(await $hidden('storage-hint')) && (await $hidden('saved')));
  await paste('1 Sol Ring'); await press('check');
  await ev(`document.getElementById('deck-name').value = 'Nowhere'`);
  await press('save');
  check('and saving says why it did not work, without crashing', /would not save the deck/.test(await $text('status')), await $text('status'));

  // ---- the whole session ----
  const errors = browser.logs.filter((l) => /^exception:|^console\.error|^error:/.test(l) && !/Failed to load resource|ERR_BLOCKED|net::/.test(l));
  check('no script errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  const foreign = browser.events.filter((e) => e.method === 'Network.requestWillBeSent' && !e.params.request.url.startsWith(ORIGIN) && !e.params.request.url.startsWith('data:'));
  check('nothing was requested from any other site', foreign.length === 0, foreign.slice(0, 2).map((e) => e.params.request.url).join(' | '));

  if (process.argv.includes('--screenshot')) {
    // Three looks, desktop width: the top of the page with a saved deck (dark), the list (light), the commander and save area (dark).
    await browser.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: '1' }).catch(() => {});
    const scheme = (value) => browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value }] });
    await scheme('dark');
    await load(); await paste(MOXFIELD_PLAIN); await press('check');
    await ev(`document.getElementById('deck-name').value = 'Eowyn Tokens'`); await press('save');
    await ev(`window.scrollTo(0, 0)`); await sleep(300);
    await browser.screenshot('scratch-deck-ui-top.png');
    await scheme('light');
    await paste(MOXFIELD_PLAIN + '\n\n1 Totally Fake Card\n1 Insectile Aberration'); await press('check');
    await ev(`document.getElementById('problems').scrollIntoView()`); await sleep(300);
    await browser.screenshot('scratch-deck-ui-light.png');
    await scheme('dark');
    await ev(`document.getElementById('commander-box').scrollIntoView()`); await sleep(300);
    await browser.screenshot('scratch-deck-ui-bottom.png');
    await press('saved-delete');
    console.log('saved scratch-deck-ui-top.png, -light.png and -bottom.png (delete them afterward)');
  }
} finally {
  await closeAllBrowsers();
  if (server) await server.close();
}

if (failures.length) { console.log(`\n${failures.length} of ${checks} deck page checks FAILED.`); process.exit(1); }
console.log(`All ${checks} deck page checks passed.`);
