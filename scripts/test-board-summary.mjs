// The summary of another player's battlefield on their seat card (shared/board-summary.mjs). One check per behavior.
import { summarizeBoard, rowName, rowDetail, countersText } from '../shared/board-summary.mjs';

let checks = 0;
const same = (label, got, want) => { checks += 1; if (JSON.stringify(got) !== JSON.stringify(want)) { console.log('FAILED CHECK:', label, JSON.stringify(got), 'expected', JSON.stringify(want)); process.exit(1); } };
const card = (n, t, extra = {}) => ({ uid: `c${checks}${n}`, i: '00000000-0000-4000-8000-000000000001', n, t, tapped: false, ...extra });
const elf = (extra) => card('Llanowar Elves', 'Creature — Elf Druid', extra);
const forest = (extra) => card('Forest', 'Basic Land — Forest', extra);

const board = [elf(), elf({ tapped: true }), elf(), forest(), forest({ tapped: true }), card('Sol Ring', 'Artifact', { tapped: true })];
const kinds = summarizeBoard(board);
same('kinds come in the order creatures, other, lands, only those with cards', kinds.map((k) => [k.id, k.total, k.tapped]), [['creatures', 3, 1], ['other', 1, 1], ['lands', 2, 1]]);
same('copies of one card are one row with a count and how many are tapped', [rowName(kinds[0].rows[0]), rowDetail(kinds[0].rows[0])], ['Llanowar Elves ×3', '1 tapped']);
same('one tapped card just says tapped', rowDetail(kinds[1].rows[0]), 'tapped');
same('a token and a card with counters are rows of their own', summarizeBoard([elf(), elf({ tok: true }), elf({ ct: { p: 2 } })])[0].rows.map((r) => [rowName(r), rowDetail(r)]), [['Llanowar Elves', ''], ['Llanowar Elves', 'token'], ['Llanowar Elves', '+1/+1 ×2']]);
same('a face-down card is never named and has no picture', summarizeBoard([elf({ faceDown: true })])[0].rows.map((r) => [r.name, r.card]), [['Face-down card', null]]);
same('a two-sided card turned over is summed up by the face that shows', summarizeBoard([card('Delver of Secrets // Insectile Aberration', 'Creature — Human Wizard // Creature — Human Insect', { b: 1, turned: true })])[0].rows[0].name, 'Insectile Aberration');
same('the counters read in the usual order', countersText({ c: 1, p: 2, lore: 3 }), '+1/+1 ×2, Charge ×1, lore ×3');
same('an empty or missing battlefield has no kinds', [summarizeBoard([]), summarizeBoard(undefined)], [[], []]);

console.log(`All ${checks} board summary checks passed.`);
