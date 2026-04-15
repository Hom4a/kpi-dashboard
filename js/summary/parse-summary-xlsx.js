// ===== Summary XLSX Parser =====
// Parses "Основні показники діяльності ДП Ліси України" files
// Supports both "базовий" and "проміжний" variants (same structure)

// ===== Indicator Classification =====

const GROUP_RULES = [
    // finance
    { group: 'finance', patterns: ['фонд оплати праці', 'фоп'] },
    { group: 'finance', patterns: ['чисельність'] },
    { group: 'finance', patterns: ['середня заробітна', 'середня зарплата'] },
    { group: 'finance', patterns: ['дебіторськ'] },
    { group: 'finance', patterns: ['кредиторськ'] },
    { group: 'finance', patterns: ['залишок коштів', 'залишки коштів'] },
    { group: 'finance', patterns: ['недоїмка'] },
    { group: 'finance', patterns: ['коефіцієнт фінансової'] },
    // revenue
    { group: 'revenue', patterns: ['загальна реалізація'] },
    { group: 'revenue', patterns: ['лісоматеріали в круглому'] },
    { group: 'revenue', patterns: ['продукція переробки'] },
    { group: 'revenue', patterns: ['інша реалізація'] },
    { group: 'revenue', patterns: ['реалізовано на 1 штатного'] },
    { group: 'revenue', patterns: ['реалізовано на експорт'] },
    // production
    { group: 'production', patterns: ['реалізація лісоматеріалів круглих'] },
    { group: 'production', patterns: ['середня цін реалізації 1 м3 лісоматеріалів', 'середня ціна реалізації 1 м3 лісоматеріалів'] },
    { group: 'production', patterns: ['вільха', 'береза'] },
    { group: 'production', patterns: ['сосна тис'] },
    { group: 'production', patterns: ['дуб тис'] },
    { group: 'production', patterns: ['інші тис'] },
    { group: 'production', patterns: ["дров'яної пв", "дров'яної нп", 'дровяної пв', 'дровяної нп'] },
    { group: 'production', patterns: ['середня ціна реалізації 1 м3 деревини дров'] },
    { group: 'production', patterns: ['обсяг переробки'] },
    { group: 'production', patterns: ['в т.ч: хвойні', 'в т.ч:хвойні'] },
    { group: 'production', patterns: ['ціна знеособлен'] },
    { group: 'production', patterns: ['продукція переробки (дрова)', 'продукція переробки (тріска)'] },
    // forestry
    { group: 'forestry', patterns: ['заготівля деревини'] },
    { group: 'forestry', patterns: ['рубки головного'] },
    { group: 'forestry', patterns: ['рубки формування'] },
    { group: 'forestry', patterns: ['лісовідновлення'] },
    { group: 'forestry', patterns: ['лісорозведення'] },
    { group: 'forestry', patterns: ['сприяння природному'] },
    // tax
    { group: 'tax', patterns: ['сплачено податків'] },
    { group: 'tax', patterns: ['єдиний соціальний'] },
    { group: 'tax', patterns: ['рентна плата'] },
    { group: 'tax', patterns: ['податок на додану'] },
    { group: 'tax', patterns: ['податок на прибуток'] },
    { group: 'tax', patterns: ['пдфо'] },
    { group: 'tax', patterns: ['податок на лісові'] },
    { group: 'tax', patterns: ['дивіденди'] },
    // salary
    { group: 'salary', patterns: ['середня з/п по філіях'] },
];

function classifyGroup(name) {
    const s = name.toLowerCase();
    for (const rule of GROUP_RULES) {
        for (const pat of rule.patterns) {
            if (s.includes(pat)) return rule.group;
        }
    }
    // Sub-indicators like "дуб", "інші" without full context → production
    if (/^(дуб|інші|хвойні)$/i.test(name.trim())) return 'production';
    // "ВЗ  млн. грн" — military tax (too short for pattern matching)
    if (/^вз\s/i.test(name.trim())) return 'tax';
    return null;
}

function extractUnit(name) {
    // Extract unit from indicator name like "ФОП, млн. грн" → "млн. грн"
    const m = name.match(/,\s*([^,]+)$/);
    return m ? m[1].trim() : '';
}

function normalizeName(name) {
    return name
        .replace(/\bцін реалізації\b/gi, 'ціна реалізації')  // typo "цін" → "ціна"
        .replace(/\s*\(без ПДВ\)\s*/gi, '')                   // remove "(без ПДВ)" suffix
        .replace(/Лісовідновлення\(/gi, 'Лісовідновлення (')  // missing space before (
        .replace(/\*+$/, '')                                   // trailing asterisks (зарплати)
        .replace(/\s+/g, ' ').trim();                          // normalize whitespace
}

// ===== Value Parsing =====

function parseValue(val) {
    if (val == null || val === '') return { value_numeric: null, value_text: null, isVolPrice: false };

    // Date object from Excel → skip (column header date, not data)
    if (val instanceof Date) return { value_numeric: null, value_text: null, isVolPrice: false };

    if (typeof val === 'number') {
        return { value_numeric: val, value_text: null, isVolPrice: false };
    }

    const s = String(val).trim();
    if (!s || s === '') return { value_numeric: null, value_text: null, isVolPrice: false };

    // Special text values
    if (s === 'Х' || s === 'х' || s === 'X' || s === 'x') return { value_numeric: null, value_text: 'Х', isVolPrice: false };
    if (s === '-') return { value_numeric: null, value_text: '-', isVolPrice: false };
    if (s === '*') return { value_numeric: null, value_text: '*', isVolPrice: false };
    if (/^до\s/i.test(s)) return { value_numeric: null, value_text: s, isVolPrice: false };

    // Volume/price pattern: "366,82/3189,61" or "366,82(3189,61)" or "366(3189)"
    const vpSlash = s.match(/^([\d\s,.]+)\/([\d\s,.]+)$/);
    const vpBracket = s.match(/^([\d\s,.]+)\(([\d\s,.]+)\)*$/);
    const vpMatch = vpSlash || vpBracket;
    if (vpMatch) {
        const vol = parseNumeric(vpMatch[1]);
        const price = parseNumeric(vpMatch[2]);
        if (vol != null || price != null) {
            return { volume: vol, price: price, isVolPrice: true };
        }
    }

    // Plain number with comma decimal
    const num = parseNumeric(s);
    if (num != null) return { value_numeric: num, value_text: null, isVolPrice: false };

    // Unrecognized text
    return { value_numeric: null, value_text: s, isVolPrice: false };
}

function parseNumeric(s) {
    if (s == null) return null;
    const cleaned = String(s).replace(/[\s\u00A0]/g, '').replace(',', '.');
    if (cleaned === '' || cleaned === '0/0' || cleaned === '0/0,00') return 0;
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
}

// ===== Main Parser =====

export function parseSummaryXlsx(wb) {
    const records = [];
    let lastGroup = 'finance'; // Default fallback for sub-indicators

    // Phase 1: Parse yearly sheets (2022, 2023, 2024, 2025, 2026)
    for (const sheetName of wb.SheetNames) {
        const yearMatch = sheetName.trim().match(/^(20\d{2})$/);
        if (!yearMatch) continue;
        const year = parseInt(yearMatch[1]);
        const sheet = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });

        // Row 2 (index 2) = headers with month dates in columns B-M
        // Row 3+ (index 3+) = data
        // Column 0 = indicator name, Columns 1-12 = Jan-Dec, Column 13 = YTD (skip)
        lastGroup = 'finance';
        for (let i = 3; i < rows.length; i++) {
            const r = rows[i];
            if (!r || !r[0]) continue;
            const name = normalizeName(String(r[0]).trim().replace(/\*+$/, '').trim());
            if (!name) continue;

            // Skip non-data rows
            if (/^чисельність\/кількість/i.test(name)) continue;
            if (/^олень/i.test(name)) continue;

            const group = classifyGroup(name);
            if (group) lastGroup = group;
            const finalGroup = group || lastGroup;
            const unit = extractUnit(name);

            // Parse months 1-12 (columns B-M, indices 1-12)
            for (let col = 1; col <= 12; col++) {
                const cellVal = r[col];
                if (cellVal == null || cellVal === '') continue;

                const parsed = parseValue(cellVal);
                if (parsed.isVolPrice) {
                    // Store as value with slash format: "360,6/2318,7"
                    const raw = String(cellVal).trim().replace(/\)+$/, '');
                    const formatted = raw.includes('/') ? raw : raw.replace(/\(/, '/').replace(/\)$/, '');
                    records.push({
                        year, month: col, indicator_group: finalGroup,
                        indicator_name: name, sub_type: 'value',
                        value_numeric: parsed.volume, value_text: formatted, unit: unit
                    });
                } else if (parsed.value_numeric != null || parsed.value_text != null) {
                    records.push({
                        year, month: col, indicator_group: finalGroup,
                        indicator_name: name, sub_type: 'value',
                        value_numeric: parsed.value_numeric, value_text: parsed.value_text,
                        unit: unit
                    });
                }
            }
        }
    }

    // Phase 2: Parse "Основні показники" sheet (annual summary)
    const summarySheet = wb.SheetNames.find(n =>
        n.toLowerCase().includes('основні показники')
    );
    if (summarySheet) {
        const sheet = wb.Sheets[summarySheet];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });

        // Row 2 (index 2) = headers: "Показники", "2022 рік", "2023 рік", ...
        const headerRow = rows[2] || [];
        const yearColumns = []; // { col, year }
        for (let c = 1; c < headerRow.length; c++) {
            const h = String(headerRow[c] || '').trim();
            // Check month pattern FIRST ("лютий 2026") before year pattern ("2026 рік")
            const monthNames = ['січень','лютий','березень','квітень','травень','червень','липень','серпень','вересень','жовтень','листопад','грудень'];
            const monthMatch = h.match(/(січень|лютий|березень|квітень|травень|червень|липень|серпень|вересень|жовтень|листопад|грудень)\s*(20\d{2})/i);
            if (monthMatch) {
                const mi = monthNames.indexOf(monthMatch[1].toLowerCase()) + 1;
                yearColumns.push({ col: c, year: parseInt(monthMatch[2]), month: mi });
            } else {
                // Year-only pattern ("2026 рік", "2025", etc.)
                const m = h.match(/(20\d{2})\s*(рік|р\.)?/i);
                if (m) {
                    yearColumns.push({ col: c, year: parseInt(m[1]) });
                }
            }
        }

        // Parse animal limits: rows like "Олень благор. 3787/*" in each year column
        let inAnimalSection = false;
        for (let i = 3; i < rows.length; i++) {
            const r = rows[i];
            const name = r ? String(r[0] || '').trim() : '';
            if (/^чисельність\/кількість/i.test(name)) { inAnimalSection = true; }
            if (inAnimalSection) {
                if (!name && (!r || !r[1])) { inAnimalSection = false; continue; }
                // Each cell = "Олень благор. 3787/*" — parse all year columns
                for (const yc of yearColumns) {
                    const cellVal = r ? r[yc.col] : null;
                    if (!cellVal) continue;
                    const text = String(cellVal).trim();
                    if (!text) continue;
                    // Extract animal name and number: "Олень благор. 3787/*" → name="Олень благор.", value=3787
                    const m = text.match(/^(.+?)\s+([\d\s]+)\s*[\/\\*]/);
                    const animalName = m ? m[1].trim() : text;
                    const animalValue = m ? parseFloat(m[2].replace(/\s/g, '')) : null;
                    records.push({
                        year: yc.year, month: 0, indicator_group: 'animals',
                        indicator_name: animalName, sub_type: 'value',
                        value_numeric: animalValue, value_text: text, unit: 'шт.'
                    });
                }
            }
        }

        // Extract "Довідково" reference text block — bind to the monthly column
        const monthCol = yearColumns.find(yc => yc.month);
        const refYear = monthCol ? monthCol.year : yearColumns[yearColumns.length - 1]?.year || 0;
        const refMonth = monthCol ? monthCol.month : 0;

        let inRef = false;
        const refLines = [];
        for (let i = 3; i < rows.length; i++) {
            const name = String(rows[i]?.[0] || '').trim();
            if (/^довідково/i.test(name)) { inRef = true; continue; }
            if (inRef && name) refLines.push(name);
        }
        if (refLines.length) {
            records.push({
                year: refYear, month: refMonth, indicator_group: 'reference',
                indicator_name: 'Довідково', sub_type: 'value',
                value_numeric: null, value_text: refLines.join('\n'), unit: null
            });
        }

        // Detect "Середня з/п в регіоні" column (salary section has its own header row)
        let regionSalaryCol = null;
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!row) continue;
            for (let c = 1; c < row.length; c++) {
                const h = String(row[c] || '').trim().toLowerCase();
                if (h.includes('середня з/п в регіоні') || h.includes('дані мінфіну')) {
                    regionSalaryCol = c;
                    break;
                }
            }
            if (regionSalaryCol) break;
        }

        lastGroup = 'finance';
        for (let i = 3; i < rows.length; i++) {
            const r = rows[i];
            if (!r || !r[0]) continue;
            const name = normalizeName(String(r[0]).trim().replace(/\*+$/, '').trim());
            if (!name) continue;
            if (/^довідково/i.test(name)) break;
            if (/^чисельність\/кількість/i.test(name)) continue;
            if (/^олень/i.test(name)) continue;

            const group = classifyGroup(name);
            if (group) lastGroup = group;
            const finalGroup = group || lastGroup;
            const unit = extractUnit(name);

            for (const yc of yearColumns) {
                const cellVal = r[yc.col];
                if (cellVal == null || cellVal === '') continue;

                const parsed = parseValue(cellVal);
                const month = yc.month || 0; // 0 = annual

                if (parsed.isVolPrice) {
                    const raw = String(cellVal).trim().replace(/\)+$/, '');
                    const formatted = raw.includes('/') ? raw : raw.replace(/\(/, '/').replace(/\)$/, '');
                    records.push({
                        year: yc.year, month, indicator_group: finalGroup,
                        indicator_name: name, sub_type: 'value',
                        value_numeric: parsed.volume, value_text: formatted, unit: unit
                    });
                } else if (parsed.value_numeric != null || parsed.value_text != null) {
                    records.push({
                        year: yc.year, month, indicator_group: finalGroup,
                        indicator_name: name, sub_type: 'value',
                        value_numeric: parsed.value_numeric, value_text: parsed.value_text,
                        unit: unit
                    });
                }
            }

            // Parse region salary column if exists
            if (regionSalaryCol && r[regionSalaryCol] != null && r[regionSalaryCol] !== '') {
                const parsed = parseValue(r[regionSalaryCol]);
                if (parsed.value_numeric != null) {
                    records.push({
                        year: 0, month: 0, indicator_group: 'region_salary',
                        indicator_name: name, sub_type: 'value',
                        value_numeric: parsed.value_numeric, value_text: null, unit: 'грн'
                    });
                }
            }
        }
    }

    // Deduplicate: if same (year, month, indicator_name, sub_type) appears multiple times, keep last
    const seen = new Map();
    for (const r of records) {
        const key = `${r.year}|${r.month}|${r.indicator_name}|${r.sub_type}`;
        seen.set(key, r);
    }

    const years = [...new Set([...seen.values()].map(r => r.year))].sort();
    console.log(`Summary parser: ${seen.size} records across years ${years.join(', ')}`);

    return { records: [...seen.values()], years };
}
