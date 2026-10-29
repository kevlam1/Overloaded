// A player's display name. The database rules accept a string of 1 to 30 characters, so the page checks the same
// thing first and gives a readable message instead of a permission error.
//
// Names come from other people and are shown to everyone at the table, so the cleaner also removes what a name can use
// to cheat (found in the 2026-10-28 security pass): characters that show nothing (a "blank" name, or a name with a
// zero-width space in it that looks like another player's) and characters that change which way text runs (a
// right-to-left override can scramble the player list around it). Emoji joiners (U+200D), the non-joiner Persian and
// other scripts need (U+200C) and emoji variation selectors are NOT removed, so emoji and those scripts still work.
// Names are shown as plain text, never as markup, so none of this is about code running; it is about names that look
// like something they are not.
//
// This file is deliberately plain ASCII: the characters are listed by their numbers, because invisible characters
// written into the source itself cannot be read, reviewed or safely edited (that happened once, in the deck parser).
// No browser-only or server-only code here, so Node tests can load it.

// The database rule counts UTF-16 code units, not characters (checked in the emulator on 2026-10-28: 30 letters are
// accepted and 31 refused, but 16 emoji, which are 32 units, are refused and 15 are accepted). An emoji or another
// character outside the basic plane counts as two. The page counts the same way, so it never accepts a name the
// database would refuse.
export const NAME_MAX = 30;

// What a name may not contain, as Unicode ranges [first, last] or single values:
//  - controls (U+0000-0008, 000E-001F, 007F-009F; tab, newline and friends are turned into a space instead);
//  - the soft hyphen 00AD, combining grapheme joiner 034F, Arabic letter mark 061C, Hangul fillers 115F-1160, 3164
//    and half-width filler FFA0 (they show nothing);
//  - the zero-width space 200B, left-to-right and right-to-left marks 200E-200F;
//  - the embeddings and overrides 202A-202E, and the isolates 2066-2069 with the deprecated format characters up to 206F;
//  - the word joiner and invisible operators 2060-2064, the braille blank 2800, the byte order mark FEFF;
//  - the interlinear annotation marks FFF9-FFFB.
const INVISIBLE_RANGES = [
  [0x0000, 0x0008], [0x000E, 0x001F], [0x007F, 0x009F], [0x00AD], [0x034F], [0x061C], [0x115F, 0x1160],
  [0x200B], [0x200E, 0x200F], [0x202A, 0x202E], [0x2060, 0x2064], [0x2066, 0x206F], [0x2800], [0x3164],
  [0xFEFF], [0xFFA0], [0xFFF9, 0xFFFB],
];
// A regular expression is built from the numbers: "\u" + four hex digits is how a regular expression names a character.
const BACKSLASH_U = String.fromCharCode(92) + 'u';
const escape = (code) => BACKSLASH_U + code.toString(16).padStart(4, '0');
const characterClass = (ranges) => '[' + ranges.map(([first, last]) => (last === undefined ? escape(first) : `${escape(first)}-${escape(last)}`)).join('') + ']';
const INVISIBLE = new RegExp(characterClass(INVISIBLE_RANGES), 'g');
// A lone half of an emoji (a surrogate with no partner, from a bad paste or a cut-off string) is not valid text and can
// make a database request fail in confusing ways: a high half (D800-DBFF) not followed by a low half (DC00-DFFF), or a
// low half not preceded by a high half.
const HIGH = characterClass([[0xD800, 0xDBFF]]);
const LOW = characterClass([[0xDC00, 0xDFFF]]);
export const LONE_SURROGATE = new RegExp(`${HIGH}(?!${LOW})|(?<!${HIGH})${LOW}`, 'g');
// A name needs at least one letter, number, punctuation mark or symbol (emoji are symbols). Combining marks alone
// are not enough.
const HAS_VISIBLE = /[\p{L}\p{N}\p{P}\p{S}]/u;

// The cleaning on its own, for other short names typed by people (a deck name): invisible characters and lone surrogate
// halves removed, runs of whitespace collapsed to one space, trimmed, accents in one standard form. Never throws.
export const scrubText = (text) => String(text ?? '').replace(LONE_SURROGATE, '').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim().normalize('NFC');
export const hasVisibleCharacter = (text) => HAS_VISIBLE.test(text);

// Returns the cleaned name (invisible characters removed, runs of whitespace collapsed to one space, trimmed, accents
// in one standard form) or throws an Error with a message for people.
export function cleanPlayerName(text) {
  const name = scrubText(text);
  if (!hasVisibleCharacter(name)) throw new Error('Type a name first.');
  if (name.length > NAME_MAX) {
    // Short in characters but long in units: the emoji are the reason, so say so.
    if ([...name].length <= NAME_MAX) throw new Error(`That name is too long: an emoji counts as two of the ${NAME_MAX} characters.`);
    throw new Error(`Names can be up to ${NAME_MAX} characters.`);
  }
  return name;
}
