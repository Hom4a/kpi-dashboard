-- ============================================================================
-- Migration 18: Partial unique index for fact_revisions reference rows.
-- ============================================================================
--
-- Mirrors migration 17 (scalar / species) for the third polymorphic branch:
--   fact_kind = 'reference'.
--
-- Why: _bulk_insert_revisions in PostgresRepository uses ON CONFLICT DO
-- NOTHING for idempotency. Without a unique index covering the reference
-- shape, retries of the same WriteBatch silently accumulate duplicate
-- revision rows.
--
-- Key:  (category, period_year, period_month, vintage_date,
--        source_priority, value_text)
--
-- value_text participates because two distinct content snapshots at the
-- same vintage/priority must each live as a separate revision (e.g. a
-- typo fix landing later as a new revision).
--
-- NULLS NOT DISTINCT (Postgres 15+) — NULL == NULL for unique purposes.
-- ============================================================================

BEGIN;

CREATE UNIQUE INDEX idx_fact_revisions_unique_reference
ON fact_revisions (
    category, period_year, period_month,
    vintage_date, source_priority, value_text
)
NULLS NOT DISTINCT
WHERE fact_kind = 'reference';

COMMIT;
