// The site's version number, worked out from log.md so it can never be forgotten (Kevin, 2026-11-13).
// Every numbered entry in log.md is one update, so the version is 0.N where N is the number of entries: entry 186 made it 0.186, entry 187 will make it 0.187.
// The 0 is "still in beta" (the page says BETA). The plan is to make it 1.0 for the show and tell on 7 December, which is a decision, not a calculation: change MAJOR below then.
// Plain JavaScript with no browser or file code, so a Node test can load it. The build reads log.md and puts the result on the pages (vite.config.js) and on the logs page.
export const MAJOR = 0;

// How many numbered entries ("## 12. Title (2026-10-27)") the log text has. It counts only headings of that exact shape.
export function countEntries(logText) {
  const text = String(logText ?? '').replace(/\r\n/g, '\n');
  return (text.match(/^## \d+\. .+ \(\d{4}-\d{2}-\d{2}\)$/gm) ?? []).length;
}

// "0.186" for a log with 186 entries. A log with none gives "0.0".
export function versionFromLog(logText) {
  return `${MAJOR}.${countEntries(logText)}`;
}
