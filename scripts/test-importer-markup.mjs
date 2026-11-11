// The deck manager (frontend/src/deck-importer.js) is used by two pages, the /deck page and the lobby's table screen. It builds its own markup inside the element it is given, so the two
// pages cannot drift apart. This checks the parts that are still written by hand: each page has the element to build in and the card picture box, no id the manager creates is also an id
// on either page (two elements with one id would break both), and every id the manager looks up is one it creates.
import { readFileSync } from 'node:fs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const check = (label, condition, detail = '') => { checks++; if (!condition) fail(label, detail); };

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const idsIn = (html) => [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);

const importer = read('frontend/src/deck-importer.js');
const deckPage = read('frontend/pages/deck/index.html');
const lobbyPage = read('frontend/pages/lobby/index.html');
const deckIds = idsIn(deckPage);
const lobbyIds = idsIn(lobbyPage);

// the ids the manager creates: button('id', ...), field('id', ...), and element.id = 'id'
const created = new Set([...importer.matchAll(/\b(?:button|field)\('([a-z0-9-]+)'/g)].map((m) => m[1]).concat([...importer.matchAll(/\.id = '([a-z0-9-]+)'/g)].map((m) => m[1])));
check('the manager creates a believable number of ids (so the patterns above really read them)', created.size > 30, String(created.size));

// the ids it looks up by name: $('name')
const used = new Set([...importer.matchAll(/\$\('([a-z0-9-]+)'\)/g)].map((m) => m[1]));
check('the manager looks up a believable number of ids', used.size > 25, String(used.size));
for (const id of used) check(`#${id}, which the manager looks up, is one it creates`, created.has(id), id);

for (const [name, ids] of [['deck page', deckIds], ['lobby page', lobbyIds]]) {
  check(`the ${name} has the element the manager builds in, #deck-app`, ids.includes('deck-app'));
  check(`the ${name} has the card picture box`, ['card-peek', 'card-peek-image', 'card-peek-note'].every((id) => ids.includes(id)));
  check(`no id appears twice on the ${name}`, ids.filter((id, i) => ids.indexOf(id) !== i).length === 0, ids.filter((id, i) => ids.indexOf(id) !== i).join(', '));
  const clashes = [...created].filter((id) => ids.includes(id));
  check(`no id the manager creates is also written by hand on the ${name}`, clashes.length === 0, clashes.join(', '));
}
check('the deck page has no Back link of its own (the site header has the Lobby link) and the importer no longer looks for one', !deckIds.includes('back') && !/getElementById\('back'\)/.test(importer));
check('the lobby panel that holds the manager is #deck-importer, hidden until opened', /<section id="deck-importer"[^>]*hidden>\s*<div id="deck-app"><\/div>/.test(lobbyPage));
check('the lobby mounts it without the Play solo button (the table has its own deck)', /mountDeckImporter\(\{ root: \$\('deck-app'\), play: false,/.test(read('frontend/pages/lobby/lobby.js')));
check('the deck page mounts it into #deck-app', /mountDeckImporter\(\{ root: document\.getElementById\('deck-app'\)/.test(read('frontend/pages/deck/deck.js')));
check('the old copies of the markup are gone from both pages (no #deck-text, #sections or #saved-list written by hand)', !/id="(deck-text|sections|saved-list|commander-1)"/.test(deckPage + lobbyPage));

console.log(`All ${checks} importer markup checks passed.`);
