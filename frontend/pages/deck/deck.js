// The /deck page: it only mounts the importer (frontend/src/deck-importer.js, which the lobby uses too). /deck?sample opens it with
// the sample deck already in the box.
import { mountDeckImporter } from '../../src/deck-importer.js';

const params = new URLSearchParams(location.search);
// /deck?sample opens the page with the sample deck in the box; /deck?sample&play also saves it and goes straight to the solo table (the demo path from the home page).
mountDeckImporter({ sampleId: params.has('sample') ? params.get('sample') : undefined, autoPlay: params.has('play'), playButtons: true });
