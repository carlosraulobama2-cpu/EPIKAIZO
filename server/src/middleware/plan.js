const { getDb, prepare } = require('../config/database');

exports.requireTenant = (req, res, next) => {
  const tenantId = req.headers['x-tenant-id'] || req.user?.tenant_id;
  if (!tenantId) return res.status(400).json({ error: 'Tenant ID requerido' });
  req.tenantId = tenantId;
  next();
};

exports.requirePlan = (feature) => {
  return (req, res, next) => {
    const tenantId = req.tenantId || req.user?.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant ID requerido' });
    const tenant = prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });
    const subscription = prepare('SELECT * FROM subscriptions WHERE tenant_id = ? AND status = ?').get(tenantId, 'active');
    const plan = subscription ? prepare('SELECT * FROM plans WHERE id = ?').get(subscription.plan_id) : prepare('SELECT * FROM plans WHERE id = ?').get('plan-free');
    if (!plan || !plan.is_active) return res.status(403).json({ error: 'Plan no activo' });
    req.plan = plan;
    next();
  };
};
