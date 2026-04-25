-- ============================================================================
-- Migration 15: Rename indicator codes to Python-style with unit suffixes,
--               add fact_revisions table for full revision history.
-- ============================================================================
-- Rationale:
--   (a) Align BD-side indicator.code with the Python ETL vocabulary
--       (etl/metrics.py::METRIC_ALIASES). Codes now carry their measurement
--       unit in the suffix (_mln, _grn, _km3, _ha, _pcs) — matches the
--       data-contract defined in AUDIT.md and ZVEDENA_DATA_FIRST.md.
--   (b) Introduce fact_revisions: append-only polymorphic ledger that stores
--       every version of every fact the ETL ever saw, with vintage/priority
--       metadata. Canonical winner is flagged is_canonical=TRUE and its value
--       is ALSO written into the 5 existing fact tables (which the UI reads).
--   (c) Expose v_admin_revisions — readable joined view of current canonical
--       vs previous version, for the admin panel.
--
-- Safe reverse: sql/15-rollback.sql
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- STEP 1: Preserve existing codes in a ``legacy_code`` column.
-- ----------------------------------------------------------------------------

ALTER TABLE indicators ADD COLUMN IF NOT EXISTS legacy_code TEXT;

-- Seed legacy_code from current code (one-time snapshot).
UPDATE indicators SET legacy_code = code WHERE legacy_code IS NULL;

-- ----------------------------------------------------------------------------
-- STEP 2: Delete duplicate fact rows for codes that are about to be
--         deactivated. These rows duplicate the same (year, month, value)
--         under the main-block twin (e.g. tax_cash == cash_balance = 285.4).
--         Verified by live query before migration; see header comment.
-- ----------------------------------------------------------------------------

DELETE FROM indicator_values iv
 USING indicators i
 WHERE iv.indicator_id = i.id
   AND i.code IN (
       'tax_arrears_budget',
       'tax_arrears_pf',
       'tax_debt_debit',
       'tax_debt_credit',
       'tax_cash'
   );

-- ----------------------------------------------------------------------------
-- STEP 3: Rename codes. ``code`` is UNIQUE — new codes are guaranteed to be
--         free (none of them exist in the DB today; verified).
--         ``headcount`` / ``processing_conifer`` / ``processing_oak`` /
--         ``processing_other`` / ``vp_birch`` / ``vp_pine`` / ``vp_oak`` /
--         ``vp_other`` are intentionally left unchanged.
-- ----------------------------------------------------------------------------

UPDATE indicators SET code = 'fin_stability_coef'           WHERE code = 'fin_coef';
UPDATE indicators SET code = 'payroll_fund_mln'             WHERE code = 'fop';
UPDATE indicators SET code = 'avg_salary_grn'               WHERE code = 'salary_avg';
UPDATE indicators SET code = 'receivables_mln'              WHERE code = 'debt_debit';
UPDATE indicators SET code = 'payables_mln'                 WHERE code = 'debt_credit';
UPDATE indicators SET code = 'cash_balance_mln'             WHERE code = 'cash_balance';
UPDATE indicators SET code = 'budget_overdue_mln'           WHERE code = 'arrears_budget';
UPDATE indicators SET code = 'pf_overdue_mln'               WHERE code = 'arrears_pf';

UPDATE indicators SET code = 'revenue_total_mln'            WHERE code = 'total_sales';
UPDATE indicators SET code = 'revenue_roundwood_mln'        WHERE code = 'sales_round';
UPDATE indicators SET code = 'revenue_processing_mln'       WHERE code = 'sales_processed';
UPDATE indicators SET code = 'revenue_other_mln'            WHERE code = 'sales_other';
UPDATE indicators SET code = 'revenue_export_mln'           WHERE code = 'export_sales';
UPDATE indicators SET code = 'revenue_per_employee_grn'     WHERE code = 'per_employee';

UPDATE indicators SET code = 'processing_volume_km3'        WHERE code = 'processing_vol';
UPDATE indicators SET code = 'sale_roundwood_km3'           WHERE code = 'vol_round';
UPDATE indicators SET code = 'sale_roundwood_price_grn'     WHERE code = 'price_round';
UPDATE indicators SET code = 'sale_pv_firewood_km3'         WHERE code = 'vol_firewood_pv';
UPDATE indicators SET code = 'sale_pv_firewood_price_grn'   WHERE code = 'price_firewood_pv';
UPDATE indicators SET code = 'sale_np_firewood_km3'         WHERE code = 'vol_firewood_np';
UPDATE indicators SET code = 'sale_np_firewood_price_grn'   WHERE code = 'price_firewood_np';
UPDATE indicators SET code = 'avg_unit_price_grn'           WHERE code = 'price_avg_wood';

UPDATE indicators SET code = 'harvest_total_km3'            WHERE code = 'harvest_total';
UPDATE indicators SET code = 'harvest_main_km3'             WHERE code = 'harvest_main';
UPDATE indicators SET code = 'harvest_care_km3'             WHERE code = 'harvest_shaping';
UPDATE indicators SET code = 'reforestation_ha'             WHERE code = 'reforestation';
UPDATE indicators SET code = 'afforestation_ha'             WHERE code = 'afforestation';
UPDATE indicators SET code = 'natural_regen_ha'             WHERE code = 'natural_regen';
UPDATE indicators SET code = 'seedlings_mln_pcs'            WHERE code = 'seedlings';

UPDATE indicators SET code = 'tax_total_mln'                WHERE code = 'tax_total';
UPDATE indicators SET code = 'tax_esv_mln'                  WHERE code = 'tax_esv';
UPDATE indicators SET code = 'tax_rent_mln'                 WHERE code = 'tax_rent';
UPDATE indicators SET code = 'tax_vat_mln'                  WHERE code = 'tax_vat';
UPDATE indicators SET code = 'tax_profit_mln'               WHERE code = 'tax_profit';
UPDATE indicators SET code = 'tax_pdfo_mln'                 WHERE code = 'tax_pdfo';
UPDATE indicators SET code = 'tax_vz_mln'                   WHERE code = 'tax_vz';
UPDATE indicators SET code = 'tax_land_mln'                 WHERE code = 'tax_land';
UPDATE indicators SET code = 'tax_dividends_mln'            WHERE code = 'tax_dividends';
UPDATE indicators SET code = 'tax_other_mln'                WHERE code = 'tax_other';

-- ----------------------------------------------------------------------------
-- STEP 4: Deactivate tax-block duplicates (same metric, main-block twin owns
--         the data). fn_upload_monthly_batch must ignore inactive rows; this
--         is enforced by the v_summary_indicators filter below.
-- ----------------------------------------------------------------------------

UPDATE indicators SET active = FALSE
 WHERE code IN (
    'tax_arrears_budget',
    'tax_arrears_pf',
    'tax_debt_debit',
    'tax_debt_credit',
    'tax_cash'
 );

-- ----------------------------------------------------------------------------
-- STEP 5: Refresh v_summary_indicators to honour indicators.active.
--         Source SQL identical to sql/10-fix-monthly-view.sql with the single
--         addition of ``WHERE i.active = TRUE`` in the scalar/volprice branches.
-- ----------------------------------------------------------------------------

DROP VIEW IF EXISTS v_summary_indicators CASCADE;

CREATE VIEW v_summary_indicators AS
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

SELECT
    av.period_year, 0 AS month,
    'animals'::text,
    sp.canonical_name, 'value'::text,
    av.population::numeric, av.raw_text, NULL::text,
    sp.code, sp.id
FROM animal_values av
JOIN animal_species sp ON sp.id = av.species_id

UNION ALL

SELECT
    period_year, period_month,
    'reference'::text,
    category, 'value'::text,
    NULL::numeric, content, NULL::text,
    category, NULL::uuid
FROM reference_text;

GRANT SELECT ON v_summary_indicators TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- STEP 6: fact_revisions — append-only ledger of every fact version ever seen.
--         Polymorphic: exactly one of (indicator_id | branch_id | species_id |
--         category) is populated per row, picked by fact_kind.
-- ----------------------------------------------------------------------------

CREATE TABLE fact_revisions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Discriminator: chooses which reference column is meaningful
    fact_kind           TEXT NOT NULL CHECK (fact_kind IN (
                            'annual',           -- indicator_id + year
                            'monthly',          -- indicator_id + year + month
                            'species_annual',   -- indicator_id (vp_*) + year, or species_id + year
                            'species_monthly',  -- same + month
                            'salary',           -- branch_id + year + month
                            'animal',           -- species_id + year
                            'reference'         -- category + year + month
                        )),

    -- Polymorphic references (exactly one populated per kind)
    indicator_id        UUID REFERENCES indicators(id)       ON DELETE RESTRICT,
    branch_id           UUID REFERENCES salary_branches(id)  ON DELETE RESTRICT,
    species_id          UUID REFERENCES animal_species(id)   ON DELETE RESTRICT,
    category            TEXT,                               -- for reference

    -- Period
    period_year         INT NOT NULL,
    -- Convention: period_month = 0 means annual snapshot (no NULLs).
    -- Matches indicator_values.period_month / salary_values.period_month etc.
    period_month        INT NOT NULL CHECK (period_month BETWEEN 0 AND 13),

    -- Value slots (which ones are populated depends on fact_kind)
    value_numeric       NUMERIC,
    value_text          TEXT,
    volume_km3          NUMERIC,      -- species_* / volprice
    avg_price_grn       NUMERIC,      -- species_* / volprice
    salary_uah          NUMERIC,      -- salary
    region_avg_uah      NUMERIC,      -- salary (region twin)
    population          INT,          -- animal
    limit_qty           INT,          -- animal
    raw_text            TEXT,         -- composite cells verbatim

    -- Revision metadata
    vintage_date        TIMESTAMPTZ NOT NULL,
    report_type         TEXT NOT NULL CHECK (report_type IN (
                            'operational',
                            'accounting_ytd',
                            'official_annual',
                            'audit',
                            'interim'
                        )),
    source_priority     INT NOT NULL,
    source_file         TEXT,
    source_row          INT,

    -- Lifecycle flags
    is_canonical        BOOLEAN NOT NULL DEFAULT FALSE,
    superseded_at       TIMESTAMPTZ,    -- set when this row loses canonical status

    -- Batch tracking
    upload_batch_id     UUID,
    ingested_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Integrity: exactly one reference populated per kind
    CONSTRAINT ck_fact_ref_exclusive CHECK (
        (fact_kind IN ('annual','monthly','species_annual','species_monthly')
            AND indicator_id IS NOT NULL
            AND branch_id IS NULL AND species_id IS NULL AND category IS NULL)
     OR (fact_kind = 'salary'
            AND branch_id IS NOT NULL
            AND indicator_id IS NULL AND species_id IS NULL AND category IS NULL)
     OR (fact_kind = 'animal'
            AND species_id IS NOT NULL
            AND indicator_id IS NULL AND branch_id IS NULL AND category IS NULL)
     OR (fact_kind = 'reference'
            AND category IS NOT NULL
            AND indicator_id IS NULL AND branch_id IS NULL AND species_id IS NULL)
    )
);

-- Lookup indexes
CREATE INDEX idx_fr_kind_period         ON fact_revisions (fact_kind, period_year, period_month);
CREATE INDEX idx_fr_indicator_period    ON fact_revisions (indicator_id, period_year, period_month) WHERE indicator_id IS NOT NULL;
CREATE INDEX idx_fr_branch_period       ON fact_revisions (branch_id, period_year, period_month)   WHERE branch_id IS NOT NULL;
CREATE INDEX idx_fr_species_period      ON fact_revisions (species_id, period_year)                 WHERE species_id IS NOT NULL;
CREATE INDEX idx_fr_canonical           ON fact_revisions (is_canonical) WHERE is_canonical = TRUE;
CREATE INDEX idx_fr_vintage             ON fact_revisions (vintage_date);
CREATE INDEX idx_fr_batch               ON fact_revisions (upload_batch_id);

-- Grants (write via psycopg2/service_role only; anon read-only for future admin UI)
GRANT SELECT                         ON fact_revisions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE, SELECT ON fact_revisions TO service_role;

-- ----------------------------------------------------------------------------
-- STEP 7: v_admin_revisions — human-readable "what changed between versions".
--         One row per (entity, period) with current canonical and the
--         previous-by-vintage version + computed delta.
-- ----------------------------------------------------------------------------

-- NOTE: delta_abs / delta_rel below are computed from value_numeric ONLY.
-- For species_* facts (vp_oak etc.), the meaningful fields are volume_km3
-- and avg_price_grn — these surface in current_*/previous_* columns so the
-- admin can compare visually, but no automatic delta is computed for them.
-- TODO: extend with delta_volume_abs / delta_price_abs in a future migration
-- when the admin UI starts highlighting species-level changes.
CREATE OR REPLACE VIEW v_admin_revisions AS
WITH ranked AS (
    SELECT
        fr.*,
        -- Entity key: whichever ref is populated (indicator_id::text /
        -- branch_id::text / species_id::text / category)
        COALESCE(
            fr.indicator_id::text,
            fr.branch_id::text,
            fr.species_id::text,
            fr.category
        ) AS entity_key,
        ROW_NUMBER() OVER (
            PARTITION BY
                fr.fact_kind,
                COALESCE(fr.indicator_id::text, fr.branch_id::text, fr.species_id::text, fr.category),
                fr.period_year,
                COALESCE(fr.period_month, -1)
            ORDER BY fr.vintage_date DESC, fr.source_priority DESC
        ) AS version_rank
    FROM fact_revisions fr
)
SELECT
    cur.fact_kind,
    COALESCE(i.code,  sb.code, sp.code, cur.category)           AS entity_code,
    COALESCE(i.canonical_name, sb.canonical_name, sp.canonical_name, cur.category)
                                                                AS entity_name,
    cur.period_year,
    cur.period_month,

    -- Canonical (current) version
    cur.value_numeric                                           AS current_canonical_value,
    cur.volume_km3                                              AS current_volume_km3,
    cur.avg_price_grn                                           AS current_avg_price_grn,
    cur.source_file                                             AS canonical_source,
    cur.vintage_date                                            AS canonical_vintage,
    cur.report_type                                             AS canonical_report_type,
    cur.source_priority                                         AS canonical_priority,

    -- Previous version (if any)
    prev.value_numeric                                          AS previous_value,
    prev.volume_km3                                             AS previous_volume_km3,
    prev.avg_price_grn                                          AS previous_avg_price_grn,
    prev.source_file                                            AS previous_source,
    prev.vintage_date                                           AS previous_vintage,
    prev.report_type                                            AS previous_report_type,

    -- Delta (numeric values only)
    (cur.value_numeric - prev.value_numeric)                    AS delta_abs,
    CASE
        WHEN prev.value_numeric IS NOT NULL AND prev.value_numeric <> 0
        THEN (cur.value_numeric - prev.value_numeric) / prev.value_numeric
        ELSE NULL
    END                                                         AS delta_rel
FROM ranked cur
LEFT JOIN ranked prev
       ON prev.fact_kind = cur.fact_kind
      AND prev.entity_key = cur.entity_key
      AND prev.period_year = cur.period_year
      AND COALESCE(prev.period_month, -1) = COALESCE(cur.period_month, -1)
      AND prev.version_rank = 2
LEFT JOIN indicators      i  ON i.id  = cur.indicator_id
LEFT JOIN salary_branches sb ON sb.id = cur.branch_id
LEFT JOIN animal_species  sp ON sp.id = cur.species_id
WHERE cur.version_rank = 1
  AND cur.is_canonical = TRUE;

GRANT SELECT ON v_admin_revisions TO anon, authenticated;

COMMIT;
