'use strict';

const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { appliquerRestrictions } = require('../services/secur.service');
const { supprimerFichier } = require('../utils/fichier.utils');

const securiserPDF = async (req, res, next) => {
  const fichier = req.file;

  try {
    const {
      motDePasseOuverture,
      interdireCopie,
      interdireImpression,
      interdireModification,
      interdireAnnotations,
      chiffrement,
    } = req.body;

    const options = {
      cheminEntree: fichier.path,
      cheminSortie: path.join(os.tmpdir(), `secured-${uuidv4()}.pdf`),
      motDePasseOuverture: motDePasseOuverture?.trim() || null,
      interdireCopie: interdireCopie === 'true',
      interdireImpression: interdireImpression === 'true',
      interdireModification: interdireModification === 'true',
      interdireAnnotations: interdireAnnotations === 'true',
      chiffrement: chiffrement === 'aes256' ? 'aes256' : 'aes128',
    };

    await appliquerRestrictions(options);

    // Suppression immédiate du fichier source
    supprimerFichier(fichier.path);

    const nomOriginal = fichier.originalname.replace(/\.pdf$/i, '');
    const nomFichierSortie = `${nomOriginal}-securise.pdf`;

    res.download(options.cheminSortie, nomFichierSortie, (err) => {
      supprimerFichier(options.cheminSortie);
      if (err && !res.headersSent) next(err);
    });

  } catch (err) {
    supprimerFichier(fichier?.path);
    next(err);
  }
};

module.exports = { securiserPDF };
