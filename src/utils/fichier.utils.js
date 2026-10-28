'use strict';

const fs = require('fs');

function supprimerFichier(chemin) {
  if (!chemin) return;
  try { fs.unlinkSync(chemin); } catch (_) {}
}

/**
 * Envoie un fichier destiné à être lu par le frontend (requête XHR en blob).
 * Pas de Content-Disposition "attachment" ni de type PDF : sinon les gestionnaires
 * de téléchargement comme IDM interceptent la réponse et le navigateur renvoie
 * ERR_BLOCKED_BY_CLIENT. Le frontend choisit lui-même le nom du fichier.
 */
function envoyerFichier(res, chemin, callback) {
  res.type('application/octet-stream');
  res.set('Cache-Control', 'no-store');
  res.sendFile(chemin, callback);
}

module.exports = { supprimerFichier, envoyerFichier };
