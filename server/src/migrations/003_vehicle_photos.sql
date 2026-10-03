-- Fotos de los vehículos en venta. Se guardan en la base de datos (en Render el disco se borra en
-- cada despliegue). El panel las reduce antes de subirlas (máx. 1600 px, WebP o JPEG).
CREATE TABLE IF NOT EXISTS vehicle_photos (
  id          UUID PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  vehicle_id  UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  mime        TEXT NOT NULL CHECK (mime IN ('image/jpeg', 'image/webp', 'image/png')),
  data        BYTEA NOT NULL,
  size        INTEGER NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vehicle_photos_vehicle ON vehicle_photos (vehicle_id, position);
