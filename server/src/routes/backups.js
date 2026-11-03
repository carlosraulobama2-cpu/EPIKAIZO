// Copias de seguridad (solo administradores): historial, estado y "hacer una copia ahora".
const express = require('express');
const db = require('../db');
const { route } = require('../lib/http');
const { audit } = require('../services/audit');
const { runBackup, backupStatus } = require('../services/backup');

const router = express.Router();

router.get('/', route(async (req, res) => {
  const [status, items] = await Promise.all([
    backupStatus(req.tenantId),
    db.many('SELECT b.*, u.name AS created_by_name FROM backups b LEFT JOIN users u ON u.id = b.created_by WHERE b.tenant_id = $1 ORDER BY b.started_at DESC LIMIT 30', [req.tenantId]),
  ]);
  res.json({ ...status, items });
}));

router.post('/run', route(async (req, res) => {
  const backup = await runBackup(req.tenantId, { trigger: 'manual', userId: req.user.id });
  await audit(req, 'copia.drive', { entity: 'backup', entityId: backup.id, details: { estado: backup.status } });
  res.status(backup.status === 'ok' ? 201 : 502).json({ item: backup, error: backup.status === 'ok' ? undefined : backup.error });
}));

module.exports = router;
