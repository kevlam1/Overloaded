// The /deck page: it only mounts the deck manager (frontend/src/deck-importer.js, which the lobby uses too). /deck?sample opens it with
// the sample deck already checked; /deck?sample&play also opens the solo table with it (the "Play the sample deck" link on an empty solo table).
import { mountDeckImporter } from '../../src/deck-importer.js';
import { mountSiteHeader } from '../../src/site-header.js';

mountSiteHeader();
const params = new URLSearchParams(location.search);
mountDeckImporter({ root: document.getElementById('deck-app'), sampleId: params.has('sample') ? params.get('sample') : undefined, autoPlay: params.has('play') });
