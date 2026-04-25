-- ============================================================================
-- Rollback for migration 15.
--
-- Reverses:
--   - v_admin_revisions view
--   - fact_revisions table
--   - v_summary_indicators active=TRUE filter (restored to pre-15 form)
--   - indicators.active=FALSE on 5 tax-block duplicates
--   - indicator.code renames (from legacy_code)
--   - indicators.legacy_code column
--
-- NOTE: the 3 rows deleted from indicator_values in STEP 2 of the forward
-- migration (tax_arrears_budget / tax_arrears_pf / tax_cash @ 2022) are
-- NOT restored — they were verified-identical duplicates of main-block
-- twins. If needed, re-ingest from source via fn_upload_monthly_batch.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Drop new objects
-- ----------------------------------------------------------------------------

DROP VIEW IF EXISTS v_admin_revisions;
DROP TABLE IF EXISTS fact_revisions;

-- ----------------------------------------------------------------------------
-- Restore v_summary_indicators to pre-15 form (no active filter)
-- ----------------------------------------------------------------------------

DROP VIEW IF EXISTS v_summary_indicators CASCADE;

CREATE VIEW v_summary_indicators AS
SELECT
    iv.period_year AS year, iv.period_month AS month,
    CASE b.id
        WHEN 'M_FIN'  THEN 'finance'
        WHEN 'M_REV'  THEN 'revenue'
        WHEN 'M_PROD' THEN 'production'
        WHEN 'M_FOR'  THEN 'forestry'
        WHEN 'M_TAX'  THEN 'tax'
    END AS indicator_group,
    i.canonical_name AS indicator_name,
    'value'::text AS sub_type,
    iv.value_numeric, iv.value_text, i.unit,
    i.code AS indicator_code, i.id AS indicator_id
FROM indicator_values iv
JOIN indicators i ON i.id = iv.indicator_id
JOIN blocks     b ON b.id = i.block_id

UNION ALL

SELECT
    ivp.period_year, ivp.period_month,
    CASE b.id WHEN 'M_REV' THEN 'revenue' WHEN 'M_PROD' THEN 'production' END,
    i.canonical_name, 'value'::text,
    ivp.volume, ivp.raw_text, i.unit,
    i.code, i.id
FROM indicator_volprice_values ivp
JOIN indicators i ON i.id = ivp.indicator_id
JOIN blocks     b ON b.id = i.block_id

UNION ALL

SELECT
    sv.period_year, sv.period_month,
    'salary_by_branch'::text,
    sb.canonical_name, 'value'::text,
    sv.salary_uah, NULL::text, 'грн'::text,
    sb.code, sb.id
FROM salary_values sv JOIN salary_branches sb ON sb.id = sv.branch_id
WHERE sv.salary_uah IS NOT NULL

UNION ALL

SELECT
    sv.period_year, sv.period_month,
    'region_salary'::text,
    sb.canonical_name, 'value'::text,
    sv.region_avg_uah, NULL::text, 'грн'::text,
    'region__' || sb.code, sb.id
FROM salary_values sv JOIN salary_branches sb ON sb.id = sv.branch_id
WHERE sv.region_avg_uah IS NOT NULL

UNION ALL

SELECT
    av.period_year, 0 AS month, 'animals'::text,
    sp.canonical_name, 'value'::text,
    av.population::numeric, av.raw_text, NULL::text,
    sp.code, sp.id
FROM animal_values av JOIN animal_species sp ON sp.id = av.species_id

UNION ALL

SELECT
    period_year, period_month, 'reference'::text,
    category, 'value'::text,
    NULL::numeric, content, NULL::text,
    category, NULL::uuid
FROM reference_text;

GRANT SELECT ON v_summary_indicators TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- Re-activate tax-block duplicates
-- ----------------------------------------------------------------------------

UPDATE indicators SET active = TRUE
 WHERE code IN (
    'tax_arrears_budget',
    'tax_arrears_pf',
    'tax_debt_debit',
    'tax_debt_credit',
    'tax_cash'
 );

-- ----------------------------------------------------------------------------
-- Restore original codes from legacy_code snapshot
-- ----------------------------------------------------------------------------

UPDATE indicators
   SET code = legacy_code
 WHERE legacy_code IS NOT NULL
   AND legacy_code <> code;

-- ----------------------------------------------------------------------------
-- Drop legacy_code column
-- ----------------------------------------------------------------------------

ALTER TABLE indicators DROP COLUMN IF EXISTS legacy_code;

COMMIT;
