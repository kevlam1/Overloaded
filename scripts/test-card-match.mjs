// Checks shared/card-match.mjs (decklist entries to cards by name) without a browser.
// Uses the small real-data fixture in scripts/fixtures, so it needs no download.
// Run it from the project folder: node scripts/test-card-match.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MAX_FALLBACK, buildCardIndex, matchDeck, matchEntry, normalizeName } from '../shared/card-match.mjs'
import { parseDeckText } from '../shared/deck-text.mjs'
import { ARCHIDEKT, MOXFIELD_FOR_MOXFIELD, MOXFIELD_PLAIN } from './fixtures/exports.mjs'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/cards-sample.json', import.meta.url), 'utf8'))
const index = buildCardIndex(fixture.cards)
const match = (name) => matchEntry(index, { name })
const names = (result) => result.candidates.map((c) => c.n)

// 0. The fixture is what these tests assume.
assert.equal(fixture.cards.length, 29)
assert.equal(index.size, 29)

// 1. Normalizing: accents, ligatures, quotes, slashes, case and spaces. Written without invisible characters.
assert.equal(normalizeName("Lim-Dûl's Cohort"), "lim-dul's cohort")
assert.equal(normalizeName('Jötun Grunt'), 'jotun grunt')
assert.equal(normalizeName('Éowyn, Lady of Rohan'), 'eowyn, lady of rohan')
assert.equal(normalizeName('Æther Vial'), 'aether vial')
assert.equal(normalizeName(`${String.fromCharCode(0xe6)}ther vial`), 'aether vial') // typed in lowercase
assert.equal(match(`${String.fromCharCode(0xe6)}ther vial`).card.n, 'Aether Vial')
assert.equal(normalizeName(`Urza${String.fromCharCode(0x2019)}s Saga`), "urza's saga")
assert.equal(normalizeName(`Kongming, ${String.fromCharCode(0x201c)}Sleeping Dragon${String.fromCharCode(0x201d)}`), 'kongming, "sleeping dragon"')
assert.equal(normalizeName(`Ratonhnhak${String.fromCharCode(0xe9, 0xa789)}ton`), 'ratonhnhake:ton')
assert.equal(normalizeName('Fire/Ice'), 'fire // ice')
assert.equal(normalizeName('Fire / Ice'), 'fire // ice')
assert.equal(normalizeName('Fire // Ice'), 'fire // ice')
assert.equal(normalizeName('  SOL   ring '), 'sol ring')
assert.equal(normalizeName('SP//dr, Piloted by Peni'), 'sp // dr, piloted by peni') // the same on both sides, so it still matches

// 2. Spellings real exports use all find the right card.
for (const [typed, real, method] of [
  ['Éowyn, Lady of Rohan', 'Éowyn, Lady of Rohan', 'full'],
  ['eowyn, lady of rohan', 'Éowyn, Lady of Rohan', 'full'],
  ['Bonecrusher Giant / Stomp', 'Bonecrusher Giant // Stomp', 'full'], // Copy for Moxfield
  ['Bonecrusher Giant // Stomp', 'Bonecrusher Giant // Stomp', 'full'], // Archidekt
  ['Bonecrusher Giant', 'Bonecrusher Giant // Stomp', 'front'], // Moxfield plain text
  ['Fire / Ice', 'Fire // Ice', 'full'],
  ['Fire/Ice', 'Fire // Ice', 'full'],
  ['Delver of Secrets', 'Delver of Secrets // Insectile Aberration', 'front'],
  ['Jotun Grunt', 'Jötun Grunt', 'full'],
  ["Lim-Dul's Cohort", "Lim-Dûl's Cohort", 'full'],
  ['Kongming, "Sleeping Dragon"', 'Kongming, "Sleeping Dragon"', 'full'],
  ['Aether Vial', 'Aether Vial', 'full'],
  [`${String.fromCharCode(0xc6)}ther Vial`, 'Aether Vial', 'full'],
  ['SP//dr, Piloted by Peni', 'SP//dr, Piloted by Peni', 'full'],
  ['Summon: Choco/Mog', 'Summon: Choco/Mog', 'full'],
  ['Who/What/When/Where/Why', 'Who // What // When // Where // Why', 'full'],
]) {
  const result = match(typed)
  assert.equal(result.status, 'matched', typed)
  assert.equal(result.card.n, real, typed)
  assert.equal(result.method, method, typed)
}

// 3. A matched card is the real record: type, cost, keywords and Scryfall id come along.
const bolt = match('lightning bolt').card
assert.equal(bolt.t, 'Instant')
assert.equal(bolt.m, '{R}')
assert.equal(bolt.i, '7673784e-db4b-43a1-8d55-1bb9fc1e284f')
assert.deepEqual(match('Sol Ring').card.t, 'Artifact')

// 4. The whole name beats a front face: "Bind" is the card Bind, not Bind // Liberate. Same for Smelt.
assert.equal(match('Bind').card.n, 'Bind')
assert.equal(match('Bind').method, 'full')
assert.equal(match('Smelt').card.n, 'Smelt')
assert.equal(match('Bind // Liberate').card.n, 'Bind // Liberate')

// 5. Two cards with the same name are never guessed.
const monster = match('Monster')
assert.equal(monster.status, 'ambiguous')
assert.equal(monster.method, 'front')
assert.deepEqual(names(monster).sort(), ['Monster // Sorcerer', 'Monster // Virtuous'])
assert.equal(monster.card, null)
const fast = match('Fast // Furious')
assert.equal(fast.status, 'ambiguous')
assert.equal(fast.candidates.length, 2)
assert.notEqual(fast.candidates[0].i, fast.candidates[1].i)
assert.equal(match('Fast').status, 'ambiguous')
assert.equal(match('Everythingamajig').status, 'ambiguous')
assert.equal(match('Everythingamajig').candidates.length, 2)
assert.equal(match('B.F.M. (Big Furry Monster)').status, 'ambiguous')

// 6. A back face never matches by itself; it only suggests. A real card with that name still wins.
const back = match('Insectile Aberration')
assert.equal(back.status, 'suggestion')
assert.equal(back.card, null)
assert.deepEqual(names(back), ['Delver of Secrets // Insectile Aberration'])
assert.deepEqual(names(match('Virtuous')).sort(), ['Monster // Virtuous', 'Royal // Virtuous'])
assert.equal(match('Virtuous').status, 'suggestion')
const recall = match('Ancestral Recall')
assert.equal(recall.status, 'matched') // the real card, not the back of Emeritus of Ideation
assert.equal(recall.card.n, 'Ancestral Recall')

// 7. Nothing found.
for (const typed of ['Not A Real Card', '', '   ', 'Fire // Ice // Smoke']) assert.equal(match(typed).status, 'not_found', typed)
assert.deepEqual(match('Not A Real Card').candidates, [])
assert.equal(matchEntry(buildCardIndex([]), { name: 'Sol Ring' }).status, 'not_found')

// 8. The three real exports, parsed and matched: every one of the 10 cards is found, in all three.
const expected = ['Bonecrusher Giant // Stomp', 'Delver of Secrets // Insectile Aberration', 'Fire // Ice', 'Forest', 'Jötun Grunt', 'Kongming, "Sleeping Dragon"', "Lim-Dûl's Cohort", 'Lightning Bolt', 'Sol Ring', 'Éowyn, Lady of Rohan']
for (const [site, text] of [['Copy for Moxfield', MOXFIELD_FOR_MOXFIELD], ['Moxfield plain text', MOXFIELD_PLAIN], ['Archidekt', ARCHIDEKT]]) {
  const deck = matchDeck(index, parseDeckText(text).entries)
  assert.deepEqual(deck.counts, { matched: 10, ambiguous: 0, suggestion: 0, not_found: 0 }, site)
  assert.deepEqual(deck.results.map((r) => r.card.n).sort(), [...expected].sort(), site)
  assert.deepEqual(deck.fallbackNames, [], site)
}

// 9. matchDeck keeps what the parser found: quantity, printing, foil and section.
const kept = matchDeck(index, parseDeckText(MOXFIELD_FOR_MOXFIELD).entries).results.find((r) => r.card.n === 'Kongming, "Sleeping Dragon"')
assert.deepEqual([kept.entry.qty, kept.entry.set, kept.entry.number, kept.entry.foil, kept.entry.section], [1, 'a25', '20', true, 'main'])

// 10. Fallback: names the list lacks go in at most one batch of 75, each spelling once.
const mixed = matchDeck(index, [
  { name: 'Sol Ring' }, { name: 'Brand New Card' }, { name: 'brand  new card' }, { name: 'Another New One' },
  { name: 'Insectile Aberration' }, { name: 'Monster' },
])
assert.deepEqual(mixed.counts, { matched: 1, ambiguous: 1, suggestion: 1, not_found: 3 })
assert.deepEqual(mixed.fallbackNames, ['Brand New Card', 'Another New One']) // first spelling kept, duplicates dropped
assert.equal(mixed.fallbackOverflow, false)
const flood = matchDeck(index, Array.from({ length: MAX_FALLBACK + 5 }, (_, i) => ({ name: `Made Up Card ${i}` })))
assert.equal(flood.fallbackNames.length, MAX_FALLBACK)
assert.equal(flood.fallbackOverflow, true)
const exactly = matchDeck(index, Array.from({ length: MAX_FALLBACK }, (_, i) => ({ name: `Made Up Card ${i}` })))
assert.equal(exactly.fallbackNames.length, MAX_FALLBACK)
assert.equal(exactly.fallbackOverflow, false)
assert.deepEqual(matchDeck(index, []), { results: [], counts: { matched: 0, ambiguous: 0, suggestion: 0, not_found: 0 }, fallbackNames: [], fallbackOverflow: false })

// 11. A card printed under another title (the card's optional `f` list). The five titles Kevin hit are real Scryfall data
// (checked 2026-10-29 in the cached bulk file); the cards here are small stand-ins with those names.
const KATAKANA = String.fromCharCode(0x30d5, 0x30a7, 0x30a4, 0x30bf, 0x30ea, 0x30ba, 0x30e0) // written from numbers, no invisible or hard-to-read characters
const entryOf = (n, f, i) => ({ n, t: 'Artifact', m: '', k: [], i, ...(f ? { f } : {}) })
const titled = [
  entryOf('Arcane Signet', ['Heart of the Mountain'], 'a1'),
  entryOf("Dovin's Veto", ['Shadowbringers'], 'a2'),
  entryOf('Varragoth, Bloodsky Sire', ['Ardyn Izunia'], 'a3'),
  entryOf('Snap', ["Kushala Daora's Fury"], 'a4'),
  entryOf('Arcane Denial', [KATAKANA], 'a5'),
  entryOf('Sol Ring', undefined, 'a6'),
  entryOf('Twice', ['The Same Title', 'the  same title'], 'a7'), // two titles that normalize alike
  entryOf('Fire // Ice', ['Elemental Pair'], 'a8'),
  entryOf('Shared One', ['Both Cards Say This'], 'a9'),
  entryOf('Shared Two', ['Both Cards Say This'], 'a10'),
  entryOf('Heart of the Mountain Twin', undefined, 'a11'),
  entryOf('Bind', undefined, 'a12'),
  entryOf('Bind // Liberate', ['Bind'], 'a13'), // a title equal to a real name
  entryOf('Monster // Virtuous', undefined, 'a14'),
  entryOf('Some Card', ['Monster'], 'a15'), // a title equal to the front face of another card
]
const titledIndex = buildCardIndex(titled)
const alt = (name) => matchEntry(titledIndex, { name })
for (const [typed, real] of [['Heart of the Mountain', 'Arcane Signet'], ['Shadowbringers', "Dovin's Veto"], ['Ardyn Izunia', 'Varragoth, Bloodsky Sire'], ["Kushala Daora's Fury", 'Snap'], [KATAKANA, 'Arcane Denial']]) {
  const result = alt(typed)
  assert.equal(result.status, 'matched', typed)
  assert.equal(result.card.n, real, typed)
  assert.equal(result.method, 'alt', typed)
}
assert.equal(alt('heart of the mountain').card.n, 'Arcane Signet') // case
assert.equal(alt(`Kushala Daora${String.fromCharCode(0x2019)}s Fury`).card.n, 'Snap') // a curly apostrophe, as some sites export it
assert.equal(alt('  Heart   of the Mountain ').card.n, 'Arcane Signet')
assert.equal(alt('Sol Ring').method, 'full') // a real name still matches as itself
assert.equal(alt('Twice').method, 'full')
assert.equal(alt('The Same Title').status, 'matched') // one card, listed twice under alike titles, is not ambiguous
assert.equal(alt('The Same Title').card.n, 'Twice')
assert.equal(titledIndex.alt.get('the same title').length, 1)
assert.equal(alt('Elemental Pair').card.n, 'Fire // Ice')
assert.equal(alt('Both Cards Say This').status, 'ambiguous') // two cards, never guessed
assert.deepEqual(names(alt('Both Cards Say This')).sort(), ['Shared One', 'Shared Two'])
assert.equal(alt('Both Cards Say This').method, 'alt')
assert.equal(alt('Heart of the Mountain Twin').method, 'full') // a longer real name is not confused with the title inside it
assert.equal(alt('Bind').card.n, 'Bind') // a real name wins over a title
assert.equal(alt('Bind').method, 'full')
assert.equal(alt('Monster').card.n, 'Monster // Virtuous') // a front face wins over a title
assert.equal(alt('Monster').method, 'front')
assert.equal(alt('Not A Title').status, 'not_found')
assert.equal(alt('Insectile Aberration').status, 'not_found')
assert.equal(matchEntry(buildCardIndex([{ n: 'Delver of Secrets // Insectile Aberration', t: '', m: '', k: [], i: 'd', f: ['Insectile Aberration'] }]), { name: 'Insectile Aberration' }).method, 'alt') // a title wins over the back-face suggestion
// Cards with no `f`, or a damaged one, still index (the page must not break on an old or odd list).
const odd = buildCardIndex([{ n: 'Plain', t: '', m: '', k: [], i: 'p1' }, { n: 'Odd One', t: '', m: '', k: [], i: 'p2', f: 'not a list' }, { n: 'Odd Two', t: '', m: '', k: [], i: 'p3', f: [3, null, 'Fine Title'] }])
assert.equal(odd.size, 3)
assert.equal(matchEntry(odd, { name: 'Plain' }).status, 'matched')
assert.equal(matchEntry(odd, { name: 'not a list' }).status, 'not_found')
assert.equal(matchEntry(odd, { name: 'n' }).status, 'not_found') // a text `f` is not walked one letter at a time
assert.equal(matchEntry(odd, { name: 'Fine Title' }).card.n, 'Odd Two')
// A deck with titles in it: all matched, nothing sent to Scryfall.
const titledDeck = matchDeck(titledIndex, [{ name: 'Heart of the Mountain' }, { name: 'Shadowbringers' }, { name: 'Sol Ring' }])
assert.deepEqual(titledDeck.counts, { matched: 3, ambiguous: 0, suggestion: 0, not_found: 0 })
assert.deepEqual(titledDeck.fallbackNames, [])
// The old fixture index has no titles and behaves as before.
assert.equal(index.alt.size, 0)

console.log('All card match checks passed.')
