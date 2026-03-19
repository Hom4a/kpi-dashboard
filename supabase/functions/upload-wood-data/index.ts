// ===== Upload Wood Data — Edge Function for ЕОД automation =====
// Receives wood reception/sales data from Python script and stores in Supabase.
// Auth: API key in x-api-key header (matches SUPABASE_ANON_KEY or custom secret).
//
// Deploy: supabase functions deploy upload-wood-data --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Auth: accept either Authorization bearer or x-api-key
    const apiKey = req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ', '')
    const expectedKey = Deno.env.get('EOD_API_KEY') || serviceRoleKey

    if (!apiKey || (apiKey !== expectedKey && apiKey !== serviceRoleKey)) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })

    const body = await req.json()
    const { type, period_start, period_end, rows } = body

    if (!type || !period_start || !period_end || !rows?.length) {
      return json({ error: 'Missing required fields: type, period_start, period_end, rows' }, 400)
    }

    if (type !== 'reception' && type !== 'sales') {
      return json({ error: 'Invalid type. Must be "reception" or "sales"' }, 400)
    }

    const table = type === 'reception' ? 'wood_reception' : 'wood_sales'
    const batchId = crypto.randomUUID()

    // Delete existing data for this period
    await adminClient.from(table)
      .delete()
      .eq('period_start', period_start)
      .eq('period_end', period_end)

    // Insert new data
    const dbRows = rows.map((r: Record<string, unknown>) => ({
      ...r,
      period_start,
      period_end,
      upload_batch_id: batchId,
      uploaded_at: new Date().toISOString()
    }))

    const { error: insertError } = await adminClient.from(table).insert(dbRows)
    if (insertError) {
      return json({ error: 'Insert failed: ' + insertError.message }, 500)
    }

    // Record upload history
    await adminClient.from('wood_upload_history').insert({
      data_type: type,
      batch_id: batchId,
      file_name: `eod-sync-${type}`,
      period_start,
      period_end,
      row_count: rows.length
    })

    return json({ success: true, type, rows: rows.length, batch_id: batchId })

  } catch (e) {
    return json({ error: e.message }, 500)
  }
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
