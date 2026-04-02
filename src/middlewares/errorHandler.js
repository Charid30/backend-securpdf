'use strict';

const fs = require('fs');

const errorHandler = (err, req, res, next) => {
  // Supprime le fichier uploadé en cas d'erreur
  if (req.file?.path) {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
  }
  console.error('[SecurPDFBF Error]', err.message);
  const status = err.status || 500;
  res.status(status).json({ erreur: err.message || 'Erreur interne du serveur.' });
};

module.exports = { errorHandler };
