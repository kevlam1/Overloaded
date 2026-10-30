// Checks the lobby page in a real headless Chrome (desktop width). No database traffic: everything here is the
// page's own behavior. Run from the repo root:  node scripts/check-lobby-ui.mjs
// Optional: add  --screenshot  to save scratch-lobby-ui.png (git ignores scratch files; delete it afterward).
import { createServer } from 'vite';
import { openBrowser, closeAllBrowsers, waitFor, sleep, text, setValue, click } from './lib/browser.mjs';

const PORT = 5197;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const PAGE = `${ORIGIN}/pages/lobby/index.html`;

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
  const browser = await openBrowser('lobby-ui', { width: 1280, height: 800 });
  await browser.goto(PAGE);

  // ---- the page's structure ----
  const facts = await browser.eval(`(() => {
    const byId = (id) => document.getElementById(id);
    const fields = Array.from(document.querySelectorAll('input, select'));
    const footer = document.querySelector('footer');
    const rect = (el) => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height }; };
    return {
      title: document.title,
      lang: document.documentElement.lang,
      viewport: !!document.querySelector('meta[name=viewport]'),
      h1s: document.querySelectorAll('h1').length,
      ids: ['name', 'seats', 'format', 'table-format', 'create', 'join-code', 'join', 'status', 'banner', 'table', 'code', 'link', 'seat', 'players'].every((id) => !!byId(id)),
      bannerHiddenAtStart: byId('banner').hidden && byId('banner').textContent === '',
      bannerIsLive: byId('banner').getAttribute('aria-live') === 'polite' && byId('banner').getAttribute('role') === 'status',
      fieldsWithoutLabel: fields.filter((f) => !document.querySelector('label[for="' + f.id + '"]')).map((f) => f.id),
      buttonsWithoutText: Array.from(document.querySelectorAll('button')).filter((b) => !b.textContent.trim()).length,
      tableHiddenAtStart: byId('table').hidden,
      statusIsLive: byId('status').getAttribute('aria-live') === 'polite' && byId('status').getAttribute('role') === 'status',
      nameMax: byId('name').maxLength,
      seatOptions: Array.from(byId('seats').options).map((o) => o.value + ':' + o.selected),
      formatOptions: Array.from(byId('format').options).map((o) => o.value + '=' + o.textContent.trim() + ':' + o.selected),
      disclaimer: footer ? footer.textContent.replace(/\\s+/g, ' ').trim() : '',
      disclaimerVisible: !!footer && rect(footer).h > 0,
      buttonHeights: [rect(byId('create')).h, rect(byId('join')).h],
      scrollsSideways: document.documentElement.scrollWidth > window.innerWidth,
      headingOrder: Array.from(document.querySelectorAll('h1,h2,h3')).map((h) => h.tagName).join(','),
    };
  })()`);
  check('page title names the site', /Overloaded/.test(facts.title), facts.title);
  check('the page declares its language', facts.lang === 'en');
  check('the page has a viewport tag', facts.viewport);
  check('there is exactly one h1', facts.h1s === 1);
  check('every expected element exists', facts.ids);
  check('every input and select has a label', facts.fieldsWithoutLabel.length === 0, facts.fieldsWithoutLabel.join(','));
  check('every button has text', facts.buttonsWithoutText === 0);
  check('the table section is hidden until there is a table', facts.tableHiddenAtStart);
  check('the status line is a polite live region', facts.statusIsLive);
  check('the table warning banner is empty and hidden until there is something to warn about', facts.bannerHiddenAtStart);
  check('the table warning banner is a polite live region (a screen reader hears it without being interrupted)', facts.bannerIsLive);
  check('the name field stops at the 30-character rule', facts.nameMax === 30, String(facts.nameMax));
  check('four seats is the default', facts.seatOptions.includes('4:true') && facts.seatOptions.length === 3, facts.seatOptions.join(' '));
  check('the format choice offers exactly Commander (selected) and Standard', facts.formatOptions.join(' ') === 'commander=Commander:true standard=Standard:false', facts.formatOptions.join(' '));
  check('the Fan Content disclaimer is visible', facts.disclaimerVisible);
  for (const phrase of ['unofficial Fan Content', 'Fan Content Policy', 'Not approved/endorsed by Wizards', 'property of Wizards of the Coast']) check(`the disclaimer contains "${phrase}"`, facts.disclaimer.includes(phrase));
  check('the disclaimer does not use a Wizards or Magic logo or call the site by the trademarked name in its title', !/Magic: The Gathering/i.test(facts.title));
  check('buttons are at least 44 px tall', facts.buttonHeights.every((h) => h >= 44), facts.buttonHeights.join(','));
  check('nothing scrolls sideways at desktop width', !facts.scrollsSideways);
  check('headings go h1, four h2, two h3 inside the table (the players and your deck), then the closed popup\'s own h2', facts.headingOrder === 'H1,H2,H2,H2,H2,H3,H3,H2', facts.headingOrder);

  // ---- loading: nothing from anyone else, and nothing sent to the database yet ----
  const loadRequests = browser.events.filter((e) => e.method === 'Network.requestWillBeSent').map((e) => e.params.request.url);
  const thirdParty = loadRequests.filter((url) => !url.startsWith(ORIGIN) && !url.startsWith('data:'));
  check('loading the page contacts only this site (no third parties, no database)', thirdParty.length === 0, thirdParty.join(' '));
  check('the page has no console errors after loading', browser.logs.filter((l) => /^(exception|error)/.test(l)).length === 0, browser.logs.filter((l) => /^(exception|error)/.test(l)).join(' | '));

  // ---- messages for bad input: shown, in the error style, and with no network request ----
  browser.events.length = 0;
  const say = async () => ({ message: await text(browser, 'status'), error: await browser.eval(`document.getElementById('status').classList.contains('error')`) });
  const cases = [
    ['make table, empty name', async () => { await setValue(browser, 'name', ''); await click(browser, 'create'); }, /Type a name/],
    ['make table, 31-character name', async () => { await setValue(browser, 'name', 'x'.repeat(31)); await click(browser, 'create'); }, /30 characters/],
    ['join, short code', async () => { await setValue(browser, 'name', 'Kevin'); await setValue(browser, 'join-code', 'abc'); await click(browser, 'join'); }, /6 letters and digits/],
    ['join, code containing a zero', async () => { await setValue(browser, 'join-code', 'ABC230'); await click(browser, 'join'); }, /6 letters and digits/],
    ['join, empty code', async () => { await setValue(browser, 'join-code', ''); await click(browser, 'join'); }, /6 letters and digits/],
    ['join, good code, empty name', async () => { await setValue(browser, 'name', ''); await setValue(browser, 'join-code', 'ABC234'); await click(browser, 'join'); }, /Type a name/],
    ['join, name of only spaces', async () => { await setValue(browser, 'name', '    '); await click(browser, 'join'); }, /Type a name/],
    // Added in the 2026-10-28 edge-case pass (the characters are built from numbers so this file stays plain ASCII).
    ['make table, name of only zero-width spaces', async () => { await setValue(browser, 'name', String.fromCodePoint(0x200B, 0x200B, 0x200B)); await click(browser, 'create'); }, /Type a name/],
    ['join, name of only a right-to-left override', async () => { await setValue(browser, 'name', String.fromCodePoint(0x202E)); await setValue(browser, 'join-code', 'ABC234'); await click(browser, 'join'); }, /Type a name/],
    ['make table, 16 emoji (32 units, over the database limit)', async () => { await setValue(browser, 'name', String.fromCodePoint(0x1F40D).repeat(16)); await click(browser, 'create'); }, /emoji counts as two/],
    // Added 2026-10-30: a format the page does not offer (someone changed the page's own form) is refused before any request.
    ['make table, a format that is not offered', async () => {
      await setValue(browser, 'name', 'Kevin');
      await browser.eval(`(() => { const select = document.getElementById('format'); select.add(new Option('Modern', 'modern')); select.value = 'modern'; })()`);
      await click(browser, 'create');
    }, /Commander, Standard/],
  ];
  for (const [label, act, expected] of cases) {
    await act(); await sleep(250);
    const { message, error } = await say();
    check(`${label}: shows a readable message`, expected.test(message), message);
    check(`${label}: uses the error style`, error);
  }
  await browser.eval(`document.getElementById('format').value = 'commander'`); // undo the made-up option for the steps below
  const requestsAfterBadInput = browser.events.filter((e) => e.method === 'Network.requestWillBeSent').map((e) => e.params.request.url).filter((u) => !u.startsWith('data:'));
  check('bad input sends no network request at all', requestsAfterBadInput.length === 0, requestsAfterBadInput.join(' '));
  check('the buttons are enabled again after each refusal', await browser.eval(`!document.getElementById('create').disabled && !document.getElementById('join').disabled`));

  // ---- pressing Enter in the code box joins (it should not need the mouse) ----
  await setValue(browser, 'name', 'Kevin'); await setValue(browser, 'join-code', 'abc');
  await browser.eval(`document.getElementById('status').textContent = ''`);
  await browser.eval(`document.getElementById('join-code').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
  await sleep(300);
  check('Enter in the code box tries to join (a short code gets the code message)', /6 letters and digits/.test(await text(browser, 'status')), await text(browser, 'status'));

  // ---- offline: a readable message, no hang, buttons usable again ----
  const offlineErrors = browser.logs.length;
  await browser.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await setValue(browser, 'name', 'Kevin');
  await browser.eval(`document.getElementById('status').textContent = ''`);
  await click(browser, 'create');
  const settled = await waitFor(async () => { const m = await text(browser, 'status'); return m && !/Making your table/.test(m) ? m : null; }, 25000, 100);
  check('offline: the page answers within 25 seconds instead of hanging', Boolean(settled), String(settled));
  check('offline: the message says the server cannot be reached, in plain words', /can.?t reach|connection|offline/i.test(settled ?? '') && !/Firebase|auth\//.test(settled ?? ''), String(settled));
  check('offline: the buttons are enabled again', await browser.eval(`!document.getElementById('create').disabled && !document.getElementById('join').disabled`));
  await browser.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  void offlineErrors;

  // ---- browser storage blocked (some privacy settings make it throw): the page must still load and work ----
  // Added in the 2026-10-28 edge-case pass: before this, reading the stored name threw at load and stopped the script.
  const blocked = await openBrowser('lobby-nostorage', { width: 1280, height: 800 });
  await blocked.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    const boom = () => { throw new DOMException('The operation is insecure.', 'SecurityError'); };
    Object.defineProperty(window, 'localStorage', { get: boom });
    Object.defineProperty(window, 'sessionStorage', { get: boom });
    Object.defineProperty(window, 'indexedDB', { get: boom });
  ` });
  await blocked.goto(PAGE);
  const blockedErrors = blocked.logs.filter((l) => /^(exception|error)/.test(l));
  check('storage blocked: the page loads with no script errors', blockedErrors.length === 0, blockedErrors.join(' | '));
  await setValue(blocked, 'name', ''); await click(blocked, 'create'); await sleep(300);
  check('storage blocked: the buttons still answer (an empty name gets its message)', /Type a name/.test(await text(blocked, 'status')), await text(blocked, 'status'));
  await setValue(blocked, 'name', 'Kevin'); await setValue(blocked, 'join-code', 'abc'); await click(blocked, 'join'); await sleep(300);
  check('storage blocked: a bad code gets its message, and saving the name did not get in the way', /6 letters and digits/.test(await text(blocked, 'status')), await text(blocked, 'status'));
  // A valid name and a valid code get past saving the name and reach the network step (offline, so nothing is sent
  // and no account is made): the message must be the plain "cannot reach the server" one, not a storage error.
  await blocked.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await setValue(blocked, 'name', 'Kevin'); await setValue(blocked, 'join-code', 'ABC234');
  await blocked.eval(`document.getElementById('status').textContent = ''`);
  await click(blocked, 'join');
  const blockedAnswer = await waitFor(async () => { const m = await text(blocked, 'status'); return m && !/Joining/.test(m) ? m : null; }, 25000, 100);
  check('storage blocked: a valid name and code get past saving the name and reach the network step', /can.?t reach|connection|offline/i.test(blockedAnswer ?? ''), String(blockedAnswer));
  await blocked.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  // (Chrome logs one resource error because this step cut the network on purpose; that message is expected here.)
  const leftover = blocked.logs.filter((l) => /^(exception|error)/.test(l) && !/ERR_INTERNET_DISCONNECTED/.test(l));
  check('storage blocked: no leftover error after using the page', leftover.length === 0, leftover.join(' | '));

  if (process.argv.includes('--screenshot')) {
    await browser.screenshot('scratch-lobby-ui.png');
    // A real table needs the database, so this shows the table section with made-up text, only to look at the layout.
    await browser.eval(`(() => { document.getElementById('format').value = 'standard'; document.getElementById('table').hidden = false;
      document.getElementById('code').textContent = 'ABC234'; document.getElementById('seat').textContent = '1';
      document.getElementById('table-format').textContent = 'Standard'; document.getElementById('table').scrollIntoView(); })()`);
    await sleep(200);
    await browser.screenshot('scratch-lobby-ui-table.png');
  }
} catch (error) {
  failures.push('the check script itself ran without an error: ' + error.message);
  console.log('FAIL  the check script itself ran without an error:', error.message);
} finally {
  await closeAllBrowsers();
  if (server) await server.close();
}

if (failures.length) { console.log(`\n${checks - failures.length} of ${checks} lobby page checks passed. FAILED: ${failures.join('; ')}`); process.exit(1); }
console.log(`All ${checks} lobby page checks passed.`);
