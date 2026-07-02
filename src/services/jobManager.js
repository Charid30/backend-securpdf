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

// Ordre des étapes pour déterminer la progression "la plus avancée" tous workers confondus
const ORDRE_ETAPES = ['dictionnaire', 'numerique', 'alphanumerique'];

// Nombre de workers parallèles : un par cœur CPU, plafonné pour rester raisonnable
const NB_WORKERS = Math.max(1, Math.min(os.cpus().length, 8));

function creerJob(cheminFichier, nomFichierOriginal, email, ext) {
  const jobId = uuidv4();

  jobs.set(jobId, {
    id: jobId,
    statut: STATUTS.EN_COURS,
    email,
    nomFichier: nomFichierOriginal,
    etape: 'demarrage',
    progression: 0,
    tentatives: 0,
    cheminResultat: null,
    creeA: Date.now(),
    _workers: [],
    _etatWorkers: new Map(), // workerIndex -> { etape, progression, tentatives }
  });

  // Lancer les workers en fond
  _lancerWorkers(jobId, cheminFichier, nomFichierOriginal, email, ext);

  return jobId;
}

async function _lancerWorkers(jobId, cheminFichier, nomFichierOriginal, email, ext) {
  // Email de confirmation (seulement si email fourni)
  if (email) {
    try {
      await envoyerEmailConfirmation(email, nomFichierOriginal);
    } catch (e) {
      console.error('[BruteForce] Erreur email confirmation:', e.message);
    }
  }

  const job = jobs.get(jobId);
  if (!job) return;

  let terminePar = null; // évite les doubles traitements si plusieurs workers finissent en même temps

  const arreterTousLesWorkers = () => {
    for (const w of job._workers) {
      w.terminate().catch(() => {});
    }
  };

  for (let i = 0; i < NB_WORKERS; i++) {
    const worker = new Worker(
      path.join(__dirname, '../workers/bruteforce.worker.js'),
      { workerData: { cheminFichier, partitionIndex: i, partitionCount: NB_WORKERS } }
    );
    job._workers.push(worker);
    job._etatWorkers.set(i, { etape: 'dictionnaire', progression: 0, tentatives: 0 });

    worker.on('message', (msg) => {
      const jobActuel = jobs.get(jobId);
      if (!jobActuel || terminePar) return;

      if (msg.termine) {
        if (msg.erreur) {
          // Une erreur sur un worker n'arrête pas les autres ; on continue tant qu'il en reste
          return;
        }
        if (msg.motDePasse) {
          terminePar = i;
          jobActuel.statut = STATUTS.SUCCES; // fixé tout de suite pour éviter une course avec l'agrégateur
          arreterTousLesWorkers();
          _sauvegarderResultat(jobId, cheminFichier, nomFichierOriginal, email, ext, msg.motDePasse);
        }
        return;
      }

      const etatWorker = jobActuel._etatWorkers.get(i);
      if (msg.etape !== undefined) { etatWorker.etape = msg.etape; etatWorker.progression = msg.progression; }
      if (msg.tentatives !== undefined) { etatWorker.tentatives = msg.tentatives; }
      _recalculerProgression(jobActuel);
    });

    worker.on('error', (err) => {
      console.error(`[BruteForce] Worker ${i} error:`, err.message);
    });
  }

  // Attend que tous les workers terminent leur partition
  const resultats = await Promise.allSettled(
    job._workers.map(w => new Promise((resolve) => {
      w.once('exit', resolve);
    }))
  );

  const jobFinal = jobs.get(jobId);
  if (!jobFinal || jobFinal.statut !== STATUTS.EN_COURS) return; // déjà traité (succès trouvé)

  // Aucun worker n'a trouvé le mot de passe
  jobFinal.statut = STATUTS.ECHEC;
  supprimerFichier(cheminFichier);
  if (email) envoyerEmailEchec(email, nomFichierOriginal).catch(console.error);
  _planifierNettoyage(jobId, null);
}

function _recalculerProgression(job) {
  const etats = Array.from(job._etatWorkers.values());
  job.tentatives = etats.reduce((somme, e) => somme + e.tentatives, 0);

  // Étape la plus avancée parmi tous les workers
  let indexEtapeMax = 0;
  for (const e of etats) {
    const idx = ORDRE_ETAPES.indexOf(e.etape);
    if (idx > indexEtapeMax) indexEtapeMax = idx;
  }
  const etapeMax = ORDRE_ETAPES[indexEtapeMax];
  job.etape = etapeMax;

  // Progression moyenne des workers actuellement sur cette étape
  const surEtapeMax = etats.filter(e => e.etape === etapeMax);
  job.progression = surEtapeMax.length > 0
    ? Math.round(surEtapeMax.reduce((s, e) => s + e.progression, 0) / surEtapeMax.length)
    : 0;
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
