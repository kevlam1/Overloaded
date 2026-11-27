// The colors a player can pick in the lobby (Kevin, 2026-11-25): ten named colors, stored on the player's seat as `color` (one of the ids). A player who has not picked one has
// the default of their seat. Two players at a table do not share a color: the lobby offers only the free ones (the database does not check that; it is only a look).
// The color shows on their stripe, their nameplate dot and their seat card. Plain data, no browser code.

export const PLAYER_COLORS = [
  { id: 'ruby', name: 'Ruby', value: '#e0505e' },
  { id: 'amber', name: 'Amber', value: '#e8894a' },
  { id: 'gold', name: 'Gold', value: '#d9b45f' },
  { id: 'emerald', name: 'Emerald', value: '#3fbf74' },
  { id: 'jade', name: 'Jade', value: '#4fb3a5' },
  { id: 'azure', name: 'Azure', value: '#4f9be0' },
  { id: 'amethyst', name: 'Amethyst', value: '#9b8cf0' },
  { id: 'rose', name: 'Rose', value: '#e07aa8' },
  { id: 'pearl', name: 'Pearl', value: '#e6e1d6' },
  { id: 'obsidian', name: 'Obsidian', value: '#6b6f80' }, // (a smoky grey, not black: black would not show on the dark table)
];
export const COLOR_IDS = PLAYER_COLORS.map((color) => color.id);
const SEAT_DEFAULTS = { 1: 'gold', 2: 'jade', 3: 'amethyst', 4: 'amber' };

export const isColorId = (id) => typeof id === 'string' && COLOR_IDS.includes(id);
export const colorById = (id) => PLAYER_COLORS.find((color) => color.id === id) ?? null;

// The color each player shows, by uid: their own pick, else their seat's default, else the first free color (so two players never look the same,
// even when one picked the color another had by default). members: { uid: { seat, color? } }.
export function tableColors(members) {
  const out = {};
  const entries = Object.entries(members ?? {}).filter(([, m]) => m && typeof m === 'object').sort((a, b) => Number(a[1].seat) - Number(b[1].seat));
  // A picked color belongs to the lowest seat that picked it (two players can pick one color at the same moment: the database does not stop it); a later seat that
  // picked the same color gets a default like a player who picked nothing. Every page works this out the same way, so everyone sees the same colors (2026-11-26).
  const taken = new Set();
  for (const [uid, member] of entries) if (isColorId(member.color) && !taken.has(member.color)) { out[uid] = member.color; taken.add(member.color); }
  for (const [uid, member] of entries) {
    if (out[uid]) continue;
    const wanted = SEAT_DEFAULTS[member.seat];
    const pick = wanted && !taken.has(wanted) ? wanted : COLOR_IDS.find((id) => !taken.has(id)) ?? 'gold';
    out[uid] = pick;
    taken.add(pick);
  }
  return out;
}

// The colors another player has (by their pick or their default): the ones this player cannot pick.
export function takenColors(members, myUid) {
  const shown = tableColors(members);
  return new Map(Object.entries(shown).filter(([uid]) => uid !== myUid).map(([uid, id]) => [id, uid]));
}

// The CSS value of a color id (the default gold for anything else).
export const colorValue = (id) => colorById(id)?.value ?? colorById('gold').value;

// ---- The accent (Kevin, 2026-11-26: "the UI is still yellow even if I chose Azure; color should follow everywhere") ----
// The site's accent is the player's own color. On the light theme it is darkened (a light color such as Pearl would not show on white), and the text on it is
// dark or light, whichever reads better (WCAG contrast). All plain math, so Node tests can check it.
const channels = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
const toHex = (rgb) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const luminance = (hex) => {
  const [r, g, b] = channels(hex).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const DARK_INK = '#16120a';
const LIGHT_INK = '#ffffff';
export const inkOn = (hex) => (contrast(hex, DARK_INK) >= contrast(hex, LIGHT_INK) ? DARK_INK : LIGHT_INK);
// The accent for a color id and a theme: { accent, ink }. The light theme darkens the color until it has at least 3:1 against white (the WCAG level for large text
// and parts of the interface), in small steps so a color keeps its hue.
export function accentFor(id, theme = 'dark') {
  let accent = colorById(id)?.value ?? colorById('gold').value;
  if (theme === 'light') { let rgb = channels(accent); while (contrast(toHex(rgb), '#ffffff') < 3) rgb = rgb.map((v) => v * 0.92); accent = toHex(rgb); }
  return { accent, ink: inkOn(accent) };
}
