-- Operaciones: oficinas, caja diaria con cierre, viajes (manifiestos de carga) y recordatorios de cobro.

-- Oficinas o sucursales. Cada usuario, envío, cobro y movimiento de caja pertenece a una.
CREATE TABLE IF NOT EXISTS offices (
  id          UUID PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  name        TEXT NOT NULL,
  city        TEXT NOT NULL,
  address     TEXT,
  phone       TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

-- Las dos oficinas de partida, para cada empresa que ya exista.
INSERT INTO offices (id, tenant_id, name, city)
SELECT gen_random_uuid(), t.id, o.name, o.city
  FROM tenants t CROSS JOIN (VALUES ('Malabo', 'Malabo'), ('Bata', 'Bata')) AS o(name, city)
ON CONFLICT (tenant_id, name) DO NOTHING;

ALTER TABLE users ADD COLUMN IF NOT EXISTS office_id UUID REFERENCES offices(id) ON DELETE SET NULL;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS office_id UUID REFERENCES offices(id) ON DELETE SET NULL;
ALTER TABLE cash_movements ADD COLUMN IF NOT EXISTS office_id UUID REFERENCES offices(id) ON DELETE SET NULL;
ALTER TABLE invoice_payments ADD COLUMN IF NOT EXISTS office_id UUID REFERENCES offices(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS shipments_office ON shipments (office_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cash_office ON cash_movements (office_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payments_office ON invoice_payments (office_id, created_at DESC);

-- Lo que ya existía se asigna a la oficina de la ciudad principal (Malabo).
UPDATE users u SET office_id = o.id FROM offices o WHERE u.office_id IS NULL AND o.tenant_id = u.tenant_id AND o.name = 'Malabo';
UPDATE shipments s SET office_id = o.id FROM offices o
 WHERE s.office_id IS NULL AND o.tenant_id = s.tenant_id AND o.name = CASE WHEN s.origin = 'Bata' THEN 'Bata' ELSE 'Malabo' END;
UPDATE cash_movements c SET office_id = o.id FROM offices o WHERE c.office_id IS NULL AND o.tenant_id = c.tenant_id AND o.name = 'Malabo';

-- Caja diaria: se abre con el efectivo inicial y se cierra contando lo que hay.
-- La diferencia (contado - esperado) queda guardada: es lo que evita descuadres sin explicar.
CREATE TABLE IF NOT EXISTS cash_sessions (
  id               UUID PRIMARY KEY,
  tenant_id        TEXT NOT NULL REFERENCES tenants(id),
  office_id        UUID NOT NULL REFERENCES offices(id),
  status           TEXT NOT NULL DEFAULT 'abierta' CHECK (status IN ('abierta', 'cerrada')),
  opening_amount   NUMERIC(14, 2) NOT NULL CHECK (opening_amount >= 0),
  opened_by        UUID REFERENCES users(id),
  opened_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expected_amount  NUMERIC(14, 2),
  counted_amount   NUMERIC(14, 2),
  difference       NUMERIC(14, 2),
  summary          JSONB,
  notes            TEXT,
  closed_by        UUID REFERENCES users(id),
  closed_at        TIMESTAMPTZ
);
-- Solo una caja abierta por oficina.
CREATE UNIQUE INDEX IF NOT EXISTS cash_sessions_one_open ON cash_sessions (office_id) WHERE status = 'abierta';
CREATE INDEX IF NOT EXISTS cash_sessions_office ON cash_sessions (office_id, opened_at DESC);

-- Viajes: un barco, avión o camión que lleva varios envíos. El manifiesto es su hoja de carga.
CREATE TABLE IF NOT EXISTS trips (
  id              UUID PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  code            TEXT NOT NULL UNIQUE,
  mode            TEXT NOT NULL CHECK (mode IN ('barco', 'avion', 'camion')),
  origin          TEXT NOT NULL,
  destination     TEXT NOT NULL,
  departure_date  DATE,
  carrier         TEXT,
  vehicle_ref     TEXT,
  status          TEXT NOT NULL DEFAULT 'preparando' CHECK (status IN ('preparando', 'en_ruta', 'llegado')),
  notes           TEXT,
  office_id       UUID REFERENCES offices(id) ON DELETE SET NULL,
  departed_at     TIMESTAMPTZ,
  arrived_at      TIMESTAMPTZ,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trips_tenant ON trips (tenant_id, created_at DESC);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS trip_id UUID REFERENCES trips(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS shipments_trip ON shipments (trip_id);

-- Recordatorios de cobro enviados por factura.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reminder_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ;
