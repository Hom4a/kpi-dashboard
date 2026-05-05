-- =============================================================================
-- Rollback for migration 23
-- =============================================================================
--
-- Reverses all changes from sql/23-profiles-enhance-and-rls-fix.sql.
-- Restores baseline CHECK з 5 ролями (admin, director, analyst, editor,
-- viewer) — exact pre-migration state.
--
-- WARNING: dropping mfa_required column loses any data set in that
-- column between forward apply and rollback. Phase 1 + 1.5 не пишуть у
-- mfa_required (defaults to false), so rollback safe at this point.
-- After Phase 2.5 starts setting mfa_required=true, prefer DB backup
-- recovery over this rollback.
-- =============================================================================

BEGIN;

-- Reverse step 9: revoke fn_is_admin / fn_has_role grants
REVOKE EXECUTE ON FUNCTION public.fn_has_role(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_is_admin() FROM authenticated;

-- Reverse step 8: re-grant trg_alias_normalize (restore baseline)
GRANT EXECUTE ON FUNCTION public.trg_alias_normalize() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.trg_alias_normalize() TO authenticated;
GRANT EXECUTE ON FUNCTION public.trg_alias_normalize() TO anon;

-- Reverse step 7: re-grant handle_new_user (restore baseline)
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon;

-- Reverse step 6: drop new admin policies (using fn_is_admin)
DROP POLICY IF EXISTS "Admins delete" ON public.profiles;
DROP POLICY IF EXISTS "Admins insert" ON public.profiles;
DROP POLICY IF EXISTS "Admins update all" ON public.profiles;
DROP POLICY IF EXISTS "Admins view all" ON public.profiles;

-- Reverse step 5: re-create original 4 circular-subquery admin policies
CREATE POLICY "Admins delete" ON public.profiles
    FOR DELETE
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'admin'
    ));

CREATE POLICY "Admins insert" ON public.profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'admin'
    ));

CREATE POLICY "Admins update all" ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'admin'
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'admin'
    ));

CREATE POLICY "Admins view all" ON public.profiles
    FOR SELECT
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'admin'
    ));

-- Reverse step 4: drop fn_has_role
DROP FUNCTION IF EXISTS public.fn_has_role(text);

-- Reverse step 3: drop fn_is_admin
DROP FUNCTION IF EXISTS public.fn_is_admin();

-- Reverse step 2: restore exact baseline CHECK з 5 ролями
ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('admin','director','analyst','editor','viewer'));

-- Reverse step 1: drop mfa_required column
ALTER TABLE public.profiles DROP COLUMN IF EXISTS mfa_required;

COMMIT;
