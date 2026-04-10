-- ============================================================
--  SCHEMA — Depósito App
--  Correr en Supabase > SQL Editor
-- ============================================================

-- Tabla de depósitos (preparada para múltiples usuarios futuros)
CREATE TABLE IF NOT EXISTS depots (
  id         SERIAL PRIMARY KEY,
  name       TEXT    NOT NULL UNIQUE,          -- ej: "Cosmética", "Ferretería"
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar el depósito inicial de cosmética
INSERT INTO depots (name) VALUES ('Cosmética') ON CONFLICT DO NOTHING;


-- Tabla de productos (importada desde el PDF)
CREATE TABLE IF NOT EXISTS products (
  id          SERIAL PRIMARY KEY,
  code        TEXT    NOT NULL UNIQUE,         -- código del listado
  brand       TEXT    NOT NULL,                -- marca extraída de la descripción
  description TEXT    NOT NULL,                -- nombre del producto
  weight_qty  TEXT,                            -- peso o cantidad (ej: "350ml", "x12")
  price       NUMERIC(10, 2),
  category    TEXT    NOT NULL DEFAULT 'General', -- "Cosmética", "Limpieza", etc.
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_brand     ON products(brand);
-- Índice de texto completo para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_products_search
  ON products USING GIN (to_tsvector('spanish', brand || ' ' || description));


-- Tabla de entradas de stock (por lote)
CREATE TABLE IF NOT EXISTS stock_entries (
  id          SERIAL PRIMARY KEY,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  depot_id    INTEGER NOT NULL REFERENCES depots(id),
  lot_number  TEXT    NOT NULL,                -- número de lote
  quantity    INTEGER NOT NULL CHECK (quantity >= 0),
  notes       TEXT,                            -- campo libre opcional
  created_at  TIMESTAMPTZ DEFAULT NOW(),

  -- Un lote de un producto en un depósito es único
  UNIQUE (product_id, depot_id, lot_number)
);

CREATE INDEX IF NOT EXISTS idx_stock_product ON stock_entries(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_depot   ON stock_entries(depot_id);


-- Vista útil: stock total por producto y depósito
CREATE OR REPLACE VIEW stock_summary AS
  SELECT
    p.id          AS product_id,
    p.code,
    p.brand,
    p.description,
    p.weight_qty,
    p.category,
    d.name        AS depot_name,
    COALESCE(SUM(se.quantity), 0) AS total_stock,
    COUNT(se.id)                  AS lot_count
  FROM products p
  CROSS JOIN depots d
  LEFT JOIN stock_entries se
         ON se.product_id = p.id
        AND se.depot_id   = d.id
  GROUP BY p.id, p.code, p.brand, p.description, p.weight_qty, p.category, d.name;


-- RLS (Row Level Security) — la app usa anon key, esto la protege
ALTER TABLE products      ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE depots        ENABLE ROW LEVEL SECURITY;

-- Solo lectura pública para productos y depósitos
CREATE POLICY "products_read_all"  ON products      FOR SELECT USING (true);
CREATE POLICY "depots_read_all"    ON depots        FOR SELECT USING (true);
CREATE POLICY "stock_read_all"     ON stock_entries FOR SELECT USING (true);

-- Escritura permitida con anon key (app personal, sin auth)
-- Si en el futuro querés agregar auth, cambiás estas policies
CREATE POLICY "stock_insert_all"   ON stock_entries FOR INSERT WITH CHECK (true);
CREATE POLICY "stock_update_all"   ON stock_entries FOR UPDATE USING (true);
CREATE POLICY "products_insert_all" ON products     FOR INSERT WITH CHECK (true);
