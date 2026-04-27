-- Migration 17: Idempotency unique-key for fact_revisions.
--
-- Why: PostgresRepository.write_batch may be re-run with the same WriteBatch
-- (e.g. retry on transient failure). Without a unique key on
-- fact_revisions, a re-run inserts duplicate revision rows for the same
-- canonical fact identity, polluting history and inflating ledger size.
--
-- Idempotency contract: a revision is uniquely identified by
--   (indicator_id, period_year, period_month, vintage_date, source_priority)
-- plus the value column appropriate to its kind. ``source_file`` /
-- ``source_row`` are audit metadata, NOT part of identity — re-uploading
-- the same content from a different filename must be a no-op.
--
-- NULLS NOT DISTINCT (PG15+) ensures NULL == NULL inside the unique check —
-- needed because value_numeric is NULL for text-only facts (value_text path)
-- and we still want one revision per (entity, period, vintage, priority).
--
-- Partial indexes per kind: salary/animal/reference revisions are not
-- yet written from Python — leave them unconstrained until those code paths
-- exist (avoids accidental over-constraining of legacy backfill).

BEGIN;

CREATE UNIQUE INDEX idx_fact_revisions_unique_scalar
ON fact_revisions (
    indicator_id, period_year, period_month,
    vintage_date, source_priority, value_numeric
)
NULLS NOT DISTINCT
WHERE fact_kind IN ('annual', 'monthly');

CREATE UNIQUE INDEX idx_fact_revisions_unique_species
ON fact_revisions (
    indicator_id, period_year, period_month,
    vintage_date, source_priority, volume_km3, avg_price_grn
)
NULLS NOT DISTINCT
WHERE fact_kind IN ('species_annual', 'species_monthly');

COMMIT;
