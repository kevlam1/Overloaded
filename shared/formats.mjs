// The formats a table and a saved deck can be for. Commander and Standard to start (Kevin, 2026-10-30); play is casual, so
// deck sizes are hints, not rules. Plain data and one check, no browser or network code, so Node tests can load it and the
// lobby page does not need the deck code to know the list.
export const FORMATS = ['commander', 'standard'];
export const FORMAT_TITLES = { commander: 'Commander', standard: 'Standard' };
export const DEFAULT_FORMAT = 'commander';

// A value that must be one of the known formats. Returns it, or throws a readable message. Anything else (another
// capitalization, a space, a non-string, an inherited name like "constructor") is refused, never repaired.
export function readFormat(value) {
  if (typeof value === 'string' && FORMATS.includes(value)) return value;
  throw new Error(`A table's format must be one of: ${FORMATS.map((format) => FORMAT_TITLES[format]).join(', ')}.`);
}

// The words for a format stored in the database. Another client could have written any text there, so an unknown one is
// shown as plain text (the page puts it in with textContent), never looked up on an object.
export const formatTitle = (format) => (FORMATS.includes(format) ? FORMAT_TITLES[format] : String(format ?? ''));
