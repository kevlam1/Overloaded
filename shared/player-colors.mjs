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
  const taken = new Set(entries.map(([, m]) => m.color).filter(isColorId));
  for (const [uid, member] of entries) if (isColorId(member.color)) out[uid] = member.color;
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
