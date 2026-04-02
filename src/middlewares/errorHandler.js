'use strict';

const fs = require('fs');

const errorHandler = (err, req, res, next) => {
  // Supprime le fichier uploadé en cas d'erreur
  if (req.file?.path) {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
  }
  const message = err?.message || (typeof err === 'string' ? err : JSON.stringify(err));
  console.error('[SecurPDFBF Error]', message, err);
  const status = err?.status || 500;
  res.status(status).json({ erreur: message || 'Erreur interne du serveur.' });
};

module.exports = { errorHandler };
