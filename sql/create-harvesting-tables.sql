-- ===== Harvesting Dashboard Tables =====
-- Run this in Supabase SQL Editor

-- 1. Plan-Fact Data (Виконання планових показників)
CREATE TABLE IF NOT EXISTS harvesting_plan_fact (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_batch_id UUID NOT NULL,
    upload_date TIMESTAMPTZ DEFAULT NOW(),
    regional_office TEXT NOT NULL,
    annual_plan_total NUMERIC,
    annual_plan_rgk NUMERIC,
    annual_plan_rfiol NUMERIC,
    nine_month_plan_total NUMERIC,
    nine_month_plan_rgk NUMERIC,
    nine_month_plan_rfiol NUMERIC,
    harvested_total NUMERIC,
    harvested_rgk NUMERIC,
    harvested_rfiol NUMERIC,
    pct_nine_month_total NUMERIC,
    pct_nine_month_rgk NUMERIC,
    pct_nine_month_rfiol NUMERIC,
    pct_annual_total NUMERIC,
    pct_annual_rgk NUMERIC,
    pct_annual_rfiol NUMERIC,
    uploaded_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Armed Forces (ZSU) Withdrawals
CREATE TABLE IF NOT EXISTS harvesting_zsu (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_batch_id UUID NOT NULL,
    upload_date TIMESTAMPTZ DEFAULT NOW(),
    regional_office TEXT NOT NULL,
    forest_products_declared_m3 NUMERIC,
    forest_products_shipped_m3 NUMERIC,
    forest_products_value_uah NUMERIC,
    lumber_declared_m3 NUMERIC,
    lumber_shipped_m3 NUMERIC,
    lumber_value_uah NUMERIC,
    uploaded_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== RLS Policies =====
ALTER TABLE harvesting_plan_fact ENABLE ROW LEVEL SECURITY;
ALTER TABLE harvesting_zsu ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read harvesting_plan_fact"
    ON harvesting_plan_fact FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert harvesting_plan_fact"
    ON harvesting_plan_fact FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can delete harvesting_plan_fact"
    ON harvesting_plan_fact FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read harvesting_zsu"
    ON harvesting_zsu FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert harvesting_zsu"
    ON harvesting_zsu FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can delete harvesting_zsu"
    ON harvesting_zsu FOR DELETE TO authenticated USING (true);

-- ===== Indexes =====
CREATE INDEX IF NOT EXISTS idx_harvesting_pf_office ON harvesting_plan_fact(regional_office);
CREATE INDEX IF NOT EXISTS idx_harvesting_pf_batch ON harvesting_plan_fact(upload_batch_id);
CREATE INDEX IF NOT EXISTS idx_harvesting_zsu_office ON harvesting_zsu(regional_office);
CREATE INDEX IF NOT EXISTS idx_harvesting_zsu_batch ON harvesting_zsu(upload_batch_id);

-- Update upload history to support new data types
ALTER TABLE forest_upload_history DROP CONSTRAINT IF EXISTS forest_upload_history_data_type_check;
ALTER TABLE forest_upload_history ADD CONSTRAINT forest_upload_history_data_type_check
    CHECK (data_type IN ('prices', 'inventory', 'harvesting_plan_fact', 'harvesting_zsu'));
