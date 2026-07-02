'use strict';

const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { spawn } = require('child_process');
const { supprimerFichier } = require('../utils/fichier.utils');

const fusionnerPDFs = async (req, res, next) => {
  const fichiers = req.files || [];
  const cheminSortie = path.join(os.tmpdir(), `merged-${uuidv4()}.pdf`);

  try {
    if (fichiers.length < 2) {
      const err = new Error('Veuillez fournir au moins 2 fichiers PDF à fusionner.');
      err.status = 400;
      throw err;
    }

    const chemins = fichiers.map(f => f.path);
    await executerQpdfFusion(chemins, cheminSortie);

    fichiers.forEach(f => supprimerFichier(f.path));

    res.download(cheminSortie, 'document-fusionne.pdf', (err) => {
      supprimerFichier(cheminSortie);
      if (err && !res.headersSent) next(err);
    });

  } catch (err) {
    fichiers.forEach(f => supprimerFichier(f.path));
    supprimerFichier(cheminSortie);
    next(err);
  }
};

function executerQpdfFusion(chemins, sortie) {
  return new Promise((resolve, reject) => {
    // qpdf input1.pdf --pages input1.pdf input2.pdf ... -- output.pdf
    const args = [chemins[0], '--pages', ...chemins, '--', sortie];

    const proc = spawn('qpdf', args);
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0 || code === 3) resolve();
      else reject(new Error(`Erreur de fusion PDF (code ${code}): ${stderr}`));
    });
    proc.on('error', (err) => reject(new Error(`Impossible de lancer qpdf: ${err.message}`)));
  });
}

module.exports = { fusionnerPDFs };
