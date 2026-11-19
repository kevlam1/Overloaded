// A real printing of a card that shows the foils on the foil test page at /foils: one for the traditional foil and one for the etched foil (a real etched printing). Picked by hand from the real data on 2026-11-18;
// scripts/test-foil-examples.mjs checks the shape always and, when the printing files are built here, that each one is the right card with the right finish.
// { look: { name, set, number, id } }, id being the printing id (the picture to show).
export const FOIL_EXAMPLES = {
  etched: { name: 'Jin-Gitaxias, Core Augur', set: 'mul', number: '76', id: '7886ef8b-56d2-4489-a37d-6ae5b87d41c0' },
  traditional: { name: 'Sol Ring', set: 'cmm', number: '410', id: '46ca0b66-a000-4483-b916-f5b89e710244' },
};
