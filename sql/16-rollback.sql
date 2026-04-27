-- ============================================================================
-- Migration 16 ROLLBACK: restore av.raw_text in animals branch
-- ============================================================================
-- Reverts v_summary_indicators to the post-15 form (Branch 5 carries
-- av.raw_text in value_text, restoring the original — and buggy —
-- behaviour that triggers the frontend dual-axis chart for animals.
-- Use only if migration 16 introduces an unexpected regression.
-- ============================================================================

BEGIN;

DROP VIEW IF EXISTS v_summary_indicators CASCADE;

-- Recreate view in post-15 form (animals branch carries av.raw_text)
CREATE VIEW v_summary_indicators AS
-- Branch 1: indicator_values (scalar)
SELECT
    iv.period_year AS year,
    iv.period_month AS month,
    CASE b.id
        WHEN 'M_FIN'  THEN 'finance'
        WHEN 'M_REV'  THEN 'revenue'
        WHEN 'M_PROD' THEN 'production'
        WHEN 'M_FOR'  THEN 'forestry'
        WHEN 'M_TAX'  THEN 'tax'
    END AS indicator_group,
    i.canonical_name AS indicator_name,
    'value'::text AS sub_type,
    iv.value_numeric,
    iv.value_text,
    i.unit,
    i.code AS indicator_code,
    i.id AS indicator_id
FROM indicator_values iv
JOIN indicators i ON i.id = iv.indicator_id
JOIN blocks     b ON b.id = i.block_id
WHERE i.active = TRUE

UNION ALL

-- Branch 2: indicator_volprice_values (vol/price composites)
SELECT
    ivp.period_year,
    ivp.period_month,
    CASE b.id
        WHEN 'M_REV'  THEN 'revenue'
        WHEN 'M_PROD' THEN 'production'
    END,
    i.canonical_name,
    'value'::text,
    ivp.volume,
    ivp.raw_text,
    i.unit,
    i.code,
    i.id
FROM indicator_volprice_values ivp
JOIN indicators i ON i.id = ivp.indicator_id
JOIN blocks     b ON b.id = i.block_id
WHERE i.active = TRUE

UNION ALL

-- Branch 3: salary_values by branch
SELECT
    sv.period_year, sv.period_month,
    'salary_by_branch'::text,
    sb.canonical_name, 'value'::text,
    sv.salary_uah, NULL::text, 'грн'::text,
    sb.code, sb.id
FROM salary_values sv
JOIN salary_branches sb ON sb.id = sv.branch_id
WHERE sv.salary_uah IS NOT NULL

UNION ALL

-- Branch 4: salary_values region twin
SELECT
    sv.period_year, sv.period_month,
    'region_salary'::text,
    sb.canonical_name, 'value'::text,
    sv.region_avg_uah, NULL::text, 'грн'::text,
    'region__' || sb.code, sb.id
FROM salary_values sv
JOIN salary_branches sb ON sb.id = sv.branch_id
WHERE sv.region_avg_uah IS NOT NULL

UNION ALL

-- Branch 5: animals (post-15 form, carries av.raw_text)
SELECT
    av.period_year, 0 AS month,
    'animals'::text,
    sp.canonical_name, 'value'::text,
    av.population::numeric, av.raw_text, NULL::text,
    sp.code, sp.id
FROM animal_values av
JOIN animal_species sp ON sp.id = av.species_id

UNION ALL

-- Branch 6: reference text
SELECT
    period_year, period_month,
    'reference'::text,
    category, 'value'::text,
    NULL::numeric, content, NULL::text,
    category, NULL::uuid
FROM reference_text;

GRANT SELECT ON v_summary_indicators TO anon, authenticated;

COMMIT;
