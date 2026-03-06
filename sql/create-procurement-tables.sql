-- ============================================================
-- ProZorro Procurement Cache Tables
-- Caches tender data fetched from ProZorro public API
-- Run this in Supabase SQL Editor
-- ============================================================

-- Cached tenders from ProZorro API
CREATE TABLE IF NOT EXISTS prozorro_tenders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tender_id TEXT NOT NULL,          -- ProZorro internal UUID
    tender_number TEXT NOT NULL,       -- Human-readable tenderID (e.g. UA-2026-01-15-001234-a)
    title TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT '',
    amount NUMERIC(18,2) DEFAULT 0,
    currency TEXT DEFAULT 'UAH',
    date_created TIMESTAMPTZ,
    date_modified TIMESTAMPTZ,
    procuring_entity TEXT DEFAULT '',
    edrpou TEXT NOT NULL,
    fetched_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tender_id)
);

-- Sync metadata: when was the last successful sync
CREATE TABLE IF NOT EXISTS prozorro_sync_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    edrpou TEXT NOT NULL,
    synced_at TIMESTAMPTZ DEFAULT now(),
    tenders_found INTEGER DEFAULT 0,
    pages_scanned INTEGER DEFAULT 0,
    sync_duration_ms INTEGER DEFAULT 0
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pt_edrpou ON prozorro_tenders(edrpou);
CREATE INDEX IF NOT EXISTS idx_pt_status ON prozorro_tenders(status);
CREATE INDEX IF NOT EXISTS idx_pt_date ON prozorro_tenders(date_created DESC);
CREATE INDEX IF NOT EXISTS idx_psl_edrpou ON prozorro_sync_log(edrpou, synced_at DESC);

-- RLS
ALTER TABLE prozorro_tenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE prozorro_sync_log ENABLE ROW LEVEL SECURITY;

-- Read access for authenticated users
CREATE POLICY "prozorro_tenders_read" ON prozorro_tenders
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "prozorro_sync_log_read" ON prozorro_sync_log
    FOR SELECT TO authenticated USING (true);

-- Write access for authenticated users (data comes from API, any user can trigger sync)
CREATE POLICY "prozorro_tenders_write" ON prozorro_tenders
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "prozorro_sync_log_write" ON prozorro_sync_log
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
