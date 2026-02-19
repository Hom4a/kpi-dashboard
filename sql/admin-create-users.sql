-- ============================================================
-- Admin user creation: INSERT policy + auto-create trigger
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Allow admins to INSERT into profiles (required for createUser from JS)
DO $$ BEGIN
  CREATE POLICY "Admin can insert profiles" ON profiles
    FOR INSERT TO authenticated
    WITH CHECK (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Auto-create profile on auth.users insert (safety net)
--    If JS already inserted the profile, ON CONFLICT DO NOTHING skips it.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        'viewer'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- IMPORTANT: Also go to Supabase Dashboard:
-- Authentication -> Settings -> Email Auth -> Disable "Confirm email"
-- Otherwise new users won't be able to log in without email verification
-- ============================================================
