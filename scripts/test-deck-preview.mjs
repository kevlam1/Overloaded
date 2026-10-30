// Tests for shared/deck-preview.mjs: what the deck import page shows (merged lines, sections, problems, the commander
// guess, counts) and what it saves and reads back from the browser. The real exports and the real card fixture are used
// where they can be, hand-made cards where one case needs exact control. No browser, no network.
// Run: node scripts/test-deck-preview.mjs
import { readFileSync } from 'node:fs';
import { buildCardIndex, matchDeck, normalizeName } from '../shared/card-match.mjs';
import { parseDeckText, MAX_CHARS, MAX_CARDS } from '../shared/deck-text.mjs';
import { SECTIONS, SECTION_TITLES, DECK_NAME_MAX, MAX_COMMANDERS, MAX_NOTICES, SAVED_VERSION, isLegendaryCreature, describeNotices, guessCommander, makePreview, cleanDeckName, buildSavedDeck, serializeDeck, readSavedDeck } from '../shared/deck-preview.mjs';
import { ARCHIDEKT, MOXFIELD_FOR_MOXFIELD, MOXFIELD_PLAIN } from './fixtures/exports.mjs';

let checks = 0;
function check(label, condition, detail = '') {
  checks++;
  if (!condition) { console.error(`FAILED: ${label} ${detail}`); process.exit(1); }
}
const same = (label, actual, expected) => check(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

const fixture = JSON.parse(readFileSync(new URL('./fixtures/cards-sample.json', import.meta.url), 'utf8')).cards;
const realIndex = buildCardIndex(fixture);
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const card = (n, index, t = 'Creature') => ({ n, t, m: '{1}', k: [], i: uuid(index) });
function previewOf(text, cards, choices) {
  const index = cards ? buildCardIndex(cards) : realIndex;
  const parsed = parseDeckText(text);
  return makePreview(parsed, matchDeck(index, parsed.entries), choices);
}
const ZWSP = String.fromCodePoint(0x200B);

// ---- constants ----
same('the sections, in display order', SECTIONS, ['commander', 'companion', 'main', 'sideboard', 'maybeboard', 'unlabeled']);
check('every section has a title', SECTIONS.every((s) => typeof SECTION_TITLES[s] === 'string' && SECTION_TITLES[s].length > 0));
check('the limits are what the notes say', DECK_NAME_MAX === 60 && MAX_COMMANDERS === 2 && SAVED_VERSION === 1 && MAX_NOTICES === 10);

// ---- a card found by another title it was printed under ----
{
  const signet = { ...card('Arcane Signet', 501, 'Artifact'), f: ['Heart of the Mountain'] };
  const cards = [signet, card('Sol Ring', 502, 'Artifact'), { ...card('Twin A', 503), f: ['Shared Title'] }, { ...card('Twin B', 504), f: ['Shared Title'] }];
  const p = previewOf('2 Heart of the Mountain\n1 Sol Ring\n1 Arcane Signet', cards);
  const byName = Object.fromEntries(p.lines.map((l) => [l.name, l]));
  check('a card found by a title is shown by its real name and says what was typed', p.lines.length === 2 && byName['Arcane Signet'].viaTitle === 'Heart of the Mountain' && byName['Arcane Signet'].qty === 3 && byName['Arcane Signet'].status === 'matched', JSON.stringify(p.lines.map((l) => [l.name, l.qty, l.viaTitle])));
  check('a card found by its own name has no viaTitle', byName['Sol Ring'].viaTitle === null);
  check('the title match counts as matched (nothing needs attention)', p.counts.problem === 0 && p.problems.not_found.length === 0 && p.canSave);
  const own = previewOf('1 Arcane Signet\n1 Heart of the Mountain', cards);
  check('the same card typed both ways is one line, and the first spelling decides viaTitle', own.lines.length === 1 && own.lines[0].viaTitle === null && own.lines[0].qty === 2, JSON.stringify(own.lines.map((l) => [l.name, l.qty, l.viaTitle])));
  const ambiguous = previewOf('1 Shared Title', cards);
  check('a title two cards share is a choice to make, not a guess', ambiguous.problems.ambiguous.length === 1 && ambiguous.lines[0].card === null && ambiguous.lines[0].viaTitle === null);
  const chosen = previewOf('1 Shared Title', cards, { [normalizeName('Shared Title')]: uuid(504) });
  check('once chosen, the line is the chosen card and remembers the title', chosen.lines[0].name === 'Twin B' && chosen.lines[0].viaTitle === 'Shared Title' && chosen.problems.ambiguous.length === 0);
  const saved = buildSavedDeck(previewOf('2 Heart of the Mountain\n1 Sol Ring', cards), { name: 'Titles', text: '2 Heart of the Mountain\n1 Sol Ring', commanderIds: [] });
  check('a saved deck stores the real card (name and id), not the typed title, and has no viaTitle', saved.ok && saved.deck.cards.some((c) => c.n === 'Arcane Signet' && c.i === uuid(501) && c.qty === 2) && !JSON.stringify(saved.deck.cards).includes('Heart of the Mountain') && !JSON.stringify(saved.deck.cards).includes('viaTitle'), JSON.stringify(saved));
}

// ---- isLegendaryCreature ----
const dash = String.fromCharCode(0x2014);
check('a legendary creature', isLegendaryCreature({ t: `Legendary Creature ${dash} Human Noble` }));
check('a legendary artifact creature', isLegendaryCreature({ t: `Legendary Artifact Creature ${dash} Spider Hero` }));
check('a non-legendary creature is not', !isLegendaryCreature({ t: `Creature ${dash} Human` }));
check('a legendary artifact that is not a creature is not', !isLegendaryCreature({ t: 'Legendary Artifact' }));
check('a legendary enchantment (a Background) is not', !isLegendaryCreature({ t: `Legendary Enchantment ${dash} Background` }));
check('a two-faced card counts by its front face', isLegendaryCreature({ t: `Legendary Creature ${dash} Elder // Legendary Creature ${dash} Dragon` }));
check('a two-faced card whose only legendary creature is the back face is not', !isLegendaryCreature({ t: `Creature ${dash} Human // Legendary Creature ${dash} Dragon` }));
check('a two-faced card with a non-creature front and a legendary creature back is not (the front has no subtype to cut at)', !isLegendaryCreature({ t: `Legendary Artifact // Legendary Creature ${dash} Dragon` }));
check('a creature type that says Legendary in the subtypes does not count', !isLegendaryCreature({ t: `Creature ${dash} Legendary Hero` }));
check('a missing card or type line is not', !isLegendaryCreature(null) && !isLegendaryCreature({}) && !isLegendaryCreature({ t: null }));

// ---- describeNotices ----
same('no problems, no notices', describeNotices({ errors: [], warnings: [] }), []);
same('too long', describeNotices({ errors: [{ code: 'too_long', limit: 100000 }], warnings: [] }), ['That is too long. The limit is 100,000 characters.']);
same('too many lines', describeNotices({ errors: [{ code: 'too_many_lines', limit: 1000 }], warnings: [] }), ['That has too many lines. The limit is 1,000.']);
same('too many cards', describeNotices({ errors: [{ code: 'too_many_cards', total: 250, limit: 200 }], warnings: [] }), ['That is 250 cards. The limit is 200 (main deck, sideboard, commander and companion together).']);
same('not text', describeNotices({ errors: [{ code: 'not_text' }], warnings: [] }), ['That is not text.']);
same('an unknown error is still said', describeNotices({ errors: [{ code: 'something_new' }], warnings: [] }), ['That could not be read.']);
same('a skipped line is quoted', describeNotices({ errors: [], warnings: [{ line: 4, text: 'Deck stats: 99', reason: 'not_a_card_line' }] }), ['Line 4 was skipped: "Deck stats: 99" is not a card line.']);
same('a zero quantity', describeNotices({ errors: [], warnings: [{ line: 2, text: '0 Island', reason: 'zero_quantity' }] }), ['Line 2 was skipped: the quantity is 0.']);
same('a header with no card', describeNotices({ errors: [], warnings: [{ line: 7, text: 'Commander', reason: 'header_without_card' }] }), ['Line 7 says "Commander" but no card follows it.']);
same('an unknown warning is still said', describeNotices({ errors: [], warnings: [{ line: 9, text: 'x', reason: 'new_reason' }] }), ['Line 9 was skipped.']);
{
  const many = Array.from({ length: 25 }, (_, n) => ({ line: n + 1, text: `junk ${n}`, reason: 'not_a_card_line' }));
  const notices = describeNotices({ errors: [], warnings: many });
  check('at most 10 skipped lines are listed, then a count of the rest', notices.length === 11 && notices[10] === '...and 15 more skipped lines.', JSON.stringify(notices.slice(9)));
  check('exactly 10 skipped lines are all listed, with no "more" line', describeNotices({ errors: [], warnings: many.slice(0, 10) }).length === 10);
}
check('typed text with markup is passed through as plain text (the page shows it with textContent)', describeNotices({ errors: [], warnings: [{ line: 1, text: '<img src=x onerror=alert(1)>', reason: 'not_a_card_line' }] })[0].includes('<img src=x onerror=alert(1)>'));

// ---- the three real exports ----
for (const [label, text, certainty, looksLikeCommander, sectionSummary] of [
  ['Moxfield "Copy for Moxfield"', MOXFIELD_FOR_MOXFIELD, 'legendary', false, 'main:9/18,sideboard:1/1'],
  ['Moxfield plain text', MOXFIELD_PLAIN, 'unlabeled', true, 'main:8/17,sideboard:1/1,unlabeled:1/1'],
  ['Archidekt text', ARCHIDEKT, 'legendary', false, 'main:10/19'],
]) {
  const p = previewOf(text);
  check(`${label}: every card matched, nothing to fix, can be saved`, p.counts.matched === 19 && p.counts.problem === 0 && p.canSave && p.notices.length === 0 && p.problems.not_found.length + p.problems.ambiguous.length + p.problems.suggestion.length === 0, JSON.stringify(p.counts));
  check(`${label}: sections`, p.sections.map((s) => `${s.key}:${s.lines.length}/${s.count}`).join() === sectionSummary, p.sections.map((s) => `${s.key}:${s.lines.length}/${s.count}`).join());
  check(`${label}: the guessed commander is Eowyn, certainty ${certainty}`, p.commander.certainty === certainty && p.commander.ids.length === 1 && fixture.find((c) => c.i === p.commander.ids[0]).n.startsWith(String.fromCharCode(0xC9) + 'owyn'));
  check(`${label}: ${looksLikeCommander ? 'looks' : 'does not look'} like a Commander deck`, p.commander.looksLikeCommander === looksLikeCommander);
}

// ---- merging repeated lines ----
{
  const p = previewOf('2 Forest\n3 Forest\n1 sol ring\n1 Sol Ring\nSIDEBOARD:\n1 Forest');
  const main = p.sections.find((s) => s.key === 'main');
  check('the same card typed on two lines is one line with the quantities added', main.lines.find((l) => l.name === 'Forest').qty === 5);
  check('the same card typed in two spellings is one line', main.lines.filter((l) => l.name === 'Sol Ring').length === 1 && main.lines.find((l) => l.name === 'Sol Ring').qty === 2);
  check('the same card in the sideboard stays its own line', p.sections.find((s) => s.key === 'sideboard').lines[0].qty === 1);
  check('the line shows the real card name, not the way it was typed', main.lines.some((l) => l.name === 'Sol Ring' && l.typed === 'sol ring'));
  check('lines keep the order they first appeared in', main.lines.map((l) => l.name).join() === 'Forest,Sol Ring');
  same('counts add up (5 Forest + 2 Sol Ring + 1 sideboard Forest = 8 cards on 3 lines)', [p.counts.cards, p.counts.unique, p.counts.matched, p.counts.problem], [8, 3, 8, 0]);
  const again = previewOf('2 Forest\n3 Forest\n1 sol ring\n1 Sol Ring\nSIDEBOARD:\n1 Forest');
  check('the same input gives the same preview', JSON.stringify(p) === JSON.stringify(again));
}

// ---- problems and choices ----
{
  const text = '1 Sol Ring\n1 B.F.M. (Big Furry Monster)\n1 Insectile Aberration\n2 Totally Fake Card\n1 totally fake card';
  const p = previewOf(text);
  check('a name that is not in the list is a problem, with both spellings merged', p.problems.not_found.length === 1 && p.problems.not_found[0].qty === 3 && p.problems.not_found[0].typed === 'Totally Fake Card');
  check('a name two cards share is ambiguous, with both candidates', p.problems.ambiguous.length === 1 && p.problems.ambiguous[0].candidates.length === 2);
  check('a back-face name is a suggestion, with the card it belongs to', p.problems.suggestion.length === 1 && p.problems.suggestion[0].candidates[0].n === 'Delver of Secrets // Insectile Aberration');
  check('problems count in the totals', p.counts.matched === 1 && p.counts.problem === 5 && p.counts.cards === 6, JSON.stringify(p.counts));
  check('a deck with something matched can be saved (the page asks first)', p.canSave);
  const amb = p.problems.ambiguous[0];
  const choose = (name, id) => ({ [normalizeName(name)]: id });
  const p2 = previewOf(text, null, choose('B.F.M. (Big Furry Monster)', amb.candidates[1].i));
  check('choosing one of the candidates settles an ambiguous name', p2.problems.ambiguous.length === 0 && p2.lines.find((l) => l.typed.startsWith('B.F.M.')).card.i === amb.candidates[1].i && p2.lines.find((l) => l.typed.startsWith('B.F.M.')).status === 'matched');
  const p3 = previewOf(text, null, choose('Insectile Aberration', p.problems.suggestion[0].candidates[0].i));
  check('accepting a "did you mean" settles a suggestion', p3.problems.suggestion.length === 0 && p3.lines.find((l) => l.typed === 'Insectile Aberration').card.n === 'Delver of Secrets // Insectile Aberration');
  const p4 = previewOf(text, null, choose('B.F.M. (Big Furry Monster)', uuid(424242)));
  check('a choice that is not one of the candidates is ignored', p4.problems.ambiguous.length === 1);
  const p5 = previewOf(text, null, choose('Totally Fake Card', amb.candidates[0].i));
  check('a choice for a name that was not found is ignored', p5.problems.not_found.length === 1);
  const p6 = previewOf(text, null, choose('Sol Ring', amb.candidates[0].i));
  check('a choice for a name that already matched changes nothing', p6.lines.find((l) => l.typed === 'Sol Ring').card.n === 'Sol Ring');
  const p7 = previewOf('1 Bind\n1 Bind // Liberate');
  check('Bind is the card Bind and Bind // Liberate is the other card (the whole name wins)', p7.counts.matched === 2 && p7.lines.length === 2);
}

// ---- counts: what is and is not counted ----
{
  const cards = Array.from({ length: 12 }, (_, n) => card(`Card ${String(n).padStart(2, '0')}`, n + 1));
  const p = previewOf('COMMANDER:\n1 Card 00\n\nDECK:\n4 Card 01\n3 Card 02\n\nSIDEBOARD:\n2 Card 03\n\nCOMPANION:\n1 Card 04\n\nMAYBEBOARD:\n5 Card 05', cards);
  check('the maybeboard is not in the card count', p.counts.cards === 11 && p.counts.unique === 5, JSON.stringify(p.counts));
  check('the deck size counts the main deck and the commander but not the sideboard or the companion', p.counts.deckSize === 8, String(p.counts.deckSize));
  check('the maybeboard still shows as a section, with its title saying it is not counted', p.sections.some((s) => s.key === 'maybeboard' && /not counted/.test(s.title)));
  const q = previewOf('1 Card 00\n2 Nothing Real\nMAYBEBOARD:\n3 Nothing Either', cards);
  check('a problem in the maybeboard does not count as a problem', q.counts.problem === 2 && q.counts.cards === 3);
}

// ---- the commander guess ----
{
  const dashes = (t) => t.replace('-', dash);
  const cards = [
    card('Alpha Soldier', 1, 'Creature - Human'), card('Beta Legend', 2, dashes('Legendary Creature - Elf')), card('Gamma Land', 3, 'Land'),
    card('Delta Legend', 4, dashes('Legendary Creature - Dwarf')), card('Epsilon Artifact', 5, 'Artifact'), card('Zeta Legend // Zeta Back', 6, dashes('Legendary Creature - Mage // Creature - Dragon')),
  ];
  const guess = (text) => { const p = previewOf(text, cards); return { certainty: p.commander.certainty, names: p.commander.ids.map((id) => cards.find((c) => c.i === id).n) }; };
  same('a Commander header wins over everything', guess('1 Alpha Soldier\n1 Beta Legend\nCOMMANDER:\n1 Gamma Land'), { certainty: 'marked', names: ['Gamma Land'] });
  same('a partner is a second Commander header', guess('COMMANDER:\n1 Beta Legend\nCOMMANDER:\n1 Delta Legend\n1 Alpha Soldier'), { certainty: 'marked', names: ['Beta Legend', 'Delta Legend'] });
  same('cards after a blank line (Moxfield plain text) come next', guess('1 Alpha Soldier\n1 Beta Legend\n\nSIDEBOARD:\n1 Gamma Land\n\n1 Epsilon Artifact'), { certainty: 'unlabeled', names: ['Epsilon Artifact'] });
  same('without a marker, the first legendary creature in the main deck', guess('1 Alpha Soldier\n1 Gamma Land\n1 Delta Legend\n1 Beta Legend'), { certainty: 'legendary', names: ['Delta Legend'] });
  same('a legendary creature in the sideboard is not chosen', guess('1 Alpha Soldier\nSIDEBOARD:\n1 Beta Legend'), { certainty: 'first', names: ['Alpha Soldier'] });
  same('a two-faced legendary creature is found by its front face', guess('1 Alpha Soldier\n1 Zeta Legend // Zeta Back'), { certainty: 'legendary', names: ['Zeta Legend // Zeta Back'] });
  same('with no legendary creature, the first main deck card, and it is called a guess', guess('SIDEBOARD:\n1 Epsilon Artifact\n\nDECK:\n1 Gamma Land\n1 Alpha Soldier'), { certainty: 'first', names: ['Gamma Land'] });
  same('nothing matched, nothing guessed', guess('1 Not A Card'), { certainty: null, names: [] });
  same('an ambiguous or missing card is never the commander', guess('COMMANDER:\n1 Nothing Real\n1 Alpha Soldier'), { certainty: 'first', names: ['Alpha Soldier'] });
  same('guessCommander on no lines', guessCommander([]), { certainty: null, ids: [] });
  // Does it look like a Commander deck? By the size, when no commander is marked: 98 to 102 counts.
  const big = Array.from({ length: 120 }, (_, n) => card(`Big ${String(n).padStart(3, '0')}`, 100 + n));
  const sizeOf = (n) => previewOf(Array.from({ length: n }, (_, k) => `1 Big ${String(k).padStart(3, '0')}`).join('\n'), big).commander.looksLikeCommander;
  check('97 cards does not look like a Commander deck', !sizeOf(97));
  check('98 cards looks like one', sizeOf(98));
  check('100 cards looks like one', sizeOf(100));
  check('102 cards looks like one', sizeOf(102));
  check('103 cards does not', !sizeOf(103));
}

// ---- bad input ----
{
  const refusal = (parsed, matched) => { try { makePreview(parsed, matched); return null; } catch (error) { return error.message; } };
  const MESSAGE = 'The parsed deck and its matches do not line up.';
  check('a parse and a match that do not line up are refused with a clear message', refusal(parseDeckText('1 Sol Ring'), { results: [] }) === MESSAGE);
  check('so is nothing at all', refusal(null, null) === MESSAGE && refusal(undefined, undefined) === MESSAGE);
  check('so is a parse with no match, or a match with no parse', refusal(parseDeckText('1 Sol Ring'), null) === MESSAGE && refusal(null, { results: [] }) === MESSAGE);
  const p = previewOf('x'.repeat(MAX_CHARS + 1));
  check('text that is too long gives a notice and nothing to save', p.notices.length === 1 && !p.canSave && p.sections.length === 0);
  const q = previewOf('');
  check('an empty paste has nothing to save', !q.canSave && q.counts.cards === 0);
  const r = previewOf(`${MAX_CARDS + 1} Forest`);
  check('too many cards: it can be seen, but not saved', r.counts.cards === MAX_CARDS + 1 && !r.canSave && r.notices.length === 1);
  const s = previewOf('1 Nothing Real\n1 Also Fake');
  check('nothing matched: nothing to save', !s.canSave && s.counts.problem === 2);
}

// ---- cleanDeckName ----
check('a plain name', cleanDeckName('Eowyn Tokens') === 'Eowyn Tokens');
check('spaces are trimmed and collapsed', cleanDeckName('  Mono   Red  ') === 'Mono Red');
check('invisible characters are removed', cleanDeckName(`Mono${ZWSP} Red`) === 'Mono Red');
check('accents are put in one standard form', cleanDeckName('Café Deck') === 'Café Deck'.normalize('NFC'));
check('60 characters is allowed', cleanDeckName('a'.repeat(60)).length === 60);
for (const [label, input] of [['61 characters', 'a'.repeat(61)], ['nothing', ''], ['only spaces', '    '], ['only invisible characters', `${ZWSP}${ZWSP}`], ['undefined', undefined], ['null', null]]) {
  let message = null;
  try { cleanDeckName(input); } catch (error) { message = error.message; }
  check(`${label} is refused with a message for people`, typeof message === 'string' && message.length > 0, String(message));
}
check('emoji count as one character each, so 60 emoji fit', (() => { try { return [...cleanDeckName('\u{1F600}'.repeat(60))].length === 60; } catch { return false; } })());
check('a name that is only combining marks is refused', (() => { try { cleanDeckName('́̂'); return false; } catch { return true; } })());

// ---- buildSavedDeck ----
const NOW = Date.UTC(2026, 9, 29, 12, 0, 0);
const savedOf = (text, options = {}, cards = null, choices) => { const p = previewOf(text, cards, choices); return buildSavedDeck(p, { name: 'Test Deck', text, now: NOW, ...options }); };
{
  const ok = savedOf(MOXFIELD_FOR_MOXFIELD);
  check('a real export saves', ok.ok && ok.deck.cards.reduce((n, c) => n + c.qty, 0) === 19 && ok.deck.skipped === 0 && ok.deck.name === 'Test Deck');
  check('the saved deck carries its version, the time it was saved and the text pasted', ok.deck.version === 1 && ok.deck.savedAt === new Date(NOW).toISOString() && ok.deck.text === MOXFIELD_FOR_MOXFIELD);
  check('with no commander chosen there is none', ok.deck.commander.length === 0 && !ok.deck.cards.some((c) => c.section === 'commander'));
  check('cards are saved with their id, name, quantity and section', ok.deck.cards.every((c) => /^[0-9a-f-]{36}$/.test(c.i) && c.n && c.qty >= 1 && ['main', 'sideboard'].includes(c.section)));
  check('the same deck always saves in the same order and bytes', serializeDeck(ok.deck) === serializeDeck(savedOf(MOXFIELD_FOR_MOXFIELD).deck));
  check('the order is by section, then by name', (() => { const order = ['commander', 'companion', 'main', 'sideboard']; const cs = ok.deck.cards; return cs.every((c, i) => i === 0 || order.indexOf(cs[i - 1].section) < order.indexOf(c.section) || (cs[i - 1].section === c.section && cs[i - 1].n <= c.n)); })());
  const eowyn = fixture.find((c) => c.n.startsWith(String.fromCharCode(0xC9) + 'owyn')).i;
  const withCommander = savedOf(MOXFIELD_FOR_MOXFIELD, { commanderIds: [eowyn] });
  check('choosing a commander moves one copy of it to the commander section', withCommander.ok && withCommander.deck.commander[0] === eowyn && withCommander.deck.cards.find((c) => c.section === 'commander').i === eowyn && withCommander.deck.cards.find((c) => c.section === 'commander').qty === 1);
  check('and it is no longer also in the main deck when there was one copy', !withCommander.deck.cards.some((c) => c.section === 'main' && c.i === eowyn));
  check('the total number of cards does not change', withCommander.deck.cards.reduce((n, c) => n + c.qty, 0) === 19);
  const forest = fixture.find((c) => c.n === 'Forest').i;
  const forestCommander = savedOf('10 Forest\n1 Sol Ring', { commanderIds: [forest] });
  check('with several copies, one becomes the commander and the rest stay', forestCommander.ok && forestCommander.deck.cards.find((c) => c.section === 'main' && c.i === forest).qty === 9 && forestCommander.deck.cards.find((c) => c.section === 'commander').qty === 1);
  const unlabeled = savedOf(MOXFIELD_PLAIN);
  check('cards after a blank line are saved in the main deck', unlabeled.ok && !unlabeled.deck.cards.some((c) => c.section === 'unlabeled') && unlabeled.deck.cards.reduce((n, c) => n + c.qty, 0) === 19);
  const partner = savedOf('1 Sol Ring\n1 Forest\n1 Lightning Bolt', { commanderIds: [fixture.find((c) => c.n === 'Sol Ring').i, forest] });
  check('two commanders (a partner) are allowed', partner.ok && partner.deck.commander.length === 2 && partner.deck.cards.filter((c) => c.section === 'commander').length === 2);
  check('three commanders are not', !savedOf('1 Sol Ring\n1 Forest\n1 Lightning Bolt', { commanderIds: [fixture.find((c) => c.n === 'Sol Ring').i, forest, fixture.find((c) => c.n === 'Lightning Bolt').i] }).ok);
  const twice = savedOf('2 Forest', { commanderIds: [forest, forest] });
  check('the same commander twice is not, and the message says what to do', !twice.ok && /two different cards/.test(twice.error), twice.error);
  const three = savedOf('1 Sol Ring\n1 Forest\n1 Lightning Bolt', { commanderIds: [fixture.find((c) => c.n === 'Sol Ring').i, forest, fixture.find((c) => c.n === 'Lightning Bolt').i] });
  check('three commanders get the message about the limit', !three.ok && /at most 2 commanders/.test(three.error), three.error);
  const notInDeck = savedOf('1 Sol Ring', { commanderIds: [forest] });
  check('a commander that is not in the deck is refused', !notInDeck.ok && /not in the deck/.test(notInDeck.error));
  const marked = savedOf('COMMANDER:\n1 Sol Ring\n\nDECK:\n1 Forest\n1 Lightning Bolt', { commanderIds: [forest] });
  check('a card marked as commander in the list but not chosen goes back to the main deck', marked.ok && marked.deck.commander[0] === forest && marked.deck.cards.find((c) => c.i === fixture.find((x) => x.n === 'Sol Ring').i).section === 'main' && marked.deck.cards.filter((c) => c.section === 'commander').length === 1);
  const none = savedOf('COMMANDER:\n1 Sol Ring\n\nDECK:\n1 Forest', { commanderIds: [] });
  check('choosing no commander puts a marked one back in the main deck', none.ok && none.deck.cards.every((c) => c.section === 'main'));
  const keep = savedOf('COMMANDER:\n1 Sol Ring\n\nDECK:\n1 Forest', { commanderIds: [fixture.find((c) => c.n === 'Sol Ring').i] });
  check('choosing the card the list marked keeps it as the commander', keep.ok && keep.deck.cards.find((c) => c.section === 'commander').n === 'Sol Ring' && keep.deck.cards.filter((c) => c.section === 'commander').length === 1);
  const maybe = savedOf('1 Sol Ring\nMAYBEBOARD:\n1 Forest');
  check('the maybeboard is not saved', maybe.ok && maybe.deck.cards.length === 1);
  check('a companion and a sideboard are saved', savedOf('1 Sol Ring\nSIDEBOARD:\n1 Forest\nCOMPANION:\n1 Lightning Bolt').deck.cards.map((c) => c.section).sort().join() === 'companion,main,sideboard');
  const missing = savedOf('1 Sol Ring\n1 Nothing Real\n1 Nothing Else');
  check('unmatched lines stop the save, and the message counts them', !missing.ok && /2 lines are not matched/.test(missing.error), missing.error);
  check('one unmatched line is said in the singular', /1 line is not matched/.test(savedOf('1 Sol Ring\n1 Nothing Real').error));
  const allowed = savedOf('1 Sol Ring\n1 Nothing Real\n1 Nothing Else', { allowMissing: true });
  check('with permission they are left out and counted', allowed.ok && allowed.deck.skipped === 2 && allowed.deck.cards.length === 1);
  check('an unmatched line in the maybeboard does not stop the save', savedOf('1 Sol Ring\nMAYBEBOARD:\n1 Nothing Real').ok);
  check('nothing matched cannot be saved even with permission', !savedOf('1 Nothing Real', { allowMissing: true }).ok);
  check('a bad name stops the save with its message', savedOf('1 Sol Ring', { name: '   ' }).error === 'Give the deck a name first.');
  check('a long text is cut to the limit, never refused', savedOf('1 Sol Ring', { text: 'x'.repeat(MAX_CHARS + 500) }).deck.text.length === MAX_CHARS);
  const choice = savedOf('1 B.F.M. (Big Furry Monster)', {}, null, { [normalizeName('B.F.M. (Big Furry Monster)')]: previewOf('1 B.F.M. (Big Furry Monster)').problems.ambiguous[0].candidates[0].i });
  check('a card the player chose is saved like any matched card', choice.ok && choice.deck.cards.length === 1);
  check('an unresolved ambiguous name stops the save', !savedOf('1 B.F.M. (Big Furry Monster)').ok);
}

// ---- readSavedDeck: what comes back out of the browser's storage ----
{
  const deck = savedOf(MOXFIELD_FOR_MOXFIELD, { commanderIds: [fixture.find((c) => c.n.startsWith(String.fromCharCode(0xC9) + 'owyn')).i] }).deck;
  const raw = serializeDeck(deck);
  same('a saved deck reads back exactly as it was saved', readSavedDeck(raw), deck);
  // The saved cards are sorted with the commander first, so the order is reversed here: a change to "the first card" then
  // hits a card that is NOT the commander, and the reader has to refuse it for the reason being tested, not because the
  // commander was damaged.
  const edit = (change) => { const copy = JSON.parse(raw); copy.cards.reverse(); change(copy); return readSavedDeck(JSON.stringify(copy)); };
  check('not JSON is refused', readSavedDeck('{ nope') === null && readSavedDeck('') === null && readSavedDeck(null) === null && readSavedDeck(undefined) === null);
  check('JSON that is not a deck is refused', readSavedDeck('null') === null && readSavedDeck('[]') === null && readSavedDeck('5') === null && readSavedDeck('"deck"') === null && readSavedDeck('{}') === null);
  const bad = [
    ['another version', (d) => { d.version = 2; }], ['no version', (d) => { delete d.version; }],
    ['a name that is not text', (d) => { d.name = 5; }], ['an empty name', (d) => { d.name = ''; }], ['a name with an invisible character', (d) => { d.name = `A${ZWSP}B`; }],
    ['a name with a double space', (d) => { d.name = 'A  B'; }], ['a name over 60 characters', (d) => { d.name = 'a'.repeat(61); }], ['a name with spaces around it', (d) => { d.name = ' A '; }],
    ['a bad date', (d) => { d.savedAt = 'last tuesday'; }], ['a date that is a number', (d) => { d.savedAt = 5; }],
    ['no cards (and no commander either, so only the empty list is wrong)', (d) => { d.cards = []; d.commander = []; }], ['cards that are not a list', (d) => { d.cards = {}; }], ['a card that is null', (d) => { d.cards[0] = null; }],
    ['a card id that is not an id', (d) => { d.cards[0].i = 'abc'; }], ['an uppercase id', (d) => { d.cards[0].i = d.cards[0].i.toUpperCase().replace(/[0-9]/g, 'A'); }], ['an id with text around it', (d) => { d.cards[0].i = `x${d.cards[0].i}`; }],
    ['a card name that is not text', (d) => { d.cards[0].n = 7; }], ['an empty card name', (d) => { d.cards[0].n = ''; }], ['a card name of 201 characters', (d) => { d.cards[0].n = 'a'.repeat(201); }],
    ['a quantity of 0', (d) => { d.cards[0].qty = 0; }], ['a negative quantity', (d) => { d.cards[0].qty = -1; }], ['a quantity with a fraction', (d) => { d.cards[0].qty = 1.5; }], ['a quantity over 200', (d) => { d.cards[0].qty = 201; }], ['a quantity that is text', (d) => { d.cards[0].qty = '2'; }],
    ['an unknown section', (d) => { d.cards[0].section = 'graveyard'; }], ['the unlabeled section (it is not saved)', (d) => { d.cards[0].section = 'unlabeled'; }], ['the maybeboard (it is not saved)', (d) => { d.cards[0].section = 'maybeboard'; }],
    ['the same card twice in a section', (d) => { d.cards.push({ ...d.cards[1] }); }],
    ['more than 200 cards in all', (d) => { d.cards[1].qty = 200; }],
    ['commanders that are text', (d) => { d.commander = 'x'; }], ['commanders that are an object', (d) => { d.commander = {}; }], ['commanders that are a number', (d) => { d.commander = 5; }], ['commanders that are null', (d) => { d.commander = null; }],
    ['three commanders, all really in the commander section', (d) => { const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333']; d.commander = ids; for (const i of ids) d.cards.push({ i, n: `C ${i[0]}`, qty: 1, section: 'commander' }); }], ['a commander that is not in the commander section', (d) => { d.commander = [d.cards.find((c) => c.section === 'main').i]; }],
    ['a skipped count with a fraction', (d) => { d.skipped = 1.5; }], ['a negative skipped count', (d) => { d.skipped = -1; }], ['no skipped count', (d) => { delete d.skipped; }],
    ['text that is not text', (d) => { d.text = 5; }], ['text over the limit', (d) => { d.text = 'x'.repeat(MAX_CHARS + 1); }], ['no text', (d) => { delete d.text; }],
  ];
  for (const [label, change] of bad) check(`reading refuses ${label}`, edit(change) === null);
  const extra = edit((d) => { d.extra = 'hello'; d.cards[0].evil = true; d.__proto__ = { x: 1 }; });
  check('extra fields added by hand are dropped, not passed on', extra !== null && !('extra' in extra) && !('evil' in extra.cards[0]));
  check('a commander-only deck of one card reads fine', readSavedDeck(serializeDeck(savedOf('1 Sol Ring', { commanderIds: [fixture.find((c) => c.n === 'Sol Ring').i] }).deck)) !== null);
  check('the notes, not the text, decide what a deck is: an old text does not change the cards', (() => { const copy = JSON.parse(raw); copy.text = 'completely different'; return readSavedDeck(JSON.stringify(copy)).cards.length === deck.cards.length; })());
}

console.log(`All ${checks} deck preview checks passed.`);
