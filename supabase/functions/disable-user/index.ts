// supabase/functions/disable-user/index.ts
// Phase 2 admin action: disable or re-enable a user (toggle).
// Uses GoTrue admin API: auth.admin.updateUserById(id, { ban_duration }).
//
// Disable: ban_duration set to far-future ('876000h' ≈ 100 years)
// Re-enable: ban_duration: 'none'
//
// Guards:
//   - Caller must be admin
//   - Cannot disable self
//   - ≥2 admins rule: cannot disable last admin
//
// Request: { target_id: uuid, enable: bool }
// Response: { success, target_id, enabled, target_email } | { error, detail }

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
        const { target_id, enable } = body

        if (!target_id || typeof target_id !== 'string') {
            return new Response(
                JSON.stringify({ error: 'Bad request', detail: 'target_id required (uuid)' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (typeof enable !== 'boolean') {
            return new Response(
                JSON.stringify({ error: 'Bad request', detail: 'enable required (boolean)' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // 5. Self-protection
        if (target_id === caller.id) {
            return new Response(
                JSON.stringify({ error: 'Conflict', detail: 'Cannot disable yourself' }),
                { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // 6. Admin client
        const adminClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 7. Fetch target
        const { data: targetProfile, error: targetError } = await adminClient
            .from('profiles')
            .select('id, role, full_name, email')
            .eq('id', target_id)
            .single()

        if (targetError || !targetProfile) {
            return new Response(
                JSON.stringify({ error: 'Not found', detail: 'Target user does not exist' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // 8. ≥2 admins guard if disabling an admin
        if (!enable && targetProfile.role === 'admin') {
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
                        detail: 'Cannot disable last admin. At least 2 admins required.',
                    }),
                    { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }
        }

        // 9. Ban or unban via GoTrue admin API
        const banDuration = enable ? 'none' : '876000h'  // 100 years ≈ permanent
        const { error: banError } = await adminClient.auth.admin.updateUserById(
            target_id,
            { ban_duration: banDuration }
        )

        if (banError) {
            return new Response(
                JSON.stringify({ error: 'Update failed', detail: banError.message }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        return new Response(
            JSON.stringify({
                success: true,
                target_id,
                enabled: enable,
                target_email: targetProfile.email,
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
