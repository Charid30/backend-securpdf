'use strict';

const { spawn } = require('child_process');

function fusionnerAvecQpdf(chemins, sortie) {
  return new Promise((resolve, reject) => {
    // qpdf input1.pdf --pages input1.pdf input2.pdf ... -- output.pdf
    const args = [chemins[0], '--pages', ...chemins, '--', sortie];

    const proc = spawn('qpdf', args);
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0 || code === 3) resolve();
      else reject(new Error(`Erreur de fusion PDF (code ${code}): ${stderr}`));
    });
    proc.on('error', (err) => reject(new Error(`Impossible de lancer qpdf: ${err.message}`)));
  });
}

module.exports = { fusionnerAvecQpdf };
