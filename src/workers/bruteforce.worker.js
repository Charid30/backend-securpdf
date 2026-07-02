'use strict';

const { workerData, parentPort } = require('worker_threads');
const officeCrypto = require('officecrypto-tool');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ── Base : mots-clés ciblés (courants, FR, Afrique de l'Ouest, patterns) ──
const MOTS_BASE = [
  // Mots de passe les plus courants (monde)
  '123456','password','123456789','12345678','12345','1234567','1234567890',
  '000000','111111','123123','abc123','azerty','qwerty','password1',
  'admin','admin123','root','toor','pass','test','letmein','welcome',
  'iloveyou','sunshine','princess','dragon','monkey','master','access',
  'shadow','superman','batman','trustno1','hello','freedom','whatever',
  'qazwsx','zaq12wsx','starwars','football','baseball','basketball',
  'michael','jennifer','jordan','ashley','daniel','charlie','samsung',
  'apple','iphone','android','google','facebook','instagram','snapchat',
  // Mots courants en français
  'bonjour','soleil','amour','france','paris','marie','pierre','jean',
  'bureau','travail','maison','voiture','secret','motdepasse','passe',
  'azertyuiop','qwertyuiop','123azerty','famille','papa','maman',
  'chocolat','vacances','musique','football','ordinateur','internet',
  'juillet','janvier','fevrier','mars','avril','mai','juin','aout',
  'septembre','octobre','novembre','decembre','lundi','mardi','mercredi',
  // Prénoms courants FR/Afrique de l'Ouest
  'amadou','ibrahim','moussa','fatimata','aminata','mariam','ousmane',
  'abdoulaye','salif','issa','boureima','rasmane','adama','hamidou',
  'sidiki','yacouba','zenabou','awa','kadidia','habibou','souleymane',
  'seydou','boubacar','mamadou','aissata','fatou','oumou','djeneba',
  'karim','sara','yasmine','omar','hassan','khadija','fadel','nadia',
  // Villes / lieux Burkina Faso et Afrique de l'Ouest
  'burkina','ouaga','ouagadougou','faso','bobo','bobodioulasso','koudougou',
  'banfora','kaya','ouahigouya','fada','dedougou','tenkodogo','gaoua',
  'afrique','africa','dakar','bamako','abidjan','lome','cotonou','niamey',
  'sahel','mossi','peuhl','bissa','gourmantche','lobi','bwaba',
  // Religion / expressions courantes
  'dieu','jesus','allah','amine','grace','merci','seigneur','alhamdoulillah',
  'inchallah','bismillah','providence','esperance','benediction',
  // Patterns simples
  'aaaaaa','bbbbbb','abcabc','abcdef','123321','654321',
  '112233','121212','010101','696969','159753','123qwe','1q2w3e',
  '1qaz2wsx','qwerty123','asdfgh','zxcvbn','poiuyt',
];

// Suffixes/préfixes courants pour générer des variantes réalistes
const SUFFIXES = ['','123','1234','12345','01','007','99','2024','2025','!','@'];
const CASSES = (mot) => [mot, mot.charAt(0).toUpperCase() + mot.slice(1)];

function construireDictionnaire() {
  const set = new Set();
  for (const motBase of MOTS_BASE) {
    for (const mot of CASSES(motBase)) {
      for (const suffixe of SUFFIXES) {
        set.add(mot + suffixe);
      }
    }
  }
  // Années seules (1980-2026) — utile en mot de passe brut
  for (let annee = 1980; annee <= 2026; annee++) set.add(String(annee));
  // Variantes leet/symboles fréquentes
  ['Aa123456','P@ssword','P@ssw0rd','Admin@123','Admin1234','Password1',
   'azerty@123','Azerty123','France123','Paris123','Burkina123','Faso123',
   'Ouaga123','Dieu123','Merci123'].forEach(m => set.add(m));
  return Array.from(set);
}

// Dictionnaire externe optionnel : un mot par ligne, chargé si présent
async function chargerDictionnaireExterne() {
  const chemin = path.join(__dirname, '..', '..', 'dictionnaires', 'mots.txt');
  if (!fs.existsSync(chemin)) return [];
  const mots = [];
  const rl = readline.createInterface({ input: fs.createReadStream(chemin, 'utf8') });
  for await (const ligne of rl) {
    const mot = ligne.trim();
    if (mot && !mot.startsWith('#')) mots.push(mot);
  }
  return mots;
}

async function essayerMotDePasse(buffer, motDePasse) {
  try {
    await officeCrypto.decrypt(buffer, { password: motDePasse });
    return true;
  } catch {
    return false;
  }
}

// Odomètre numérique : 0 → 999999 (1 à 6 chiffres)
function* generatNumerique(longueurMax) {
  for (let len = 1; len <= longueurMax; len++) {
    const max = Math.pow(10, len);
    for (let i = 0; i < max; i++) {
      yield String(i).padStart(len, '0');
    }
  }
}

// Odomètre alphanumérique en base 36 (a-z0-9)
function* generatAlphaNum(chars, longueur, prefixe = '') {
  if (longueur === 0) { yield prefixe; return; }
  for (const c of chars) {
    yield* generatAlphaNum(chars, longueur - 1, prefixe + c);
  }
}

// Partitionne une séquence entre N workers : chaque worker ne teste que les
// candidats dont l'index global (mod partitionCount) lui correspond, ce qui
// couvre tout l'espace sans doublon ni coordination entre threads.
async function balayerPartition(buffer, sequence, etape, partitionIndex, partitionCount, totalEstime, onTentative) {
  let index = 0;
  let compteurLocal = 0;
  for (const mdp of sequence) {
    if (index % partitionCount === partitionIndex) {
      compteurLocal++;
      onTentative();
      if (await essayerMotDePasse(buffer, mdp)) return mdp;
      if (compteurLocal % 200 === 0) {
        const progressionLocale = totalEstime > 0
          ? Math.min(100, Math.round((compteurLocal / (totalEstime / partitionCount)) * 100))
          : 0;
        parentPort.postMessage({ etape, progression: progressionLocale });
      }
    }
    index++;
  }
  return null;
}

async function lancerBruteforce(cheminFichier, partitionIndex, partitionCount) {
  const buffer = fs.readFileSync(cheminFichier);
  let tentatives = 0;
  const onTentative = () => {
    tentatives++;
    if (tentatives % 100 === 0) parentPort.postMessage({ tentatives });
  };

  // ── 1. Dictionnaire (base générée + fichier externe optionnel) ──────────
  const dictionnaireExterne = await chargerDictionnaireExterne();
  const dictionnaire = Array.from(new Set([...construireDictionnaire(), ...dictionnaireExterne]));

  parentPort.postMessage({ etape: 'dictionnaire', progression: 0 });
  const trouveDico = await balayerPartition(
    buffer, dictionnaire, 'dictionnaire', partitionIndex, partitionCount, dictionnaire.length, onTentative
  );
  if (trouveDico) return trouveDico;

  // ── 2. Numérique jusqu'à 6 chiffres ─────────────────────────────────────
  parentPort.postMessage({ etape: 'numerique', progression: 0 });
  const totalNum = 1111110; // 1+10+100+...+999999
  const trouveNum = await balayerPartition(
    buffer, generatNumerique(6), 'numerique', partitionIndex, partitionCount, totalNum, onTentative
  );
  if (trouveNum) return trouveNum;

  // ── 3. Alphanumérique minuscules jusqu'à 4 chars ─────────────────────────
  parentPort.postMessage({ etape: 'alphanumerique', progression: 0 });
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const totalA = 36 + 36 * 36 + 36 ** 3 + 36 ** 4; // ~1.7M
  function* toutesLesLongueurs() {
    for (let len = 1; len <= 4; len++) yield* generatAlphaNum(chars, len);
  }
  const trouveAlpha = await balayerPartition(
    buffer, toutesLesLongueurs(), 'alphanumerique', partitionIndex, partitionCount, totalA, onTentative
  );
  if (trouveAlpha) return trouveAlpha;

  return null; // non trouvé par ce worker
}

const { cheminFichier, partitionIndex = 0, partitionCount = 1 } = workerData;

lancerBruteforce(cheminFichier, partitionIndex, partitionCount)
  .then(motDePasse => parentPort.postMessage({ termine: true, motDePasse }))
  .catch(err => parentPort.postMessage({ termine: true, erreur: err.message }));
