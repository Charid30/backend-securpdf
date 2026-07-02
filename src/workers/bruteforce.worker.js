'use strict';

const { workerData, parentPort } = require('worker_threads');
const officeCrypto = require('officecrypto-tool');
const fs = require('fs');

const DICTIONNAIRE = [
  // Mots de passe les plus courants
  '123456','password','123456789','12345678','12345','1234567','1234567890',
  '000000','111111','123123','abc123','azerty','qwerty','password1',
  'admin','admin123','root','toor','pass','pass123','test','test123',
  'letmein','welcome','iloveyou','sunshine','princess','dragon','monkey',
  'master','access','shadow','superman','batman','trustno1','hello',
  // Mots courants en français
  'bonjour','soleil','amour','france','paris','marie','pierre','jean',
  'bureau','travail','maison','voiture','secret','motdepasse','passe',
  'azerty123','azertyuiop','qwertyuiop','123azerty','azerty1234',
  // Mots courants en Afrique de l'Ouest
  'burkina','ouaga','ouagadougou','faso','afrique','africa',
  'dieu','jesus','allah','amine','grace','merci','seigneur',
  // Années
  '2020','2021','2022','2023','2024','2025','1990','1991','1992','1993',
  '1994','1995','1996','1997','1998','1999','2000','2001','2002',
  // Variantes courantes
  'Aa123456','P@ssword','P@ssw0rd','Admin@123','Admin1234','Password1',
  'azerty@123','Azerty123','France123','Paris123',
  // Patterns simples
  'aaaaaa','bbbbbb','abcabc','abcdef','123321','654321',
  '112233','121212','010101','696969','159753','123qwe',
];

async function essayerMotDePasse(buffer, motDePasse) {
  try {
    await officeCrypto.decrypt(buffer, { password: motDePasse });
    return true;
  } catch {
    return false;
  }
}

function* generatNumerique(longueurMax) {
  for (let len = 1; len <= longueurMax; len++) {
    const max = Math.pow(10, len);
    for (let i = 0; i < max; i++) {
      yield String(i).padStart(len, '0');
    }
  }
}

function* generatAlphaNum(chars, longueur, prefixe = '') {
  if (longueur === 0) { yield prefixe; return; }
  for (const c of chars) {
    yield* generatAlphaNum(chars, longueur - 1, prefixe + c);
  }
}

async function lancerBruteforce(cheminFichier) {
  const buffer = fs.readFileSync(cheminFichier);

  // ── 1. Dictionnaire ─────────────────────────────────────────────────────
  parentPort.postMessage({ etape: 'dictionnaire', progression: 0 });
  for (let i = 0; i < DICTIONNAIRE.length; i++) {
    const mdp = DICTIONNAIRE[i];
    if (await essayerMotDePasse(buffer, mdp)) return mdp;
    if (i % 50 === 0) {
      parentPort.postMessage({ etape: 'dictionnaire', progression: Math.round((i / DICTIONNAIRE.length) * 100) });
    }
  }

  // ── 2. Numérique jusqu'à 6 chiffres ─────────────────────────────────────
  parentPort.postMessage({ etape: 'numerique', progression: 0 });
  let cpt = 0;
  const totalNum = 1111110; // 1+10+100+...+999999
  for (const mdp of generatNumerique(6)) {
    if (await essayerMotDePasse(buffer, mdp)) return mdp;
    cpt++;
    if (cpt % 500 === 0) {
      parentPort.postMessage({ etape: 'numerique', progression: Math.round((cpt / totalNum) * 100) });
    }
  }

  // ── 3. Alphanumérique minuscules jusqu'à 4 chars ─────────────────────────
  parentPort.postMessage({ etape: 'alphanumerique', progression: 0 });
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let cptA = 0;
  const totalA = 36 + 36 * 36 + 36 ** 3 + 36 ** 4; // ~1.7M
  for (let len = 1; len <= 4; len++) {
    for (const mdp of generatAlphaNum(chars, len)) {
      if (await essayerMotDePasse(buffer, mdp)) return mdp;
      cptA++;
      if (cptA % 1000 === 0) {
        parentPort.postMessage({ etape: 'alphanumerique', progression: Math.round((cptA / totalA) * 100) });
      }
    }
  }

  return null; // non trouvé
}

lancerBruteforce(workerData.cheminFichier)
  .then(motDePasse => parentPort.postMessage({ termine: true, motDePasse }))
  .catch(err => parentPort.postMessage({ termine: true, erreur: err.message }));
