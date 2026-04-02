'use strict';

const qpdf = require('node-qpdf2');

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

  // Mot de passe propriétaire aléatoire (toujours défini pour appliquer les restrictions)
  const motDePasseProprietaire = genererMotDePasseAleatoire();

  // Construction des restrictions qpdf
  const restrictions = [];
  if (interdireCopie)        restrictions.push('modify-other=n', 'extract=n', 'copy-low-resolution=n');
  if (interdireImpression)   restrictions.push('print=none');
  if (interdireModification) restrictions.push('modify=none');
  if (interdireAnnotations)  restrictions.push('annotate=n');

  const optionsQpdf = {
    input: cheminEntree,
    output: cheminSortie,
    password: motDePasseProprietaire,
    keyLength: chiffrement === 'aes256' ? 256 : 128,
    restrictions,
  };

  // Ajout du mot de passe d'ouverture si fourni
  if (motDePasseOuverture) {
    optionsQpdf.userPassword = motDePasseOuverture;
  }

  await qpdf.encrypt(optionsQpdf);
}

function genererMotDePasseAleatoire() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

module.exports = { appliquerRestrictions };
