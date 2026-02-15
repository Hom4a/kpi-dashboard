-- ===== Forest Dashboard Tables =====
-- Run this in Supabase SQL Editor

-- 1. Forest Prices (Середньозважені ціни)
CREATE TABLE IF NOT EXISTS forest_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_batch_id UUID NOT NULL,
    upload_date TIMESTAMPTZ DEFAULT NOW(),
    branch TEXT,
    region TEXT,
    warehouse TEXT,
    product TEXT,
    species TEXT,
    quality_class TEXT,
    volume_m3 NUMERIC,
    weighted_price_uah NUMERIC,
    total_value_uah NUMERIC,
    uploaded_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Forest Inventory (Залишки лісопродукції)
CREATE TABLE IF NOT EXISTS forest_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_batch_id UUID NOT NULL,
    upload_date TIMESTAMPTZ DEFAULT NOW(),
    branch TEXT,
    region TEXT,
    forest_unit TEXT,
    forestry_div TEXT,
    warehouse TEXT,
    product TEXT,
    product_name TEXT,
    wood_group TEXT,
    species TEXT,
    quality_class TEXT,
    remaining_volume_m3 NUMERIC,
    uploaded_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Upload History (Історія завантажень)
CREATE TABLE IF NOT EXISTS forest_upload_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data_type TEXT NOT NULL CHECK (data_type IN ('prices', 'inventory')),
    batch_id UUID NOT NULL,
    file_name TEXT,
    row_count INT,
    uploaded_by UUID REFERENCES auth.users(id),
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== RLS Policies =====

-- Enable RLS
ALTER TABLE forest_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE forest_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE forest_upload_history ENABLE ROW LEVEL SECURITY;

-- Read access for all authenticated users
CREATE POLICY "Authenticated users can read forest_prices"
    ON forest_prices FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can read forest_inventory"
    ON forest_inventory FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can read forest_upload_history"
    ON forest_upload_history FOR SELECT
    TO authenticated
    USING (true);

-- Insert/Delete for authenticated users (role check on client side)
CREATE POLICY "Authenticated users can insert forest_prices"
    ON forest_prices FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Authenticated users can delete forest_prices"
    ON forest_prices FOR DELETE
    TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can insert forest_inventory"
    ON forest_inventory FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Authenticated users can delete forest_inventory"
    ON forest_inventory FOR DELETE
    TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can insert forest_upload_history"
    ON forest_upload_history FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- ===== Indexes for better query performance =====
CREATE INDEX IF NOT EXISTS idx_forest_prices_branch ON forest_prices(branch);
CREATE INDEX IF NOT EXISTS idx_forest_prices_product ON forest_prices(product);
CREATE INDEX IF NOT EXISTS idx_forest_prices_species ON forest_prices(species);
CREATE INDEX IF NOT EXISTS idx_forest_prices_batch ON forest_prices(upload_batch_id);

CREATE INDEX IF NOT EXISTS idx_forest_inventory_branch ON forest_inventory(branch);
CREATE INDEX IF NOT EXISTS idx_forest_inventory_product ON forest_inventory(product);
CREATE INDEX IF NOT EXISTS idx_forest_inventory_species ON forest_inventory(species);
CREATE INDEX IF NOT EXISTS idx_forest_inventory_batch ON forest_inventory(upload_batch_id);
