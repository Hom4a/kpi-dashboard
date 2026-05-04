-- Migration 20: partial unique index for fact_revisions WHERE fact_kind='animal'
-- Purpose: idempotent ON CONFLICT DO NOTHING for animals writeback.
-- Pattern matches sql/17 (scalar), sql/18 (reference), sql/19 (salary).
--
-- Animals are annual-only (no period_month) — animal census is published
-- yearly by Мінприроди with a 2-year lag.
--
-- Both population and limit_qty participate in the unique key so that a
-- future revision with the same (species, year, vintage, priority,
-- population) but a different limit value is treated as a distinct row,
-- not a duplicate. Consistent with sql/19 where salary_uah and
-- region_avg_uah both participate.

CREATE UNIQUE INDEX IF NOT EXISTS idx_fact_revisions_unique_animal
ON fact_revisions (
    species_id,
    period_year,
    vintage_date,
    source_priority,
    population,
    limit_qty
)
NULLS NOT DISTINCT
WHERE fact_kind = 'animal';
