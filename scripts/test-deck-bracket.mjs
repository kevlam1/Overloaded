// Tests for shared/deck-bracket.mjs: the bracket guess from the number of Game Changers, and which cards count.
import { guessBracket, gameChangersIn, bracketNote, BRACKETS, MAX_GAME_CHANGERS_BRACKET_3 } from '../shared/deck-bracket.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };

same('the brackets', [BRACKETS, MAX_GAME_CHANGERS_BRACKET_3], [[1, 2, 3, 4, 5], 3]);
same('no Game Changers is bracket 2, one to three is 3, four or more is 4', [0, 1, 2, 3, 4, 5, 12, 53].map(guessBracket), [2, 3, 3, 3, 4, 4, 4, 4]);
same('anything that is not a positive whole number counts as none', [-1, 1.5, NaN, undefined, null, '3', Infinity].map(guessBracket), [2, 2, 2, 2, 2, 2, 2]);
const line = (n, gc, section = 'main', qty = 1, status = 'matched') => ({ section, qty, status, card: status === 'matched' ? { n, ...(gc ? { gc: 1 } : {}) } : null });
const lines = [line('Sol Ring', false), line('Rhystic Study', true), line('Cyclonic Rift', true), line('Krenko, Mob Boss', false, 'commander'), line('Mana Vault', true, 'main', 1), line('Demonic Tutor', true, 'sideboard'), line('Gamble', true, 'maybeboard'), line('Force of Will', true, 'companion'), line('Chrome Mox', true, 'unlabeled'), line('Not a card', true, 'main', 1, 'not_found')];
const found = gameChangersIn(lines);
same('Game Changers in the main deck, the commander and cards after a blank line count; the sideboard, companion, maybeboard and unmatched lines do not', found, { count: 4, names: ['Chrome Mox', 'Cyclonic Rift', 'Mana Vault', 'Rhystic Study'] });
same('a Game Changer that is the commander counts', gameChangersIn([line('Braids, Cabal Minion', true, 'commander')]), { count: 1, names: ['Braids, Cabal Minion'] });
same('copies count each, a name is listed once', gameChangersIn([line('Rhystic Study', true, 'main', 3)]), { count: 3, names: ['Rhystic Study'] });
same('nothing, bad lines and bad input count none', [gameChangersIn([]), gameChangersIn(null), gameChangersIn([null, undefined, {}, { status: 'matched' }]), gameChangersIn([{ ...line('X', true), qty: -2 }]).count], [{ count: 0, names: [] }, { count: 0, names: [] }, { count: 0, names: [] }, 0]);
same('the guess for the deck above is bracket 4 (four Game Changers)', guessBracket(found.count), 4);
same('the words', [bracketNote(found), bracketNote({ count: 1, names: ['Sol Ring'] }), bracketNote({ count: 0, names: [] }), bracketNote(null)], ['4 Game Changers: Chrome Mox, Cyclonic Rift, Mana Vault, Rhystic Study', '1 Game Changer: Sol Ring', 'No Game Changers', 'No Game Changers']);

console.log(`All ${checks} deck bracket checks passed.`);
