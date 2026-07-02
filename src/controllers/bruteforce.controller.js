'use strict';

const path = require('path');
const { creerJob, obtenirJob, obtenirCheminResultat } = require('../services/jobManager');
const { supprimerFichier } = require('../utils/fichier.utils');

const soumettreJob = async (req, res, next) => {
  const fichier = req.file;

  try {
    if (!fichier) {
      const err = new Error('Aucun fichier Word reçu.');
      err.status = 400;
      throw err;
    }

    const email = req.body.email?.trim().toLowerCase() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const err = new Error('Adresse email invalide.');
      err.status = 400;
      throw err;
    }

    const ext = path.extname(fichier.originalname).toLowerCase() || '.docx';
    const jobId = creerJob(fichier.path, fichier.originalname, email, ext);

    res.json({
      jobId,
      message: `Récupération lancée. Un email de confirmation a été envoyé à ${email}.`,
    });

  } catch (err) {
    supprimerFichier(fichier?.path);
    next(err);
  }
};

const verifierStatut = (req, res, next) => {
  const { jobId } = req.params;
  const job = obtenirJob(jobId);

  if (!job) {
    const err = new Error('Job introuvable ou expiré.');
    err.status = 404;
    return next(err);
  }

  res.json({
    statut: job.statut,
    etape: job.etape,
    progression: job.progression,
    motDePasse: job.statut === 'succes' ? job.motDePasse : undefined,
  });
};

const telechargerResultat = (req, res, next) => {
  const { jobId } = req.params;
  const job = obtenirJob(jobId);

  if (!job || job.statut !== 'succes') {
    const err = new Error('Fichier indisponible ou job non terminé.');
    err.status = 404;
    return next(err);
  }

  const cheminResultat = obtenirCheminResultat(jobId);
  if (!cheminResultat) {
    const err = new Error('Fichier expiré ou déjà téléchargé.');
    err.status = 410;
    return next(err);
  }

  const ext = path.extname(cheminResultat);
  const nomSortie = job.nomFichier.replace(/\.(docx?|doc)$/i, '') + `-deverrouille${ext}`;

  res.download(cheminResultat, nomSortie, (err) => {
    if (err && !res.headersSent) next(err);
  });
};

module.exports = { soumettreJob, verifierStatut, telechargerResultat };
