'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { rateLimiter } = require('./middlewares/rateLimiter');
const { errorHandler } = require('./middlewares/errorHandler');
const securRoutes = require('./routes/secur.routes');

const app = express();

app.use(helmet());
app.use(express.json({ limit: '1mb' }));

const originesAutorisees = (process.env.FRONTEND_URL || 'http://localhost:4200')
  .split(',').map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || originesAutorisees.includes(origin)) callback(null, true);
    else callback(new Error(`Origine CORS non autorisée : ${origin}`));
  },
  methods: ['POST', 'GET'],
}));

app.use('/api', rateLimiter);
app.use('/api', securRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'SecurPDFBF API', version: '1.0.0' });
});

app.use((req, res) => {
  res.status(404).json({ erreur: 'Route introuvable.' });
});

app.use(errorHandler);

module.exports = app;
