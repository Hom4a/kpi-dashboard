-- ===== Dynamic Data System (Etap 2) =====
-- Flexible data storage for form constructor + custom tables

-- Dataset types (schemas for custom tables)
CREATE TABLE IF NOT EXISTS dataset_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT DEFAULT '',
  icon TEXT DEFAULT 'table',
  schema JSONB NOT NULL DEFAULT '[]',
  -- schema: [{name, label, type, required, options, default, validation}]
  created_by UUID REFERENCES auth.users(id),
  allowed_roles TEXT[] DEFAULT ARRAY['admin', 'editor'],
  is_system BOOLEAN DEFAULT false,
  target_table TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Custom datasets (flexible JSONB storage)
CREATE TABLE IF NOT EXISTS custom_datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_type_id UUID NOT NULL REFERENCES dataset_types(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}',
  upload_batch_id UUID,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_data_type ON custom_datasets(dataset_type_id);
CREATE INDEX IF NOT EXISTS idx_custom_data_batch ON custom_datasets(upload_batch_id);
CREATE INDEX IF NOT EXISTS idx_custom_data_gin ON custom_datasets USING GIN (data);

-- Form templates
CREATE TABLE IF NOT EXISTS form_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  dataset_type_id UUID NOT NULL REFERENCES dataset_types(id),
  layout JSONB NOT NULL DEFAULT '[]',
  allowed_roles TEXT[] DEFAULT ARRAY['admin', 'editor'],
  org_level_filter TEXT DEFAULT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies
ALTER TABLE dataset_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_templates ENABLE ROW LEVEL SECURITY;

-- dataset_types: everyone reads, admin manages
CREATE POLICY "Auth can read dataset_types" ON dataset_types
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage dataset_types" ON dataset_types
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- custom_datasets: everyone reads, auth inserts, owner or admin deletes
CREATE POLICY "Auth can read custom_datasets" ON custom_datasets
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth can insert custom_datasets" ON custom_datasets
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth can update own custom_datasets" ON custom_datasets
  FOR UPDATE TO authenticated USING (
    created_by = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "Auth can delete own custom_datasets" ON custom_datasets
  FOR DELETE TO authenticated USING (
    created_by = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- form_templates: everyone reads, admin manages
CREATE POLICY "Auth can read form_templates" ON form_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage form_templates" ON form_templates
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Seed system dataset types (mapped to existing tables)
INSERT INTO dataset_types (name, display_name, description, icon, is_system, target_table, allowed_roles, schema) VALUES
('kpi', 'Щоденні обсяги та фінанси', 'KPI показники: реалізація, заготівля, фінанси', 'bar-chart', true, 'kpi_records',
  ARRAY['admin','editor','forester'],
  '[{"name":"date","label":"Дата","type":"date","required":true},
    {"name":"indicator","label":"Показник","type":"text","required":true},
    {"name":"type","label":"Тип","type":"select","required":true,
     "options":["realized","harvested","cash_daily","cash_monthly"]},
    {"name":"value","label":"Значення","type":"number","required":true},
    {"name":"unit","label":"Одиниця","type":"text","default":"м³"}]'::jsonb),

('prices', 'Середньозважені ціни', 'Ціни реалізації за продукцією та породами', 'dollar-sign', true, 'forest_prices',
  ARRAY['admin','editor','accountant'],
  '[{"name":"branch","label":"Філія","type":"text","required":true},
    {"name":"region","label":"Область","type":"text"},
    {"name":"warehouse","label":"Склад","type":"text"},
    {"name":"product","label":"Продукція","type":"text","required":true},
    {"name":"species","label":"Порода","type":"text","required":true},
    {"name":"quality_class","label":"Клас якості","type":"text"},
    {"name":"volume_m3","label":"Обсяг м³","type":"number","required":true},
    {"name":"weighted_price_uah","label":"Ціна грн/м³","type":"number","required":true},
    {"name":"total_value_uah","label":"Вартість грн","type":"number"}]'::jsonb),

('inventory', 'Залишки лісопродукції', 'Залишки на складах по філіях', 'package', true, 'forest_inventory',
  ARRAY['admin','editor','operator','forester'],
  '[{"name":"branch","label":"Філія","type":"text","required":true},
    {"name":"region","label":"Область","type":"text"},
    {"name":"forest_unit","label":"Надлісництво","type":"text"},
    {"name":"forestry_div","label":"Лісництво","type":"text"},
    {"name":"warehouse","label":"Склад","type":"text"},
    {"name":"product","label":"Продукція","type":"text","required":true},
    {"name":"product_name","label":"Назва продукції","type":"text"},
    {"name":"wood_group","label":"Група порід","type":"text"},
    {"name":"species","label":"Порода","type":"text","required":true},
    {"name":"quality_class","label":"Клас якості","type":"text"},
    {"name":"remaining_volume_m3","label":"Залишок м³","type":"number","required":true}]'::jsonb),

('plan_fact', 'План-факт заготівлі', 'Виконання планових показників заготівлі', 'target', true, 'harvesting_plan_fact',
  ARRAY['admin','editor','forester'],
  '[{"name":"regional_office","label":"Обласне управління","type":"text","required":true},
    {"name":"annual_plan_total","label":"Річний план (всього)","type":"number","required":true},
    {"name":"annual_plan_rgk","label":"Річний план (РГК)","type":"number"},
    {"name":"annual_plan_rfiol","label":"Річний план (РФІОЛ)","type":"number"},
    {"name":"nine_month_plan_total","label":"9-міс план","type":"number"},
    {"name":"harvested_total","label":"Заготовлено (всього)","type":"number","required":true},
    {"name":"harvested_rgk","label":"Заготовлено (РГК)","type":"number"},
    {"name":"harvested_rfiol","label":"Заготовлено (РФІОЛ)","type":"number"}]'::jsonb),

('zsu', 'Поставки ЗСУ', 'Вилучення лісопродукції на потреби ЗСУ', 'shield', true, 'harvesting_zsu',
  ARRAY['admin','editor'],
  '[{"name":"regional_office","label":"Обласне управління","type":"text","required":true},
    {"name":"forest_products_declared_m3","label":"Лісопр. заявл. м³","type":"number"},
    {"name":"forest_products_shipped_m3","label":"Лісопр. відвант. м³","type":"number"},
    {"name":"forest_products_value_uah","label":"Лісопр. вартість грн","type":"number"},
    {"name":"lumber_declared_m3","label":"Пилом. заявл. м³","type":"number"},
    {"name":"lumber_shipped_m3","label":"Пилом. відвант. м³","type":"number"},
    {"name":"lumber_value_uah","label":"Пилом. вартість грн","type":"number"}]'::jsonb),

('staff', 'Штатний розклад', 'Кадрова інформація по підрозділах', 'users', true, NULL,
  ARRAY['admin','hr'],
  '[{"name":"branch","label":"Філія","type":"text","required":true},
    {"name":"department","label":"Підрозділ","type":"text","required":true},
    {"name":"position","label":"Посада","type":"text","required":true},
    {"name":"employee_name","label":"ПІБ","type":"text","required":true},
    {"name":"hire_date","label":"Дата прийому","type":"date"},
    {"name":"salary","label":"Оклад грн","type":"number"},
    {"name":"status","label":"Статус","type":"select","options":["працює","відпустка","звільнений"]}]'::jsonb),

('work_hours', 'Облік робочого часу', 'Табель робочого часу працівників', 'clock', true, NULL,
  ARRAY['admin','hr'],
  '[{"name":"employee_name","label":"ПІБ","type":"text","required":true},
    {"name":"branch","label":"Філія","type":"text"},
    {"name":"month","label":"Місяць","type":"date","required":true},
    {"name":"days_worked","label":"Відпрацьовано днів","type":"number","required":true},
    {"name":"hours_worked","label":"Відпрацьовано годин","type":"number"},
    {"name":"sick_days","label":"Лікарняні","type":"number","default":0},
    {"name":"vacation_days","label":"Відпустка","type":"number","default":0}]'::jsonb),

('cash_balance', 'Залишки коштів', 'Щоденні залишки на рахунках', 'credit-card', true, NULL,
  ARRAY['admin','accountant'],
  '[{"name":"date","label":"Дата","type":"date","required":true},
    {"name":"account","label":"Рахунок","type":"text","required":true},
    {"name":"balance","label":"Залишок грн","type":"number","required":true},
    {"name":"income","label":"Надходження грн","type":"number","default":0},
    {"name":"expense","label":"Витрати грн","type":"number","default":0},
    {"name":"note","label":"Примітка","type":"text"}]'::jsonb)
ON CONFLICT (name) DO NOTHING;
