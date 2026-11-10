// Tests for shared/deck-commander.mjs: which commander choices a card offers and what each does to the two picks.
import { commanderMenuItems, applyCommanderChoice, commanderChoiceMessage, PICKABLE_SECTIONS } from '../shared/deck-commander.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };

const line = (id, section = 'main', status = 'matched') => ({ status, section, card: status === 'matched' ? { i: id } : null });
const ids = (items) => items.map((i) => i.id);
const C = { commanderFormat: true };

same('the sections a commander can come from', PICKABLE_SECTIONS, ['main', 'commander', 'unlabeled']);
same('a card in a Commander deck with no commander yet: make commander or partner', ids(commanderMenuItems(line('a'), ['', ''], C)), ['commander', 'partner']);
same('with a commander already, the words say the choice replaces it', commanderMenuItems(line('b'), ['a', ''], C).map((i) => i.label), ['Make commander (replaces the current one)', 'Make partner']);
same('with both places taken, both replace', commanderMenuItems(line('c'), ['a', 'b'], C).map((i) => i.label), ['Make commander (replaces the current one)', 'Make partner (replaces the current one)']);
same('the commander itself can only be un-picked', [ids(commanderMenuItems(line('a'), ['a', ''], C)), ids(commanderMenuItems(line('a'), ['a', 'b'], C))], [['unpick'], ['unpick']]);
same('the partner can be un-picked or made the commander', ids(commanderMenuItems(line('b'), ['a', 'b'], C)), ['unpick', 'commander']);
same('nothing is offered in Standard, for a sideboard, companion or maybeboard card, or an unmatched line', [ids(commanderMenuItems(line('a'), ['', ''], { commanderFormat: false })), ids(commanderMenuItems(line('a', 'sideboard'), ['', ''], C)), ids(commanderMenuItems(line('a', 'companion'), ['', ''], C)), ids(commanderMenuItems(line('a', 'maybeboard'), ['', ''], C)), ids(commanderMenuItems(line('a', 'main', 'not_found'), ['', ''], C))], [[], [], [], [], []]);
same('a card after a blank line (unlabeled) can be picked', ids(commanderMenuItems(line('a', 'unlabeled'), ['', ''], C)), ['commander', 'partner']);
same('bad input gives no menu', [commanderMenuItems(null, ['', ''], C), commanderMenuItems(undefined, undefined, C), commanderMenuItems({}, ['', ''], C)], [[], [], []]);

same('make commander with none', applyCommanderChoice(['', ''], 'commander', 'a'), ['a', '']);
same('make commander replaces the old one, which is simply out', applyCommanderChoice(['a', ''], 'commander', 'b'), ['b', '']);
same('...and keeps the partner', applyCommanderChoice(['a', 'p'], 'commander', 'b'), ['b', 'p']);
same('making the partner the commander swaps them', applyCommanderChoice(['a', 'p'], 'commander', 'p'), ['p', 'a']);
same('make partner', applyCommanderChoice(['a', ''], 'partner', 'p'), ['a', 'p']);
same('make partner replaces the old partner', applyCommanderChoice(['a', 'p'], 'partner', 'q'), ['a', 'q']);
same('a partner with no commander becomes the commander', applyCommanderChoice(['', ''], 'partner', 'p'), ['p', '']);
same('the commander made the partner (there was none) leaves a deck with one commander: the partner', applyCommanderChoice(['a', ''], 'partner', 'a'), ['a', '']);
same('un-pick the commander: the partner steps up', applyCommanderChoice(['a', 'p'], 'unpick', 'a'), ['p', '']);
same('un-pick the partner', applyCommanderChoice(['a', 'p'], 'unpick', 'p'), ['a', '']);
same('un-pick the only commander', applyCommanderChoice(['a', ''], 'unpick', 'a'), ['', '']);
same('un-pick a card that is not a commander changes nothing', applyCommanderChoice(['a', 'p'], 'unpick', 'z'), ['a', 'p']);
same('bad input changes nothing and the same card is never both', [applyCommanderChoice(['a', 'p'], 'commander', ''), applyCommanderChoice(['a', 'p'], 'commander', 5), applyCommanderChoice(['a', 'p'], 'sideways', 'z'), applyCommanderChoice(undefined, 'commander', 'a'), applyCommanderChoice(['a', 'a'], 'unpick', 'q')], [['a', 'p'], ['a', 'p'], ['a', 'p'], ['a', ''], ['a', '']]);
same('the words', [commanderChoiceMessage('commander', 'Krenko'), commanderChoiceMessage('partner', 'Tymna'), commanderChoiceMessage('unpick', 'Krenko')], ['Krenko is now the commander.', 'Tymna is now the partner.', 'Krenko is no longer a commander.']);

console.log(`All ${checks} deck commander checks passed.`);
