-- ===== Role System Update =====
-- Run this in Supabase SQL Editor

-- Add allowed_pages column to profiles table
-- Default: all pages allowed
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS allowed_pages TEXT[]
DEFAULT ARRAY['volumes','finance','forest','harvesting'];

-- Set default for existing profiles
UPDATE profiles SET allowed_pages = ARRAY['volumes','finance','forest','harvesting']
WHERE allowed_pages IS NULL;
