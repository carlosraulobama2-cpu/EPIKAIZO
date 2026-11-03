// Ajustes de la empresa y copia de seguridad (exportar). Leer: cualquier usuario; cambiar: admin.
const express = require('express');
const config = require('../config');
const db = require('../db');
const whatsapp = require('../services/whatsapp');
const { route, validate, text, phone, email, number, oneOf, bool, HttpError } = require('../lib/http');
const { requireRole, forgetTwoFactorSetting } = require('../middleware/auth');
const { audit } = require('../services/audit');
const { getSettings, saveSetting } = require('../services/settings');
const { today } = require('../lib/dates');
const { exportData, driveConfigured } = require('../services/backup');

const router = express.Router();

// integrations: qué servicios externos tiene configurados el servidor (solo sí/no, nunca las claves).
const integrations = () => ({
  whatsapp: whatsapp.enabled(),
  gmail: Boolean(config.gmail.clientId && config.gmail.clientSecret && config.gmail.refreshToken),
  ai: Boolean(config.ai.key),
  drive: driveConfigured(),
});

// Las oficinas van con los ajustes: el panel las necesita en casi todas las pantallas.
const officesOf = (tenantId) => db.many('SELECT id, name, city, address, phone, active FROM offices WHERE tenant_id = $1 ORDER BY active DESC, name', [tenantId]);

router.get('/', route(async (req, res) => res.json({ ...(await getSettings(req.tenantId)), offices: await officesOf(req.tenantId), integrations: integrations() })));

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
      ...validate(r, { currency: oneOf(['XAF'], { optional: true }), package_base_fee: number({ min: 0, max: 1e7 }), money_min_commission: number({ min: 0, max: 1e7 }) }),
      currency: 'XAF', // Siempre francos CFA.
      package_per_kg: scopes(r.package_per_kg, 1e7),
      money_commission_pct: scopes(r.money_commission_pct, 50),
    };
    const billingSettings = body.billing
      ? validate(body.billing, {
        tax_name: text({ min: 2, max: 20 }),
        tax_rate: number({ min: 0, max: 50 }),
        tax_id: text({ max: 40, optional: true }),
        bank_account: text({ max: 120, optional: true }),
        payment_days: number({ min: 0, max: 365 }),
        quote_valid_days: number({ min: 1, max: 365 }),
        footer: text({ max: 300, optional: true }),
      })
      : null;
    const notifications = body.notifications ? validate(body.notifications, { shipment_status: bool(), shipment_created: bool(), review_request: bool() }) : null;
    const payments = body.payments ? validate(body.payments, { mobile_number: text({ max: 40, optional: true }), mobile_name: text({ max: 80, optional: true }), instructions: text({ max: 300, optional: true }) }) : null;
    const security = body.security ? validate(body.security, { require_admin_2fa: bool(), idle_minutes: number({ min: 5, max: 480 }) }) : null;
    if (security && security.require_admin_2fa && !req.user.totp_enabled) {
      throw new HttpError(409, 'Activa primero tu propia doble verificación (Mi cuenta) antes de exigírsela a los administradores');
    }
    const cities = Array.isArray(body.cities)
      ? [...new Set(body.cities.map((c) => String(c).trim()).filter((c) => c && c.length <= 60))].slice(0, 60)
      : undefined;
    await db.tx(async (client) => {
      await saveSetting(req.tenantId, 'company', company, client);
      await saveSetting(req.tenantId, 'rates', rates, client);
      if (cities && cities.length) await saveSetting(req.tenantId, 'cities', cities, client);
      if (billingSettings) await saveSetting(req.tenantId, 'billing', billingSettings, client);
      if (notifications) await saveSetting(req.tenantId, 'notifications', notifications, client);
      if (payments) await saveSetting(req.tenantId, 'payments', payments, client);
      if (security) await saveSetting(req.tenantId, 'security', security, client);
      await audit(req, 'ajustes.guardar', { entity: 'settings', details: { rates } }, client);
    });
    if (security) forgetTwoFactorSetting(req.tenantId);
    res.json({ ...(await getSettings(req.tenantId)), offices: await officesOf(req.tenantId), integrations: integrations() });
  })
);

// Exportar todo (JSON) para descargarlo. La importación masiva se quitó: permitía borrar datos e inyectar SQL.
router.get(
  '/export',
  requireRole('admin'),
  route(async (req, res) => {
    const data = await exportData(req.tenantId);
    await audit(req, 'copia.exportar', { entity: 'settings' });
    res.setHeader('Content-Disposition', `attachment; filename="epikaizo-copia-${today()}.json"`);
    res.json(data);
  })
);

module.exports = router;
