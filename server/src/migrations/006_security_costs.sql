-- Seguridad (doble verificación), copias de seguridad automáticas, costes de obra e inventario.

-- Doble verificación (2FA) con una app de códigos (Google Authenticator, Microsoft Authenticator…).
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_pending TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT false;
-- Códigos de recuperación (resumen SHA-256): cada uno sirve una sola vez si se pierde el móvil.
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_recovery JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Registro de copias de seguridad: cuándo, adónde, si salió bien y, si no, por qué.
CREATE TABLE IF NOT EXISTS backups (
  id           UUID PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id),
  trigger      TEXT NOT NULL CHECK (trigger IN ('auto', 'manual')),
  status       TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ok', 'error')),
  destination  TEXT,
  file_name    TEXT,
  file_id      TEXT,
  size_bytes   INTEGER,
  error        TEXT,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS backups_tenant ON backups (tenant_id, started_at DESC);

-- Inventario de materiales (cemento, pintura, cable…), con aviso cuando quedan pocos.
CREATE TABLE IF NOT EXISTS materials (
  id          UUID PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  name        TEXT NOT NULL,
  category    TEXT,
  unit        TEXT NOT NULL DEFAULT 'ud',
  stock       NUMERIC(14, 3) NOT NULL DEFAULT 0,
  min_stock   NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  unit_cost   NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  office_id   UUID REFERENCES offices(id) ON DELETE SET NULL,
  notes       TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS materials_name ON materials (tenant_id, lower(name));

-- Entradas (compras), salidas (a una obra) y ajustes (recuento). La cantidad siempre es positiva;
-- en un ajuste, "quantity" es el stock contado y "delta" lo que cambió.
CREATE TABLE IF NOT EXISTS stock_movements (
  id           UUID PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id),
  material_id  UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('entrada', 'salida', 'ajuste')),
  quantity     NUMERIC(14, 3) NOT NULL CHECK (quantity >= 0),
  delta        NUMERIC(14, 3) NOT NULL,
  unit_cost    NUMERIC(14, 2),
  job_id       UUID REFERENCES jobs(id) ON DELETE SET NULL,
  provider_id  UUID REFERENCES providers(id) ON DELETE SET NULL,
  notes        TEXT,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_movements_material ON stock_movements (material_id, created_at DESC);

-- Costes reales de cada obra: materiales, mano de obra, proveedores, transporte…
-- Presupuesto/precio frente a costes = rentabilidad de la obra.
CREATE TABLE IF NOT EXISTS job_costs (
  id           UUID PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id),
  job_id       UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('materiales', 'mano_obra', 'proveedor', 'transporte', 'otros')),
  concept      TEXT NOT NULL,
  quantity     NUMERIC(14, 3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_cost    NUMERIC(14, 2) NOT NULL CHECK (unit_cost >= 0),
  amount       NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  provider_id  UUID REFERENCES providers(id) ON DELETE SET NULL,
  material_id  UUID REFERENCES materials(id) ON DELETE SET NULL,
  movement_id  UUID REFERENCES stock_movements(id) ON DELETE SET NULL,
  cost_date    DATE NOT NULL,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_costs_job ON job_costs (job_id, cost_date);
