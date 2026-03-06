-- ============================================================
-- Composite Indexes for Common Query Patterns
-- Run this in Supabase SQL Editor
-- ============================================================

-- === TIER 1: Critical Path Indexes ===

-- kpi_records: Executive dashboard YTD queries (WHERE type = 'realized' AND date >= ...)
CREATE INDEX IF NOT EXISTS idx_kpi_type_date ON kpi_records(type, date DESC);

-- forest_prices: Multi-column filtering in forest summary RPC
CREATE INDEX IF NOT EXISTS idx_fp_branch_product_species ON forest_prices(branch, product, species);

-- forest_inventory: Same multi-column filtering pattern
CREATE INDEX IF NOT EXISTS idx_fi_branch_product_species ON forest_inventory(branch, product, species);

-- market_prices: Period + country filtering, ORDER BY row_type
CREATE INDEX IF NOT EXISTS idx_mp_period_country_type ON market_prices(period, country, row_type);


-- === TIER 2: Batch Operation Indexes ===

-- harvesting: Office-based lookups for dedup + RPC
CREATE INDEX IF NOT EXISTS idx_hpf_office_batch ON harvesting_plan_fact(regional_office, upload_batch_id);
CREATE INDEX IF NOT EXISTS idx_hzsu_office_batch ON harvesting_zsu(regional_office, upload_batch_id);

-- market_prices_ua: Period + exchange filtering
CREATE INDEX IF NOT EXISTS idx_mpua_period_exchange ON market_prices_ua(period, exchange, species);


-- === TIER 3: Aggregation Indexes ===

-- summary_indicators: Year/month queries with group filter
CREATE INDEX IF NOT EXISTS idx_si_year_month_group ON summary_indicators(year, month, indicator_group);

-- kpi_records: Reverse order for monthly aggregation GROUP BY
CREATE INDEX IF NOT EXISTS idx_kpi_date_type ON kpi_records(date DESC, type);

-- eur_rates: Unique date to support NBU rate upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_eur_rate_date_unique ON eur_rates(rate_date);


-- ============================================================
-- Verify with: SELECT indexname, tablename FROM pg_indexes
--              WHERE schemaname = 'public' ORDER BY tablename;
-- ============================================================
