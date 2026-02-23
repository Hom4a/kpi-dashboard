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
-- 4. get_kpi_summary(date_from, date_to) — агрегація KPI за період
--    Замінює клієнтську агрегацію в render-volumes.js / render-finance.js
-- ============================================================

CREATE OR REPLACE FUNCTION get_kpi_summary(
    p_date_from date DEFAULT NULL,
    p_date_to date DEFAULT NULL
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT json_build_object(
        'realized', (
            SELECT COALESCE(SUM(value), 0)
            FROM kpi_records
            WHERE type = 'realized'
            AND (p_date_from IS NULL OR date >= p_date_from)
            AND (p_date_to IS NULL OR date <= p_date_to)
        ),
        'harvested', (
            SELECT COALESCE(SUM(value), 0)
            FROM kpi_records
            WHERE type = 'harvested'
            AND (p_date_from IS NULL OR date >= p_date_from)
            AND (p_date_to IS NULL OR date <= p_date_to)
        ),
        'cashDaily', (
            SELECT COALESCE(SUM(value), 0)
            FROM kpi_records
            WHERE type = 'cash_daily'
            AND (p_date_from IS NULL OR date >= p_date_from)
            AND (p_date_to IS NULL OR date <= p_date_to)
        ),
        'cashMonthly', (
            SELECT COALESCE(SUM(value), 0)
            FROM kpi_records
            WHERE type = 'cash_monthly'
            AND (p_date_from IS NULL OR date >= p_date_from)
            AND (p_date_to IS NULL OR date <= p_date_to)
        ),
        'recordCount', (
            SELECT count(*)
            FROM kpi_records
            WHERE (p_date_from IS NULL OR date >= p_date_from)
            AND (p_date_to IS NULL OR date <= p_date_to)
        ),
        'dateRange', (
            SELECT json_build_object(
                'min', MIN(date),
                'max', MAX(date)
            )
            FROM kpi_records
            WHERE (p_date_from IS NULL OR date >= p_date_from)
            AND (p_date_to IS NULL OR date <= p_date_to)
        ),
        'monthlyBreakdown', (
            SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.month), '[]'::json)
            FROM (
                SELECT
                    to_char(date::date, 'YYYY-MM') AS month,
                    SUM(CASE WHEN type = 'realized' THEN value ELSE 0 END) AS realized,
                    SUM(CASE WHEN type = 'harvested' THEN value ELSE 0 END) AS harvested,
                    SUM(CASE WHEN type IN ('cash_daily', 'cash_monthly') THEN value ELSE 0 END) AS cash
                FROM kpi_records
                WHERE (p_date_from IS NULL OR date >= p_date_from)
                AND (p_date_to IS NULL OR date <= p_date_to)
                GROUP BY to_char(date::date, 'YYYY-MM')
            ) t
        ),
        'dailyAvg', (
            SELECT json_build_object(
                'realized', COALESCE(AVG(daily_val), 0),
                'harvested', COALESCE(AVG(daily_harv), 0)
            )
            FROM (
                SELECT
                    date,
                    SUM(CASE WHEN type = 'realized' THEN value ELSE 0 END) AS daily_val,
                    SUM(CASE WHEN type = 'harvested' THEN value ELSE 0 END) AS daily_harv
                FROM kpi_records
                WHERE (p_date_from IS NULL OR date >= p_date_from)
                AND (p_date_to IS NULL OR date <= p_date_to)
                GROUP BY date
            ) d
        )
    );
$$;

-- ============================================================
-- 5. get_forest_summary(branch, product, species) — агрегація Forest
--    Ціни + залишки з опціональними фільтрами
-- ============================================================

CREATE OR REPLACE FUNCTION get_forest_summary(
    p_branch text DEFAULT NULL,
    p_product text DEFAULT NULL,
    p_species text DEFAULT NULL
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT json_build_object(
        'prices', json_build_object(
            'totalRecords', (
                SELECT count(*) FROM forest_prices
                WHERE (p_branch IS NULL OR branch = p_branch)
                AND (p_product IS NULL OR product = p_product)
                AND (p_species IS NULL OR species = p_species)
            ),
            'avgPrice', (
                SELECT COALESCE(AVG(weighted_price_uah), 0) FROM forest_prices
                WHERE (p_branch IS NULL OR branch = p_branch)
                AND (p_product IS NULL OR product = p_product)
                AND (p_species IS NULL OR species = p_species)
            ),
            'totalVolume', (
                SELECT COALESCE(SUM(volume_m3), 0) FROM forest_prices
                WHERE (p_branch IS NULL OR branch = p_branch)
                AND (p_product IS NULL OR product = p_product)
                AND (p_species IS NULL OR species = p_species)
            ),
            'totalValue', (
                SELECT COALESCE(SUM(total_value_uah), 0) FROM forest_prices
                WHERE (p_branch IS NULL OR branch = p_branch)
                AND (p_product IS NULL OR product = p_product)
                AND (p_species IS NULL OR species = p_species)
            ),
            'byProduct', (
                SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
                FROM (
                    SELECT product, count(*) AS cnt,
                        ROUND(AVG(weighted_price_uah)::numeric, 2) AS avg_price,
                        ROUND(SUM(volume_m3)::numeric, 2) AS total_volume,
                        ROUND(SUM(total_value_uah)::numeric, 2) AS total_value
                    FROM forest_prices
                    WHERE (p_branch IS NULL OR branch = p_branch)
                    AND (p_product IS NULL OR product = p_product)
                    AND (p_species IS NULL OR species = p_species)
                    GROUP BY product ORDER BY total_volume DESC
                ) t
            ),
            'bySpecies', (
                SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
                FROM (
                    SELECT species, count(*) AS cnt,
                        ROUND(AVG(weighted_price_uah)::numeric, 2) AS avg_price,
                        ROUND(SUM(volume_m3)::numeric, 2) AS total_volume
                    FROM forest_prices
                    WHERE (p_branch IS NULL OR branch = p_branch)
                    AND (p_product IS NULL OR product = p_product)
                    AND (p_species IS NULL OR species = p_species)
                    GROUP BY species ORDER BY total_volume DESC LIMIT 15
                ) t
            ),
            'byBranch', (
                SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
                FROM (
                    SELECT branch, count(*) AS cnt,
                        ROUND(AVG(weighted_price_uah)::numeric, 2) AS avg_price,
                        ROUND(SUM(volume_m3)::numeric, 2) AS total_volume,
                        ROUND(SUM(total_value_uah)::numeric, 2) AS total_value
                    FROM forest_prices
                    WHERE (p_branch IS NULL OR branch = p_branch)
                    AND (p_product IS NULL OR product = p_product)
                    AND (p_species IS NULL OR species = p_species)
                    GROUP BY branch ORDER BY total_value DESC
                ) t
            )
        ),
        'inventory', json_build_object(
            'totalRecords', (SELECT count(*) FROM forest_inventory
                WHERE (p_branch IS NULL OR branch = p_branch)
                AND (p_product IS NULL OR product = p_product)
                AND (p_species IS NULL OR species = p_species)),
            'totalVolume', (SELECT COALESCE(SUM(remaining_volume_m3), 0) FROM forest_inventory
                WHERE (p_branch IS NULL OR branch = p_branch)
                AND (p_product IS NULL OR product = p_product)
                AND (p_species IS NULL OR species = p_species)),
            'byBranch', (
                SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
                FROM (
                    SELECT branch, count(*) AS cnt,
                        ROUND(SUM(remaining_volume_m3)::numeric, 2) AS total_volume
                    FROM forest_inventory
                    WHERE (p_branch IS NULL OR branch = p_branch)
                    AND (p_product IS NULL OR product = p_product)
                    AND (p_species IS NULL OR species = p_species)
                    GROUP BY branch ORDER BY total_volume DESC LIMIT 15
                ) t
            ),
            'byProduct', (
                SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
                FROM (
                    SELECT product, count(*) AS cnt,
                        ROUND(SUM(remaining_volume_m3)::numeric, 2) AS total_volume
                    FROM forest_inventory
                    WHERE (p_branch IS NULL OR branch = p_branch)
                    AND (p_product IS NULL OR product = p_product)
                    AND (p_species IS NULL OR species = p_species)
                    GROUP BY product ORDER BY total_volume DESC
                ) t
            )
        )
    );
$$;

-- ============================================================
-- 6. get_harvesting_summary() — агрегація Заготівлі
--    Plan-fact + ZSU в одному запиті
-- ============================================================

CREATE OR REPLACE FUNCTION get_harvesting_summary()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT json_build_object(
        'planFact', json_build_object(
            'annualPlanTotal', (SELECT COALESCE(SUM(annual_plan_total), 0) FROM harvesting_plan_fact),
            'harvestedTotal', (SELECT COALESCE(SUM(harvested_total), 0) FROM harvesting_plan_fact),
            'nineMonthPlanTotal', (SELECT COALESCE(SUM(nine_month_plan_total), 0) FROM harvesting_plan_fact),
            'executionPct', (
                SELECT CASE WHEN SUM(annual_plan_total) > 0
                    THEN ROUND((SUM(harvested_total)::numeric / SUM(annual_plan_total) * 100), 1)
                    ELSE 0 END
                FROM harvesting_plan_fact
            ),
            'byRegion', (
                SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.execution_pct), '[]'::json)
                FROM (
                    SELECT
                        regional_office,
                        annual_plan_total,
                        nine_month_plan_total,
                        harvested_total,
                        CASE WHEN annual_plan_total > 0
                            THEN ROUND((harvested_total::numeric / annual_plan_total * 100), 1)
                            ELSE 0
                        END AS execution_pct,
                        CASE WHEN nine_month_plan_total > 0
                            THEN ROUND((harvested_total::numeric / nine_month_plan_total * 100), 1)
                            ELSE 0
                        END AS nine_month_pct
                    FROM harvesting_plan_fact
                ) t
            )
        ),
        'zsu', json_build_object(
            'totalDeclared', (
                SELECT COALESCE(SUM(forest_products_declared_m3 + lumber_declared_m3), 0)
                FROM harvesting_zsu
            ),
            'totalShipped', (
                SELECT COALESCE(SUM(forest_products_shipped_m3 + lumber_shipped_m3), 0)
                FROM harvesting_zsu
            ),
            'fulfillmentPct', (
                SELECT CASE
                    WHEN SUM(forest_products_declared_m3 + lumber_declared_m3) > 0
                    THEN ROUND((SUM(forest_products_shipped_m3 + lumber_shipped_m3)::numeric
                        / SUM(forest_products_declared_m3 + lumber_declared_m3) * 100), 1)
                    ELSE 0 END
                FROM harvesting_zsu
            ),
            'byRegion', (
                SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
                FROM (
                    SELECT
                        regional_office,
                        forest_products_declared_m3,
                        forest_products_shipped_m3,
                        lumber_declared_m3,
                        lumber_shipped_m3,
                        CASE
                            WHEN (forest_products_declared_m3 + lumber_declared_m3) > 0
                            THEN ROUND(((forest_products_shipped_m3 + lumber_shipped_m3)::numeric
                                / (forest_products_declared_m3 + lumber_declared_m3) * 100), 1)
                            ELSE 0
                        END AS fulfillment_pct
                    FROM harvesting_zsu
                    ORDER BY fulfillment_pct
                ) t
            )
        ),
        'recordCounts', json_build_object(
            'planFact', (SELECT count(*) FROM harvesting_plan_fact),
            'zsu', (SELECT count(*) FROM harvesting_zsu)
        )
    );
$$;

-- ============================================================
-- 7. get_market_comparison(period) — порівняння ринкових цін
--    UA vs EU, по видах деревини
-- ============================================================

CREATE OR REPLACE FUNCTION get_market_comparison(
    p_period text DEFAULT NULL
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT json_build_object(
        'countries', (
            SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
            FROM (
                SELECT country, source_name, row_type,
                    pine_business, spruce_business, alder_business, birch_business, oak_business,
                    pine_firewood, spruce_firewood, alder_firewood, birch_firewood, oak_firewood,
                    avg_price
                FROM market_prices
                WHERE (p_period IS NULL OR period = p_period)
                ORDER BY row_type, country
            ) t
        ),
        'uaDetail', (
            SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
            FROM (
                SELECT exchange, species, volume_m3, avg_price_uah, avg_price_eur
                FROM market_prices_ua
                WHERE (p_period IS NULL OR period = p_period)
                ORDER BY exchange, species
            ) t
        ),
        'history', (
            SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
            FROM (
                SELECT data_type, entity_name, month_date, price_eur
                FROM market_price_history
                ORDER BY data_type, entity_name, month_date
            ) t
        ),
        'eurRate', (
            SELECT COALESCE(eur_uah, 0)
            FROM eur_rates
            ORDER BY rate_date DESC LIMIT 1
        ),
        'periods', (
            SELECT COALESCE(json_agg(DISTINCT period ORDER BY period DESC), '[]'::json)
            FROM market_prices
        ),
        'summary', (
            SELECT json_build_object(
                'avgUa', COALESCE((
                    SELECT AVG(avg_price)
                    FROM market_prices
                    WHERE (p_period IS NULL OR period = p_period)
                    AND row_type = 'country'
                    AND (country ILIKE '%україна%' OR country ILIKE '%ukraine%')
                ), 0),
                'avgEu', COALESCE((
                    SELECT AVG(avg_price)
                    FROM market_prices
                    WHERE (p_period IS NULL OR period = p_period)
                    AND row_type = 'average'
                ), 0),
                'totalCountries', (
                    SELECT count(DISTINCT country)
                    FROM market_prices
                    WHERE (p_period IS NULL OR period = p_period)
                    AND row_type = 'country'
                )
            )
        )
    );
$$;

-- ============================================================
-- 8. get_system_health() — здоров'я системи
--    Record counts + last uploads + data freshness alerts
-- ============================================================

CREATE OR REPLACE FUNCTION get_system_health()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT json_build_object(
        'tables', (
            SELECT json_build_object(
                'kpi_records', (SELECT count(*) FROM kpi_records),
                'forest_prices', (SELECT count(*) FROM forest_prices),
                'forest_inventory', (SELECT count(*) FROM forest_inventory),
                'harvesting_plan_fact', (SELECT count(*) FROM harvesting_plan_fact),
                'harvesting_zsu', (SELECT count(*) FROM harvesting_zsu),
                'market_prices', (SELECT count(*) FROM market_prices),
                'market_prices_ua', (SELECT count(*) FROM market_prices_ua),
                'market_price_history', (SELECT count(*) FROM market_price_history),
                'eur_rates', (SELECT count(*) FROM eur_rates),
                'audit_log', (SELECT count(*) FROM audit_log),
                'profiles', (SELECT count(*) FROM profiles),
                'dashboard_configs', (SELECT count(*) FROM dashboard_configs)
            )
        ),
        'lastUploads', (
            SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
            FROM (
                SELECT data_type, file_name, row_count, uploaded_at,
                    EXTRACT(EPOCH FROM (now() - uploaded_at)) / 3600 AS hours_ago
                FROM forest_upload_history
                ORDER BY uploaded_at DESC
                LIMIT 20
            ) t
        ),
        'alerts', (
            SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
            FROM (
                SELECT * FROM (
                    -- Empty tables alert
                    SELECT 'warning' AS severity, 'KPI: немає даних' AS message,
                        'kpi_records' AS source
                    WHERE NOT EXISTS (SELECT 1 FROM kpi_records LIMIT 1)
                    UNION ALL
                    SELECT 'warning', 'Ціни: немає даних', 'forest_prices'
                    WHERE NOT EXISTS (SELECT 1 FROM forest_prices LIMIT 1)
                    UNION ALL
                    SELECT 'warning', 'Залишки: немає даних', 'forest_inventory'
                    WHERE NOT EXISTS (SELECT 1 FROM forest_inventory LIMIT 1)
                    UNION ALL
                    SELECT 'warning', 'Заготівля: немає даних', 'harvesting_plan_fact'
                    WHERE NOT EXISTS (SELECT 1 FROM harvesting_plan_fact LIMIT 1)
                    UNION ALL
                    SELECT 'warning', 'Ринок: немає даних', 'market_prices'
                    WHERE NOT EXISTS (SELECT 1 FROM market_prices LIMIT 1)
                    UNION ALL
                    -- Stale data alerts (no uploads in 7+ days)
                    SELECT 'info', 'KPI: не оновлювались >7 днів', 'kpi_records'
                    WHERE EXISTS (SELECT 1 FROM kpi_records LIMIT 1)
                    AND NOT EXISTS (
                        SELECT 1 FROM forest_upload_history
                        WHERE data_type = 'kpi'
                        AND uploaded_at > now() - interval '7 days'
                    )
                    UNION ALL
                    SELECT 'info', 'Ціни: не оновлювались >7 днів', 'forest_prices'
                    WHERE EXISTS (SELECT 1 FROM forest_prices LIMIT 1)
                    AND NOT EXISTS (
                        SELECT 1 FROM forest_upload_history
                        WHERE data_type = 'prices'
                        AND uploaded_at > now() - interval '7 days'
                    )
                ) alerts
            ) t
        ),
        'serverTime', now(),
        'dbVersion', current_setting('server_version')
    );
$$;

-- ============================================================
-- 9. get_audit_log(limit, offset) — пагінований аудит-лог
--    Для сторінки API & Система
-- ============================================================

CREATE OR REPLACE FUNCTION get_audit_log(
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0,
    p_table_name text DEFAULT NULL,
    p_action text DEFAULT NULL
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT json_build_object(
        'total', (
            SELECT count(*) FROM audit_log
            WHERE (p_table_name IS NULL OR table_name = p_table_name)
            AND (p_action IS NULL OR action = p_action)
        ),
        'records', (
            SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
            FROM (
                SELECT
                    a.id, a.table_name, a.action, a.record_id,
                    a.old_data, a.new_data, a.created_at,
                    p.full_name AS user_name,
                    p.role AS user_role
                FROM audit_log a
                LEFT JOIN profiles p ON p.id = a.user_id
                WHERE (p_table_name IS NULL OR a.table_name = p_table_name)
                AND (p_action IS NULL OR a.action = p_action)
                ORDER BY a.created_at DESC
                LIMIT p_limit OFFSET p_offset
            ) t
        )
    );
$$;

-- ============================================================
-- 10. get_anomalies() — виявлення аномалій у KPI даних
--     Порівняння з ковзним середнім (30 днів), поріг 2σ
-- ============================================================

CREATE OR REPLACE FUNCTION get_anomalies()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT json_build_object(
        'anomalies', (
            SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
            FROM (
                WITH daily AS (
                    SELECT date, type,
                        SUM(value) AS daily_value
                    FROM kpi_records
                    WHERE date >= (now() - interval '90 days')::date
                    GROUP BY date, type
                ),
                stats AS (
                    SELECT type,
                        AVG(daily_value) AS avg_val,
                        STDDEV(daily_value) AS std_val
                    FROM daily
                    GROUP BY type
                    HAVING STDDEV(daily_value) > 0
                ),
                anomalies AS (
                    SELECT d.date, d.type, d.daily_value,
                        s.avg_val, s.std_val,
                        ABS(d.daily_value - s.avg_val) / s.std_val AS z_score,
                        CASE
                            WHEN d.daily_value > s.avg_val + 2 * s.std_val THEN 'high'
                            WHEN d.daily_value < s.avg_val - 2 * s.std_val THEN 'low'
                            ELSE NULL
                        END AS direction
                    FROM daily d
                    JOIN stats s ON s.type = d.type
                    WHERE ABS(d.daily_value - s.avg_val) > 2 * s.std_val
                )
                SELECT date, type, daily_value, avg_val, z_score, direction
                FROM anomalies
                ORDER BY date DESC
                LIMIT 20
            ) t
        ),
        'harvestingAlerts', (
            SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
            FROM (
                SELECT regional_office,
                    annual_plan_total,
                    harvested_total,
                    CASE WHEN annual_plan_total > 0
                        THEN ROUND((harvested_total::numeric / annual_plan_total * 100), 1)
                        ELSE 0
                    END AS execution_pct,
                    'low_execution' AS alert_type
                FROM harvesting_plan_fact
                WHERE annual_plan_total > 0
                AND (harvested_total::numeric / annual_plan_total * 100) < 50
                ORDER BY (harvested_total::numeric / annual_plan_total * 100)
            ) t
        ),
        'zsuAlerts', (
            SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
            FROM (
                SELECT regional_office,
                    (forest_products_declared_m3 + lumber_declared_m3) AS total_declared,
                    (forest_products_shipped_m3 + lumber_shipped_m3) AS total_shipped,
                    CASE
                        WHEN (forest_products_declared_m3 + lumber_declared_m3) > 0
                        THEN ROUND(((forest_products_shipped_m3 + lumber_shipped_m3)::numeric
                            / (forest_products_declared_m3 + lumber_declared_m3) * 100), 1)
                        ELSE 0
                    END AS fulfillment_pct,
                    'low_zsu' AS alert_type
                FROM harvesting_zsu
                WHERE (forest_products_declared_m3 + lumber_declared_m3) > 0
                AND ((forest_products_shipped_m3 + lumber_shipped_m3)::numeric
                    / (forest_products_declared_m3 + lumber_declared_m3) * 100) < 50
                ORDER BY ((forest_products_shipped_m3 + lumber_shipped_m3)::numeric
                    / (forest_products_declared_m3 + lumber_declared_m3) * 100)
            ) t
        )
    );
$$;

-- ============================================================
-- Перевірка всіх функцій:
-- SELECT get_executive_metrics();
-- SELECT get_record_counts();
-- SELECT clear_data('kpi_records');  -- тільки admin/editor
-- SELECT get_kpi_summary('2025-01-01'::date, '2025-12-31'::date);
-- SELECT get_kpi_summary();  -- всі дати
-- SELECT get_forest_summary();  -- без фільтрів
-- SELECT get_forest_summary('Вінницька філія', NULL, 'Сосна');
-- SELECT get_harvesting_summary();
-- SELECT get_market_comparison();
-- SELECT get_market_comparison('Грудень 2025');
-- SELECT get_system_health();
-- SELECT get_audit_log(50, 0);
-- SELECT get_audit_log(10, 0, 'kpi_records', 'INSERT');
-- SELECT get_anomalies();
-- ============================================================
