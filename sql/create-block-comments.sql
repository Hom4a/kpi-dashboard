-- Block-level comments for weekly and monthly reports
CREATE TABLE IF NOT EXISTS summary_block_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_type TEXT NOT NULL CHECK (report_type IN ('weekly', 'monthly')),
    report_date DATE,
    report_year INT,
    report_month INT,
    block_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_block_comments_weekly
    ON summary_block_comments(report_type, report_date, block_id)
    WHERE report_type = 'weekly';

CREATE UNIQUE INDEX IF NOT EXISTS idx_block_comments_monthly
    ON summary_block_comments(report_type, report_year, report_month, block_id)
    WHERE report_type = 'monthly';

ALTER TABLE summary_block_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read block comments"
    ON summary_block_comments FOR SELECT USING (true);

CREATE POLICY "Upload roles can manage block comments"
    ON summary_block_comments FOR ALL USING (true) WITH CHECK (true);
