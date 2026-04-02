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

  // Construction des restrictions qpdf (objet requis par node-qpdf2)
  const restrictions = {};
  if (interdireCopie) {
    restrictions.extract = 'n';
  }
  if (interdireImpression)   restrictions.print = 'none';
  if (interdireModification) restrictions.modify = 'none';
  if (interdireAnnotations)  restrictions.annotate = 'n';

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

  try {
    await qpdf.encrypt(optionsQpdf);
  } catch (e) {
    console.error('[qpdf raw error]', e);
    const msg = e?.message || e?.stderr || (typeof e === 'string' ? e : JSON.stringify(e));
    throw new Error(`qpdf échec: ${msg}`);
  }
}

function genererMotDePasseAleatoire() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

module.exports = { appliquerRestrictions };
