-- ===== Summary Tables: Monthly Indicators + Weekly Briefing =====

-- 1. Monthly enterprise indicators (from xlsx "Основні показники")
CREATE TABLE IF NOT EXISTS summary_indicators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_batch_id UUID NOT NULL,
    year INT NOT NULL,
    month INT NOT NULL CHECK (month BETWEEN 0 AND 12),  -- 0 = annual aggregate
    indicator_group TEXT NOT NULL,  -- 'finance','revenue','production','forestry'
    indicator_name TEXT NOT NULL,
    sub_type TEXT NOT NULL DEFAULT 'value',  -- 'value','volume','price'
    value_numeric NUMERIC,
    value_text TEXT,                -- for special values: 'Х','-','*','до DD.MM.YYYY'
    unit TEXT,
    uploaded_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- UNIQUE INDEX enables correct .upsert() behavior
CREATE UNIQUE INDEX IF NOT EXISTS idx_summary_ind_unique
    ON summary_indicators(year, month, indicator_name, sub_type);
CREATE INDEX IF NOT EXISTS idx_summary_ind_year ON summary_indicators(year);
CREATE INDEX IF NOT EXISTS idx_summary_ind_group ON summary_indicators(indicator_group);
CREATE INDEX IF NOT EXISTS idx_summary_ind_batch ON summary_indicators(upload_batch_id);

-- 2. Weekly briefing indicators (manual entry from docx data)
CREATE TABLE IF NOT EXISTS summary_weekly (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_date DATE NOT NULL,
    section TEXT NOT NULL,           -- 'kpi','forest_protection','raids','mru_raids','demining','certification','land_self_forested','land_reforestation','land_reserves','harvesting','contracts','sales','finance','personnel','legal','procurement','zsu'
    indicator_name TEXT NOT NULL,
    value_current NUMERIC,           -- this week
    value_previous NUMERIC,          -- previous week
    value_ytd NUMERIC,               -- year-to-date
    value_delta NUMERIC,             -- change
    value_text TEXT,                  -- for non-numeric values (e.g. "85,3%")
    unit TEXT,
    upload_batch_id UUID,
    uploaded_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_summary_weekly_unique
    ON summary_weekly(report_date, section, indicator_name);
CREATE INDEX IF NOT EXISTS idx_summary_weekly_date ON summary_weekly(report_date);
CREATE INDEX IF NOT EXISTS idx_summary_weekly_section ON summary_weekly(section);

-- 3. Weekly briefing text notes (general assessment, key events, risks)
CREATE TABLE IF NOT EXISTS summary_weekly_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_date DATE NOT NULL,
    note_type TEXT NOT NULL,         -- 'general','positive','negative','decisions','events'
    content TEXT NOT NULL,
    uploaded_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_summary_notes_unique
    ON summary_weekly_notes(report_date, note_type);

-- 4. Upload history
CREATE TABLE IF NOT EXISTS summary_upload_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data_type TEXT NOT NULL CHECK (data_type IN ('monthly_indicators', 'weekly_briefing')),
    batch_id UUID NOT NULL,
    file_name TEXT,
    row_count INT,
    uploaded_by UUID REFERENCES auth.users(id),
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== RLS =====
ALTER TABLE summary_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE summary_weekly ENABLE ROW LEVEL SECURITY;
ALTER TABLE summary_weekly_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE summary_upload_history ENABLE ROW LEVEL SECURITY;

-- summary_indicators policies
CREATE POLICY "Auth read summary_indicators" ON summary_indicators FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert summary_indicators" ON summary_indicators FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update summary_indicators" ON summary_indicators FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth delete summary_indicators" ON summary_indicators FOR DELETE TO authenticated USING (true);

-- summary_weekly policies
CREATE POLICY "Auth read summary_weekly" ON summary_weekly FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert summary_weekly" ON summary_weekly FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update summary_weekly" ON summary_weekly FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth delete summary_weekly" ON summary_weekly FOR DELETE TO authenticated USING (true);

-- summary_weekly_notes policies
CREATE POLICY "Auth read summary_weekly_notes" ON summary_weekly_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert summary_weekly_notes" ON summary_weekly_notes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update summary_weekly_notes" ON summary_weekly_notes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth delete summary_weekly_notes" ON summary_weekly_notes FOR DELETE TO authenticated USING (true);

-- summary_upload_history policies
CREATE POLICY "Auth read summary_upload_history" ON summary_upload_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert summary_upload_history" ON summary_upload_history FOR INSERT TO authenticated WITH CHECK (true);

-- ===== Enable Realtime =====
ALTER PUBLICATION supabase_realtime ADD TABLE summary_indicators;
ALTER PUBLICATION supabase_realtime ADD TABLE summary_weekly;
