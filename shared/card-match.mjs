// Matches parsed decklist entries (shared/deck-text.mjs) to cards in the card list by name.
// Plain JavaScript with no browser or server code. The rules come from the audits in docs/scryfall.md.
// A card in the list looks like { n: name, t: type line, m: mana cost, k: keywords, i: Scryfall id }.
// This does not pick a printing; set and number stay on the entry for a later step.

// Written as code points so no invisible or look-alike character sits in this file.
const MARKS = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g') // accent marks after NFD
const SINGLE_QUOTES = new RegExp('[' + String.fromCharCode(0x2018, 0x2019) + ']', 'g')
const DOUBLE_QUOTES = new RegExp('[' + String.fromCharCode(0x201c, 0x201d) + ']', 'g')
const AE_UPPER = String.fromCharCode(0xc6)
const AE_LOWER = String.fromCharCode(0xe6)
const MODIFIER_COLON = String.fromCharCode(0xa789) // used in one real card name instead of ":"

export const MAX_FALLBACK = 75 // one /cards/collection request holds 75 names

// "Lim-Dul's Cohort", "Fire/Ice" and "Fire / Ice" all become the same key as the real names.
export function normalizeName(name) {
  return name
    .normalize('NFD')
    .replace(MARKS, '')
    .replaceAll(AE_UPPER, 'Ae')
    .replaceAll(AE_LOWER, 'ae')
    .replace(SINGLE_QUOTES, "'")
    .replace(DOUBLE_QUOTES, '"')
    .replaceAll(MODIFIER_COLON, ':')
    .replace(/\s*\/\/?\s*/g, ' // ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function add(map, key, card) {
  const list = map.get(key)
  if (list) list.push(card)
  else map.set(key, [card])
}

// full: the whole name ("Fire // Ice"). front: the first face of a two-faced card. back: the other faces.
export function buildCardIndex(cards) {
  const index = { full: new Map(), front: new Map(), back: new Map(), size: cards.length }
  for (const card of cards) {
    add(index.full, normalizeName(card.n), card)
    if (card.n.includes(' // ')) {
      const [front, ...rest] = card.n.split(' // ')
      add(index.front, normalizeName(front), card)
      for (const face of rest) add(index.back, normalizeName(face), card)
    }
  }
  return index
}

// Returns { entry, status, method, card, candidates }.
//   matched:    one card. method is 'full' (the whole name) or 'front' (the first face only).
//   ambiguous:  two or more cards have that name; candidates lists them. The page asks, or a printing decides.
//   suggestion: no card has that name, but it is a back face of a card ("did you mean ..."). Back faces
//               never match by themselves: 29 clash with real cards.
//   not_found:  nothing. These are the names that may be newer than the list.
// The whole name wins over a front face, so "Bind" is the card Bind, not Bind // Liberate.
export function matchEntry(index, entry) {
  const key = normalizeName(entry.name)
  for (const [map, method] of [[index.full, 'full'], [index.front, 'front']]) {
    const found = map.get(key)
    if (!found) continue
    if (found.length === 1) return { entry, status: 'matched', method, card: found[0], candidates: found }
    return { entry, status: 'ambiguous', method, card: null, candidates: found }
  }
  const back = index.back.get(key)
  if (back) return { entry, status: 'suggestion', method: null, card: null, candidates: back }
  return { entry, status: 'not_found', method: null, card: null, candidates: [] }
}

// Matches every entry. fallbackNames are the names to send in at most one batch request to Scryfall,
// each spelling once, and never more than 75; fallbackOverflow says some were left out.
export function matchDeck(index, entries) {
  const results = entries.map((entry) => matchEntry(index, entry))
  const counts = { matched: 0, ambiguous: 0, suggestion: 0, not_found: 0 }
  const missing = new Map()
  for (const result of results) {
    counts[result.status]++
    if (result.status === 'not_found') {
      const key = normalizeName(result.entry.name)
      if (!missing.has(key)) missing.set(key, result.entry.name)
    }
  }
  const names = [...missing.values()]
  return { results, counts, fallbackNames: names.slice(0, MAX_FALLBACK), fallbackOverflow: names.length > MAX_FALLBACK }
}
