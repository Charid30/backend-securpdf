'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { compresserAvecGhostscript } = require('../services/compresser.service');
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
    const nomOriginal = fichier.originalname.replace(/\.pdf$/i, '');

    await compresserAvecGhostscript(fichier.path, cheminSortie);

    const tailleCompresse = fs.statSync(cheminSortie).size;

    res.setHeader('Access-Control-Expose-Headers', 'X-Taille-Originale, X-Taille-Compresse');
    res.setHeader('X-Taille-Originale', tailleOriginale);
    res.setHeader('X-Taille-Compresse', tailleCompresse);

    // Si Ghostscript a gonflé le fichier, on renvoie l'original tel quel
    if (tailleCompresse >= tailleOriginale) {
      supprimerFichier(cheminSortie);
      // On écrase le header pour que le frontend affiche la vraie taille
      res.setHeader('X-Taille-Compresse', tailleOriginale);
      return res.download(fichier.path, `${nomOriginal}-compresse.pdf`, (err) => {
        supprimerFichier(fichier.path);
        if (err && !res.headersSent) next(err);
      });
    }

    supprimerFichier(fichier.path);
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

module.exports = { compresserPDF };
