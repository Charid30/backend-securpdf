'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');
const officeCrypto = require('officecrypto-tool');
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

    await executerQpdfDecrypt(fichier.path, cheminSortie, motDePasse);
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

function executerQpdfDecrypt(entree, sortie, motDePasse) {
  return new Promise((resolve, reject) => {
    const args = ['--decrypt'];
    if (motDePasse) args.push(`--password=${motDePasse}`);
    args.push(entree, sortie);

    const proc = spawn('qpdf', args);
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0 || code === 3) resolve();
      else reject(new Error(`qpdf exit code ${code}: ${stderr}`));
    });
    proc.on('error', (err) => reject(new Error(`Impossible de lancer qpdf: ${err.message}`)));
  });
}

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

    const buffer = await fs.readFile(fichier.path);
    const estChiffre = officeCrypto.isEncrypted(buffer);

    console.log(`[Word] fichier=${fichier.originalname} estChiffre=${estChiffre} connaitMDP=${connaitMotDePasse}`);

    if (connaitMotDePasse) {
      // L'utilisateur fournit son mot de passe → déchiffrement complet
      if (!motDePasse) {
        const e = new Error('Veuillez saisir le mot de passe.');
        e.status = 400;
        throw e;
      }

      if (!estChiffre) {
        // Fichier non chiffré mais protégé en édition → on retire aussi la protection
        await supprimerProtectionWordXML(fichier.path, cheminSortie);
      } else {
        const dechiffre = await officeCrypto.decrypt(buffer, { password: motDePasse });
        // Après déchiffrement, tenter aussi de retirer la protection d'édition si présente
        await fs.writeFile(cheminSortie, dechiffre);
        await supprimerProtectionWordXMLBuffer(cheminSortie);
      }

    } else {
      // L'utilisateur ne connaît pas le mot de passe
      if (estChiffre) {
        // Fichier vraiment chiffré : impossible sans mot de passe
        const e = new Error(
          'Ce fichier Word est chiffré par un mot de passe obligatoire à l\'ouverture. ' +
          'Il est impossible de le déverrouiller sans connaître le mot de passe.'
        );
        e.status = 400;
        throw e;
      }

      // Fichier non chiffré : supprimer la protection d'édition dans le XML
      const supprime = await supprimerProtectionWordXML(fichier.path, cheminSortie);
      if (!supprime) {
        const e = new Error(
          'Ce fichier Word ne semble pas être protégé. Aucune modification nécessaire.'
        );
        e.status = 400;
        throw e;
      }
    }

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

/**
 * Retire <w:documentProtection> de word/settings.xml dans un fichier .docx (ZIP).
 * Retourne true si une protection a été trouvée et supprimée, false sinon.
 */
async function supprimerProtectionWordXML(cheminEntree, cheminSortie) {
  const zip = new AdmZip(cheminEntree);
  const entry = zip.getEntry('word/settings.xml');

  if (!entry) throw new Error('Fichier Word invalide (word/settings.xml introuvable).');

  let xml = entry.getData().toString('utf8');
  const xmlOriginal = xml;

  // Supprime la balise documentProtection (auto-fermante ou avec contenu)
  xml = xml.replace(/<w:documentProtection\b[^>]*\/>/g, '');
  xml = xml.replace(/<w:documentProtection\b[^>]*>[\s\S]*?<\/w:documentProtection>/g, '');

  const aEteModifie = xml !== xmlOriginal;

  zip.updateFile('word/settings.xml', Buffer.from(xml, 'utf8'));
  zip.writeZip(cheminSortie);

  return aEteModifie;
}

/** Même opération sur un fichier déjà écrit sur disque (après déchiffrement). */
async function supprimerProtectionWordXMLBuffer(cheminFichier) {
  try {
    await supprimerProtectionWordXML(cheminFichier, cheminFichier);
  } catch (_) {
    // Non bloquant : le fichier reste utilisable même si cette étape échoue
  }
}

module.exports = { deverrouillerPDF, deverrouillerWord };
