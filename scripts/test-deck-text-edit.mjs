// Tests for shared/deck-text-edit.mjs: rewriting a card's line to name another printing.
import { setPrintingInText } from '../shared/deck-text-edit.mjs';
import { parseDeckText } from '../shared/deck-text.mjs';
import { makePreview } from '../shared/deck-preview.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };
const check = (label, condition, detail = '') => { checks++; if (!condition) fail(label, detail); };

const TEXT = ['Commander', '1 Krenko, Mob Boss (SLD) 2407 *F*', '', 'DECK:', '2 Sol Ring', 'Thrasios, Triton Hero', '1 Sol Ring (cmm) 5', 'SIDEBOARD:', '1 Annul (cmm) 5'].join('\n');
const printing = { set: 'cmm', number: '410' };

same('a line with no printing gets one, keeping its quantity', setPrintingInText(TEXT, [5], 'Sol Ring', printing).text.split('\n')[4], '2 Sol Ring (CMM) 410');
same('a line with a printing gets another, and the foil mark stays', setPrintingInText(TEXT, [2], 'Krenko, Mob Boss', { set: 'sld', number: '916' }).text.split('\n')[1], '1 Krenko, Mob Boss (SLD) 916 *F*');
same('a line with no number at all is counted as 1 and written out', setPrintingInText(TEXT, [6], 'Thrasios, Triton Hero', printing).text.split('\n')[5], '1 Thrasios, Triton Hero (CMM) 410');
same('null takes the printing off (the default)', setPrintingInText(TEXT, [9], 'Annul', null).text.split('\n')[8], '1 Annul');
same('...and keeps the foil mark', setPrintingInText(TEXT, [2], 'Krenko, Mob Boss', null).text.split('\n')[1], '1 Krenko, Mob Boss *F*');
const two = setPrintingInText(TEXT, [5, 7], 'Sol Ring', printing);
same('several lines of one card are all rewritten', [two.changed, two.text.split('\n')[4], two.text.split('\n')[6]], [2, '2 Sol Ring (CMM) 410', '1 Sol Ring (CMM) 410']);
same('every other line is exactly as it was', two.text.split('\n').filter((_, i) => ![4, 6].includes(i)), TEXT.split('\n').filter((_, i) => ![4, 6].includes(i)));
same('the same printing again changes nothing', setPrintingInText('1 Sol Ring (CMM) 410', [1], 'Sol Ring', printing), { text: '1 Sol Ring (CMM) 410', changed: 0 });
same('a line that is not a card line, a line that does not exist and a repeated number are left alone', [setPrintingInText(TEXT, [1, 4, 99, 0, -1, 1.5], 'Sol Ring', printing).changed, setPrintingInText(TEXT, [5, 5, 5], 'Sol Ring', printing).changed], [0, 1]);
same('windows line ends are read and the text comes back with plain ones', setPrintingInText('1 Sol Ring\r\n1 Island', [1], 'Sol Ring', printing).text, '1 Sol Ring (CMM) 410\n1 Island');
same('a printing that is not one changes nothing', [setPrintingInText(TEXT, [5], 'Sol Ring', { set: 'cm m', number: '1' }).changed, setPrintingInText(TEXT, [5], 'Sol Ring', { set: 'cmm', number: '4 10' }).changed, setPrintingInText(TEXT, [5], 'Sol Ring', { set: 'cmm', number: '4/10' }).changed, setPrintingInText(TEXT, [5], 'Sol Ring', { set: 'cmm' }).changed, setPrintingInText(TEXT, [5], 'Sol Ring', undefined).changed, setPrintingInText(TEXT, [5], 'Sol Ring', 'cmm 410').changed], [0, 0, 0, 0, 0, 0]);
same('a name that is empty or holds a line break, and bad input, change nothing', [setPrintingInText(TEXT, [5], '', printing).changed, setPrintingInText(TEXT, [5], 'Sol\nRing', printing).changed, setPrintingInText(null, [5], 'Sol Ring', printing), setPrintingInText(TEXT, 5, 'Sol Ring', printing).changed, setPrintingInText(TEXT, [5], 7, printing).changed], [0, 0, { text: '', changed: 0 }, 0, 0]);

// what the player sees after: the same cards, the same quantities and sections, and only the printing differs
const before = parseDeckText(TEXT).entries;
const after = parseDeckText(setPrintingInText(TEXT, [5, 7], 'Sol Ring', printing).text).entries;
same('the deck is the same cards in the same sections after the change, and the two Sol Ring lines name the printing', [after.map((e) => [e.qty, e.name, e.section]), after.filter((e) => e.name === 'Sol Ring').map((e) => `${e.set} ${e.number}`)], [before.map((e) => [e.qty, e.name, e.section]), ['cmm 410', 'cmm 410']]);

// a preview line knows the text lines it came from
const parsed = parseDeckText('1 Sol Ring\n2 Island\n1 Sol Ring\n1 Sol Ring (cmm) 410');
const matched = { results: parsed.entries.map((entry) => ({ entry, status: 'matched', card: { i: `id-${entry.name}`, n: entry.name, t: 'Artifact', m: '{1}', k: [] }, candidates: [], method: 'exact' })) };
const lines = makePreview(parsed, matched).lines;
check('a merged preview line lists every text line that holds the card (without the set files a typed printing cannot be told apart, so line 4 merges too)', JSON.stringify(lines.map((l) => [l.name, l.sourceLines])) === JSON.stringify([['Sol Ring', [1, 3, 4]], ['Island', [2]]]), JSON.stringify(lines.map((l) => [l.name, l.sourceLines])));

console.log(`All ${checks} deck text edit checks passed.`);
