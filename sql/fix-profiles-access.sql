-- ============================================================
-- Fix: RLS SELECT policies for profiles table
-- Problem: Non-admin users cannot read their own profile,
--          causing role to default to 'viewer' and hiding all tabs.
--
-- NOTE: Previous version had a recursive "Admin can read all profiles"
--       policy that queried profiles inside its own USING clause,
--       causing ALL reads to fail (including admin).
--       This version uses a simple USING(true) for all authenticated users.
--
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Drop all existing SELECT policies (clean slate)
DROP POLICY IF EXISTS "auth_read_profiles" ON profiles;
DROP POLICY IF EXISTS "Users can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Admin can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Authenticated can read profiles" ON profiles;

-- 2. Allow all authenticated users to read profiles
-- This is safe because profiles only contain role, name, org info — no secrets.
-- Admin needs to read ALL profiles for user management.
-- Non-admin only functionally uses their own profile (enforced by app logic).
CREATE POLICY "Authenticated can read profiles" ON profiles
    FOR SELECT TO authenticated
    USING (true);

-- ============================================================
-- After running this SQL:
-- 1. Non-admin users should see correct role badge on login
-- 2. All tabs matching their role should be visible
-- 3. Admin still sees everything + can manage users
-- ============================================================
