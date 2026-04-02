'use strict';

const validerOptions = (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ erreur: 'Aucun fichier PDF reçu.' });
  }

  // Au moins une restriction ou un mot de passe requis
  const {
    motDePasseOuverture,
    interdireCopie,
    interdireImpression,
    interdireModification,
    interdireAnnotations,
  } = req.body;

  const aucuneRestriction =
    !motDePasseOuverture &&
    interdireCopie !== 'true' &&
    interdireImpression !== 'true' &&
    interdireModification !== 'true' &&
    interdireAnnotations !== 'true';

  if (aucuneRestriction) {
    return res.status(400).json({
      erreur: 'Veuillez sélectionner au moins une restriction ou définir un mot de passe.',
    });
  }

  // Validation mot de passe (min 4 caractères si fourni)
  if (motDePasseOuverture && motDePasseOuverture.trim().length < 4) {
    return res.status(400).json({
      erreur: 'Le mot de passe doit contenir au moins 4 caractères.',
    });
  }

  next();
};

module.exports = { validerOptions };
