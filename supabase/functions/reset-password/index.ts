// supabase/functions/reset-password/index.ts
// Phase 2 admin action: reset target user's password to a generated temp value.
// Mechanism: Option γ — server generates strong temp, returns plain-text у response.
// Admin copies and passes to user out-of-band (Telegram/Signal/SMS/voice).
//
// Guards:
//   - Caller must be admin
//   - Target must exist
// (No ≥2 admins guard — reset не зламує admin status)
// (No self-block — admin may reset own password while authenticated)
//
// Request: { target_id: uuid }
// Response: { success, target_id, target_email, temp_password } | { error, detail }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Password generation: 16 chars, no ambiguous chars, mixed classes.
// Uses crypto.getRandomValues() for cryptographic safety.
function generateTempPassword(): string {
    const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ'   // no I, L, O
    const lower = 'abcdefghjkmnpqrstuvwxyz'   // no i, l, o
    const digits = '23456789'                  // no 0, 1
    const specials = '!@#$%&*-_=+'

    const all = upper + lower + digits + specials

    // Guarantee at least 2 upper, 2 lower, 2 digit, 1 special
    const required: string[] = [
        ...pickN(upper, 2),
        ...pickN(lower, 2),
        ...pickN(digits, 2),
        ...pickN(specials, 1),
    ]

    // Fill remaining 9 chars from full alphabet
    const remaining = pickN(all, 16 - required.length)
    const combined = [...required, ...remaining]

    // Shuffle (Fisher-Yates with crypto-safe randomness)
    for (let i = combined.length - 1; i > 0; i--) {
        const j = randomInt(i + 1)
        ;[combined[i], combined[j]] = [combined[j], combined[i]]
    }

    return combined.join('')
}

function pickN(alphabet: string, n: number): string[] {
    const out: string[] = []
    for (let i = 0; i < n; i++) {
        out.push(alphabet[randomInt(alphabet.length)])
    }
    return out
}

function randomInt(maxExclusive: number): number {
    const buf = new Uint32Array(1)
    crypto.getRandomValues(buf)
    return buf[0] % maxExclusive
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

        // 5. Admin client
        const adminClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 6. Fetch target (verify exists + get email for response)
        const { data: targetProfile, error: targetError } = await adminClient
            .from('profiles')
            .select('id, full_name, email')
            .eq('id', target_id)
            .single()

        if (targetError || !targetProfile) {
            return new Response(
                JSON.stringify({ error: 'Not found', detail: 'Target user does not exist' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // 7. Generate temp password
        const tempPassword = generateTempPassword()

        // 8. Update password via GoTrue admin API
        const { error: updateError } = await adminClient.auth.admin.updateUserById(
            target_id,
            { password: tempPassword }
        )

        if (updateError) {
            return new Response(
                JSON.stringify({ error: 'Update failed', detail: updateError.message }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // 9. Return temp password (Option γ — admin copies and passes out-of-band)
        return new Response(
            JSON.stringify({
                success: true,
                target_id,
                target_email: targetProfile.email,
                temp_password: tempPassword,
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
