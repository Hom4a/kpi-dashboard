// supabase/functions/set-mfa-required/index.ts
// Phase 2 admin action: toggle profiles.mfa_required for target user.
// Frontend (Phase 2.5) reads flag at login → triggers MFA enrollment if true.
//
// Guards:
//   - Caller must be admin
//   - Target must exist
// (No ≥2 admins guard — flag не зламує account)
// (No self-block — admin может set own flag)
//
// Request: { target_id: uuid, required: bool }
// Response: { success, target_id, mfa_required } | { error, detail }

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
        const { target_id, required } = body

        if (!target_id || typeof target_id !== 'string') {
            return new Response(
                JSON.stringify({ error: 'Bad request', detail: 'target_id required (uuid)' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (typeof required !== 'boolean') {
            return new Response(
                JSON.stringify({ error: 'Bad request', detail: 'required field must be boolean' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // 5. Admin client
        const adminClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 6. Verify target exists + capture for response
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

        // 7. Update mfa_required
        const { error: updateError } = await adminClient
            .from('profiles')
            .update({ mfa_required: required })
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
                mfa_required: required,
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
