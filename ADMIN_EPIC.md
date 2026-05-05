# ADMIN_EPIC.md
## Адмінка для KPI Dashboard — повний епік

**Created:** 2026-05-05
**Last revised:** 2026-05-05 (after A.0.1 profiles+is_admin mini-discovery)
**Branch:** feature/admin-panel (planned, від master)
**Status:** Phase 0 + A.0.1 mini-discovery complete; awaiting epic approval and Phase 1 start
**Backup:** sql/backups/pre-admin-epic-20260505-111629.sql (6.98 MB, 27406 lines)

## I. Definition of Done

- [ ] `/admin/*` route з role-based guard (тільки role='admin' має доступ)
- [ ] User CRUD UI: create/list/update/delete + role assignment + force-reset password + MFA enroll/disable/reset
- [ ] Self-service password change на `/profile/security`; admin-driven reset через `fn_admin_reset_user_password` RPC
- [ ] Dictionary CRUD UI: indicators / aliases / branches / species / blocks (editable метадата)
- [ ] Audit log: trigger-based на 5 fact таблицях + UI list/filter (admin+manager read; admin тільки delete)
- [ ] Upload management: list batches з filter/sort + soft rollback (revert canonical only) і hard rollback (revert canonical + revisions)
- [ ] RLS lock-down: усі writes на normalized таблицях вимагають aal2 (MFA verified) для admin/editor; reads — за role у profiles
- [ ] Tech debt cleanup: circular RLS на profiles → fn_is_admin() pattern (bonus у Phase 1)

## II. Phase 0 + A.0.1 — Discovery findings (2026-05-05)

### 2.1. GoTrue
- Image: `supabase/gotrue:v2.186.0`
- Started: 2026-04-22 12:51 UTC, listening 0.0.0.0:9999
- Migrations applied: 67 (all current)
- **Verdict:** v2.186.0 ≫ 2.55 → MFA native fully supported. No upgrade needed.

### 2.2. MFA configuration
- `GOTRUE_MFA_*` env vars: **not set** у `/opt/kpi-dashboard/supabase/.env` (default behavior)
- `auth.mfa_*` tables: all 3 present (`mfa_amr_claims`, `mfa_challenges`, `mfa_factors`)
- **Verdict:** schema ready. Default GoTrue v2.x behavior: MFA endpoints active without explicit env. Set `GOTRUE_MFA_MAX_ENROLLED_FACTORS` and friends explicitly у Phase 2.5; для базового TOTP enrollment працює out-of-box.

### 2.3. Current users (auth.users) + profiles.role assignments

| email | role (profiles) | last_signin | confirmed | full_name |
|---|---|---|---|---|
| valeriy418@gmail.com | **admin** | 2026-05-01 | t | Валерій |
| nikita.luchenko@e-forest.gov.ua | **editor** | NULL | t | Нікіта Лученко |
| oksana.chynchenko@e-forest.gov.ua | **editor** | NULL | t | (empty) |
| kvorobchuk@gmail.com | **viewer** | NULL | t | (empty) |
| oleksandr.shust@e-forest.gov.ua | **viewer** | NULL | t | (empty) |
| tetiana.hotsuienko@e-forest.gov.ua | **viewer** | NULL | t | Тетяна Гоцуєнко |

**Висновок:** 6 юзерів existing з ролями у `profiles.role`. Mapping коректний — нічого не міняємо крім додавання 2nd admin (`kaiassistantopenclaw@gmail.com` — Phase 1.5).

### 2.4. RLS state

**RLS-enabled tables (9 з 35):** eur_rates, forest_inventory, forest_prices, forest_upload_history, harvesting_plan_fact, harvesting_zsu, kpi_records, market_prices, market_prices_ua, profiles, wood_upload_history.

**RLS-DISABLED tables (26):** усі normalized KPI tables (indicator_values, salary_values, animal_values, reference_text, fact_revisions, indicators, indicator_aliases, salary_branches, animal_species, blocks, derived_formulas, weekly_*, upload_history etc.).

**Existing pg_policies (16 total):**
- 14 — `authenticated_all` blanket ALL для `authenticated` (eur_rates, forest_*, harvesting_*, kpi_records, market_*, wood_upload_history)
- **6 на `profiles`:** 4 admin-pattern (Admins delete | insert | update all | view all) кожна з **inline subquery** `EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')` + 2 self-access (auth.uid() = id).

**🚨 Tech debt:** 4 admin policies роблять SELECT FROM profiles всередині policy ON profiles → circular reference. Postgres planner це обробляє але це bad pattern. Phase 1 виправляє через `fn_is_admin()` SECURITY DEFINER.

**Verdict:**
- 26 normalized таблиць — clean slate. Phase 2.6 — первинний RLS rollout.
- profiles RLS — rewrite у Phase 1 (replace 4 circular policies).

### 2.5. RPC exposure

**Public-callable RPCs (7 distinct):** fn_detect_section_header, fn_normalize_indicator_name, fn_normalize_reference_label, fn_resolve_reference_category, fn_upload_monthly_batch, handle_new_user, trg_alias_normalize.

**Verified для leaked grants (A.0.1):**
- `handle_new_user` — SECURITY DEFINER trigger на auth.users INSERT. Engine викликає тригер без external auth context → anon EXECUTE grant НЕ потрібен. **REVOKE безпечний.**
- `trg_alias_normalize` — звичайний BEFORE trigger на indicator_aliases. Trigger context. **REVOKE безпечний.**

**Risk:**
- `fn_upload_monthly_batch` потребує admin/editor role guard — додати у Phase 2.5/2.6 RPC body або revoke `anon` grant.
- handle_new_user / trg_alias_normalize — Phase 1 cleanup: REVOKE.

### 2.6. Admin tooling preconditions
- **pg_net:** ✓ v0.14.0 — придатний для async HTTP до GoTrue admin API
- **Edge Functions:** ✓ container running, hello/main folders boilerplate
- **SMTP:** ✓ 6 env vars set; delivery не верифіковано (Phase 2 smoke)

**Verdict для fn_admin_reset_user_password:** pg_net + GoTrue admin API. Edge Function — fallback.

### 2.7. Frontend
- vanilla ESM JS + Vite 7.3.1, no router lib
- supabase-js@2 from CDN UMD
- supabase init у js/config.js:23
- `/admin` через conditional rendering (existing pattern у js/app.js / js/navigation.js)

### 2.8. Existing roles infrastructure (NEW from A.0.1)

**`profiles` table (9 columns):**
| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | (PK, FK auth.users.id) |
| email | text | YES | — |
| full_name | text | YES | — |
| **role** | **text** | **NO** | **'viewer'** |
| allowed_pages | text[] | NO | ARRAY[]::text[] |
| org_level | text | YES | 'central' |
| org_unit | text | YES | '' |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

**Currently in use:** admin (1), editor (2), viewer (3). Не використовується **manager** — Phase 1 додає у CHECK для готовності.

**handle_new_user trigger:** ON INSERT to auth.users → INSERT INTO profiles (id, email, full_name, role) з role з raw_user_meta_data або 'viewer' default. ON CONFLICT DO NOTHING. SECURITY DEFINER.

**is_admin function (public):** **не існує.** Phase 1 створює fn_is_admin() SECURITY DEFINER STABLE.

**allowed_pages column (orthogonal):** page-level access control, окремо від ролі. Editor у БД не має 'executive' page. Цей механізм існує, ми його не зачіпаємо у нашому scope.

## III. Architectural decisions (locked, revised after A.0.1)

1. **Auth-модель:** використовуємо existing `public.profiles.role text NOT NULL` (вже працює, дані для всіх 6 юзерів).
   - **ALTER TABLE** додає `mfa_required boolean NOT NULL DEFAULT false`
   - **CHECK constraint** оновлюється на `role IN ('admin','editor','manager','viewer')`
   - **RLS helpers:** `public.fn_is_admin()` і `public.fn_has_role(text)` SECURITY DEFINER STABLE, читають profiles з context auth.uid()
   - **Існуючі 4 circular policies на profiles** замінюються на USING `fn_is_admin()` (Phase 1 tech debt fix)

2. **Ролі (4 шт.):**
   - admin — повний доступ; вмикає mfa_required, скидає чужі паролі, керує словниками, бачить + видаляє audit log
   - editor — uploads + dictionary edits + dashboards reads. БЕЗ user CRUD, БЕЗ audit log
   - manager — reads усіх dashboards + audit log read + upload_history read. БЕЗ writes ніде. **Currently no user assigned — added до CHECK для готовності.**
   - viewer — reads усіх dashboards. БЕЗ writes, БЕЗ audit log

3. **Password change (self-service):** через `auth.updateUser({password})` SDK на /profile/security. Доступно усім authenticated.

4. **Password change (admin-driven):** RPC `fn_admin_reset_user_password(target_user_id uuid)` SECURITY DEFINER + fn_is_admin() guard. Внутрішньо викликає GoTrue admin API через pg_net. Точний механізм — Phase 2 design.

5. **MFA per-user opt-in:** admin вмикає `profiles.mfa_required=true` для конкретних юзерів. Hybrid: forced для marked + self-service на /profile/security.

6. **MFA метод:** TOTP only.

7. **Recovery:** admin reset MFA factor через RPC `fn_admin_reset_mfa_factor`. Альтернативи (Phase 2.5 design): DELETE FROM auth.mfa_factors OR GoTrue endpoint через pg_net (cleaner orphan handling). Без backup codes. **Hard rule:** ≥2 active admin завжди — RPC що знижує admin кількість до <2 RAISE EXCEPTION.

8. **Bootstrap:**
   - **valeriy418@gmail.com** — уже в БД з role='admin'. Нічого не робимо.
   - **kaiassistantopenclaw@gmail.com** — backup admin (service account під контролем valeriy). Phase 1.5 manual:
     1. Studio через SSH-tunnel → Add user з паролем
     2. handle_new_user тригер створить row з role='viewer'
     3. UPDATE profiles SET role='admin' WHERE email='kaiassistantopenclaw@gmail.com'
   - Без MFA initially (mfa_required=false). Після того як обидва admin self-enroll'ять MFA — окремий sub-step ставить mfa_required=true для admin role default.

9. **RLS aal2 lock-down:** sql/26 ПІСЛЯ того як всі mfa_required юзери enrolled MFA (gate manual). Policy `WITH CHECK (auth.jwt()->>'aal' = 'aal2')` на write для admin/editor.

## IV. Roles model

| Role | Read dashboards | Write data | Dictionary edit | User CRUD | Audit log read | mfa_required default |
|------|-----------------|------------|-----------------|-----------|----------------|----------------------|
| admin | ✓ | ✓ | ✓ | ✓ | ✓ + delete | (admin sets, recommended true) |
| editor | ✓ | ✓ | ✓ | ✗ | ✗ | (admin sets, recommended true) |
| manager | ✓ | ✗ | ✗ | ✗ | ✓ read | (admin sets, optional) |
| viewer | ✓ | ✗ | ✗ | ✗ | ✗ | false |

> Note: `manager` додається у CHECK для готовності. Поточно no user.
> Note: `profiles.allowed_pages text[]` — окремий механізм page-level access. Не зачіпається у цьому епіку.

## V. MFA design

**Enrollment flow (hybrid):**

1. **Self-service:** authenticated юзер на /profile/security → "Налаштувати TOTP" → `supabase.auth.mfa.enroll({factorType:'totp'})` → QR + secret → 6-digit code → `mfa.challengeAndVerify(...)` → factor activated.

2. **Forced:** якщо `profiles.mfa_required=true` AND no active factor → login flow перевіряє → редірект на /profile/security з warning. Не можна закрити сторінку поки не enrolled.

**Verification flow:**
- Login: password → aal=aal1. Якщо мають factor → TOTP prompt → aal=aal2. Якщо ні factor — залишається aal1.
- Sensitive ops (Phase 2.6): write RPC + RLS перевіряє auth.jwt()->>'aal' = 'aal2'.
- Reads — без aal2 requirement.

**Recovery (admin):**
- RPC `fn_admin_reset_mfa_factor(target_user_id)` SECURITY DEFINER + fn_is_admin() guard
- Mechanism (Phase 2.5 design): DELETE FROM auth.mfa_factors OR GoTrue endpoint через pg_net
- Audit log entry: actor_id, target_user_id, action='reset_mfa', timestamp

**Hard rule (≥2 admins):**
- RPC `fn_admin_set_user_role(target, new_role)`: якщо target=admin AND new_role≠admin AND COUNT(active admins у profiles) <= 2 → RAISE EXCEPTION
- Same у fn_admin_disable_user, fn_admin_delete_user

**Bootstrap chicken-and-egg solution:**
- Існуючі профілі з mfa_required=false (default нової колонки) — primary admin login works without MFA
- Phase 1.5: створити kaiassistantopenclaw → UPDATE role='admin'
- After both self-enrolled (verified у auth.mfa_factors) → admin вручну UPDATE profiles SET mfa_required=true WHERE role='admin'
- Phase 2.6 lock-down — gate manual після того як COUNT(active admins з MFA) >= 2

**Differences from existing Claude Code plan:** N/A — у репо не знайдено existing MFA plan. Стартуємо з чистого листа.

## VI. Phasing

### Phase 0 + A.0.1 — Discovery (DONE — see Section II)

### Phase 1 — profiles enhancement + RLS hardening + tech debt fix (~30-45 хв)

**Deliverables:**
- `sql/23-profiles-enhance-and-rls-fix.sql`:
  1. ALTER TABLE profiles ADD COLUMN mfa_required boolean NOT NULL DEFAULT false
  2. ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check
  3. ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin','editor','manager','viewer'))
  4. CREATE FUNCTION public.fn_is_admin() SECURITY DEFINER STABLE
  5. CREATE FUNCTION public.fn_has_role(text) SECURITY DEFINER STABLE
  6. DROP 4 admin policies on profiles
  7. CREATE 4 нові admin policies USING fn_is_admin()
  8. REVOKE EXECUTE ON FUNCTION handle_new_user() FROM anon, authenticated, public
  9. REVOKE EXECUTE ON FUNCTION trg_alias_normalize() FROM anon, authenticated, public
  10. GRANT EXECUTE ON FUNCTION fn_is_admin(), fn_has_role(text) TO authenticated

- `sql/23-rollback.sql`: reverse 10→1.

**No sql/24 needed** — existing profiles.role data is the seed.

**Smoke (post-apply):**
- SELECT fn_is_admin() as valeriy session → true
- SELECT fn_has_role('editor') as nikita session → true
- valeriy can SELECT/INSERT/UPDATE/DELETE на profiles
- Не-admin не може INSERT INTO profiles
- handle_new_user тригер still fires on new user (manual test)
- INSERT з role='manager' — accepted; з role='superuser' — rejected

**Files:** sql/23-profiles-enhance-and-rls-fix.sql, sql/23-rollback.sql. No frontend.

### Phase 1.5 — Backup admin bootstrap (~15 хв, manual)

**Steps:**
1. ssh -L 8000:127.0.0.1:8000 valeriy@10.0.18.16
2. http://localhost:8000 Studio → Authentication → Users → Add user
3. Email: kaiassistantopenclaw@gmail.com. Password: generate ≥20 chars locally.
4. handle_new_user тригер створить profile з role='viewer'
5. SQL: UPDATE profiles SET role='admin' WHERE email='kaiassistantopenclaw@gmail.com'
6. Verify: SELECT email, role FROM profiles WHERE role='admin' → 2 rows
7. Зберегти credentials у password manager. TOTP secret теж там же при пізнішому MFA enroll.

**Smoke:** Logout valeriy → login kaiassistantopenclaw → SELECT fn_is_admin() → true. Logout, back as valeriy.

### Phase 2 — User management UI (3-4 sessions)
**Deliverables:**
- RPCs: fn_admin_create_user, fn_admin_set_user_role, fn_admin_disable_user, fn_admin_reset_user_password, fn_admin_set_user_mfa_required, fn_admin_delete_user (всі SECURITY DEFINER + fn_is_admin guard + ≥2 admins rule)
- js/admin/users-page.js + UI у Settings → "Адмін → Користувачі"
- Forms: Create user → GoTrue admin API → handle_new_user → UPDATE profile.role
- List view: emails, roles, last_signin, mfa_required, MFA factor active

**Smoke:** valeriy створює test user → user appears у auth.users + profiles → log in test → /admin denied → log back valeriy → delete test.

### Phase 2.5 — MFA infrastructure (2-3 sessions)
**Deliverables:**
- js/profile/security-page.js — /profile/security route з MFA enroll/disable + change password
- Forced enrollment middleware: profiles.mfa_required=true AND no active factor → redirect /profile/security
- RPC fn_admin_reset_mfa_factor (SECURITY DEFINER, audit log entry)
- ENV: GOTRUE_MFA_* vars у /opt/kpi-dashboard/supabase/.env

**Smoke:** valeriy enable MFA → logout → login → password → TOTP → aal=aal2. Reset через admin UI на test user → re-enroll.

### Phase 2.6 — RLS aal2 lock-down (1 session)
**Deliverables:**
- sql/26-rls-aal2-writes.sql — на 6 fact tables (indicator_values, indicator_volprice_values, salary_values, animal_values, reference_text, fact_revisions) ENABLE RLS:
  - SELECT: USING (fn_has_role('admin') OR ... OR fn_has_role('viewer'))
  - INSERT/UPDATE/DELETE: WITH CHECK ((fn_has_role('admin') OR fn_has_role('editor')) AND auth.jwt()->>'aal' = 'aal2')
- sql/26-rollback.sql

**Hard precondition:** ≥2 active admins з MFA enrolled. Gate перевіряється discovery query перед apply.

**Note про scope:** dictionary tables, weekly_*, derived_formulas — НЕ включаємо. sql/27 у Phase 4 додає policies.

**Smoke:** editor без aal2 → fn_upload_monthly_batch RAISE EXCEPTION. editor з aal2 → success.

### Phase 3 — Audit log (2 sessions)
**Deliverables:**
- sql/25-audit-log.sql — audit_log table + триггер functions на 5 fact + 5 dictionary tables (indicators, indicator_aliases, salary_branches, animal_species, profiles)
- RPCs read: fn_audit_log_list(filters jsonb) — admin+manager. Delete: fn_audit_log_delete — admin only.
- js/admin/audit-page.js: filter за actor/action/table/date range; sortable; pagination

**Smoke:** valeriy робить test INSERT у indicators → audit_log row з actor_id, action, table.

> Зауваження: Phase 2 RPCs будуть писати audit log starting Phase 3. Якщо хочемо щоб Phase 2 mutations теж audit'ились — Phase 3 перед Phase 2 OR Phase 2 RPCs мають defensive INSERT з ON CONFLICT/exception handling.

### Phase 4 — Dictionary CRUD UI (2-3 sessions)
**Deliverables:**
- /admin/dictionaries/{indicators,aliases,branches,species,blocks} — sub-tabs
- Form-based edit + soft delete (active=false)
- Bulk operations (re-canonicalize aliases)
- sql/27-rls-dictionaries.sql — extend RLS aal2 на dictionary tables

### Phase 5 — Upload management (1-2 sessions)
**Deliverables:**
- /admin/uploads — list upload_history + rollback buttons
- Soft rollback: revert canonical (preserve fact_revisions)
- Hard rollback: + DELETE fact_revisions

### Phase 6 — System health + polish (1 session)
**Deliverables:**
- /admin/health — DB, GoTrue, Edge Functions, last upload, fact_revisions counts
- README у docs/admin/

## VII. Risks & dependencies

1. **GoTrue version mismatch при upgrade.** Pinned v2.186.0; staging rehearsal якщо потрібно.

2. **RLS lockout при Phase 2.6.** Typo у policy → admin lock-out. Mitigation: staging schema test, backup готовий, rollback файл.

3. **GoTrue admin API access з pg_net.** GOTRUE_JWT_SECRET через current_setting або Edge Function (cleaner — secret в env vars).

4. **SMTP delivery problems.** Якщо SMTP_HOST блокує relay. Mitigation: generate_link з type=recovery → admin копіює link out-of-band.

5. **Phase 1 circular RLS replacement — frontend regression risk.** Логічно еквівалентно, але subtle frontend dependencies можливі. Mitigation: smoke ВСЕ existing admin functionality (Settings, profile editing) перед commit. Backup готовий.

6. **pg_net async semantics.** Повертає request_id, не response. Mitigation: для admin reset OK; для критичних — Edge Function.

7. **Frontend bundle size.** Vanilla JS, tree-shaking simple. Admin code ~200 КБ gzipped. OK.

## VIII. Hard preconditions

- ✅ Свіжий DB backup (sql/backups/pre-admin-epic-20260505-111629.sql, 6.98 МБ)
- ⏳ ≥2 active admins у profiles перед Phase 2.6 — currently 1 (valeriy). Phase 1.5 додає kaiassistantopenclaw.
- ⏳ Усі mfa_required юзери enrolled MFA перед Phase 2.6 — gate manual
- ⏳ Чистий working tree feature/migration-15-revisions перед merge → master — наступний промт

## IX. Working rules для епіку

- Detailed prompts to Claude Code, review reports at stopping points (з CLAUDE.md)
- Never paste credentials in chat — пароль/TOTP secret/JWT token завжди <redacted>
- Always show verbatim code, not paraphrases
- Stopping points before commits and deploys
- No Plan mode in Claude Code
- Atomic small commits over big ones
- Each sub-step has independent revert path (rollback файл per migration)
- Smoke on real data before commit when integration involved
- Reconnaissance before implementation when crossing layer boundaries
- VITE_BASE=/ npm run build through PowerShell (NOT bash) to avoid MSYS2 path conversion mangling
- Verify bundle hash change in DevTools after deploy
- Backup-first: pg_dumpall перед кожною sql/ migration
- Working branch: feature/admin-panel (від master)

## X. Open questions для користувача

| # | Question | Status | Resolution |
|---|---|---|---|
| 1 | Хто 2nd admin? | ✅ RESOLVED | valeriy primary + kaiassistantopenclaw@gmail.com service backup (Phase 1.5) |
| 2 | Role mapping для існуючих юзерів? | ✅ RESOLVED | Existing data correct |
| 3 | GOTRUE_MFA_ENABLED smoke test? | ⏳ Phase 2.5 reconnaissance | Test enroll() через DevTools на /profile/security stub |
| 4 | pg_net availability? | ✅ RESOLVED | v0.14.0 confirmed |
| 5 | SMTP delivery test? | ⏳ Phase 2 reconnaissance | Test через GoTrue POST /admin/users/{id}/recover |
| 6 | profiles RLS pattern (existing is_admin)? | ✅ RESOLVED | Function НЕ exists; Phase 1 створює fn_is_admin() + replaces 4 circular policies |
| 7 | Anon RPC grants safety? | ✅ RESOLVED | handle_new_user + trg_alias_normalize — безпечно revoke (Phase 1) |
| 8 | profiles.allowed_pages — як інтегрується? | ⏳ Phase 2 design | Out of scope для нашого epic; existing UI continues to honor |
