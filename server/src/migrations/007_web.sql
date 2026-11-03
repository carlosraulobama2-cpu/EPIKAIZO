-- Web: portafolio de obras, opiniones de clientes, presupuesto en línea con fotos, área de cliente
-- con código por WhatsApp y avisos de pago móvil.

-- Portafolio: obras terminadas con fotos de antes y después. Solo se ven en la web si están publicadas.
CREATE TABLE IF NOT EXISTS projects (
  id            UUID PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  title         TEXT NOT NULL,
  category      TEXT,
  city          TEXT,
  description   TEXT,
  completed_on  DATE,
  job_id        UUID REFERENCES jobs(id) ON DELETE SET NULL,
  published     BOOLEAN NOT NULL DEFAULT false,
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_tenant ON projects (tenant_id, published, position);

CREATE TABLE IF NOT EXISTS project_photos (
  id          UUID PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'despues' CHECK (kind IN ('antes', 'despues', 'otra')),
  caption     TEXT,
  mime        TEXT NOT NULL CHECK (mime IN ('image/jpeg', 'image/webp', 'image/png')),
  data        BYTEA NOT NULL,
  size        INTEGER NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_photos_project ON project_photos (project_id, kind, position);

-- Opiniones: se piden por WhatsApp al terminar un trabajo o entregar un envío, con un enlace único.
-- Solo salen en la web las que el equipo publica.
CREATE TABLE IF NOT EXISTS reviews (
  id            UUID PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  token         TEXT NOT NULL UNIQUE,
  source        TEXT NOT NULL CHECK (source IN ('trabajo', 'envio', 'manual')),
  job_id        UUID REFERENCES jobs(id) ON DELETE SET NULL,
  shipment_id   UUID REFERENCES shipments(id) ON DELETE SET NULL,
  client_name   TEXT NOT NULL,
  client_phone  TEXT,
  rating        INTEGER CHECK (rating BETWEEN 1 AND 5),
  comment       TEXT,
  status        TEXT NOT NULL DEFAULT 'solicitada' CHECK (status IN ('solicitada', 'recibida', 'publicada', 'oculta')),
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at  TIMESTAMPTZ,
  published_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS reviews_tenant ON reviews (tenant_id, status, submitted_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS reviews_job ON reviews (job_id) WHERE job_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS reviews_shipment ON reviews (shipment_id) WHERE shipment_id IS NOT NULL;

-- Presupuesto en línea: datos del formulario por pasos y fotos que manda el cliente.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS details JSONB;
CREATE TABLE IF NOT EXISTS message_photos (
  id          UUID PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  message_id  UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  mime        TEXT NOT NULL CHECK (mime IN ('image/jpeg', 'image/webp', 'image/png')),
  data        BYTEA NOT NULL,
  size        INTEGER NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS message_photos_message ON message_photos (message_id, position);

-- Área de cliente: código de 6 cifras por WhatsApp (se guarda solo su resumen), 10 minutos, 5 intentos.
CREATE TABLE IF NOT EXISTS client_codes (
  id          UUID PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  phone       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  used        BOOLEAN NOT NULL DEFAULT false,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_codes_phone ON client_codes (tenant_id, phone, created_at DESC);

-- Avisos de pago: el cliente dice que ha pagado por pago móvil o transferencia; el equipo lo comprueba
-- y, al confirmarlo, queda registrado el cobro en la factura.
CREATE TABLE IF NOT EXISTS payment_notices (
  id            UUID PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  invoice_id    UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount        NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  method        TEXT NOT NULL CHECK (method IN ('movil', 'transferencia')),
  reference     TEXT NOT NULL,
  payer_phone   TEXT,
  status        TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'confirmado', 'rechazado')),
  note          TEXT,
  handled_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  handled_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_notices_tenant ON payment_notices (tenant_id, status, created_at DESC);
