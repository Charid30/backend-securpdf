'use strict';

const multer = require('multer');
const os = require('os');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const MAX_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || '20') * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, os.tmpdir()),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

const filtrerPDF = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') cb(null, true);
  else cb(new Error('Seuls les fichiers PDF sont acceptés.'));
};

const filtrerWord = (req, file, cb) => {
  const typesAutorises = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
  ];
  if (typesAutorises.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Seuls les fichiers Word (.doc, .docx) sont acceptés.'));
};

const upload    = multer({ storage, fileFilter: filtrerPDF,  limits: { fileSize: MAX_SIZE } });
const uploadPDF = multer({ storage, fileFilter: filtrerPDF,  limits: { fileSize: MAX_SIZE } });
const uploadWord = multer({ storage, fileFilter: filtrerWord, limits: { fileSize: MAX_SIZE } });
const uploadPDFs = multer({ storage, fileFilter: filtrerPDF,  limits: { fileSize: MAX_SIZE } });

module.exports = { upload, uploadPDF, uploadWord, uploadPDFs };
