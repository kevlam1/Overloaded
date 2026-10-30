// Turns pasted decklist text into entries. Plain JavaScript with no browser or server code, so
// Node tests can load it. It does not look cards up. The formats it was built on are in
// docs/deck-import.md (Moxfield and Archidekt exports; ManaBox not seen yet).

export const MAX_CARDS = 200 // main + sideboard + commander + companion, counted by quantity
export const MAX_CHARS = 100000
export const MAX_LINES = 1000

// "1 Sol Ring", "1x Sol Ring (cmm) 410", "1 Kongming, "Sleeping Dragon" (A25) 20 *F*".
// Scryfall set codes are 3 to 6 letters or digits, and collector numbers have no spaces (but can hold
// stars, daggers, Φ, _ and -), both checked on 119,203 printings on 2026-10-26.
// The number is optional: "Thrasios, Triton Hero" alone is one card (the entry says so with qtyAssumed).
const CARD_LINE = /^(?:(\d{1,4})x?\s+)?(.+?)(?:\s+\(([A-Za-z0-9]{3,6})\)\s+(\S+?))?(?:\s+\*[Ff]\*)?\s*$/
const FOIL = /\s\*[Ff]\*\s*$/

// A line with no number is taken as a card with a count of 1 unless it looks like something else. These shapes were
// checked against all 34,743 card names and alternate titles on 2026-10-29: none of them matches a real card, so none of
// these rules can swallow a real card name. (Two real cards, "_____" and "______", have no letters, which is why
// underscores count as letters below.)
const NOT_A_CARD = [
  /^(?:\/\/|#|--)/, // a comment
  /\(\d+\)\s*$/, // "Creatures (12)": a category heading with a count
  /:\s*\d+\s*$/, // "Deck stats: 99": a label with a number
  /:\s*$/, // "Lands:": a heading
  /^\d+x?$/i, // "1" or "1x": a number with nothing after it
  /^-\d+\s/, // "-1 Island": a negative count
  /^\d+\.\d+\s/, // "1.5 Island": a fractional count (a comma is NOT matched: "70,000 Light-Years from Home" is a real card, and "+2 Mace" too)
]
const looksLikeCard = (line) => /[\p{L}_]/u.test(line) && !NOT_A_CARD.some((pattern) => pattern.test(line))

// Only "SIDEBOARD:" is confirmed (Moxfield). The rest are common names, so unknown ones are reported, not guessed.
const HEADERS = [
  [/^(?:deck|main(?:\s?deck|board)?)$/i, 'main'],
  [/^side\s?board$/i, 'sideboard'],
  [/^commanders?$/i, 'commander'],
  [/^companion$/i, 'companion'],
  [/^maybe\s?board$/i, 'maybeboard'],
]

// These headers mark only the next card, then the parser goes back to the section it was in. A typed
// "Commander" above one card in a pasted list must not turn the rest of the deck into commanders, and a
// deck has one companion. A partner is a second "Commander" line, or is marked on the preview page.
const ONE_CARD = new Set(['commander', 'companion'])

function headerOf(line) {
  const name = line.replace(/:$/, '').trim()
  for (const [pattern, section] of HEADERS) if (pattern.test(name)) return section
  return null
}

// Returns { entries, warnings, errors, counts, total }.
//   entry:   { qty, name, set (lowercase or null), number (text or null), foil, section, line, block }
//            plus qtyAssumed: true when the line had no number and was counted as 1 (the field is absent otherwise)
//   section: the last header ('main' before any header), or 'unlabeled' for cards after a blank line
//            that follows a labeled section (Moxfield plain text puts the commander there). The caller
//            decides what those are; this never guesses. 'commander' and 'companion' headers cover
//            only the next card (see ONE_CARD).
//   block:   0 for the first group of lines, +1 after each blank line.
//   warnings: lines that were skipped, with their line number, and a Commander or Companion line with
//            no card under it ('header_without_card').
//   errors:  the input is refused ('too_long', 'too_many_lines', 'not_text') or has too many cards
//            ('too_many_cards', entries are still returned so the page can show them).
export function parseDeckText(text) {
  const result = { entries: [], warnings: [], errors: [], counts: {}, total: 0 }
  if (typeof text !== 'string') {
    result.errors.push({ code: 'not_text' })
    return result
  }
  if (text.length > MAX_CHARS) {
    result.errors.push({ code: 'too_long', limit: MAX_CHARS })
    return result
  }
  const lines = text.split(/\r\n|\r|\n/)
  if (lines.length > MAX_LINES) {
    result.errors.push({ code: 'too_many_lines', limit: MAX_LINES })
    return result
  }

  let section = 'main'
  let labeled = false // the section came from a header other than main
  let sectionHasEntries = false
  let pendingBreak = false
  let block = 0
  let resume = null // the section to go back to after a one-card header
  let waiting = null // a one-card header that has no card yet: { line, text }
  lines.forEach((raw, index) => {
    // \s also covers tabs, non-breaking spaces from a web page copy, and a byte order mark.
    const line = raw.replace(/\s+/g, ' ').trim()
    const number = index + 1
    if (!line) {
      if (sectionHasEntries) pendingBreak = true // a blank line right after a header doesn't count
      return
    }
    const header = headerOf(line)
    if (pendingBreak) {
      block++
      pendingBreak = false
      if (labeled) {
        section = 'unlabeled'
        labeled = false
      }
    }
    if (header) {
      if (waiting) result.warnings.push({ ...waiting, reason: 'header_without_card' })
      waiting = null
      if (ONE_CARD.has(header)) {
        if (!resume) resume = { section, labeled } // two headers in a row go back to the section before both
        waiting = { line: number, text: line }
      } else {
        resume = null
      }
      section = header
      labeled = header !== 'main'
      sectionHasEntries = false
      return
    }
    const match = CARD_LINE.exec(line)
    const numbered = Boolean(match) && match[1] !== undefined
    if (!match || (!numbered && !looksLikeCard(line))) {
      result.warnings.push({ line: number, text: line, reason: 'not_a_card_line' })
      return
    }
    const qty = numbered ? Number(match[1]) : 1
    if (qty === 0) {
      result.warnings.push({ line: number, text: line, reason: 'zero_quantity' })
      return
    }
    result.entries.push({
      qty,
      name: match[2],
      set: match[3] ? match[3].toLowerCase() : null,
      number: match[4] ?? null,
      foil: FOIL.test(line),
      section,
      line: number,
      block,
      ...(numbered ? {} : { qtyAssumed: true }),
    })
    sectionHasEntries = true
    waiting = null
    if (resume) {
      section = resume.section
      labeled = resume.labeled
      resume = null
    }
  })
  if (waiting) result.warnings.push({ ...waiting, reason: 'header_without_card' })

  for (const entry of result.entries) {
    result.counts[entry.section] = (result.counts[entry.section] ?? 0) + entry.qty
    if (entry.section !== 'maybeboard') result.total += entry.qty
  }
  if (result.total > MAX_CARDS) result.errors.push({ code: 'too_many_cards', total: result.total, limit: MAX_CARDS })
  return result
}
