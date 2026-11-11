// Draws the numbers below a deck (shared/deck-stats.mjs works them out): the mana curve, how much of each color the costs ask for, the cards by type, and the averages. Also the
// one-line strip of facts at the top of the deck. Bars are plain elements with their numbers written beside them, so nothing depends on seeing the bar. Everything is text, never markup.
import { COLOR_KEYS } from '../../shared/deck-stats.mjs';
import { CATEGORY_ORDER, CATEGORY_TITLES } from '../../shared/deck-view.mjs';
import { COLOR_NAMES } from '../../shared/deck-colors.mjs';
import { manaNode } from './mana-pips.js';

function make(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}
const decimal = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const percent = (share) => `${Math.round(share * 100)}%`;
const COLOR_WORDS = { ...COLOR_NAMES, C: 'colorless' };

function panel(title, note) {
  const box = make('section', 'stat-panel');
  const head = make('div', 'stat-head');
  head.append(make('h3', '', title));
  if (note) head.append(make('span', 'stat-note', note));
  box.append(head);
  return box;
}

function curvePanel(stats) {
  const box = panel('Mana curve', `${stats.spells} ${stats.spells === 1 ? 'spell' : 'spells'}`);
  const bars = make('div', 'curve');
  bars.setAttribute('role', 'list');
  for (const column of stats.curve) {
    const count = column.permanents + column.spells;
    const item = make('div', 'curve-column');
    item.setAttribute('role', 'listitem');
    item.setAttribute('aria-label', `Mana value ${column.value === stats.curve.length - 1 ? `${column.value} or more` : column.value}: ${count} ${count === 1 ? 'card' : 'cards'}, ${column.permanents} permanents and ${column.spells} instants or sorceries`);
    item.title = `${count} ${count === 1 ? 'card' : 'cards'}: ${column.permanents} permanents, ${column.spells} instants and sorceries`;
    item.append(make('span', 'curve-count', count > 0 ? String(count) : ''));
    const track = make('span', 'curve-track');
    const scale = stats.curveMax > 0 ? 100 / stats.curveMax : 0;
    const spells = make('span', 'curve-spells');
    spells.style.height = `${column.spells * scale}%`;
    const permanents = make('span', 'curve-permanents');
    permanents.style.height = `${column.permanents * scale}%`;
    track.append(spells, permanents);
    item.append(track, make('span', 'curve-label', column.value === stats.curve.length - 1 ? `${column.value}+` : String(column.value)));
    bars.append(item);
  }
  const legend = make('p', 'curve-legend');
  legend.append(make('span', 'key permanents', 'Permanents'), make('span', 'key spells', 'Instants and sorceries'));
  box.append(bars, legend);
  return box;
}

function colorPanel(stats) {
  const box = panel('Color requirements', 'Mana symbols in costs');
  const rows = make('div', 'color-rows');
  const colors = [...COLOR_KEYS, 'C'].filter((key) => stats.pips[key] > 0);
  if (colors.length === 0) rows.append(make('p', 'stat-empty', 'No colored mana symbols in this deck.'));
  for (const key of colors) {
    const row = make('div', 'color-row');
    const amount = Math.round(stats.pips[key] * 10) / 10;
    const label = `${COLOR_WORDS[key]}: ${decimal(amount)} ${amount === 1 ? 'symbol' : 'symbols'}, ${percent(stats.shares[key])} of all`;
    row.setAttribute('aria-label', label);
    row.title = label;
    const icon = manaNode(`{${key}}`);
    icon.classList.add('color-icon');
    const bar = make('span', 'color-bar');
    const fill = make('span', `color-fill color-${key}`);
    fill.style.width = `${stats.shares[key] * 100}%`;
    bar.append(fill);
    row.append(icon, bar, make('span', 'color-value', `${decimal(Math.round(stats.pips[key] * 10) / 10)} · ${percent(stats.shares[key])}`));
    rows.append(row);
  }
  box.append(rows, make('p', 'stat-footnote', 'A hybrid symbol is split evenly between its colors. Generic mana is not counted.'));
  return box;
}

function typePanel(stats) {
  const box = panel('Card types', `${stats.total} cards`);
  const rows = make('div', 'type-rows');
  const most = Math.max(1, ...CATEGORY_ORDER.map((key) => stats.types[key]));
  for (const key of CATEGORY_ORDER) {
    if (stats.types[key] === 0) continue;
    const row = make('div', 'type-row');
    const bar = make('span', 'type-bar');
    const fill = make('span', 'type-fill');
    fill.style.width = `${(stats.types[key] / most) * 100}%`;
    bar.append(fill);
    row.append(make('span', 'type-name', CATEGORY_TITLES[key]), bar, make('span', 'type-count', String(stats.types[key])));
    rows.append(row);
  }
  const averages = make('p', 'stat-footnote');
  averages.textContent = `Average mana value ${decimal(Math.round(stats.averageWithoutLands * 100) / 100)} without lands, ${decimal(Math.round(stats.averageWithLands * 100) / 100)} with. Median ${decimal(stats.medianWithoutLands)} without lands, ${decimal(stats.medianWithLands)} with.`;
  box.append(rows, averages);
  return box;
}

// The three panels, in container (the section below the deck). Empty for a deck with no cards.
export function renderDeckInfo(container, stats) {
  container.replaceChildren();
  container.hidden = stats.total === 0;
  if (stats.total === 0) return;
  container.append(make('h2', '', 'About this deck'), (() => { const grid = make('div', 'stat-grid'); grid.append(curvePanel(stats), colorPanel(stats), typePanel(stats)); return grid; })());
}

// The strip of facts at the top of the deck: cards, lands, the average mana value, the colors the costs use.
export function renderDeckFacts(container, stats) {
  container.replaceChildren();
  container.hidden = stats.total === 0;
  if (stats.total === 0) return;
  const fact = (label, value) => { const item = make('span', 'fact'); item.append(make('span', 'fact-label', label), typeof value === 'string' ? make('strong', '', value) : value); return item; };
  container.append(
    fact('Cards', String(stats.total)),
    fact('Lands', String(stats.lands)),
    fact('Avg mana value', decimal(Math.round(stats.averageWithoutLands * 100) / 100)),
  );
  const used = COLOR_KEYS.filter((key) => stats.pips[key] > 0);
  const colors = used.length ? manaNode(used.map((key) => `{${key}}`).join('')) : make('strong', '', stats.pipTotal > 0 ? 'Colorless' : 'None');
  colors.classList.add('fact-colors');
  container.append(fact('Colors', colors));
}
