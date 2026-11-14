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
  const failBackPictures = new Set(); // the BACK picture only of these ids is answered with 404
  const pictureRequests = await browser.fakeImages('https://cards.scryfall.io/*', (url) => {
    const id = url.split('/').pop().replace('.jpg', '');
    if (failPictures.has(id) || (failBackPictures.has(id) && url.includes('/back/'))) return { status: 404, type: 'text/plain', text: '' };
    const height = oddPictures.has(id) ? 300 : 680;
    return { type: 'image/svg+xml', text: `<svg xmlns="http://www.w3.org/2000/svg" width="488" height="${height}" viewBox="0 0 488 ${height}"><rect width="488" height="${height}" rx="30" fill="#456"/></svg>` };
  });
  // Mana symbols are Scryfall's SVGs; a stand-in answers them too (an address in failSymbols answers 404, so the plain round symbol is drawn instead).
  const failSymbols = new Set();
  const symbolRequests = await browser.fakeImages('https://svgs.scryfall.io/*', (url) => (failSymbols.has(url.split('/').pop()) ? { status: 404, type: 'text/plain', text: '' } : { type: 'image/svg+xml', text: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="10" fill="#789"/></svg>' }));
  const ev = (expression) => browser.eval(expression);
  const $text = (id) => ev(`document.getElementById(${JSON.stringify(id)}).textContent`);
  const $hidden = (id) => ev(`document.getElementById(${JSON.stringify(id)}).hidden`);
  // The paste box is on its own screen now: open it the way a person would (New deck from the list, Edit list from a deck), then fill it.
  const paste = async (value) => { if (await ev(`document.getElementById('paste').hidden`)) await ev(`document.getElementById(document.getElementById('saved').hidden ? 'edit-list' : 'new-deck').click()`); await ev(`(() => { const t = document.getElementById('deck-text'); t.value = ${JSON.stringify(value)}; t.dispatchEvent(new Event('input')); })()`); };
  // The way back to the list is the header's Decks link (there is no All decks button on the deck page).
  const showList = () => ev(`document.querySelector('header.site-header .site-nav a[href="/deck"]').click()`);
  // A list that names sets and numbers fetches those sets' printing files before it is shown, so after Check (or loading the
  // saved deck) the page is given time to finish: the status stops saying "Checking the printings...".
  const settled = () => waitFor(async () => !/^Checking the printings/.test(await $text('deck-status')) || null, 15000, 30);
  const setField = (id, value) => ev(`(() => { const f = document.getElementById(${JSON.stringify(id)}); f.value = ${JSON.stringify(value)}; f.dispatchEvent(new Event('input')); f.dispatchEvent(new Event('change')); })()`);
  // There is no Save button any more (a deck saves itself after each change), so pressing 'save' only waits for that to have happened.
  const press = async (id) => { if (id === 'save') { await settled(); return; } await ev(`document.getElementById(${JSON.stringify(id)}).click()`); if (id === 'check') await settled(); };
  // The saved decks are a library under 'overloaded.decks' (up to 20, one selected). These read it and drive its buttons.
  const library = async () => JSON.parse((await ev(`localStorage.getItem('overloaded.decks')`)) ?? 'null');
  const selectedSaved = async () => { const lib = await library(); return lib?.decks.find((entry) => entry.id === lib.selected)?.deck ?? null; };
  // A saved deck's card opens it; Play solo and Delete are two small buttons on it.
  const clickSaved = (action, index = 0) => (action === 'load' ? ev(`document.querySelectorAll('#saved-list .deck-face')[${index}].click()`) : ev(`document.querySelectorAll('#saved-list [data-action="${action}"]')[${index}].click()`));
  const pressLoad = async (index = 0) => { await clickSaved('load', index); await settled(); };
  const deleteAllSaved = async () => { for (let n = 0; n < 25 && (await ev(`document.querySelectorAll('#saved-list .deck-face').length`)); n++) await clickSaved('delete'); };
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
      buttonsWithoutText: Array.from(document.querySelectorAll('button')).filter((b) => !b.textContent.trim() && !b.getAttribute('aria-label')).length,
      footer: document.querySelector('footer')?.textContent ?? '',
      statusIsLive: document.getElementById('deck-status').getAttribute('role') === 'status' && document.getElementById('deck-status').getAttribute('aria-live') === 'polite',
      back: document.querySelector('.site-nav a')?.getAttribute('href'),
      inlineStyles: document.querySelectorAll('[style]').length, inlineScripts: Array.from(document.scripts).filter((s) => !s.src).length,
    };
  })()`);
  check('the page has a title, a language and one h1', /decks/i.test(facts.title) && facts.lang === 'en' && facts.h1s === 1);
  const siteHeader = await ev(`(() => { const h = document.querySelector('body > header.site-header'); return h ? { brand: h.querySelector('.brand')?.getAttribute('href'), name: h.querySelector('.brand-name')?.textContent, links: [...h.querySelectorAll('.site-nav a:not([hidden])')].map((a) => a.textContent + ' ' + a.getAttribute('href')), current: [...h.querySelectorAll('[aria-current="page"]')].map((a) => a.textContent), logo: h.querySelectorAll('img.brand-logo').length, first: document.body.firstElementChild === h, headings: h.querySelectorAll('h1,h2,h3').length } : null; })()`);
  check('the site header is the first thing on the page: the name linking home, Home, Decks and Solo table (Lobby only appears when you are at a table), the current page marked, no heading of its own', siteHeader && siteHeader.first && siteHeader.brand === '/' && siteHeader.name === 'Overloaded' && JSON.stringify(siteHeader.links) === JSON.stringify(['Home /', 'Decks /deck', 'Solo table /solo']) && JSON.stringify(siteHeader.current) === JSON.stringify(['Decks']) && siteHeader.headings === 0, JSON.stringify(siteHeader));
  check('the logo (frontend/public/brand/logo.png, a wordmark) is shown and loaded, and the written name is then hidden from the eye (kept for screen readers)', siteHeader && siteHeader.logo === 1 && (await ev(`(() => { const i = document.querySelector('.site-header img.brand-logo'); return i.complete && i.naturalWidth === 432 && document.querySelector('.brand-name').getBoundingClientRect().width <= 1; })()`)), JSON.stringify(siteHeader));
  const htmlSource = await (await fetch(PAGE)).text();
  check('the header and the footer are written in the page itself (not added by a script), so they are there from the first paint', /<header class="site-header">[\s\S]*<nav class="site-nav"/.test(htmlSource) && /<footer class="site-footer">[\s\S]*Fan Content Policy/.test(htmlSource) && /aria-current="page"[^>]*>Decks</.test(htmlSource));
  const siteFooter = await ev(`(() => { const f = document.querySelector('footer.site-footer'); return f ? { links: [...f.querySelectorAll('a')].map((a) => a.textContent + ' ' + a.getAttribute('href')), credit: f.querySelector('.footer-credit')?.textContent, legal: f.querySelector('.footer-legal')?.textContent ?? '', last: document.body.querySelector(':scope > footer') === f, count: document.querySelectorAll('footer').length } : null; })()`);
  check('the footer repeats nothing the header has: the credit to Scryfall, the source link and the fan content notice, and it is the only footer', siteFooter && siteFooter.last && siteFooter.count === 1 && JSON.stringify(siteFooter.links) === JSON.stringify(['Scryfall https://scryfall.com', 'Source on GitHub https://github.com/kevlam1/Overloaded']) && /Scryfall/.test(siteFooter.credit) && /unofficial Fan Content/.test(siteFooter.legal), JSON.stringify(siteFooter));
  check('every field has a label', facts.withoutLabel.length === 0, facts.withoutLabel.join());
  check('every button has text or a label (the two view buttons are icons)', facts.buttonsWithoutText === 0);
  check('the fan content disclaimer is on the page', /unofficial Fan Content/.test(facts.footer) && /Fan Content Policy/.test(facts.footer) && /Not approved\/endorsed by Wizards/.test(facts.footer) && /property of Wizards of the Coast/.test(facts.footer));
  check('messages are announced politely', facts.statusIsLive);
  check('there is a way to the lobby: the header\'s first link (there is no separate Back link)', facts.back === '/' && (await ev(`document.querySelector('.back')`)) === null);
  check('no inline styles and no inline scripts (the content policy forbids them)', facts.inlineStyles === 0 && facts.inlineScripts === 0);
  check('nothing is shown before a deck is checked: no deck, no saved decks (the page opens at the box to paste into)', (await $hidden('preview')) && (await $hidden('saved')) && !(await $hidden('paste')));
  check('once the card list has loaded the page says nothing about it (a tooltip says how many cards it holds)', (await $text('list-state')) === '' && /[\d,]{5,} cards in the card list/.test(await ev(`document.getElementById('list-state').title`)), await ev(`document.getElementById('list-state').title`));

  // ---- an empty paste ----
  await press('check');
  check('checking nothing says so', (await $text('deck-status')) === 'Paste a decklist first.' && (await $hidden('preview')));

  // ---- the three real exports ----
  const checkExport = async (label, exportText, expect) => {
    await load(); await paste(exportText); await press('check');
    await waitFor(async () => !(await $hidden('preview')) || null, 5000, 50);
    const view = await ev(`(() => ({
      status: document.getElementById('deck-status').textContent, summary: document.getElementById('summary').textContent,
      headings: Array.from(document.querySelectorAll('#sections h3')).map((h) => h.textContent),
      lines: document.querySelectorAll('#sections .card-line').length, unmatched: document.querySelectorAll('#sections .card-line.unmatched').length,
      problemsHidden: document.getElementById('problems').hidden,
      commander: [...document.querySelectorAll('#sections [data-group="commander"] .name')].map((n) => n.textContent)[0] ?? '',
      mode: document.getElementById('deck-format').value === 'commander' ? 'commander' : 'none',
      commanderShown: Boolean(document.querySelector('#sections [data-group="commander"]')),
      note: document.getElementById('commander-note').textContent,
      focus: document.activeElement?.id,
    }))()`);
    check(`${label}: checked, 19 cards, nothing to fix`, view.summary === '19 cards' && view.problemsHidden && view.unmatched === 0, view.summary);
    check(`${label}: sections ${expect.headings.join(' and ')}`, JSON.stringify(view.headings) === JSON.stringify(expect.headings), JSON.stringify(view.headings));
    check(`${label}: one line per card, 10 lines`, view.lines === 10, String(view.lines));
    check(`${label}: ${expect.mode === 'commander' ? 'the guessed commander is Eowyn' : 'no commander is shown while the format is Standard'}`, expect.mode === 'commander' ? /^Éowyn, Lady of Rohan$/.test(view.commander) : view.commander === '', view.commander);
    check(`${label}: the format is ${expect.mode === 'commander' ? 'Commander and the deck has a Commander group' : 'Standard and there is no Commander group'}`, view.mode === expect.mode && view.commanderShown === (expect.mode === 'commander'), `${view.mode} ${view.commanderShown}`);
    check(`${label}: ${expect.noteWords ? 'the note explains the guess' : 'no note while the format is Standard'}`, expect.noteWords ? expect.noteWords.test(view.note) : view.note === '', view.note);
    check(`${label}: focus moves to the deck heading`, view.focus === 'preview-heading', String(view.focus));
    check(`${label}: it can be saved`, !view.saveDisabled);
  };
  await checkExport('Moxfield "Copy for Moxfield"', MOXFIELD_FOR_MOXFIELD, { headings: ['Creatures (6)', 'Instants (1)', 'Artifacts (1)', 'Lands (10)', 'Sideboard (1)'], mode: 'none' });
  await checkExport('Moxfield plain text', MOXFIELD_PLAIN, { headings: ['Commander (1)', 'Creatures (5)', 'Instants (1)', 'Artifacts (1)', 'Lands (10)', 'Sideboard (1)'], mode: 'commander', noteWords: /after the blank line/ });
  await checkExport('Archidekt text', ARCHIDEKT, { headings: ['Creatures (6)', 'Instants (2)', 'Artifacts (1)', 'Lands (10)'], mode: 'none' });

  // ---- the format decides whether there is a commander: Commander shows the pickers (with a guess), Standard hides them ----
  const setFormatInPage = (value) => ev(`(() => { const f = document.getElementById('deck-format'); f.value = ${JSON.stringify(value)}; f.dispatchEvent(new Event('change')); })()`);
  await load(); await paste(MOXFIELD_FOR_MOXFIELD); await press('check');
  check('the old "has a commander" radio buttons are gone: the format choice does that job', await ev(`document.getElementById('mode-commander') === null && document.getElementById('mode-none') === null`));
  check('a list that does not look like Commander starts as Standard, with no Commander group', (await ev(`document.getElementById('deck-format').value`)) === 'standard' && !(await ev(`Boolean(document.querySelector('#sections [data-group="commander"]'))`)));
  await setFormatInPage('commander');
  check('choosing Commander makes a Commander group and says plainly that no commander is marked, what was picked and how to change it', (await ev(`document.querySelectorAll('#sections [data-group="commander"] .card-line').length`)) === 1 && /^No commander is marked in your list, so the first legendary creature was picked\. Right-click a card to change it\.$/.test(await $text('commander-note')), await $text('commander-note'));
check('the guess is the legendary creature (Éowyn), alone in the Commander group', JSON.stringify(await ev(`[...document.querySelectorAll('#sections [data-group="commander"] .name')].map((n) => n.textContent)`)) === JSON.stringify(['Éowyn, Lady of Rohan']));
check('there are no commander or partner boxes; the Commander heading says to right-click', (await ev(`document.getElementById('commander-1') === null && document.getElementById('commander-2') === null && document.getElementById('commander-box') === null`)) && /Right-click a card/.test(await ev(`document.querySelector('#sections [data-group="commander"] h3').title`)));
  await setFormatInPage('standard');
  check('choosing Standard takes the Commander group away and clears the note', !(await ev(`Boolean(document.querySelector('#sections [data-group="commander"]'))`)) && (await $text('commander-note')) === '');
  // A list with no legendary creature: the guess is the first card, there is only one group, and the note says so.
  await load(); await paste('1 Sol Ring\n1 Island'); await press('check');
  await setFormatInPage('commander');
  check('with no commander marked and no legendary creature the note says the first card was picked', /^No commander is marked in your list, so the first card was picked\. Right-click a card to change it\.$/.test(await $text('commander-note')), await $text('commander-note'));
  check('and that card is the commander', JSON.stringify(await ev(`[...document.querySelectorAll('#sections [data-group="commander"] .name')].map((n) => n.textContent)`)) === JSON.stringify(['Island']) || JSON.stringify(await ev(`[...document.querySelectorAll('#sections [data-group="commander"] .name')].map((n) => n.textContent)`)) === JSON.stringify(['Sol Ring']));

  // ---- problems: not found, ambiguous, a "did you mean" ----
  await load(); await deleteAllSaved(); // (every check below saves a deck by itself, so each part starts from none)
  await paste('1 Sol Ring\n1 B.F.M. (Big Furry Monster)\n1 Insectile Aberration\n2 Totally Fake Card');
  await press('check');
  const problems = await ev(`(() => ({
    items: Array.from(document.querySelectorAll('#problem-list li')).map((li) => li.textContent),
    selects: document.querySelectorAll('#problem-list select').length, hidden: document.getElementById('problems').hidden,
    summary: document.getElementById('summary').textContent, summaryShown: !document.getElementById('summary').classList.contains('sr-only'), unmatched: document.querySelectorAll('#sections .card-line.unmatched').length,
  }))()`);
  check('three problems are listed, two with a choice to make', !problems.hidden && problems.items.length === 3 && problems.selects === 2, JSON.stringify(problems.items));
  check('the not-found card says it may be newer than the list', problems.items.some((t) => /^"Totally Fake Card" \(2\) was not found\.$/.test(t)) && /newer than our card list/.test(await ev(`[...document.querySelectorAll('#problem-list li')].find((li) => /Totally Fake/.test(li.textContent)).title`)));
  check('the summary counts the cards that need attention (4 of 5), and is shown because something does', /^5 cards \u00b7 4 need attention$/.test(problems.summary) && problems.summaryShown, problems.summary);
  check('unmatched lines are marked in the list', problems.unmatched === 3, String(problems.unmatched));
  const afterCheck = await library();
  check('the deck saved itself at once, as "New deck", without the three lines that were not matched, and the page says Saved', afterCheck?.decks.length === 1 && afterCheck.decks[0].deck.name === 'New deck' && afterCheck.decks[0].deck.skipped === 3 && afterCheck.decks[0].deck.cards.length === 1 && (await $text('save-state')) === 'Saved', JSON.stringify(afterCheck?.decks.map((d) => [d.deck.name, d.deck.skipped, d.deck.cards.length])));
  await setField('deck-name', 'Problems deck');
  check('typing a name renames that same deck (still one deck)', (await library()).decks.length === 1 && (await library()).decks[0].deck.name === 'Problems deck' && (await library()).decks[0].id === afterCheck.decks[0].id);
  // settle the ambiguous name and the suggestion with their selects
  for (let n = 0; n < 2; n++) {
    await ev(`(() => { const s = document.querySelector('#problem-list select'); s.value = s.options[1].value; s.dispatchEvent(new Event('change')); })()`);
  }
  const after = await ev(`({ items: Array.from(document.querySelectorAll('#problem-list li')).map((li) => li.textContent) })`);
  check('choosing a card settles both, leaving only the not-found card', after.items.length === 1 && /Totally Fake Card/.test(after.items[0]), JSON.stringify(after.items));
  check('each choice saved the deck again: it now holds three cards and one line left out, in the same deck', (await library()).decks.length === 1 && (await library()).decks[0].deck.cards.length === 3 && (await library()).decks[0].deck.skipped === 1);

  // ---- the saved deck: it is there, it survives a reload, it loads back, it can be deleted ----
  const stored = await selectedSaved();
  check('the browser holds the saved deck, with its text and the cards that were matched', stored.name === 'Problems deck' && stored.cards.length === 3 && stored.skipped === 1 && stored.text.includes('Totally Fake Card'));
  await showList();
  check('the saved deck is on the list screen: its name, format, size and the line that was left out', !(await $hidden('saved')) && (await $hidden('preview')) && /Problems deck/.test(await $text('saved-list')) && /(Standard|Commander)/.test(await $text('saved-list')) && /3 cards/.test(await $text('saved-list')) && /1 line left out/.test(await $text('saved-list')), await $text('saved-list'));
  await load();
  check('after a reload the saved deck is still shown', !(await $hidden('saved')) && /Problems deck/.test(await $text('saved-list')));
  await pressLoad();
  const loaded = await ev(`({ text: document.getElementById('deck-text').value, name: document.getElementById('deck-name').value, preview: !document.getElementById('preview').hidden })`);
  check('loading puts the list and the name back and checks it', loaded.text.includes('Insectile Aberration') && loaded.name === 'Problems deck' && loaded.preview);
  check('opening a deck does not save it again (its saved time is unchanged)', (await selectedSaved()).savedAt === stored.savedAt);
  await deleteAllSaved();
  check('deleting removes it from the browser and the page, and leaves an empty library so an old deck cannot come back', (await library())?.decks.length === 0 && (await ev(`localStorage.getItem('overloaded.deck')`)) === null && (await ev(`document.querySelectorAll('#saved-list li').length`)) === 0);

  // ---- a commander is saved when chosen ----
  await load(); await paste(MOXFIELD_PLAIN); await press('check');
  const named = await selectedSaved();
  check('a pasted deck with no name is named after its commander', /Lady of Rohan/.test(named.name), named.name);
  await setField('deck-name', '  Eowyn   Tokens ');
  const commanderDeck = await selectedSaved();
  check('a saved commander deck keeps its commander and a cleaned name', commanderDeck.name === 'Eowyn Tokens' && commanderDeck.commander.length === 1 && commanderDeck.cards.find((c) => c.section === 'commander')?.n.endsWith('Lady of Rohan'));
  check('there is no Save button; the page says the deck is saved', (await ev(`document.getElementById('save')`)) === null && (await $text('save-state')) === 'Saved');
  await setField('deck-name', '');
  check('an empty name is not saved: the name box gets the deck\'s name back', (await ev(`document.getElementById('deck-name').value`)) === 'Eowyn Tokens' && (await selectedSaved()).name === 'Eowyn Tokens');
  await deleteAllSaved();

  // ---- exact printings: the set and number typed on a line pick the printing whose picture is shown ----
  // Real data (checked against Scryfall's own records on 2026-10-29): Sol Ring cmm 410 is 46ca0b66..., Arcane Signet sld 916 is
  // dd1d87e4... (the printing titled "Heart of the Mountain"), Arcane Signet cmm 367 is 0539b83c..., and cmm 5 is Ulamog.
  const SOL_RING_CMM_410 = '46ca0b66-a000-4483-b916-f5b89e710244';
  const SIGNET_SLD_916 = 'dd1d87e4-f51a-448f-824f-99dffd73403c';
  const SIGNET_CMM_367 = '0539b83c-4459-41b5-a001-d15a1c9ddf23';
  const checked = () => waitFor(async () => (!(await $hidden('preview')) && !/^Checking/.test(await $text('deck-status'))) || null, 15000, 50);
  const rowsOf = () => ev(`Array.from(document.querySelectorAll('#sections .card-line')).map((li) => ({ name: li.querySelector('.name').textContent, qty: li.querySelector('.qty').textContent, printing: li.querySelector('.printing')?.textContent ?? null, tip: li.querySelector('.printing')?.title ?? '', type: li.querySelector('.name')?.title ?? null, cost: li.querySelector('.cost')?.dataset.cost ?? li.querySelector('.cost')?.textContent ?? null, columns: [...li.children].filter((c) => !c.classList.contains('row-menu')).length, id: li.dataset.previewId ?? null, source: li.dataset.printing ?? null }))`);
  await load();
  const requestsBefore = pictureRequests.length;
  await paste('1 Sol Ring (cmm) 410\n2 Lightning Bolt\n1 Arcane Signet (sld) 916\n1 Arcane Signet (cmm) 367\n1 Heart of the Mountain\n1 Sol Ring (cmm) 5\n1 Sol Ring (cmm) 99999\n1 Not A Real Card (abc) 7');
  await press('check');
  check('while the printings load the page says so, and then it says the deck is checked', Boolean(await checked()), await $text('deck-status'));
  const printed = await rowsOf();
  const printedBy = (name, at = 0) => printed.filter((row) => row.name === name)[at];
  const ringRows = printed.filter((row) => row.name === 'Sol Ring');
  const signetRows = printed.filter((row) => row.name === 'Arcane Signet');
  check('Sol Ring typed with cmm 410 is its own row and shows that printing', ringRows.some((row) => row.id === SOL_RING_CMM_410 && row.printing === 'CMM 410' && row.source === 'set' && row.qty === '1'), JSON.stringify(ringRows));
  check('the two numbers that are not Sol Ring printings join the default row, say so, and show the default picture', ringRows.length === 2 && ringRows.some((row) => row.id !== SOL_RING_CMM_410 && row.qty === '2' && row.source === 'default' && /CMM 5 \(not found\)/.test(row.printing) && /CMM 99999 \(not found\)/.test(row.printing)), JSON.stringify(ringRows));
  check('the tooltip says why (cmm 5 is another card, cmm 99999 is not in the set)', ringRows.some((row) => /CMM 5: This number in that set is a different card/.test(row.tip) && /CMM 99999: This number is not in that set/.test(row.tip)), JSON.stringify(ringRows.map((r) => r.tip)));
  check('two printings of Arcane Signet are two rows with their own pictures', signetRows.length === 2 && signetRows.some((row) => row.id === SIGNET_SLD_916) && signetRows.some((row) => row.id === SIGNET_CMM_367 && row.printing === 'CMM 367'), JSON.stringify(signetRows));
  check('the card typed by its title is the same printing as SLD 916, so it is the same row (2 copies)', signetRows.find((row) => row.id === SIGNET_SLD_916)?.qty === '2' && signetRows.find((row) => row.id === SIGNET_SLD_916)?.printing === 'SLD 916', JSON.stringify(signetRows));
  check('a card with no set typed shows the default picture and has no printing cell at all', printedBy('Lightning Bolt')?.source === 'default' && printedBy('Lightning Bolt')?.printing === null && printedBy('Lightning Bolt')?.id !== null);
  check('a card that was not found still shows what was typed, and a row has a printing cell only when there is something to say (count, name, printing, cost, or three cells without a printing)', printedBy('Not A Real Card')?.printing === 'ABC 7' && printedBy('Not A Real Card')?.columns === 4 && printed.every((row) => row.columns === (row.printing === null ? 3 : 4)), JSON.stringify(printed));
  check('count, name, cost and (as the name\'s tooltip) the type are still shown', printedBy('Lightning Bolt')?.qty === '2' && /Instant/.test(printedBy('Lightning Bolt')?.type ?? '') && printedBy('Lightning Bolt')?.cost === '{R}' && ringRows.every((row) => /Artifact/.test(row.type) && row.cost === '{1}'), JSON.stringify(printed));
  const pips = await ev(`(() => { const costs = [...document.querySelectorAll('#sections .card-line')].map((li) => li.querySelector('.cost')); const bolt = costs.find((c) => c.dataset.cost === '{R}'); const ring = costs.find((c) => c.dataset.cost === '{1}'); return { bolt: bolt && [bolt.querySelectorAll('img.pip-img').length, bolt.getAttribute('aria-label'), bolt.querySelector('img').src.split('/').pop()], ring: ring && [ring.querySelectorAll('img.pip-img').length, ring.getAttribute('aria-label'), ring.querySelector('img').src.split('/').pop()] }; })()`);
  check('a mana cost is drawn as the Scryfall symbol pictures with its words for a screen reader, not as {R}', JSON.stringify(pips) === JSON.stringify({ bolt: [1, 'red mana', 'R.svg'], ring: [1, '1 generic mana', '1.svg'] }), JSON.stringify(pips));
  const notes = await ev(`Array.from(document.querySelectorAll('#notices li')).map((li) => li.textContent)`);
  check('the page says that two sets and numbers were not found, and which', notes.some((n) => /2 sets and numbers were not found, so those cards show their default picture: CMM 5, CMM 99999/.test(n)), JSON.stringify(notes));
  check('only the sets the deck names were fetched, once each (cmm and sld; abc is not a card so it costs nothing)', (await ev(`performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('/data/printings/'))`)).map((n) => n.split('/').pop()).sort().join() === 'set-cmm.json,set-sld.json');
  check('and no request went to Scryfall for printings: the only picture asked for is the one in the card display (the commander, or the first card), in the normal size', pictureRequests.length - requestsBefore <= 1 && pictureRequests.slice(requestsBefore).every((u) => u.includes('/normal/front/')), JSON.stringify(pictureRequests.slice(requestsBefore)));

  // While the printing files load the old preview is gone, so Save cannot pair its cards with the new text (read in the same
  // moment as the click, before the page has had time to finish).
  const during = await ev(`(() => { document.getElementById('check').click(); return { hidden: document.getElementById('preview').hidden, status: document.getElementById('deck-status').textContent }; })()`);
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

  // ---- the header: Home always goes to the start page; the Lobby link (the page with other people) shows only when you are at a table, and goes to it ----
  const backHref = () => ev(`(() => { const l = document.getElementById('site-lobby'); return l.hidden ? '' : l.getAttribute('href'); })()`);
  const homeLink = () => ev(`(() => { const a = document.querySelector('.site-nav a'); return a.textContent + ' ' + a.getAttribute('href'); })()`);
  await ev(`localStorage.removeItem('overloaded.lastTable')`); await load();
  check('the first link in the header is Home and goes to the start page, and there is no Lobby link when you are not at a table', (await homeLink()) === 'Home /' && (await backHref()) === '', await homeLink() + ' / ' + await backHref());
  await ev(`localStorage.setItem('overloaded.lastTable', 'ABC234')`); await load();
  check('...and when you are at a table a Lobby link appears and goes to that table\'s own address (/lobby/CODE), while Home still goes to the start page', (await backHref()) === '/lobby/ABC234' && (await homeLink()) === 'Home /', await backHref());
  for (const bad of ['<script>', 'abc234', 'ABC23', 'ABC230', '/lobby/x', '']) {
    await ev(`localStorage.setItem('overloaded.lastTable', ${JSON.stringify(bad)})`); await load();
    check(`...but a remembered value that is not a table code (${JSON.stringify(bad)}) is ignored (no Lobby link)`, (await backHref()) === '', await backHref());
  }
  await ev(`localStorage.removeItem('overloaded.lastTable')`);

  // ---- several saved decks: a list, one selected, a format on each, the same name replaces, a limit of 20, the old single deck ----
  const saveAs = async (listText, name, format) => { await ev(`document.getElementById('new-deck').click()`); await paste(listText); await press('check'); await setField('deck-name', name); if (format) await setField('deck-format', format); await press('save'); };
  const rows = () => ev(`Array.from(document.querySelectorAll('#saved-list li')).map((li) => ({ id: li.dataset.deckId, text: li.querySelector('.saved-text').textContent, actions: Array.from(li.querySelectorAll('button')).map((b) => b.dataset.action) }))`);
  await load();
  await deleteAllSaved();
  await saveAs('1 Sol Ring\n1 Lightning Bolt', 'Deck A');
  let lib = await library();
  check('the first deck is saved in a library, selected, and for Standard (it has no commander)', lib.version === 1 && lib.decks.length === 1 && lib.selected === lib.decks[0].id && lib.decks[0].format === 'standard' && lib.decks[0].deck.name === 'Deck A', JSON.stringify(lib));
  await saveAs('2 Island\n1 Sol Ring', 'Deck B');
  lib = await library();
  let list = await rows();
  check('a second deck is added, not replacing the first, becomes the selected one, and no card says "solo deck"', lib.decks.length === 2 && lib.decks[1].deck.name === 'Deck B' && lib.selected === lib.decks[1].id && list.length === 2 && /Deck B/.test(list[1].text) && !/solo deck/.test(list[0].text + list[1].text), JSON.stringify(list));
  check('every deck is one card to open with two buttons on it, Play solo and Delete (no menu, no "...")', list.every((r) => JSON.stringify(r.actions) === '["load","play","delete"]') && (await ev(`document.querySelectorAll('#saved-list .deck-menu-button, #saved-list .solo-tag').length`)) === 0, JSON.stringify(list.map((r) => r.actions)));
  const firstId = lib.decks[0].id;
  await saveAs('3 Island', 'deck a');
  lib = await library();
  check('a name another deck has (capitals do not matter) is not taken: the new deck keeps the name it was given, and the page says why', lib.decks.length === 3 && lib.decks[2].deck.name === 'New deck' && /^Not saved: You already have a deck called "deck a"/.test(await $text('save-state')), `${JSON.stringify(lib.decks.map((d) => d.deck.name))} ${await $text('save-state')}`);
  check('a new deck becomes the selected one', lib.selected === lib.decks[2].id);
  await clickSaved('delete', 2);
  const selectedBefore = (await library()).selected;
  await pressLoad(0);
  await paste('3 Island'); await press('check'); await setField('deck-name', 'deck a');
  lib = await library();
  check('editing the first deck (a new list, its name in other capitals) changes that deck where it is and keeps its id, without adding one', lib.decks.length === 2 && lib.decks[0].id === firstId && lib.decks[0].deck.name === 'deck a' && lib.decks[0].deck.cards[0].qty === 3, JSON.stringify(lib.decks.map((d) => d.deck.name)));
  check('and editing it does not change which deck is selected for the solo table', lib.selected === selectedBefore, `${lib.selected} ${selectedBefore}`);
  await clickSaved('play', 1); // Play solo on Deck B selects it and goes to the solo table
  await waitFor(async () => (await ev('location.pathname')) === '/solo' || null, 10000, 50).catch(() => null);
  lib = await library();
  check('Play solo on a deck selects it for the solo table and goes there', lib.selected === lib.decks[1].id && (await ev('location.pathname')) === '/solo', `${await ev('location.pathname')}`);
  await load(); pictureRequests.length = 0; // the solo table loaded its own pictures
  await pressLoad(0);
  check('loading a deck puts its text, name and format back in the form', (await ev(`document.getElementById('deck-text').value`)) === '3 Island' && (await ev(`document.getElementById('deck-name').value`)) === 'deck a' && (await ev(`document.getElementById('deck-format').value`)) === 'standard');
  await ev(`document.getElementById('new-deck').click()`);
  await paste('Commander\n1 Sol Ring\n\n1 Island'); await press('check');
  check('a list with a marked commander offers Commander as its format', (await ev(`document.getElementById('deck-format').value`)) === 'commander');
  await setField('deck-name', 'Deck C'); await press('save');
  lib = await library();
  check('and saves it as a Commander deck', lib.decks.length === 3 && lib.decks[2].format === 'commander' && lib.decks[2].deck.commander.length === 1, JSON.stringify(lib.decks.map((d) => d.format)));
  await saveAs('Commander\n1 Sol Ring\n\n1 Island', 'Deck D', 'standard');
  lib = await library();
  check('choosing Standard hides the commander and saves the deck for Standard with no commander', lib.decks.length === 4 && lib.decks[3].format === 'standard' && lib.decks[3].deck.commander.length === 0 && lib.decks[3].deck.cards.every((c) => c.section !== 'commander'), JSON.stringify(lib.decks.map((d) => [d.format, d.deck.commander.length])));
  await pressLoad(2); // start from the Commander deck, so loading the Standard deck has to switch the page back
  await pressLoad(3);
  check('loading that Standard deck (its list marks a commander) brings back Standard, with no Commander group', (await ev(`document.getElementById('deck-format').value`)) === 'standard' && !(await ev(`Boolean(document.querySelector('#sections [data-group="commander"]'))`)));
  list = await rows();
  await clickSaved('delete', list.length - 1);
  lib = await library();
  check('deleting the selected deck selects the first one left', lib.decks.length === 3 && lib.selected === lib.decks[0].id && /Deleted "Deck D"/.test(await $text('deck-status')), await $text('deck-status'));
  await clickSaved('delete', 1);
  lib = await library();
  check('deleting another deck leaves the selection alone', lib.decks.length === 2 && lib.selected === lib.decks[0].id && lib.decks.every((d) => d.deck.name !== 'Deck B'));

  // ---- the bracket: optional, 1 to 5, a Commander idea, saved next to the format ----
  const bracketHidden = () => ev(`document.getElementById('bracket-field').hidden`);
  await ev(`document.getElementById('new-deck').click()`);
  await paste('Commander\n1 Sol Ring\n\n1 Island'); await press('check');
  await setField('deck-format', 'commander'); // (the same text as the loaded Standard deck keeps that deck's format)
  check('a Commander deck shows the bracket choice, starting at Auto with the options 1 to 5', !(await bracketHidden()) && (await ev(`document.getElementById('deck-bracket').value`)) === '' && (await ev(`Array.from(document.getElementById('deck-bracket').options).map((o) => o.value).join()`)) === ',1,2,3,4,5');
  await setField('deck-format', 'standard');
  check('choosing Standard hides the bracket choice', await bracketHidden());
  await setField('deck-format', 'commander');
  check('and choosing Commander again shows it', !(await bracketHidden()));
  await setField('deck-bracket', '3'); await setField('deck-name', 'Deck E'); await press('save');
  lib = await library();
  const deckE = lib.decks.find((d) => d.deck.name === 'Deck E');
  check('a Commander deck saved with a bracket keeps it next to the format', deckE?.format === 'commander' && deckE.bracket === 3, JSON.stringify(deckE && [deckE.format, deckE.bracket]));
  list = await rows();
  check('the saved deck row shows the bracket', /Deck E.*Bracket 3.*Commander/.test(list.find((r) => /Deck E/.test(r.text)).text), list.map((r) => r.text).join(' | '));
  check('a Commander deck saved on Auto stores the guess (no Game Changers: bracket 2) marked as a guess, and its row says so', /Bracket 2/.test(list.find((r) => /Deck C/.test(r.text)).text) && !/guess/.test(list.find((r) => /Deck C/.test(r.text)).text) && lib.decks.find((d) => d.deck.name === 'Deck C').bracket === 2 && lib.decks.find((d) => d.deck.name === 'Deck C').bracketGuess === true);
  await setField('deck-bracket', '5'); await setField('deck-format', 'standard'); await setField('deck-name', 'Deck F'); await press('save');
  lib = await library();
  check('a bracket picked before switching to Standard is not saved with the Standard deck', lib.decks.find((d) => d.deck.name === 'Deck F')?.format === 'standard' && !('bracket' in lib.decks.find((d) => d.deck.name === 'Deck F')) && !('bracketGuess' in lib.decks.find((d) => d.deck.name === 'Deck F')));
  await setField('deck-format', 'commander'); await setField('deck-bracket', '2'); await setField('deck-name', 'Deck E'); await press('save');
  lib = await library();
  check('saving under the same name replaces the bracket', lib.decks.find((d) => d.deck.name === 'Deck E').bracket === 2 && lib.decks.filter((d) => d.deck.name === 'Deck E').length === 1);
  await setField('deck-bracket', ''); await press('save');
  lib = await library();
  check('saving again with Auto puts the guess back, marked as a guess', lib.decks.find((d) => d.deck.name === 'Deck E').bracket === 2 && lib.decks.find((d) => d.deck.name === 'Deck E').bracketGuess === true);
  await setField('deck-bracket', '4'); await press('save');
  list = await rows();
  const eRow = list.findIndex((r) => /Deck E/.test(r.text));
  await pressLoad(eRow);
  check('loading a deck puts its bracket back in the form', (await ev(`document.getElementById('deck-bracket').value`)) === '4' && !(await bracketHidden()));
  await paste('Commander\n1 Sol Ring\n\n1 Island\n1 Forest'); await press('check');
  check('editing the list of an open deck keeps its bracket (and saves the new list into the same deck)', (await ev(`document.getElementById('deck-bracket').value`)) === '4' && (await library()).decks.length === (list.length) && (await library()).decks.find((d) => d.deck.name === 'Deck E').bracket === 4 && /Forest/.test((await library()).decks.find((d) => d.deck.name === 'Deck E').deck.text));
  await ev(`document.getElementById('new-deck').click()`);
  check('New deck puts the bracket back to "Not set", empties the box and shows the paste screen', (await ev(`document.getElementById('deck-bracket').value`)) === '' && (await ev(`document.getElementById('deck-text').value`)) === '' && !(await $hidden('paste')) && (await $hidden('preview')));

  // The old single saved deck becomes the first deck, once, and cannot come back after it is deleted.
  const oldDeck = (await library()).decks[0].deck;
  await deleteAllSaved();
  await ev(`localStorage.removeItem('overloaded.decks'); localStorage.setItem('overloaded.deck', ${JSON.stringify(JSON.stringify(oldDeck))})`);
  await load();
  list = await rows();
  check('an old single saved deck shows as the first deck of the list, selected', list.length === 1 && /deck a/.test(list[0].text) && (await library()) === null, JSON.stringify(list));
  await clickSaved('delete', 0);
  check('deleting it leaves an empty library and removes the old key', (await library())?.decks.length === 0 && (await ev(`localStorage.getItem('overloaded.deck')`)) === null);
  await load();
  check('and after a reload it is still gone', (await rows()).length === 0 && (await $hidden('saved')));

  // A damaged library is said so, and a new save starts a new one.
  await ev(`localStorage.setItem('overloaded.decks', '{ not a library')`);
  await load();
  check('a damaged library says so and shows no decks', !(await $hidden('saved')) && /could not be read/.test(await $text('saved-summary')) && (await rows()).length === 0);
  await saveAs('1 Sol Ring', 'Fresh start');
  lib = await library();
  check('saving after that starts a new library', lib.decks.length === 1 && lib.decks[0].deck.name === 'Fresh start' && (await $hidden('saved-summary')));

  // The limit of 20.
  const base = (await library()).decks[0].deck;
  const twenty = Array.from({ length: 20 }, (_, n) => ({ id: `d${String(n + 1).padStart(10, '0')}`, format: 'standard', deck: { ...base, name: `Deck ${n + 1}` } }));
  await ev(`localStorage.setItem('overloaded.decks', ${JSON.stringify(JSON.stringify({ version: 1, selected: 'd0000000001', decks: twenty }))})`);
  await load();
  check('twenty decks are all listed', (await rows()).length === 20);
  await saveAs('1 Island', 'Number 21');
  check('a twenty-first deck is not saved, and the page says what to do', /^Not saved: .*up to 20 decks\. Delete one first/.test(await $text('save-state')) && (await library()).decks.length === 20, await $text('deck-status'));
  await pressLoad(0); await paste('1 Island'); await press('check');
  check('a saved deck can still be edited when the library is full', (await library()).decks.length === 20 && (await $text('save-state')) === 'Saved' && (await library()).decks[0].deck.text === '1 Island', await $text('save-state'));
  await deleteAllSaved();

  // ---- a sample deck: one click puts a real list in the box and checks it; nothing is saved until asked; a link opens it ready ----
  const savedCount = async () => (await library())?.decks.length ?? 0;
  await load();
  await deleteAllSaved();
  check('the sample button is there and works once the card list has loaded', (await ev(`document.getElementById('sample') !== null && !document.getElementById('sample').disabled`)));
  check('the box is empty before it is used', (await ev(`document.getElementById('deck-text').value`)) === '');
  await ev(`document.getElementById('sample').click()`);
  await settled();
  const sampleText = await ev(`document.getElementById('deck-text').value`);
  check('the sample is put in the box with the Commander line on top', /^Commander\n1 Krenko, Mob Boss \(SLD\) 2407 \*F\*\n/.test(sampleText) && sampleText.split('\n').length === 86, sampleText.slice(0, 80));
  check('it is checked like a pasted list: 100 cards', /^100 cards$/.test(await $text('summary')), await $text('summary'));
  const sampleHeadings = await ev(`Array.from(document.querySelectorAll('#sections h3')).map((h) => h.textContent)`);
  check('as one commander and the other 99 cards by type (the groups add up to 100)', sampleHeadings.includes('Commander (1)') && sampleHeadings.includes('Lands (24)') && sampleHeadings.reduce((sum, h) => sum + Number(/\((\d+)\)$/.exec(h)[1]), 0) === 100, JSON.stringify(sampleHeadings));
  const sampleRows = await rowsOf();
  check('all 85 lines show the exact printing the list names (the printing files cover them)', sampleRows.length === 85 && sampleRows.every((row) => row.source === 'set'), `${sampleRows.length} rows; not exact: ${sampleRows.filter((row) => row.source !== 'set').map((row) => row.name).join(', ')}`);
  check('the commander is Krenko, Mob Boss, marked by the list, and the format is Commander', JSON.stringify(await ev(`[...document.querySelectorAll('#sections [data-group="commander"] .name')].map((n) => n.textContent)`)) === JSON.stringify(['Krenko, Mob Boss']) && (await ev(`document.getElementById('deck-format').value`)) === 'commander' && (await $text('commander-note')) === '');
  check('the deck name is filled in', (await ev(`document.getElementById('deck-name').value`)) === 'Krenko, Mob Boss (sample)');
  check('opening the sample saves it, once, under its own name', (await savedCount()) === 1 && (await library()).decks[0].deck.name === 'Krenko, Mob Boss (sample)');
  await press('save');
  const savedSample = await selectedSaved();
  check('saving it keeps the whole deck: 100 cards, the commander chosen, for Commander', Boolean(savedSample) && savedSample.name === 'Krenko, Mob Boss (sample)' && savedSample.cards.reduce((n, c) => n + c.qty, 0) === 100 && savedSample.commander.length === 1 && (await library()).decks[0].format === 'commander', JSON.stringify(savedSample?.name));
  {
    // the page of a deck has a Play solo button: it makes this deck the one for the solo table and opens it
    const there = await ev("Boolean(document.getElementById('deck-play-solo'))");
    await ev("document.getElementById('deck-play-solo').click()");
    const went = await waitFor(async () => (await ev('location.pathname')) === '/solo' || null, 15000, 100);
    const chosen = await ev("(() => { const l = JSON.parse(localStorage.getItem('overloaded.decks') || 'null'); return l ? l.decks.find((d) => d.id === l.selected)?.deck.name : null; })()");
    check('the page of a deck has a Play solo button that makes this deck the solo deck and opens the solo table', there && Boolean(went) && chosen === 'Krenko, Mob Boss (sample)', JSON.stringify({ there, went, chosen }));
    await load();
    pictureRequests.length = 0; // (the solo table asked for pictures: the checks below count their own)
  }
  await deleteAllSaved();
  await browser.goto(`${PAGE}?sample`);
  await ready();
  await settled();
  check('a link with ?sample opens the page with the sample already in the box and checked', (await ev(`document.getElementById('deck-text').value`)) === sampleText && /^100 cards$/.test(await $text('summary')) && !(await $hidden('preview')), await $text('summary'));
  check('and it did not make a second copy of the sample', (await savedCount()) === 1);
  await browser.goto(`${PAGE}?sample=nothing-like-an-id`);
  await ready();
  await settled();
  check('an unknown sample id in the link gives the first sample', (await ev(`document.getElementById('deck-text').value`)) === sampleText);
  await load();
  check('a plain visit does not load a sample by itself', (await ev(`document.getElementById('deck-text').value`)) === '' && (await $hidden('preview')));

  // ---- cards pasted under another title they were printed under (real cases from a real export, 2026-10-29) ----
  // These need the list built with the alternate titles (format 2); an older cached list would fail here, on purpose.
  const katakana = String.fromCharCode(0x30d5, 0x30a7, 0x30a4, 0x30bf, 0x30ea, 0x30ba, 0x30e0);
  await load();
  await paste(`1 Ardyn Izunia\n1 Heart of the Mountain\n1 Kushala Daora's Fury\n1 Shadowbringers\n1 ${katakana}\n1 Sol Ring`); await press('check');
  const titled = await ev(`({ problems: !document.getElementById('problems').hidden, lines: Array.from(document.querySelectorAll('#sections .card-line')).map((li) => li.querySelector('.name').textContent), noted: document.querySelectorAll('#sections .typed-as').length, unmatched: document.querySelectorAll('#sections .card-line.unmatched').length })`);
  check('the five titles are found: no problems, nothing unmatched', !titled.problems && titled.unmatched === 0 && /^6 cards$/.test(await $text('summary')), JSON.stringify(titled) + ' ' + (await $text('summary')));
  check('each is shown by its real name, with what was typed beside it', ['Varragoth, Bloodsky Sire (typed as "Ardyn Izunia")', 'Arcane Signet (typed as "Heart of the Mountain")', 'Snap (typed as "Kushala Daora\'s Fury")', "Dovin's Veto (typed as \"Shadowbringers\")", `Arcane Denial (typed as "${katakana}")`].every((text) => titled.lines.includes(text)), JSON.stringify(titled.lines));
  check('a card typed by its own name has no such note', titled.lines.includes('Sol Ring') && titled.noted === 5);
  await ev(`document.getElementById('deck-name').value = 'Titles'; document.getElementById('deck-name').dispatchEvent(new Event('input'))`);
  await press('save');
  const savedTitles = await selectedSaved();
  check('the saved deck holds the real cards, with their real names', ['Varragoth, Bloodsky Sire', 'Arcane Signet', 'Snap', "Dovin's Veto", 'Arcane Denial', 'Sol Ring'].every((n) => savedTitles.cards.some((c) => c.n === n)) && !JSON.stringify(savedTitles.cards).includes('Shadowbringers'), JSON.stringify(savedTitles.cards.map((c) => c.n)));
  await deleteAllSaved();

  // ---- hovering a card in the checked list shows its picture (the titled deck above is still on the page) ----
  // The checks below scroll rows to the top and the bottom of the window, which needs a page taller than the window. The page under
  // the list got shorter (no radio buttons), so a spacer above the list keeps these checks about the picture box and not about the page height.
  await ev(`(() => { const spacer = document.createElement('div'); spacer.id = 'test-spacer'; spacer.style.height = '1500px'; document.body.prepend(spacer); const after = spacer.cloneNode(); after.id = 'test-spacer-after'; document.body.append(after); })()`);
  const peek = () => ev(`(() => { const p = document.getElementById('card-peek'); const i = document.getElementById('card-peek-image'); const r = p.getBoundingClientRect(); return { hidden: p.hidden, src: i.getAttribute('src'), imageHidden: i.hidden, note: document.getElementById('card-peek-note').textContent, left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: innerWidth, h: innerHeight, pointerEvents: getComputedStyle(p).pointerEvents, radius: getComputedStyle(i).borderTopLeftRadius }; })()`);
  // Scrolls the row into the middle and waits two frames, so the scroll event (which hides the box) has come BEFORE the pointer moves.
  const rowFacts = (index, block = 'center') => ev(`new Promise((resolve) => { const row = document.querySelectorAll('#sections .card-line')[${index}]; row.scrollIntoView({ block: ${JSON.stringify(block)} }); requestAnimationFrame(() => requestAnimationFrame(() => resolve({ id: row.dataset.previewId ?? null, name: row.dataset.cardName ?? null }))); })`);
  const nameBox = (index) => ev(`(() => { const r = document.querySelectorAll('#sections .card-line')[${index}].querySelector('.name').getBoundingClientRect(); return { x: Math.round(r.left + 10), y: Math.round(r.top + r.height / 2) }; })()`);
  const hover = async (index, block = 'center') => { await rowFacts(index, block); await sleep(150); const { x, y } = await nameBox(index); await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x - 5, y }); await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await sleep(120); return { x, y }; };
  const away = async () => { await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 3, y: 3 }); await sleep(120); };
  const pictureUrl = (id) => `https://cards.scryfall.io/normal/front/${id[0]}/${id[1]}/${id}.jpg`;
  await away();
  // The floating picture box is now only the printing picker's. In the deck, the card display on the left shows the card the pointer is on, in every view (checks below).
  const display = () => ev(`(() => { const front = document.querySelector('#stack-preview .stack-preview-image:not(.stack-preview-back)'); const back = document.querySelector('#stack-preview .stack-preview-back'); const r = front.getBoundingClientRect(); return { src: front.getAttribute('src'), frontHidden: front.hidden, backSrc: back.getAttribute('src'), backHidden: back.hidden, name: document.querySelector('#stack-preview .stack-preview-name').textContent, left: Math.round(r.left), width: Math.round(r.width), floating: !document.getElementById('card-peek').hidden }; })()`);
  const cardCenter = (index) => ev(`(() => { const row = document.querySelectorAll('#sections .card-line')[${index}]; row.scrollIntoView({ block: 'center' }); const r = row.querySelector('.name').getBoundingClientRect(); return { x: Math.round(r.left + 10), y: Math.round(r.top + r.height / 2), name: row.dataset.cardName, id: row.dataset.previewId, two: row.dataset.twoSided ?? null }; })()`);
  const pointAt = async (at) => { await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x - 4, y: at.y }); await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y }); await sleep(250); };
  await load(); await paste('Commander\n1 Krenko, Mob Boss\n\n1 Valakut Awakening\n1 Sol Ring\n1 Delver of Secrets\n1 Lightning Bolt'); await press('check');
  const first = await display();
  check('the card display is on the left of the deck, showing the commander before anything is pointed at or clicked', first.name === 'Krenko, Mob Boss' && /\/normal\/front\//.test(first.src ?? '') && first.left < 400 && first.width >= 250 && first.backHidden, JSON.stringify(first));
  const cardRows = await ev(`Array.from(document.querySelectorAll('#sections .card-line')).map((li) => ({ name: li.dataset.cardName, id: li.dataset.previewId, two: li.dataset.twoSided ?? null, cardId: li.dataset.previewId ?? null }))`);
  check('only the card with a back face is marked two-sided (Valakut Awakening and Delver yes, Sol Ring no)', cardRows.find((r) => r.name === 'Sol Ring').two === null && cardRows.find((r) => r.name.startsWith('Valakut')).two === '1' && cardRows.find((r) => r.name.startsWith('Delver of Secrets')).two === '1' && cardRows.every((r) => r.id), JSON.stringify(cardRows));
  const solAt = await cardCenter(cardRows.findIndex((r) => r.name === 'Sol Ring')); await sleep(150);
  await pointAt(await cardCenter(cardRows.findIndex((r) => r.name === 'Sol Ring')));
  const sol = await display();
  check('pointing at a line in the text list shows that card in the display (the normal picture, no back, no floating box)', sol.name === 'Sol Ring' && sol.src === pictureUrl(solAt.id) && sol.backHidden && !sol.floating, JSON.stringify(sol));
  await away();
  check('with the pointer off the lines it goes back to the commander', (await display()).name === 'Krenko, Mob Boss');
  const valakutAt = await cardCenter(cardRows.findIndex((r) => r.name.startsWith('Valakut'))); await sleep(150);
  pictureRequests.length = 0;
  await pointAt(await cardCenter(cardRows.findIndex((r) => r.name.startsWith('Valakut'))));
  const two = await display();
  check('a card with a back face shows its back too, from the same printing', two.name.startsWith('Valakut') && two.src === pictureUrl(valakutAt.id) && !two.backHidden && two.backSrc === `https://cards.scryfall.io/normal/back/${valakutAt.id[0]}/${valakutAt.id[1]}/${valakutAt.id}.jpg`, JSON.stringify(two));
  await pointAt(await cardCenter(cardRows.findIndex((r) => r.name === 'Lightning Bolt')));
  await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: (await cardCenter(cardRows.findIndex((r) => r.name === 'Lightning Bolt'))).x, y: (await cardCenter(cardRows.findIndex((r) => r.name === 'Lightning Bolt'))).y, button: 'left', clickCount: 1 });
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: (await cardCenter(cardRows.findIndex((r) => r.name === 'Lightning Bolt'))).x, y: (await cardCenter(cardRows.findIndex((r) => r.name === 'Lightning Bolt'))).y, button: 'left', clickCount: 1 });
  await pointAt(await cardCenter(cardRows.findIndex((r) => r.name === 'Sol Ring')));
  await away();
  check('a click keeps a card in the display: after pointing at others and away it is the clicked one (Lightning Bolt), not the commander', (await display()).name === 'Lightning Bolt', JSON.stringify(await display()));
  const delverId = cardRows.find((r) => r.name.startsWith('Delver of Secrets')).id;
  failBackPictures.add(delverId);
  await pointAt(await cardCenter(cardRows.findIndex((r) => r.name.startsWith('Delver of Secrets'))));
  await waitFor(async () => (await display()).backHidden || null, 3000, 50);
  const noBack = await display();
  check('when the back picture does not exist the front is shown alone, with no broken image', noBack.name.startsWith('Delver of Secrets') && noBack.backHidden && !noBack.frontHidden, JSON.stringify(noBack));
  await away();
  await ev(`document.querySelector('[data-view="images"]').click()`); await sleep(500);
  const tileAt = await ev(`(() => { const t = [...document.querySelectorAll('#sections .deck-tile')].find((x) => x.dataset.cardName === 'Sol Ring'); t.scrollIntoView({ block: 'center' }); const r = t.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  await sleep(150); await pointAt(tileAt);
  check('the picture view has the same display: pointing at a picture shows the card there', (await display()).name === 'Sol Ring' && !(await display()).floating, JSON.stringify(await display()));
  await ev(`document.querySelector('[data-view="text"]').click()`);
  await away();


  // ---- the number is optional ----
  await load(); await paste('Thrasios, Triton Hero\n2 Sol Ring\nLands (36)\nSIDEBOARD:\nAnnul'); await press('check');
  const bare = await ev(`({ headings: Array.from(document.querySelectorAll('#sections h3')).map((h) => h.textContent), lines: Array.from(document.querySelectorAll('#sections .card-line')).map((li) => li.querySelector('.qty').textContent + ' ' + li.querySelector('.name').textContent), notices: Array.from(document.querySelectorAll('#notices li')).map((li) => li.textContent), problems: !document.getElementById('problems').hidden })`);
  check('a name with no number is one card, in the right section, and nothing needs attention', !bare.problems && bare.lines.includes('1 Thrasios, Triton Hero') && bare.lines.includes('2 Sol Ring') && bare.lines.includes('1 Annul') && bare.headings.includes('Sideboard (1)'), JSON.stringify(bare));
  check('the page says which lines were counted as 1, and that the heading line was skipped', bare.notices.some((n) => /Line 3 was skipped: "Lands \(36\)"/.test(n)) && bare.notices.some((n) => /^2 lines have no number, so each was counted as 1 card \(lines 1 and 5\)\.$/.test(n)), JSON.stringify(bare.notices));
  check('the summary counts them', /^4 cards$/.test(await $text('summary')), await $text('summary'));

  // ---- an export shaped like a real one: main deck (one card under another title), SIDEBOARD:, commander named last ----
  await load();
  await paste(`1 Sol Ring\n1 Weirding Wood\n1 Yavimaya Dryad\n1 ${katakana}\n10 Forest\n\nSIDEBOARD:\n1 Annul\n1 Swords to Plowshares\n\nCommander\n1 Kyodai, Soul of Kamigawa`); await press('check');
  const sideShape = await ev(`({ headings: Array.from(document.querySelectorAll('#sections h3')).map((h) => h.textContent), problems: !document.getElementById('problems').hidden, commanderOn: document.getElementById('deck-format').value === 'commander', note: document.getElementById('commander-note').textContent, side: Array.from(document.querySelectorAll('#sections ul')).map((ul) => Array.from(ul.querySelectorAll('.name')).map((n) => n.textContent)) })`);
  check('the groups are Commander 1, the main deck by type (14 cards) and Sideboard 2, with nothing needing attention', JSON.stringify(sideShape.headings) === JSON.stringify(['Commander (1)', 'Creatures (1)', 'Instants (1)', 'Artifacts (1)', 'Enchantments (1)', 'Lands (10)', 'Sideboard (2)']) && !sideShape.problems, JSON.stringify(sideShape));
  check('the sideboard lists its two cards and the main deck has the title match, in the Instants', sideShape.side.at(-1).join('|') === 'Annul|Swords to Plowshares' && sideShape.side[2].some((t) => t === `Arcane Denial (typed as "${katakana}")`), JSON.stringify(sideShape.side));
  check('the commander named last is marked as the commander (turned on, and says it was marked)', sideShape.commanderOn && /Kyodai/.test(await ev(`document.querySelector('#sections [data-group="commander"] .name').textContent`)), sideShape.note);
  await ev(`document.getElementById('deck-name').value = 'Side'; document.getElementById('deck-name').dispatchEvent(new Event('input'))`);
  await press('save');
  const savedSide = await selectedSaved();
  const sectionCounts = savedSide.cards.reduce((sum, c) => ({ ...sum, [c.section]: (sum[c.section] ?? 0) + c.qty }), {});
  check('the saved deck keeps the three sections apart', JSON.stringify(sectionCounts) === JSON.stringify({ main: 14, sideboard: 2, commander: 1 }) || (sectionCounts.main === 14 && sectionCounts.sideboard === 2 && sectionCounts.commander === 1), JSON.stringify(sectionCounts));
  await deleteAllSaved();

  // ---- keyboard, clear ----
  await load(); await paste('1 Sol Ring');
  await ev(`document.getElementById('deck-text').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }))`);
  check('Ctrl+Enter in the box checks the deck', !(await $hidden('preview')) && /^1 card$/.test(await $text('summary')), await $text('summary'));
  await ev(`document.getElementById('new-deck').click()`);
  check('New deck empties the box and hides the deck', (await ev(`document.getElementById('deck-text').value`)) === '' && (await $hidden('preview')) && !(await $hidden('paste')));

  // ---- the deck by card type, as a text list or as card pictures; the three screens ----
  await load(); await ev(`localStorage.removeItem('overloaded.deckView')`); await deleteAllSaved(); await load();
  await paste(MOXFIELD_PLAIN); await press('check');
  const toggle = () => ev(`(() => { const group = document.getElementById('view-toggle'); return { role: group.getAttribute('role'), label: group.getAttribute('aria-label'), buttons: [...group.querySelectorAll('button')].map((b) => ({ view: b.dataset.view, label: b.getAttribute('aria-label'), pressed: b.getAttribute('aria-pressed'), svg: [...b.querySelectorAll('svg')].map((v) => ({ w: v.getAttribute('width'), h: v.getAttribute('height'), fill: v.getAttribute('fill'), shapes: v.querySelectorAll('rect, path').length })) })) }; })()`);
  const t0 = await toggle();
  check('three view buttons in a labelled group: text (pressed, three lines), card pictures (four cards, 2 by 2) and stacks (three cards cascading), each icon with its width, height and fill set', t0.role === 'group' && t0.buttons.length === 3 && t0.buttons[0].view === 'text' && t0.buttons[0].pressed === 'true' && t0.buttons[0].label === 'Text list' && t0.buttons[0].svg[0].shapes === 3 && t0.buttons[1].view === 'images' && t0.buttons[1].pressed === 'false' && t0.buttons[1].label === 'Card pictures' && t0.buttons[1].svg[0].shapes === 4 && t0.buttons[2].view === 'stacks' && t0.buttons[2].label === 'Stacks' && t0.buttons[2].svg[0].shapes === 5 && t0.buttons.every((b) => b.svg.length === 1 && b.svg[0].w === '18' && b.svg[0].h === '18' && b.svg[0].fill === 'currentColor'), JSON.stringify(t0));
  const groupsNow = () => ev(`[...document.querySelectorAll('#sections .deck-group')].map((g) => ({ key: g.dataset.group, heading: g.querySelector('h3').textContent, names: [...g.querySelectorAll('.name, .sr-only')].map((n) => n.textContent) }))`);
  const g0 = await groupsNow();
  check('the text view is the start: groups by type, the commander first and the sideboard last, none empty', (await ev(`document.querySelectorAll('#sections .deck-list').length > 0 && document.querySelectorAll('#sections .deck-tiles').length === 0`)) && JSON.stringify(g0.map((g) => g.key)) === '["commander","creature","instant","artifact","land","sideboard"]' && g0[0].names.join() === 'Éowyn, Lady of Rohan', JSON.stringify(g0.map((g) => g.heading)));
  check('inside a group the cards are in name order', g0.every((g) => g.names.every((n, i) => i === 0 || g.names[i - 1].localeCompare(n, 'en') <= 0)), JSON.stringify(g0));
  pictureRequests.length = 0; // only what the picture view asks for from here on
  await ev(`document.querySelector('[data-view="images"]').click()`);
  await sleep(300);
  const tiles = await ev(`({ lists: document.querySelectorAll('#sections .deck-list').length, tiles: document.querySelectorAll('#sections .deck-tile').length, grids: document.querySelectorAll('#sections .deck-tiles').length, headings: [...document.querySelectorAll('#sections h3')].map((h) => h.textContent), pressed: [...document.querySelectorAll('#view-toggle button')].map((b) => b.getAttribute('aria-pressed')).join(), lazy: [...document.querySelectorAll('#sections .deck-tile img')].every((i) => i.loading === 'lazy' && i.alt === ''), ids: [...document.querySelectorAll('#sections .deck-tile')].every((t) => /^[0-9a-f-]{36}$/.test(t.dataset.previewId)), badges: [...document.querySelectorAll('#sections .tile-qty')].map((b) => b.textContent), saved: localStorage.getItem('overloaded.deckView'), spoken: [...document.querySelectorAll('#sections .deck-tile .sr-only')].map((n) => n.textContent) })`);
  check('the picture button shows one tile per line instead of the list, with the same headings, and is remembered in this browser', tiles.lists === 0 && tiles.tiles === 10 && tiles.grids === g0.length && JSON.stringify(tiles.headings) === JSON.stringify(g0.map((g) => g.heading)) && tiles.pressed === 'false,true,false' && tiles.saved === 'images', JSON.stringify(tiles));
  check('each tile has its card id (for the big picture), a lazy picture with no alt text (a spoken line carries the count and name), and a count on a card with copies', tiles.lazy && tiles.ids && tiles.badges.length > 0 && tiles.badges.every((b) => /^x\d+$/.test(b)) && tiles.badges.includes('x10') && tiles.spoken.includes('10 Forest') && tiles.spoken.includes('1 Éowyn, Lady of Rohan'), JSON.stringify(tiles));
  await waitFor(async () => (await ev(`[...document.querySelectorAll('#sections .deck-tile img')].every((i) => i.complete && i.naturalWidth > 0)`)) || null, 5000, 50).catch(() => null);
  check('the tile pictures are the small size, and the card-picture box (the big one) is still on hover', pictureRequests.length >= 3 && pictureRequests.every((u) => /^https:\/\/cards\.scryfall\.io\/(small|normal)\/front\//.test(u)) && pictureRequests.some((u) => u.includes('/small/')), JSON.stringify(pictureRequests.slice(0, 3)));
  await ev(`document.querySelector('[data-view="text"]').click()`);
  check('the text button goes back to the list (and is remembered)', (await ev(`document.querySelectorAll('#sections .deck-list').length > 0 && document.querySelectorAll('#sections .deck-tile').length === 0 && localStorage.getItem('overloaded.deckView') === 'text'`)));
  // the commander picker decides the Commander group, and Standard has none
  const lineMenu = () => ev(`(() => { const m = document.querySelector('.card-menu'); return m ? { title: m.querySelector('.card-menu-title').textContent, items: [...m.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent) } : null; })()`);
  const pickMenu = async (text) => { const p = await ev(`(() => { const b = [...document.querySelectorAll('.card-menu [role="menuitem"]')].find((x) => x.textContent === ${JSON.stringify(text)}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`); if (!p) throw new Error('no menu item ' + text); await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y }); await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 }); await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: 1 }); await sleep(120); };
  const rowCenter = (name) => ev(`(() => { const li = [...document.querySelectorAll('#sections .card-line')].find((l) => l.querySelector('.name').textContent === ${JSON.stringify(name)}); li.scrollIntoView({ block: 'center' }); const r = li.querySelector('.name').getBoundingClientRect(); return { x: Math.round(r.left + 12), y: Math.round(r.top + r.height / 2) }; })()`);
  const rightClick = async (name) => { await sleep(150); const p = await rowCenter(name); await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y }); await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'right', buttons: 2, clickCount: 1 }); await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'right', buttons: 0, clickCount: 1 }); await sleep(150); };
  await rightClick('Sol Ring'); await pickMenu('Make commander');
  const g1 = await groupsNow();
  check('choosing another commander moves that card into the Commander group, out of its type group, and the old one goes back to its type', g1[0].key === 'commander' && g1[0].names.join() === 'Sol Ring' && !g1.find((g) => g.key === 'artifact') && g1.find((g) => g.key === 'creature').names.includes('Éowyn, Lady of Rohan'), JSON.stringify(g1.map((g) => [g.key, g.names.length])));
  await setField('deck-format', 'standard');
  check('Standard has no Commander group', !(await groupsNow()).some((g) => g.key === 'commander'));
  // a line that was not matched stays visible, first, in both views
  await paste('1 Sol Ring\n1 Totally Fake Card'); await press('check');
  const gu = await groupsNow();
  check('a line that was not matched has a group of its own, first, so the counts add up', gu[0].key === 'unmatched' && gu[0].names.join() === 'Totally Fake Card' && gu[0].heading === 'Not matched (1)', JSON.stringify(gu));
  await ev(`document.querySelector('[data-view="images"]').click()`);
  check('and a tile with its name in the picture view', (await ev(`(() => { const t = document.querySelector('#sections [data-group="unmatched"] .deck-tile'); return Boolean(t) && t.classList.contains('unmatched') && t.querySelector('.tile-name')?.textContent === 'Totally Fake Card' && t.dataset.previewId === undefined; })()`)));
  await ev(`document.querySelector('[data-view="text"]').click()`);

  // the three screens: the list of decks, the box to paste into, one deck
  await load(); await deleteAllSaved(); await load(); await paste('1 Sol Ring\n1 Island'); await press('check');
  await setField('deck-name', 'Screens'); await press('save');
  const screenOf = () => ev(`document.querySelector('.deck-app').dataset.screen`);
  check('after a check the deck is the screen, and saving keeps you there', (await screenOf()) === 'deck' && !(await $hidden('preview')) && (await $hidden('saved')) && (await $hidden('paste')));
  await ev(`document.getElementById('edit-list').click()`);
  check('Edit list goes to the box with the list still in it, and Cancel goes back to the deck', (await screenOf()) === 'paste' && (await ev(`document.getElementById('deck-text').value`)) === '1 Sol Ring\n1 Island' && !(await ev(`document.getElementById('cancel-paste').hidden`)));
  await ev(`document.getElementById('cancel-paste').click()`);
  check('... Cancel returns to the deck, unchanged', (await screenOf()) === 'deck' && (await $text('summary')) === '2 cards');
  await ev(`window.__marker = 7`);
  await showList();
  check('the Decks link in the header goes to the list without loading the page again (a marker set on the page is still there): the saved deck with its buttons, and a New deck button; there is no All decks button', (await screenOf()) === 'list' && (await ev(`window.__marker`)) === 7 && (await ev(`document.getElementById('back-to-decks')`)) === null && !(await $hidden('saved')) && /Screens/.test(await $text('saved-list')) && !(await ev(`document.getElementById('new-deck').hidden`)) && (await $hidden('preview')));
  await ev(`document.getElementById('new-deck').click()`);
  check('New deck goes to an empty box, and Cancel there goes back to the list (nothing is open)', (await screenOf()) === 'paste' && (await ev(`document.getElementById('deck-text').value`)) === '');
  await ev(`document.getElementById('cancel-paste').click()`);
  check('... back at the list', (await screenOf()) === 'list');
  await clickSaved('load', 0); await settled();
  check('Open puts the saved deck on the deck screen with its name', (await screenOf()) === 'deck' && (await ev(`document.getElementById('deck-name').value`)) === 'Screens');
  check('no Clear button and no stand-alone save note any more (one of each action, nothing said twice)', (await ev(`document.getElementById('clear') === null && document.getElementById('save-note') === null && document.querySelectorAll('#preview button').length`)) >= 0 && (await ev(`document.getElementById('clear')`)) === null);
  await deleteAllSaved();

  // ---- a mana symbol picture that cannot load is replaced by a plain round symbol ----
  failSymbols.add('G.svg');
  await load(); await paste('1 Llanowar Elves'); await press('check');
  const fallbackPip = await waitFor(async () => (await ev(`(() => { const c = document.querySelector('#sections .cost'); return c && c.querySelector('.pip-color') ? [c.querySelectorAll('img').length, c.querySelector('.pip').textContent, c.querySelector('.pip').title] : null; })()`)) || null, 5000, 50).catch(() => null);
  check('a symbol picture that cannot load is replaced by a plain round symbol with its letter (the cost is never blank)', JSON.stringify(fallbackPip) === JSON.stringify([0, 'G', 'green mana']), JSON.stringify(fallbackPip));
  failSymbols.clear();

  // ---- the groups flow in columns, and a card's menu (the "..." button or a right-click) makes it the commander or the partner ----
  await load(); await deleteAllSaved(); await load();
  await ev(`document.getElementById('sample').click()`); await settled();
  await ev(`document.querySelector('[data-view="text"]').click()`);
  const flow = await ev(`(() => { const box = document.getElementById('sections'); const lefts = new Set([...box.querySelectorAll('.deck-group')].map((g) => Math.round(g.getBoundingClientRect().left))); const costs = [...box.querySelectorAll('.card-line')].slice(0, 20).map((li) => { const c = li.querySelector('.cost').getBoundingClientRect(); const n = li.querySelector('.name').getBoundingClientRect(); const r = li.getBoundingClientRect(); return { rightGap: Math.round(r.right - c.right), width: Math.round(c.width) }; }); return { columns: lefts.size, columnWidth: getComputedStyle(box).columnWidth, costs }; })()`);
  check('the text view flows in columns (two on a 1280 window, with the card display beside the list), not one long list', flow.columns >= 2 && flow.columnWidth !== 'auto', JSON.stringify({ c: flow.columns, w: flow.columnWidth }));
  check('a mana cost sits at the end of its row, not stretched (each is narrower than 120 px and its menu button leaves little room beside it)', flow.costs.every((c) => c.width <= 120 && c.rightGap <= 40), JSON.stringify(flow.costs.slice(0, 5)));
  const commanders = async () => { const group = await ev(`[...document.querySelectorAll('#sections [data-group="commander"] .name')].map((n) => n.textContent)`); return { group, first: group[0] ?? '', second: group[1] ?? 'No partner' }; };
  const escapeKey = async () => { await browser.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(80); };
  check('every card has a "..." button with its own label (and the commander too)', (await ev(`document.querySelectorAll('#sections .card-line .row-menu').length`)) === 85 && (await ev(`document.querySelector('#sections .row-menu').getAttribute('aria-label')`)) === 'Options for Krenko, Mob Boss');
  await rightClick('Goblin Chieftain');
  const m1 = await lineMenu();
  check('a right-click on a card in a Commander deck offers to make it the commander or the partner', m1 && m1.title === 'Goblin Chieftain' && JSON.stringify(m1.items) === JSON.stringify(['Change printing...', 'Make commander', 'Make partner']), JSON.stringify(m1));
  await pickMenu('Make partner');
  let cmd = await commanders();
  check('Make partner puts it in the Commander group beside Krenko and in the Partner picker, and says so', JSON.stringify(cmd) === JSON.stringify({ group: ['Krenko, Mob Boss', 'Goblin Chieftain'], first: 'Krenko, Mob Boss', second: 'Goblin Chieftain' }) && /^Goblin Chieftain is now the partner\.$/.test(await $text('deck-status')) && !(await lineMenu()), JSON.stringify(cmd));
  check('and it is out of the Creatures group (28 left)', (await ev(`document.querySelector('#sections [data-group="creature"] h3').textContent`)) === 'Creatures (28)');
  await rightClick('Goblin Chieftain');
  const m2 = await lineMenu();
  check('the partner can be made the commander or removed', m2 && JSON.stringify(m2.items) === JSON.stringify(['Change printing...', 'Make commander', 'Remove as partner']), JSON.stringify(m2));
  await pickMenu('Make commander');
  cmd = await commanders();
  check('making the partner the commander swaps the two', JSON.stringify(cmd) === JSON.stringify({ group: ['Goblin Chieftain', 'Krenko, Mob Boss'], first: 'Goblin Chieftain', second: 'Krenko, Mob Boss' }), JSON.stringify(cmd));
  await rightClick('Combat Celebrant');
  await pickMenu('Make commander');
  cmd = await commanders();
  check('making another card the commander replaces the commander only; the old commander goes back to its type group', JSON.stringify(cmd) === JSON.stringify({ group: ['Combat Celebrant', 'Krenko, Mob Boss'], first: 'Combat Celebrant', second: 'Krenko, Mob Boss' }) && (await ev(`[...document.querySelectorAll('#sections [data-group="creature"] .name')].some((n) => n.textContent === 'Goblin Chieftain')`)), JSON.stringify(cmd));
  // the "..." button opens the same menu
  await ev(`[...document.querySelectorAll('#sections .card-line')].find((l) => l.querySelector('.name').textContent === 'Combat Celebrant').querySelector('.row-menu').scrollIntoView({ block: 'center' })`); await sleep(150);
  const buttonAt = await ev(`(() => { const b = [...document.querySelectorAll('#sections .card-line')].find((l) => l.querySelector('.name').textContent === 'Combat Celebrant').querySelector('.row-menu'); const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: buttonAt.x, y: buttonAt.y }); await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: buttonAt.x, y: buttonAt.y, button: 'left', buttons: 1, clickCount: 1 }); await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: buttonAt.x, y: buttonAt.y, button: 'left', buttons: 0, clickCount: 1 }); await sleep(150);
  const m3 = await lineMenu();
  check('the "..." button opens the card\'s menu: for the commander, "Remove as commander" after "Change printing..."', m3 && m3.title === 'Combat Celebrant' && JSON.stringify(m3.items) === JSON.stringify(['Change printing...', 'Remove as commander']), JSON.stringify(m3));
  await pickMenu('Remove as commander');
  cmd = await commanders();
  check('taking the commander out lets the partner step up', JSON.stringify(cmd) === JSON.stringify({ group: ['Krenko, Mob Boss'], first: 'Krenko, Mob Boss', second: 'No partner' }), JSON.stringify(cmd));
  await rightClick('Goblin Chieftain'); await escapeKey();
  check('Escape closes a menu and changes nothing', !(await lineMenu()) && (await commanders()).group.join() === 'Krenko, Mob Boss');
  await setField('deck-format', 'standard');
  await rightClick('Goblin Chieftain');
  const standard = await lineMenu();
  check('in Standard the menu has only "Change printing..." (no commander choices)', standard && JSON.stringify(standard.items) === JSON.stringify(['Change printing...']), JSON.stringify(standard));
  await escapeKey();
  await setField('deck-format', 'commander');
  await paste('Commander\n1 Sol Ring\n\n1 Island\n\nSIDEBOARD:\n1 Annul'); await press('check');
  await ev(`document.querySelector('#sections [data-group="sideboard"] .card-line').scrollIntoView({ block: 'center' })`);
  await rightClick('Annul');
  const sideMenu = await lineMenu();
  check('a sideboard card can change its printing but cannot be the commander (only the main deck can)', sideMenu && JSON.stringify(sideMenu.items) === JSON.stringify(['Change printing...']), JSON.stringify(sideMenu));
  await escapeKey();
  await deleteAllSaved();

  // ---- changing a card's printing: the window of printings (our own data files), a filter, hovering a row, choosing one rewrites the line ----
  const SOL_RING_CMM_410_ID = '46ca0b66-a000-4483-b916-f5b89e710244';
  const printsRequests = () => ev(`performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('/data/prints/')).map((n) => n.split('/').pop())`);
  await load(); await deleteAllSaved(); await load();
  await paste('2 Sol Ring\n1 Island'); await press('check');
  await rightClick('Sol Ring');
  await pickMenu('Change printing...');
  await waitFor(async () => (await ev(`document.querySelectorAll('.picker-tile').length`)) > 50 || null, 8000, 50).catch(() => null);
  const picker = await ev(`({ dialog: document.querySelector('.picker')?.getAttribute('aria-label'), tiles: document.querySelectorAll('.picker-tile').length, focus: document.activeElement?.className, message: document.querySelector('.picker-message').textContent, resetHidden: document.querySelector('.picker-reset').hidden, defaults: document.querySelectorAll('.tile-default').length, placeholder: document.querySelector('.picker-filter').placeholder })`);
  check('"Change printing..." opens a window with a picture for every printing of the card (Sol Ring has well over 100), the search box focused, no "Use the default" button (nothing was chosen) and at most one picture marked Default', picker.dialog === 'Printings of Sol Ring' && picker.tiles > 100 && /picker-filter/.test(picker.focus) && picker.message === '' && picker.resetHidden && picker.defaults <= 1 && /set name, set code, number or id/.test(picker.placeholder), JSON.stringify(picker));
  const layout = await ev(`(() => { const tiles = [...document.querySelectorAll('.picker-tile')]; const box = (t) => { const r = t.getBoundingClientRect(); return { left: Math.round(r.left), top: Math.round(r.top) }; }; const years = tiles.slice(0, 80).map((t) => Number(/(\\d{4})$/.exec(t.querySelector('.tile-caption span').textContent)?.[1] ?? 0)); return { a: box(tiles[0]), b: box(tiles[1]), c: box(tiles[2]), d: box(tiles[3]), sorted: years.every((y, i) => i === 0 || years[i - 1] >= y), images: tiles.filter((t) => t.querySelector('img')).length, lazy: tiles.every((t) => t.querySelector('img')?.loading === 'lazy'), loaded: tiles.filter((t) => { const i = t.querySelector('img'); return i && i.complete && i.naturalWidth > 0; }).length }; })()`);
  check('the pictures are in columns of three, left to right then down, newest first (the years never go up)', layout.a.top === layout.b.top && layout.b.top === layout.c.top && layout.a.left < layout.b.left && layout.b.left < layout.c.left && layout.d.left === layout.a.left && layout.d.top > layout.a.top && layout.sorted, JSON.stringify(layout));
  check('every tile is a picture loaded lazily, and far fewer than all of them were fetched (only what is on screen)', layout.images === picker.tiles && layout.lazy && layout.loaded < 40 && layout.loaded >= 3, JSON.stringify({ images: layout.images, loaded: layout.loaded }));
  const files = await printsRequests();
  check('it fetched exactly two small files of our own: the one that holds the card and the sets file', files.length === 2 && files.includes('sets.json') && files.some((n) => /^[0-9a-f]{2}\.json$/.test(n)), JSON.stringify(files));
  const searchFor = async (text) => { await ev(`(() => { const f = document.querySelector('.picker-filter'); f.value = ${JSON.stringify(text)}; f.dispatchEvent(new Event('input', { bubbles: true })); })()`); return ev(`[...document.querySelectorAll('.picker-grid li')].filter((li) => !li.hidden).map((li) => li.textContent)`); };
  const byName = await searchFor('commander masters');
  check('searching a set name keeps the printings in sets with those words', byName.length >= 1 && byName.length < 10 && byName.every((t) => /Commander Masters/.test(t)) && byName.some((t) => /CMM 410/.test(t)), JSON.stringify(byName));
  const byCode = await searchFor('cmm');
  check('searching a set code finds that set (and the code is a word in the caption)', byCode.some((t) => /^CMM 410/.test(t)) && byCode.length < 30, JSON.stringify(byCode.slice(0, 5)));
  const byNumber = await searchFor('cmm 410');
  check('a set code and a collector number together find the one printing', byNumber.length === 1 && /^CMM 410/.test(byNumber[0]), JSON.stringify(byNumber));
  const byId = await searchFor('46ca0b66');
  check('the start of a Scryfall id finds that printing (the whole id too)', byId.length === 1 && /^CMM 410/.test(byId[0]) && (await searchFor(SOL_RING_CMM_410_ID)).length === 1);
  const byYear = await searchFor('2023 commander');
  check('words are all required, in any order: a year and a name', byYear.length >= 1 && byYear.every((t) => /Commander/.test(t) && /2023/.test(t)), JSON.stringify(byYear));
  check('a search with no match says so, and clearing it shows them all again', (await searchFor('zzzqqq')).length === 0 && /No printing matches that/.test(await ev(`document.querySelector('.picker-message').textContent`)) && (await searchFor('')).length > 100);
  await searchFor('commander masters');
  pictureRequests.length = 0;
  const rowAt = await ev(`(() => { const b = [...document.querySelectorAll('.picker-tile')].find((x) => /CMM 410/.test(x.textContent)); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: Math.round(r.left + 30), y: Math.round(r.top + r.height / 2), id: b.dataset.cardId }; })()`);
  await sleep(100);
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rowAt.x - 6, y: rowAt.y }); await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rowAt.x, y: rowAt.y }); await sleep(250);
  const hovered = await peek();
  check('pointing at a printing shows its picture in the normal size (one request for a normal-size picture; the tiles themselves are small and lazy)', !hovered.hidden && hovered.src === pictureUrl(SOL_RING_CMM_410_ID) && rowAt.id === SOL_RING_CMM_410_ID && pictureRequests.filter((u) => u.includes('/normal/')).length <= 1, JSON.stringify({ hovered, requests: pictureRequests })); // (at most one: the deck's own card display may already have that picture)
  await ev(`[...document.querySelectorAll('.picker-tile')].find((x) => /CMM 410/.test(x.textContent)).click()`);
  await sleep(300);
  const chosen = await ev(`({ closed: !document.querySelector('.picker'), text: document.getElementById('deck-text').value, status: document.getElementById('deck-status').textContent, row: (() => { const li = [...document.querySelectorAll('#sections .card-line')].find((l) => l.querySelector('.name').textContent === 'Sol Ring'); return li && { id: li.dataset.previewId, source: li.dataset.printing, printing: li.querySelector('.printing')?.textContent, qty: li.querySelector('.qty').textContent }; })(), name: document.getElementById('deck-name').value })`);
  check('choosing a printing closes the window, rewrites the line in the list (keeping its 2 copies), and the deck now shows that printing', chosen.closed && chosen.text === '2 Sol Ring (CMM) 410\n1 Island' && chosen.status === 'Sol Ring: CMM 410.' && chosen.row && chosen.row.id === SOL_RING_CMM_410_ID && chosen.row.source === 'set' && chosen.row.printing === 'CMM 410' && chosen.row.qty === '2', JSON.stringify(chosen));
  await rightClick('Sol Ring');
  await pickMenu('Change printing...');
  await waitFor(async () => (await ev(`document.querySelectorAll('.picker-tile').length`)) > 50 || null, 8000, 50).catch(() => null);
  const again = await ev(`({ current: [...document.querySelectorAll('.picker-tile[aria-current="true"]')].map((b) => b.textContent) })`);
  check('opening it again marks the printing in use, and the card\'s files were not fetched a second time', again.current.length === 1 && /CMM 410/.test(again.current[0]) && (await printsRequests()).length === 2, JSON.stringify(again));
  await escapeKey();
  check('Escape closes the window and changes nothing', !(await ev(`Boolean(document.querySelector('.picker'))`)) && (await ev(`document.getElementById('deck-text').value`)) === '2 Sol Ring (CMM) 410\n1 Island');
  await rightClick('Sol Ring');
  await pickMenu('Change printing...');
  await waitFor(async () => (await ev(`document.querySelectorAll('.picker-tile').length`)) > 50 || null, 8000, 50).catch(() => null);
  check('with a printing chosen the window has "Use the default"', !(await ev(`document.querySelector('.picker-reset').hidden`)));
  await ev(`document.querySelector('.picker-reset').click()`);
  await sleep(300);
  check('"Use the default" takes the set and number off the line again', (await ev(`document.getElementById('deck-text').value`)) === '2 Sol Ring\n1 Island' && (await ev(`document.querySelector('#sections .card-line .printing') === null`)) && /^Sol Ring: default printing\.$/.test(await $text('deck-status')));
  // saving keeps the chosen art: the saved card has the printing, and the saved text names it
  await rightClick('Sol Ring'); await pickMenu('Change printing...');
  await waitFor(async () => (await ev(`document.querySelectorAll('.picker-tile').length`)) > 50 || null, 8000, 50).catch(() => null);
  await ev(`[...document.querySelectorAll('.picker-tile')].find((x) => /CMM 410/.test(x.textContent)).click()`); await sleep(300);
  await setField('deck-name', 'Art'); await press('save');
  const savedArt = await selectedSaved();
  check('a saved deck keeps the chosen printing on the card and in its text', savedArt.cards.find((c) => c.n === 'Sol Ring')?.p === SOL_RING_CMM_410_ID && /2 Sol Ring \(CMM\) 410/.test(savedArt.text), JSON.stringify(savedArt.cards));
  await deleteAllSaved();
  // when the files cannot be loaded the window says so, and the next try loads them
  await load(); await paste('1 Lightning Bolt'); await press('check');
  await browser.send('Network.setBlockedURLs', { urls: ['*/data/prints/*'] });
  await rightClick('Lightning Bolt'); await pickMenu('Change printing...');
  await waitFor(async () => /could not be loaded/.test(await ev(`document.querySelector('.picker-message').textContent`)) || null, 5000, 50).catch(() => null);
  check('with the files blocked the window says the printings could not be loaded, and has no rows to choose', /could not be loaded/.test(await ev(`document.querySelector('.picker-message').textContent`)) && (await ev(`document.querySelectorAll('.picker-tile').length`)) === 0);
  await escapeKey();
  await browser.send('Network.setBlockedURLs', { urls: [] });
  await rightClick('Lightning Bolt'); await pickMenu('Change printing...');
  await waitFor(async () => (await ev(`document.querySelectorAll('.picker-tile').length`)) > 10 || null, 8000, 50).catch(() => null);
  check('with the network back the next try loads them (a failure is not remembered)', (await ev(`document.querySelectorAll('.picker-tile').length`)) > 10);
  await escapeKey();

  // ---- planeswalkers above creatures, eight pictures to a row, the stacks view, a quiet paste box ----
  await load(); await deleteAllSaved(); await load();
  await browser.send('Emulation.setFocusEmulationEnabled', { enabled: true }); // the page counts as focused, so :focus applies to a box focused by script
  const focusFacts = await ev(`(() => { const t = document.getElementById('deck-text'); t.focus(); const c = getComputedStyle(t); const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(); return { outline: c.outlineStyle, shadow: c.boxShadow, border: c.borderTopColor, accent, usesAccent: [c.outlineColor, c.boxShadow, c.borderTopColor].some((v) => accent && v.includes(accent)) }; })()`);
  check('clicking into the paste box shows no blue ring: no outline, a quiet grey edge', focusFacts.outline === 'none' && focusFacts.shadow !== 'none' && !/rgb\(1[0-9][0-9], 1[0-9][0-9], 2[0-9][0-9]\)/.test(focusFacts.shadow), JSON.stringify(focusFacts));
  await ev(`document.getElementById('sample').click()`); await settled();
  const order = await ev(`[...document.querySelectorAll('#sections .deck-group')].map((g) => g.dataset.group).join()`);
  check('the planeswalkers group is above the creatures group', /commander,planeswalker,creature,/.test(order), order);
  await ev(`document.querySelector('[data-view="images"]').click()`); await sleep(400);
  const eight = await ev(`(() => { const grid = [...document.querySelectorAll('#sections .deck-tiles')].find((g) => g.children.length >= 16); const lefts = [...grid.children].map((li) => Math.round(li.getBoundingClientRect().left)); const radius = getComputedStyle(grid.querySelector('.tile-picture')).borderTopLeftRadius; const last = grid.children[new Set(lefts).size - 1].getBoundingClientRect(); return { columns: new Set(lefts).size, radius, width: Math.round(grid.children[0].getBoundingClientRect().width), fills: Math.round(grid.getBoundingClientRect().right - last.right) }; })()`);
  check('the picture view is six to a row at 1280 wide (eight on a wider window), the row filling the space beside the card display, each picture with rounded corners', eight.columns === 6 && eight.radius !== '0px' && eight.fills <= 2 && eight.width >= 120, JSON.stringify(eight));
  await ev(`document.querySelector('[data-view="stacks"]').click()`); await sleep(600);
  const stacks = await ev(`(() => { const box = document.getElementById('sections'); const groups = [...box.querySelectorAll('.deck-group')]; const lefts = new Set(groups.map((g) => Math.round(g.getBoundingClientRect().left))); const stack = [...box.querySelectorAll('.deck-stack')].find((u) => u.children.length >= 10); const tiles = [...stack.children].map((li) => li.getBoundingClientRect()); const firstOverlaps = tiles[1].top < tiles[0].bottom - 20; const strip = Math.round(tiles[1].top - tiles[0].top); const lastFull = tiles.at(-1).height > 100; return { pressed: [...document.querySelectorAll('#view-toggle button')].map((b) => b.getAttribute('aria-pressed')).join(), stored: localStorage.getItem('overloaded.deckView'), columns: lefts.size, firstOverlaps, strip, lastFull, tiles: tiles.length, lists: box.querySelectorAll('.deck-list, .deck-tiles').length }; })()`);
  check('the stacks view puts each group in its own column with the cards overlapping (a strip of about 24 px of each shows, the last one in full), and is remembered', stacks.pressed === 'false,false,true' && stacks.stored === 'stacks' && stacks.columns >= 6 && stacks.firstOverlaps && stacks.strip >= 18 && stacks.strip <= 30 && stacks.lastFull && stacks.lists === 0, JSON.stringify(stacks));
  const lift = await ev(`(() => { const stack = [...document.querySelectorAll('#sections .deck-stack')].find((u) => u.children.length >= 10); const li = stack.children[3]; const before = getComputedStyle(li).zIndex; li.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); const r = li.getBoundingClientRect(); return { z: before, top: Math.round(r.top) }; })()`);
  const hoverTile = await ev(`(() => { const stack = [...document.querySelectorAll('#sections .deck-stack')].find((u) => u.children.length >= 10); const li = stack.children[3]; li.scrollIntoView({ block: 'center' }); const r = li.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 12) }; })()`);
  await sleep(200);
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hoverTile.x - 3, y: hoverTile.y }); await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hoverTile.x, y: hoverTile.y }); await sleep(250);
  const raised = await ev(`(() => { const stack = [...document.querySelectorAll('#sections .deck-stack')].find((u) => u.children.length >= 10); return getComputedStyle(stack.children[3]).zIndex; })()`);
  const sp = () => ev(`(() => { const i = document.querySelector('#stack-preview img'); const r = i.getBoundingClientRect(); return { src: i.getAttribute('src'), name: document.querySelector('#stack-preview .stack-preview-name').textContent, w: Math.round(r.width), left: Math.round(r.left), hidden: i.hidden, floatingBox: !document.getElementById('card-peek').hidden }; })()`);
  const hoveredName = await ev(`(() => { const stack = [...document.querySelectorAll('#sections .deck-stack')].find((u) => u.children.length >= 10); return stack.children[3].dataset.cardName; })()`);
  const stackShown = await sp();
  check('pointing at a card in a stack does not bring it to the front (no z-index change), and shows it in the card display on the left instead of the floating picture', raised === 'auto' && stackShown.name === hoveredName && /\/normal\/front\//.test(stackShown.src) && stackShown.w >= 250 && stackShown.left < 400 && !stackShown.floatingBox, JSON.stringify({ raised, stackShown, hoveredName }));
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 3, y: 3 }); await sleep(250);
  const resting = await sp();
  check('with the pointer off the cards, the display goes back to the deck\'s commander (nothing was clicked yet)', resting.name !== hoveredName && resting.name.length > 0, JSON.stringify(resting));
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hoverTile.x, y: hoverTile.y }); await sleep(150);
  await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: hoverTile.x, y: hoverTile.y, button: 'left', clickCount: 1 });
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: hoverTile.x, y: hoverTile.y, button: 'left', clickCount: 1 });
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 3, y: 3 }); await sleep(250);
  const kept = await sp();
  check('a click keeps that card in the display: with the pointer off the cards again it is still there, and nothing in the stacks is highlighted', kept.name === hoveredName && (await ev(`document.querySelectorAll('#sections .deck-tile.selected, #sections .deck-tile[aria-selected="true"]').length`)) === 0, JSON.stringify(kept));
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 3, y: 3 }); await sleep(150);
  // on a 1920 window the cards are larger and sharper: the pictures and the stacks fill the width, and the normal-size picture is used
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await sleep(500);
  const wide = await ev(`(() => { const box = document.getElementById('sections'); const cols = [...box.querySelectorAll('.deck-group')].map((g) => g.getBoundingClientRect()); const boxRight = box.getBoundingClientRect().right; const tile = box.querySelector('.deck-stack .deck-tile'); return { groups: cols.length, lastRight: Math.round(boxRight - cols[Math.min(7, cols.length - 1)].right), width: Math.round(tile.getBoundingClientRect().width) }; })()`);
  check('the stacks are spread across a 1920 window: eight columns of wide cards (165 px or more, with the card display beside them), the last one at the right edge', wide.groups >= 8 && wide.lastRight <= 2 && wide.width >= 165, JSON.stringify(wide));
  await ev(`document.querySelector('[data-view="images"]').click()`); await sleep(1500);
  const wideTiles = await ev(`(() => { const grid = [...document.querySelectorAll('#sections .deck-tiles')].find((g) => g.children.length >= 16); const imgs = [...grid.querySelectorAll('img')].filter((i) => i.complete && i.naturalWidth > 0); const last = grid.children[7].getBoundingClientRect(); return { width: Math.round(grid.children[0].getBoundingClientRect().width), fills: Math.round(grid.getBoundingClientRect().right - last.right), loaded: imgs.length, normal: imgs.filter((i) => i.currentSrc.includes('/normal/')).length }; })()`);
  check('the pictures fill a 1920 row (tiles 170 px or more) and the browser picked the normal-size picture for them', wideTiles.width >= 170 && wideTiles.fills <= 2 && wideTiles.loaded > 0 && wideTiles.normal === wideTiles.loaded, JSON.stringify(wideTiles));
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
  await ev(`document.querySelector('[data-view="text"]').click()`);

  // ---- sorting inside the groups, and no magnifying-glass cursor ----
  await load(); await ev(`localStorage.removeItem('overloaded.deckSort')`); await deleteAllSaved(); await load();
  await paste('1 Lightning Bolt\n1 Counterspell\n1 Swords to Plowshares\n1 Dark Ritual\n1 Boros Charm\n1 Giant Growth'); await press('check');
  const instants = () => ev(`[...document.querySelectorAll('#sections [data-group="instant"] .name')].map((n) => n.textContent)`);
  check('the sort choice is beside the view buttons, labelled, with Name, Mana cost and Color, starting at Name (alphabetical)', (await ev(`[...document.getElementById('deck-sort').options].map((o) => o.textContent).join()`)) === 'Name,Mana cost,Color' && (await ev(`document.querySelector('label[for="deck-sort"]').textContent`)) === 'Sort by' && (await ev(`document.getElementById('deck-sort').value`)) === 'name' && JSON.stringify(await instants()) === JSON.stringify(['Boros Charm', 'Counterspell', 'Dark Ritual', 'Giant Growth', 'Lightning Bolt', 'Swords to Plowshares']), JSON.stringify(await instants()));
  await setField('deck-sort', 'value');
  check('by mana value: the one-mana spells first (alphabetical among themselves), then the two-mana ones', JSON.stringify(await instants()) === JSON.stringify(['Dark Ritual', 'Giant Growth', 'Lightning Bolt', 'Swords to Plowshares', 'Boros Charm', 'Counterspell']), JSON.stringify(await instants()));
  await setField('deck-sort', 'color');
  check('by color: white, blue, black, red, green, then the two-color card', JSON.stringify(await instants()) === JSON.stringify(['Swords to Plowshares', 'Counterspell', 'Dark Ritual', 'Lightning Bolt', 'Giant Growth', 'Boros Charm']), JSON.stringify(await instants()));
  await ev(`document.querySelector('[data-view="images"]').click()`); await sleep(300);
  check('the sort applies to the picture view too, and is remembered across a reload', JSON.stringify(await ev(`[...document.querySelectorAll('#sections [data-group="instant"] .deck-tile .sr-only')].map((n) => n.textContent)`)) === JSON.stringify(['1 Swords to Plowshares', '1 Counterspell', '1 Dark Ritual', '1 Lightning Bolt', '1 Giant Growth', '1 Boros Charm']) && (await ev(`localStorage.getItem('overloaded.deckSort')`)) === 'color');
  await ev(`document.querySelector('[data-view="text"]').click()`);
  await load(); await paste('1 Lightning Bolt\n1 Counterspell\n1 Dark Ritual'); await press('check');
  check('after a reload the chosen sort is still in use', (await ev(`document.getElementById('deck-sort').value`)) === 'color' && JSON.stringify(await instants()) === JSON.stringify(['Counterspell', 'Dark Ritual', 'Lightning Bolt']), JSON.stringify(await instants()));
  // the other way round
  await setField('deck-sort', 'value');
  const UP = String.fromCharCode(0x2191), DOWN = String.fromCharCode(0x2193);
  check('beside the sort is a button with an up arrow and the word Ascending (the usual way), and "Low to high" for mana cost in its tooltip and for a screen reader', (await $text('deck-sort-direction')) === `${UP} Ascending` && /Sort order: ascending, Low to high/.test(await ev(`document.getElementById('deck-sort-direction').getAttribute('aria-label')`)) && /^Ascending \u2191 \(Low to high\)\. Press for descending/.test(await ev(`document.getElementById('deck-sort-direction').title`)));
  await ev(`document.getElementById('deck-sort-direction').click()`);
  check('pressing it turns the order round (high to low, the name still settling ties from A to Z) and the arrow points down', (await $text('deck-sort-direction')) === `${DOWN} Descending` && /^Descending \u2193 \(High to low\)\. Press for ascending/.test(await ev(`document.getElementById('deck-sort-direction').title`)) && JSON.stringify(await instants()) === JSON.stringify(['Counterspell', 'Dark Ritual', 'Lightning Bolt']) && (await ev(`localStorage.getItem('overloaded.deckSortDirection')`)) === 'desc', JSON.stringify(await instants()));
  await setField('deck-sort', 'name');
  check('the tooltip\'s words follow the sort (Z to A for names), and the direction is kept when the sort changes', (await $text('deck-sort-direction')) === `${DOWN} Descending` && /\(Z to A\)/.test(await ev(`document.getElementById('deck-sort-direction').title`)) && JSON.stringify(await instants()) === JSON.stringify(['Lightning Bolt', 'Dark Ritual', 'Counterspell']), JSON.stringify(await instants()));
  await setField('deck-sort', 'color');
  check('G to W for color: green first, white last', /\(G to W\)/.test(await ev(`document.getElementById('deck-sort-direction').title`)) && JSON.stringify(await instants()) === JSON.stringify(['Lightning Bolt', 'Dark Ritual', 'Counterspell']), JSON.stringify(await instants()));
  await load(); await paste('1 Lightning Bolt\n1 Counterspell\n1 Dark Ritual'); await press('check');
  check('after a reload the direction is still reversed (the arrow points down)', (await $text('deck-sort-direction')) === `${DOWN} Descending` && JSON.stringify(await instants()) === JSON.stringify(['Lightning Bolt', 'Dark Ritual', 'Counterspell']), JSON.stringify(await instants()));
  await ev(`document.getElementById('deck-sort-direction').click()`);
  await setField('deck-sort', 'name'); await ev(`localStorage.removeItem('overloaded.deckSort'); localStorage.removeItem('overloaded.deckSortDirection')`);

  // ---- grouping, the facts strip and the information below the deck ----
  const GROUPED = 'Commander\n1 Krenko, Mob Boss\n\n4 Lightning Bolt\n2 Counterspell\n1 Sol Ring\n1 Boros Charm\n10 Mountain\n6 Island';
  await load(); await paste(GROUPED); await press('check');
  const groupTitles = () => ev(`[...document.querySelectorAll('#sections .deck-group h3')].map((h) => h.textContent)`);
  check('Group by is beside Sort by, labelled, with Type, Color and Mana value, starting at Type', (await ev(`[...document.getElementById('deck-grouping').options].map((o) => o.textContent).join()`)) === 'Type,Color,Mana value' && (await ev(`document.querySelector('label[for="deck-grouping"]').textContent`)) === 'Group by' && (await ev(`document.getElementById('deck-grouping').value`)) === 'type' && (await groupTitles()).includes('Instants (7)'), JSON.stringify(await groupTitles()));
  await setField('deck-grouping', 'color');
  const byColor = await groupTitles();
  check('by color: the groups are colors, the commander stays first and lands come last', JSON.stringify(byColor) === JSON.stringify(['Commander (1)', 'Blue (2)', 'Red (4)', 'Multicolor (1)', 'Colorless (1)', 'Lands (16)']), JSON.stringify(byColor));
  await setField('deck-grouping', 'value');
  const byValue = await groupTitles();
  check('by mana value: one group per value, lands last', JSON.stringify(byValue) === JSON.stringify(['Commander (1)', 'Mana value 1 (5)', 'Mana value 2 (3)', 'Lands (16)']), JSON.stringify(byValue));
  check('the grouping is remembered', (await ev(`localStorage.getItem('overloaded.deckGrouping')`)) === 'value');
  await load(); await paste(GROUPED); await press('check');
  check('and still in use after a reload', (await ev(`document.getElementById('deck-grouping').value`)) === 'value' && (await groupTitles()).includes('Mana value 1 (5)'));
  await setField('deck-grouping', 'type'); await ev(`localStorage.removeItem('overloaded.deckGrouping')`);
  const deckFacts = await ev(`[...document.querySelectorAll('#deck-facts .fact')].map((f) => f.textContent)`);
  check('the facts strip says the cards, lands, average mana value (without lands) and colors', deckFacts.length === 4 && /^Cards25$/.test(deckFacts[0]) && /^Lands16$/.test(deckFacts[1]) && /^Avg mana value1\.67$/.test(deckFacts[2]) && /^Colors/.test(deckFacts[3]), JSON.stringify(deckFacts));
  const info = await ev(`(() => { const i = document.getElementById('deck-info'); return { hidden: i.hidden, panels: [...i.querySelectorAll('.stat-panel h3')].map((h) => h.textContent), columns: i.querySelectorAll('.curve-column').length, counts: [...i.querySelectorAll('.curve-count')].map((c) => c.textContent).join(), colors: [...i.querySelectorAll('.color-row')].map((r) => r.getAttribute('aria-label')), types: [...i.querySelectorAll('.type-name')].map((n) => n.textContent).join() }; })()`);
  check('below the deck: the mana curve (eight columns 0 to 7+), the color requirements and the card types', !info.hidden && JSON.stringify(info.panels) === JSON.stringify(['Mana curve', 'Color requirements', 'Card types']) && info.columns === 8, JSON.stringify(info));
  check('the curve counts the spells by mana value: five at 1, three at 2, Krenko at 4', info.counts === ',5,3,,1,,,', info.counts);
  check('the color requirements count mana symbols (white 1, blue 4, red 7; generic mana is not counted)', JSON.stringify(info.colors) === JSON.stringify(['white: 1 symbol, 8% of all', 'blue: 4 symbols, 33% of all', 'red: 7 symbols, 58% of all']), JSON.stringify(info.colors));
  check('the card types list only the types the deck has', info.types === 'Creatures,Instants,Artifacts,Lands', info.types);

  // the cursor stays an arrow over a card (no magnifying glass)
  const cursors = await ev(`({ row: getComputedStyle(document.querySelector('#sections .card-line[data-preview-id]')).cursor, name: getComputedStyle(document.querySelector('#sections .card-line .name')).cursor })`);
  await ev(`document.querySelector('[data-view="images"]').click()`); await sleep(300);
  const tileCursor = await ev(`getComputedStyle(document.querySelector('#sections .deck-tile[data-preview-id]')).cursor`);
  await ev(`document.querySelector('[data-view="text"]').click()`);
  check('the cursor over a card (a line or a picture) is not a magnifying glass', ![cursors.row, cursors.name, tileCursor].some((c) => /zoom/.test(c)), JSON.stringify({ cursors, tileCursor }));

  // ---- the bracket guess from the Game Changers, and the saved decks as cards ----
  await load(); await deleteAllSaved(); await load();
  const bracketFacts = () => ev(`({ first: document.getElementById('deck-bracket').options[0].textContent, value: document.getElementById('deck-bracket').value, names: [...document.querySelectorAll('#bracket-pop .gc-name')].map((n) => n.textContent), count: document.getElementById('bracket-pop').dataset.count, none: document.querySelectorAll('#bracket-pop .bracket-pop-none').length, noteInHeader: document.querySelectorAll('#bracket-note').length })`);
  await paste('Commander\n1 Krenko, Mob Boss\n\n1 Sol Ring\n10 Mountain'); await press('check');
  let bf = await bracketFacts();
  check('a Commander deck with no Game Changers guesses bracket 2: the choice reads "Auto (2)" and the panel behind the (i) says there are none', bf.first === 'Auto (2)' && bf.value === '' && bf.count === '0' && bf.none === 1 && bf.names.length === 0 && bf.noteInHeader === 0, JSON.stringify(bf));
  await paste('Commander\n1 Krenko, Mob Boss\n\n1 Rhystic Study\n1 Cyclonic Rift\n1 Sol Ring\n10 Mountain'); await press('check');
  bf = await bracketFacts();
  check('two Game Changers is bracket 3, and the panel lists them, one each, in order', bf.first === 'Auto (3)' && bf.count === '2' && JSON.stringify(bf.names) === JSON.stringify(['Cyclonic Rift', 'Rhystic Study']), JSON.stringify(bf));
  await paste('Commander\n1 Krenko, Mob Boss\n\n1 Rhystic Study\n1 Cyclonic Rift\n1 Mana Vault\n1 Demonic Tutor\n10 Mountain'); await press('check');
  bf = await bracketFacts();
  check('four is bracket 4', bf.first === 'Auto (4)' && bf.count === '4' && bf.names.length === 4, JSON.stringify(bf));
  await paste('Commander\n1 Krenko, Mob Boss\n\n1 Rhystic Study\n10 Mountain\n\nSIDEBOARD:\n1 Demonic Tutor\n1 Mana Vault\n1 Gamble\n1 Cyclonic Rift'); await press('check');
  bf = await bracketFacts();
  check('Game Changers in the sideboard do not count', bf.first === 'Auto (3)' && bf.count === '1' && JSON.stringify(bf.names) === JSON.stringify(['Rhystic Study']), JSON.stringify(bf));
  await setField('deck-format', 'standard');
  bf = await bracketFacts();
  check('a Standard deck has no bracket and no (i) (the choice just says Auto)', bf.first === 'Auto' && (await ev(`document.getElementById('bracket-field').hidden`)), JSON.stringify(bf));
  await setField('deck-format', 'commander');
  await paste('Commander\n1 Krenko, Mob Boss\n\n1 Rhystic Study\n1 Cyclonic Rift\n1 Sol Ring\n10 Mountain'); await press('check');
  const panel = async () => ev(`(() => { const p = document.getElementById('bracket-pop'); const r = p.getBoundingClientRect(); return { hidden: p.hidden, expanded: document.getElementById('bracket-info').getAttribute('aria-expanded'), width: Math.round(r.width), inWindow: r.right <= document.documentElement.clientWidth && r.left >= 0, title: p.querySelector('.bracket-pop-title')?.textContent, line: p.querySelector('.bracket-pop-line')?.textContent, columns: new Set([...p.querySelectorAll('.gc-name')].map((n) => Math.round(n.getBoundingClientRect().left))).size }; })()`);
  const closed = await panel();
  check('the panel is closed until the (i) beside Bracket is pressed', closed.hidden && closed.expanded === 'false', JSON.stringify(closed));
  await ev(`document.getElementById('bracket-info').click()`);
  const opened = await panel();
  check('pressing the (i) opens a tidy panel: a title, what Auto picked, the Game Changers in two columns, inside the window', !opened.hidden && opened.expanded === 'true' && opened.title === 'Bracket information' && /^Auto picks bracket 3/.test(opened.line) && opened.columns === 2 && opened.inWindow, JSON.stringify(opened));
  await ev(`document.getElementById('bracket-info').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  check('Escape closes it', (await panel()).hidden);
  await ev(`document.getElementById('bracket-info').click()`);
  await ev(`document.getElementById('sections').click()`);
  check('and so does a click elsewhere', (await panel()).hidden);
  await setField('deck-format', 'commander');
  await setField('deck-name', 'Guessy'); await press('save');
  let lib2 = await library();
  check('saving on Auto stores the guess with the guess flag', lib2.decks[0].bracket === 3 && lib2.decks[0].bracketGuess === true, JSON.stringify(lib2.decks[0]));
  await setField('deck-bracket', '4'); await press('save');
  lib2 = await library();
  check('choosing a number stores it as chosen (no guess flag)', lib2.decks[0].bracket === 4 && !('bracketGuess' in lib2.decks[0]), JSON.stringify(lib2.decks[0]));
  await showList(); await clickSaved('load', 0); await settled();
  check('opening a deck with a chosen bracket shows that bracket, not Auto', (await ev(`document.getElementById('deck-bracket').value`)) === '4');
  await setField('deck-bracket', ''); await press('save');
  await showList(); await clickSaved('load', 0); await settled();
  check('reselecting Auto saves the guess again, and opening that deck shows Auto (guessed again from the list)', (await ev(`document.getElementById('deck-bracket').value`)) === '' && (await ev(`document.getElementById('deck-bracket').options[0].textContent`)) === 'Auto (3)' && (await library()).decks[0].bracketGuess === true);
  // the cards
  await deleteAllSaved();
  const saveDeck = async (text, name) => { await ev(`document.getElementById('new-deck').click()`); await paste(text); await press('check'); await setField('deck-name', name); await press('save'); await showList(); };
  await saveDeck('Commander\n1 Tymna the Weaver\nCommander\n1 Thrasios, Triton Hero\n\n1 Rhystic Study\n1 Cyclonic Rift\n1 Sol Ring\n10 Island', 'Two Partners');
  await saveDeck('Commander\n1 Krenko, Mob Boss\n\n1 Sol Ring\n10 Mountain', 'One Commander');
  await saveDeck('4 Lightning Bolt\n4 Counterspell\n20 Island', 'Plain UR');
  const cards = await ev(`[...document.querySelectorAll('#saved-list .deck-face')].map((f) => ({ name: f.querySelector('.saved-name').textContent, colors: f.dataset.colors, split: f.dataset.split ?? '', halves: f.querySelectorAll('.face-half').length, tints: [...f.querySelectorAll('.face-half')].map((h) => h.style.getPropertyValue('--tint')), commanders: [...f.querySelectorAll('.face-commander')].map((c) => c.textContent), pips: f.querySelectorAll('.face-colors img, .face-colors .pip').length, bracket: f.querySelector('.face-bracket')?.textContent ?? '', format: f.querySelector('.face-facts').textContent, label: f.getAttribute('aria-label') ?? '' }))`);
  check('each saved deck is a card: its name, format, colors as symbols and (for Commander) its bracket with "guess"', cards.length === 3 && cards.every((c) => c.name && c.format) && cards[0].bracket === 'Bracket 3' && cards[1].bracket === 'Bracket 2' && cards[2].bracket === '' && cards[1].colors === 'R' && cards[1].pips === 1 && cards[2].colors === 'UR' && cards[2].pips === 2 && cards[2].commanders.length === 0 && /^Standard/.test(cards[2].format), JSON.stringify(cards));
  check('two commanders: the card is split, the first commander\'s colors on the upper left and the second\'s on the lower right, both names shown, the colors the two together', cards[0].split === '1' && cards[0].halves === 2 && cards[0].tints[0] !== cards[0].tints[1] && cards[0].commanders.length === 2 && cards[0].colors.length === 4 && cards[0].pips === 4 && /Open: /.test(cards[0].label), JSON.stringify(cards[0]));
  const geometry = await ev(`(() => { const face = document.querySelector('#saved-list .deck-face[data-split="1"]'); const a = getComputedStyle(face.querySelector('.face-a')).clipPath; const b = getComputedStyle(face.querySelector('.face-b')).clipPath; return { a, b, line: getComputedStyle(face, '::after').backgroundImage.includes('to bottom right') || getComputedStyle(face, '::after').backgroundImage.includes('linear-gradient') }; })()`);
  check('the split is a diagonal from the upper right to the lower left (two triangles), with a thin line along it', /polygon\(0(px)? 0(px)?, 100% 0(px)?, 0(px)? 100%\)/.test(geometry.a) && /polygon\(100% 0(px)?, 100% 100%, 0(px)? 100%\)/.test(geometry.b) && geometry.line, JSON.stringify(geometry));
  check('one commander is not split: one tint over the whole card', cards[1].split === '' && cards[1].halves === 1);
  const art = await ev(`[...document.querySelectorAll('#saved-list .deck-face')].map((f) => [...f.querySelectorAll('.face-half img')].map((i) => i.src))`);
  check('the face is the art of each commander: one picture, two for a split card, none for a Standard deck, all from art_crop on cards.scryfall.io', art[0].length === 2 && art[1].length === 1 && art[2].length === 0 && art.flat().every((u) => /^https:\/\/cards\.scryfall\.io\/art_crop\/front\//.test(u)), JSON.stringify(art));
  // the commander's name sits just above the mana symbols and the bracket (not in the middle of the card), and with no commander the colors still sit at the bottom
  const lines = await ev("(() => [...document.querySelectorAll('#saved-list .deck-face')].map((face) => { const card = face.getBoundingClientRect(); const cmd = face.querySelector('.face-commanders')?.getBoundingClientRect() ?? null; const bottom = face.querySelector('.face-bottom').getBoundingClientRect(); const top = face.querySelector('.face-top').getBoundingClientRect(); return { cmdGap: cmd ? Math.round(bottom.top - cmd.bottom) : null, cmdBelowName: cmd ? cmd.top > top.bottom : null, bottomGap: Math.round(card.bottom - bottom.bottom) }; }))()");
  check('on a saved deck the commander name is right above the colors and the bracket (less than 12 px between them), below the deck name, and the colors row is at the bottom of the card', lines.length === 3 && lines.filter((l) => l.cmdGap !== null).every((l) => l.cmdGap >= -2 && l.cmdGap < 12 && l.cmdBelowName) && lines.every((l) => l.bottomGap < 20), JSON.stringify(lines));
  if (process.argv.includes('--screenshot')) { // the saved decks with the REAL art (the stand-in pictures are switched off), the pointer on the first card so its "..." shows
    await browser.send('Fetch.disable').catch(() => {});
    await ev('location.reload()'); await sleep(4000);
    const box = await ev(`(() => { const r = document.querySelector('#saved-list .deck-face').getBoundingClientRect(); return { x: r.left + 40, y: r.top + 40 }; })()`);
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
    await sleep(300); await browser.screenshot('scratch-deck-cards.png');
  }
  await deleteAllSaved();

  // ---- limits and odd input ----
  await paste('201 Forest'); await press('check');
  check('too many cards: shown, with the limit, and is not saved', /limit is 200/.test(await $text('notices')) && /^Not saved/.test(await $text('save-state')));
  await paste('Deck stats: 99\n1 Sol Ring\n0 Island\nCommander'); await press('check');
  const notices = await $text('notices');
  check('skipped lines are explained with their line numbers', /Line 1 was skipped/.test(notices) && /Line 3 was skipped: the quantity is 0/.test(notices) && /Line 4 says "Commander" but no card follows it/.test(notices), notices);
  await paste('<img src=x onerror="window.__pwned=1">\n<script>window.__pwned=2<\/script>\n1 Sol Ring'); await press('check');
  const injected = await ev(`({ imgs: document.querySelectorAll('#preview img:not(.pip-img):not(.stack-preview-image), #notices img').length, scripts: document.querySelectorAll('#preview script, #notices script').length, pwned: typeof window.__pwned, shown: document.getElementById('preview').textContent.includes('<img src=x') })`); // a line with no number is now a card name that was not found, so the text shows in the list and the problems, not the notices
  check('pasted markup is shown as text and never runs', injected.imgs === 0 && injected.scripts === 0 && injected.pwned === 'undefined' && injected.shown, JSON.stringify(injected));
  await paste('1 Sol Ring\n'.repeat(1500)); await press('check');
  check('a huge paste is refused with the limit, without freezing', /too many lines/.test(await $text('notices')) || /limit/.test(await $text('notices')), await $text('notices'));

  // ---- the card list cannot be loaded, then can ----
  await browser.send('Network.setBlockedURLs', { urls: ['*cards.json'] });
  await browser.goto(PAGE);
  await waitFor(async () => !(await $hidden('retry')) || null, 8000, 50);
  check('a card list that cannot load says so, offers to retry, and Check and the sample button stay off', /could not be loaded/.test(await $text('list-state')) && !(await $hidden('retry')) && (await ev(`document.getElementById('check').disabled`)) && (await ev(`document.getElementById('sample').disabled`)));
  await browser.send('Network.setBlockedURLs', { urls: [] });
  await press('retry');
  check('after the network is back, Try again works and the sample button comes back too', Boolean(await ready()) && (await $hidden('retry')) && !(await ev(`document.getElementById('sample').disabled`)));

  // ---- storage blocked ----
  await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });` });
  await browser.goto(PAGE); await ready();
  check('with storage blocked the page still loads and says it cannot remember a deck', !(await $hidden('storage-hint')) && (await $hidden('saved')));
  await paste('1 Sol Ring'); await press('check');
  await ev(`document.getElementById('deck-name').value = 'Nowhere'`);
  await press('save');
  check('and saving says why it did not work, without crashing', /would not save that change/.test(await $text('deck-status')), await $text('deck-status'));

  // ---- the whole session ----
  const errors = browser.logs.filter((l) => /^exception:|^console\.error|^error:/.test(l) && !/Failed to load resource|ERR_BLOCKED|net::/.test(l));
  check('no script errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  const foreign = browser.events.filter((e) => e.method === 'Network.requestWillBeSent' && !e.params.request.url.startsWith(ORIGIN) && !e.params.request.url.startsWith('data:') && !e.params.request.url.startsWith('https://cards.scryfall.io/') && !e.params.request.url.startsWith('https://backs.scryfall.io/') && !e.params.request.url.startsWith('https://svgs.scryfall.io/card-symbols/'));
  check('nothing was requested from any other site', foreign.length === 0, foreign.slice(0, 2).map((e) => e.params.request.url).join(' | '));

  if (process.argv.includes('--screenshot')) {
    // Three looks, desktop width: the top of the page with a saved deck (dark), the list (light), the commander and save area (dark).
    await browser.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: '1' }).catch(() => {});
    const scheme = (value) => browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value }] });
    await scheme('dark');
    await load(); await paste(MOXFIELD_PLAIN); await press('check');
    await setField('deck-format', 'commander'); await setField('deck-bracket', '3');
    await ev(`document.getElementById('deck-name').value = 'Eowyn Tokens'`); await press('save');
    await ev(`window.scrollTo(0, 0)`); await sleep(300);
    await browser.screenshot('scratch-deck-ui-top.png');
    await scheme('light');
    await paste(MOXFIELD_PLAIN + '\n\n1 Totally Fake Card\n1 Insectile Aberration'); await press('check');
    await ev(`document.getElementById('problems').scrollIntoView()`); await sleep(300);
    await browser.screenshot('scratch-deck-ui-light.png');
    await scheme('dark');
    await setField('deck-format', 'commander'); await setField('deck-bracket', '4');
    await ev(`document.getElementById('deck-format').scrollIntoView()`); await sleep(300);
    await browser.screenshot('scratch-deck-ui-bottom.png');
    // the hover picture of a two-sided card with the REAL pictures: front and back side by side
    await browser.send('Fetch.disable').catch(() => {});
    await paste('1 Valakut Awakening\n1 Sol Ring\n1 Delver of Secrets'); await press('check');
    const hoverRow = await ev(`Array.from(document.querySelectorAll('#sections .card-line')).findIndex((li) => (li.dataset.cardName || '').startsWith('Valakut'))`);
    await hover(hoverRow); await sleep(2500);
    await browser.screenshot('scratch-deck-ui-hover.png');
    // the deck page at 1920 wide with the real pictures: the stacks view with its card display, then the information below
    await browser.send('Fetch.disable').catch(() => {});
    await browser.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    await load(); await ev(`document.getElementById('sample').click()`); await settled();
    await ev(`document.getElementById('bracket-info').click()`); await sleep(400);
    await browser.screenshot('scratch-deck-bracket.png');
    await ev(`document.getElementById('bracket-info').click()`);
    await ev(`document.querySelector('[data-view="stacks"]').click()`); await sleep(3500);
    await browser.screenshot('scratch-deck-stacks.png');
    await ev(`document.getElementById('deck-info').scrollIntoView()`); await sleep(600);
    await browser.screenshot('scratch-deck-info.png');
    await deleteAllSaved();
    console.log('saved scratch-deck-ui-top.png, -light.png, -bottom.png and -hover.png (delete them afterward)');
  }
} finally {
  await closeAllBrowsers();
  if (server) await server.close();
}

if (failures.length) { console.log(`\n${failures.length} of ${checks} deck page checks FAILED.`); process.exit(1); }
console.log(`All ${checks} deck page checks passed.`);
