'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { spawn } = require('child_process');
const { supprimerFichier } = require('../utils/fichier.utils');

// Sur Windows : gswin64c ; sur Linux/Mac : gs
const GS_CMD = process.platform === 'win32' ? 'gswin64c' : 'gs';

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

    await executerGhostscriptCompression(fichier.path, cheminSortie);

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

function executerGhostscriptCompression(entree, sortie) {
  return new Promise((resolve, reject) => {
    // /ebook = 150 dpi images — bon équilibre taille/qualité
    // alternatives: /screen (72 dpi, très petit), /printer (300 dpi, moins de gain)
    const args = [
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.4',
      '-dPDFSETTINGS=/ebook',
      '-dNOPAUSE',
      '-dQUIET',
      '-dBATCH',
      `-sOutputFile=${sortie}`,
      entree,
    ];

    const proc = spawn(GS_CMD, args);
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Erreur Ghostscript (code ${code}): ${stderr}`));
    });
    proc.on('error', (err) => reject(new Error(`Impossible de lancer Ghostscript: ${err.message}`)));
  });
}

module.exports = { compresserPDF };
