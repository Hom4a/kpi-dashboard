-- Rollback for migration 19.
DROP INDEX IF EXISTS idx_fact_revisions_unique_salary;
