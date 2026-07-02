'use strict';

const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { decrypterPDFAvecQpdf, deverrouillerWordFichier } = require('../services/deverrouiller.service');
const { supprimerFichier } = require('../utils/fichier.utils');

// ── PDF ──────────────────────────────────────────────────────────────────────

const deverrouillerPDF = async (req, res, next) => {
  const fichier = req.file;
  const cheminSortie = path.join(os.tmpdir(), `unlocked-${uuidv4()}.pdf`);

  try {
    if (!fichier) {
      const err = new Error('Aucun fichier PDF reçu.');
      err.status = 400;
      throw err;
    }

    const motDePasse = req.body.motDePasse?.trim() || '';

    await decrypterPDFAvecQpdf(fichier.path, cheminSortie, motDePasse);
    supprimerFichier(fichier.path);

    const nomOriginal = fichier.originalname.replace(/\.pdf$/i, '');

    res.download(cheminSortie, `${nomOriginal}-deverrouille.pdf`, (err) => {
      supprimerFichier(cheminSortie);
      if (err && !res.headersSent) next(err);
    });

  } catch (err) {
    supprimerFichier(fichier?.path);
    supprimerFichier(cheminSortie);

    const msg = err.message || '';
    if (msg.includes('password') || msg.includes('incorrect') || msg.includes('code 2')) {
      const e = new Error(
        'Impossible de déverrouiller ce PDF. Le mot de passe fourni est incorrect, ' +
        'ou ce fichier nécessite un mot de passe pour être ouvert.'
      );
      e.status = 400;
      return next(e);
    }
    next(err);
  }
};

// ── Word ─────────────────────────────────────────────────────────────────────

const deverrouillerWord = async (req, res, next) => {
  const fichier = req.file;
  const ext = path.extname(fichier?.originalname || '').toLowerCase() || '.docx';
  const cheminSortie = path.join(os.tmpdir(), `unlocked-${uuidv4()}${ext}`);

  try {
    if (!fichier) {
      const err = new Error('Aucun fichier Word reçu.');
      err.status = 400;
      throw err;
    }

    const motDePasse = req.body.motDePasse?.trim() || '';
    const connaitMotDePasse = req.body.connaitMotDePasse === 'true';

    await deverrouillerWordFichier({
      cheminEntree: fichier.path,
      cheminSortie,
      motDePasse,
      connaitMotDePasse,
    });

    supprimerFichier(fichier.path);

    const nomOriginal = fichier.originalname.replace(/\.(docx?|doc)$/i, '');

    res.download(cheminSortie, `${nomOriginal}-deverrouille${ext}`, (err) => {
      supprimerFichier(cheminSortie);
      if (err && !res.headersSent) next(err);
    });

  } catch (err) {
    supprimerFichier(fichier?.path);
    supprimerFichier(cheminSortie);

    if (err.status === 400) return next(err);

    const e = new Error('Mot de passe incorrect ou fichier Word non pris en charge.');
    e.status = 400;
    next(e);
  }
};

module.exports = { deverrouillerPDF, deverrouillerWord };
