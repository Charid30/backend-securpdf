'use strict';

require('dotenv').config();
const app = require('./src/app');

const PORT = process.env.PORT || 1700;

const server = app.listen(PORT, () => {
  console.log(`SecurPDFBF API démarrée sur http://localhost:${PORT}`);
  console.log(`Environnement : ${process.env.NODE_ENV || 'development'}`);
});

// 5 minutes — couvre Ghostscript sur les gros PDFs et les connexions mobiles lentes
server.timeout = 5 * 60 * 1000;
server.keepAliveTimeout = 65 * 1000; // > 60s (load balancers Render/Heroku)
