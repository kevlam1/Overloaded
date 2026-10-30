// Sample decks a visitor can load without finding a decklist first (Kevin, 2026-10-30). Plain data and one lookup, no browser or
// network code, so Node tests can load it and the deck page and the solo table's link can share it. A sample is only TEXT in the
// pasted-list format: the deck page puts it in the paste box and checks it like any other list, and nothing is saved until the
// player saves it. The `Commander` line on top marks the first card as the commander for certain (without it the page would
// only guess). The lines name exact printings, so they also show the printing pictures working.
export const SAMPLE_DECKS = [
  {
    id: 'krenko',
    name: 'Krenko, Mob Boss (sample)',
    format: 'commander',
    text: `Commander
1 Krenko, Mob Boss (SLD) 2407 *F*
1 Abrade (PHOU) 83
1 Agatha's Soul Cauldron (PWOE) 242s *F*
1 Altar of Dementia (CNS) 196
1 Ancient Tomb (UMA) 236
1 Arcane Signet (C21) 234
1 Blood Moon (A25) 122
1 Cavern of Souls (AVR) 226
1 Chrome Mox (EMA) 219
1 City of Traitors (EXO) 143
1 Combat Celebrant (PAKH) 125s *F*
1 Conspicuous Snoop (PM21) 139s *F*
1 Crystal Vein (MIR) 325
1 Cursed Mirror (C21) 377
1 Deflecting Swat (C20) 50
1 Delayed Blast Fireball (CLB) 630
1 Desperate Ritual (MMA) 110 *F*
1 Dualcaster Mage (J15) 6 *F*
1 Flare of Duplication (PMH3) 119s *F*
1 Fork (CED) 153
1 Gamble (J20) 6 *F*
1 Gemstone Caverns (TSP) 274 *F*
1 Ghostfire Slice (MH3) 123
1 Goblin Bombardment (F03) 6 *F*
1 Goblin Chieftain (M10) 139 *F*
1 Goblin Engineer (MH1) 128 *F*
1 Goblin Matron (P02) 100
1 Goblin Recruiter (VIS) 80
1 Goblin Sharpshooter (SLD) 18
1 Goblin Sledder (ONS) 209 *F*
1 Goblin Warchief (F16) 5 *F*
1 Goblin Welder (G11) 8 *F*
1 Grafdigger's Cage (M20) 227
1 Great Furnace (SLD) 2886 *F*
1 Hexing Squelcher (ECL) 145 *F*
1 Howlsquad Heavy (PDFT) 134s *F*
1 Imperial Recruiter (A25) 136 *F*
1 Jeska's Will (CMR) 668 *F*
1 Karn, the Great Creator (PWAR) 1s *F*
1 Kiki-Jiki, Mirror Breaker (V11) 4 *F*
1 Lightning Bolt (JGP) 1 *F*
1 Lightning Crafter (MOR) 93 *F*
1 Lotus Petal (TMP) 294
1 Magus of the Moon (IMA) 138
1 Mana Vault (4ED) 334
1 Marvin, Murderous Mimic (PDSK) 253s *F*
1 Mogg Fanatic (F02) 11 *F*
1 Moggcatcher (NEM) 96 *F*
1 Molten Duplication (BIG) 14 *F*
16 Mountain (SLD) 2543 *F*
1 Mox Diamond (STH) 138
1 Nykthos, Shrine to Nyx (THS) 223 *F*
1 Phyrexian Altar (INV) 306
1 Pinnacle Monk / Mystic Peak (MH3) 246
1 Professional Face-Breaker (PSNC) 116s *F*
1 Pyre of Heroes (PKHM) 241s *F*
1 Pyretic Ritual (PLST) M11-153 *F*
1 Pyroblast (ICE) 213
1 Pyrokinesis (EMA) 143 *F*
1 Ragavan, Nimble Pilferer (PMH2) 138s *F*
1 Red Elemental Blast (CED) 170
1 Redirect Lightning (TLA) 151 *F*
1 Reverberate (PD2) 20 *F*
1 Ricochet Trap (WWK) 87 *F*
1 Rite of Flame (CSP) 96
1 Ruby Medallion (TMP) 305
1 Samut, Hazoret's Champion (FRA) 251 *F*
1 Sandstone Needle (MMQ) 326
1 Shatterskull Smashing / Shatterskull, the Hammer Pass (PZNR) 161s *F*
1 Simian Spirit Guide (A25) 148 *F*
1 Skirk Prospector (ONS) 230 *F*
1 Sol Ring (PF19) 7 *F*
1 Splinter Twin (ROE) 165
1 Springleaf Drum (BNG) 162
1 The One Ring (LTR) 246
1 Thornbite Staff (MOR) 145
1 Tibalt's Trickery (KHM) 153
1 Torch Courier (GRN) 119 *F*
1 Treasonous Ogre (PLST) CNS-36 *F*
1 Twinflame (JOU) 115
1 Untimely Malfunction (DSK) 161
1 Valakut Awakening / Valakut Stoneforge (PZNR) 174s *F*
1 Vexing Bauble (MH3) 212 *F*
1 Weathered Runestone (KHM) 247
1 Zealous Conscripts (TSR) 354 *F*`,
  },
];

// The sample with this id, or the first one when the id is missing or unknown (a link like /deck?sample has no id).
export function sampleById(id) {
  return SAMPLE_DECKS.find((sample) => sample.id === id) ?? SAMPLE_DECKS[0];
}
