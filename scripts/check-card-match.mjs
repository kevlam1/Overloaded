// Tries shared/card-match.mjs on every real card name in the cached Scryfall Oracle Cards file.
// Needs `node scripts/fetch-scryfall.mjs bulk oracle_cards` first. Plain Node 20.11+, no network.
// Run: node scripts/check-card-match.mjs   (exits with an error if any check fails)
import { createReadStream } from 'node:fs'
import { createGunzip } from 'node:zlib'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { buildCardIndex, matchDeck, matchEntry, normalizeName } from '../shared/card-match.mjs'
import { parseDeckText } from '../shared/deck-text.mjs'
import { ARCHIDEKT, MOXFIELD_FOR_MOXFIELD, MOXFIELD_PLAIN } from './fixtures/exports.mjs'

// The same kinds of records the card list will drop (see docs/scryfall.md). Online-only cards are kept here,
// which is fine: this only checks that the matcher agrees with itself on real names.
const NOT_IN_DECKS = new Set(['art_series', 'vanguard', 'planar', 'scheme', 'token', 'double_faced_token', 'emblem', 'front_card'])
const cards = []
const lines = createInterface({ input: createReadStream(join(import.meta.dirname, '..', 'data', 'cache', 'scryfall', 'oracle_cards.jsonl.gz')).pipe(createGunzip()), crlfDelay: Infinity })
for await (const line of lines) {
  if (!line) continue
  const c = JSON.parse(line)
  if (NOT_IN_DECKS.has(c.layout) || c.set_type === 'memorabilia') continue
  cards.push({ n: c.name, t: c.type_line, m: c.mana_cost ?? c.card_faces?.[0]?.mana_cost ?? '', k: c.keywords, i: c.id })
}

let failures = 0
const fail = (message) => { failures++; if (failures <= 10) console.log(`  FAIL: ${message}`) }
const timed = (label, work) => { const start = performance.now(); const value = work(); console.log(`${label}: ${(performance.now() - start).toFixed(0)} ms`); return value }

console.log(`Cards in the check: ${cards.length}`)
const index = timed('Build the index', () => buildCardIndex(cards))

// 1. Every card's own name finds it: matched, or ambiguous with that card among the candidates.
let matched = 0, ambiguous = 0
timed('Match every full name', () => {
  for (const card of cards) {
    const r = matchEntry(index, { name: card.n })
    if (r.status === 'matched' && r.card.i === card.i) matched++
    else if (r.status === 'ambiguous' && r.candidates.some((c) => c.i === card.i)) ambiguous++
    else fail(`"${card.n}" -> ${r.status}`)
  }
})
console.log(`1. full names: ${matched} matched, ${ambiguous} ambiguous (names shared by two or more cards), ${failures} failures`)

// 2. Every two-faced card's front name finds a card: itself, or the card whose whole name is that text (Bind, Smelt).
const before = failures
let frontOk = 0, frontWholeNameWins = []
for (const card of cards) {
  if (!card.n.includes(' // ')) continue
  const front = card.n.split(' // ')[0]
  const r = matchEntry(index, { name: front })
  if (r.status === 'not_found' || r.status === 'suggestion') fail(`front "${front}" -> ${r.status}`)
  else if (r.candidates.some((c) => c.i === card.i)) frontOk++
  else if (r.candidates.some((c) => c.n === front)) frontWholeNameWins.push(front)
  else fail(`front "${front}" found other cards`)
}
console.log(`2. front names: ${frontOk} find their card; ${frontWholeNameWins.length} are also a whole card name and that card wins (${[...new Set(frontWholeNameWins)].join(', ')}); ${failures - before} failures`)

// 3. Normalizing is stable: running it again changes nothing, and different names don't collide.
const keys = new Map()
let unstable = 0
for (const card of cards) {
  const key = normalizeName(card.n)
  if (normalizeName(key) !== key) unstable++
  const names = keys.get(key) ?? new Set()
  names.add(card.n)
  keys.set(key, names)
}
const collisions = [...keys].filter(([, names]) => names.size > 1)
if (unstable) fail(`${unstable} names are not stable under normalizing twice`)
if (collisions.length) fail(`${collisions.length} keys shared by different names, e.g. ${[...collisions[0][1]].join(' | ')}`)
console.log(`3. normalizing: ${unstable} unstable, ${collisions.length} collisions between different names`)

// 4. The three real exports match completely against the full data.
for (const [site, text] of [['Copy for Moxfield', MOXFIELD_FOR_MOXFIELD], ['Moxfield plain text', MOXFIELD_PLAIN], ['Archidekt', ARCHIDEKT]]) {
  const deck = matchDeck(index, parseDeckText(text).entries)
  const ok = deck.counts.matched === 10 && deck.counts.ambiguous + deck.counts.suggestion + deck.counts.not_found === 0
  if (!ok) fail(`${site}: ${JSON.stringify(deck.counts)}`)
  console.log(`4. ${site}: ${JSON.stringify(deck.counts)}`)
}

// 4b. Spellings people really type, made here without the module's own code (so a mistake in it doesn't cancel out):
//     accents removed with a Unicode property, curly apostrophes, and a single slash between faces.
const finds = (typed, card) => {
  const r = matchEntry(index, { name: typed })
  return (r.status === 'matched' || r.status === 'ambiguous') && r.candidates.some((c) => c.i === card.i)
}
const stripAccents = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').replaceAll('Æ', 'Ae').replaceAll('æ', 'ae')
let accented = 0, curly = 0, slashed = 0
for (const card of cards) {
  const plain = stripAccents(card.n)
  if (plain !== card.n) {
    accented++
    if (!finds(plain, card)) fail(`accents removed: "${plain}" does not find "${card.n}"`)
  }
  if (card.n.includes("'")) {
    curly++
    const typed = card.n.replaceAll("'", '’')
    if (!finds(typed, card)) fail(`curly apostrophe: "${typed}" does not find "${card.n}"`)
  }
  if (card.n.includes(' // ')) {
    slashed++
    const typed = card.n.replaceAll(' // ', ' / ')
    if (!finds(typed, card)) fail(`single slash: "${typed}" does not find "${card.n}"`)
  }
}
console.log(`4b. typed spellings: ${accented} names without accents, ${curly} with curly apostrophes, ${slashed} with a single slash`)

// 5. Speed for a 100-card deck (the names of 100 real cards, spelled in lowercase without accents).
const hundred = cards.slice(0, 20000).filter((_, i) => i % 200 === 0).map((c) => ({ name: normalizeName(c.n) }))
timed(`5. match ${hundred.length} names`, () => matchDeck(index, hundred))

console.log(failures ? `${failures} check(s) failed.` : 'All card match data checks passed.')
if (failures) process.exitCode = 1
