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
  // Card pictures are answered by a stand-in (no network), and every address asked for is recorded. An id in failPictures
  // answers 404 with nothing in it, as Scryfall does for a picture that does not exist.
  // An id in oddPictures answers a picture of a different shape (488 by 300) from the one the page expects (488 by 680).
  const failPictures = new Set();
  const oddPictures = new Set();
  const pictureRequests = await browser.fakeImages('https://cards.scryfall.io/*', (url) => {
    const id = url.split('/').pop().replace('.jpg', '');
    if (failPictures.has(id)) return { status: 404, type: 'text/plain', text: '' };
    const height = oddPictures.has(id) ? 300 : 680;
    return { type: 'image/svg+xml', text: `<svg xmlns="http://www.w3.org/2000/svg" width="488" height="${height}" viewBox="0 0 488 ${height}"><rect width="488" height="${height}" rx="30" fill="#456"/></svg>` };
  });
  const ev = (expression) => browser.eval(expression);
  const $text = (id) => ev(`document.getElementById(${JSON.stringify(id)}).textContent`);
  const $hidden = (id) => ev(`document.getElementById(${JSON.stringify(id)}).hidden`);
  const paste = (value) => ev(`(() => { const t = document.getElementById('deck-text'); t.value = ${JSON.stringify(value)}; t.dispatchEvent(new Event('input')); })()`);
  // A list that names sets and numbers fetches those sets' printing files before it is shown, so after Check (or loading the
  // saved deck) the page is given time to finish: the status stops saying "Checking the printings...".
  const settled = () => waitFor(async () => !/^Checking the printings/.test(await $text('status')) || null, 15000, 30);
  const press = async (id) => { await ev(`document.getElementById(${JSON.stringify(id)}).click()`); if (id === 'check' || id === 'saved-load') await settled(); };
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

  // ---- exact printings: the set and number typed on a line pick the printing whose picture is shown ----
  // Real data (checked against Scryfall's own records on 2026-10-29): Sol Ring cmm 410 is 46ca0b66..., Arcane Signet sld 916 is
  // dd1d87e4... (the printing titled "Heart of the Mountain"), Arcane Signet cmm 367 is 0539b83c..., and cmm 5 is Ulamog.
  const SOL_RING_CMM_410 = '46ca0b66-a000-4483-b916-f5b89e710244';
  const SIGNET_SLD_916 = 'dd1d87e4-f51a-448f-824f-99dffd73403c';
  const SIGNET_CMM_367 = '0539b83c-4459-41b5-a001-d15a1c9ddf23';
  const checked = () => waitFor(async () => /Checked:/.test(await $text('status')) || null, 15000, 50);
  const rowsOf = () => ev(`Array.from(document.querySelectorAll('#sections .card-line')).map((li) => ({ name: li.querySelector('.name').textContent, qty: li.querySelector('.qty').textContent, printing: li.querySelector('.printing')?.textContent ?? null, tip: li.querySelector('.printing')?.title ?? '', type: li.querySelector('.type')?.textContent ?? null, cost: li.querySelector('.cost')?.textContent ?? null, columns: li.children.length, id: li.dataset.cardId ?? null, source: li.dataset.printing ?? null }))`);
  await load();
  const requestsBefore = pictureRequests.length;
  await paste('1 Sol Ring (cmm) 410\n2 Lightning Bolt\n1 Arcane Signet (sld) 916\n1 Arcane Signet (cmm) 367\n1 Heart of the Mountain\n1 Sol Ring (cmm) 5\n1 Sol Ring (cmm) 99999\n1 Not A Real Card (abc) 7');
  await press('check');
  check('while the printings load the page says so, and then it says the deck is checked', Boolean(await checked()), await $text('status'));
  const printed = await rowsOf();
  const printedBy = (name, at = 0) => printed.filter((row) => row.name === name)[at];
  const ringRows = printed.filter((row) => row.name === 'Sol Ring');
  const signetRows = printed.filter((row) => row.name === 'Arcane Signet');
  check('Sol Ring typed with cmm 410 is its own row and shows that printing', ringRows.some((row) => row.id === SOL_RING_CMM_410 && row.printing === 'CMM 410' && row.source === 'set' && row.qty === '1'), JSON.stringify(ringRows));
  check('the two numbers that are not Sol Ring printings join the default row, say so, and show the default picture', ringRows.length === 2 && ringRows.some((row) => row.id !== SOL_RING_CMM_410 && row.qty === '2' && row.source === 'default' && /CMM 5 \(not found\)/.test(row.printing) && /CMM 99999 \(not found\)/.test(row.printing)), JSON.stringify(ringRows));
  check('the tooltip says why (cmm 5 is another card, cmm 99999 is not in the set)', ringRows.some((row) => /CMM 5: This number in that set is a different card/.test(row.tip) && /CMM 99999: This number is not in that set/.test(row.tip)), JSON.stringify(ringRows.map((r) => r.tip)));
  check('two printings of Arcane Signet are two rows with their own pictures', signetRows.length === 2 && signetRows.some((row) => row.id === SIGNET_SLD_916) && signetRows.some((row) => row.id === SIGNET_CMM_367 && row.printing === 'CMM 367'), JSON.stringify(signetRows));
  check('the card typed by its title is the same printing as SLD 916, so it is the same row (2 copies)', signetRows.find((row) => row.id === SIGNET_SLD_916)?.qty === '2' && signetRows.find((row) => row.id === SIGNET_SLD_916)?.printing === 'SLD 916', JSON.stringify(signetRows));
  check('a card with no set typed shows the default picture and an empty cell', printedBy('Lightning Bolt')?.source === 'default' && printedBy('Lightning Bolt')?.printing === '' && printedBy('Lightning Bolt')?.id !== null);
  check('a card that was not found still shows what was typed, and the cells stay in their columns (5 cells, or 4 with no cost cell when not matched)', printedBy('Not A Real Card')?.printing === 'ABC 7' && printedBy('Not A Real Card')?.columns === 4 && printed.filter((row) => row.cost !== null).every((row) => row.columns === 5), JSON.stringify(printed));
  check('count, name, type and cost are still shown', printedBy('Lightning Bolt')?.qty === '2' && /Instant/.test(printedBy('Lightning Bolt')?.type ?? '') && printedBy('Lightning Bolt')?.cost === '{R}' && ringRows.every((row) => /Artifact/.test(row.type) && row.cost === '{1}'), JSON.stringify(printed));
  const notes = await ev(`Array.from(document.querySelectorAll('#notices li')).map((li) => li.textContent)`);
  check('the page says that two sets and numbers were not found, and which', notes.some((n) => /2 sets and numbers were not found, so those cards show their default picture: CMM 5, CMM 99999/.test(n)), JSON.stringify(notes));
  check('only the sets the deck names were fetched, once each (cmm and sld; abc is not a card so it costs nothing)', (await ev(`performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('/data/printings/'))`)).map((n) => n.split('/').pop()).sort().join() === 'set-cmm.json,set-sld.json');
  check('and no request went to Scryfall for printings (pictures are loaded only on hover)', pictureRequests.length === requestsBefore, String(pictureRequests.length - requestsBefore));

  // While the printing files load the old preview is gone, so Save cannot pair its cards with the new text (read in the same
  // moment as the click, before the page has had time to finish).
  const during = await ev(`(() => { document.getElementById('check').click(); return { hidden: document.getElementById('preview').hidden, status: document.getElementById('status').textContent }; })()`);
  check('while a list waits for its printing files the old preview is hidden and the page says it is checking', during.hidden === true && /^Checking the printings in 2 sets/.test(during.status), JSON.stringify(during));
  await checked();

  // The same list typed again (no fetch needed: the files are kept for this visit), and a change to the list.
  const fetchedBefore = await ev(`performance.getEntriesByType('resource').filter((e) => e.name.includes('/data/printings/')).length`);
  await press('check');
  await checked();
  check('checking the same list again fetches nothing more', (await ev(`performance.getEntriesByType('resource').filter((e) => e.name.includes('/data/printings/')).length`)) === fetchedBefore);

  // A set that cannot be loaded: the card is still right, the page says so, and the next check tries again.
  await browser.send('Network.enable');
  await browser.send('Network.setBlockedURLs', { urls: ['*set-m21.json'] });
  await paste('1 Sol Ring (m21) 1'); await press('check');
  await checked();
  const blocked = await rowsOf();
  const blockedNotes = await ev(`Array.from(document.querySelectorAll('#notices li')).map((li) => li.textContent)`);
  check('a set file that fails to load leaves the card matched with the default picture and says it was not loaded', blocked.length === 1 && blocked[0].name === 'Sol Ring' && blocked[0].source === 'default' && /M21 1 \(not loaded\)/.test(blocked[0].printing) && blockedNotes.some((n) => /could not be loaded for 1 set and number/.test(n)), JSON.stringify([blocked, blockedNotes]));
  await browser.send('Network.setBlockedURLs', { urls: [] });
  await press('check');
  await checked();
  const retried = await rowsOf();
  check('with the network back, the next check tries again (a failure is not remembered)', retried.length === 1 && !/not loaded/.test(retried[0].printing), JSON.stringify(retried));
  const firstResult = await rowsOf();
  await paste('1 Sol Ring (zzz) 1'); await press('check');
  await checked();
  check('a set our data does not have is "not found" (the server answers 404), not "not loaded"', /ZZZ 1 \(not found\)/.test((await rowsOf())[0].printing), JSON.stringify(await rowsOf()));
  check('and that check left the earlier result alone (nothing to compare was lost)', firstResult.length === 1);

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

  // ---- hovering a card in the checked list shows its picture (the titled deck above is still on the page) ----
  const peek = () => ev(`(() => { const p = document.getElementById('card-peek'); const i = document.getElementById('card-peek-image'); const r = p.getBoundingClientRect(); return { hidden: p.hidden, src: i.getAttribute('src'), imageHidden: i.hidden, note: document.getElementById('card-peek-note').textContent, left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: innerWidth, h: innerHeight, pointerEvents: getComputedStyle(p).pointerEvents }; })()`);
  // Scrolls the row into the middle and waits two frames, so the scroll event (which hides the box) has come BEFORE the pointer moves.
  const rowFacts = (index, block = 'center') => ev(`new Promise((resolve) => { const row = document.querySelectorAll('#sections .card-line')[${index}]; row.scrollIntoView({ block: ${JSON.stringify(block)} }); requestAnimationFrame(() => requestAnimationFrame(() => resolve({ id: row.dataset.cardId ?? null, name: row.dataset.cardName ?? null }))); })`);
  const nameBox = (index) => ev(`(() => { const r = document.querySelectorAll('#sections .card-line')[${index}].querySelector('.name').getBoundingClientRect(); return { x: Math.round(r.left + 10), y: Math.round(r.top + r.height / 2) }; })()`);
  const hover = async (index, block = 'center') => { await rowFacts(index, block); await sleep(150); const { x, y } = await nameBox(index); await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x - 5, y }); await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await sleep(120); return { x, y }; };
  const away = async () => { await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 3, y: 3 }); await sleep(120); };
  const pictureUrl = (id) => `https://cards.scryfall.io/normal/front/${id[0]}/${id[1]}/${id}.jpg`;
  await away();
  check('before anything is hovered the picture box is hidden and no picture was asked for', (await peek()).hidden && pictureRequests.length === 0, JSON.stringify(await peek()));
  check('every matched row carries its card id and name, and its name can be focused', (await ev(`document.querySelectorAll('#sections .card-line[data-card-id]').length`)) === 6 && (await ev(`Array.from(document.querySelectorAll('#sections .card-line .name')).every((n) => n.tabIndex === 0)`)));
  const row1 = await rowFacts(1);
  const at1 = await hover(1);
  const shown1 = await peek();
  check('hovering the second card (Arcane Signet, typed as "Heart of the Mountain") shows its normal-size picture, of the printing that carries that title (SLD 916), not the default one', !shown1.hidden && shown1.src === pictureUrl(row1.id) && row1.id === SIGNET_SLD_916 && !shown1.imageHidden && row1.name === 'Arcane Signet', JSON.stringify({ row1, shown1 }));
  check('the box says whose picture it is and which printing', /Arcane Signet/.test(shown1.note) && /the printing that carries the title you typed/.test(shown1.note) && !/default printing/.test(shown1.note), shown1.note);
  const textEnd = await ev(`(() => { const range = document.createRange(); range.selectNodeContents(document.querySelectorAll('#sections .card-line')[1].querySelector('.name')); return range.getBoundingClientRect().right; })()`);
  check('it is inside the window and never takes the pointer', shown1.left >= 0 && shown1.right <= shown1.w && shown1.top >= 0 && shown1.bottom <= shown1.h && shown1.pointerEvents === 'none', JSON.stringify({ at1, shown1 }));
  check('on a wide window it sits at the right, level with the pointer, and does not cover the name it points at', shown1.left > textEnd && (Math.abs((shown1.top + shown1.bottom) / 2 - at1.y) < 3 || shown1.top === 8 || Math.round(shown1.bottom) === shown1.h - 8), JSON.stringify({ at1, textEnd, shown1 }));
  check('the picture was asked for from Scryfall\'s picture server, once, and only in the normal size', pictureRequests.filter((u) => u === pictureUrl(row1.id)).length === 1 && pictureRequests.every((u) => /^https:\/\/cards\.scryfall\.io\/normal\/front\/[0-9a-f]\/[0-9a-f]\/[0-9a-f-]{36}\.jpg$/.test(u)), JSON.stringify(pictureRequests));
  const row4 = await rowFacts(4);
  await hover(4);
  const shown4 = await peek();
  check('a card imported by another title (the Japanese one) shows its card\'s picture too, and the box is visible', !shown4.hidden && shown4.src === pictureUrl(row4.id) && /Arcane Denial/.test(shown4.note) && row4.id !== row1.id, JSON.stringify({ row4, shown4 }));
  // Moving between the columns of one row must not hide and show the box again (a flicker): count every change of its hidden state.
  await ev(`window.__peekChanges = 0; new MutationObserver((records) => { window.__peekChanges += records.length; }).observe(document.getElementById('card-peek'), { attributes: true, attributeFilter: ['hidden'] })`);
  const typeBox = await ev(`(() => { const r = document.querySelectorAll('#sections .card-line')[4].querySelector('.type').getBoundingClientRect(); return { x: Math.round(r.left + 10), y: Math.round(r.top + 8) }; })()`);
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: typeBox.x, y: typeBox.y }); await sleep(150);
  check('moving across the columns of one row does not flicker the box (it stays shown)', (await ev(`window.__peekChanges`)) === 0 && !(await peek()).hidden, `${await ev('window.__peekChanges')} changes`);
  await away();
  check('moving away hides the box', (await peek()).hidden);
  // Near the top and the bottom of the window the box is kept inside it.
  await hover(1, 'start');
  const nearTop = await peek();
  check('with the row at the top of the window the box is kept inside it (not cut off above)', !nearTop.hidden && nearTop.top >= 0 && nearTop.top <= 8.5, JSON.stringify(nearTop));
  await away();
  await hover(5, 'end');
  const nearBottom = await peek();
  check('with the row at the bottom of the window the box is kept inside it (not cut off below)', !nearBottom.hidden && nearBottom.bottom <= nearBottom.h && nearBottom.bottom >= nearBottom.h - 8.5, JSON.stringify(nearBottom));
  await away();
  // A row whose card id is damaged shows nothing and asks for nothing.
  const asksBefore = pictureRequests.length;
  await ev(`document.querySelectorAll('#sections .card-line')[2].dataset.cardId = 'not-an-id'`);
  await hover(2);
  check('a row with a damaged card id shows no box and asks for no picture', (await peek()).hidden && pictureRequests.length === asksBefore, JSON.stringify(pictureRequests.slice(asksBefore)));
  await away();
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 700, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  const rowNarrow = await rowFacts(1);
  const atNarrow = await hover(1);
  const narrow = await peek();
  check('on a narrow window (700 px) it follows the pointer instead, to its right, inside the window', !narrow.hidden && Math.abs(narrow.left - (atNarrow.x + 24)) <= 1 && narrow.right <= narrow.w && narrow.src === pictureUrl(rowNarrow.id), JSON.stringify({ atNarrow, narrow }));
  await away();
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  await ev(`document.querySelectorAll('#sections .card-line .name')[0].focus()`);
  const focused = await peek();
  check('focusing a name with the keyboard shows the picture too', !focused.hidden && focused.src === pictureUrl((await rowFacts(0)).id), JSON.stringify(focused));
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  check('Escape hides it', (await peek()).hidden);
  await ev(`document.querySelectorAll('#sections .card-line .name')[0].blur(); document.querySelectorAll('#sections .card-line .name')[0].focus()`);
  await ev(`document.activeElement.blur()`);
  check('leaving the name with the keyboard hides it', (await peek()).hidden);
  // A card whose picture was never loaded before (the browser would otherwise answer from its cache) and that Scryfall "does not have".
  const row3 = await rowFacts(3);
  failPictures.add(row3.id);
  await hover(3);
  await waitFor(async () => (await peek()).imageHidden || null, 3000, 50);
  const missing = await peek();
  check('a picture that does not exist says so instead of showing a broken image', missing.imageHidden && /No picture could be loaded for Dovin's Veto/.test(missing.note) && !missing.hidden, JSON.stringify(missing));
  await away(); await hover(3);
  const missingAgain = await peek();
  check('and hovering that card again still shows the message, not a broken image', missingAgain.imageHidden && /No picture could be loaded for Dovin's Veto/.test(missingAgain.note) && !missingAgain.hidden, JSON.stringify(missingAgain));
  await away();
  // Escape closes the box and it stays closed while the pointer moves inside that row; leaving the row and coming back shows it.
  await hover(1);
  check('(before Escape) the box is showing', !(await peek()).hidden);
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  const at = await nameBox(1);
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x + 20, y: at.y }); await sleep(120);
  check('Escape closes the box and moving inside the same row does not bring it back', (await peek()).hidden);
  await away();
  await hover(1);
  check('after leaving the row (with the mouse) and coming back it shows again', !(await peek()).hidden);
  // Closed again with the pointer still in the row: focusing the name with the keyboard on purpose brings it back, and once
  // that has been cleared the pointer moving in the row shows it again after the keyboard is done with it.
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  check('(closed again with Escape)', (await peek()).hidden);
  await ev(`document.querySelectorAll('#sections .card-line .name')[1].focus()`);
  check('focusing that name with the keyboard on purpose shows it', !(await peek()).hidden);
  await ev(`document.activeElement.blur()`);
  check('and blurring it hides it', (await peek()).hidden);
  const at2 = await nameBox(1);
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at2.x + 12, y: at2.y }); await sleep(120);
  check('after that, the pointer moving in the same row shows it again (the closed state was cleared by the focus)', !(await peek()).hidden);
  await ev(`new Promise((resolve) => { window.scrollBy(0, 60); requestAnimationFrame(() => requestAnimationFrame(resolve)); })`);
  check('scrolling the page hides the box (it would be left behind at the old spot)', (await peek()).hidden);
  await away();
  await load(); await paste('1 Totally Fake Card\n1 Sol Ring'); await press('check');
  const fakeIndex = await ev(`Array.from(document.querySelectorAll('#sections .card-line')).findIndex((li) => li.classList.contains('unmatched'))`);
  await rowFacts(fakeIndex); await sleep(150);
  const fakeAt = await nameBox(fakeIndex);
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: fakeAt.x, y: fakeAt.y }); await sleep(120);
  check('a line that was not matched has no picture to show', fakeIndex >= 0 && (await ev(`document.querySelectorAll('#sections .card-line')[${fakeIndex}].dataset.cardId`)) === undefined && (await peek()).hidden);
  await away();

  // A picture whose real shape differs from the declared one: once it has loaded the box is centred on the pointer again.
  await load(); await paste('1 Lightning Bolt'); await press('check');
  const bolt = await rowFacts(0);
  oddPictures.add(bolt.id);
  const atBolt = await hover(0);
  await waitFor(async () => (await ev(`document.getElementById('card-peek-image').complete && document.getElementById('card-peek-image').naturalHeight === 300`)) || null, 3000, 50);
  await sleep(150);
  const odd = await peek();
  check('a picture that turns out a different shape is placed again once it has loaded (centred on the pointer)', !odd.hidden && Math.abs((odd.top + odd.bottom) / 2 - atBolt.y) < 3 && odd.bottom - odd.top < 400, JSON.stringify({ atBolt, odd }));
  await away();

  // ---- the number is optional ----
  await load(); await paste('Thrasios, Triton Hero\n2 Sol Ring\nLands (36)\nSIDEBOARD:\nAnnul'); await press('check');
  const bare = await ev(`({ headings: Array.from(document.querySelectorAll('#sections h3')).map((h) => h.textContent), lines: Array.from(document.querySelectorAll('#sections .card-line')).map((li) => li.querySelector('.qty').textContent + ' ' + li.querySelector('.name').textContent), notices: Array.from(document.querySelectorAll('#notices li')).map((li) => li.textContent), problems: !document.getElementById('problems').hidden })`);
  check('a name with no number is one card, in the right section, and nothing needs attention', !bare.problems && bare.lines.includes('1 Thrasios, Triton Hero') && bare.lines.includes('2 Sol Ring') && bare.lines.includes('1 Annul') && bare.headings.includes('Sideboard: 1'), JSON.stringify(bare));
  check('the page says which lines were counted as 1, and that the heading line was skipped', bare.notices.some((n) => /Line 3 was skipped: "Lands \(36\)"/.test(n)) && bare.notices.some((n) => /^2 lines have no number, so each was counted as 1 card \(lines 1 and 5\)\.$/.test(n)), JSON.stringify(bare.notices));
  check('the status counts them', /Checked: 4 cards, all matched/.test(await $text('status')), await $text('status'));

  // ---- an export shaped like a real one: main deck (one card under another title), SIDEBOARD:, commander named last ----
  await load();
  await paste(`1 Sol Ring\n1 Weirding Wood\n1 Yavimaya Dryad\n1 ${katakana}\n10 Forest\n\nSIDEBOARD:\n1 Annul\n1 Swords to Plowshares\n\nCommander\n1 Kyodai, Soul of Kamigawa`); await press('check');
  const sideShape = await ev(`({ headings: Array.from(document.querySelectorAll('#sections h3')).map((h) => h.textContent), problems: !document.getElementById('problems').hidden, commanderOn: document.getElementById('mode-commander').checked, note: document.getElementById('commander-note').textContent, side: Array.from(document.querySelectorAll('#sections ul')).map((ul) => Array.from(ul.querySelectorAll('.name')).map((n) => n.textContent)) })`);
  check('the sections are Commander 1, Main deck 14 and Sideboard 2, with nothing needing attention', JSON.stringify(sideShape.headings) === JSON.stringify(['Commander: 1', 'Main deck: 14', 'Sideboard: 2']) && !sideShape.problems, JSON.stringify(sideShape));
  check('the sideboard lists its two cards and the main deck has the title match', sideShape.side[2].join('|') === 'Annul|Swords to Plowshares' && sideShape.side[1].some((t) => t === `Arcane Denial (typed as "${katakana}")`), JSON.stringify(sideShape.side));
  check('the commander named last is marked as the commander (turned on, and says it was marked)', sideShape.commanderOn && /Kyodai/.test(await ev(`document.getElementById('commander-1').selectedOptions[0].textContent`)), sideShape.note);
  await ev(`document.getElementById('deck-name').value = 'Side'; document.getElementById('deck-name').dispatchEvent(new Event('input'))`);
  await press('save');
  const savedSide = JSON.parse(await ev(`localStorage.getItem('overloaded.deck')`));
  const sectionCounts = savedSide.cards.reduce((sum, c) => ({ ...sum, [c.section]: (sum[c.section] ?? 0) + c.qty }), {});
  check('the saved deck keeps the three sections apart', JSON.stringify(sectionCounts) === JSON.stringify({ main: 14, sideboard: 2, commander: 1 }) || (sectionCounts.main === 14 && sectionCounts.sideboard === 2 && sectionCounts.commander === 1), JSON.stringify(sectionCounts));
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
  const injected = await ev(`({ imgs: document.querySelectorAll('#preview img, #notices img').length, scripts: document.querySelectorAll('#preview script, #notices script').length, pwned: typeof window.__pwned, shown: document.getElementById('preview').textContent.includes('<img src=x') })`); // a line with no number is now a card name that was not found, so the text shows in the list and the problems, not the notices
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
  const foreign = browser.events.filter((e) => e.method === 'Network.requestWillBeSent' && !e.params.request.url.startsWith(ORIGIN) && !e.params.request.url.startsWith('data:') && !e.params.request.url.startsWith('https://cards.scryfall.io/'));
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
