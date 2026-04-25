# DB Backups — Migration Safety Checklist

Цей каталог — місце для `pg_dump` файлів перед застосуванням руйнівних
міграцій. `*.dump` файли у `.gitignore` (не комітаться).

---

## Перед кожною міграцією

Виконати локально (з машини розробника, де є SSH до on-prem сервера):

```bash
# 1. Створити dump у контейнері
ssh valeriy@10.0.18.16 \
  "sudo docker exec supabase-db pg_dump -U postgres -Fc postgres > /tmp/pre-migration-15.dump"

# 2. Витягнути dump з контейнера на host
ssh valeriy@10.0.18.16 \
  "sudo docker cp supabase-db:/tmp/pre-migration-15.dump /tmp/pre-migration-15.dump"

# 3. Скачати локально з датою
scp valeriy@10.0.18.16:/tmp/pre-migration-15.dump \
  ./sql/backups/pre-migration-15-$(date +%Y%m%d).dump

# 4. Прибрати тимчасові файли на сервері
ssh valeriy@10.0.18.16 \
  "sudo docker exec supabase-db rm -f /tmp/pre-migration-15.dump && \
   rm -f /tmp/pre-migration-15.dump"
```

Перевірка що файл не пустий:

```bash
ls -lh ./sql/backups/pre-migration-15-*.dump
# Очікувано: 1-10 MB (залежить від кількості даних)
```

---

## Застосування міграції 15

Тільки ПІСЛЯ успішного backup:

```bash
scp sql/15-rename-codes-and-revisions.sql valeriy@10.0.18.16:/tmp/15.sql
ssh valeriy@10.0.18.16 \
  "sudo docker cp /tmp/15.sql supabase-db:/tmp/15.sql && \
   sudo docker exec supabase-db psql -U postgres -f /tmp/15.sql"
ssh valeriy@10.0.18.16 \
  "sudo docker exec supabase-db psql -U postgres -c \"NOTIFY pgrst, 'reload schema';\""
```

Post-apply verification:

```bash
ssh valeriy@10.0.18.16 "sudo docker exec supabase-db psql -U postgres -c \
  \"SELECT code, legacy_code, active FROM indicators ORDER BY sort_order LIMIT 15;\""
ssh valeriy@10.0.18.16 "sudo docker exec supabase-db psql -U postgres -c \
  \"SELECT COUNT(*) FROM indicators WHERE active = FALSE;\""      # Expected: 5
ssh valeriy@10.0.18.16 "sudo docker exec supabase-db psql -U postgres -c \
  \"\\d fact_revisions\""
ssh valeriy@10.0.18.16 "sudo docker exec supabase-db psql -U postgres -c \
  \"SELECT COUNT(*) FROM v_admin_revisions;\""                    # Expected: 0 (table empty)
ssh valeriy@10.0.18.16 "sudo docker exec supabase-db psql -U postgres -c \
  \"SELECT COUNT(*) FROM v_summary_indicators;\""                 # Non-zero; ≤ total
```

---

## Restore (якщо потрібно відкотити)

### Варіант A: швидкий soft rollback через SQL (рекомендовано, якщо міграція застосувалася цілком, але треба відкотити логіку)

```bash
scp sql/15-rollback.sql valeriy@10.0.18.16:/tmp/15-rb.sql
ssh valeriy@10.0.18.16 \
  "sudo docker cp /tmp/15-rb.sql supabase-db:/tmp/15-rb.sql && \
   sudo docker exec supabase-db psql -U postgres -f /tmp/15-rb.sql"
ssh valeriy@10.0.18.16 \
  "sudo docker exec supabase-db psql -U postgres -c \"NOTIFY pgrst, 'reload schema';\""
```

⚠️ SQL rollback **не відновлює** 3 рядки `indicator_values`, що видалені у STEP 2 (tax_arrears_budget / tax_arrears_pf / tax_cash @ 2022). Вони дублі main-block; якщо потрібні — re-ingest через `fn_upload_monthly_batch`.

### Варіант B: повний restore з dump (runtime disaster recovery)

**УВАГА:** це затирає ВСЮ БД станом на момент dump. Використовувати тільки якщо soft rollback неможливий (напр., міграція застрягла посередині транзакції, БД у неузгодженому стані).

```bash
# 1. Закачати dump назад на сервер
DUMP_FILE=./sql/backups/pre-migration-15-YYYYMMDD.dump   # замініть дату
scp "$DUMP_FILE" valeriy@10.0.18.16:/tmp/restore.dump
ssh valeriy@10.0.18.16 \
  "sudo docker cp /tmp/restore.dump supabase-db:/tmp/restore.dump"

# 2. Зупинити залежні сервіси (щоб не писали під час restore)
ssh valeriy@10.0.18.16 "sudo docker stop supabase-rest supabase-realtime supabase-auth"

# 3. DROP + recreate БД, потім pg_restore
ssh valeriy@10.0.18.16 \
  "sudo docker exec supabase-db psql -U postgres -c \
    \"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='postgres' AND pid<>pg_backend_pid();\""
ssh valeriy@10.0.18.16 \
  "sudo docker exec supabase-db pg_restore -U postgres -d postgres --clean --if-exists /tmp/restore.dump"

# 4. Підняти сервіси назад
ssh valeriy@10.0.18.16 "sudo docker start supabase-auth supabase-realtime supabase-rest"

# 5. Прибрати
ssh valeriy@10.0.18.16 \
  "sudo docker exec supabase-db rm -f /tmp/restore.dump && rm -f /tmp/restore.dump"
```

---

## Naming convention

`pre-migration-{NN}-{YYYYMMDD}.dump` — `NN` це номер міграції (15, 16, ...), дата
apply. Наприклад `pre-migration-15-20260424.dump`.

Ротація: залишати мінімум 3 останніх dump, старіші можна видаляти після
успішної роботи БД упродовж 30 днів.
