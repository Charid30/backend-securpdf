'use strict';

const fs = require('fs').promises;
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');
const officeCrypto = require('officecrypto-tool');

// ── PDF ──────────────────────────────────────────────────────────────────────

function decrypterPDFAvecQpdf(entree, sortie, motDePasse) {
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

/** Même opération sur un fichier déjà écrit sur disque (après déchiffrement). Non bloquant. */
async function supprimerProtectionWordXMLBuffer(cheminFichier) {
  try {
    await supprimerProtectionWordXML(cheminFichier, cheminFichier);
  } catch (_) {
    // Non bloquant : le fichier reste utilisable même si cette étape échoue
  }
}

/**
 * Déverrouille un fichier Word : gère le chiffrement (mot de passe d'ouverture)
 * et/ou la protection d'édition (documentProtection XML), selon ce que
 * l'utilisateur a indiqué savoir. Écrit le résultat dans cheminSortie.
 * Lève une erreur avec `.status = 400` pour les cas attendus (mot de passe
 * manquant/incorrect, fichier non protégé, etc.).
 */
async function deverrouillerWordFichier({ cheminEntree, cheminSortie, motDePasse, connaitMotDePasse }) {
  const buffer = await fs.readFile(cheminEntree);
  const estChiffre = officeCrypto.isEncrypted(buffer);

  if (connaitMotDePasse) {
    // L'utilisateur fournit son mot de passe → déchiffrement complet
    if (!motDePasse) {
      const e = new Error('Veuillez saisir le mot de passe.');
      e.status = 400;
      throw e;
    }

    if (!estChiffre) {
      // Fichier non chiffré mais protégé en édition → on retire aussi la protection
      await supprimerProtectionWordXML(cheminEntree, cheminSortie);
    } else {
      const dechiffre = await officeCrypto.decrypt(buffer, { password: motDePasse });
      // Après déchiffrement, tenter aussi de retirer la protection d'édition si présente
      await fs.writeFile(cheminSortie, dechiffre);
      await supprimerProtectionWordXMLBuffer(cheminSortie);
    }
    return;
  }

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
  const supprime = await supprimerProtectionWordXML(cheminEntree, cheminSortie);
  if (!supprime) {
    const e = new Error('Ce fichier Word ne semble pas être protégé. Aucune modification nécessaire.');
    e.status = 400;
    throw e;
  }
}

module.exports = { decrypterPDFAvecQpdf, deverrouillerWordFichier };
