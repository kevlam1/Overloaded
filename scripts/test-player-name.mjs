// Tests for shared/player-name.mjs. Run: node scripts/test-player-name.mjs
import { cleanPlayerName, NAME_MAX } from '../shared/player-name.mjs';

let checks = 0;
function check(label, condition) {
  if (!condition) { console.error('FAILED:', label); process.exit(1); }
  checks++;
}
const fails = (input) => { try { cleanPlayerName(input); return false; } catch (error) { return error instanceof Error && error.message.length > 0; } };

check('limit matches the database rule (30)', NAME_MAX === 30);
check('a plain name is kept', cleanPlayerName('Kevin') === 'Kevin');
check('trims the ends', cleanPlayerName('  Kevin  ') === 'Kevin');
check('collapses runs of spaces and tabs', cleanPlayerName('Ana \t  Maria') === 'Ana Maria');
check('collapses a newline from a paste', cleanPlayerName('Kevin\n') === 'Kevin');
check('30 characters is allowed', cleanPlayerName('x'.repeat(30)) === 'x'.repeat(30));
check('31 characters is refused', fails('x'.repeat(31)));
check('empty is refused', fails(''));
check('only spaces is refused', fails('   \t '));
check('missing is refused', fails(undefined) && fails(null));
check('a number is turned into text, not refused', cleanPlayerName(42) === '42');
check('characters outside the basic plane count as one each (30 emoji is allowed)', cleanPlayerName('\u{1F40D}'.repeat(30)) === '\u{1F40D}'.repeat(30));
check('31 emoji is refused', fails('\u{1F40D}'.repeat(31)));
check('the message for an empty name says to type one', (() => { try { cleanPlayerName(''); } catch (e) { return /name/i.test(e.message); } return false; })());
check('the message for a long name says the limit', (() => { try { cleanPlayerName('x'.repeat(31)); } catch (e) { return e.message.includes('30'); } return false; })());

console.log(`All ${checks} player name checks passed.`);
