// Ajustes de la empresa. La web pública (cotizador, contacto) y el panel leen los mismos valores.
const db = require('../db');

const DEFAULTS = {
  company: {
    name: 'Epikaizo Services S.L.',
    phone: '+240 222 580 828',
    whatsapp: '240222580828',
    email: 'epikaizoservices123@gmail.com',
    address: 'Barrio Ngolo-Puente Sialo',
    hours: 'Lunes a sábado, 8:00 a 18:00',
    city: 'Malabo',
  },
  // Tarifas del cotizador: las mismas que tenía la web.
  rates: {
    currency: 'USD',
    package_base_fee: 5,
    package_per_kg: { local: 4, nacional: 9, internacional: 22 },
    money_commission_pct: { local: 2, nacional: 3.5, internacional: 6 },
    money_min_commission: 2,
  },
  // Facturación. El IVA general de Guinea Ecuatorial es del 15 %: confírmalo con tu asesor fiscal.
  billing: {
    tax_name: 'IVA',
    tax_rate: 15,
    tax_id: '',
    bank_account: '',
    payment_days: 15,
    quote_valid_days: 30,
    footer: 'Gracias por confiar en Epikaizo Services.',
  },
  cities: ['Malabo', 'Bata', 'Ebebiyín', 'Mongomo', 'Luba', 'Evinayong', 'Aconibe', 'Micomeseng', 'Añisoc', 'Rebola', 'Riaba', 'Nsork'],
};

async function getSettings(tenantId) {
  const rows = await db.many('SELECT key, value FROM settings WHERE tenant_id = $1', [tenantId]);
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    company: { ...DEFAULTS.company, ...(stored.company || {}) },
    rates: {
      ...DEFAULTS.rates,
      ...(stored.rates || {}),
      package_per_kg: { ...DEFAULTS.rates.package_per_kg, ...((stored.rates || {}).package_per_kg || {}) },
      money_commission_pct: { ...DEFAULTS.rates.money_commission_pct, ...((stored.rates || {}).money_commission_pct || {}) },
    },
    billing: { ...DEFAULTS.billing, ...(stored.billing || {}) },
    cities: stored.cities || DEFAULTS.cities,
  };
}

async function saveSetting(tenantId, key, value, client) {
  await db.query(
    `INSERT INTO settings (tenant_id, key, value, updated_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [tenantId, key, JSON.stringify(value)],
    client
  );
}

/** Precio de un envío con las tarifas de la empresa. */
function quote(rates, { kind, scope, weightKg, amount }) {
  if (kind === 'paquete') {
    const perKg = rates.package_per_kg[scope] || 0;
    const fee = Number(rates.package_base_fee) + Number(weightKg || 0) * perKg;
    return { fee: round(fee), total: round(fee) };
  }
  const pct = rates.money_commission_pct[scope] || 0;
  const fee = Math.max((Number(amount || 0) * pct) / 100, Number(rates.money_min_commission) || 0);
  return { fee: round(fee), total: round(Number(amount || 0) + fee) };
}

const round = (n) => Math.round(n * 100) / 100;

module.exports = { DEFAULTS, getSettings, saveSetting, quote };
