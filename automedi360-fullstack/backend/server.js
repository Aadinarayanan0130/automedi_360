const path = require('path');
const express = require('express');
const cors = require('cors');

const patientsRouter = require('./src/routes/patients');
const engineRouter = require('./src/routes/engine');
const auditRouter = require('./src/routes/audit');
const statsRouter = require('./src/routes/stats');
const keywordsRouter = require('./src/routes/keywords');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.use('/api/patients', patientsRouter);
app.use('/api/engine', engineRouter);
app.use('/api/audit', auditRouter);
app.use('/api/stats', statsRouter);
app.use('/api/keywords', keywordsRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'automedi-360-api', time: new Date().toISOString() });
});

// Serve the frontend as static files too, so `npm start` here is enough to
// run the whole app at http://localhost:4000 with zero extra setup. If you
// deploy the frontend separately (GitHub Pages, Vercel, etc.), just point
// frontend/config.js at this server's public URL instead — CORS is already
// enabled above for that case.
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND_DIR));
app.get('/', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

app.listen(PORT, () => {
  console.log('Automedi 360 API + frontend running at http://localhost:' + PORT);
});
