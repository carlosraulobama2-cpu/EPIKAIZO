// Aplicación Express. Solo se publican public/ (web) y panel-de-control/ (en /panel/): el código del servidor, .env y datos nunca se sirven.
const path = require('path');
const express = require('express');
const db = require('./db');
const { HttpError, text, phone, email, number, oneOf, date, uuid } = require('./lib/http');
const { securityHeaders, csrfGuard } = require('./lib/security');
const { crudRouter } = require('./lib/crud');
const { authenticate, requirePasswordChanged, requireRole } = require('./middleware/auth');

const PUBLIC_DIR = path.join(__dirname, '../../public');
const PANEL_DIR = path.join(__dirname, '../../panel-de-control');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Render (y cualquier proxy) pone la IP real en X-Forwarded-For.
  app.set('trust proxy', 1);

  app.use(securityHeaders);
  const jsonSmall = express.json({
    limit: '200kb',
    // Guardamos el cuerpo original para comprobar la firma del webhook de WhatsApp.
    verify: (req, res, buf) => {
      if (req.originalUrl.startsWith('/api/whatsapp')) req.rawBody = buf;
    },
  });
  // Las fotos de vehículos llegan reducidas por el panel (base64): necesitan algo más de margen.
  const jsonPhotos = express.json({ limit: '3mb' });
  app.use((req, res, next) => (req.method === 'POST' && /^\/api\/vehicles\/[^/]+\/photos$/.test(req.path) ? jsonPhotos : jsonSmall)(req, res, next));

  // ---- API -----------------------------------------------------------------------------------
  const api = express.Router();
  api.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.get('/health', async (req, res) => {
    await db.query('SELECT 1').then(() => res.json({ status: 'ok' }), () => res.status(503).json({ status: 'db_error' }));
  });

  // Públicos (web y Meta). El webhook va antes del control CSRF: Meta no manda Origin y se valida por firma.
  api.use('/whatsapp', require('./routes/whatsapp'));
  api.use(csrfGuard);
  api.use('/public', require('./routes/public'));
  api.use('/public', require('./routes/publicweb'));
  api.use('/chatbot', require('./routes/chatbot'));
  api.use('/auth', require('./routes/auth'));

  // Privados: todo lo de abajo exige sesión. El rol mínimo de cada sección está aquí, a la vista.
  api.use(authenticate, requirePasswordChanged);
  const operador = requireRole('operador');
  const gestor = requireRole('gestor');
  const admin = requireRole('admin');

  api.use('/reports', operador, require('./routes/reports'));
  api.use('/shipments', operador, require('./routes/shipments'));
  api.use('/jobs', operador, require('./routes/jobs'));
  api.use('/clients', operador, require('./routes/clients'));
  api.use('/inbox', operador, require('./routes/inbox'));
  api.use('/invoices', gestor, require('./routes/invoices'));
  api.use('/vehicles', operador, require('./routes/vehicles'));
  api.use('/settings', operador, require('./routes/settings'));
  api.use('/users', admin, require('./routes/users'));
  api.use('/audit', admin, require('./routes/audit'));
  api.use('/gmail', admin, require('./routes/gmail'));
  api.use('/offices', operador, require('./routes/offices'));
  api.use('/cash-sessions', operador, require('./routes/cashSessions').router);
  api.use('/trips', operador, require('./routes/trips'));
  api.use('/backups', admin, require('./routes/backups'));
  api.use('/materials', operador, require('./routes/materials'));
  api.use('/web', operador, require('./routes/webcontent'));

  api.use(
    '/employees',
    crudRouter({
      table: 'employees',
      entity: 'empleado',
      roles: { read: 'operador', write: 'gestor', delete: 'gestor' },
      search: ['name', 'position', 'phone', 'city'],
      order: 'status, name',
      listFilters: (f, q) => f.eq('status', q.status, ['activo', 'inactivo']),
      fields: {
        name: text({ min: 2, max: 120 }),
        position: text({ min: 2, max: 80 }),
        phone: phone({ optional: true }),
        email: email({ optional: true }),
        city: text({ max: 80, optional: true }),
        status: oneOf(['activo', 'inactivo']),
        start_date: date({ optional: true }),
        notes: text({ max: 500, optional: true }),
      },
    })
  );
  api.use(
    '/providers',
    crudRouter({
      table: 'providers',
      entity: 'proveedor',
      roles: { read: 'gestor', write: 'gestor', delete: 'gestor' },
      search: ['name', 'service', 'phone', 'city'],
      order: 'name',
      fields: {
        name: text({ min: 2, max: 120 }),
        service: text({ min: 2, max: 120 }),
        phone: phone({ optional: true }),
        email: email({ optional: true }),
        city: text({ max: 80, optional: true }),
        notes: text({ max: 500, optional: true }),
      },
    })
  );
  api.use(
    '/cash',
    crudRouter({
      table: 'cash_movements',
      entity: 'caja',
      roles: { read: 'gestor', write: 'gestor', delete: 'admin' },
      search: ['concept', 'category', 'reference'],
      order: 'date DESC, created_at DESC',
      hasUpdatedAt: false,
      listFilters: (f, q) => {
        f.eq('type', q.type, ['ingreso', 'gasto']).range('date', q.from, q.to);
        if (/^[0-9a-f-]{36}$/i.test(q.office_id || '')) f.eq('office_id', q.office_id);
      },
      fields: {
        type: oneOf(['ingreso', 'gasto']),
        category: text({ min: 2, max: 60 }),
        concept: text({ min: 2, max: 200 }),
        amount: number({ min: 0.01, max: 1e10 }),
        date: date(),
        method: oneOf(['efectivo', 'transferencia', 'movil', 'tarjeta'], { optional: true }),
        reference: text({ max: 80, optional: true }),
        office_id: uuid({ optional: true }),
      },
    })
  );

  api.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
  app.use('/api', api);

  // ---- Web pública y panel ----------------------------------------------------------------------
  const staticOptions = {
    dotfiles: 'deny',
    // /construccion sirve construccion.html y /panel/login sirve login.html (direcciones limpias)
    extensions: ['html'],
    index: 'index.html',
    redirect: false,
    setHeaders: (res, file) => {
      // HTML, CSS, JS y el manifiesto se comprueban siempre (respuesta 304 ligera si no cambiaron):
      // así, tras una actualización nadie se queda con una versión vieja del panel o de la web.
      // Imágenes y fuentes, que casi no cambian, con caché de 1 hora.
      res.setHeader('Cache-Control', /\.(html|css|js|webmanifest)$/.test(file) ? 'no-cache' : 'public, max-age=3600');
    },
  };
  // Direcciones antiguas del panel: se redirigen conservando la consulta (?id=, ?volver=).
  const moved = (to) => (req, res) => {
    const query = req.originalUrl.indexOf('?');
    res.redirect(301, to + (query === -1 ? '' : req.originalUrl.slice(query)));
  };
  // Express no distingue /panel de /panel/: solo se redirige la forma sin barra.
  app.get('/panel', (req, res, next) => (req.path === '/panel' ? moved('/panel/')(req, res) : next()));
  app.get(['/login', '/login.html'], moved('/panel/login'));
  app.get('/documento.html', moved('/panel/documento'));
  // Panel de control: carpeta panel-de-control/, servida en /panel/.
  app.use('/panel', express.static(PANEL_DIR, staticOptions));
  app.use(express.static(PUBLIC_DIR, staticOptions));
  app.use((req, res) => res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html')));

  // ---- Errores --------------------------------------------------------------------------------
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    let status = err.status || err.statusCode || 500;
    let message = err.message;
    if (err.type === 'entity.parse.failed') {
      status = 400;
      message = 'El cuerpo de la petición no es JSON válido';
    } else if (err.type === 'entity.too.large') {
      status = 413;
      message = 'Los datos enviados son demasiado grandes';
    } else if (err.code === '22P02') {
      status = 404;
      message = 'No encontrado';
    } else if (err.code === '23505') {
      status = 409;
      message = 'Ese registro ya existe';
    } else if (err.code === '23503') {
      status = 409;
      message = 'Hay datos relacionados que lo impiden';
    } else if (!(err instanceof HttpError) && status >= 500) {
      // Errores inesperados: detalle al log, mensaje genérico al cliente (sin SQL ni rutas internas).
      console.error(`[${req.method} ${req.originalUrl}]`, err);
      message = 'Error interno del servidor';
    }
    res.status(status).json({ error: message, ...(err.details ? { fields: err.details } : {}) });
  });

  return app;
}

module.exports = { createApp, PUBLIC_DIR, PANEL_DIR };
