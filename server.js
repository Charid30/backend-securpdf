'use strict';

require('dotenv').config();
const app = require('./src/app');

const PORT = process.env.PORT || 1700;

app.listen(PORT, () => {
  console.log(`SecurPDFBF API démarrée sur http://localhost:${PORT}`);
  console.log(`Environnement : ${process.env.NODE_ENV || 'development'}`);
});
