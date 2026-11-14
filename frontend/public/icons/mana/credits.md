# Mana icons

The files in this folder are copied, unchanged, from the `svg` folder of the Mana project by Andrew Gioia: https://github.com/andrewgioia/mana (copied 2026-11-14 from the `master` branch, package version 1.18.0).

What its README says about the licence (read 2026-11-14, from `README.md` of that repository; the repository has no separate licence file and GitHub shows no licence for it):
- All mana, tap and card type symbol images are copyright Wizards of the Coast.
- The Mana font is licensed under the SIL OFL 1.1.
- Mana's CSS, LESS and Sass files are licensed under the MIT License.
- Attribution is greatly appreciated but not required.

So the pictures themselves are Wizards of the Coast's, not Andrew Gioia's to license. Overloaded is unofficial Fan Content (see `docs/fan-content.md`); whether Wizards' Fan Content Policy covers these symbols has only been read through a summary and is not settled. If Wizards objects, take the files out and draw plain symbols instead.

Files are used through `shared/mana-icons.mjs` (a list of the names copied) and `frontend/src/mana-icon.js` (draws one, coloured by the text colour). Copy a new icon here and add its name to that list; do not add the whole project.

Used so far: `tap.svg` (the tap symbol shown on tapped cards).
