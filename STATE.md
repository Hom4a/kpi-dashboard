# Project State
## ETL Pipeline + Frontend Dashboard for ДП Ліси України

**Last updated:** 2026-05-06
**Working branch:** feature/admin-panel ahead of master +13 commits (Phase 2 backend + frontend complete)
**Active epic:** ADMIN_EPIC.md — Phase 2 CLOSED 2026-05-06; Phase 1.5 manual Studio bootstrap + Phase 2.5 MFA pending
**Production state:** Reference resolver live end-to-end + 5-period
archival reference + safety guards on destructive actions + profiles
RLS hardened (circular subquery tech debt closed) + 5 admin Edge
Functions deployed (set-role, disable-user, delete-user, reset-password,
set-mfa-required) + create-user canary deployed + frontend admin UI
з 6 inline buttons per user row у viewerAccessModal

## Recently completed cycles

### 5.4 — Salary writeback (CLOSED 2026-05-04)
- 5.4.1 SalaryValue model + canonical_salary (78fa990)
- 5.4.2 Yearly parser extract_salary_block (b0d7063)
- 5.4.3 Osnovni parser + refactor (8efdbc2, 9bfa5fd)
- 5.4.4.a sql/19 migration applied (9f45c9f)
- 5.4.4.b Interface contract + batch helper (f2bfce5)
- 5.4.4.c branch_resolver normalize mirror (929aeca)
- 5.4.4.d FakeRepository salary write-path (3fe5446)
- 5.4.4.e PostgresRepository salary write-path (5c8c494)
- 5.4.4.f CLI integration + first live writeback (70e9b60)

Production proof: batch d71710f8-9a58-4dce-8513-b15e8e2332dd
- 220 salary fact_revisions (all canonical)
- 220 salary_values rows (18 distinct branches, 100% coverage)
- Architectural invariant verified live: karpatskyi_lo (avg 26886)
  vs branch_karpatskyi_lo (avg 28676) — distinct UUIDs, distinct data

### 5.5 — Animals writeback (CLOSED 2026-05-04)
- 5.5.1 AnimalValue model + canonical_animal (c8167e8)
- 5.5.2 Yearly parser extract_animals_block (9560ff1)
- 5.5.3 Osnovni parser extract_animals_block_osnovni (b798b83)
- 5.5.4 sql/20 migration applied (e4efcfe)
- 5.5.5.a Interface + FakeRepository animal write-path (c1b9200)
- 5.5.5.b PostgresRepository animal + species_resolver (318f64f)
- 5.5.6 CLI integration + first live writeback (e8d7a82)

Production proof: batch 8fd76b9f-0777-4883-bbbc-f3dd2207433c
- 12 animal fact_revisions (all canonical)
- 12 animal_values rows (6 species × 2 closed years 2022-2023)
- Resolver alias mapping verified: 'Олень благор.' → deer_noble UUID
  → canonical 'Олень благородний'

### Frontend tax block cross-render (CLOSED 2026-05-04)
Excel rows 63-67 repeat fin metrics under tax header. Frontend Table 2
now cross-renders 5 M_FIN metrics (budget_overdue_mln, pf_overdue_mln,
receivables_mln, payables_mln, cash_balance_mln) at the bottom of
the tax block. DB stays single source of truth.
- frontend cross-render commit (2230c65)
- Live deployment verified visually 2026-05-04

### 5.6 — Reference category resolver + render fix (CLOSED 2026-05-05)

Goal: web upload through dashboard UI now writes categorized
reference_text identical to Python ETL pipeline. Archival yearly
references (2023, 2024, 2025) load via Python ETL backfill —
frontend renders them correctly per year.

Phase 1 — DB infrastructure (commit 22b6ffe):
- sql/21-reference-aliases-seed.sql + sql/21-rollback.sql
- 2 new tables: reference_section_aliases (4 rows:
  електроенергія/газ/пмм/продукти), reference_category_aliases
  (29 rows = 14 slugs × multiple match patterns).
- 3 new functions: fn_normalize_reference_label (lower + collapse
  whitespace, mirrors Python _norm), fn_detect_section_header
  (returns section_key on startswith match),
  fn_resolve_reference_category (2-stage: section-bullet first,
  top-level fallback).
- Smoke verified: 13/13 production cases (subsistence_minimum,
  min_wage, country_avg_salary, electricity_*, gas_*, fuel_*,
  food_*) match expected slugs. 5/5 section detector cases pass.
- Backup: sql/backups/pre-migration-21_20260504_173557.sql

Phase 2 — RPC update (commit c9e6ba6):
- sql/22-fn-upload-monthly-batch-reference-fix.sql + rollback +
  pre-22 baseline backup (10164 bytes, 241 lines).
- CREATE OR REPLACE FUNCTION fn_upload_monthly_batch with reference
  branch moved to top of per-record loop, BEFORE HEADER_NAMES skip
  (prior version skipped 'Довідково' as a header).
- Per-line processing: split v_text by newline, fn_detect_section_header
  updates current_section, fn_resolve_reference_category(line,
  current_section) → INSERT or skip with c_unresolved_reference
  counter.
- DB-level smoke: test record with 13 reference lines + 4 section
  banners → RPC returns total=1, reference=13, unresolved_reference=0,
  skipped_header=0.
- Real-world smoke: web upload osnovni березень 2026 → 13 reference
  rows in БД with proper categories.

### Frontend region_salary year/month fix (CLOSED 2026-05-05, commit 425bdc1)

Sub-step 6.x.a fixed pre-existing bug at js/summary/parse-summary-xlsx.js:325-335
where region_salary records hardcoded year=0/month=0 instead of
reading from monthCol context. Sentinel rows invisible to render
(filter by exact (year, month)) but polluted salary_values.
1-line fix mirrored reference pattern. Build via
'VITE_BASE=/ npm run build' in PowerShell (MSYS2 path conversion
gotcha confirmed).

### Reference render fallback fix (CLOSED 2026-05-05, commits 05e0f97 + 4c97922)

Pre-existing render bug: js/summary/render-monthly.js renderReferenceBlock
filtered exact (year, month). Archival reference has period_month=0,
UI selected month for archival year view = 12 (latest month with
data) → filter never matched → global-newest fallback always
returned (2026, 3). User saw current month reference for all
archival years.

Final logic (commit 4c97922 supersedes 05e0f97):
1. Stage 1: exact (year, month) — for monthly views
2. Stage 2: same-year annual (year, 0) — for archival year views
3. No global fallback — empty placeholder 'Немає даних' if neither
   stage matches

User decision: empty placeholder preferred over showing data from
different year (semantically correct).

### Reference backfill via Python ETL (CLOSED 2026-05-05, no commits — data-only)

Three Python ETL writebacks added archival reference:
- 2025_рік.xlsx → batch 4db9d606 → +13 reference rows (2025, 0)
  - Bonus: revenue_per_employee_grn (2025, 0) recanonicalized to
    Python's formula (1345984.38 vs web upload 1341009.26 —
    rounding diff, Python's stays canonical for consistency)
- 2024.xlsx → batch ac95d31e → +9 reference rows (2024, 0)
  (2024 file has no food block — Держстат food prices appeared
  only from 2025)
- 2023 рік.xlsx → batch 59ea00d9 → +7 reference rows (2023, 0)
  (no food block + 2 alias gaps for legacy 'для підприємства'
  formulation — pending separate sub-step)

### Recovery from accidental DELETE (CLOSED 2026-05-05)

User clicked 'Очистити дані зведених показників' button in Settings
which performed unconditional DELETE FROM on five fact tables
(indicator_values, indicator_volprice_values, salary_values,
animal_values, reference_text). Wiped 55+ archival reference rows.

Recovery via SQL INSERT FROM fact_revisions canonical entries
(fact_revisions table preserved). 5-minute recovery, no data loss.

### Destructive action confirmation (CLOSED 2026-05-05, commit d09fe9f)

Sub-step 6.x.d added text confirmation to clearSummaryIndicators
button. window.prompt requires exact 'УДАЛИТИ' input to proceed.
ESC, empty, wrong text, or lowercase — all cancel with 'Скасовано'
alert. Prevents click-through inertia and accidental hover-clicks.

### Phase 1 — profiles enhance + RLS hardening + tech debt fix (CLOSED 2026-05-05)

Goal: extend existing profiles infrastructure для admin epic without
new user_roles table; fix circular RLS tech debt as bonus.

Sub-step B.1 — sql/23 draft (no apply):
- Re-verified baseline through 5 read-only queries; caught Option A/B/C
  decision point on existing CHECK (baseline 5 roles, not 3 as initial
  draft assumed) — chose Option A (preserve baseline + add manager = 6)
- Drafted sql/23-profiles-enhance-and-rls-fix.sql (114 lines, 9 steps)
- Drafted sql/23-rollback.sql (91 lines, exact baseline restoration)

Sub-step B.2 — apply + smoke (commit bf6be0b):
- Fresh backup pre-sql23-20260505-141053.sql (6.98 MB)
- Apply through cat | psql: 25 statements clean BEGIN/COMMIT
- 8-step smoke ALL PASS: schema (column + CHECK з 6 ролями), functions
  (fn_is_admin/fn_has_role з SECURITY DEFINER STABLE), policies (4
  admin replaced без recursion), grants (leak closed на handle_new_user
  + trg_alias_normalize), trigger attached, functional auth simulation
  (valeriy admin sees 6 profiles, nikita editor sees 1)

Sub-step B.2.1 — REVOKE PUBLIC follow-up (Option C):
- Discovered fn_is_admin/fn_has_role inherited PUBLIC EXECUTE через
  Postgres default. Revoked PUBLIC ad-hoc; updated sql/23 file для
  consistency.
- Discovered anon retains explicit Supabase pattern grant (functional
  impact = 0; documented as Phase 2 revisit).

Sub-step B.3 — Phase 1 closure (commits bf6be0b + 0b75990):
- Committed sql/23-* (forward + rollback)
- Aligned ADMIN_EPIC.md з sql/23 actuals (4 sections updated)
- Pushed both commits to origin/feature/admin-panel

Tech debt closed: 4 admin policies на profiles мали circular subquery
(SELECT FROM profiles within policy ON profiles). Replaced з USING
(public.fn_is_admin()) SECURITY DEFINER pattern — no recursion.

Phase 1.5 ready (manual): створити kaiassistantopenclaw@gmail.com
service backup admin через Studio → UPDATE profiles SET role='admin'.
≥2 admins precondition для Phase 2.6 RLS aal2 lock-down.

Phase 2 ready: User management UI з RPCs + /admin/users page.
TODO documented: js/app.js:91 додати 'manager' до Dashboards button
visibility list (currently `['admin', 'analyst', 'editor']`).

### Phase 2 backend — 5 admin Edge Functions (CLOSED 2026-05-06)

Goal: 5 new Edge Functions for admin actions (matches existing
create-user pattern from C.0 recon — locked Edge Functions over pg_net).

D.0 mini-tasks (commits 97076d6 + 1dc7d98):
- PAGE_ACCESS / UPLOAD_ROLES / ROLE_LABELS aligned з sql/23 schema
  (6 roles: drop forester/accountant/hr/operator, add manager).
- ROLE_LABELS Option D: director label 'керівник' → 'директор';
  manager label = 'керівник'.
- ADMIN_EPIC.md Section II.6 addendum locking Edge Function pattern.

E.0 recon: revealed local create-user/index.ts NEVER deployed
(server volume only had hello/main/). Deploy mechanism via tar pipe
locked. Hot-reload confirmed — no container restart needed.

E.0.5 canary deploy: existing create-user as first real Edge Function
on server. 5 smokes pass (OPTIONS, no/bad auth, etc.).

E.1 — E.4 sequence (5 commits — 6a3aa85, 1e15821, 12f6eec, a4d7830,
b267e7c):
- set-role: UPDATE profiles SET role з ≥2 admins guard
- disable-user: toggle ban_duration via auth.admin.updateUserById
- delete-user: hard delete via auth.admin.deleteUser, FK CASCADE
  to profiles confirmed
- reset-password: Option γ — generate temp 16-char strong password,
  return plain-text у response
- set-mfa-required: toggle profiles.mfa_required (Phase 2.5 enforce)

Total 5 functions × 4 smokes = 20 negative tests pass. Positive
testing deferred to F.0 (real admin JWT через frontend modal).

Server volume now has 8 functions: hello, main, create-user, set-role,
disable-user, delete-user, reset-password, set-mfa-required.

### Phase 2 frontend — admin user management UI (CLOSED 2026-05-06)

Goal: extend viewerAccessModal з 5 admin action buttons wiring до
Phase 2 backend Edge Functions.

F.0a recon: existing modal handler structure, createUser fetch
pattern, destructive confirm pattern (window.prompt 'УДАЛИТИ' from
d09fe9f). Discovered ALL_ROLES + ROLE_LABELS local duplicates у
modals.js (D.0 missed these — 9 stale roles + Title Case labels).

F.0c implementation (commit b95df38):
- Cleanup: import ROLE_LABELS from auth.js, delete modals.js dups
- callAdminEdgeFunction shared helper
- 6 inline buttons per user card (Save, Reset password, Disable,
  Enable, MFA toggle, Delete)
- 5 handler functions з consistent UX
- Removed saveViewerAccess (mass save → per-row)
- Build (PowerShell) + tar pipe deploy без MSYS2 mangling

F.0c-fix: ROLE_DESCRIPTIONS object had 9 stale keys — manager missing
caused undefined.caps TypeError при відкритті roles reference panel.
Fix: ROLE_DESCRIPTIONS synced до 6 keys + defensive guard.

Smoke verified у production browser: modal opens, reset-password
generates+displays temp pw, per-row buttons functional.

## Pending — fresh-mind required

### Frontend audit (next session)
1. Animals '*' footnote display — view update OR separate footnote
   slot OR keep current. Decision deferred.
2. Indicator graphs testing — 3 modes per indicator (Місяць vs
   місяць, По роках, YTD порівняння). ~50 indicators × 3 modes =
   matrix sweep. Multiple sessions needed.
3. Cleanup 5 inactive tax_* records (sort 500-540).

### Database cleanup
4. DELETE 11 sentinel rows period_year=0/period_month=0 у
   salary_values — frontend fix deployed at 6.x.a so new uploads
   no longer create them, but existing 11 still polluting. Simple
   DELETE migration.

### Reference resolver completeness
5. Phase 3 — Python ETL migration to DB resolver. Currently
   etl/reference_aliases.py and DB seed in sql/21 are parallel
   implementations — drift risk managed manually. Phase 3
   refactors etl/reference_aliases.py to call
   fn_resolve_reference_category, eliminating Python-side
   keyword tables.
6. Alias gap for legacy 'для підприємства активна' formulation
   (electricity_business / gas_business in 2023). Add aliases
   to both etl/reference_aliases.py AND sql/21 seed → re-writeback
   2023 → coverage from 7 to 9 categories.

### Yearly file gaps
7. 2022 рік.xlsx writeback — file has no Довідково block. Indicator
   data (annual + monthly) writeback possible, will emit
   'no_reference_block_found' warning. Not blocking.

### Bulk writeback remaining osnovni
8. 3 osnovni files for write through Python ETL (vs web upload):
   - Основні_показники_проміжний_березень_2026_оновлена.xlsx
   - Основні_показники_проміжний_березень_2026.xlsx
   - Основні_показники_лютий_20261.xlsx
   Web upload variants already wrote successfully. Python ETL pass
   would add fact_revisions audit trail and canonical resolution.

### GH Pages mirror
9. ~~Merge feature/migration-15-revisions → master + GH Pages PR~~ (DONE
   2026-05-05; current working branch feature/admin-panel from master).

### Admin epic next steps
10. ~~F.0 frontend: extend viewerAccessModal з 5 action buttons~~ (DONE
    2026-05-06, commit b95df38; F.0c-fix included ROLE_DESCRIPTIONS sync).
11. Phase 1.5 manual: створити kaiassistantopenclaw@gmail.com через
    Studio → UPDATE profiles SET role='admin' (≥2 admins precondition
    для Phase 2.6 RLS aal2 lock-down). Все ще required.
12. **Phase 2.5 — coverage:**
    - SMTP delivery test (deferred з E.0 — Option γ не залежить, але
      потрібен для future password recovery flow)
    - Self-service password change: admin-generated temps need user
      replacement after first login → /profile/security page
    - TOTP enrollment flow (auth.mfa native already verified у Phase 0)
    - aal2 RLS lock-down (Phase 2.6 bundled)
13. js/app.js:91 додати 'manager' до Dashboards button visibility list
    `['admin', 'analyst', 'editor']` → `['admin', 'analyst', 'editor', 'manager']`
    (минулий пропуск, можна окремим micro-commit).
14. Known limitation: delete-user FK conflict для users з upload
    history (frontend hint shown; future structural fix via CASCADE
    additions or pre-delete cleanup).
15. 3 orphaned Edge Functions у repo (fetch-eur-rate, notify-telegram,
    upload-wood-data) — local-only, server volume їх не має. Окрема
    "deploy or remove" task поза Phase 2 scope.
16. viewerAccessModal id rename → userManagementModal — Phase 6 polish
    (cosmetic, заголовок 'Управління користувачами' вже коректний).

## Tech debt (deferred)

- ⚠ ALTER PUBLICATION supabase_realtime ADD TABLE for 6 normalized
  tables (degraded realtime).
- ⚠ Untracked sql/01-13 — legacy seed/migration files never
  committed to this branch. Tech debt.
- pre-existing test_fake_repository.py:217+ union-attr bug.
- canonical_*_salary / canonical_*_animal don't contribute to
  rows_to_canonical / rows_superseded counters.
- psycopg2 execute_values cur.rowcount quirk.

### Tech debt CLOSED 2026-05-05
- ✅ RLS infinite recursion on public.profiles — fixed у Phase 1
  (sql/23, commit bf6be0b). 4 admin policies replaced inline EXISTS
  subquery з USING(fn_is_admin()) SECURITY DEFINER pattern.

### Tech debt deprioritized
- ROTATE valeriy418@gmail.com password (leaked in chat early sessions)
  — Phase 2.5 додасть mfa_required=true для admin role default; MFA
  mitigates compromise. Не блокує current work.

## Lessons learned (this session)

- Web upload (RPC) and Python ETL CLI are PARALLEL pipelines, NOT
  exclusive. Both write to same 5 fact tables, last writer wins via
  UPSERT. Multiple sessions of overcaution about cross-write conflict
  proved unfounded — web upload osnovni and Python ETL yearly write
  to non-overlapping (year, month) tuples in practice.
- 'Очистити дані' button was a footgun for ~unknown duration,
  discovered when accidentally triggered. Now protected by text
  confirmation. Future destructive UI actions should follow same
  pattern.
- Frontend bundle hash change verification through DevTools Network
  tab is essential after deploys — service worker cache can mask
  successful deploys until browser-side cleanup.
- Render-side fallback logic must match data shape semantics:
  exact-match for monthly periods, same-year annual fallback for
  archival period views, empty placeholder for periods with no
  data (preferred over showing wrong-year data).

## Test/quality state

- pytest: 349 passed (no new tests this session — UI fixes are
  not unit-tested currently)
- mypy --strict: 57 errors (pre-existing baseline, unchanged)
- ruff: 5 pre-existing errors in unrelated files

## Working rules (carried forward)

- Detailed prompts to Claude Code, review reports at stopping points
- Never paste credentials in chat (verbatim)
- Always show verbatim code, not paraphrases
- Stopping points before commits and deploys
- No Plan mode in Claude Code
- Atomic small commits over big ones
- Each sub-step has independent revert path
- Smoke on real data before commit when integration involved
- Reconnaissance before implementation when crossing layer boundaries
- VITE_BASE=/ npm run build through PowerShell (NOT bash) to avoid
  MSYS2 path conversion mangling
- Verify bundle hash change in DevTools after deploy
