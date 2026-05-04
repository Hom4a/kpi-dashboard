-- Migration 19: partial unique index for fact_revisions WHERE fact_kind='salary'
-- Purpose: idempotent ON CONFLICT DO NOTHING for salary writeback.
-- Pattern matches sql/17 (scalar) and sql/18 (reference).
--
-- region_avg_uah is included in the unique key so that a future revision
-- with the same (branch, year, month, vintage, priority, salary_uah) but
-- a different region figure is treated as a distinct row, not a duplicate.
-- Consistency with sql/18 where value_text is part of the unique key.

CREATE UNIQUE INDEX IF NOT EXISTS idx_fact_revisions_unique_salary
ON fact_revisions (
    branch_id,
    period_year,
    period_month,
    vintage_date,
    source_priority,
    salary_uah,
    region_avg_uah
)
NULLS NOT DISTINCT
WHERE fact_kind = 'salary';

-- Smoke: verify index appears in pg_indexes after apply.
-- SELECT indexname FROM pg_indexes
--  WHERE indexname = 'idx_fact_revisions_unique_salary';
