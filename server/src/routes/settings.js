// Ajustes de la empresa y copia de seguridad (exportar). Leer: cualquier usuario; cambiar: admin.
const express = require('express');
const db = require('../db');
const { route, validate, text, phone, email, number, oneOf } = require('../lib/http');
const { requireRole } = require('../middleware/auth');
const { audit } = require('../services/audit');
const { getSettings, saveSetting } = require('../services/settings');

const router = express.Router();

router.get('/', route(async (req, res) => res.json(await getSettings(req.tenantId))));

router.put(
  '/',
  requireRole('admin'),
  route(async (req, res) => {
    const body = req.body || {};
    const company = validate(body.company, {
      name: text({ min: 2, max: 120 }),
      phone: text({ min: 6, max: 30 }),
      whatsapp: phone(),
      email: email(),
      address: text({ max: 200 }),
      hours: text({ max: 120 }),
      city: text({ max: 80 }),
    });
    const scopes = (obj, max) => validate(obj, { local: number({ min: 0, max }), nacional: number({ min: 0, max }), internacional: number({ min: 0, max }) });
    const r = body.rates || {};
    const rates = {
      ...validate(r, { currency: oneOf(['USD', 'EUR', 'XAF']), package_base_fee: number({ min: 0, max: 1e7 }), money_min_commission: number({ min: 0, max: 1e7 }) }),
      package_per_kg: scopes(r.package_per_kg, 1e7),
      money_commission_pct: scopes(r.money_commission_pct, 50),
    };
    const cities = Array.isArray(body.cities)
      ? [...new Set(body.cities.map((c) => String(c).trim()).filter((c) => c && c.length <= 60))].slice(0, 60)
      : undefined;
    await db.tx(async (client) => {
      await saveSetting(req.tenantId, 'company', company, client);
      await saveSetting(req.tenantId, 'rates', rates, client);
      if (cities && cities.length) await saveSetting(req.tenantId, 'cities', cities, client);
      await audit(req, 'ajustes.guardar', { entity: 'settings', details: { rates } }, client);
    });
    res.json(await getSettings(req.tenantId));
  })
);

// Exportar todo (JSON). La importación masiva se quitó: permitía borrar datos e inyectar SQL.
const EXPORT_TABLES = ['clients', 'shipments', 'shipment_events', 'jobs', 'messages', 'invoices', 'cash_movements', 'employees', 'providers'];

router.get(
  '/export',
  requireRole('admin'),
  route(async (req, res) => {
    const data = {};
    for (const table of EXPORT_TABLES) {
      data[table] = table === 'shipment_events'
        ? await db.many('SELECT e.* FROM shipment_events e JOIN shipments s ON s.id = e.shipment_id WHERE s.tenant_id = $1', [req.tenantId])
        : await db.many(`SELECT * FROM ${table} WHERE tenant_id = $1`, [req.tenantId]);
    }
    await audit(req, 'copia.exportar', { entity: 'settings' });
    const day = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="epikaizo-copia-${day}.json"`);
    res.json({ exported_at: new Date().toISOString(), version: 2, data });
  })
);

module.exports = router;
