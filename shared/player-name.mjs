// A player's display name. The database rules accept a string of 1 to 30 characters, so the page checks the same
// thing first and gives a readable message instead of a permission error.
// No browser-only or server-only code here, so Node tests can load it.

export const NAME_MAX = 30;

// Returns the cleaned name (trimmed, runs of spaces and tabs collapsed) or throws an Error with a message for people.
export function cleanPlayerName(text) {
  const name = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!name) throw new Error('Type a name first.');
  if ([...name].length > NAME_MAX) throw new Error(`Names can be up to ${NAME_MAX} characters.`);
  return name;
}
