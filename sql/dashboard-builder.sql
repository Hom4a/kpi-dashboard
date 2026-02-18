-- ===== Dashboard Builder (Etap 3) =====

CREATE TABLE IF NOT EXISTS dashboard_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  config JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  is_public BOOLEAN DEFAULT false,
  is_template BOOLEAN DEFAULT false,
  allowed_roles TEXT[] DEFAULT ARRAY['admin'],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE dashboard_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View public or own dashboards" ON dashboard_configs
  FOR SELECT TO authenticated
  USING (is_public = true OR is_template = true OR created_by = auth.uid());

CREATE POLICY "Insert own dashboards" ON dashboard_configs
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Update own dashboards" ON dashboard_configs
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Delete own dashboards" ON dashboard_configs
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());

-- Admin can manage all
CREATE POLICY "Admin full access dashboards" ON dashboard_configs
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
