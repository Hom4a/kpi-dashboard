// supabase/functions/reset-mfa-factor/index.ts
// Phase 2.5 admin action: delete all MFA factors for target user.
// User's AAL drops to aal1 → re-enrollment required at next login
// if profiles.mfa_required=true.
//
// Guards:
//   - Caller must be admin
//   - Target must exist
// (No ≥2 admins guard — MFA reset не змінює role)
// (No self-block — admin може reset own factors якщо потрібно)
//
// Mechanism: GoTrue admin HTTP API (service_role як Bearer).
//   GET    /auth/v1/admin/users/{id}/factors  → list
//   DELETE /auth/v1/admin/users/{id}/factors/{factor_id}
// CASCADE handles auth.mfa_challenges automatically (FK ON DELETE).
//
// Why HTTP а не .schema('auth') чи admin.mfa SDK:
//   - PGRST_DB_SCHEMAS у Supabase self-hosted за замовчуванням не exposes
//     auth schema → .schema('auth') повертає 'schema not exposed'.
//   - admin.mfa namespace shape varies across supabase-js@2 patches.
//   - GoTrue admin API v2.x stable + documented.
//
// Request: { target_id: uuid }
// Response: { success, target_id, factors_deleted } | { error, detail }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    if (req.method !== 'POST') {
        return new Response(
            JSON.stringify({ error: 'Method not allowed' }),
            { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    try {
        // 1. Auth header
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: 'Unauthorized' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // 2. Caller JWT verify
        const callerClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader } } }
        )

        const { data: { user: caller }, error: authError } = await callerClient.auth.getUser()
        if (authError || !caller) {
            return new Response(
                JSON.stringify({ error: 'Invalid session' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // 3. Admin role check
        const { data: callerProfile, error: profileError } = await callerClient
            .from('profiles')
            .select('role')
            .eq('id', caller.id)
            .single()

        if (profileError || !callerProfile || callerProfile.role !== 'admin') {
            return new Response(
                JSON.stringify({ error: 'Forbidden', detail: 'Admin role required' }),
                { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // 4. Body parse + validation
        const body = await req.json().catch(() => ({}))
        const { target_id } = body

        if (!target_id || typeof target_id !== 'string') {
            return new Response(
                JSON.stringify({ error: 'Bad request', detail: 'target_id required (uuid)' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // 5. Admin client (для profiles target check)
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        const adminClient = createClient(supabaseUrl, serviceKey)

        // 6. Verify target exists
        const { data: targetProfile, error: targetError } = await adminClient
            .from('profiles')
            .select('id, full_name')
            .eq('id', target_id)
            .single()

        if (targetError || !targetProfile) {
            return new Response(
                JSON.stringify({ error: 'Not found', detail: 'Target user does not exist' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // 7. List existing factors via GoTrue admin API
        const gotrueBase = supabaseUrl + '/auth/v1'
        const adminAuthHeaders = {
            'Authorization': `Bearer ${serviceKey}`,
            'apikey': serviceKey,
        }

        const listRes = await fetch(`${gotrueBase}/admin/users/${target_id}/factors`, {
            headers: adminAuthHeaders,
        })

        if (!listRes.ok) {
            const txt = await listRes.text()
            return new Response(
                JSON.stringify({ error: 'List factors failed', detail: `GoTrue ${listRes.status}: ${txt}` }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const factors = await listRes.json()
        const factors_count = Array.isArray(factors) ? factors.length : 0

        // 8. Delete each factor (CASCADE clears mfa_challenges)
        for (let i = 0; i < factors_count; i++) {
            const f = factors[i]
            const delRes = await fetch(`${gotrueBase}/admin/users/${target_id}/factors/${f.id}`, {
                method: 'DELETE',
                headers: adminAuthHeaders,
            })
            if (!delRes.ok) {
                const txt = await delRes.text()
                return new Response(
                    JSON.stringify({
                        error: 'Delete factor failed',
                        detail: `factor ${f.id}: GoTrue ${delRes.status}: ${txt}`,
                        factors_deleted_partial: i,
                    }),
                    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }
        }

        return new Response(
            JSON.stringify({
                success: true,
                target_id,
                factors_deleted: factors_count,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (err) {
        return new Response(
            JSON.stringify({ error: 'Server error', detail: err.message ?? String(err) }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
