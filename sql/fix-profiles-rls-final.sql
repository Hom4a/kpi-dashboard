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
-- Verification: after running, execute this to check policies:
-- SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'profiles';
-- ============================================================
