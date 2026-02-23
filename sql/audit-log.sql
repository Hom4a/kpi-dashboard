-- ============================================================
-- Audit Log: таблиця + тригер для відстеження змін у БД
-- Хто, коли, що змінив — для всіх критичних таблиць
--
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Таблиця аудиту
CREATE TABLE IF NOT EXISTS audit_log (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    table_name text NOT NULL,
    action text NOT NULL,  -- INSERT, UPDATE, DELETE
    record_id uuid,
    old_data jsonb,
    new_data jsonb,
    user_id uuid,
    created_at timestamptz DEFAULT now()
);

-- Індекси для швидкого пошуку
CREATE INDEX IF NOT EXISTS idx_audit_table_date ON audit_log(table_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, created_at DESC);

-- RLS: адміни та едітори бачать аудит, ніхто не може видаляти
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_read_audit" ON audit_log;
CREATE POLICY "admins_read_audit" ON audit_log
    FOR SELECT TO authenticated
    USING (public.user_has_role(ARRAY['admin', 'editor']));

-- Заборонити INSERT/UPDATE/DELETE через клієнт (тільки тригер)
-- Не створюємо політик для INSERT — тригер працює через SECURITY DEFINER

-- 2. Тригер-функція
CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS trigger AS $$
BEGIN
    INSERT INTO audit_log(table_name, action, record_id, old_data, new_data, user_id)
    VALUES (
        TG_TABLE_NAME,
        TG_OP,
        CASE TG_OP
            WHEN 'DELETE' THEN OLD.id
            ELSE NEW.id
        END,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        auth.uid()
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Прикріпити тригери до критичних таблиць
-- KPI
DROP TRIGGER IF EXISTS audit_kpi_records ON kpi_records;
CREATE TRIGGER audit_kpi_records
    AFTER INSERT OR UPDATE OR DELETE ON kpi_records
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- Forest Prices
DROP TRIGGER IF EXISTS audit_forest_prices ON forest_prices;
CREATE TRIGGER audit_forest_prices
    AFTER INSERT OR UPDATE OR DELETE ON forest_prices
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- Forest Inventory
DROP TRIGGER IF EXISTS audit_forest_inventory ON forest_inventory;
CREATE TRIGGER audit_forest_inventory
    AFTER INSERT OR UPDATE OR DELETE ON forest_inventory
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- Harvesting Plan-Fact
DROP TRIGGER IF EXISTS audit_harvesting_plan_fact ON harvesting_plan_fact;
CREATE TRIGGER audit_harvesting_plan_fact
    AFTER INSERT OR UPDATE OR DELETE ON harvesting_plan_fact
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- Harvesting ZSU
DROP TRIGGER IF EXISTS audit_harvesting_zsu ON harvesting_zsu;
CREATE TRIGGER audit_harvesting_zsu
    AFTER INSERT OR UPDATE OR DELETE ON harvesting_zsu
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- Market Prices
DROP TRIGGER IF EXISTS audit_market_prices ON market_prices;
CREATE TRIGGER audit_market_prices
    AFTER INSERT OR UPDATE OR DELETE ON market_prices
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- Market Prices UA
DROP TRIGGER IF EXISTS audit_market_prices_ua ON market_prices_ua;
CREATE TRIGGER audit_market_prices_ua
    AFTER INSERT OR UPDATE OR DELETE ON market_prices_ua
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- Profiles (відстежити зміни ролей)
DROP TRIGGER IF EXISTS audit_profiles ON profiles;
CREATE TRIGGER audit_profiles
    AFTER INSERT OR UPDATE OR DELETE ON profiles
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- ============================================================
-- Перевірка: після завантаження будь-якого файлу
-- SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 20;
-- ============================================================
