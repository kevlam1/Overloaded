// Draws one of the Mana icons (shared/mana-icons.mjs) as a small element that takes its colour from the text colour: the svg is used as a mask over a block of currentColor, so one file serves every
// colour and size (set the size in a style sheet, or with the font size). Returns null for a name we have no icon for. The icon is decoration: pass `label` to give it a name for a screen reader.
import { manaIconUrl } from '../../shared/mana-icons.mjs';

export function manaIcon(name, { className = '', label = '' } = {}) {
  const url = manaIconUrl(name);
  if (!url) return null;
  const element = document.createElement('span');
  element.className = `mana-icon${className ? ` ${className}` : ''}`;
  element.dataset.icon = name;
  element.style.setProperty('--icon', `url("${url}")`); // (set on the element through the style object: the page's content policy allows that, and forbids a style attribute in the markup)
  if (label) { element.setAttribute('role', 'img'); element.setAttribute('aria-label', label); } else element.setAttribute('aria-hidden', 'true');
  return element;
}
