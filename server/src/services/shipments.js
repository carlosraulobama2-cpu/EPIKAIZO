// Cambios de estado de un envío: un solo sitio para la ficha del envío y para los viajes
// (al salir o llegar un barco, avión o camión cambian todos sus envíos a la vez).
const db = require('../db');
const { HttpError } = require('../lib/http');
const { audit } = require('./audit');
const billing = require('./billing');
const { getSettings } = require('./settings');

// Cambios permitidos: un envío entregado o cancelado ya no cambia.
const NEXT = {
  registrado: ['en_transito', 'en_reparto', 'entregado', 'cancelado'],
  en_transito: ['en_reparto', 'entregado', 'cancelado'],
  en_reparto: ['en_transito', 'entregado', 'cancelado'],
  entregado: [],
  cancelado: [],
};

/**
 * Cambia el estado dentro de una transacción (client). Deja el evento de seguimiento, anula la
 * factura si se cancela y lo anota en Actividad. Devuelve el envío actualizado.
 */
async function changeStatus(req, shipment, status, { location = null, note = null } = {}, client) {
  if (!NEXT[shipment.status].includes(status)) {
    throw new HttpError(409, `Un envío "${shipment.status.replace('_', ' ')}" no puede pasar a "${status.replace('_', ' ')}"`);
  }
  const row = await db.one(
    `UPDATE shipments SET status = $3, updated_at = now(), delivered_at = CASE WHEN $3 = 'entregado' THEN now() ELSE delivered_at END
      WHERE id = $1 AND tenant_id = $2 RETURNING *`,
    [shipment.id, req.tenantId, status],
    client
  );
  await db.query('INSERT INTO shipment_events (shipment_id, status, location, note, created_by) VALUES ($1,$2,$3,$4,$5)', [shipment.id, status, location, note, req.user.id], client);
  if (status === 'cancelado') {
    // La factura no se borra: se anula con su rectificativa.
    const invoice = await db.one("SELECT * FROM invoices WHERE shipment_id = $1 AND kind = 'factura' AND status <> 'anulada' ORDER BY created_at LIMIT 1", [shipment.id], client);
    if (invoice) {
      const { billing: billingSettings } = await getSettings(req.tenantId);
      const reason = Number(invoice.paid_amount) > 0 ? 'Envío cancelado (importe cobrado devuelto al cliente)' : 'Envío cancelado';
      await billing.annul({ ...invoice, paid_amount: 0 }, reason, { userId: req.user.id, client, billing: billingSettings });
    }
  }
  await audit(req, 'envio.estado', { entity: 'shipment', entityId: shipment.id, details: { de: shipment.status, a: status } }, client);
  return row;
}

module.exports = { NEXT, changeStatus };
