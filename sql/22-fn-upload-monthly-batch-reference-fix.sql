-- Migration 22: fn_upload_monthly_batch reference handling fix (Phase 2)
--
-- WHY: frontend (js/summary/parse-summary-xlsx.js:262-268) emits ONE record
-- per upload with indicator_name='Довідково' and value_text containing all
-- reference lines joined by '\n'. The current RPC matches 'довідково' in
-- HEADER_NAMES first → row is silently skipped before reaching the
-- reference branch. Result: web osnovni uploads write 0 reference_text
-- rows. Python ETL is the only path populating reference today.
--
-- FIX:
--   1. MOVE the reference branch to the TOP of the loop, BEFORE the
--      HEADER_NAMES skip check (the only structural change).
--   2. EXPAND from one row INSERT to per-line resolution using the
--      sql/21 resolver functions (fn_detect_section_header +
--      fn_resolve_reference_category).
--   3. ADD counter c_unresolved_reference for per-line warnings.
--
-- INVARIANTS:
--   - All other branches unchanged (HEADER_NAMES skip, magic
--     "середня заробітна плата країна%" handler, indicator lookup,
--     salary, animal, unresolved fallback) — preserved verbatim.
--   - Old reference branch at "Step 4" of the original function is
--     REMOVED (replaced by the new top-of-loop handler).
--   - Existing counters (c_reference) are reused for per-line inserts.
--   - Frontend (parse-summary-xlsx.js) is NOT touched — this fix works
--     with the current multiline value_text emit shape.

CREATE OR REPLACE FUNCTION public.fn_upload_monthly_batch(p_rows jsonb, p_batch_id uuid, p_source_file text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    r                    JSONB;
    v_name_raw           TEXT;
    v_name_norm          TEXT;
    v_group              TEXT;
    v_block              TEXT;
    v_year               INT;
    v_month              INT;
    v_num                NUMERIC;
    v_text               TEXT;
    v_ind_id             UUID;
    v_ind_kind           TEXT;
    v_ind_block          TEXT;
    v_ambig_match_count  INT;
    v_branch_id          UUID;
    v_species_id         UUID;
    v_clean_name         TEXT;
    v_population         INT;
    v_vol                NUMERIC;
    v_price              NUMERIC;
    v_parts              TEXT[];

    c_indicator             INT := 0;
    c_volprice              INT := 0;
    c_salary                INT := 0;
    c_animal                INT := 0;
    c_reference             INT := 0;
    c_skipped_header        INT := 0;
    c_skipped_invalid       INT := 0;
    c_unresolved            INT := 0;
    c_unresolved_reference  INT := 0;
    c_total                 INT := 0;

    HEADER_NAMES CONSTANT TEXT[] := ARRAY[
        'показники','довідково','довідково:',
        'в тому числі:','чисельність/кількість лімітів',
        'дані відсутні','*дані відсутні',
        'середня з/п по філіях одного штатного працівника, грн',
        'середня з/п по філіях одного штатного працівника,  грн'
    ];
BEGIN
    FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
        c_total    := c_total + 1;
        v_name_raw := r->>'indicator_name';
        v_group    := r->>'indicator_group';
        v_year     := NULLIF(r->>'year','')::INT;
        v_month    := NULLIF(r->>'month','')::INT;
        v_num      := NULLIF(r->>'value_numeric','')::NUMERIC;
        v_text     := NULLIF(r->>'value_text','');

        v_name_norm := fn_normalize_indicator_name(v_name_raw);

        -- 0. Reference handling — MUST run before HEADER_NAMES skip
        --    (frontend emits indicator_name='Довідково' which would otherwise
        --    be skipped). Per-line categorization via sql/21 resolver.
        IF v_group = 'reference' AND v_text IS NOT NULL THEN
            DECLARE
                line             TEXT;
                current_section  TEXT := NULL;
                detected_section TEXT;
                resolved_cat     TEXT;
            BEGIN
                FOREACH line IN ARRAY string_to_array(v_text, E'\n') LOOP
                    line := TRIM(line);
                    CONTINUE WHEN line = '' OR line IS NULL;

                    detected_section := fn_detect_section_header(line);
                    IF detected_section IS NOT NULL THEN
                        current_section := detected_section;
                        CONTINUE;
                    END IF;

                    resolved_cat := fn_resolve_reference_category(line, current_section);

                    IF resolved_cat IS NULL THEN
                        c_unresolved_reference := c_unresolved_reference + 1;
                        CONTINUE;
                    END IF;

                    INSERT INTO reference_text
                        (period_year, period_month, category, content, upload_batch_id)
                    VALUES (COALESCE(v_year, 0), COALESCE(v_month, 0),
                            resolved_cat, line, p_batch_id)
                    ON CONFLICT (period_year, period_month, category) DO UPDATE
                    SET content = EXCLUDED.content,
                        upload_batch_id = EXCLUDED.upload_batch_id;

                    c_reference := c_reference + 1;
                END LOOP;
            END;
            CONTINUE;
        END IF;

        IF v_name_norm = ANY(HEADER_NAMES) OR v_name_norm LIKE '*%' THEN
            c_skipped_header := c_skipped_header + 1;
            CONTINUE;
        END IF;

        -- Skip "Середня заробітна плата країна - XXXXX грн." (reference довідка)
        IF v_name_norm LIKE 'середня заробітна плата країна%' THEN
            IF v_num IS NOT NULL THEN
                INSERT INTO reference_text (period_year, period_month, category, content, upload_batch_id)
                VALUES (COALESCE(v_year, 0), COALESCE(v_month, 0),
                        'avg_salary_country', v_name_raw, p_batch_id)
                ON CONFLICT (period_year, period_month, category) DO UPDATE
                SET content = EXCLUDED.content,
                    upload_batch_id = EXCLUDED.upload_batch_id;
                c_reference := c_reference + 1;
            ELSE
                c_skipped_header := c_skipped_header + 1;
            END IF;
            CONTINUE;
        END IF;

        -- period_month валідуємо: 0..13 (0=annual, 1..12=місяці, 13=YTD)
        IF v_month IS NULL OR v_month < 0 OR v_month > 13 THEN
            c_skipped_invalid := c_skipped_invalid + 1;
            CONTINUE;
        END IF;

        v_block := CASE v_group
            WHEN 'finance'          THEN 'M_FIN'
            WHEN 'revenue'          THEN 'M_REV'
            WHEN 'production'       THEN 'M_PROD'
            WHEN 'forestry'         THEN 'M_FOR'
            WHEN 'tax'              THEN 'M_TAX'
            WHEN 'salary'           THEN 'M_SAL'
            WHEN 'salary_by_branch' THEN 'M_SAL'
            WHEN 'animals'          THEN 'M_ANIMALS'
            WHEN 'reference'        THEN 'M_REF'
            WHEN 'region_salary'    THEN 'M_SAL'
            ELSE NULL
        END;

        -- 1. Indicator lookup
        SELECT COUNT(*) INTO v_ambig_match_count
        FROM indicator_aliases ia
        WHERE ia.alias_normalized = v_name_norm;

        v_ind_id := NULL;
        IF v_ambig_match_count = 1 THEN
            SELECT ia.indicator_id, i.value_kind, i.block_id
              INTO v_ind_id, v_ind_kind, v_ind_block
              FROM indicator_aliases ia JOIN indicators i ON i.id = ia.indicator_id
             WHERE ia.alias_normalized = v_name_norm;
        ELSIF v_ambig_match_count > 1 THEN
            SELECT ia.indicator_id, i.value_kind, i.block_id
              INTO v_ind_id, v_ind_kind, v_ind_block
              FROM indicator_aliases ia JOIN indicators i ON i.id = ia.indicator_id
             WHERE ia.alias_normalized = v_name_norm
               AND i.block_id = v_block
             LIMIT 1;
        END IF;

        IF v_ind_id IS NOT NULL THEN
            IF v_ind_kind = 'volprice' THEN
                v_vol := NULL; v_price := NULL;
                IF v_text IS NOT NULL THEN
                    v_parts := REGEXP_MATCHES(v_text, '^\s*([\d\s,\.]+)\s*[\/\(]\s*([\d\s,\.]+)');
                    IF v_parts IS NOT NULL THEN
                        v_vol   := REPLACE(REPLACE(v_parts[1], ' ', ''), ',', '.')::NUMERIC;
                        v_price := REPLACE(REPLACE(v_parts[2], ' ', ''), ',', '.')::NUMERIC;
                    END IF;
                END IF;
                IF v_vol IS NULL AND v_num IS NOT NULL THEN
                    v_vol := v_num;
                END IF;

                INSERT INTO indicator_volprice_values
                    (indicator_id, period_year, period_month, volume, price, raw_text, source_file, upload_batch_id)
                VALUES (v_ind_id, v_year, v_month, v_vol, v_price, v_text, p_source_file, p_batch_id)
                ON CONFLICT (indicator_id, period_year, period_month) DO UPDATE
                SET volume = EXCLUDED.volume,
                    price = EXCLUDED.price,
                    raw_text = EXCLUDED.raw_text,
                    upload_batch_id = EXCLUDED.upload_batch_id;
                c_volprice := c_volprice + 1;
            ELSE
                INSERT INTO indicator_values
                    (indicator_id, period_year, period_month, value_numeric, value_text, source_file, upload_batch_id)
                VALUES (v_ind_id, v_year, v_month, v_num, v_text, p_source_file, p_batch_id)
                ON CONFLICT (indicator_id, period_year, period_month) DO UPDATE
                SET value_numeric = EXCLUDED.value_numeric,
                    value_text = EXCLUDED.value_text,
                    upload_batch_id = EXCLUDED.upload_batch_id,
                    updated_at = NOW();
                c_indicator := c_indicator + 1;
            END IF;
            CONTINUE;
        END IF;

        -- 2. Salary branch lookup
        SELECT branch_id INTO v_branch_id
          FROM salary_branch_aliases
         WHERE alias_normalized = v_name_norm
         LIMIT 1;

        IF v_branch_id IS NOT NULL THEN
            INSERT INTO salary_values
                (branch_id, period_year, period_month, salary_uah, region_avg_uah, upload_batch_id)
            VALUES (
                v_branch_id, COALESCE(v_year,0), v_month,
                CASE WHEN v_group IN ('salary','salary_by_branch','finance') THEN v_num ELSE NULL END,
                CASE WHEN v_group = 'region_salary' THEN v_num ELSE NULL END,
                p_batch_id
            )
            ON CONFLICT (branch_id, period_year, period_month) DO UPDATE
            SET salary_uah     = COALESCE(EXCLUDED.salary_uah, salary_values.salary_uah),
                region_avg_uah = COALESCE(EXCLUDED.region_avg_uah, salary_values.region_avg_uah),
                upload_batch_id = EXCLUDED.upload_batch_id;
            c_salary := c_salary + 1;
            CONTINUE;
        END IF;

        -- 3. Animal species lookup
        IF v_group = 'animals' THEN
            v_parts := REGEXP_MATCHES(COALESCE(v_text, v_name_raw), '^(.+?)\s+([\d\s]+)\s*[\/\*\\]');
            IF v_parts IS NOT NULL THEN
                v_clean_name := fn_normalize_indicator_name(v_parts[1]);
                v_population := REPLACE(v_parts[2], ' ', '')::INT;
            ELSE
                v_clean_name := v_name_norm;
                v_population := NULL;
            END IF;

            SELECT species_id INTO v_species_id
              FROM animal_species_aliases
             WHERE alias_normalized = v_clean_name
             LIMIT 1;

            IF v_species_id IS NOT NULL THEN
                INSERT INTO animal_values
                    (species_id, period_year, population, limit_qty, raw_text, upload_batch_id)
                VALUES (v_species_id, v_year, v_population, NULL,
                        COALESCE(v_text, v_name_raw), p_batch_id)
                ON CONFLICT (species_id, period_year) DO UPDATE
                SET population = EXCLUDED.population,
                    raw_text = EXCLUDED.raw_text,
                    upload_batch_id = EXCLUDED.upload_batch_id;
                c_animal := c_animal + 1;
                CONTINUE;
            END IF;
        END IF;

        -- 4. Reference text — REMOVED in migration 22.
        --    Reference handling moved to top of loop (Step 0) for per-line
        --    categorization. This branch was a fallback that wrote the
        --    entire multiline blob into category='other' and was never
        --    reachable for the frontend payload (HEADER_NAMES skip caught
        --    it first). Nothing to do here now.

        -- 5. Unresolved
        INSERT INTO indicator_alias_unresolved
            (batch_id, source_file, excel_name, normalized, resolution)
        VALUES (p_batch_id, p_source_file, v_name_raw, v_name_norm,
                'group=' || COALESCE(v_group,'null'));
        c_unresolved := c_unresolved + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'total',                c_total,
        'indicator',            c_indicator,
        'volprice',             c_volprice,
        'salary',               c_salary,
        'animal',               c_animal,
        'reference',            c_reference,
        'skipped_header',       c_skipped_header,
        'skipped_invalid',      c_skipped_invalid,
        'unresolved',           c_unresolved,
        'unresolved_reference', c_unresolved_reference
    );
END;
$function$;

COMMENT ON FUNCTION public.fn_upload_monthly_batch(jsonb, uuid, text) IS
'Monthly batch upload RPC. Migration 22 (2026-05-04): reference branch '
'moved to top of loop for per-line categorization via fn_detect_section_header '
'+ fn_resolve_reference_category (sql/21). Phase 1 wrote the entire '
'value_text into category=''other'' and was unreachable due to HEADER_NAMES '
'skipping ''Довідково''. Returns counters incl. unresolved_reference for '
'per-line warnings.';
