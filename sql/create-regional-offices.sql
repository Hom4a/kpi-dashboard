-- ============================================================
-- Regional Offices — dynamic mapping ЛО → oblasts
-- Run this in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS regional_offices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    oblasts TEXT[] NOT NULL DEFAULT '{}',
    center_lat DOUBLE PRECISION,
    center_lng DOUBLE PRECISION,
    branch_aliases TEXT[] DEFAULT '{}',
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed 9 regional offices
INSERT INTO regional_offices (name, oblasts, center_lat, center_lng, branch_aliases, sort_order) VALUES
('Карпатська ЛО', '{"Закарпатська","Івано-Франківська","Чернівецька","Львівська"}', 48.9, 24.0, '{"Карпатське ОУЛ"}', 1),
('Південна ЛО', '{"Одеська","Миколаївська","Херсонська"}', 47.0, 32.5, '{"Південне ОУЛ"}', 2),
('Північна ЛО', '{"Чернігівська"}', 51.5, 31.3, '{"Північне ОУЛ"}', 3),
('Подільська ЛО', '{"Вінницька","Хмельницька","Тернопільська"}', 49.2, 27.5, '{"Подільське ОУЛ"}', 4),
('Поліська ЛО', '{"Волинська","Рівненська","Житомирська"}', 51.0, 26.5, '{"Поліське ОУЛ"}', 5),
('Слобожанська ЛО', '{"Харківська","Сумська"}', 50.5, 35.5, '{"Слобожанське ОУЛ"}', 6),
('Столична ЛО', '{"Київська"}', 50.4, 30.5, '{"Столичне ОУЛ"}', 7),
('Центральна ЛО', '{"Черкаська","Кіровоградська","Полтавська"}', 49.0, 33.0, '{"Центральне ОУЛ"}', 8),
('Східна ЛО', '{"Дніпропетровська","Запорізька","Донецька","Луганська"}', 48.0, 36.0, '{"Східне ОУЛ"}', 9)
ON CONFLICT (name) DO NOTHING;

-- RLS policies
ALTER TABLE regional_offices ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'regional_offices_select') THEN
        CREATE POLICY regional_offices_select ON regional_offices FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'regional_offices_admin') THEN
        CREATE POLICY regional_offices_admin ON regional_offices FOR ALL USING (
            EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
        );
    END IF;
END $$;

-- ============================================================
-- Verify:
-- SELECT name, oblasts, branch_aliases FROM regional_offices ORDER BY sort_order;
-- ============================================================
