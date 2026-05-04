-- Rollback migration 21: DB-side reference category resolver
-- Drops in reverse dependency order: functions first, then tables.

DROP FUNCTION IF EXISTS fn_resolve_reference_category(TEXT, TEXT);
DROP FUNCTION IF EXISTS fn_detect_section_header(TEXT);
DROP FUNCTION IF EXISTS fn_normalize_reference_label(TEXT);
DROP TABLE IF EXISTS reference_category_aliases;
DROP TABLE IF EXISTS reference_section_aliases;
