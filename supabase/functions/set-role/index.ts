// supabase/functions/set-role/index.ts
// Phase 2 admin action: change another user's role.
// Guards:
//   - Caller must be admin (profiles.role === 'admin')
//   - new_role must be у allowed list
//   - ≥2 admins rule: cannot demote last admin from 'admin' role
//
// Request body: { target_id: string (uuid), new_role: string }
// Response: { success: true, target_id, old_role, new_role } | { error, detail }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ALLOWED_ROLES = ['admin', 'director', 'analyst', 'editor', 'manager', 'viewer']

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
        // 1. Auth header check
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: 'Unauthorized' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // 2. Caller JWT verification
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
        const { target_id, new_role } = body

        if (!target_id || typeof target_id !== 'string') {
            return new Response(
                JSON.stringify({ error: 'Bad request', detail: 'target_id required (uuid)' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (!new_role || !ALLOWED_ROLES.includes(new_role)) {
            return new Response(
                JSON.stringify({
                    error: 'Bad request',
                    detail: `new_role must be one of: ${ALLOWED_ROLES.join(', ')}`,
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // 5. Admin client (service_role)
        const adminClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 6. Fetch target's current role
        const { data: targetProfile, error: targetError } = await adminClient
            .from('profiles')
            .select('id, role, full_name')
            .eq('id', target_id)
            .single()

        if (targetError || !targetProfile) {
            return new Response(
                JSON.stringify({ error: 'Not found', detail: 'Target user does not exist' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const old_role = targetProfile.role

        // 7. No-op short-circuit
        if (old_role === new_role) {
            return new Response(
                JSON.stringify({
                    success: true,
                    target_id,
                    old_role,
                    new_role,
                    note: 'No change (role already set)',
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // 8. ≥2 admins guard: prevent demoting last admin
        if (old_role === 'admin' && new_role !== 'admin') {
            const { count, error: countError } = await adminClient
                .from('profiles')
                .select('id', { count: 'exact', head: true })
                .eq('role', 'admin')

            if (countError) {
                return new Response(
                    JSON.stringify({ error: 'Server error', detail: 'Could not verify admin count' }),
                    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            if ((count ?? 0) <= 1) {
                return new Response(
                    JSON.stringify({
                        error: 'Conflict',
                        detail: 'Cannot demote last admin. At least 2 admins required.',
                    }),
                    { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }
        }

        // 9. Update role
        const { error: updateError } = await adminClient
            .from('profiles')
            .update({ role: new_role })
            .eq('id', target_id)

        if (updateError) {
            return new Response(
                JSON.stringify({ error: 'Update failed', detail: updateError.message }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        return new Response(
            JSON.stringify({
                success: true,
                target_id,
                old_role,
                new_role,
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
