// The /deck page: it only mounts the importer (frontend/src/deck-importer.js, which the lobby uses too). /deck?sample opens it with
// the sample deck already in the box.
import { mountDeckImporter } from '../../src/deck-importer.js';

const params = new URLSearchParams(location.search);
mountDeckImporter({ sampleId: params.has('sample') ? params.get('sample') : undefined });
