'use strict';

const fs = require('fs/promises');
const path = require('path');
const ExcelJS = require('exceljs');

// pdfjs-dist n'est distribué qu'en module ES : chargement dynamique depuis CommonJS
let pdfjsPromise;
const chargerPdfjs = () => (pdfjsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs'));

const MAX_PAGES = 200;

// Polices standard fournies par pdfjs-dist (évite un avertissement et améliore la lecture de certains PDF)
const POLICES_STANDARD = path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts').split(path.sep).join('/') + '/';

const creerErreur = (message, status = 400) => Object.assign(new Error(message), { status });

/**
 * Récupère les morceaux de texte d'une page avec leur boîte englobante.
 * pdf.js donne y depuis le bas de la page : on garde ce repère et on trie du haut vers le bas.
 */
const extraireMorceaux = async (page) => {
  const contenu = await page.getTextContent();
  return contenu.items
    .filter((it) => it.str && it.str.trim())
    .map((it) => {
      const hauteur = Math.abs(it.transform[3]) || it.height || 10;
      return {
        texte: it.str,
        x0: it.transform[4],
        x1: it.transform[4] + it.width,
        y: it.transform[5],
        hauteur,
      };
    });
};

/**
 * Regroupe les morceaux en lignes (même ordonnée à une demi-hauteur de police près),
 * puis fusionne dans une même cellule les morceaux séparés par un simple espace.
 */
const construireLignes = (morceaux) => {
  const tries = [...morceaux].sort((a, b) => b.y - a.y || a.x0 - b.x0);
  const lignes = [];

  for (const m of tries) {
    const ligne = lignes[lignes.length - 1];
    if (ligne && Math.abs(ligne.y - m.y) <= Math.min(ligne.hauteur, m.hauteur) * 0.5) {
      ligne.morceaux.push(m);
    } else {
      lignes.push({ y: m.y, hauteur: m.hauteur, morceaux: [m] });
    }
  }

  return lignes.map((ligne) => {
    const ordonnes = ligne.morceaux.sort((a, b) => a.x0 - b.x0);
    const cellules = [];
    for (const m of ordonnes) {
      const derniere = cellules[cellules.length - 1];
      const ecart = derniere ? m.x0 - derniere.x1 : Infinity;
      // Un écart inférieur à ~1 caractère = même cellule ; au-delà = nouvelle colonne
      if (derniere && ecart < m.hauteur * 0.8) {
        derniere.texte += (ecart > m.hauteur * 0.1 && !derniere.texte.endsWith(' ') ? ' ' : '') + m.texte;
        derniere.x1 = Math.max(derniere.x1, m.x1);
      } else {
        cellules.push({ texte: m.texte, x0: m.x0, x1: m.x1 });
      }
    }
    return { y: ligne.y, cellules: cellules.map((c) => ({ ...c, texte: c.texte.replace(/\s+/g, ' ').trim() })) };
  });
};

/**
 * Déduit les colonnes en projetant horizontalement les cellules des lignes « tabulaires »
 * (au moins 2 cellules) : des intervalles qui se chevauchent forment une même colonne.
 * Les titres ou paragraphes sur toute la largeur sont ainsi ignorés pour le calcul.
 */
const detecterColonnes = (lignes) => {
  const intervalles = lignes
    .filter(({ cellules }) => cellules.length >= 2)
    .flatMap(({ cellules }) => cellules)
    .map((c) => [c.x0, c.x1])
    .sort((a, b) => a[0] - b[0]);

  const colonnes = [];
  for (const [x0, x1] of intervalles) {
    const derniere = colonnes[colonnes.length - 1];
    if (derniere && x0 <= derniere[1]) derniere[1] = Math.max(derniere[1], x1);
    else colonnes.push([x0, x1]);
  }
  return colonnes;
};

const indexColonne = (colonnes, cellule, seulSurLaLigne) => {
  if (!colonnes.length) return 0;
  // Texte seul sur sa ligne (titre, paragraphe) : placé d'après son bord gauche, pas son centre
  const centre = seulSurLaLigne ? cellule.x0 : (cellule.x0 + cellule.x1) / 2;
  let meilleur = 0;
  let meilleureDistance = Infinity;
  colonnes.forEach(([x0, x1], i) => {
    const distance = centre < x0 ? x0 - centre : centre > x1 ? centre - x1 : 0;
    if (distance < meilleureDistance) { meilleureDistance = distance; meilleur = i; }
  });
  return meilleur;
};

/**
 * Convertit "1 234,56", "1,234.56", "-12", "15 %" en nombre ; laisse le reste en texte.
 * Les identifiants à zéro initial (téléphones, matricules) restent du texte.
 */
const convertirValeur = (texte) => {
  const espaces = texte.trim().replace(/[\s\u00a0\u202f]+/g, ' ');
  const pourcentage = espaces.endsWith('%');
  const avecEspaces = pourcentage ? espaces.slice(0, -1).trim() : espaces;
  // Un espace n'est accepté que comme séparateur de milliers : "70 12 34 56" (téléphone) reste du texte
  if (avecEspaces.includes(' ') && !/^[-+]?\d{1,3}( \d{3})+([.,]\d+)?$/.test(avecEspaces)) return texte;
  const sansPourcent = avecEspaces.replace(/ /g, '');
  if (!/^[-+]?[\d.,]+$/.test(sansPourcent) || !/\d/.test(sansPourcent)) return texte;
  if (/^[-+]?0\d/.test(sansPourcent)) return texte;

  let normalise = sansPourcent;
  const derniereVirgule = normalise.lastIndexOf(',');
  const dernierPoint = normalise.lastIndexOf('.');
  if (derniereVirgule > dernierPoint) {
    normalise = normalise.replace(/\./g, '').replace(',', '.');      // format français
  } else if (dernierPoint > derniereVirgule && derniereVirgule !== -1) {
    normalise = normalise.replace(/,/g, '');                         // format anglais
  } else if (/^[-+]?\d{1,3}(\.\d{3})+$/.test(normalise)) {
    normalise = normalise.replace(/\./g, '');                        // 1.234.567
  }
  if ((normalise.match(/[.,]/g) || []).length > 1) return texte;

  const nombre = Number(normalise);
  if (!Number.isFinite(nombre)) return texte;
  return pourcentage ? nombre / 100 : nombre;
};

/**
 * Place les cellules d'une page dans une grille : une ligne par ligne de texte,
 * une colonne par colonne détectée. Deux textes tombés dans la même case sont concaténés.
 */
const construireGrillePage = (lignes) => {
  const colonnes = detecterColonnes(lignes);
  const grille = lignes.map(({ cellules }) => {
    const ligne = [];
    for (const cellule of cellules) {
      const col = indexColonne(colonnes, cellule, cellules.length === 1);
      ligne[col] = ligne[col] != null ? `${ligne[col]} ${cellule.texte}` : cellule.texte;
    }
    return ligne;
  });
  return {
    ys: lignes.map((l) => l.y),
    grille,
    nbColonnes: Math.max(0, ...grille.map((l) => l.length)),
  };
};

const TOLERANCE_Y = 2; // points

const memesLignes = (a, b) =>
  a.ys.length > 0 && a.ys.length === b.ys.length && a.ys.every((y, i) => Math.abs(y - b.ys[i]) <= TOLERANCE_Y);

const memeContenu = (a = [], b = []) =>
  a.length === b.length && a.every((v, i) => (v ?? '') === (b[i] ?? ''));

/**
 * Assemble toutes les pages dans une seule grille.
 * - Une page aux mêmes lignes (mêmes ordonnées) que la précédente mais avec un autre nombre
 *   de colonnes est la suite du tableau vers la droite (Excel coupe les tableaux trop larges
 *   à l'impression) : ses colonnes sont ajoutées à droite.
 * - Sinon la page est ajoutée en dessous ; une ligne d'en-tête répétée en haut de page est retirée.
 */
const assemblerPages = (pages) => {
  const resultat = [];
  let entete = null;
  let precedente = null;
  let bande = null; // { debut: ligne de départ, finColonnes: première colonne libre à droite }

  for (const page of pages) {
    if (!page.grille.length) continue;

    if (precedente && bande && memesLignes(page, precedente) && page.nbColonnes !== precedente.nbColonnes) {
      page.grille.forEach((ligne, i) => {
        const cible = (resultat[bande.debut + i] ??= []);
        ligne.forEach((valeur, col) => { cible[bande.finColonnes + col] = valeur; });
      });
      bande.finColonnes += page.nbColonnes;
    } else {
      let grille = page.grille;
      if (entete && memeContenu(grille[0], entete)) grille = grille.slice(1);
      entete ??= page.grille.find((l) => l.filter((v) => v != null).length >= 2) ?? null;
      bande = { debut: resultat.length, finColonnes: page.nbColonnes };
      resultat.push(...grille.map((l) => [...l]));
    }
    precedente = page;
  }
  return resultat;
};

/**
 * Convertit un PDF texte en classeur Excel d'une seule feuille, toutes pages assemblées.
 * Retourne le buffer .xlsx.
 */
const convertirPDFEnExcel = async (cheminFichier) => {
  const pdfjs = await chargerPdfjs();
  const donnees = new Uint8Array(await fs.readFile(cheminFichier));

  const chargement = pdfjs.getDocument({
    data: donnees,
    standardFontDataUrl: POLICES_STANDARD,
    useSystemFonts: false,
    isEvalSupported: false,
  });
  let pdf;
  try {
    pdf = await chargement.promise;
  } catch (err) {
    if (err?.name === 'PasswordException') {
      throw creerErreur('Ce PDF est protégé par un mot de passe. Déverrouillez-le d\'abord avec l\'outil « Déverrouiller un PDF ».');
    }
    await chargement.destroy();
    throw creerErreur('Le fichier PDF est illisible ou endommagé.');
  }

  if (pdf.numPages > MAX_PAGES) {
    await chargement.destroy();
    throw creerErreur(`Ce PDF contient ${pdf.numPages} pages. La conversion est limitée à ${MAX_PAGES} pages.`);
  }

  const pages = [];
  try {
    for (let numero = 1; numero <= pdf.numPages; numero++) {
      const page = await pdf.getPage(numero);
      pages.push(construireGrillePage(construireLignes(await extraireMorceaux(page))));
      page.cleanup();
    }
  } finally {
    await chargement.destroy();
  }

  const grille = assemblerPages(pages);

  const classeur = new ExcelJS.Workbook();
  classeur.creator = 'SecurPDFBF';
  const feuille = classeur.addWorksheet('Données');
  const largeurs = [];
  let totalCellules = 0;

  grille.forEach((ligne, i) => {
    const ligneExcel = feuille.getRow(i + 1);
    ligne.forEach((texte, col) => {
      if (texte == null) return;
      const cellule = ligneExcel.getCell(col + 1);
      cellule.value = convertirValeur(texte);
      if (typeof cellule.value === 'number' && texte.trim().endsWith('%')) cellule.numFmt = '0.##%';
      largeurs[col + 1] = Math.max(largeurs[col + 1] || 0, texte.length);
      totalCellules++;
    });
  });

  largeurs.forEach((largeur, col) => {
    if (largeur) feuille.getColumn(col).width = Math.min(Math.max(largeur + 2, 8), 60);
  });

  if (totalCellules === 0) {
    throw creerErreur(
      'Ce PDF ne contient pas de texte sélectionnable (document scanné ou image). ' +
      'La conversion en Excel n\'est possible que pour les PDF créés depuis un logiciel (Word, Excel, comptabilité…).',
      422,
    );
  }

  return Buffer.from(await classeur.xlsx.writeBuffer());
};

module.exports = { convertirPDFEnExcel, convertirValeur };
