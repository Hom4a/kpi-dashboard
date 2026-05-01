// ===== Create User — Admin Edge Function =====
// Creates auth user + profile in one atomic operation using service_role key.
// No email confirmation required.
//
// Deploy: supabase functions deploy create-user

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify the caller is authenticated and is an admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Verify caller's role using their JWT
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false }
    })
    const { data: { user: caller } } = await callerClient.auth.getUser()
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Check caller is admin
    const { data: callerProfile } = await callerClient.from('profiles').select('role').eq('id', caller.id).single()
    if (!callerProfile || callerProfile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Тільки адміністратор може створювати користувачів' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Parse request body
    const { email, password, full_name, role, org_level, org_unit, allowed_pages } = await req.json()

    if (!email || !password || !full_name) {
      return new Response(JSON.stringify({ error: 'email, password, full_name обов\'язкові' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Admin client with service_role key
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })

    // Step 1: Create auth user (no email confirmation)
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role: role || 'viewer' }
    })

    if (authError) {
      console.error('createUser authError:', JSON.stringify(authError))
      return new Response(JSON.stringify({ error: authError.message, detail: authError.status || authError.code || '' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const userId = authData.user.id

    // Step 2: Update profile (trigger handle_new_user already inserted a basic profile)
    const { error: profileError } = await adminClient.from('profiles').upsert({
      id: userId,
      email,
      full_name,
      role: role || 'viewer',
      org_level: org_level || 'central',
      org_unit: org_unit || '',
      allowed_pages: allowed_pages || null
    })

    if (profileError) {
      console.error('createUser profileError:', JSON.stringify(profileError))
      return new Response(JSON.stringify({ error: 'Профіль не створено: ' + profileError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ success: true, user_id: userId }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
