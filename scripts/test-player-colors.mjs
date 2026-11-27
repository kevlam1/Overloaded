// The players' colors (shared/player-colors.mjs). One check per behavior.
import { PLAYER_COLORS, tableColors, takenColors, isColorId, colorValue, accentFor, contrast } from '../shared/player-colors.mjs';

let checks = 0;
const same = (label, got, want) => { checks += 1; if (JSON.stringify(got) !== JSON.stringify(want)) { console.log('FAILED CHECK:', label, JSON.stringify(got), 'expected', JSON.stringify(want)); process.exit(1); } };

same('there are ten colors, each with its own id, name and value', [PLAYER_COLORS.length, new Set(PLAYER_COLORS.map((c) => c.id)).size, new Set(PLAYER_COLORS.map((c) => c.value)).size], [10, 10, 10]);
same('a player who has not picked one has their seat\'s default', tableColors({ a: { seat: '1' }, b: { seat: '2' }, c: { seat: '3' }, d: { seat: '4' } }), { a: 'gold', b: 'jade', c: 'amethyst', d: 'amber' });
same('a pick wins, and a default someone else picked moves to a free color', tableColors({ a: { seat: '1' }, b: { seat: '2', color: 'gold' } }), { b: 'gold', a: 'ruby' });
same('the colors another player shows are taken for me, mine are not', [...takenColors({ a: { seat: '1', color: 'azure' }, b: { seat: '2' } }, 'a').keys()], ['jade']);
same('only the ten ids are colors', [isColorId('ruby'), isColorId('red'), isColorId(undefined)], [true, false, false]);
same('an unknown id draws as gold', colorValue('nope'), colorValue('gold'));

// the accent (your color as the site's accent, 2026-11-26)
same('the accent of every color has readable text on it (4.5:1) in both themes', PLAYER_COLORS.every((c) => ['dark', 'light'].every((theme) => { const a = accentFor(c.id, theme); return contrast(a.accent, a.ink) >= 4.5; })), true);
same('on the light theme every accent shows on white (3:1)', PLAYER_COLORS.every((c) => contrast(accentFor(c.id, 'light').accent, '#ffffff') >= 3), true);
same('on the dark theme the accent is the color itself', accentFor('azure', 'dark').accent, colorValue('azure'));
same('a light color is darkened on the light theme (Pearl)', accentFor('pearl', 'light').accent !== colorValue('pearl'), true);

console.log(`All ${checks} player color checks passed.`);
