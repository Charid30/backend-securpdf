'use strict';

const fs = require('fs');

function supprimerFichier(chemin) {
  if (!chemin) return;
  try { fs.unlinkSync(chemin); } catch (_) {}
}

module.exports = { supprimerFichier };
