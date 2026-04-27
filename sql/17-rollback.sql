-- Rollback for migration 17: drop the partial unique indexes.

BEGIN;

DROP INDEX IF EXISTS idx_fact_revisions_unique_scalar;
DROP INDEX IF EXISTS idx_fact_revisions_unique_species;

COMMIT;
