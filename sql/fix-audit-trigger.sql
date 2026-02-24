-- ============================================================
-- Fix: audit_log.record_id type mismatch
-- Problem: record_id is UUID but kpi_records.id is TEXT (composite "date|indicator")
-- When audit trigger fires on kpi_records, it crashes with:
--   "column record_id is of type uuid but expression is of type text"
--
-- Solution: Change record_id to TEXT and cast id in trigger function
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Change column type from uuid to text
ALTER TABLE audit_log ALTER COLUMN record_id TYPE text USING record_id::text;

-- 2. Recreate trigger function with explicit text cast
CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS trigger AS $$
BEGIN
    INSERT INTO audit_log(table_name, action, record_id, old_data, new_data, user_id)
    VALUES (
        TG_TABLE_NAME,
        TG_OP,
        CASE TG_OP
            WHEN 'DELETE' THEN OLD.id::text
            ELSE NEW.id::text
        END,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        auth.uid()
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- After running: DELETE/INSERT on kpi_records will work correctly
-- Test: try "Очистити все" for KPI data as editor
-- ============================================================
