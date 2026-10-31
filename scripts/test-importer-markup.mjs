// The deck importer (frontend/src/deck-importer.js) is used by two pages that each hold its markup: the /deck page and the lobby's
// table screen. This checks that every element id the importer reaches for exists on both, so a change to one page cannot quietly
// break the other. (The lobby's message line is #importer-status, passed to the importer as statusId; the deck page's is #status.)
import { readFileSync } from 'node:fs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const check = (label, condition, detail = '') => { checks++; if (!condition) fail(label, detail); };

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const idsIn = (html) => new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));

const importer = read('frontend/src/deck-importer.js');
const deckPage = read('frontend/pages/deck/index.html');
const lobbyPage = read('frontend/pages/lobby/index.html');

// the ids the importer looks up by name: $('name') (the message line is looked up through statusId, so it is added by hand)
const used = new Set([...importer.matchAll(/\$\('([a-z0-9-]+)'\)/g)].map((m) => m[1]));
check('the importer uses a believable number of ids (so the pattern above really read them)', used.size > 25, String(used.size));
check('the importer reads its pile and peek elements too (a literal id the pattern would miss is on the page)', ['sections', 'card-peek', 'card-peek-image', 'card-peek-note'].every((id) => used.has(id)));

// the lobby's copy lives in the panel from #deck-importer to the Ready button
const start = lobbyPage.indexOf('id="deck-importer"');
const end = lobbyPage.indexOf('id="ready"');
check('the lobby has the importer panel before the Ready button', start > 0 && end > start);
const lobbyPanelIds = idsIn(lobbyPage.slice(start, end));
const deckIds = idsIn(deckPage);

const needsEverywhere = [...used].filter((id) => id !== 'back'); // the back link exists on the deck page only (backLink: false in the lobby)
for (const id of needsEverywhere) {
  check(`the deck page has #${id}`, deckIds.has(id));
  check(`the lobby's importer panel has #${id}`, lobbyPanelIds.has(id) || (id === 'status' && lobbyPanelIds.has('importer-status')), id);
}
check('the deck page has its #back link', deckIds.has('back'));
check('the lobby panel has its own message line, #importer-status', lobbyPanelIds.has('importer-status'));
check('the importer takes the message line id as an option (so the lobby can pass its own)', /statusId: messageId = 'status'/.test(importer));
check('the lobby passes it', /statusId: 'importer-status'/.test(read('frontend/pages/lobby/lobby.js')));

// no id twice on the lobby page (the importer panel must not clash with the lobby's own elements)
const all = [...lobbyPage.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
const dupes = all.filter((id, i) => all.indexOf(id) !== i);
check('no id appears twice on the lobby page', dupes.length === 0, dupes.join(', '));
const allDeck = [...deckPage.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
check('no id appears twice on the deck page', allDeck.filter((id, i) => allDeck.indexOf(id) !== i).length === 0);

// the same elements in the same order is not required, but the controls a person uses must be real buttons or inputs in both
for (const id of ['check', 'clear', 'sample', 'save', 'retry']) {
  check(`#${id} is a button in both pages`, new RegExp(`<button id="${id}"`).test(deckPage) && new RegExp(`<button id="${id}"`).test(lobbyPage));
}
check('#deck-text is a textarea in both pages', /<textarea id="deck-text"/.test(deckPage) && /<textarea id="deck-text"/.test(lobbyPage));

console.log(`All ${checks} importer markup checks passed.`);
