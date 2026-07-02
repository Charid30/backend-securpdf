'use strict';

const { spawn } = require('child_process');

// Sur Windows : gswin64c ; sur Linux/Mac : gs
const GS_CMD = process.platform === 'win32' ? 'gswin64c' : 'gs';

function compresserAvecGhostscript(entree, sortie) {
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

module.exports = { compresserAvecGhostscript };
