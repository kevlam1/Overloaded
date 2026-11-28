// The Shared view's plane (Kevin, 2026-11-25): every player's battlefield on ONE grid of square cells, where anyone may move any card.
// The plane is 236 by 130 cells. Each player has a home of 112 by 50 (the solo board's size): with 2 players one at the bottom and one at the top, centred; with 3 or 4,
// the four corners (seat order: bottom right, bottom left, top left, top right, so turns go clockwise and seats 1 and 2 share a side, Kevin 2026-11-28), with a gap of 12 cells between the left and right homes (2026-11-26 feedback; it was 224
// with none). The band between them, rows 50 to 80, is the commons: no one's. The homes along the top face the top edge: their cards are drawn turned (facingOf), and a
// player sitting there sees the plane turned so their home is at the bottom.
// A card's place on the plane is its plane entry (tables/{code}/plane/{seat}/{uid}: { x, y, z, by, m }) when it has one for this match, else its owner's home plus its own
// cell there (px/py, the same cell the other views use). Plain data, no browser code.
import { CARD_COLS, CARD_ROWS } from './board-grid.mjs';

export const SIDE_GAP = 12;
export const PILE_COLS = 16; // (Kevin, 2026-11-28) a column of piles at each outer edge: the two command zones side by side, then exile, library and graveyard
export const PILE_ROWS = 50;
export const EDGE = PILE_COLS + 2; // the pile column and 2 cells between it and the area
export const PLANE_COLS = 2 * EDGE + 224 + SIDE_GAP;
export const PLANE_ROWS = 130;
export const HOME_COLS = 112;
export const HOME_ROWS = 50;
export const COMMONS = { top: 50, bottom: 80 };
export const MAX_X = PLANE_COLS - CARD_COLS;
export const MAX_Y = PLANE_ROWS - CARD_ROWS;
const LEFT = EDGE;
const RIGHT = EDGE + HOME_COLS + SIDE_GAP;
// bottom right, bottom left, top left, top right: turns go clockwise round the table, 1 and 2 side by side, 3 across from 1 (Kevin, 2026-11-28)
const CORNERS = [[RIGHT, 80], [LEFT, 80], [LEFT, 0], [RIGHT, 0]];

const whole = (n, low, high) => Number.isInteger(n) && n >= low && n <= high;

// The home of a seat, given every seat at the table ('1' to '4'): { x, y, w, h }, or null for a seat that is not there.
export function homeOf(seat, seats) {
  const order = [...new Set((seats ?? []).map(String))].sort();
  const index = order.indexOf(String(seat));
  if (index === -1) return null;
  const [x, y] = order.length <= 2 ? [(PLANE_COLS - HOME_COLS) / 2, index === 0 ? 80 : 0] : CORNERS[index];
  return { x, y, w: HOME_COLS, h: HOME_ROWS };
}

// A stored plane entry, read strictly for this match: { x, y, z } or null.
export function readPlaneEntry(raw, match) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (!whole(raw.x, 0, MAX_X) || !whole(raw.y, 0, MAX_Y) || !whole(raw.z, 0, 1000000) || raw.m !== match) return null;
  return { x: raw.x, y: raw.y, z: raw.z };
}

// Where a card shows on the plane, as { col, row }: its entry, else its cell in its owner's home (kept inside the home), else the home's top left.
export function planeCell(cell, entry, home) {
  if (entry) return { col: entry.x, row: entry.y };
  if (!home) return null;
  const col = Number.isInteger(cell?.col) ? Math.min(Math.max(cell.col, 0), HOME_COLS - CARD_COLS) : 0;
  const row = Number.isInteger(cell?.row) ? Math.min(Math.max(cell.row, 0), HOME_ROWS - CARD_ROWS) : 0;
  return { col: home.x + col, row: home.y + row };
}

// The entry to store for a card moved to `cell` on the plane (kept on the plane), or null for a cell that is no cell.
export function entryFor(cell, z, by, match) {
  if (!Number.isInteger(cell?.col) || !Number.isInteger(cell?.row)) return null;
  return { x: Math.min(Math.max(cell.col, 0), MAX_X), y: Math.min(Math.max(cell.row, 0), MAX_Y), z: whole(z, 0, 1000000) ? z : 0, by, m: match };
}

// Which way a seat's home faces, in quarter turns: 2 (half a turn) for a home along the top edge, else 0. Its cards are drawn turned by it, and its player's view of the
// plane is turned by it, so their own home is at the bottom and their cards upright (2026-11-26 feedback: everyone sees the table from their own seat).
export function facingOf(seat, seats) {
  const home = homeOf(seat, seats);
  return home && home.y === 0 ? 2 : 0;
}

// The corner of a seat's area as one player sees the table, for the 2 by 2 of the Grid view with four players (Kevin, 2026-11-28: the same seating as the Shared view):
// 'bl', 'br', 'tr' or 'tl'. The viewer's own side is at the bottom: seats 3 and 4 see the table turned half a turn.
export function cornerOf(seat, seats, viewerSeat) {
  const home = homeOf(seat, seats);
  if (!home) return null;
  let left = home.x < PLANE_COLS / 2 - HOME_COLS / 2; let bottom = home.y !== 0;
  if (facingOf(viewerSeat, seats) === 2) { left = !left; bottom = !bottom; }
  return `${bottom ? 'b' : 't'}${left ? 'l' : 'r'}`;
}

// Where a seat's piles lie on the plane (Kevin, 2026-11-28): a column of PILE_COLS by PILE_ROWS beside its area, at the outer edge of the table (the left edge for an area on
// the left, the right edge for one on the right; with two players, to the right of the area). { x, y, w, h } in cells, or null for a seat that is not there.
export function pilesOf(seat, seats) {
  const home = homeOf(seat, seats);
  if (!home) return null;
  const onLeft = home.x + HOME_COLS / 2 < PLANE_COLS / 2;
  const twoPlayers = [...new Set((seats ?? []).map(String))].length <= 2;
  const x = onLeft && !twoPlayers ? home.x - EDGE : home.x + HOME_COLS + 2;
  return { x, y: home.y, w: PILE_COLS, h: PILE_ROWS };
}

