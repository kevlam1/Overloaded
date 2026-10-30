// Checks shared/deck-text.mjs (pasted decklist text to entries) without a browser.
// Run it from the project folder: node scripts/test-deck-text.mjs
import assert from 'node:assert/strict'
import { MAX_CARDS, MAX_CHARS, MAX_LINES, parseDeckText } from '../shared/deck-text.mjs'

// Written as code points so no invisible character sits in this file.
const BOM = String.fromCharCode(0xfeff)
const NBSP = String.fromCharCode(0xa0)

// The three real exports Kevin pasted on 2026-10-26 (docs/deck-import.md), unchanged.
import { ARCHIDEKT, MOXFIELD_FOR_MOXFIELD, MOXFIELD_PLAIN } from './fixtures/exports.mjs'

const find = (result, name) => result.entries.find((e) => e.name === name)

// 1. "Copy for Moxfield": set and number kept, foil marker, the sideboard header, 19 cards.
const mox = parseDeckText(MOXFIELD_FOR_MOXFIELD)
assert.deepEqual(mox.errors, [])
assert.deepEqual(mox.warnings, [])
assert.equal(mox.entries.length, 10)
assert.equal(mox.total, 19)
assert.deepEqual(mox.counts, { main: 18, sideboard: 1 })
assert.deepEqual(find(mox, 'Kongming, "Sleeping Dragon"'), { qty: 1, name: 'Kongming, "Sleeping Dragon"', set: 'a25', number: '20', foil: true, section: 'main', line: 7, block: 0 })
assert.deepEqual(find(mox, 'Lightning Bolt'), { qty: 1, name: 'Lightning Bolt', set: 'sum', number: '162', foil: false, section: 'sideboard', line: 12, block: 1 }) // 9 cards, a blank line, SIDEBOARD: on line 11
assert.equal(find(mox, 'Bonecrusher Giant / Stomp').number, 'ELD-115') // The List numbers are kept exactly
assert.equal(find(mox, 'Bonecrusher Giant / Stomp').set, 'plst') // set codes come back lowercase
assert.equal(find(mox, 'Forest').qty, 10)
assert.equal(find(mox, 'Éowyn, Lady of Rohan').section, 'main') // top of the list: the parser does not guess commanders

// 2. Moxfield plain text: no set or number, and the commander after the blank line is unlabeled, not sideboard.
const plain = parseDeckText(MOXFIELD_PLAIN)
assert.deepEqual(plain.errors, [])
assert.equal(plain.total, 19)
assert.deepEqual(plain.counts, { main: 17, sideboard: 1, unlabeled: 1 })
assert.equal(find(plain, 'Fire/Ice').set, null)
assert.equal(find(plain, 'Fire/Ice').number, null)
assert.equal(find(plain, 'Lightning Bolt').section, 'sideboard')
assert.deepEqual(find(plain, 'Éowyn, Lady of Rohan'), { qty: 1, name: 'Éowyn, Lady of Rohan', set: null, number: null, foil: false, section: 'unlabeled', line: 13, block: 2 })

// 3. Archidekt: "1x", lowercase set codes, a foil marker, no sections at all (so the sideboard card is in main).
const archidekt = parseDeckText(ARCHIDEKT)
assert.deepEqual(archidekt.errors, [])
assert.deepEqual(archidekt.warnings, [])
assert.equal(archidekt.total, 19)
assert.deepEqual(archidekt.counts, { main: 19 })
assert.equal(find(archidekt, 'Forest').qty, 10)
assert.equal(find(archidekt, 'Lightning Bolt').foil, true)
assert.equal(find(archidekt, 'Lightning Bolt').number, '806')
assert.equal(find(archidekt, 'Jötun Grunt').number, 'CSP-8')
assert.equal(find(archidekt, 'Bonecrusher Giant // Stomp').set, 'clb')

// 4. All three exports describe the same 19 cards.
assert.equal(mox.total, archidekt.total)
assert.equal(plain.total, archidekt.total)

// 5. Windows and old Mac line endings, a byte order mark, non-breaking spaces from a web page copy, tabs and extra spaces.
const crlf = parseDeckText(`${BOM}1 Sol Ring\r\n1${NBSP}Forest (RTR) 274\r\n\r\nSideboard\r\n1 Lightning Bolt\r\n`)
assert.deepEqual(crlf.errors, [])
assert.deepEqual(crlf.entries.map((e) => [e.name, e.section]), [['Sol Ring', 'main'], ['Forest', 'main'], ['Lightning Bolt', 'sideboard']])
assert.equal(crlf.entries[1].set, 'rtr')
assert.equal(parseDeckText('1 Sol Ring\r1 Forest').entries.length, 2)
const spaced = parseDeckText('1\t  Sol   Ring  (CMM)   410  ')
assert.deepEqual(spaced.entries.map((e) => [e.name, e.set, e.number]), [['Sol Ring', 'cmm', '410']])
assert.equal(parseDeckText(`1 Sol${NBSP}Ring`).entries[0].name, 'Sol Ring')

// 6. Headers: any case, with or without a colon, and a blank line right after a header does not end it.
const headers = parseDeckText('Commander\n\n1 Sol Ring\n\nDECK:\n1 Forest\n\nsideboard\n1 Island\n\nMaybeboard\n1 Swamp')
assert.deepEqual(headers.entries.map((e) => [e.name, e.section]), [['Sol Ring', 'commander'], ['Forest', 'main'], ['Island', 'sideboard'], ['Swamp', 'maybeboard']])
assert.equal(headers.total, 3) // the maybeboard is not played, so it is not counted
assert.deepEqual(headers.counts, { commander: 1, main: 1, sideboard: 1, maybeboard: 1 })

// 7. A blank line in a list with no headers only starts a new block; cards stay main.
const blocks = parseDeckText('1 A\n1 B\n\n\n1 C')
assert.deepEqual(blocks.entries.map((e) => [e.name, e.section, e.block]), [['A', 'main', 0], ['B', 'main', 0], ['C', 'main', 1]])

// 8. Names with odd shapes still parse: parentheses, slashes, colons, and numbers with symbols.
assert.deepEqual(find(parseDeckText('1 B.F.M. (Big Furry Monster)'), 'B.F.M. (Big Furry Monster)').set, null)
const bfm = find(parseDeckText('1 B.F.M. (Big Furry Monster) (UGL) 28'), 'B.F.M. (Big Furry Monster)')
assert.equal(bfm.set, 'ugl')
assert.equal(bfm.number, '28')
assert.equal(parseDeckText('1 SP//dr, Piloted by Peni').entries[0].name, 'SP//dr, Piloted by Peni')
assert.equal(parseDeckText('2 Summon: Choco/Mog').entries[0].name, 'Summon: Choco/Mog')
assert.equal(parseDeckText('1 Some Card (SLD) 12★').entries[0].number, '12★')
assert.equal(parseDeckText('1 Sol Ring *F*').entries[0].foil, true)
assert.equal(parseDeckText('1 Sol Ring *F*').entries[0].name, 'Sol Ring')
assert.equal(parseDeckText('1 Xenagos, God of Revels').entries[0].name, 'Xenagos, God of Revels') // "x" after a space is part of the name

// 9. Lines that are not cards are reported with their line number, never dropped silently. A line with no number
// IS a card (count 1, marked qtyAssumed) unless it looks like a heading, a label or a comment (changed 2026-10-29 at
// Kevin's request: before this, a bare "Sol Ring" was skipped).
const junk = parseDeckText('1 Sol Ring\nCreatures (12)\n\nSol Ring\n0 Forest\n3 Island')
assert.deepEqual(junk.entries.map((e) => [e.name, e.qty, e.qtyAssumed ?? false]), [['Sol Ring', 1, false], ['Sol Ring', 1, true], ['Island', 3, false]])
assert.deepEqual(junk.warnings, [
  { line: 2, text: 'Creatures (12)', reason: 'not_a_card_line' },
  { line: 5, text: '0 Forest', reason: 'zero_quantity' },
])
assert.equal(junk.total, 5)
assert.equal(junk.entries[0].qtyAssumed, undefined) // the field is absent, not false, when a number was typed
assert.ok(!('qtyAssumed' in junk.entries[0]))

// 10. Limits: too many cards still returns the entries so the page can show them; huge input is refused.
const exact = parseDeckText(`${MAX_CARDS} Forest`)
assert.deepEqual(exact.errors, [])
const over = parseDeckText(`${MAX_CARDS + 1} Forest`)
assert.deepEqual(over.errors, [{ code: 'too_many_cards', total: MAX_CARDS + 1, limit: MAX_CARDS }])
assert.equal(over.entries.length, 1)
const spread = parseDeckText('100 Forest\n100 Island\n1 Swamp\nSideboard\n1 Sol Ring')
assert.equal(spread.total, 202) // main and sideboard count together
assert.equal(spread.errors[0].code, 'too_many_cards')
assert.deepEqual(parseDeckText('x'.repeat(MAX_CHARS + 1)).errors, [{ code: 'too_long', limit: MAX_CHARS }])
assert.deepEqual(parseDeckText('1 Forest\n'.repeat(MAX_LINES + 1)).errors, [{ code: 'too_many_lines', limit: MAX_LINES }])
assert.deepEqual(parseDeckText(undefined).errors, [{ code: 'not_text' }])
assert.deepEqual(parseDeckText(42).errors, [{ code: 'not_text' }])
assert.deepEqual(parseDeckText(''), { entries: [], warnings: [], errors: [], counts: {}, total: 0 })

// 11. A typed "Commander" or "Companion" line marks only the next card, then the parser goes back.
const sections = (text) => parseDeckText(text).entries.map((e) => `${e.name}:${e.section}`)
assert.deepEqual(sections('Commander\n1 A\n\n1 B\n1 C'), ['A:commander', 'B:main', 'C:main']) // the usual paste
assert.deepEqual(sections('1 B\n1 C\nCommander\n1 A\n1 D\n1 E'), ['B:main', 'C:main', 'A:commander', 'D:main', 'E:main']) // typed in the middle of the list
assert.deepEqual(sections('Commander\n1 A\n1 B\n1 C'), ['A:commander', 'B:main', 'C:main']) // typed above a whole pasted list
assert.deepEqual(sections('Commander\n1 A\nCommander\n1 B\n1 C'), ['A:commander', 'B:commander', 'C:main']) // a partner is a second line
assert.deepEqual(sections('Companion\n1 A\n1 B'), ['A:companion', 'B:main'])
assert.deepEqual(sections('Commander\n\n1 A\n1 B'), ['A:commander', 'B:main']) // a blank line right under the header is ignored
assert.deepEqual(sections('Sideboard\n1 X\n1 Y\n\nCommander\n1 A\n1 B'), ['X:sideboard', 'Y:sideboard', 'A:commander', 'B:unlabeled']) // after a blank line the old sideboard is over
assert.deepEqual(sections('Sideboard\n1 X\nCommander\n1 A\n1 Y'), ['X:sideboard', 'A:commander', 'Y:sideboard']) // no blank line: still the sideboard
assert.deepEqual(sections('Deck\n1 B\nCommander\n1 A\nSideboard\n1 X'), ['B:main', 'A:commander', 'X:sideboard'])
const typed = parseDeckText('Commander\n1 A\n\n1 B\n1 C')
assert.equal(typed.total, 3) // commanders count toward the 200 cap
assert.deepEqual(typed.counts, { commander: 1, main: 2 })
assert.deepEqual(typed.entries.map((e) => e.block), [0, 1, 1]) // the blank line still starts a new block
// A header with no card under it is reported, not silently dropped.
assert.deepEqual(parseDeckText('Commander\n\nDeck\n1 A').warnings, [{ line: 1, text: 'Commander', reason: 'header_without_card' }])
assert.deepEqual(parseDeckText('1 A\nCommander').warnings, [{ line: 2, text: 'Commander', reason: 'header_without_card' }])
assert.deepEqual(sections('Sideboard\n1 X\nCommander\nDeck\n1 A\n1 B'), ['X:sideboard', 'A:main', 'B:main']) // another header cancels the one-card return
assert.deepEqual(sections('1 X\nCommander\nCompanion\n1 A\n1 B'), ['X:main', 'A:companion', 'B:main']) // two headers in a row go back to main
assert.deepEqual(parseDeckText('1 X\nCommander\nCompanion\n1 A\n1 B').warnings, [{ line: 2, text: 'Commander', reason: 'header_without_card' }])

// 12. The number is optional (Kevin, 2026-10-29): a line with no number is one card, marked qtyAssumed.
const one = (text) => parseDeckText(text).entries
assert.deepEqual(one('Thrasios, Triton Hero').map((e) => [e.qty, e.name, e.section, e.qtyAssumed]), [[1, 'Thrasios, Triton Hero', 'main', true]])
assert.deepEqual(sections('Commander\nThrasios, Triton Hero\n\n1 A\n1 B'), ['Thrasios, Triton Hero:commander', 'A:main', 'B:main']) // a typed Commander header takes a line with no number too
assert.deepEqual(sections('1 X\nSIDEBOARD:\nAnnul\nSwords to Plowshares'), ['X:main', 'Annul:sideboard', 'Swords to Plowshares:sideboard'])
assert.deepEqual(parseDeckText('Sol Ring\n2 Island').total, 3) // the assumed 1 counts toward the total
assert.deepEqual(parseDeckText('Sol Ring\n2 Island').counts, { main: 3 })
for (const [text, name, set, number, foil] of [
  ['Sol Ring (CMM) 410', 'Sol Ring', 'cmm', '410', false],
  ['Sol Ring *F*', 'Sol Ring', null, null, true],
  ['Sol Ring (CMM) 410 *F*', 'Sol Ring', 'cmm', '410', true],
  ['Sol Ring (CMM)', 'Sol Ring (CMM)', null, null, false], // a set code with no number stays part of the name, as with a number typed
  ['  Sol   Ring  ', 'Sol Ring', null, null, false],
  ['B.F.M. (Big Furry Monster)', 'B.F.M. (Big Furry Monster)', null, null, false],
  ['Fire // Ice', 'Fire // Ice', null, null, false],
  ['Fire / Ice', 'Fire / Ice', null, null, false],
  ['Summon: Choco/Mog', 'Summon: Choco/Mog', null, null, false],
  ['+2 Mace', '+2 Mace', null, null, false], // a real card that starts like a number
  ['70,000 Light-Years from Home', '70,000 Light-Years from Home', null, null, false], // a real card with a number and a comma first
  ['_____', '_____', null, null, false], // a real card with no letters
  ["Lim-Dûl's Cohort", "Lim-Dûl's Cohort", null, null, false],
]) {
  const [entry, ...rest] = one(text)
  assert.ok(entry && rest.length === 0, text)
  assert.deepEqual([entry.qty, entry.name, entry.set, entry.number, entry.foil, entry.qtyAssumed], [1, name, set, number, foil, true], text)
}
// Lines that are NOT cards stay skipped and reported, with or without a number.
for (const text of ['Creatures (12)', 'Lands (36)', 'Deck stats: 99', 'Total: 100', 'Lands:', 'Mana curve:', '// my deck', '# notes', '-- notes', '---', '***', '100', '1x', '-1 Island', '1.5 Island', '12.', '()']) {
  const parsed = parseDeckText(text)
  assert.deepEqual(parsed.entries, [], text)
  assert.deepEqual(parsed.warnings.map((w) => w.reason), ['not_a_card_line'], text)
}
assert.deepEqual(parseDeckText('0 Forest').warnings.map((w) => w.reason), ['zero_quantity'])
// A line that HAS a number is trusted as before: the heading rules apply only to lines without one.
assert.deepEqual(one('2 Creatures (12)').map((e) => [e.qty, e.name]), [[2, 'Creatures (12)']])
assert.deepEqual(one('3 100').map((e) => [e.qty, e.name]), [[3, '100']])
assert.deepEqual(one('1 Total: 5').map((e) => [e.qty, e.name]), [[1, 'Total: 5']])
assert.deepEqual(one('1 Sol Ring').map((e) => 'qtyAssumed' in e), [false]) // a typed number never gets the mark
assert.deepEqual(one('1x Sol Ring').map((e) => [e.qty, e.name, 'qtyAssumed' in e]), [[1, 'Sol Ring', false]])
// Header words are still headers, never cards, and a card whose name only contains one is a card.
assert.deepEqual(parseDeckText('Sideboard\nCompanion').entries, [])
assert.deepEqual(one('Commander Sphere').map((e) => [e.name, e.section]), [['Commander Sphere', 'main']])
assert.deepEqual(one('Sideboard Strategy').map((e) => e.name), ['Sideboard Strategy'])
// A whole list with no numbers at all is a list of single cards.
const bare = parseDeckText('Sol Ring\nArcane Signet\nCommand Tower\n\nSIDEBOARD:\nAnnul')
assert.deepEqual(bare.entries.map((e) => [e.name, e.section, e.qty]), [['Sol Ring', 'main', 1], ['Arcane Signet', 'main', 1], ['Command Tower', 'main', 1], ['Annul', 'sideboard', 1]])
assert.equal(bare.warnings.length, 0)
assert.equal(bare.total, 4)
// The card limit still counts them: 201 bare lines is 201 cards.
assert.deepEqual(parseDeckText(Array.from({ length: MAX_CARDS + 1 }, (_, i) => `Card ${i}`).join('\n')).errors, [{ code: 'too_many_cards', total: MAX_CARDS + 1, limit: MAX_CARDS }])
// Text that looks like markup is just a name (the page shows it as text).
assert.equal(one('<img src=x onerror=alert(1)>')[0].name, '<img src=x onerror=alert(1)>')

console.log('All deck text checks passed.')
