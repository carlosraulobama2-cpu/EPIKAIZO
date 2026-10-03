-- La moneda por defecto de la empresa pasa a ser el franco CFA (XAF, se muestra como FCFA).
-- Solo cambia el valor por defecto: los documentos ya emitidos conservan su moneda.
ALTER TABLE shipments ALTER COLUMN currency SET DEFAULT 'XAF';
ALTER TABLE jobs ALTER COLUMN currency SET DEFAULT 'XAF';
ALTER TABLE invoices ALTER COLUMN currency SET DEFAULT 'XAF';
ALTER TABLE cash_movements ALTER COLUMN currency SET DEFAULT 'XAF';
ALTER TABLE vehicles ALTER COLUMN currency SET DEFAULT 'XAF';

-- Si las tarifas guardadas son las de antes en dólares sin tocar, pasan a las nuevas en FCFA.
-- Si alguien ya las cambió a mano, se respetan.
UPDATE settings
   SET value = '{"currency":"XAF","package_base_fee":3000,"package_per_kg":{"local":2500,"nacional":5500,"internacional":13000},"money_commission_pct":{"local":2,"nacional":3.5,"internacional":6},"money_min_commission":1000}'::jsonb,
       updated_at = now()
 WHERE key = 'rates'
   AND value = '{"currency":"USD","package_base_fee":5,"package_per_kg":{"local":4,"nacional":9,"internacional":22},"money_commission_pct":{"local":2,"nacional":3.5,"internacional":6},"money_min_commission":2}'::jsonb;
