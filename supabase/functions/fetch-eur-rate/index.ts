// ===== Fetch EUR/UAH Rate from NBU API =====
// Автоматичне отримання курсу євро з API НБУ
//
// Deploy: supabase functions deploy fetch-eur-rate
// Schedule: set up cron in Supabase Dashboard → Database → Extensions → pg_cron
//   SELECT cron.schedule('daily-eur-rate', '0 10 * * *',
//     $$SELECT net.http_post('https://<project>.supabase.co/functions/v1/fetch-eur-rate',
//       '{}', 'application/json',
//       ARRAY[net.http_header('Authorization', 'Bearer <service_role_key>')])$$);

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const NBU_API_URL = 'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=EUR&json'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Fetch EUR rate from NBU
    const nbuRes = await fetch(NBU_API_URL)
    if (!nbuRes.ok) {
      throw new Error(`NBU API returned ${nbuRes.status}`)
    }

    const nbuData = await nbuRes.json()
    if (!nbuData || !nbuData.length) {
      throw new Error('Empty response from NBU API')
    }

    const eurRate = nbuData[0]
    const rateDate = eurRate.exchangedate.split('.').reverse().join('-') // DD.MM.YYYY → YYYY-MM-DD
    const eurUah = eurRate.rate

    // Save to database
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Upsert: update if date exists, insert if not
    const { data, error } = await supabase
      .from('eur_rates')
      .upsert(
        {
          rate_date: rateDate,
          eur_uah: eurUah,
          upload_batch_id: crypto.randomUUID(),
        },
        { onConflict: 'rate_date' }
      )
      .select()

    if (error) {
      // If upsert fails (no unique constraint), try delete + insert
      await supabase.from('eur_rates').delete().eq('rate_date', rateDate)
      const { error: insertErr } = await supabase.from('eur_rates').insert({
        rate_date: rateDate,
        eur_uah: eurUah,
        upload_batch_id: crypto.randomUUID(),
      })
      if (insertErr) throw insertErr
    }

    return new Response(
      JSON.stringify({
        success: true,
        rate_date: rateDate,
        eur_uah: eurUah,
        source: 'NBU API',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
