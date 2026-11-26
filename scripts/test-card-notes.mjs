// The notes beside the Alt picture (shared/card-notes.mjs, shared/keyword-glossary.mjs). One check per behavior.
import { cardNotes } from '../shared/card-notes.mjs';
import { keywordNotes, GLOSSARY_ICONS } from '../shared/keyword-glossary.mjs';
import { MANA_ICONS } from '../shared/mana-icons.mjs';

let checks = 0;
const same = (label, got, want) => { checks += 1; if (JSON.stringify(got) !== JSON.stringify(want)) { console.log('FAILED CHECK:', label, JSON.stringify(got), 'expected', JSON.stringify(want)); process.exit(1); } };

same('a keyword the card does not explain, like Flying, gets its meaning and its icon', cardNotes({ k: ['Flying'] }).map((n) => [n.name, Boolean(n.text), n.icon]), [['Flying', true, 'ability-flying']]);
same('a keyword with no entry keeps its name, after the known ones', keywordNotes(['Squad', 'Haste']).map((n) => [n.name, n.text === null]), [['Haste', false], ['Squad', true]]);
same('the state comes first: summoning sick, then the counters, then the keywords', cardNotes({ sick: true, ct: { p: 2 }, k: ['Trample'] }).map((n) => n.name), ['Summoning sick', '+1/+1 counters ×2', 'Trample']);
same('a keyword counter says which keyword it gives', cardNotes({ ct: { flying: 1 } })[0].text.startsWith('Gives it flying'), true);
same('a face-down card shows nothing', cardNotes({ faceDown: true, k: ['Flying'], sick: true }), []);
same('every icon the glossary names is a Mana icon we have', GLOSSARY_ICONS.every((icon) => MANA_ICONS.includes(`ability-${icon}`)), true);

console.log(`All ${checks} card note checks passed.`);
