-- ============================================================================
-- Migration 16: Fix animals chart misclassification as volume/price
-- ============================================================================
--
-- Problem: v_summary_indicators branch #5 (animals) populates value_text
-- with av.raw_text (e.g. "Козуля 1234/*"). The frontend infographic-modal
-- uses regex /[\/(][\d,.]+/ on value_text to decide between single-bar and
-- dual-axis (volume+price) chart templates. The slash in raw_text triggers
-- the dual-axis path with hardcoded labels "Об'єм, тис. м3" and
-- "Сер. ціна, грн/м3" — meaningless for animal population data.
--
-- Quick fix: pass NULL::text for animals branch value_text. The audit/raw
-- text is still preserved in animal_values.raw_text (the underlying table)
-- for admin purposes — only the public view hides it from the chart classifier.
--
-- Real fix (deferred): make frontend use indicators.value_kind explicitly,
-- not regex on value_text. Documented as TODO in STATE.md.
-- ============================================================================

BEGIN;

DROP VIEW IF EXISTS v_summary_indicators CASCADE;

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

-- Branch 5: animals — FIX: NULL::text instead of av.raw_text
-- This prevents frontend regex isVolPrice() from misclassifying animals
-- as volume/price composites. Raw audit-text is still available in the
-- underlying animal_values.raw_text for admin queries.
SELECT
    av.period_year, 0 AS month,
    'animals'::text,
    sp.canonical_name, 'value'::text,
    av.population::numeric,
    NULL::text,                  -- was: av.raw_text
    NULL::text,
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
