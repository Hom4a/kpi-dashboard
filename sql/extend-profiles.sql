-- ============================================================
-- Extend profiles: 9 roles + org_level + org_unit
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add org_level and org_unit columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS org_level TEXT DEFAULT 'central';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS org_unit TEXT DEFAULT '';

-- Add CHECK constraint for org_level
DO $$ BEGIN
  ALTER TABLE profiles ADD CONSTRAINT profiles_org_level_check
    CHECK (org_level IN ('central', 'regional', 'branch', 'forest_unit'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Update role CHECK constraint to support 9 roles
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'admin',       -- Full access, manage users
    'director',    -- Read-only all data, executive dashboard
    'analyst',     -- Read-only, can create custom dashboards
    'editor',      -- Data entry within org_unit scope
    'accountant',  -- Finance, prices, cash balance
    'hr',          -- Staff, work hours
    'forester',    -- Harvesting, inventory (field)
    'operator',    -- Inventory, warehouse operations
    'viewer'       -- Read-only, limited by allowed_pages
  ));

-- 3. Create org_units reference table
CREATE TABLE IF NOT EXISTS org_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('regional', 'branch', 'forest_unit')),
  parent_id UUID REFERENCES org_units(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Seed 9 regional offices
INSERT INTO org_units (name, level) VALUES
  ('Карпатська ЛО', 'regional'),
  ('Південна ЛО', 'regional'),
  ('Північна ЛО', 'regional'),
  ('Подільська ЛО', 'regional'),
  ('Поліська ЛО', 'regional'),
  ('Слобожанська ЛО', 'regional'),
  ('Столична ЛО', 'regional'),
  ('Центральна ЛО', 'regional'),
  ('Східна ЛО', 'regional')
ON CONFLICT DO NOTHING;

-- 5. RLS for org_units
ALTER TABLE org_units ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authenticated can read org_units" ON org_units
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admin can manage org_units" ON org_units
    FOR ALL TO authenticated USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
