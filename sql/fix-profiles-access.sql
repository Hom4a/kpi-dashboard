-- ============================================================
-- Fix: RLS SELECT policies for profiles table
-- Problem: Non-admin users cannot read their own profile,
--          causing role to default to 'viewer' and hiding all tabs.
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Drop potentially broken SELECT policies
DROP POLICY IF EXISTS "auth_read_profiles" ON profiles;
DROP POLICY IF EXISTS "Users can read all profiles" ON profiles;

-- 2. Allow each authenticated user to read their own profile
CREATE POLICY "Users can read own profile" ON profiles
    FOR SELECT TO authenticated
    USING (auth.uid() = id);

-- 3. Allow admin to read ALL profiles (for user management modal)
CREATE POLICY "Admin can read all profiles" ON profiles
    FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- ============================================================
-- After running this SQL:
-- 1. Non-admin users should see correct role badge on login
-- 2. All tabs matching their role should be visible
-- 3. Admin still sees everything + can manage users
-- ============================================================
