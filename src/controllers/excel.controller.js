'use strict';

const { convertirPDFEnExcel } = require('../services/excel.service');
const { supprimerFichier } = require('../utils/fichier.utils');

const convertirEnExcel = async (req, res, next) => {
  const fichier = req.file;

  try {
    if (!fichier) {
      const err = new Error('Aucun fichier PDF reçu.');
      err.status = 400;
      throw err;
    }

    const xlsx = await convertirPDFEnExcel(fichier.path);
    supprimerFichier(fichier.path);

    // Même envoi neutre que envoyerFichier() : évite l'interception par IDM
    res.type('application/octet-stream');
    res.set('Cache-Control', 'no-store');
    res.send(xlsx);

  } catch (err) {
    supprimerFichier(fichier?.path);
    next(err);
  }
};

module.exports = { convertirEnExcel };
