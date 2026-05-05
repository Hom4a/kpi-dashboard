-- =============================================================================
-- Migration 23: profiles enhance + RLS hardening + tech debt fix
-- =============================================================================
--
-- Phase 1 of ADMIN_EPIC. Replaces planned user_roles table з ALTER on
-- existing profiles (already has role text NOT NULL з даними для всіх
-- 6 users — see Section II.8). Adds mfa_required column, extends CHECK
-- to include 'manager' (preserving baseline analyst/director values для
-- backward compat — Option A from chat decision 2026-05-05), creates
-- fn_is_admin/fn_has_role helpers, replaces 4 circular admin RLS
-- policies with USING (fn_is_admin()) pattern, revokes leaked anon
-- grants on trigger functions.
--
-- Single transaction — all changes atomic. Companion: sql/23-rollback.sql.
-- =============================================================================

BEGIN;

-- 1. Add mfa_required column (default false; existing 6 rows safely set)
ALTER TABLE public.profiles
    ADD COLUMN mfa_required boolean NOT NULL DEFAULT false;

-- 2. Extend role CHECK constraint: preserve baseline 5 (admin, director,
--    analyst, editor, viewer) + add 'manager' для нашого 4-role policy
--    model. Director/analyst preserved для backward compat з js/app.js:91
--    references; admin UI Phase 2 буде exposing тільки admin/editor/
--    manager/viewer (Section IV). Phase 7+ schema rationalization may
--    revisit director/analyst.
ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('admin','director','analyst','editor','viewer','manager'));

-- 3. Create fn_is_admin() — SECURITY DEFINER bypasses RLS recursion
--    that the existing inline-subquery admin policies suffer from.
CREATE OR REPLACE FUNCTION public.fn_is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
$$;
COMMENT ON FUNCTION public.fn_is_admin() IS
    'Returns true iff calling user has profiles.role=admin. SECURITY DEFINER avoids RLS recursion.';

-- 4. Create fn_has_role(text) — generic role check helper.
CREATE OR REPLACE FUNCTION public.fn_has_role(target_role text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = target_role
    );
$$;
COMMENT ON FUNCTION public.fn_has_role(text) IS
    'Returns true iff calling user has profiles.role=target_role. SECURITY DEFINER bypasses RLS.';

-- 5. Drop 4 circular-subquery admin policies on profiles
DROP POLICY IF EXISTS "Admins delete" ON public.profiles;
DROP POLICY IF EXISTS "Admins insert" ON public.profiles;
DROP POLICY IF EXISTS "Admins update all" ON public.profiles;
DROP POLICY IF EXISTS "Admins view all" ON public.profiles;

-- 6. Create new admin policies using fn_is_admin() (no recursion)
CREATE POLICY "Admins delete" ON public.profiles
    FOR DELETE
    TO authenticated
    USING (public.fn_is_admin());

CREATE POLICY "Admins insert" ON public.profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (public.fn_is_admin());

CREATE POLICY "Admins update all" ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (public.fn_is_admin())
    WITH CHECK (public.fn_is_admin());

CREATE POLICY "Admins view all" ON public.profiles
    FOR SELECT
    TO authenticated
    USING (public.fn_is_admin());

-- 7. Revoke leaked grants on handle_new_user (SECURITY DEFINER trigger;
--    engine invokes без external auth context — see Section 2.5 verdict).
--    postgres + service_role keep EXECUTE legitimately.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;

-- 8. Revoke leaked grants on trg_alias_normalize (BEFORE trigger).
--    postgres + service_role keep EXECUTE legitimately.
REVOKE EXECUTE ON FUNCTION public.trg_alias_normalize() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_alias_normalize() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_alias_normalize() FROM PUBLIC;

-- 9. Grant fn_is_admin / fn_has_role to authenticated
--    (frontend RPC calls, future RLS policy USING expressions).
GRANT EXECUTE ON FUNCTION public.fn_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_has_role(text) TO authenticated;

-- 10. Revoke implicit PUBLIC EXECUTE which Postgres auto-grants on
--     CREATE FUNCTION. anon and authenticated retain explicit grants
--     per Supabase pattern — anon receives default grant on public
--     schema functions to support RPC calls before login (frontend
--     guard patterns may rely on this). Functional impact для anon
--     callers = 0: auth.uid() returns NULL → fn_is_admin returns
--     false. Phase 2 may revisit anon REVOKE after frontend admin
--     guard pattern design clarifies whether anon-callable is required.
REVOKE EXECUTE ON FUNCTION public.fn_is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_has_role(text) FROM PUBLIC;

COMMIT;
