-- ============================================================
-- Security Fix: Replace permissive RLS policies with role-based access
-- Problem: All INSERT/DELETE policies use WITH CHECK(true) / USING(true)
--          allowing ANY authenticated user to modify/delete all data.
-- Run this in Supabase SQL Editor
-- ============================================================

-- ===== Helper: role-check function to avoid recursion =====
CREATE OR REPLACE FUNCTION public.user_has_role(allowed_roles text[])
RETURNS boolean AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role = ANY(allowed_roles)
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Upload roles (can insert data)
-- Matches UPLOAD_ROLES in auth.js: admin, editor, accountant, hr, forester, operator
-- Delete/clear roles (can delete data)
-- Matches DATA_MANAGE_ROLES in auth.js: admin, editor

-- ===== forest_prices =====
DROP POLICY IF EXISTS "Authenticated users can insert forest_prices" ON forest_prices;
DROP POLICY IF EXISTS "Authenticated users can delete forest_prices" ON forest_prices;

CREATE POLICY "upload_roles_insert_forest_prices" ON forest_prices
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_role(ARRAY['admin','editor','accountant','forester','operator']));

CREATE POLICY "manage_roles_delete_forest_prices" ON forest_prices
    FOR DELETE TO authenticated
    USING (public.user_has_role(ARRAY['admin','editor']));

-- ===== forest_inventory =====
DROP POLICY IF EXISTS "Authenticated users can insert forest_inventory" ON forest_inventory;
DROP POLICY IF EXISTS "Authenticated users can delete forest_inventory" ON forest_inventory;

CREATE POLICY "upload_roles_insert_forest_inventory" ON forest_inventory
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_role(ARRAY['admin','editor','accountant','forester','operator']));

CREATE POLICY "manage_roles_delete_forest_inventory" ON forest_inventory
    FOR DELETE TO authenticated
    USING (public.user_has_role(ARRAY['admin','editor']));

-- ===== forest_upload_history =====
DROP POLICY IF EXISTS "Authenticated users can insert forest_upload_history" ON forest_upload_history;
DROP POLICY IF EXISTS "Authenticated users can delete forest_upload_history" ON forest_upload_history;

CREATE POLICY "upload_roles_insert_forest_upload_history" ON forest_upload_history
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_role(ARRAY['admin','editor','accountant','hr','forester','operator']));

CREATE POLICY "manage_roles_delete_forest_upload_history" ON forest_upload_history
    FOR DELETE TO authenticated
    USING (public.user_has_role(ARRAY['admin','editor']));

-- ===== harvesting_plan_fact =====
DROP POLICY IF EXISTS "Authenticated users can insert harvesting_plan_fact" ON harvesting_plan_fact;
DROP POLICY IF EXISTS "Authenticated users can delete harvesting_plan_fact" ON harvesting_plan_fact;

CREATE POLICY "upload_roles_insert_harvesting_plan_fact" ON harvesting_plan_fact
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_role(ARRAY['admin','editor','forester','operator']));

CREATE POLICY "manage_roles_delete_harvesting_plan_fact" ON harvesting_plan_fact
    FOR DELETE TO authenticated
    USING (public.user_has_role(ARRAY['admin','editor']));

-- ===== harvesting_zsu =====
DROP POLICY IF EXISTS "Authenticated users can insert harvesting_zsu" ON harvesting_zsu;
DROP POLICY IF EXISTS "Authenticated users can delete harvesting_zsu" ON harvesting_zsu;

CREATE POLICY "upload_roles_insert_harvesting_zsu" ON harvesting_zsu
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_role(ARRAY['admin','editor','forester','operator']));

CREATE POLICY "manage_roles_delete_harvesting_zsu" ON harvesting_zsu
    FOR DELETE TO authenticated
    USING (public.user_has_role(ARRAY['admin','editor']));

-- ===== market_prices =====
DROP POLICY IF EXISTS "auth_insert_market_prices" ON market_prices;
DROP POLICY IF EXISTS "auth_delete_market_prices" ON market_prices;

CREATE POLICY "upload_roles_insert_market_prices" ON market_prices
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_role(ARRAY['admin','editor','forester']));

CREATE POLICY "manage_roles_delete_market_prices" ON market_prices
    FOR DELETE TO authenticated
    USING (public.user_has_role(ARRAY['admin','editor']));

-- ===== market_prices_ua =====
DROP POLICY IF EXISTS "auth_insert_market_prices_ua" ON market_prices_ua;
DROP POLICY IF EXISTS "auth_delete_market_prices_ua" ON market_prices_ua;

CREATE POLICY "upload_roles_insert_market_prices_ua" ON market_prices_ua
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_role(ARRAY['admin','editor','forester']));

CREATE POLICY "manage_roles_delete_market_prices_ua" ON market_prices_ua
    FOR DELETE TO authenticated
    USING (public.user_has_role(ARRAY['admin','editor']));

-- ===== market_price_history =====
DROP POLICY IF EXISTS "auth_insert_market_price_history" ON market_price_history;
DROP POLICY IF EXISTS "auth_delete_market_price_history" ON market_price_history;

CREATE POLICY "upload_roles_insert_market_price_history" ON market_price_history
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_role(ARRAY['admin','editor','forester']));

CREATE POLICY "manage_roles_delete_market_price_history" ON market_price_history
    FOR DELETE TO authenticated
    USING (public.user_has_role(ARRAY['admin','editor']));

-- ===== eur_rates =====
DROP POLICY IF EXISTS "auth_insert_eur_rates" ON eur_rates;
DROP POLICY IF EXISTS "auth_delete_eur_rates" ON eur_rates;

CREATE POLICY "upload_roles_insert_eur_rates" ON eur_rates
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_role(ARRAY['admin','editor','forester']));

CREATE POLICY "manage_roles_delete_eur_rates" ON eur_rates
    FOR DELETE TO authenticated
    USING (public.user_has_role(ARRAY['admin','editor']));

-- ===== kpi_records (if RLS enabled) =====
-- Check if policies exist and replace them
DO $$
BEGIN
    -- Drop existing permissive INSERT policy if exists
    DROP POLICY IF EXISTS "Authenticated users can insert kpi_records" ON kpi_records;
    DROP POLICY IF EXISTS "Authenticated users can delete kpi_records" ON kpi_records;
    DROP POLICY IF EXISTS "auth_insert_kpi_records" ON kpi_records;
    DROP POLICY IF EXISTS "auth_delete_kpi_records" ON kpi_records;

    -- Create role-based policies
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'kpi_records') THEN
        CREATE POLICY "upload_roles_insert_kpi_records" ON kpi_records
            FOR INSERT TO authenticated
            WITH CHECK (public.user_has_role(ARRAY['admin','editor']));

        CREATE POLICY "manage_roles_delete_kpi_records" ON kpi_records
            FOR DELETE TO authenticated
            USING (public.user_has_role(ARRAY['admin','editor']));
    END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- SELECT policies remain USING(true) — all authenticated users
-- can read data, which is correct for a dashboard.
-- ============================================================

-- ============================================================
-- After running this SQL:
-- 1. Only admin/editor can delete data (clear, undo)
-- 2. Only upload-capable roles can insert data
-- 3. Viewers/directors/analysts can ONLY read — no write access
-- 4. Test: Log in as viewer, try to delete via DevTools → should fail
-- ============================================================
