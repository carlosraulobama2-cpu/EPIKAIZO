// Viajes: un barco, avión o camión que lleva varios paquetes. Se preparan cargando envíos,
// salen (todos sus envíos pasan a "en tránsito") y llegan (pasan a "listo para entregar").
// La hoja de carga (manifiesto) se imprime desde el panel.
const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { route, validate, paging, text, oneOf, date, uuid, HttpError } = require('../lib/http');
const { filters } = require('../lib/list');
const { audit } = require('../services/audit');
const { tripCode } = require('../services/codes');
const { changeStatus } = require('../services/shipments');
const { notifyShipmentStatus } = require('../services/notify');
const { resolveOffice } = require('../services/offices');

const router = express.Router();
const MODES = ['barco', 'avion', 'camion'];
const MODE_NAME = { barco: 'barco', avion: 'avión', camion: 'camión' };
const STATUSES = ['preparando', 'en_ruta', 'llegado'];
const fields = {
  mode: oneOf(MODES),
  origin: text({ min: 2, max: 80 }),
  destination: text({ min: 2, max: 80 }),
  departure_date: date({ optional: true }),
  carrier: text({ max: 120, optional: true }),
  vehicle_ref: text({ max: 80, optional: true }),
  notes: text({ max: 500, optional: true }),
};

const TRIP_SELECT = `SELECT t.*, o.name AS office_name,
       (SELECT count(*)::int FROM shipments s WHERE s.trip_id = t.id) AS shipments_count,
       (SELECT COALESCE(sum(weight_kg), 0) FROM shipments s WHERE s.trip_id = t.id) AS total_kg
  FROM trips t LEFT JOIN offices o ON o.id = t.office_id`;

async function loadTrip(req, client) {
  const trip = await db.one(`${TRIP_SELECT} WHERE t.id = $1 AND t.tenant_id = $2`, [req.params.id, req.tenantId], client);
  if (!trip) throw new HttpError(404, 'Viaje no encontrado');
  return trip;
}

router.get(
  '/',
  route(async (req, res) => {
    const { limit, offset } = paging(req.query);
    const f = filters(req.tenantId, 't').eq('status', req.query.status, STATUSES).search(['code', 'origin', 'destination', 'carrier', 'vehicle_ref'], req.query.q);
    if (req.query.status === 'activos') f.raw("t.status <> 'llegado'");
    const [items, count] = await Promise.all([
      db.many(`${TRIP_SELECT} WHERE ${f.sql} ORDER BY t.created_at DESC LIMIT ${limit} OFFSET ${offset}`, f.params),
      db.one(`SELECT count(*)::int AS n FROM trips t WHERE ${f.sql}`, f.params),
    ]);
    res.json({ items, total: count.n });
  })
);

router.get(
  '/:id',
  route(async (req, res) => {
    const trip = await loadTrip(req);
    const shipments = await db.many(
      `SELECT id, tracking_code, status, sender_name, sender_phone, receiver_name, receiver_phone, origin, destination, weight_kg, description, paid, total
         FROM shipments WHERE trip_id = $1 ORDER BY tracking_code`,
      [trip.id]
    );
    res.json({ trip, shipments });
  })
);

router.post(
  '/',
  route(async (req, res) => {
    const input = validate(req.body, { ...fields, office_id: uuid({ optional: true }) });
    const officeId = await resolveOffice(req, input.office_id);
    const trip = await db.tx(async (client) => {
      const row = await db.one(
        `INSERT INTO trips (id, tenant_id, code, mode, origin, destination, departure_date, carrier, vehicle_ref, notes, office_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [crypto.randomUUID(), req.tenantId, await tripCode(req.tenantId, client), input.mode, input.origin, input.destination, input.departure_date,
          input.carrier, input.vehicle_ref, input.notes, officeId, req.user.id],
        client
      );
      await audit(req, 'viaje.crear', { entity: 'trip', entityId: row.id, details: { codigo: row.code } }, client);
      return row;
    });
    res.status(201).json({ item: trip });
  })
);

router.patch(
  '/:id',
  route(async (req, res) => {
    const trip = await loadTrip(req);
    if (trip.status === 'llegado') throw new HttpError(409, 'Un viaje que ya llegó no se puede cambiar');
    const input = validate(req.body, fields, { partial: true });
    const keys = Object.keys(input);
    if (!keys.length) throw new HttpError(422, 'No hay cambios que guardar');
    const updated = await db.one(
      `UPDATE trips SET ${keys.map((k, i) => `${k} = $${i + 3}`).join(', ')}, updated_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [trip.id, req.tenantId, ...keys.map((k) => input[k])]
    );
    await audit(req, 'viaje.editar', { entity: 'trip', entityId: trip.id, details: { campos: keys } });
    res.json({ item: updated });
  })
);

// Cargar envíos: solo paquetes registrados que no estén en otro viaje.
router.post(
  '/:id/shipments',
  route(async (req, res) => {
    const trip = await loadTrip(req);
    if (trip.status !== 'preparando') throw new HttpError(409, 'Solo se cargan envíos en un viaje que aún no ha salido');
    const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 500) : [];
    if (!ids.length) throw new HttpError(422, 'Elige al menos un envío');
    const added = await db.many(
      `UPDATE shipments SET trip_id = $1, updated_at = now()
        WHERE tenant_id = $2 AND id = ANY($3::uuid[]) AND trip_id IS NULL AND kind = 'paquete' AND status = 'registrado'
        RETURNING id`,
      [trip.id, req.tenantId, ids]
    );
    await audit(req, 'viaje.cargar', { entity: 'trip', entityId: trip.id, details: { envios: added.length } });
    res.json({ added: added.length, skipped: ids.length - added.length });
  })
);

router.delete(
  '/:id/shipments/:shipmentId',
  route(async (req, res) => {
    const trip = await loadTrip(req);
    if (trip.status !== 'preparando') throw new HttpError(409, 'El viaje ya salió: no se pueden quitar envíos');
    const row = await db.one('UPDATE shipments SET trip_id = NULL, updated_at = now() WHERE id = $1 AND trip_id = $2 RETURNING id', [req.params.shipmentId, trip.id]);
    if (!row) throw new HttpError(404, 'Ese envío no está en este viaje');
    await audit(req, 'viaje.descargar', { entity: 'trip', entityId: trip.id, details: { envio: row.id } });
    res.json({ removed: true });
  })
);

/** Cambia de estado todos los envíos del viaje y avisa a los clientes (sin esperar a WhatsApp). */
async function moveShipments(req, trip, from, to, { location, note }) {
  const rows = await db.many(`SELECT * FROM shipments WHERE trip_id = $1 AND status = ANY($2::text[])`, [trip.id, from]);
  const moved = [];
  await db.tx(async (client) => {
    for (const s of rows) moved.push(await changeStatus(req, s, to, { location, note }, client));
  });
  // Los avisos van después de guardar y en segundo plano: un viaje puede llevar cientos de envíos.
  (async () => {
    let failed = 0;
    for (const s of moved) {
      const r = await notifyShipmentStatus(req.tenantId, s, to).catch(() => ({ failed: 1 }));
      failed += r.failed || 0;
    }
    if (failed) await audit(req, 'whatsapp.error', { entity: 'trip', entityId: trip.id, details: { avisos_fallidos: failed } }).catch(() => {});
  })();
  return moved.length;
}

router.post(
  '/:id/depart',
  route(async (req, res) => {
    const trip = await loadTrip(req);
    if (trip.status !== 'preparando') throw new HttpError(409, 'Este viaje ya salió');
    if (!trip.shipments_count) throw new HttpError(409, 'Carga algún envío antes de marcar la salida');
    const moved = await moveShipments(req, trip, ['registrado'], 'en_transito', { location: trip.origin, note: `Salida en ${MODE_NAME[trip.mode]} (${trip.code})` });
    const updated = await db.one("UPDATE trips SET status = 'en_ruta', departed_at = now(), updated_at = now() WHERE id = $1 RETURNING *", [trip.id]);
    await audit(req, 'viaje.salida', { entity: 'trip', entityId: trip.id, details: { envios: moved } });
    res.json({ item: updated, moved });
  })
);

router.post(
  '/:id/arrive',
  route(async (req, res) => {
    const trip = await loadTrip(req);
    if (trip.status !== 'en_ruta') throw new HttpError(409, 'Solo puede llegar un viaje que está en ruta');
    const moved = await moveShipments(req, trip, ['en_transito'], 'en_reparto', { location: trip.destination, note: `Llegada a ${trip.destination} (${trip.code})` });
    const updated = await db.one("UPDATE trips SET status = 'llegado', arrived_at = now(), updated_at = now() WHERE id = $1 RETURNING *", [trip.id]);
    await audit(req, 'viaje.llegada', { entity: 'trip', entityId: trip.id, details: { envios: moved } });
    res.json({ item: updated, moved });
  })
);

module.exports = router;
