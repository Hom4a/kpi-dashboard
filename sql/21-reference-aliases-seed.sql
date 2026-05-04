-- Migration 21: DB-side reference category resolver
-- Mirrors Python etl/reference_aliases.py for use by fn_upload_monthly_batch.
-- Idempotent: CREATE IF NOT EXISTS + ON CONFLICT DO NOTHING + CREATE OR REPLACE.

-- ── Table 1: section headers (4 rows) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reference_section_aliases (
    section_key    TEXT NOT NULL,
    match_pattern  TEXT NOT NULL,
    PRIMARY KEY (section_key, match_pattern)
);

INSERT INTO reference_section_aliases (section_key, match_pattern) VALUES
    ('електроенергія', 'електроенергія'),
    ('газ',            'газ'),
    ('пмм',            'пмм'),
    ('продукти',       'продукти')
ON CONFLICT DO NOTHING;

-- ── Table 2: category aliases (29 rows) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS reference_category_aliases (
    slug           TEXT NOT NULL,
    section_key    TEXT,
    match_pattern  TEXT NOT NULL,
    PRIMARY KEY (slug, match_pattern)
);

INSERT INTO reference_category_aliases (slug, section_key, match_pattern) VALUES
    -- Top-level (section_key = NULL): no section context required
    ('subsistence_minimum', NULL, 'прожитковий мінімум'),
    ('min_wage',            NULL, 'мінімальна заробітна плата'),
    ('country_avg_salary',  NULL, 'середня заробітна плата в країні'),
    ('country_avg_salary',  NULL, 'середня заробітна плата країна'),
    ('country_avg_salary',  NULL, 'середня заробітна плата країні'),
    ('country_avg_salary',  NULL, 'середня з/п країна'),
    ('country_avg_salary',  NULL, 'середня з/п в країні'),
    -- Electricity sub-bullets
    ('electricity_population', 'електроенергія', 'для населення'),
    ('electricity_business',   'електроенергія', 'для непобутових споживачів'),
    ('electricity_business',   'електроенергія', 'непобутових'),
    -- Gas sub-bullets
    ('gas_population', 'газ', 'для населення'),
    ('gas_business',   'газ', 'для непобутових споживачів'),
    ('gas_business',   'газ', 'непобутових'),
    -- Fuel (ПММ) sub-bullets
    ('fuel_diesel', 'пмм', 'дп:'),
    ('fuel_diesel', 'пмм', '- дп '),
    ('fuel_diesel', 'пмм', ' дп '),
    ('fuel_diesel', 'пмм', 'дизельне'),
    ('fuel_a95',    'пмм', 'а-95'),
    ('fuel_a95',    'пмм', 'а95'),
    ('fuel_a92',    'пмм', 'а-92'),
    ('fuel_a92',    'пмм', 'а92'),
    -- Food sub-bullets
    ('food_bread_rye', 'продукти', 'хліб житній'),
    ('food_bread_rye', 'продукти', 'хліб жит'),
    ('food_eggs',      'продукти', 'яйце куряче'),
    ('food_eggs',      'продукти', 'яйц'),
    ('food_pork',      'продукти', 'м''ясо (свинина)'),
    ('food_pork',      'продукти', 'м''ясо свинина'),
    ('food_pork',      'продукти', 'свинина'),
    ('food_lard',      'продукти', 'сало')
ON CONFLICT DO NOTHING;

-- ── Function 1: normalise label (mirror Python _norm) ────────────────────────
-- Intentionally simpler than fn_normalize_indicator_name:
-- only LOWER + whitespace collapse, no typo-fix, no (без пдв) strip.
CREATE OR REPLACE FUNCTION fn_normalize_reference_label(p_label TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
    SELECT TRIM(regexp_replace(LOWER(p_label), '\s+', ' ', 'g'))
$$;

-- ── Function 2: detect section header (mirror Python detect_section_header) ──
-- Returns section_key if p_label starts-with a known section pattern, else NULL.
CREATE OR REPLACE FUNCTION fn_detect_section_header(p_label TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
    SELECT section_key
    FROM   reference_section_aliases
    WHERE  fn_normalize_reference_label(p_label) LIKE match_pattern || '%'
    LIMIT  1
$$;

-- ── Function 3: resolve category (mirror Python resolve_reference_category) ──
-- Stage 1: section-bullet match (requires p_current_section context).
-- Stage 2: top-level match (section_key IS NULL).
-- Returns NULL if unresolved (caller should emit 'unresolved_reference' warning).
CREATE OR REPLACE FUNCTION fn_resolve_reference_category(
    p_label           TEXT,
    p_current_section TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_norm TEXT;
    v_slug TEXT;
BEGIN
    v_norm := fn_normalize_reference_label(p_label);

    -- Stage 1: section-bullet
    IF p_current_section IS NOT NULL THEN
        SELECT slug INTO v_slug
        FROM   reference_category_aliases
        WHERE  section_key = p_current_section
          AND  v_norm LIKE '%' || match_pattern || '%'
        LIMIT  1;
        IF v_slug IS NOT NULL THEN
            RETURN v_slug;
        END IF;
    END IF;

    -- Stage 2: top-level
    SELECT slug INTO v_slug
    FROM   reference_category_aliases
    WHERE  section_key IS NULL
      AND  v_norm LIKE '%' || match_pattern || '%'
    LIMIT  1;

    RETURN v_slug;
END
$$;
