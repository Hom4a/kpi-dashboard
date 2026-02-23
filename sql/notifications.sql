-- ============================================================
-- Notification Settings: налаштування сповіщень
-- Telegram bot, email alerts, пороги для алертів
--
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Таблиця налаштувань сповіщень
CREATE TABLE IF NOT EXISTS notification_settings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    channel text NOT NULL CHECK (channel IN ('telegram', 'email')),
    is_enabled boolean DEFAULT false,
    config jsonb NOT NULL DEFAULT '{}',
    -- config structure:
    -- telegram: { "bot_token": "...", "chat_id": "...", "thread_id": null }
    -- email: { "smtp_host": "...", "smtp_port": 587, "from": "...", "to": ["..."] }
    thresholds jsonb NOT NULL DEFAULT '{
        "plan_execution_min_pct": 80,
        "zsu_fulfillment_min_pct": 50,
        "inventory_min_days": 30,
        "stale_data_days": 7
    }',
    notify_on_upload boolean DEFAULT true,
    notify_on_anomaly boolean DEFAULT true,
    notify_on_threshold boolean DEFAULT true,
    created_by uuid REFERENCES auth.users(id),
    updated_at timestamptz DEFAULT now()
);

-- RLS: тільки admin може читати/змінювати
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_manage_notifications" ON notification_settings;
CREATE POLICY "admin_manage_notifications" ON notification_settings
    FOR ALL TO authenticated
    USING (public.user_has_role(ARRAY['admin']))
    WITH CHECK (public.user_has_role(ARRAY['admin']));

-- 2. Таблиця логу сповіщень
CREATE TABLE IF NOT EXISTS notification_log (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    channel text NOT NULL,
    message text NOT NULL,
    status text NOT NULL CHECK (status IN ('sent', 'failed', 'pending')),
    error_message text,
    metadata jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now()
);

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_notification_log" ON notification_log;
CREATE POLICY "admin_read_notification_log" ON notification_log
    FOR SELECT TO authenticated
    USING (public.user_has_role(ARRAY['admin']));

-- Індекси
CREATE INDEX IF NOT EXISTS idx_notification_log_channel ON notification_log(channel, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_log_status ON notification_log(status, created_at DESC);

-- 3. RPC для отримання налаштувань і логу
CREATE OR REPLACE FUNCTION get_notification_settings()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT json_build_object(
        'settings', (
            SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
            FROM (
                SELECT id, channel, is_enabled, config, thresholds,
                    notify_on_upload, notify_on_anomaly, notify_on_threshold, updated_at
                FROM notification_settings
                ORDER BY channel
            ) t
        ),
        'recentLog', (
            SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
            FROM (
                SELECT id, channel, message, status, error_message, created_at
                FROM notification_log
                ORDER BY created_at DESC
                LIMIT 20
            ) t
        )
    );
$$;

-- ============================================================
-- Перевірка:
-- SELECT get_notification_settings();
-- ============================================================
