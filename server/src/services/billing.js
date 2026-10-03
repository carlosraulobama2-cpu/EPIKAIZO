// Facturación: presupuestos, facturas, rectificativas y cobros.
//
// Reglas (las de cualquier software de facturación serio):
// - Una factura emitida NO se edita ni se borra. Si hay un error se anula con una factura
//   rectificativa (REC) que la compensa; las dos quedan en el registro.
// - Cada serie (FAC, PRE, REC) tiene su numeración anual correlativa, sin huecos ni duplicados.
// - Los importes los calcula el servidor a partir de las líneas: el navegador nunca manda totales.
// - Un presupuesto aceptado se puede facturar de una vez o por partes (anticipo, certificaciones
//   de obra, resto), sin pasar nunca del 100 %.
const crypto = require('crypto');
const db = require('../db');
const { HttpError } = require('../lib/http');

const SERIES = { factura: 'FAC', presupuesto: 'PRE', rectificativa: 'REC' };
const round = (n) => Math.round(Number(n) * 100) / 100;

async function nextNumber(tenantId, kind, client) {
  const year = new Date().getFullYear();
  // La serie de facturas conserva el contador que ya existía ("factura-AAAA").
  const counter = kind === 'factura' ? `factura-${year}` : `${kind}-${year}`;
  const row = await db.one(
    `INSERT INTO counters (tenant_id, name, value) VALUES ($1, $2, 1)
     ON CONFLICT (tenant_id, name) DO UPDATE SET value = counters.value + 1 RETURNING value`,
    [tenantId, counter],
    client
  );
  return `${SERIES[kind]}-${year}-${String(row.value).padStart(5, '0')}`;
}

/** Normaliza las líneas y calcula base, impuesto y total. */
function computeLines(lines) {
  if (!Array.isArray(lines) || !lines.length) throw new HttpError(422, 'Añade al menos una línea');
  if (lines.length > 50) throw new HttpError(422, 'Máximo 50 líneas por documento');
  const out = lines.map((l, i) => {
    const description = String((l && l.description) || '').trim().slice(0, 300);
    const quantity = Number(l && l.quantity);
    const unitPrice = Number(l && l.unit_price);
    const taxRate = Number(l && l.tax_rate);
    if (!description) throw new HttpError(422, `La línea ${i + 1} no tiene descripción`);
    if (!(quantity > 0) || quantity > 1e6) throw new HttpError(422, `La cantidad de la línea ${i + 1} no es válida`);
    if (!(unitPrice >= 0) || unitPrice > 1e10) throw new HttpError(422, `El precio de la línea ${i + 1} no es válido`);
    if (!(taxRate >= 0) || taxRate > 50) throw new HttpError(422, `El impuesto de la línea ${i + 1} no es válido`);
    const base = round(quantity * unitPrice);
    return { description, quantity: round(quantity), unit_price: round(unitPrice), tax_rate: round(taxRate), base, tax: round((base * taxRate) / 100) };
  });
  const subtotal = round(out.reduce((s, l) => s + l.base, 0));
  const tax = round(out.reduce((s, l) => s + l.tax, 0));
  if (!(subtotal + tax > 0)) throw new HttpError(422, 'El total del documento debe ser mayor que cero');
  return { lines: out, subtotal, tax, total: round(subtotal + tax) };
}

const addDays = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
};

/**
 * Crea un presupuesto, factura o rectificativa. data: datos del cliente, lines y enlaces opcionales
 * (job_id, shipment_id, vehicle_id, quote_id, rectifies_id).
 */
async function createDocument(tenantId, data, { userId = null, client, billing, currency }) {
  const kind = data.kind || 'factura';
  const totals = computeLines(data.lines);
  const number = await nextNumber(tenantId, kind, client);
  const status = kind === 'presupuesto' ? 'pendiente' : 'emitida';
  const concept = (data.concept || totals.lines[0].description).slice(0, 200);
  return db.one(
    `INSERT INTO invoices (id, tenant_id, kind, number, status, client_id, client_name, client_phone, client_email, client_document, client_address,
                           concept, lines, subtotal, tax_amount, amount, currency, issue_date, due_date, valid_until, notes,
                           shipment_id, job_id, vehicle_id, quote_id, rectifies_id, invoiced_pct, reason, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,CURRENT_DATE,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
     RETURNING *`,
    [
      crypto.randomUUID(), tenantId, kind, number, status, data.client_id || null, data.client_name, data.client_phone,
      data.client_email || null, data.client_document || null, data.client_address || null,
      concept, JSON.stringify(totals.lines), totals.subtotal, totals.tax, totals.total, currency,
      kind === 'factura' ? data.due_date || addDays(billing.payment_days) : null,
      kind === 'presupuesto' ? data.valid_until || addDays(billing.quote_valid_days) : null,
      data.notes || null, data.shipment_id || null, data.job_id || null, data.vehicle_id || null,
      data.quote_id || null, data.rectifies_id || null, data.invoiced_pct || null, data.reason || null, userId,
    ],
    client
  );
}

/** Registra un cobro y recalcula el estado: parcial o pagada. */
async function registerPayment(invoice, { amount, method, paid_on, reference }, { userId, client }) {
  if (invoice.kind !== 'factura') throw new HttpError(409, 'Solo se cobran facturas');
  if (invoice.status === 'anulada') throw new HttpError(409, 'La factura está anulada');
  const pending = round(Number(invoice.amount) - Number(invoice.paid_amount));
  if (pending <= 0) throw new HttpError(409, 'Esta factura ya está cobrada del todo');
  if (round(amount) > pending) throw new HttpError(422, `El cobro supera lo pendiente (${pending})`);
  await db.query(
    'INSERT INTO invoice_payments (id, invoice_id, amount, method, paid_on, reference, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [crypto.randomUUID(), invoice.id, round(amount), method, paid_on || new Date().toISOString().slice(0, 10), reference || null, userId],
    client
  );
  return db.one(
    `UPDATE invoices SET paid_amount = paid_amount + $2,
            status = CASE WHEN paid_amount + $2 >= amount THEN 'pagada' ELSE 'parcial' END
      WHERE id = $1 RETURNING *`,
    [invoice.id, round(amount)],
    client
  );
}

/**
 * Anula una factura emitiendo su rectificativa (REC) por el mismo importe.
 * Si era una venta de vehículo, el vehículo vuelve a estar disponible.
 */
async function annul(invoice, reason, { userId, client, billing }) {
  if (invoice.kind !== 'factura') throw new HttpError(409, 'Solo se rectifican facturas');
  if (invoice.status === 'anulada') throw new HttpError(409, 'La factura ya está anulada');
  if (Number(invoice.paid_amount) > 0) {
    throw new HttpError(409, 'Esta factura tiene cobros. Devuelve el dinero al cliente y anota la devolución en Caja antes de anularla.');
  }
  const rect = await createDocument(
    invoice.tenant_id,
    {
      kind: 'rectificativa',
      client_id: invoice.client_id,
      client_name: invoice.client_name,
      client_phone: invoice.client_phone,
      client_email: invoice.client_email,
      client_document: invoice.client_document,
      client_address: invoice.client_address,
      concept: `Rectifica y anula la factura ${invoice.number}`,
      lines: invoice.lines.map((l) => ({ description: l.description, quantity: l.quantity, unit_price: l.unit_price, tax_rate: l.tax_rate })),
      job_id: invoice.job_id,
      shipment_id: invoice.shipment_id,
      vehicle_id: invoice.vehicle_id,
      quote_id: invoice.quote_id,
      rectifies_id: invoice.id,
      reason,
    },
    { userId, client, billing, currency: invoice.currency }
  );
  await db.query("UPDATE invoices SET status = 'anulada', reason = $2 WHERE id = $1", [invoice.id, reason], client);
  if (invoice.vehicle_id) {
    await db.query(
      "UPDATE vehicles SET status = 'disponible', sold_at = NULL, invoice_id = NULL, client_id = NULL, updated_at = now() WHERE id = $1 AND invoice_id = $2",
      [invoice.vehicle_id, invoice.id],
      client
    );
  }
  if (invoice.quote_id) await refreshQuote(invoice.quote_id, client);
  return rect;
}

/** Porcentaje ya facturado de un presupuesto (facturas no anuladas). */
async function invoicedPct(quoteId, client) {
  const row = await db.one(
    "SELECT COALESCE(sum(invoiced_pct), 0) AS pct FROM invoices WHERE quote_id = $1 AND kind = 'factura' AND status <> 'anulada'",
    [quoteId],
    client
  );
  return round(row.pct);
}

async function refreshQuote(quoteId, client) {
  const pct = await invoicedPct(quoteId, client);
  await db.query(
    `UPDATE invoices SET status = CASE WHEN $2 >= 100 THEN 'facturado' WHEN status = 'facturado' THEN 'aceptado' ELSE status END
      WHERE id = $1 AND kind = 'presupuesto'`,
    [quoteId, pct],
    client
  );
  return pct;
}

/**
 * Factura un presupuesto aceptado. mode: 'total' (todo de una vez), 'porcentaje' (anticipo o
 * certificación de obra) o 'resto' (lo que falte).
 */
async function invoiceFromQuote(quote, { mode, pct, label }, { userId, client, billing }) {
  if (quote.kind !== 'presupuesto') throw new HttpError(409, 'Solo se factura desde un presupuesto');
  if (!['aceptado', 'facturado'].includes(quote.status)) throw new HttpError(409, 'Marca primero el presupuesto como aceptado por el cliente');
  const done = await invoicedPct(quote.id, client);
  const remaining = round(100 - done);
  if (remaining <= 0) throw new HttpError(409, 'Este presupuesto ya está facturado al 100 %');

  let share;
  if (mode === 'total') {
    if (done > 0) throw new HttpError(409, `Ya se ha facturado el ${done} %. Usa «Facturar el resto».`);
    share = 100;
  } else if (mode === 'resto') {
    share = remaining;
  } else {
    share = round(pct);
    if (!(share > 0) || share > remaining) throw new HttpError(422, `El porcentaje debe estar entre 0 y ${remaining} %`);
  }

  // Al 100 % se copian las líneas; si es una parte, una línea por tipo de impuesto con el porcentaje.
  let lines;
  if (share === 100) {
    lines = quote.lines.map((l) => ({ description: l.description, quantity: l.quantity, unit_price: l.unit_price, tax_rate: l.tax_rate }));
  } else {
    const byRate = new Map();
    for (const l of quote.lines) byRate.set(l.tax_rate, (byRate.get(l.tax_rate) || 0) + Number(l.base));
    const what = label || (mode === 'resto' ? 'Liquidación final' : done === 0 ? 'Anticipo' : 'Certificación');
    lines = [...byRate.entries()].map(([rate, base]) => ({
      description: `${what} del ${share} % · Presupuesto ${quote.number}: ${quote.concept}`,
      quantity: 1,
      unit_price: round((base * share) / 100),
      tax_rate: rate,
    }));
  }
  const invoice = await createDocument(
    quote.tenant_id,
    {
      kind: 'factura',
      client_id: quote.client_id,
      client_name: quote.client_name,
      client_phone: quote.client_phone,
      client_email: quote.client_email,
      client_document: quote.client_document,
      client_address: quote.client_address,
      concept: share === 100 ? quote.concept : lines[0].description,
      lines,
      job_id: quote.job_id,
      quote_id: quote.id,
      invoiced_pct: share,
    },
    { userId, client, billing, currency: quote.currency }
  );
  await refreshQuote(quote.id, client);
  return invoice;
}

module.exports = { SERIES, computeLines, createDocument, registerPayment, annul, invoiceFromQuote, invoicedPct, round };
