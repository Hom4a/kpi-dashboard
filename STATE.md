# Project state — 25.04.2026 (Friday EOD)

## Current sub-step
5.3.1 — SQL migration 15 prepared, awaiting apply.

## Branch
feature/migration-15-revisions @ f472883

## Files ready for apply (NOT applied yet)
- sql/15-rename-codes-and-revisions.sql (382 lines, reviewed)
- sql/15-rollback.sql (134 lines, reviewed)
- sql/backups/README.md (backup/restore procedure)

## What was reviewed and approved
- STEP 5: v_summary_indicators preserves the 6-branch UNION ALL contract;
  only adds WHERE i.active = TRUE
- STEP 6: fact_revisions schema with ck_fact_ref_exclusive CHECK and
  period_month NOT NULL fix applied
- STEP 7: v_admin_revisions with ROW_NUMBER() + self-join on version_rank=2

## Blocker
No VPN access to dashboards.e-forest.gov.ua / 10.0.18.16 from
current network. Resuming Monday 28.04.

## Next steps (in order)
1. Get VPN access
2. Run backup per sql/backups/README.md
3. Verify backup file size + magic bytes
4. Apply migration: docker exec supabase-db psql -U postgres -f /tmp/15.sql
5. NOTIFY pgrst, 'reload schema'
6. Run 5 verification queries (expected results documented in chat)
7. Visual check at dashboards.e-forest.gov.ua → "Зведена" tab
8. Sub-step 5.3.2: Python Repository layer

## Completed sub-steps so far
- 1-4: Python ETL with canonical + derived + revisions (170 tests green)
- 5.1: Frontend reconnaissance (Vite + Supabase Postgres confirmed)
- 5.2-discovery: DB schema mapped (5 fact tables + dim tables + RPC)
- 5.3.1: SQL migration prepared (this session)

## Reference docs
- AUDIT.md — full audit
- ZVEDENA_DATA_FIRST.md — original 5-step plan
- CLAUDE.md — Claude Code working rules

## Pre-existing frontend issues — NOT caused by migration 15

Discovered during post-apply visual check (28.04.2026).
All confirmed pre-existing via grep + git log + DB inspection.
Tracking here so future sessions don't conflate them with our work.

1. js/auth.js: ReferenceError 'freshProfile is not defined'
   at line 186 — undefined variable in fresh-login flow
2. RLS infinite recursion on public.profiles — policy
   self-references its own table
3. RPC get_executive_metrics() — called from frontend,
   does not exist in DB (404)
4. ~Generic chart modal misuses template for animals~ —
   FIXED via migration 16 (NULL::text in view).
   Real fix (frontend uses indicators.value_kind directly) deferred.
   See sql/16-fix-animals-chart-bug.sql header for context.
5. Reference category modal renders empty chart (value_numeric is
   always NULL — text content cannot be charted). Frontend should
   skip modal opening for indicator_group='reference' or render
   text-only info card. Deferred to post-pipeline UI rework.
6. v_admin_revisions ORDER BY clause is wrong: uses
   ``vintage_date DESC, source_priority DESC`` but the design
   contract (set in step 4.5) is priority-first, vintage as tie-
   breaker. Edge case: an operational report with newer vintage
   would falsely win over an earlier accounting_ytd close.
   Python repository (etl/db/) uses correct order
   (priority DESC, vintage DESC). Fix via migration 17 — recreate
   v_admin_revisions with swapped ORDER BY. Discovered during
   sub-step 5.3.2 review.

Impact: profile fetch fails for fresh logins → some downstream
features may be partially broken. NOT blocking summary tab
functionality (v_summary_indicators returns 56 rows correctly,
indicators-loader receives 49 active codes correctly).

Decision: deferred. Address after pipeline stable.
Out of scope for current sub-step 5.3.x.

## Sub-step 5.3.4 — Reference text propagation (DONE)

Завершено 28.04.2026. Reference block ("Довідково") тепер парситься,
canonical-резолвиться, пишеться через write_batch у reference_text.

- 14 slug-категорій (subsistence_minimum, min_wage, country_avg_salary,
  electricity_population/business, gas_population/business,
  fuel_diesel/a95/a92, food_bread_rye/eggs/pork/lard).
- Migration 18 (idx_fact_revisions_unique_reference) applied.
- 8 tests for extract_reference_block + 4 tests for FakeRepository
  reference branch + 1 test for CLI summary + golden YAML expansions.
- Both parsers (osnovni + annual_monthly) integrated.
- 13 reference rows confirmed on 2025_рік.xlsx and Основні_*_2026.

## Issue 7 (deferred) — canonical_* tie-breaker inconsistency in Python

canonical_reference uses (priority, vintage, source_row) for
deterministic tie-breaks. canonical_annual / canonical_monthly /
canonical_species_* use only (priority, vintage) — same-vintage same-
priority facts give non-deterministic output.

Related to Issue 6 (v_admin_revisions ORDER BY in SQL): both stem
from inconsistent tie-breaker semantics. SQL view and Python
canonical_reference now both use (priority, vintage) — fix Issue 6
SQL side first, then mirror in canonical_annual / monthly / species
to make the entire stack consistent.

Not critical today (production data doesn't hit this case yet),
but warrants refactor when adding next polymorphic entity.
See etl/canonical.py:69-104 for the pattern to apply.
