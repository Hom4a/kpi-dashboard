-- Seed market_prices into dataset_types for data entry form
-- Run this in Supabase SQL editor

INSERT INTO dataset_types (name, display_name, description, icon, is_system, target_table, allowed_roles, schema) VALUES
('market_prices', 'Ринкові ціни', 'Міжнародні ринкові ціни деревини по країнах', 'globe', true, 'market_prices',
  ARRAY['admin','editor','analyst'],
  '[{"name":"period","label":"Період","type":"text","required":true,"placeholder":"грудень 2025"},
    {"name":"eur_rate","label":"Курс EUR/UAH","type":"number","required":true},
    {"name":"country","label":"Країна","type":"text","required":true},
    {"name":"source_name","label":"Джерело","type":"text"},
    {"name":"row_type","label":"Тип запису","type":"select","required":true,
     "options":["country","source","average"]},
    {"name":"pine_business","label":"Сосна (ділова)","type":"number"},
    {"name":"spruce_business","label":"Ялина (ділова)","type":"number"},
    {"name":"alder_business","label":"Вільха (ділова)","type":"number"},
    {"name":"birch_business","label":"Береза (ділова)","type":"number"},
    {"name":"oak_business","label":"Дуб (діловий)","type":"number"},
    {"name":"pine_firewood","label":"Сосна (дрова)","type":"number"},
    {"name":"spruce_firewood","label":"Ялина (дрова)","type":"number"},
    {"name":"birch_firewood","label":"Береза (дрова)","type":"number"},
    {"name":"avg_price","label":"Середня ціна EUR/м³","type":"number"},
    {"name":"vat_info","label":"ПДВ інфо","type":"text"},
    {"name":"comments","label":"Коментарі","type":"text"},
    {"name":"source_url","label":"URL джерела","type":"text"}]'::jsonb)
ON CONFLICT (name) DO NOTHING;
