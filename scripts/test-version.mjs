// Checks shared/version.mjs, and that the real log.md gives the version the pages show.
import { readFileSync } from 'node:fs';
import { countEntries, versionFromLog, MAJOR } from '../shared/version.mjs';

let failed = 0; let count = 0;
const check = (name, ok, detail = '') => { count += 1; if (!ok) { failed += 1; console.log(`FAIL  ${name}${detail ? '  (' + detail + ')' : ''}`); } };

const entry = (n) => `## ${n}. Something I did (2026-11-1${n % 10})\n\n**What I asked for**\n- text\n\n---\n\n`;
const log = `# Title\n\n## What I set out to build\ntext\n\n---\n\n${entry(1)}${entry(2)}${entry(3)}## Where AI misread me, or I had to correct course\n- (2026-11-12, entry 3) text\n\n## Decisions and abandoned ideas\n- text\n`;
check('three numbered entries count as 3', countEntries(log) === 3, String(countEntries(log)));
check('the version of that log is 0.3', versionFromLog(log) === `${MAJOR}.3` && versionFromLog(log) === '0.3', versionFromLog(log));
check('the same log with Windows line endings gives the same count', countEntries(log.replace(/\n/g, '\r\n')) === 3);
check('the three fixed headings are not entries', countEntries('## What I set out to build\n## Where AI misread me, or I had to correct course\n## Decisions and abandoned ideas\n') === 0);
check('a heading without a date, or with the number in the middle, is not an entry', countEntries('## 5. No date here\n## Step 6. Title (2026-11-01)\n### 7. Title (2026-11-01)\n') === 0);
check('an empty log, nothing, and a missing log give 0.0', versionFromLog('') === '0.0' && versionFromLog(undefined) === '0.0' && versionFromLog(null) === '0.0');
check('one more entry raises the version by one', countEntries(log + entry(4)) === 4 && versionFromLog(log + entry(4)) === '0.4');
check('an entry heading inside the text of another line is not counted twice', countEntries(`${entry(1)}see "## 2. Title (2026-11-01)" above\n`) === 1);

const real = readFileSync(new URL('../log.md', import.meta.url), 'utf8');
const numbers = [...real.replace(/\r\n/g, '\n').matchAll(/^## (\d+)\. .+ \(\d{4}-\d{2}-\d{2}\)$/gm)].map((m) => Number(m[1]));
check('in the real log.md the entries are numbered 1, 2, 3 ... with no gap, so the count is the last number', numbers.every((n, i) => n === i + 1) && countEntries(real) === numbers.at(-1), `${numbers.length} entries, last ${numbers.at(-1)}`);
check('the real version is 0.<last entry number>', versionFromLog(real) === `0.${numbers.at(-1)}`, versionFromLog(real));

if (failed) { console.log(`${failed} of ${count} version checks failed.`); process.exit(1); }
console.log(`All ${count} version checks passed.`);
