-- Facturación completa: presupuestos, facturas con líneas e IVA, rectificativas, cobros parciales
-- y venta de vehículos. Las facturas existentes se convierten a una línea sin cambiar su importe.

CREATE TABLE IF NOT EXISTS vehicles (
  id              UUID PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  code            TEXT NOT NULL UNIQUE,
  brand           TEXT NOT NULL,
  model           TEXT NOT NULL,
  year            INTEGER CHECK (year BETWEEN 1950 AND 2100),
  vin             TEXT,
  plate           TEXT,
  mileage_km      INTEGER CHECK (mileage_km >= 0),
  color           TEXT,
  fuel            TEXT,
  transmission    TEXT,
  condition       TEXT NOT NULL DEFAULT 'usado' CHECK (condition IN ('nuevo', 'usado')),
  purchase_price  NUMERIC(14, 2),
  sale_price      NUMERIC(14, 2) NOT NULL CHECK (sale_price > 0),
  currency        TEXT NOT NULL DEFAULT 'USD',
  status          TEXT NOT NULL DEFAULT 'disponible' CHECK (status IN ('disponible', 'reservado', 'vendido')),
  reserved_for    TEXT,
  reserved_phone  TEXT,
  reserved_until  DATE,
  notes           TEXT,
  client_id       UUID REFERENCES clients(id),
  invoice_id      UUID,
  sold_at         TIMESTAMPTZ,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_vin_unique ON vehicles (tenant_id, upper(vin)) WHERE vin IS NOT NULL AND vin <> '';
CREATE INDEX IF NOT EXISTS vehicles_tenant_status ON vehicles (tenant_id, status);

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'factura',
  ADD COLUMN IF NOT EXISTS lines JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id),
  ADD COLUMN IF NOT EXISTS client_document TEXT,
  ADD COLUMN IF NOT EXISTS client_address TEXT,
  ADD COLUMN IF NOT EXISTS issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS valid_until DATE,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES invoices(id),
  ADD COLUMN IF NOT EXISTS rectifies_id UUID REFERENCES invoices(id),
  ADD COLUMN IF NOT EXISTS invoiced_pct NUMERIC(6, 2),
  ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reason TEXT;

UPDATE invoices
   SET subtotal = amount,
       lines = jsonb_build_array(jsonb_build_object('description', concept, 'quantity', 1, 'unit_price', amount, 'tax_rate', 0)),
       issue_date = created_at::date,
       paid_amount = CASE WHEN status = 'pagada' THEN amount ELSE 0 END
 WHERE subtotal IS NULL;
ALTER TABLE invoices ALTER COLUMN subtotal SET NOT NULL;

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('emitida', 'enviada', 'parcial', 'pagada', 'anulada', 'pendiente', 'aceptado', 'rechazado', 'facturado'));
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_kind_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_kind_check CHECK (kind IN ('factura', 'presupuesto', 'rectificativa'));
CREATE INDEX IF NOT EXISTS invoices_quote ON invoices (quote_id);

ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_invoice_fk;
ALTER TABLE vehicles ADD CONSTRAINT vehicles_invoice_fk FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS invoice_payments (
  id          UUID PRIMARY KEY,
  invoice_id  UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount      NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  method      TEXT NOT NULL CHECK (method IN ('efectivo', 'transferencia', 'movil', 'tarjeta')),
  paid_on     DATE NOT NULL DEFAULT CURRENT_DATE,
  reference   TEXT,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoice_payments_invoice ON invoice_payments (invoice_id);
