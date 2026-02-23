-- ============================================================
-- Enable Supabase Realtime on monitored tables
-- Run this in Supabase SQL Editor
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE kpi_records;
ALTER PUBLICATION supabase_realtime ADD TABLE forest_prices;
ALTER PUBLICATION supabase_realtime ADD TABLE forest_inventory;
ALTER PUBLICATION supabase_realtime ADD TABLE harvesting_plan_fact;
ALTER PUBLICATION supabase_realtime ADD TABLE harvesting_zsu;
ALTER PUBLICATION supabase_realtime ADD TABLE market_prices;

-- ============================================================
-- Перевірка:
-- SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
-- ============================================================
