-- ============================================================
-- FINAL FIX: Ensure profiles table RLS allows authenticated reads
-- Root cause of role-reset-to-viewer: profile SELECT blocked by RLS
--
-- This script is idempotent — safe to run multiple times.
-- Run this in Supabase SQL Editor.
-- ============================================================

-- 1. Ensure RLS is enabled
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 2. Drop ALL existing SELECT policies (clean slate)
DROP POLICY IF EXISTS "auth_read_profiles" ON profiles;
DROP POLICY IF EXISTS "Users can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Admin can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Authenticated can read profiles" ON profiles;
DROP POLICY IF EXISTS "authenticated_read_profiles" ON profiles;

-- 3. Create a simple SELECT policy: all authenticated users can read profiles
-- This is safe: profiles only contain role, name, org info — no secrets.
CREATE POLICY "Authenticated can read profiles" ON profiles
    FOR SELECT TO authenticated
    USING (true);

-- 4. Ensure UPDATE policy exists (users update own profile, admin updates all)
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admin can update all profiles" ON profiles;

CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

CREATE POLICY "Admin can update all profiles" ON profiles
    FOR UPDATE TO authenticated
    USING (public.user_has_role(ARRAY['admin']))
    WITH CHECK (public.user_has_role(ARRAY['admin']));

-- 5. Ensure INSERT policy exists (for creating profiles on signup)
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Admin can insert profiles" ON profiles;

CREATE POLICY "Users can insert own profile" ON profiles
    FOR INSERT TO authenticated
    WITH CHECK (id = auth.uid());

CREATE POLICY "Admin can insert profiles" ON profiles
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_role(ARRAY['admin']));

-- ============================================================
-- 6. Fix dashboard_configs RLS: ensure builder roles can manage own dashboards
-- ============================================================

-- Recreate policies (idempotent)
DO $$ BEGIN
    -- Drop old policies
    DROP POLICY IF EXISTS "View public or own dashboards" ON dashboard_configs;
    DROP POLICY IF EXISTS "Insert own dashboards" ON dashboard_configs;
    DROP POLICY IF EXISTS "Update own dashboards" ON dashboard_configs;
    DROP POLICY IF EXISTS "Delete own dashboards" ON dashboard_configs;
    DROP POLICY IF EXISTS "Admin full access dashboards" ON dashboard_configs;

    -- SELECT: see own + public + template dashboards
    CREATE POLICY "View public or own dashboards" ON dashboard_configs
        FOR SELECT TO authenticated
        USING (is_public = true OR is_template = true OR created_by = auth.uid());

    -- INSERT: any authenticated user can create (created_by must match)
    CREATE POLICY "Insert own dashboards" ON dashboard_configs
        FOR INSERT TO authenticated
        WITH CHECK (created_by = auth.uid());

    -- UPDATE: owner can update their dashboards
    CREATE POLICY "Update own dashboards" ON dashboard_configs
        FOR UPDATE TO authenticated
        USING (created_by = auth.uid());

    -- DELETE: owner can delete their dashboards
    CREATE POLICY "Delete own dashboards" ON dashboard_configs
        FOR DELETE TO authenticated
        USING (created_by = auth.uid());

    -- Admin can manage ALL dashboards
    CREATE POLICY "Admin full access dashboards" ON dashboard_configs
        FOR ALL TO authenticated
        USING (public.user_has_role(ARRAY['admin']));

EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'dashboard_configs table not found — skipping';
END $$;

-- ============================================================
-- Verification: after running, execute this to check policies:
-- SELECT policyname, cmd, qual FROM pg_policies
--   WHERE tablename IN ('profiles', 'dashboard_configs');
-- ============================================================
