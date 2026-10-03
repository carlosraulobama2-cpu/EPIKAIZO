// Resumen del panel e informes. Ingresos de la empresa = comisiones de envíos + trabajos terminados +
// otros ingresos de caja. El dinero que el cliente envía NO es ingreso: solo su comisión.
const express = require('express');
const db = require('../db');
const { route, HttpError } = require('../lib/http');
const { requireRole, ROLE_RANK } = require('../middleware/auth');

const router = express.Router();

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function period(query) {
  const today = new Date();
  const from = DAY.test(query.from || '') ? query.from : new Date(today.getFullYear(), today.getMonth() - 5, 1).toISOString().slice(0, 10);
  const to = DAY.test(query.to || '') ? query.to : today.toISOString().slice(0, 10);
  if (from > to) throw new HttpError(422, 'La fecha inicial es posterior a la final');
  return { from, to };
}

// Movimientos de ingreso y gasto unificados, para sumar por mes o por día.
const LEDGER = `
  SELECT tenant_id, created_at::date AS day, fee AS income, 0 AS expense FROM shipments WHERE status <> 'cancelado'
  UNION ALL
  SELECT tenant_id, COALESCE(finished_at, updated_at)::date, COALESCE(price, 0), 0 FROM jobs WHERE status = 'terminado'
  UNION ALL
  SELECT tenant_id, date, CASE WHEN type = 'ingreso' THEN amount ELSE 0 END, CASE WHEN type = 'gasto' THEN amount ELSE 0 END FROM cash_movements
  UNION ALL
  -- Facturas que no vienen de un envío ni de un trabajo (venta de vehículos, gestiones...): cuenta la
  -- base imponible (el IVA no es ingreso). Una rectificativa resta lo que anula.
  SELECT tenant_id, issue_date, CASE WHEN kind = 'factura' THEN subtotal ELSE -subtotal END, 0 FROM invoices
   WHERE kind IN ('factura', 'rectificativa') AND shipment_id IS NULL AND job_id IS NULL`;

router.get(
  '/dashboard',
  route(async (req, res) => {
    const t = req.tenantId;
    const [month, prev, today, pipeline, counts, chart, latest, destinations] = await Promise.all([
      db.one(`SELECT COALESCE(sum(income), 0) AS income, COALESCE(sum(expense), 0) AS expense FROM (${LEDGER}) l WHERE tenant_id = $1 AND day >= date_trunc('month', CURRENT_DATE)`, [t]),
      db.one(
        `SELECT COALESCE(sum(income), 0) AS income FROM (${LEDGER}) l
          WHERE tenant_id = $1 AND day >= date_trunc('month', CURRENT_DATE) - interval '1 month' AND day < CURRENT_DATE - interval '1 month' + interval '1 day'`,
        [t]
      ),
      db.one("SELECT count(*)::int AS shipments, COALESCE(sum(fee), 0) AS income FROM shipments WHERE tenant_id = $1 AND created_at >= CURRENT_DATE AND status <> 'cancelado'", [t]),
      db.many("SELECT status, count(*)::int AS n FROM shipments WHERE tenant_id = $1 AND status NOT IN ('entregado', 'cancelado') GROUP BY status", [t]),
      db.one(
        `SELECT
           (SELECT count(*)::int FROM shipments WHERE tenant_id = $1 AND created_at >= date_trunc('month', CURRENT_DATE)) AS shipments_month,
           (SELECT count(*)::int FROM shipments WHERE tenant_id = $1 AND status = 'registrado' AND created_at < now() - interval '48 hours') AS shipments_stale,
           (SELECT count(*)::int FROM jobs WHERE tenant_id = $1 AND status NOT IN ('terminado', 'cancelado')) AS jobs_open,
           (SELECT count(*)::int FROM messages WHERE tenant_id = $1 AND status = 'nuevo' AND direction = 'entrante') AS messages_new,
           (SELECT COALESCE(sum(amount - paid_amount), 0) FROM invoices WHERE tenant_id = $1 AND kind = 'factura' AND status IN ('emitida', 'enviada', 'parcial')) AS invoices_pending`,
        [t]
      ),
      db.many(
        `SELECT to_char(m, 'YYYY-MM') AS month, COALESCE(sum(l.income), 0) AS income, COALESCE(sum(l.expense), 0) AS expense
           FROM generate_series(date_trunc('month', CURRENT_DATE) - interval '5 months', date_trunc('month', CURRENT_DATE), interval '1 month') m
           LEFT JOIN (${LEDGER}) l ON l.tenant_id = $1 AND date_trunc('month', l.day) = m
          GROUP BY m ORDER BY m`,
        [t]
      ),
      db.many('SELECT id, tracking_code, kind, status, receiver_name, destination, total, currency, created_at FROM shipments WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 6', [t]),
      db.many(
        `SELECT destination, count(*)::int AS n FROM shipments WHERE tenant_id = $1 AND created_at >= CURRENT_DATE - interval '90 days'
          GROUP BY destination ORDER BY n DESC LIMIT 5`,
        [t]
      ),
    ]);
    // Los importes de la empresa (ingresos, gastos, por cobrar) solo los ven gestores y administradores.
    const finance = ROLE_RANK[req.user.role] >= ROLE_RANK.gestor;
    if (!finance) delete counts.invoices_pending;
    res.json({
      finance,
      month: finance ? { ...month, profit: month.income - month.expense, prev_income: prev.income } : null,
      today: finance ? today : { shipments: today.shipments },
      pipeline: Object.fromEntries(pipeline.map((p) => [p.status, p.n])),
      counts,
      chart: finance ? chart : null,
      latest,
      destinations,
    });
  })
);

router.get(
  '/summary',
  requireRole('gestor'),
  route(async (req, res) => {
    const { from, to } = period(req.query);
    const t = req.tenantId;
    const range = [t, from, to];
    const [monthly, byCity, byCategory, topClients, totals] = await Promise.all([
      db.many(
        `SELECT to_char(date_trunc('month', day), 'YYYY-MM') AS month, sum(income) AS income, sum(expense) AS expense, sum(income) - sum(expense) AS profit
           FROM (${LEDGER}) l WHERE tenant_id = $1 AND day BETWEEN $2 AND $3 GROUP BY 1 ORDER BY 1`,
        range
      ),
      db.many(
        `SELECT destination AS city, count(*)::int AS shipments, count(*) FILTER (WHERE kind = 'paquete')::int AS packages,
                count(*) FILTER (WHERE kind = 'dinero')::int AS transfers, COALESCE(sum(fee), 0) AS income
           FROM shipments WHERE tenant_id = $1 AND status <> 'cancelado' AND created_at::date BETWEEN $2 AND $3
          GROUP BY destination ORDER BY income DESC LIMIT 15`,
        range
      ),
      db.many(
        `SELECT category, count(*)::int AS jobs, count(*) FILTER (WHERE status = 'terminado')::int AS finished,
                COALESCE(sum(price) FILTER (WHERE status = 'terminado'), 0) AS income
           FROM jobs WHERE tenant_id = $1 AND created_at::date BETWEEN $2 AND $3 GROUP BY category ORDER BY income DESC`,
        range
      ),
      db.many(
        `SELECT c.id, c.name, c.phone, count(s.id)::int AS shipments, COALESCE(sum(s.fee), 0) AS income
           FROM clients c JOIN shipments s ON s.client_id = c.id AND s.status <> 'cancelado' AND s.created_at::date BETWEEN $2 AND $3
          WHERE c.tenant_id = $1 GROUP BY c.id ORDER BY income DESC LIMIT 10`,
        range
      ),
      db.one(`SELECT COALESCE(sum(income), 0) AS income, COALESCE(sum(expense), 0) AS expense FROM (${LEDGER}) l WHERE tenant_id = $1 AND day BETWEEN $2 AND $3`, range),
    ]);
    res.json({ from, to, monthly, by_city: byCity, by_category: byCategory, top_clients: topClients, totals: { ...totals, profit: totals.income - totals.expense } });
  })
);

// Exportar a CSV (se abre en Excel). Las celdas que empiezan por = + - @ se neutralizan (inyección de fórmulas).
const EXPORTS = {
  envios: {
    sql: `SELECT tracking_code AS guia, kind AS tipo, status AS estado, sender_name AS remitente, sender_phone AS tel_remitente, receiver_name AS destinatario,
                 receiver_phone AS tel_destinatario, origin AS origen, destination AS destino, weight_kg AS peso_kg, amount AS importe, fee AS comision,
                 total, currency AS moneda, paid AS pagado, created_at AS fecha
            FROM shipments WHERE tenant_id = $1 AND created_at::date BETWEEN $2 AND $3 ORDER BY created_at`,
  },
  trabajos: {
    sql: `SELECT code AS codigo, category AS categoria, title AS trabajo, status AS estado, client_name AS cliente, client_phone AS telefono, city AS ciudad,
                 budget AS presupuesto, price AS precio, currency AS moneda, paid AS pagado, created_at AS fecha
            FROM jobs WHERE tenant_id = $1 AND created_at::date BETWEEN $2 AND $3 ORDER BY created_at`,
  },
  caja: {
    sql: `SELECT date AS fecha, type AS tipo, category AS categoria, concept AS concepto, amount AS importe, currency AS moneda, method AS metodo, reference AS referencia
            FROM cash_movements WHERE tenant_id = $1 AND date BETWEEN $2 AND $3 ORDER BY date`,
  },
  facturas: {
    sql: `SELECT number AS numero, kind AS tipo, issue_date AS fecha, client_name AS cliente, client_document AS documento, client_phone AS telefono,
                 concept AS concepto, subtotal AS base_imponible, tax_amount AS impuesto, amount AS total, paid_amount AS cobrado,
                 currency AS moneda, status AS estado, due_date AS vencimiento
            FROM invoices WHERE tenant_id = $1 AND issue_date BETWEEN $2 AND $3 ORDER BY issue_date, number`,
  },
};

function csvCell(value) {
  if (value === null || value === undefined) return '';
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

router.get(
  '/export/:type.csv',
  requireRole('gestor'),
  route(async (req, res) => {
    const spec = EXPORTS[req.params.type];
    if (!spec) throw new HttpError(404, 'Informe no encontrado');
    const { from, to } = period(req.query);
    const result = await db.query(spec.sql, [req.tenantId, from, to]);
    const header = result.fields.map((f) => f.name);
    const lines = [header.join(';'), ...result.rows.map((row) => header.map((h) => csvCell(row[h])).join(';'))];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="epikaizo-${req.params.type}-${from}-${to}.csv"`);
    // BOM para que Excel lea bien las tildes.
    res.send('﻿' + lines.join('\r\n'));
  })
);

module.exports = router;
