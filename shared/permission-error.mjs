// Did the database refuse a request because the rules do not allow it? The page treats that as a normal answer
// ("you are not at this table", "that seat is taken"), not as a failure, so it has to recognize it reliably.
//
// The Firebase web SDK words this differently for different calls (seen on 2026-10-28 against the real project):
// - a write (`set`, `update`) rejects with code "PERMISSION_DENIED" and a message like "PERMISSION_DENIED: Permission denied";
// - a read (`get`) rejects with the message "Permission denied" (a space, no underscore) and no code.
// A check that looked only for the underscore form missed every refused read.
// No browser-only or server-only code here, so Node tests can load it.

export function isPermissionDenied(error) {
  if (!error) return false;
  if (error.code === 'PERMISSION_DENIED') return true;
  return /permission[_ ]denied/i.test(error.message ?? ''); // a regular expression turns its input into text itself
}
