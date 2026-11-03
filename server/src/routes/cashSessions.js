// Caja diaria por oficina: se abre con el efectivo inicial y se cierra contando el dinero.
// El sistema calcula cuánto debería haber; la diferencia queda registrada y, si no es cero,
// hay que explicarla. Así un descuadre nunca pasa desapercibido.
const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { route, validate, number, text, uuid, HttpError } = require('../lib/http');
const { ROLE_RANK } = require('../middleware/auth');
const { audit } = require('../services/audit');

const router = express.Router();
const isManager = (req) => ROLE_RANK[req.user.role] >= ROLE_RANK.gestor;
const round = (n) => Math.round(Number(n) * 100) / 100;

/** Un operador solo trabaja con la caja de su oficina; gestores y administradores, con todas. */
async function officeFor(req, officeId) {
  const id = officeId || req.user.office_id;
  if (!id) throw new HttpError(422, 'Tu usuario no tiene oficina asignada. Pide a un administrador que te la asigne en Equipo.');
  if (!isManager(req) && id !== req.user.office_id) throw new HttpError(403, 'Solo puedes gestionar la caja de tu oficina');
  const office = await db.one('SELECT * FROM offices WHERE id = $1 AND tenant_id = $2', [id, req.tenantId]);
  if (!office) throw new HttpError(404, 'Oficina no encontrada');
  return office;
}

/** Cuánto efectivo debería haber en la caja desde que se abrió hasta `until`. */
async function expectedCash(session, until = new Date()) {
  const p = [session.office_id, session.opened_at, until];
  const [payments, movements, payouts] = await Promise.all([
    db.one(
      `SELECT COALESCE(sum(amount), 0) AS total, count(*)::int AS n FROM invoice_payments
        WHERE office_id = $1 AND method = 'efectivo' AND created_at >= $2 AND created_at < $3`,
      p
    ),
    db.one(
      `SELECT COALESCE(sum(amount) FILTER (WHERE type = 'ingreso'), 0) AS incomes,
              COALESCE(sum(amount) FILTER (WHERE type = 'gasto'), 0) AS expenses, count(*)::int AS n
         FROM cash_movements WHERE office_id = $1 AND COALESCE(method, 'efectivo') = 'efectivo' AND created_at >= $2 AND created_at < $3`,
      p
    ),
    // Envíos de dinero cobrados por el destinatario en esta oficina: salen de su caja.
    db.one(
      `SELECT COALESCE(sum(s.amount), 0) AS total, count(*)::int AS n
         FROM shipment_events e JOIN shipments s ON s.id = e.shipment_id JOIN users u ON u.id = e.created_by
        WHERE e.status = 'entregado' AND s.kind = 'dinero' AND u.office_id = $1 AND e.created_at >= $2 AND e.created_at < $3`,
      p
    ),
  ]);
  const summary = {
    opening: Number(session.opening_amount),
    cash_payments: Number(payments.total),
    cash_payments_count: payments.n,
    cash_incomes: Number(movements.incomes),
    cash_expenses: Number(movements.expenses),
    cash_movements_count: movements.n,
    money_payouts: Number(payouts.total),
    money_payouts_count: payouts.n,
  };
  summary.expected = round(summary.opening + summary.cash_payments + summary.cash_incomes - summary.cash_expenses - summary.money_payouts);
  return summary;
}

const SESSION_SELECT = `SELECT c.*, o.name AS office_name, uo.name AS opened_by_name, uc.name AS closed_by_name
  FROM cash_sessions c JOIN offices o ON o.id = c.office_id
  LEFT JOIN users uo ON uo.id = c.opened_by LEFT JOIN users uc ON uc.id = c.closed_by`;

// Estado de la caja de una oficina: la sesión abierta (con lo esperado al momento) y el historial.
router.get(
  '/',
  route(async (req, res) => {
    const office = await officeFor(req, /^[0-9a-f-]{36}$/i.test(req.query.office_id || '') ? req.query.office_id : null);
    const current = await db.one(`${SESSION_SELECT} WHERE c.office_id = $1 AND c.status = 'abierta'`, [office.id]);
    const history = await db.many(`${SESSION_SELECT} WHERE c.office_id = $1 AND c.status = 'cerrada' ORDER BY c.closed_at DESC LIMIT 30`, [office.id]);
    res.json({ office, current: current ? { ...current, live: await expectedCash(current) } : null, history });
  })
);

// Resumen de todas las oficinas (gestores): abierta o no y último cierre con su diferencia.
router.get(
  '/overview',
  route(async (req, res) => {
    if (!isManager(req)) throw new HttpError(403, 'No tienes permiso para esta acción');
    const rows = await db.many(
      `SELECT o.id, o.name, o.city,
              (SELECT row_to_json(x) FROM (SELECT id, opened_at, opening_amount FROM cash_sessions WHERE office_id = o.id AND status = 'abierta') x) AS open_session,
              (SELECT row_to_json(y) FROM (SELECT closed_at, difference, counted_amount, expected_amount FROM cash_sessions WHERE office_id = o.id AND status = 'cerrada' ORDER BY closed_at DESC LIMIT 1) y) AS last_close
         FROM offices o WHERE o.tenant_id = $1 AND o.active ORDER BY o.name`,
      [req.tenantId]
    );
    res.json({ items: rows });
  })
);

router.post(
  '/open',
  route(async (req, res) => {
    const input = validate(req.body, { office_id: uuid({ optional: true }), opening_amount: number({ min: 0, max: 1e10 }), notes: text({ max: 300, optional: true }) });
    const office = await officeFor(req, input.office_id);
    if (!office.active) throw new HttpError(409, 'Esta oficina está desactivada');
    const open = await db.one("SELECT 1 FROM cash_sessions WHERE office_id = $1 AND status = 'abierta'", [office.id]);
    if (open) throw new HttpError(409, `La caja de ${office.name} ya está abierta`);
    const session = await db.one(
      'INSERT INTO cash_sessions (id, tenant_id, office_id, opening_amount, opened_by, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [crypto.randomUUID(), req.tenantId, office.id, round(input.opening_amount), req.user.id, input.notes]
    );
    await audit(req, 'caja.abrir', { entity: 'cash_session', entityId: session.id, details: { oficina: office.name, inicial: session.opening_amount } });
    res.status(201).json({ session });
  })
);

router.post(
  '/:id/close',
  route(async (req, res) => {
    const input = validate(req.body, { counted_amount: number({ min: 0, max: 1e10 }), notes: text({ max: 500, optional: true }) });
    const session = await db.one('SELECT * FROM cash_sessions WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
    if (!session) throw new HttpError(404, 'Caja no encontrada');
    await officeFor(req, session.office_id);
    if (session.status !== 'abierta') throw new HttpError(409, 'Esta caja ya está cerrada');
    const closedAt = new Date();
    const summary = await expectedCash(session, closedAt);
    const counted = round(input.counted_amount);
    const difference = round(counted - summary.expected);
    if (difference !== 0 && !input.notes) {
      throw new HttpError(422, `Hay una diferencia de ${difference > 0 ? '+' : ''}${difference} FCFA. Explica el motivo en las notas antes de cerrar.`, { notes: 'explica la diferencia' });
    }
    const closed = await db.one(
      `UPDATE cash_sessions SET status = 'cerrada', expected_amount = $2, counted_amount = $3, difference = $4, summary = $5,
              notes = COALESCE($6, notes), closed_by = $7, closed_at = $8
        WHERE id = $1 AND status = 'abierta' RETURNING *`,
      [session.id, summary.expected, counted, difference, JSON.stringify(summary), input.notes, req.user.id, closedAt]
    );
    if (!closed) throw new HttpError(409, 'Esta caja ya está cerrada');
    await audit(req, 'caja.cerrar', { entity: 'cash_session', entityId: session.id, details: { esperado: summary.expected, contado: counted, diferencia: difference } });
    res.json({ session: closed });
  })
);

module.exports = { router, expectedCash };
