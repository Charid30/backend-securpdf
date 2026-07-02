'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { spawn } = require('child_process');
const { supprimerFichier } = require('../utils/fichier.utils');

const compresserPDF = async (req, res, next) => {
  const fichier = req.file;
  const cheminSortie = path.join(os.tmpdir(), `compressed-${uuidv4()}.pdf`);

  try {
    if (!fichier) {
      const err = new Error('Aucun fichier PDF reçu.');
      err.status = 400;
      throw err;
    }

    const tailleOriginale = fichier.size;

    await executerQpdfCompression(fichier.path, cheminSortie);
    supprimerFichier(fichier.path);

    const tailleCompresse = fs.statSync(cheminSortie).size;
    const nomOriginal = fichier.originalname.replace(/\.pdf$/i, '');

    res.setHeader('Access-Control-Expose-Headers', 'X-Taille-Originale, X-Taille-Compresse');
    res.setHeader('X-Taille-Originale', tailleOriginale);
    res.setHeader('X-Taille-Compresse', tailleCompresse);

    res.download(cheminSortie, `${nomOriginal}-compresse.pdf`, (err) => {
      supprimerFichier(cheminSortie);
      if (err && !res.headersSent) next(err);
    });

  } catch (err) {
    supprimerFichier(fichier?.path);
    supprimerFichier(cheminSortie);
    next(err);
  }
};

function executerQpdfCompression(entree, sortie) {
  return new Promise((resolve, reject) => {
    const args = [
      '--object-streams=generate',
      '--compress-streams=y',
      '--recompress-flate',
      entree,
      sortie,
    ];

    const proc = spawn('qpdf', args);
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      // code 3 = warnings but success
      if (code === 0 || code === 3) resolve();
      else reject(new Error(`Erreur de compression PDF (code ${code}): ${stderr}`));
    });
    proc.on('error', (err) => reject(new Error(`Impossible de lancer qpdf: ${err.message}`)));
  });
}

module.exports = { compresserPDF };
