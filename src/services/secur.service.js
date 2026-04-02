'use strict';

const { spawn } = require('child_process');

async function appliquerRestrictions(options) {
  const {
    cheminEntree,
    cheminSortie,
    motDePasseOuverture,
    interdireCopie,
    interdireImpression,
    interdireModification,
    interdireAnnotations,
    chiffrement,
  } = options;

  const motDePasseProprietaire = genererMotDePasseAleatoire();
  const motDePasseUtilisateur = motDePasseOuverture || '';
  const keyLength = chiffrement === 'aes256' ? '256' : '128';

  // Construction des arguments qpdf
  // Format : qpdf --encrypt user-pw owner-pw key-length [restrictions] -- input output
  const args = [
    '--encrypt',
    motDePasseUtilisateur,
    motDePasseProprietaire,
    keyLength,
  ];

  if (interdireCopie)        args.push('--extract=n');
  if (interdireImpression)   args.push('--print=none');
  if (interdireModification) args.push('--modify=none');
  if (interdireAnnotations)  args.push('--annotate=n');

  args.push('--');
  args.push(cheminEntree);
  args.push(cheminSortie);

  await executerQpdf(args);
}

function executerQpdf(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('qpdf', args);
    let stderr = '';
    proc.stderr.on('data', (data) => { stderr += data.toString(); });
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`qpdf exit ${code}: ${stderr}`));
      }
    });
    proc.on('error', (err) => {
      reject(new Error(`spawn qpdf: ${err.message}`));
    });
  });
}

function genererMotDePasseAleatoire() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

module.exports = { appliquerRestrictions };
