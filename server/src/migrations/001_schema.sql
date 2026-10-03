-- Esquema de Epikaizo. Fechas con zona horaria, importes NUMERIC, todo separado por empresa (tenant_id).

CREATE TABLE IF NOT EXISTS tenants (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id                    UUID PRIMARY KEY,
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  name                  TEXT NOT NULL,
  email                 TEXT NOT NULL,
  password_hash         TEXT NOT NULL,
  role                  TEXT NOT NULL CHECK (role IN ('admin', 'gestor', 'operador')),
  status                TEXT NOT NULL DEFAULT 'activo' CHECK (status IN ('activo', 'bloqueado')),
  failed_logins         INTEGER NOT NULL DEFAULT 0,
  locked_until          TIMESTAMPTZ,
  must_change_password  BOOLEAN NOT NULL DEFAULT false,
  token_version         INTEGER NOT NULL DEFAULT 0,
  last_login_at         TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (lower(email));

CREATE TABLE IF NOT EXISTS clients (
  id          UUID PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL,
  email       TEXT,
  city        TEXT,
  address     TEXT,
  document    TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, phone)
);

CREATE TABLE IF NOT EXISTS employees (
  id          UUID PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  name        TEXT NOT NULL,
  position    TEXT NOT NULL,
  phone       TEXT,
  email       TEXT,
  city        TEXT,
  status      TEXT NOT NULL DEFAULT 'activo' CHECK (status IN ('activo', 'inactivo')),
  start_date  DATE,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Envíos de paquetes y de dinero. tracking_code es la guía pública EPZ-000000.
CREATE TABLE IF NOT EXISTS shipments (
  id              UUID PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  tracking_code   TEXT NOT NULL UNIQUE,
  kind            TEXT NOT NULL CHECK (kind IN ('paquete', 'dinero')),
  status          TEXT NOT NULL DEFAULT 'registrado' CHECK (status IN ('registrado', 'en_transito', 'en_reparto', 'entregado', 'cancelado')),
  scope           TEXT NOT NULL DEFAULT 'nacional' CHECK (scope IN ('local', 'nacional', 'internacional')),
  client_id       UUID REFERENCES clients(id),
  sender_name     TEXT NOT NULL,
  sender_phone    TEXT NOT NULL,
  sender_document TEXT,
  receiver_name   TEXT NOT NULL,
  receiver_phone  TEXT NOT NULL,
  origin          TEXT NOT NULL,
  destination     TEXT NOT NULL,
  description     TEXT,
  weight_kg       NUMERIC(10, 2),
  amount          NUMERIC(14, 2),
  fee             NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total           NUMERIC(14, 2) NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'USD',
  paid            BOOLEAN NOT NULL DEFAULT true,
  payment_method  TEXT,
  notes           TEXT,
  created_by      UUID REFERENCES users(id),
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shipments_tenant_created ON shipments (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS shipments_tenant_status ON shipments (tenant_id, status);

CREATE TABLE IF NOT EXISTS shipment_events (
  id           BIGSERIAL PRIMARY KEY,
  shipment_id  UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  status       TEXT NOT NULL,
  location     TEXT,
  note         TEXT,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shipment_events_shipment ON shipment_events (shipment_id, created_at);

-- Trabajos de construcción, mantenimiento, oficios y gestión administrativa.
CREATE TABLE IF NOT EXISTS jobs (
  id             UUID PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id),
  code           TEXT NOT NULL UNIQUE,
  category       TEXT NOT NULL,
  title          TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'nuevo' CHECK (status IN ('nuevo', 'presupuestado', 'en_curso', 'terminado', 'cancelado')),
  client_id      UUID REFERENCES clients(id),
  client_name    TEXT NOT NULL,
  client_phone   TEXT NOT NULL,
  city           TEXT,
  address        TEXT,
  description    TEXT,
  budget         NUMERIC(14, 2),
  price          NUMERIC(14, 2),
  currency       TEXT NOT NULL DEFAULT 'USD',
  paid           BOOLEAN NOT NULL DEFAULT false,
  scheduled_for  DATE,
  assigned_to    UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_by     UUID REFERENCES users(id),
  finished_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobs_tenant_created ON jobs (tenant_id, created_at DESC);

-- Bandeja única: formulario de la web y WhatsApp.
CREATE TABLE IF NOT EXISTS messages (
  id              UUID PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  channel         TEXT NOT NULL CHECK (channel IN ('web', 'whatsapp')),
  direction       TEXT NOT NULL DEFAULT 'entrante' CHECK (direction IN ('entrante', 'saliente')),
  name            TEXT,
  phone           TEXT,
  email           TEXT,
  topic           TEXT,
  body            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'nuevo' CHECK (status IN ('nuevo', 'en_proceso', 'atendido')),
  external_id     TEXT UNIQUE,
  job_id          UUID REFERENCES jobs(id) ON DELETE SET NULL,
  handled_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_tenant_created ON messages (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS invoices (
  id              UUID PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  number          TEXT NOT NULL UNIQUE,
  client_name     TEXT NOT NULL,
  client_phone    TEXT NOT NULL,
  client_email    TEXT,
  concept         TEXT NOT NULL,
  amount          NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  currency        TEXT NOT NULL DEFAULT 'USD',
  status          TEXT NOT NULL DEFAULT 'emitida' CHECK (status IN ('emitida', 'enviada', 'pagada', 'anulada')),
  shipment_id     UUID REFERENCES shipments(id) ON DELETE SET NULL,
  job_id          UUID REFERENCES jobs(id) ON DELETE SET NULL,
  sent_at         TIMESTAMPTZ,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoices_tenant_created ON invoices (tenant_id, created_at DESC);

-- Caja: ingresos y gastos que no salen de un envío o un trabajo (alquiler, combustible, sueldos...).
CREATE TABLE IF NOT EXISTS cash_movements (
  id          UUID PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  type        TEXT NOT NULL CHECK (type IN ('ingreso', 'gasto')),
  category    TEXT NOT NULL,
  concept     TEXT NOT NULL,
  amount      NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  currency    TEXT NOT NULL DEFAULT 'USD',
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  method      TEXT,
  reference   TEXT,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cash_tenant_date ON cash_movements (tenant_id, date DESC);

CREATE TABLE IF NOT EXISTS providers (
  id          UUID PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  name        TEXT NOT NULL,
  service     TEXT NOT NULL,
  phone       TEXT,
  email       TEXT,
  city        TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  key         TEXT NOT NULL,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, key)
);

-- Contadores para numerar facturas y trabajos sin huecos ni duplicados.
CREATE TABLE IF NOT EXISTS counters (
  tenant_id  TEXT NOT NULL,
  name       TEXT NOT NULL,
  value      BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  user_id     UUID,
  user_name   TEXT,
  action      TEXT NOT NULL,
  entity      TEXT,
  entity_id   TEXT,
  details     JSONB,
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_tenant_created ON audit_log (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS analytics_events (
  id          BIGSERIAL PRIMARY KEY,
  event       TEXT NOT NULL,
  data        JSONB,
  path        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_created ON analytics_events (created_at DESC);
