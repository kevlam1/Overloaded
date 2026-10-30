// Tests for shared/deck-preview.mjs: what the deck import page shows (merged lines, sections, problems, the commander
// guess, counts) and what it saves and reads back from the browser. The real exports and the real card fixture are used
// where they can be, hand-made cards where one case needs exact control. No browser, no network.
// Run: node scripts/test-deck-preview.mjs
import { readFileSync } from 'node:fs';
import { buildCardIndex, matchDeck, normalizeName } from '../shared/card-match.mjs';
import { parseDeckText, MAX_CHARS, MAX_CARDS } from '../shared/deck-text.mjs';
import { SECTIONS, SECTION_TITLES, DECK_NAME_MAX, MAX_COMMANDERS, MAX_NOTICES, SAVED_VERSION, PRINTING_PROBLEM_WORDS, printingSetsNeeded, isLegendaryCreature, describeNotices, describePrintingProblems, guessCommander, makePreview, cleanDeckName, buildSavedDeck, serializeDeck, readSavedDeck } from '../shared/deck-preview.mjs';
import { printingValue } from '../shared/printings.mjs';
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

// ---- lines with no number (counted as 1, said once) ----
{
  const withLines = (...lines) => ({ errors: [], warnings: [], entries: [{ line: 1, qty: 1 }, ...lines.map((line) => ({ line, qty: 1, qtyAssumed: true }))] });
  same('one line with no number', describeNotices(withLines(3)), ['Line 3 has no number, so it was counted as 1 card.']);
  same('two lines', describeNotices(withLines(3, 7)), ['2 lines have no number, so each was counted as 1 card (lines 3 and 7).']);
  same('three lines', describeNotices(withLines(2, 4, 6)), ['3 lines have no number, so each was counted as 1 card (lines 2, 4 and 6).']);
  same('exactly five lines are all named', describeNotices(withLines(1, 2, 3, 4, 5)), ['5 lines have no number, so each was counted as 1 card (lines 1, 2, 3, 4 and 5).']);
  same('six lines name five and count the rest', describeNotices(withLines(1, 2, 3, 4, 5, 6)), ['6 lines have no number, so each was counted as 1 card (lines 1, 2, 3, 4, 5 and 1 more).']);
  same('twenty lines name five and count the rest', describeNotices(withLines(...Array.from({ length: 20 }, (_, n) => n + 1))), ['20 lines have no number, so each was counted as 1 card (lines 1, 2, 3, 4, 5 and 15 more).']);
  same('lines with a number say nothing', describeNotices({ errors: [], warnings: [], entries: [{ line: 1, qty: 2 }, { line: 2, qty: 1 }] }), []);
  same('it comes after the skipped-line notices', describeNotices({ errors: [], warnings: [{ line: 2, text: 'x', reason: 'not_a_card_line' }], entries: [{ line: 5, qty: 1, qtyAssumed: true }] }), ['Line 2 was skipped: "x" is not a card line.', 'Line 5 has no number, so it was counted as 1 card.']);
  const p = previewOf('Sol Ring\n1 Lightning Bolt\nCreatures (2)');
  check('a deck with a bare name previews as matched, with the count, the notice and the skipped heading', p.lines.length === 2 && p.lines.every((l) => l.status === 'matched' && l.qty === 1) && p.counts.cards === 2 && p.notices.length === 2 && /^Line 3 was skipped/.test(p.notices[0]) && p.notices[1] === 'Line 1 has no number, so it was counted as 1 card.', JSON.stringify(p.notices));
  const merged = previewOf('Sol Ring\n1 Sol Ring');
  check('a bare line and a numbered line for one card merge into 2', merged.lines.length === 1 && merged.lines[0].qty === 2);
}

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

// ---- the set code and number as typed (shown so printings can be debugged) ----
{
  const cards = [card('Sol Ring', 601, 'Artifact'), card('Island', 602, 'Basic Land')];
  const one = previewOf('1 Sol Ring (cmm) 410', cards);
  same('a typed set and number are kept, set in capitals', one.lines[0].printings, ['CMM 410']);
  same('a line with no set has none', previewOf('1 Sol Ring', cards).lines[0].printings, []);
  same('a foil mark does not change it', previewOf('1 Sol Ring (cmm) 410 *F*', cards).lines[0].printings, ['CMM 410']);
  same('a number with letters or a star stays as typed', previewOf('1 Island (sld) 916★', cards).lines[0].printings, ['SLD 916★']);
  const merged = previewOf('1 Island (znr) 266\n2 Island (znr) 266\n1 Island (sld) 916\n1 Island', cards);
  check('one card typed with several printings is one line that lists each printing once, in the order typed', merged.lines.length === 1 && merged.lines[0].qty === 5, JSON.stringify(merged.lines.map((l) => [l.qty, l.printings])));
  same('the merged printings', merged.lines[0].printings, ['ZNR 266', 'SLD 916']);
  same('a first line with no set still picks up a later one', previewOf('1 Island\n1 Island (znr) 266', cards).lines[0].printings, ['ZNR 266']);
  same('a card that was not found keeps what was typed', previewOf('1 Not A Card (cmm) 12', cards).lines[0].printings, ['CMM 12']);
  const saved = buildSavedDeck(previewOf('1 Sol Ring (cmm) 410', cards), { name: 'P', text: '1 Sol Ring (cmm) 410', commanderIds: [] });
  check('with no printing data given, the saved deck stores no printing and the typed text is not saved either', saved.ok && !JSON.stringify(saved.deck.cards).includes('CMM') && !JSON.stringify(saved.deck.cards).includes('printings') && saved.deck.cards.every((c) => !('p' in c)), JSON.stringify(saved));
}

// ---- exact printings: the set and number typed, found in the set's file ----
{
  const signet = { ...card('Arcane Signet', 701, 'Artifact'), f: ['Heart of the Mountain', 'Earth’s Mightiest Emblem'], fp: [uuid(801), uuid(802)] };
  const cards = [card('Sol Ring', 702, 'Artifact'), card('Island', 703, 'Basic Land'), signet, card('Lightning Bolt', 704, 'Instant')];
  const value = (id, name) => printingValue(uuid(id), name);
  const files = new Map([
    ['cmm', { 410: value(901, 'Sol Ring'), 703: value(902, 'Sol Ring'), 5: value(903, 'Island') }],
    ['sld', { 916: value(904, 'Arcane Signet') }],
    ['xyz', null], // a set we know has no data
  ]);
  const prev = (text, f = files, choices) => { const index = buildCardIndex(cards); const parsed = parseDeckText(text); return makePreview(parsed, matchDeck(index, parsed.entries), choices, f); };
  const row = (p, name, at = 0) => p.lines.filter((l) => l.name === name)[at];

  const exact = prev('1 Sol Ring (cmm) 410');
  check('a typed set and number gives that printing', exact.lines[0].printingId === uuid(901) && exact.lines[0].printingSource === 'set' && exact.lines[0].printingProblems.length === 0 && exact.notices.length === 0, JSON.stringify(exact.lines[0]));
  check('and the default card is still the card in the list', exact.lines[0].card.i === uuid(702));
  check('the set code is matched in lowercase and the number exactly', prev('1 Sol Ring (CMM) 410').lines[0].printingId === uuid(901) && prev('1 Sol Ring (cmm) 0410').lines[0].printingId === null);
  const two = prev('1 Sol Ring (cmm) 410\n1 Sol Ring (cmm) 703');
  check('two printings of one card are two rows, each one copy', two.lines.length === 2 && two.lines.every((l) => l.qty === 1) && [two.lines[0].printingId, two.lines[1].printingId].sort().join() === [uuid(901), uuid(902)].sort().join(), JSON.stringify(two.lines.map((l) => [l.qty, l.printingId])));
  const sameTwice = prev('1 Sol Ring (cmm) 410\n2 Sol Ring (cmm) 410');
  check('the same printing twice is one row', sameTwice.lines.length === 1 && sameTwice.lines[0].qty === 3 && sameTwice.lines[0].printings.join() === 'CMM 410');
  const mixed = prev('1 Sol Ring (cmm) 410\n1 Sol Ring');
  check('a printing and the default are separate rows', mixed.lines.length === 2 && mixed.lines.some((l) => l.printingId === null) && mixed.lines.some((l) => l.printingId === uuid(901)));
  check('the same printing in two sections stays in two rows', prev('1 Sol Ring (cmm) 410\n\nSIDEBOARD:\n1 Sol Ring (cmm) 410').lines.length === 2);
  same('the counts count the cards, not the rows', [two.counts.cards, two.counts.unique], [2, 2]);

  // Why a typed set and number is not used, and what is shown instead.
  const why = (text) => { const p = prev(text); return [p.lines[0].printingId, p.lines[0].printingSource, p.lines[0].printingProblems.map((x) => x.problem)]; };
  same('a number that is not in the set', why('1 Sol Ring (cmm) 999'), [null, null, ['not_in_set']]);
  same('a set we have no data for', why('1 Sol Ring (xyz) 1'), [null, null, ['set_missing']]);
  same('a set that was not loaded at all', why('1 Sol Ring (abc) 1'), [null, null, ['not_loaded']]);
  same('a number that is another card in that set', why('1 Island (cmm) 410'), [null, null, ['other_card']]);
  same('a number that is another card\'s printing (here an Island) is refused for a Lightning Bolt line too', why('1 Lightning Bolt (cmm) 5'), [null, null, ['other_card']]);
  const mergedProblem = prev('1 Sol Ring\n1 Sol Ring (cmm) 999');
  check('a typed printing that is not found joins the default row and says why', mergedProblem.lines.length === 1 && mergedProblem.lines[0].qty === 2 && mergedProblem.lines[0].printingProblems.length === 1 && mergedProblem.lines[0].printings.join() === 'CMM 999');
  check('a line that is not a card has no printing and no problem', (() => { const p = prev('1 Not A Card (cmm) 410'); return p.lines[0].printingId === null && p.lines[0].printingProblems.length === 0; })());
  check('a file that is not an object is a problem, not a crash', ['text', 5, [], undefined].every((bad) => { const p = prev('1 Sol Ring (cmm) 410', new Map([['cmm', bad]])); return p.lines[0].printingId === null && p.lines[0].printingProblems.length === 1; }));
  check('a number named like an object property is not found', ['toString', '__proto__', 'constructor', 'hasOwnProperty'].every((number) => prev(`1 Sol Ring (cmm) ${number}`).lines[0].printingId === null));
  check('null printing data leaves printings alone and says nothing', (() => { const p = prev('1 Sol Ring (cmm) 410', null); return p.lines[0].printingId === null && p.lines[0].printingProblems.length === 0 && p.notices.length === 0; })());

  // A card found by another title shows the printing that carries the title.
  const titled = prev('1 Heart of the Mountain');
  check('a title alone gives the printing that carries it', titled.lines[0].name === 'Arcane Signet' && titled.lines[0].printingId === uuid(801) && titled.lines[0].printingSource === 'title' && titled.lines[0].viaTitle === 'Heart of the Mountain', JSON.stringify(titled.lines[0]));
  check('another title of the same card gives its own printing', prev('1 Earth’s Mightiest Emblem').lines[0].printingId === uuid(802) && prev("1 Earth's Mightiest Emblem").lines[0].printingId === uuid(802));
  check('the real name has no title printing', prev('1 Arcane Signet').lines[0].printingId === null && prev('1 Arcane Signet').lines[0].printingSource === null);
  check('a title and a typed set and number: the set and number win', (() => { const p = prev('1 Heart of the Mountain (sld) 916'); return p.lines[0].printingId === uuid(904) && p.lines[0].printingSource === 'set'; })());
  check('a title and a set and number that is not found: the title printing, and the problem is said', (() => { const p = prev('1 Heart of the Mountain (sld) 999'); return p.lines[0].printingId === uuid(801) && p.lines[0].printingSource === 'title' && p.lines[0].printingProblems.length === 1; })());
  check('two titles of one card are two rows', prev('1 Heart of the Mountain\n1 Earth’s Mightiest Emblem').lines.length === 2);
  check('a title with no printing id (a list built before format 3) shows the default', (() => { const old = [{ ...signet, fp: undefined }]; const p = makePreview(parseDeckText('1 Heart of the Mountain'), matchDeck(buildCardIndex(old), parseDeckText('1 Heart of the Mountain').entries), {}, files); return p.lines[0].printingId === null && p.lines[0].viaTitle === 'Heart of the Mountain'; })());
  check('a printing id that is not an id is never used', (() => { const bad = [{ ...signet, fp: ['not-an-id', uuid(802)] }]; const p = makePreview(parseDeckText('1 Heart of the Mountain'), matchDeck(buildCardIndex(bad), parseDeckText('1 Heart of the Mountain').entries), {}, files); return p.lines[0].printingId === null; })());
  check('a title two cards share is a choice, and the chosen card then shows its own title printing', (() => {
    const twins = [{ ...card('Twin A', 711), f: ['Shared'], fp: [uuid(811)] }, { ...card('Twin B', 712), f: ['Shared'], fp: [uuid(812)] }];
    const parsed = parseDeckText('1 Shared');
    const matched = matchDeck(buildCardIndex(twins), parsed.entries);
    const before = makePreview(parsed, matched, {}, files);
    const after = makePreview(parsed, matched, { [normalizeName('Shared')]: uuid(712) }, files);
    return before.lines[0].printingId === null && after.lines[0].name === 'Twin B' && after.lines[0].printingId === uuid(812);
  })());

  // What the player is told.
  same('a not-found number is said once, with the default picture named', describePrintingProblems([{ typed: 'CMM 999', problem: 'not_in_set' }]), ['1 set and number was not found, so that card shows its default picture: CMM 999.']);
  same('several are counted and the first five are listed', describePrintingProblems(['A 1', 'B 2', 'C 3', 'D 4', 'E 5', 'F 6', 'G 7'].map((typed) => ({ typed, problem: 'set_missing' }))), ['7 sets and numbers were not found, so those cards show their default picture: A 1, B 2, C 3, D 4, E 5 and 2 more.']);
  same('the same one twice is said once, and counted once', describePrintingProblems([{ typed: 'CMM 999', problem: 'not_in_set' }, { typed: 'CMM 999', problem: 'not_in_set' }]), ['1 set and number was not found, so that card shows its default picture: CMM 999.']);
  same('the same typed text with two different reasons is still one notice',describePrintingProblems([{ typed: 'CMM 999', problem: 'not_in_set' }, { typed: 'CMM 999', problem: 'other_card' }]).length, 1);
  check('...and is counted as two', /^2 sets and numbers were not found/.test(describePrintingProblems([{ typed: 'CMM 999', problem: 'not_in_set' }, { typed: 'CMM 999', problem: 'other_card' }])[0]));

  // Which sets a deck needs: only those a card could use, once each, in the order typed.
  const setsFor = (text) => { const parsed = parseDeckText(text); return printingSetsNeeded(matchDeck(buildCardIndex(cards), parsed.entries).results); };
  same('the sets named on lines that are cards, once each, in the order typed', setsFor('1 Sol Ring (cmm) 410\n1 Island (znr) 266\n1 Arcane Signet (sld) 916\n1 Island (cmm) 5\n1 Lightning Bolt'), ['cmm', 'znr', 'sld']);
  same('a line that is not a card costs no download', setsFor('1 Not A Card (abc) 7\n1 Sol Ring (cmm) 410'), ['cmm']);
  same('a deck with no sets needs none', setsFor('1 Sol Ring\n2 Island'), []);
  same('the same set on many lines is one', setsFor('1 Sol Ring (cmm) 410\n1 Island (cmm) 5\n1 Arcane Signet (cmm) 367'), ['cmm']);
  same('a name that two cards share still needs its set (the player may choose)', printingSetsNeeded([{ entry: { set: 'cmm', number: '1' }, status: 'ambiguous' }, { entry: { set: 'sld', number: '2' }, status: 'suggestion' }]), ['cmm', 'sld']);
  same('a set with no number needs nothing, and nor does no set', printingSetsNeeded([{ entry: { set: 'cmm', number: null }, status: 'matched' }, { entry: { set: null, number: '5' }, status: 'matched' }, { entry: { set: 'cmm', number: '' }, status: 'matched' }]), []);
  same('no lines need none', printingSetsNeeded([]), []);
  same('data that could not be loaded is its own notice', describePrintingProblems([{ typed: 'CMM 1', problem: 'not_loaded' }, { typed: 'ABC 2', problem: 'not_loaded' }]), ['The printing data could not be loaded for 2 sets and numbers, so those cards show their default picture.']);
  same('nothing to say gives nothing', describePrintingProblems([]), []);
  check('the notices of a preview include them', prev('1 Sol Ring (cmm) 999').notices.some((n) => /not found, so that card shows/.test(n)) && prev('1 Sol Ring (abc) 1').notices.some((n) => /could not be loaded/.test(n)));
  check('every problem has words', ['not_loaded', 'set_missing', 'not_in_set', 'other_card'].every((k) => typeof PRINTING_PROBLEM_WORDS[k] === 'string' && PRINTING_PROBLEM_WORDS[k].length > 10) && Object.keys(PRINTING_PROBLEM_WORDS).length === 4);

  // The saved deck keeps the printing, and reads it back strictly.
  const body = '1 Sol Ring (cmm) 410\n1 Sol Ring (cmm) 703\n2 Sol Ring\n1 Heart of the Mountain\n1 Island (cmm) 5';
  const preview = prev(body);
  const made = buildSavedDeck(preview, { name: 'Printings', text: body, commanderIds: [] });
  const ring = (deck) => deck.cards.filter((c) => c.n === 'Sol Ring').map((c) => [c.qty, c.p ?? null]);
  check('the saved deck has one entry per printing, with its id', made.ok && JSON.stringify(ring(made.deck).sort()) === JSON.stringify([[1, uuid(901)], [1, uuid(902)], [2, null]].sort()), JSON.stringify(ring(made.deck)));
  check('a title printing is saved, and so is an Island printing', made.deck.cards.some((c) => c.n === 'Arcane Signet' && c.p === uuid(801)) && made.deck.cards.some((c) => c.n === 'Island' && c.p === uuid(903)));
  check('nothing else about the line is saved (not the typed text parts, the source or the problems)', !JSON.stringify(made.deck.cards).includes('printingSource') && !JSON.stringify(made.deck.cards).includes('printings') && !JSON.stringify(made.deck.cards).includes('CMM'));
  const back = readSavedDeck(serializeDeck(made.deck));
  same('it reads back exactly', back, made.deck);
  check('the order is fixed (the same deck saves the same way)', JSON.stringify(buildSavedDeck(prev(body), { name: 'Printings', text: body, commanderIds: [], now: Date.parse(made.deck.savedAt) }).deck) === JSON.stringify(made.deck));
  const withoutP = { ...made.deck, cards: made.deck.cards.filter((c) => !c.p) };
  check('a saved deck from before printings (no p anywhere) still reads', readSavedDeck(serializeDeck(withoutP)) !== null && readSavedDeck(serializeDeck(withoutP)).cards.every((c) => !('p' in c)));
  for (const [label, p] of [['a printing that is not an id', 'not-an-id'], ['an uppercase id', 'ABCDEF01-0000-4000-8000-000000000901'], ['a number', 5], ['null', null], ['an empty text', ''], ['an object', {}]]) {
    const broken = { ...made.deck, cards: made.deck.cards.map((c, i) => (i === 0 ? { ...c, p } : c)) };
    check(`${label} as a printing is refused`, readSavedDeck(serializeDeck(broken)) === null);
  }
  const duplicate = { ...made.deck, cards: [...made.deck.cards, { ...made.deck.cards.find((c) => c.p) }] };
  check('the same card and printing twice in a section is refused', readSavedDeck(serializeDeck(duplicate)) === null);
  const plainTwice = { ...made.deck, cards: [...withoutP.cards, { ...withoutP.cards[0] }] };
  check('the same card with no printing twice is still refused', readSavedDeck(serializeDeck(plainTwice)) === null);
  check('an extra field added by hand is dropped, p is kept', (() => { const extra = { ...made.deck, cards: made.deck.cards.map((c) => ({ ...c, evil: '<img src=x>' })) }; const r = readSavedDeck(serializeDeck(extra)); return r && r.cards.every((c) => !('evil' in c)) && r.cards.some((c) => c.p === uuid(901)); })());

  // The commander keeps the printing its line named.
  const cmdBody = 'Commander\n1 Sol Ring (cmm) 703\n\n1 Island (cmm) 5\n3 Island';
  const cmd = prev(cmdBody);
  const cmdDeck = buildSavedDeck(cmd, { name: 'C', text: cmdBody, commanderIds: [uuid(702)] });
  check('a commander chosen from a printing row keeps that printing', cmdDeck.ok && cmdDeck.deck.cards.filter((c) => c.section === 'commander').length === 1 && cmdDeck.deck.cards.find((c) => c.section === 'commander').p === uuid(902), JSON.stringify(cmdDeck.deck?.cards));
  check('a commander line with a printing does not leave a second copy behind', cmdDeck.deck.cards.filter((c) => c.n === 'Sol Ring').reduce((s, c) => s + c.qty, 0) === 1);
  check('and the saved deck reads back with the commander found', readSavedDeck(serializeDeck(cmdDeck.deck))?.commander.join() === uuid(702));
  const split = buildSavedDeck(prev('1 Sol Ring (cmm) 410\n1 Sol Ring (cmm) 703\n1 Sol Ring'), { name: 'S', text: '', commanderIds: [uuid(702)] });
  check('a commander taken from a card with several printings uses the first row and leaves the others', split.ok && split.deck.cards.filter((c) => c.section === 'commander').length === 1 && split.deck.cards.filter((c) => c.n === 'Sol Ring').reduce((s, c) => s + c.qty, 0) === 3, JSON.stringify(split.deck?.cards));
  const fromMain = buildSavedDeck(prev('1 Sol Ring (cmm) 410\n1 Island'), { name: 'M', text: '', commanderIds: [uuid(702)] });
  check('a commander chosen from a main deck line keeps the printing that line named', fromMain.ok && fromMain.deck.cards.find((c) => c.section === 'commander').p === uuid(901) && !fromMain.deck.cards.some((c) => c.n === 'Sol Ring' && c.section === 'main'), JSON.stringify(fromMain.deck?.cards));
  check('and with no printing named, the commander has none', (() => { const d = buildSavedDeck(prev('1 Sol Ring\n1 Island'), { name: 'M', text: '', commanderIds: [uuid(702)] }); return d.ok && !('p' in d.deck.cards.find((c) => c.section === 'commander')); })());
  const unchosen = buildSavedDeck(prev('Commander\n1 Sol Ring (cmm) 410\n\n1 Island'), { name: 'U', text: '', commanderIds: [] });
  check('a marked commander that the player did not choose goes back to the main deck with its printing', unchosen.ok && unchosen.deck.cards.find((c) => c.n === 'Sol Ring').section === 'main' && unchosen.deck.cards.find((c) => c.n === 'Sol Ring').p === uuid(901), JSON.stringify(unchosen.deck?.cards));
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
