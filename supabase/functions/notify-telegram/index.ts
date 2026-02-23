// ===== Telegram Notification Edge Function =====
// Sends alerts via Telegram Bot API
//
// Deploy: supabase functions deploy notify-telegram
// Set secrets:
//   supabase secrets set TELEGRAM_BOT_TOKEN=your_bot_token
//   supabase secrets set TELEGRAM_CHAT_ID=your_chat_id
//
// Invoke: POST /functions/v1/notify-telegram
// Body: { "type": "upload" | "anomaly" | "threshold", "data": { ... } }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface NotifyRequest {
  type: 'upload' | 'anomaly' | 'threshold' | 'custom'
  data: Record<string, unknown>
  message?: string
}

Deno.serve(async (req: Request) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
    const defaultChatId = Deno.env.get('TELEGRAM_CHAT_ID')

    if (!botToken) {
      return new Response(
        JSON.stringify({ error: 'TELEGRAM_BOT_TOKEN not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify auth
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body: NotifyRequest = await req.json()
    const message = body.message || formatMessage(body.type, body.data)

    // Get chat_id from settings or env
    const { data: settings } = await supabaseClient.rpc('get_notification_settings')
    const telegramSettings = settings?.settings?.find((s: Record<string, unknown>) => s.channel === 'telegram')
    const chatId = telegramSettings?.config?.chat_id || defaultChatId

    if (!chatId) {
      return new Response(
        JSON.stringify({ error: 'No chat_id configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Send via Telegram Bot API
    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`
    const telegramRes = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    })

    const telegramResult = await telegramRes.json()

    // Log the notification
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    await adminClient.from('notification_log').insert({
      channel: 'telegram',
      message: message.substring(0, 500),
      status: telegramResult.ok ? 'sent' : 'failed',
      error_message: telegramResult.ok ? null : JSON.stringify(telegramResult.description),
      metadata: { type: body.type, chat_id: chatId, user_id: user.id },
    })

    return new Response(
      JSON.stringify({
        success: telegramResult.ok,
        message_id: telegramResult.result?.message_id,
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

function formatMessage(type: string, data: Record<string, unknown>): string {
  const now = new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' })

  switch (type) {
    case 'upload':
      return [
        `📊 <b>Нове завантаження даних</b>`,
        `Тип: ${data.dataType || '—'}`,
        `Файл: ${data.fileName || '—'}`,
        `Записів: ${data.rowCount || 0}`,
        `Час: ${now}`,
      ].join('\n')

    case 'anomaly':
      return [
        `⚠️ <b>Виявлено аномалію</b>`,
        `Тип: ${data.kpiType || '—'}`,
        `Значення: ${data.value || 0}`,
        `Середнє: ${data.average || 0}`,
        `Відхилення: ${data.zScore || 0}σ`,
        `Дата: ${data.date || now}`,
      ].join('\n')

    case 'threshold':
      return [
        `🔴 <b>Порогове значення перевищено</b>`,
        `${data.metric || '—'}: ${data.value || 0}%`,
        `Поріг: ${data.threshold || 0}%`,
        `Регіон: ${data.region || 'Всі'}`,
        `Час: ${now}`,
      ].join('\n')

    default:
      return `ℹ️ <b>KPI Dashboard</b>\n${JSON.stringify(data)}\nЧас: ${now}`
  }
}
