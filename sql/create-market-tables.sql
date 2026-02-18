-- ===== Market Prices (International Benchmarks) =====

-- 1. International price comparison by country
CREATE TABLE IF NOT EXISTS market_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_batch_id UUID NOT NULL,
    period TEXT,
    eur_rate NUMERIC,
    country TEXT NOT NULL,
    source_name TEXT,
    row_type TEXT NOT NULL DEFAULT 'country'
        CHECK (row_type IN ('country', 'source', 'average')),
    pine_business NUMERIC,
    spruce_business NUMERIC,
    alder_business NUMERIC,
    birch_business NUMERIC,
    oak_business NUMERIC,
    pine_firewood NUMERIC,
    spruce_firewood NUMERIC,
    birch_firewood NUMERIC,
    avg_price NUMERIC,
    vat_info TEXT,
    comments TEXT,
    source_url TEXT,
    uploaded_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mp_batch ON market_prices(upload_batch_id);
CREATE INDEX IF NOT EXISTS idx_mp_country ON market_prices(country);
CREATE INDEX IF NOT EXISTS idx_mp_row_type ON market_prices(row_type);

-- 2. Ukrainian exchange breakdown (UEB / UUB / URB)
CREATE TABLE IF NOT EXISTS market_prices_ua (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_batch_id UUID NOT NULL,
    period TEXT,
    exchange TEXT NOT NULL
        CHECK (exchange IN ('УЕБ', 'УУБ', 'УРБ', 'summary')),
    species TEXT NOT NULL,
    volume_m3 NUMERIC,
    total_uah NUMERIC,
    avg_price_uah NUMERIC,
    avg_price_eur NUMERIC,
    uploaded_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mpua_batch ON market_prices_ua(upload_batch_id);
CREATE INDEX IF NOT EXISTS idx_mpua_exchange ON market_prices_ua(exchange);

-- 3. Monthly time series (country averages + UA species)
CREATE TABLE IF NOT EXISTS market_price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_batch_id UUID NOT NULL,
    data_type TEXT NOT NULL
        CHECK (data_type IN ('country_avg', 'ua_species')),
    entity_name TEXT NOT NULL,
    month_date DATE NOT NULL,
    price_eur NUMERIC,
    uploaded_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mph_batch ON market_price_history(upload_batch_id);
CREATE INDEX IF NOT EXISTS idx_mph_type ON market_price_history(data_type);
CREATE INDEX IF NOT EXISTS idx_mph_entity ON market_price_history(entity_name);
CREATE INDEX IF NOT EXISTS idx_mph_month ON market_price_history(month_date);

-- 4. EUR exchange rates (daily)
CREATE TABLE IF NOT EXISTS eur_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_batch_id UUID NOT NULL,
    rate_date DATE NOT NULL,
    eur_uah NUMERIC NOT NULL,
    uploaded_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eur_batch ON eur_rates(upload_batch_id);
CREATE INDEX IF NOT EXISTS idx_eur_date ON eur_rates(rate_date);

-- RLS
ALTER TABLE market_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_prices_ua ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE eur_rates ENABLE ROW LEVEL SECURITY;

-- Read policies
CREATE POLICY "auth_read_market_prices" ON market_prices FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_market_prices_ua" ON market_prices_ua FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_market_price_history" ON market_price_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_eur_rates" ON eur_rates FOR SELECT TO authenticated USING (true);

-- Insert policies
CREATE POLICY "auth_insert_market_prices" ON market_prices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert_market_prices_ua" ON market_prices_ua FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert_market_price_history" ON market_price_history FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert_eur_rates" ON eur_rates FOR INSERT TO authenticated WITH CHECK (true);

-- Delete policies
CREATE POLICY "auth_delete_market_prices" ON market_prices FOR DELETE TO authenticated USING (true);
CREATE POLICY "auth_delete_market_prices_ua" ON market_prices_ua FOR DELETE TO authenticated USING (true);
CREATE POLICY "auth_delete_market_price_history" ON market_price_history FOR DELETE TO authenticated USING (true);
CREATE POLICY "auth_delete_eur_rates" ON eur_rates FOR DELETE TO authenticated USING (true);

-- Update upload_history constraint to include market_prices
ALTER TABLE forest_upload_history DROP CONSTRAINT IF EXISTS forest_upload_history_data_type_check;
