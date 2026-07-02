'use strict';

const { Worker } = require('worker_threads');
const path = require('path');
const fs = require('fs');
const os = require('os');
const officeCrypto = require('officecrypto-tool');
const { v4: uuidv4 } = require('uuid');
const { supprimerFichier } = require('../utils/fichier.utils');
const { envoyerEmailConfirmation, envoyerEmailSucces, envoyerEmailEchec } = require('./email.service');

// Dossier pour stocker les fichiers déchiffrés en attente de téléchargement
const DOSSIER_RESULTATS = path.join(os.tmpdir(), 'securpdf-resultats');
if (!fs.existsSync(DOSSIER_RESULTATS)) fs.mkdirSync(DOSSIER_RESULTATS, { recursive: true });

// Stockage en mémoire des jobs actifs
const jobs = new Map();

const STATUTS = { EN_COURS: 'en_cours', SUCCES: 'succes', ECHEC: 'echec' };

function creerJob(cheminFichier, nomFichierOriginal, email, ext) {
  const jobId = uuidv4();

  jobs.set(jobId, {
    id: jobId,
    statut: STATUTS.EN_COURS,
    email,
    nomFichier: nomFichierOriginal,
    etape: 'demarrage',
    progression: 0,
    cheminResultat: null,
    creeA: Date.now(),
  });

  // Lancer le worker en fond
  _lancerWorker(jobId, cheminFichier, nomFichierOriginal, email, ext);

  return jobId;
}

async function _lancerWorker(jobId, cheminFichier, nomFichierOriginal, email, ext) {
  // Email de confirmation (seulement si email fourni)
  if (email) {
    try {
      await envoyerEmailConfirmation(email, nomFichierOriginal);
    } catch (e) {
      console.error('[BruteForce] Erreur email confirmation:', e.message);
    }
  }

  const worker = new Worker(
    path.join(__dirname, '../workers/bruteforce.worker.js'),
    { workerData: { cheminFichier } }
  );

  worker.on('message', (msg) => {
    const job = jobs.get(jobId);
    if (!job) return;

    if (msg.termine) {
      if (msg.erreur) {
        job.statut = STATUTS.ECHEC;
        supprimerFichier(cheminFichier);
        if (email) envoyerEmailEchec(email, nomFichierOriginal).catch(console.error);
        _planifierNettoyage(jobId, null);
        return;
      }

      if (msg.motDePasse) {
        _sauvegarderResultat(jobId, cheminFichier, nomFichierOriginal, email, ext, msg.motDePasse);
      } else {
        job.statut = STATUTS.ECHEC;
        supprimerFichier(cheminFichier);
        if (email) envoyerEmailEchec(email, nomFichierOriginal).catch(console.error);
        _planifierNettoyage(jobId, null);
      }
    } else {
      // Mise à jour de progression
      job.etape = msg.etape;
      job.progression = msg.progression;
    }
  });

  worker.on('error', (err) => {
    console.error('[BruteForce] Worker error:', err.message);
    const job = jobs.get(jobId);
    if (job) {
      job.statut = STATUTS.ECHEC;
      supprimerFichier(cheminFichier);
      envoyerEmailEchec(email, nomFichierOriginal).catch(console.error);
      _planifierNettoyage(jobId, null);
    }
  });
}

async function _sauvegarderResultat(jobId, cheminFichier, nomFichierOriginal, email, ext, motDePasse) {
  const job = jobs.get(jobId);
  try {
    const buffer = fs.readFileSync(cheminFichier);
    const dechiffre = await officeCrypto.decrypt(buffer, { password: motDePasse });

    const cheminResultat = path.join(DOSSIER_RESULTATS, `${jobId}${ext}`);
    fs.writeFileSync(cheminResultat, dechiffre);

    job.statut = STATUTS.SUCCES;
    job.cheminResultat = cheminResultat;
    job.motDePasse = motDePasse;

    supprimerFichier(cheminFichier);

    if (email) await envoyerEmailSucces(email, nomFichierOriginal, jobId, motDePasse);
    _planifierNettoyage(jobId, cheminResultat);

  } catch (err) {
    console.error('[BruteForce] Erreur sauvegarde résultat:', err.message);
    job.statut = STATUTS.ECHEC;
    supprimerFichier(cheminFichier);
    envoyerEmailEchec(email, nomFichierOriginal).catch(console.error);
    _planifierNettoyage(jobId, null);
  }
}

function _planifierNettoyage(jobId, cheminResultat) {
  // Supprime le fichier résultat et le job après 24h
  setTimeout(() => {
    if (cheminResultat) supprimerFichier(cheminResultat);
    jobs.delete(jobId);
  }, 24 * 60 * 60 * 1000);
}

function obtenirJob(jobId) {
  return jobs.get(jobId) || null;
}

function obtenirCheminResultat(jobId) {
  const job = jobs.get(jobId);
  if (!job || job.statut !== STATUTS.SUCCES || !job.cheminResultat) return null;
  if (!fs.existsSync(job.cheminResultat)) return null;
  return job.cheminResultat;
}

module.exports = { creerJob, obtenirJob, obtenirCheminResultat, DOSSIER_RESULTATS };
