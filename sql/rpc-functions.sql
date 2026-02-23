-- ============================================================
-- RPC Functions: серверна бізнес-логіка
-- Замінює клієнтську агрегацію → 1 SQL-запит
--
-- Run this in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 1. get_executive_metrics() — агрегація Executive Dashboard
--    Замінює 115 рядків клієнтського JS (state-executive.js)
--    на один SQL-запит (~10ms замість 2-3s клієнтської агрегації)
-- ============================================================

CREATE OR REPLACE FUNCTION get_executive_metrics()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT json_build_object(
        -- KPI YTD
        'realizedTotal', (
            SELECT COALESCE(SUM(value), 0)
            FROM kpi_records
            WHERE type = 'realized'
            AND date >= date_trunc('year', now())::date
        ),
        'harvestedTotal', (
            SELECT COALESCE(SUM(value), 0)
            FROM kpi_records
            WHERE type = 'harvested'
            AND date >= date_trunc('year', now())::date
        ),
        'cashTotal', (
            SELECT COALESCE(SUM(value), 0)
            FROM kpi_records
            WHERE type IN ('cash_daily', 'cash_monthly')
            AND date >= date_trunc('year', now())::date
        ),

        -- Forest prices
        'avgPrice', (
            SELECT COALESCE(AVG(weighted_price_uah), 0)
            FROM forest_prices
        ),
        'totalVolumeSold', (
            SELECT COALESCE(SUM(volume_m3), 0)
            FROM forest_prices
        ),

        -- Forest inventory
        'inventoryTotal', (
            SELECT COALESCE(SUM(remaining_volume_m3), 0)
            FROM forest_inventory
        ),

        -- Harvesting
        'pfSummary', (
            SELECT json_build_object(
                'annualPlan', COALESCE(SUM(annual_plan_total), 0),
                'harvested', COALESCE(SUM(harvested_total), 0),
                'ninePlan', COALESCE(SUM(nine_month_plan_total), 0)
            )
            FROM harvesting_plan_fact
        ),

        -- ZSU
        'zsuSummary', (
            SELECT json_build_object(
                'totalDeclared', COALESCE(SUM(forest_products_declared_m3 + lumber_declared_m3), 0),
                'totalShipped', COALESCE(SUM(forest_products_shipped_m3 + lumber_shipped_m3), 0)
            )
            FROM harvesting_zsu
        ),

        -- Regional scorecard
        'scorecard', (
            SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
            FROM (
                SELECT
                    pf.regional_office AS name,
                    CASE WHEN pf.annual_plan_total > 0
                        THEN ROUND((pf.harvested_total::numeric / pf.annual_plan_total * 100), 1)
                        ELSE 0
                    END AS plan_pct,
                    pf.harvested_total AS harvested,
                    COALESCE(z.zsu_pct, 0) AS zsu_pct
                FROM harvesting_plan_fact pf
                LEFT JOIN (
                    SELECT
                        regional_office,
                        CASE
                            WHEN SUM(forest_products_declared_m3 + lumber_declared_m3) > 0
                            THEN ROUND((SUM(forest_products_shipped_m3 + lumber_shipped_m3)::numeric
                                / SUM(forest_products_declared_m3 + lumber_declared_m3) * 100), 1)
                            ELSE 0
                        END AS zsu_pct
                    FROM harvesting_zsu
                    GROUP BY regional_office
                ) z ON z.regional_office = pf.regional_office
                ORDER BY plan_pct
            ) t
        ),

        -- Monthly cash
        'monthlyCash', (
            SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
            FROM (
                SELECT
                    to_char(date::date, 'YYYY-MM') AS month,
                    SUM(value) AS total
                FROM kpi_records
                WHERE type IN ('cash_daily', 'cash_monthly')
                GROUP BY to_char(date::date, 'YYYY-MM')
                ORDER BY month
            ) t
        ),

        -- Sparkline data (last 30 days)
        'realizedSpark', (
            SELECT COALESCE(json_agg(value ORDER BY date), '[]'::json)
            FROM kpi_records
            WHERE type = 'realized'
            AND date >= (now() - interval '30 days')::date
        ),
        'harvestedSpark', (
            SELECT COALESCE(json_agg(value ORDER BY date), '[]'::json)
            FROM kpi_records
            WHERE type = 'harvested'
            AND date >= (now() - interval '30 days')::date
        ),

        -- Data availability flags
        'hasKpi', (SELECT EXISTS(SELECT 1 FROM kpi_records LIMIT 1)),
        'hasForest', (SELECT EXISTS(SELECT 1 FROM forest_prices LIMIT 1)),
        'hasHarvesting', (SELECT EXISTS(SELECT 1 FROM harvesting_plan_fact LIMIT 1)),
        'hasMarket', (SELECT EXISTS(SELECT 1 FROM market_prices LIMIT 1))
    );
$$;

-- ============================================================
-- 2. clear_data(table_name) — безпечна очистка таблиці
--    Замінює клієнтський хак .delete().neq('id', '')
--    Перевіряє роль на сервері (SECURITY DEFINER)
-- ============================================================

CREATE OR REPLACE FUNCTION clear_data(p_table text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    allowed_tables text[] := ARRAY[
        'kpi_records', 'forest_prices', 'forest_inventory',
        'harvesting_plan_fact', 'harvesting_zsu',
        'market_prices', 'market_prices_ua', 'market_price_history', 'eur_rates'
    ];
    deleted_count integer;
BEGIN
    -- Перевірка ролі
    IF NOT public.user_has_role(ARRAY['admin', 'editor']) THEN
        RAISE EXCEPTION 'Unauthorized: only admin/editor can clear data';
    END IF;

    -- Захист від SQL injection — дозволені тільки відомі таблиці
    IF NOT p_table = ANY(allowed_tables) THEN
        RAISE EXCEPTION 'Invalid table name: %', p_table;
    END IF;

    EXECUTE format('DELETE FROM %I', p_table);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    -- Очистити пов'язані записи в upload_history
    DELETE FROM forest_upload_history
    WHERE data_type = CASE
        WHEN p_table = 'kpi_records' THEN 'kpi'
        WHEN p_table = 'forest_prices' THEN 'prices'
        WHEN p_table = 'forest_inventory' THEN 'inventory'
        WHEN p_table = 'harvesting_plan_fact' THEN 'harvesting_plan_fact'
        WHEN p_table = 'harvesting_zsu' THEN 'harvesting_zsu'
        WHEN p_table IN ('market_prices', 'market_prices_ua', 'market_price_history', 'eur_rates') THEN 'market_prices'
        ELSE ''
    END;

    RETURN json_build_object('deleted', deleted_count, 'table', p_table);
END;
$$;

-- ============================================================
-- 3. get_record_counts() — кількість записів у всіх таблицях
--    Для Data Management модалу (замість 6 окремих запитів)
-- ============================================================

CREATE OR REPLACE FUNCTION get_record_counts()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT json_build_object(
        'kpi', (SELECT count(*) FROM kpi_records),
        'prices', (SELECT count(*) FROM forest_prices),
        'inventory', (SELECT count(*) FROM forest_inventory),
        'planFact', (SELECT count(*) FROM harvesting_plan_fact),
        'zsu', (SELECT count(*) FROM harvesting_zsu),
        'market', (SELECT count(*) FROM market_prices),
        'marketUa', (SELECT count(*) FROM market_prices_ua),
        'history', (SELECT count(*) FROM market_price_history),
        'eurRates', (SELECT count(*) FROM eur_rates)
    );
$$;

-- ============================================================
-- Перевірка:
-- SELECT get_executive_metrics();
-- SELECT get_record_counts();
-- SELECT clear_data('kpi_records');  -- тільки admin/editor
-- ============================================================
