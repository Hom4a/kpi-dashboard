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

Impact: profile fetch fails for fresh logins → some downstream
features may be partially broken. NOT blocking summary tab
functionality (v_summary_indicators returns 56 rows correctly,
indicators-loader receives 49 active codes correctly).

Decision: deferred. Address after pipeline stable.
Out of scope for current sub-step 5.3.x.
