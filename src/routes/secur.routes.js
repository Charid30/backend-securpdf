'use strict';

const { Router } = require('express');
const { upload } = require('../config/multer');
const { validerOptions } = require('../validators/secur.validator');
const { securiserPDF } = require('../controllers/secur.controller');

const router = Router();

router.post('/securiser', upload.single('fichier'), validerOptions, securiserPDF);

module.exports = router;
