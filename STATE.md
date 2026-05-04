# Project State
## ETL Pipeline + Frontend Dashboard for ДП Ліси України

**Last updated:** 2026-05-04
**Working branch:** feature/migration-15-revisions
**Production state:** salary + animals + tax cross-render LIVE on dashboards.e-forest.gov.ua

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

## Pending — fresh-mind required

### Frontend audit (5.6 cycle, NEXT SESSION)
1. Animals '*' footnote not rendered in UI (raw_text not exposed via
   v_summary_indicators). Decision deferred:
   - Option A: update view to expose raw_text → frontend shows full
     'Олень благор. 3787/*'
   - Option B: separate footnote indicator slot
   - Option C: keep current state (no UI footnote)

2. Indicator graphs testing — 3 modes per indicator (Місяць vs місяць,
   По роках, YTD порівняння). Test plan needed: matrix of ~50
   indicators × 3 modes = systematic sweep over multiple sessions.

3. Cleanup 5 inactive tax_* records (sort 500-540):
   tax_arrears_budget, tax_arrears_pf, tax_debt_debit, tax_debt_credit,
   tax_cash. Vestigial dups never used. Simple DELETE migration.

### Bulk writeback remaining 3 osnovni files (NEXT SESSION)
- raw_data/Основні_показники_березень_2026_остання.xlsx (primary,
  newest vintage)
- raw_data/Основні_показники_проміжний_березень_2026_оновлена.xlsx
- raw_data/Основні_показники_проміжний_березень_2026.xlsx

Expected accumulation:
- salary_values: +80 (osnovni multi-year), some overlap with yearly
  resolved by canonical
- animal_values: +24 (6 species × 4 closed years 2022-2025),
  yearly 2022/2023 overlap resolved by vintage tie-break

## Tech debt (deferred)

- ⚠ ROTATE valeriy418@gmail.com password (leaked in chat 5x during
  early sessions). User explicitly chose to defer.
- ⚠ ALTER PUBLICATION supabase_realtime ADD TABLE for 6 normalized
  tables (degraded realtime, manual refresh works).
- ⚠ RLS infinite recursion on public.profiles (4 of 6 policies
  self-reference, pre-existing, not blocking).
- pre-existing test_fake_repository.py:217+ union-attr bug
  ('f.value' without isinstance filter, 5 Union members lack .value).
- canonical_*_salary / canonical_*_animal don't contribute to
  rows_to_canonical / rows_superseded counters (5.4.4.e, 5.5.5.b
  known trade-offs).
- psycopg2 execute_values cur.rowcount quirk (rows_to_revisions
  under-reports, page_size=200, last-page count only).

## Test/quality state

- pytest: 349 passed (all green)
- mypy --strict: 57 errors (1 pre-existing union-attr in
  test_fake_repository.py:217+, baseline since 5.4.4.b)
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
