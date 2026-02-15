-- ===== KPI Batch Tracking Migration =====
-- Run this in Supabase SQL Editor AFTER the previous migrations

-- 1. Add upload_batch_id column to kpi_records
ALTER TABLE kpi_records ADD COLUMN IF NOT EXISTS upload_batch_id UUID;

-- 2. Create index for batch-based queries
CREATE INDEX IF NOT EXISTS idx_kpi_records_batch ON kpi_records(upload_batch_id);

-- 3. Update forest_upload_history CHECK constraint to include 'kpi'
ALTER TABLE forest_upload_history DROP CONSTRAINT IF EXISTS forest_upload_history_data_type_check;
ALTER TABLE forest_upload_history ADD CONSTRAINT forest_upload_history_data_type_check
    CHECK (data_type IN ('prices', 'inventory', 'harvesting_plan_fact', 'harvesting_zsu', 'kpi'));

-- 4. Allow delete on forest_upload_history (for undo operations)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'forest_upload_history'
        AND policyname = 'Authenticated users can delete forest_upload_history'
    ) THEN
        CREATE POLICY "Authenticated users can delete forest_upload_history"
            ON forest_upload_history FOR DELETE
            TO authenticated
            USING (true);
    END IF;
END $$;
