const { initDb } = require('./config/database');
const express = require('express');
const cors = require('cors');
const path = require('path');
const { authenticate } = require('./middleware/auth');
const { requireAdmin } = require('./middleware/admin');
require('dotenv').config();

async function start() {
  await initDb();

  const app = express();

  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3001,https://epikaizo.com')
    .split(',').map(o => o.trim());
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error('Origen no permitido por CORS'));
    },
    credentials: true
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

  const rootDir = path.join(__dirname, '../..');
  app.use(express.static(rootDir));

  app.get(['/panel.html', '/index.html'], (req, res) => {
    res.sendFile(path.join(rootDir, req.url === '/' ? 'index.html' : req.url));
  });

  app.get('/admin-panel', requireAdmin, (req, res) => {
    res.sendFile(path.join(rootDir, 'panel.html'));
  });

  app.use((req, res, next) => {
    const fs = require('fs');
    const possible = path.join(rootDir, req.url === '/' ? 'index.html' : req.url);
    if (req.url && fs.existsSync(possible)) {
      return next();
    }
    next();
  });

  app.get('/404.html', (req, res) => {
    res.sendFile(path.join(rootDir, '404.html'));
  });

  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ---- Public tracking endpoint (no auth required) ----
  app.get('/api/track/:code', (req, res) => {
    try {
      const code = (req.params.code || '').trim().toUpperCase();
      if (!/^EPZ-\d{4,8}$/i.test(code)) {
        return res.status(400).json({ error: 'Formato de guía inválido. Usa EPZ-XXXXXX.' });
      }
      const { prepare } = require('./config/database');
      // Search by ID that contains the tracking code (case-insensitive)
      const allPkgs = prepare("SELECT id, status, sender_name, receiver_name, destination, type, date, created_at FROM packages WHERE UPPER(id) LIKE ?").all(`%${code}%`);
      if (!allPkgs.length) {
        return res.json({ found: false });
      }
      const pkg = allPkgs[0];
      const statusMap = { recibido: 0, 'en tránsito': 1, 'en transito': 1, 'en reparto': 2, entregado: 3 };
      const step = statusMap[(pkg.status || '').toLowerCase()] ?? 0;
      res.json({
        found: true,
        code: code,
        status: pkg.status,
        step: step,
        receiver: pkg.receiver_name,
        destination: pkg.destination,
        type: pkg.type,
        date: pkg.date
      });
    } catch (err) {
      console.error('Track error:', err);
      res.status(500).json({ error: 'Error al rastrear el paquete.' });
    }
  });

  app.use('/api/tenants', authenticate, require('./routes/tenants'));
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/users', authenticate, require('./routes/users'));
  app.use('/api/plans', authenticate, require('./routes/plans'));
  app.use('/api/packages', authenticate, require('./routes/packages'));
  app.use('/api/cars', authenticate, require('./routes/cars'));
  app.use('/api/leads', authenticate, require('./routes/entities'));
  app.use('/api/tasks', authenticate, require('./routes/entities'));
  app.use('/api/orders', authenticate, require('./routes/entities'));
  app.use('/api/expenses', authenticate, require('./routes/entities'));
  app.use('/api/employees', authenticate, require('./routes/entities'));
  app.use('/api/providers', authenticate, require('./routes/entities'));
  app.use('/api/notifications', authenticate, require('./routes/entities'));
  app.use('/api/messages', authenticate, require('./routes/messages'));
  app.use('/api/gmail', authenticate, require('./routes/gmail'));
  app.use('/api/invoices', authenticate, require('./routes/invoices'));
  app.use('/api/backup', authenticate, require('./routes/backup'));
  app.use('/api/audit', authenticate, require('./routes/audit'));
  app.use('/api/settings', authenticate, require('./routes/settings'));
  app.use('/api/dashboard', authenticate, require('./routes/dashboard'));
  app.use('/api/whatsapp', authenticate, require('./routes/whatsapp'));
  app.use('/api/chatbot', require('./routes/chatbot'));

  app.post('/api/analytics', (req, res) => {
    try {
      const payload = req.body || {};
      const fs = require('fs');
      const path = require('path');
      const logDir = path.join(__dirname, '../../data');
      const logFile = path.join(logDir, 'analytics.json');
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
      let logs = [];
      try { logs = JSON.parse(fs.readFileSync(logFile, 'utf8')); } catch {}
      logs.push(Object.assign({}, payload, { receivedAt: new Date().toISOString() }));
      if (logs.length > 500) logs = logs.slice(-500);
      fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
      res.status(204).end();
    } catch (err) {
      res.status(200).end();
    }
  });

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor' });
  });

  app.use((req, res) => {
    if (req.accepts('html')) {
      return res.status(404).sendFile(path.join(rootDir, '404.html'));
    }
    res.status(404).json({ error: 'Ruta no encontrada' });
  });

  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log('Server running on http://localhost:' + PORT);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
