# ROADMAP.md

## KPI Dashboard — Cloud Feature Parity Roadmap

**Created:** 2026-05-14
**Branch:** `feature/admin-panel`
**Status:** Draft for review
**Reference audit:** [reports/dashboard_pages_audit.md](./reports/dashboard_pages_audit.md)
**Related epics:** [ADMIN_EPIC.md](./ADMIN_EPIC.md)

---

## I. Context

Цей роадмап складено після майнор-фіксів зведеної (травень 2026) і повного аудиту сторінок дашборду. Production стан: 11/12 page routes у `PAGE_ACCESS` робочих, 1 partial (api-system з пустим audit tab), 1 broken (data-entry — `dataset_types` table missing in DB). Sprint plan побудовано згідно з 3 cloud-parity напрямками що визначив користувач:

1. **Аудит** — повне логування дій ("в клауді було зручно")
2. **Введення** — manual entry forms на заміну xlsx/docx upload, поступово
3. **API + ProZorro** — інтеграція 11 ЄДРПОУ філій для регіонального procurement моніторингу

## II. Constraint — hard rule

**Логіку Зведеної не торкаємось.** Після травневих fix'ів (commits ce00a44 → 6d4d698) працює коректно, підтверджено Тетяною. Зміни в `js/summary/*` тільки якщо є явний bug report від домен-валідатора.

## III. Що зроблено перед цим роадмапом

### Backend (квітень — травень 2026)
- Migration #15 — rename indicator codes на Python-стиль з unit-суфіксами
- ETL writeback pipeline з `--commit` режимом (sub-step 5.3.x complete)
- Reference resolver: aliases для indicators, salary_branches, animal_species
- Migration #17 — reference_text + canonical model
- Python parsers: annual_monthly + osnovni для xlsx
- Migration #19 — fact_revisions для salary (partial unique index)
- SSH tunnel patterns, supavisor bypass, psycopg2 UUID adapter

### Frontend (квітень — травень 2026)
- DB-driven refactor (16 файлів, -660 LOC, видалено TABLE_*_ROWS hardcoded)
- Stash-based migration to on-prem (commit `fcf4e2c`)
- 8 cumulative patches до Зведеної (commits ce00a44 → 6d4d698):
  - computeDerived 9 code renames після migration #15
  - isText annual fallback
  - Branch salary annual-priority (Excel cross-year directly)
  - Balance metrics no carry-forward ("—" if current period pending)
  - computeYtd 'sum' annual-first з complete-view guard
  - computeDerived singleMonth param + annual-first YTD
  - Render passes singleMonth=true для current-month derived
  - Reference section headers + state machine wrapping

### Admin Panel epic — partial
- ADMIN_EPIC.md drafted (full plan з 5 phases)
- Phase 0 + A.0.1 discovery done
- 7 Edge Functions для user CRUD деплоїно (create-user, set-role, disable-user, delete-user, reset-password, set-mfa-required, reset-mfa-factor)
- Admin modal в header працює (`openViewerAccess`)
- Phase 1 (full /admin route) **не стартував** — використовується modal-based UI

---

## IV. Sprint plan

Sprint sizing — кожен ≈ 1 робоча сесія Claude Code з кількома stopping points перед commits/deploys.

---

### Sprint 0 — Security baseline + data-entry hotfix discovery

**Час:** 1 сесія (~2 години)
**Ціль:** Чистий ground для великих робіт + розблокувати Data Entry page.
**Статус (2026-05-15):** partial — 0.4 ✅ done | 0.1 deferred | 0.2 / 0.3 / 0.5 TODO

#### 0.1. sql/26 aal2 RLS apply — **DEFERRED**

Файл `sql/26-rls-aal2-writes.sql` згаданий у ADMIN_EPIC.md Phase 2.6 як deliverable, **але насправді не drafted у repo**. Sprint 0 discovery виявив preconditions BLOCKED:
- ≥2 admins exist ✅ (2: valeriy418 + kaiassistantopenclaw)
- 0/2 admins мають enrolled+verified MFA factor ❌ — apply premature заблокує усі writes
- Pre-step: обидва admins enrol MFA через '🛡 Безпека' header button → verify `auth.mfa_factors` ≥2 verified → draft sql/26 + rollback → apply

Refs: [reports/sprint0_discovery.md](./reports/sprint0_discovery.md) Decision 1.

- [ ] _(BLOCKED on MFA enrolment)_ Draft `sql/26-rls-aal2-writes.sql` + `sql/26-rollback.sql`
- [ ] Backup `sql/backups/pre-sql26-{ts}.sql`
- [ ] Apply `psql -f sql/26-rls-aal2-writes.sql`
- [ ] Smoke test: editor user writes still work (no aal2 req); admin write without MFA → 403
- [ ] STATE.md update

#### 0.2. GoTrue admin password rotation

Security TODO ще з минулих сесій (memory: "valeriy418@gmail.com password not rotated after credential leak").

- [ ] Use admin modal `openViewerAccess` → reset-password Edge Function OR direct GoTrue admin API
- [ ] Verify login з новим паролем
- [ ] Update password manager / 1Password entry

#### 0.3. Edge Functions cleanup

3 orphaned local: `fetch-eur-rate`, `notify-telegram`, `upload-wood-data` — на сервері відсутні (per STATE.md).

- [ ] Decision per function: deploy чи delete locally
- [ ] If delete: `supabase functions delete <name>` локально + git rm `supabase/functions/<name>/`
- [ ] If deploy: `supabase functions deploy <name>` + smoke test

#### 0.4. dataset_types unblock — ✅ **DONE (Sub-sprint 0.A, 2026-05-15)**

Discovery виявив: `sql/dynamic-data.sql` + `sql/dashboard-builder.sql` вже existing у repo з матчем 1:1 до frontend usage. Apply additively (clean state preconditions met, 0 existing tables conflict).

**Applied:**

- [x] Schema-only backup `/tmp/schema-backup-pre-0a-20260515-083640.sql` (289 KB)
- [x] `sql/dynamic-data.sql` — 3 tables (dataset_types, custom_datasets, form_templates) + 3 indexes + 8 RLS policies + 8 seed dataset_types
- [x] `sql/dashboard-builder.sql` — 1 table (dashboard_configs) + 5 RLS policies
- [x] PostgREST schema cache reload (×2)
- [x] Browser smoke: Введення page завантажується без error, 8 system cards visible
- [x] Browser smoke: Конструктор / Дашборди page loads (empty list, 0 saved)
- [x] Regression check: Зведена логіка не зачеплена

**Outcome:** Data Entry page повністю unblocked. Конструктор foundation laid. Зведена логіки не торкнуто per Sprint 0 constraint.

Refs: [reports/sprint0_discovery.md](./reports/sprint0_discovery.md) Decisions 2 + 4.

#### 0.5. Merge feature/admin-panel → master

GitHub Pages mirror на master показує застарілу версію. Зараз branch ahead by 8+ commits.

- [ ] `git checkout master && git pull`
- [ ] `git merge --ff-only feature/admin-panel`
- [ ] `git push origin master`
- [ ] Verify GH Pages rebuild + visit `hom4a.github.io/kpi-dashboard/`

---

### Sprint 1 — Audit log (Phase 3 ADMIN_EPIC)

**Час:** 2-3 сесії
**Ціль:** Cloud feature parity для аудиту — повне логування дій з UI для review.

**Що було в cloud (потрібно підтвердити з user):** _TBD — користувач згадає конкретний UX/функціонал який був зручний у cloud версії._

#### 1.1. Schema + triggers

- [ ] SQL migration `sql/27-audit-log.sql`:
  ```
  CREATE TABLE public.audit_log (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID REFERENCES auth.users(id),
      user_email TEXT,
      action TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
      table_name TEXT NOT NULL,
      row_id TEXT,
      old_data JSONB,
      new_data JSONB,
      ip_address INET,
      user_agent TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX ix_audit_log_user_created ON audit_log(user_id, created_at DESC);
  CREATE INDEX ix_audit_log_table ON audit_log(table_name, created_at DESC);
  ```
- [ ] Trigger function `fn_audit_trigger()` — generic для всіх 5 fact tables
- [ ] Apply triggers на:
  - `indicator_values`
  - `salary_values`
  - `animal_values`
  - `reference_text`
  - `upload_batches`
- [ ] RLS: admin + manager read; admin тільки delete (per ADMIN_EPIC спека)

#### 1.2. Frontend wire-up

- [ ] `js/api-system/audit-viewer.js` connect до нової таблиці
- [ ] Render: paginated list, columns (час, юзер, дія, таблиця, row, before/after diff)
- [ ] Filter UI: by user, by date range, by table, by action
- [ ] Search: text search у old_data/new_data JSONB
- [ ] Export to CSV

#### 1.3. Performance + retention

- [ ] Partial index strategy if log grows large (per month partition?)
- [ ] Retention policy — auto-delete після X місяців? (decision point)
- [ ] Monitor query performance — `EXPLAIN ANALYZE` на типових filter queries

#### 1.4. Deploy + verify

Standard backup+tar+ssh flow + browser smoke.

---

### Sprint 2 — Data Entry forms expansion

**Час:** Sprint 2.0 (discovery) = 1 сесія. Sprint 2.1...N = per-form implementations, скільки треба.
**Ціль:** Поступовий перехід з xlsx/docx upload на in-system форми.

**Передумова:** Sprint 0.4 завершений (dataset_types schema decision).

#### 2.0. Discovery & inventory

- [ ] Список **всіх data types** які зараз завантажуються:
  - Основна щомісячна довідка (xlsx) → indicator_values + salary_values + animal_values + reference_text
  - Тижнева довідка (docx) → weekly_indicator_values + weekly_notes + weekly_attachments
  - Forest prices/inventory (xlsx) → forest_*
  - Harvesting plan-fact + ZSU → harvesting_*
  - Market prices (xlsx/manual) → market_*
  - Wood accounting (xlsx) → wood_*
  - KPI records cash (xlsx) → kpi_records
- [ ] Для кожного — чи **уже існує form alternative** в `data-entry/`?
- [ ] User-specified gaps: що було в cloud з форм, чого зараз нема
- [ ] Output: `reports/data_entry_inventory.md` з таблицею типу:
  - data type | upload path | form path | cloud parity | priority

#### 2.1+ Per-form sprints

Окремо для кожної форми (порядок per user priority):
- Schema for form fields + validation rules
- UI implementation (use existing `SUMMARY_CARDS` pattern або новий)
- Backend RPC для INSERT (з validation + audit trigger benefit)
- Smoke test з реальним користувачем
- Production deploy

Це нескінчений sprint — поступово закриваємо форми за пріоритетом.

---

### Sprint 3 — API + ProZorro integration

**Час:** Sprint 3.0 (discovery) = 1 сесія. Sprint 3.1...3.N = per-component implementations.
**Ціль:** Procurement моніторинг по 11 ЄДРПОУ філіях + API для external integrations.

#### 3.0. Discovery

- [ ] Current state `prozorro_tenders` table — schema, data freshness, sync status
- [ ] `prozorro_sync_log` — наскільки активний?
- [ ] Existing ProZorro sync code — Edge Function? Cron? Manual?
- [ ] Список 11 ЄДРПОУ всіх філій — звідки взяти, чи є в `salary_branches` aliases чи треба окремий джерело
- [ ] API console tab (api-system/api-console.js) — що зараз вміє?
- [ ] Public API endpoints — чи існують REST endpoints що не PostgREST? Чи треба створити custom Edge Functions?
- [ ] CORS proxy mention у CLAUDE.md — що про що?

#### 3.1. ProZorro sync infrastructure

- [ ] Schema: `branch_edrpou(branch_id, edrpou, valid_from, valid_to)` — 11 entries
- [ ] ProZorro API client — Edge Function або Python ETL?
- [ ] Sync: tender list per ЄДРПОУ → upsert у `prozorro_tenders`
- [ ] Schedule: щоденний sync через pg_cron або external scheduler
- [ ] Monitor sync_log

#### 3.2. Procurement dashboard page

- [ ] New page route `procurement` (or extend `market` page)
- [ ] Aggregations: tender count, total value (UAH), top categories per філія
- [ ] Comparison views: 11 філій side-by-side
- [ ] Drill-down: per-філія detail з tender list
- [ ] Filter: date range, status, value threshold

#### 3.3. Public API endpoints

- [ ] Designate which data is exposable: tenders (yes), indicators (decide), salary (no — PII)
- [ ] Auth: API key per integrator? OAuth2? Just JWT?
- [ ] Rate limiting
- [ ] Doc page (extend api-system/api-console.js?)

---

## V. Defer backlog (long-term, no sprint assigned)

Не блокують cloud parity, але треба тримати в зоні видимості:

### Architectural

- **P_A_ALT:** Move derived metrics computation з JS computeDerived to Python ETL (single source of truth). Eliminates whole class of "frontend hardcodes old codes" bugs (migration #15 lesson).

- **P5:** Per-branch weighted salary — потребує нової схеми `branch_headcount_monthly` для правильної weighted формули. Зараз dashboard читає annual snapshot з Excel cross-year як workaround.

- **Animals parser:** Python ETL не парсить animal_species block з master xlsx. Зараз legacy 24 рядки з Cloud→on-prem початкового ETL. Sub-step не визначено.

- **Salary writeback completion:** sub-step 5.4 scaffolded (`SalaryValue` + `canonical_salary`), не закінчений. Залежно від поточного pipeline стану.

### Operational

- **Asset cleanup на prod:** `/var/www/dashboards.e-forest.gov.ua/assets/` accumulates orphan hash files at each deploy. Cleanup script needed.

- **Service Worker cache:** SW stubborn after deploys (per CLAUDE.md memory). Versioning strategy.

- **Manifest.json 404 на GH Pages:** PWA icons не serve коректно на mirror. Косметика.

- **Multiple GoTrueClient instances warning** — console noise, не функціональний bug.

### Optional features (за запитом замовника)

- **Тижнева довідка** — два напрямки:
  - (а) Parse docx → DB (як зараз для xlsx)
  - (б) Generate docx з dashboard data на п'ятницю автоматично
  - (в) Покращити рендер блоку у Зведеній (TBD scope)
- **File attachments у Довідково** — Word/PDF/Excel/PNG/JPEG upload, замовник просив
- **Bold formatting у Довідково** — копіювати форматування з .docx source
- **Goals/Plans tracking** — план-факт за період (mentioned у editor role caps)
- **NBU rate save fix** — RLS 403, sometimes fails (per memory)

### Phase 2.5 G.4 (admin epic)

`/profile/security` consolidation — single hub для password + MFA + sessions. Не блокер, але UX покращення.

---

## VI. Conventions

### Hard rules для Claude Code sessions

- Ніколи credentials у chat (навіть placeholders)
- Завжди verbatim code, не paraphrases
- Stopping points перед commits and deploys
- Без Plan mode у Claude Code
- Read-only investigations перед mutations

### Windows/git-bash gotchas

- MSYS path conversion mangling — workaround через PowerShell `npx vite build`
- `rsync` unavailable у git-bash — use `tar -czf - -C dist . | ssh ... tar -xzf -`

### Deploy flow (Option B з backup)

```bash
# 1. Build
npm run build

# 2. Backup current prod
ssh valeriy@10.0.18.16 "sudo tar -czf /tmp/dashboards-backup-$(date +%Y%m%d-%H%M%S).tar.gz \
    -C /var/www dashboards.e-forest.gov.ua"

# 3. Deploy
tar -czf - -C dist . | ssh valeriy@10.0.18.16 \
    "sudo tar -xzf - -C /var/www/dashboards.e-forest.gov.ua/"

# 4. Verify
ssh valeriy@10.0.18.16 "md5sum /var/www/.../assets/index-*.js"
md5sum dist/assets/index-*.js  # must match
curl -I https://dashboards.e-forest.gov.ua/  # 200 OK
```

Rollback на разі потреби:
```bash
ssh valeriy@10.0.18.16 "sudo rm -rf /var/www/dashboards.e-forest.gov.ua/* && \
    sudo tar -xzf /tmp/dashboards-backup-<timestamp>.tar.gz -C /var/www/"
```

---

## VII. Decision log

Місце для запису рішень по ходу sprint'ів. Кожне рішення = дата + контекст + результат.

| Дата | Sprint | Рішення | Обґрунтування |
|---|---|---|---|
| 2026-05-14 | — | Створити цей роадмап | Користувач явно попросив після audit + 3 cloud-parity напрямки defined |
| 2026-05-15 | 0.4 | Applied dynamic-data.sql + dashboard-builder.sql | Safer mini-sprint approach per user preference — additive-only files existing у repo, schema 1:1 матч до frontend usage, clean prod state. Sub-sprint 0.A executed з backup + smoke + reload checkpoints. |
| _BLOCKED_ | 0.1 | sql/26 aal2 RLS — defer until MFA enrolled | Discovery (sprint0_discovery.md): 0/2 admins з verified MFA factor. Apply premature заблокує усі writes. Bootstrap MFA для valeriy + kaiassistantopenclaw → re-evaluate. |
| _TBD_ | 1.3 | Audit retention policy | After production usage data |

---

## VIII. Status / Last updated

**Updated:** 2026-05-15 by Claude session (Sub-sprint 0.A closure)
**Next review:** Після Sprint 0 completion або через тиждень — whichever first.

**Sprint 0 progress:**
- 0.1 sql/26 aal2 — _DEFERRED_ (BLOCKED on MFA enrolment)
- 0.2 admin password rotation — TODO
- 0.3 Edge Functions cleanup — TODO
- 0.4 dataset_types unblock — ✅ DONE (Sub-sprint 0.A, 2026-05-15)
- 0.5 merge → master — TODO
