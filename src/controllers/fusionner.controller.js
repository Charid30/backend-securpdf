'use strict';

const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { fusionnerAvecQpdf } = require('../services/fusionner.service');
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
    await fusionnerAvecQpdf(chemins, cheminSortie);

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

module.exports = { fusionnerPDFs };
