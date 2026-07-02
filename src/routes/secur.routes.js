'use strict';

const { Router } = require('express');
const { upload, uploadPDF, uploadWord, uploadPDFs } = require('../config/multer');
const { validerOptions } = require('../validators/secur.validator');
const { securiserPDF } = require('../controllers/secur.controller');
const { compresserPDF } = require('../controllers/compresser.controller');
const { deverrouillerPDF, deverrouillerWord } = require('../controllers/deverrouiller.controller');
const { fusionnerPDFs } = require('../controllers/fusionner.controller');
const { soumettreJob, verifierStatut, telechargerResultat } = require('../controllers/bruteforce.controller');

const router = Router();

router.post('/securiser',          upload.single('fichier'),       validerOptions,  securiserPDF);
router.post('/compresser',         uploadPDF.single('fichier'),                     compresserPDF);
router.post('/deverrouiller-pdf',  uploadPDF.single('fichier'),                     deverrouillerPDF);
router.post('/deverrouiller-word', uploadWord.single('fichier'),                    deverrouillerWord);
router.post('/fusionner',          uploadPDFs.array('fichiers', 10),                fusionnerPDFs);
router.post('/bruteforce-word',    uploadWord.single('fichier'),                    soumettreJob);
router.get('/bruteforce-word/:jobId',          verifierStatut);
router.get('/bruteforce-word/:jobId/download', telechargerResultat);

module.exports = router;
