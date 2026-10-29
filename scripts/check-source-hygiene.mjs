// Do any tracked code files hide characters a person cannot see? Invisible characters and text-direction controls in
// source code cannot be reviewed (what you read is not what runs; this is how "Trojan Source" attacks work), and they
// crept into this project twice by accident (the deck parser on 2026-10-26 and the name cleaner on 2026-10-28, because
// the editing tool turned an escape for a zero-width space into the real character). It lists every code file that
// contains one, and also any non-printing control character other than tab, newline and carriage return.
// Run: node scripts/check-source-hygiene.mjs   (needs git; it reads the files git tracks and new ones it does not ignore)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

const CODE = new Set(['.js', '.mjs', '.cjs', '.json', '.html', '.css']);
// Written as numbers so this file is itself plain ASCII: [first, last] or a single value.
const FORBIDDEN = [
  [0x0000, 0x0008], [0x000B, 0x000C], [0x000E, 0x001F], [0x007F, 0x009F], // controls (not tab, newline, carriage return)
  [0x00AD], [0x034F], [0x061C], [0x115F, 0x1160], [0x180E],               // soft hyphen, joiner, Arabic mark, fillers
  [0x200B], [0x200C], [0x200D], [0x200E, 0x200F],                          // zero-width characters and direction marks
  [0x2028, 0x2029], [0x202A, 0x202E], [0x2060, 0x206F],                    // separators, embeddings and overrides, isolates
  [0x2800], [0x3164], [0xFEFF], [0xFFA0], [0xFFF9, 0xFFFB],                // braille blank, fillers, byte order mark, annotation marks
];
const forbidden = (code) => FORBIDDEN.some(([first, last = first]) => code >= first && code <= last);

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\n').filter((f) => f && CODE.has(extname(f)));
const problems = [];
for (const file of files) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { continue; } // a tracked file that was deleted in the working copy
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    const found = [...line].filter((ch) => forbidden(ch.codePointAt(0))).map((ch) => 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'));
    if (found.length) problems.push(`${file}:${index + 1}: ${[...new Set(found)].join(' ')} (${found.length})`);
  });
}
if (problems.length) {
  console.log('Hidden characters found in code files:');
  for (const p of problems) console.log('  ' + p);
  console.log(`\n${problems.length} line(s) in ${new Set(problems.map((p) => p.split(':')[0])).size} file(s). Rewrite them as escapes or build them from numbers, so the source can be read.`);
  process.exit(1);
}
console.log(`All ${files.length} tracked code files are free of hidden and direction-changing characters.`);
