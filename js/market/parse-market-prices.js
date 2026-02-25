// ===== Parser for International Market Prices Excel =====
// Handles "Ціни Грудень.xlsx" format with multiple sheets

const KNOWN_COUNTRIES = [
    'україна', 'фінляндія', 'німеччина', 'польща', 'латвія',
    'литва', 'швеція', 'норвегія', 'естонія', 'австрія'
];
const SKIP_LABELS = ['реалізація по україні', ''];
const AVERAGE_MARKERS = ['середня', 'average'];

const KNOWN_SPECIES = ['дуб', 'береза', 'вільха', 'ялина', 'сосна', 'дрова', 'бук'];

function cleanNum(v) {
    if (v == null || v === '' || v === ' ' || v === '-') return null;
    if (typeof v === 'number') return v;
    const s = v.toString().replace(/[\s\u00A0]/g, '').replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
}

function dateToISO(val) {
    if (val instanceof Date) {
        const pad = n => String(n).padStart(2, '0');
        return `${val.getFullYear()}-${pad(val.getMonth() + 1)}-${pad(val.getDate())}`;
    }
    if (typeof val === 'number' && val > 1000)
        return new Date((val - 25569) * 86400 * 1000).toISOString().slice(0, 10);
    return null;
}

function findSheet(wb, keywords) {
    for (const name of wb.SheetNames) {
        const lower = name.toLowerCase();
        if (keywords.some(k => lower.includes(k))) return wb.Sheets[name];
    }
    return null;
}

function getRows(sheet) {
    return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
}

// ===== Main sheet "Ціни" =====
function parsePricesSheet(rows, result) {
    if (!rows.length) return;

    // Row 0: extract period and EUR rate
    const row0 = (rows[0] || []).map(c => (c || '').toString());
    const periodMatch = row0[0] || '';
    result.meta.period = periodMatch.replace(/^Період:\s*/, '').trim();
    for (let i = 1; i < row0.length; i++) {
        const n = cleanNum(rows[0][i]);
        if (n && n > 10 && n < 100) { result.meta.eurRate = n; break; }
    }

    // Find data start (row with "Країна" in col 0)
    let dataStart = 4;
    for (let i = 0; i < Math.min(10, rows.length); i++) {
        const cell = (rows[i][0] || '').toString().toLowerCase();
        if (cell.includes('країна') || cell.includes('country')) { dataStart = i + 1; break; }
    }

    // Parse country/source rows
    let currentCountry = null;
    for (let i = dataStart; i < rows.length; i++) {
        const row = rows[i];
        const label = (row[0] || '').toString().trim();
        if (!label) continue;

        const labelLower = label.toLowerCase();
        if (SKIP_LABELS.some(s => s && labelLower.startsWith(s))) continue;

        // Check if any numeric data exists in this row
        const hasData = [1,2,3,4,5,6,7,8].some(c => cleanNum(row[c]) !== null);
        if (!hasData) continue;

        let rowType = 'source';
        if (KNOWN_COUNTRIES.some(c => labelLower.startsWith(c))) {
            rowType = 'country';
            currentCountry = label;
        } else if (AVERAGE_MARKERS.some(m => labelLower.startsWith(m))) {
            rowType = 'average';
        }

        const rec = {
            period: result.meta.period,
            eur_rate: result.meta.eurRate,
            country: rowType === 'country' ? label : (currentCountry || label),
            source_name: rowType === 'source' ? label : null,
            row_type: rowType,
            pine_business: cleanNum(row[1]),
            spruce_business: cleanNum(row[2]),
            alder_business: cleanNum(row[3]),
            birch_business: cleanNum(row[4]),
            oak_business: cleanNum(row[5]),
            pine_firewood: cleanNum(row[6]),
            spruce_firewood: cleanNum(row[7]),
            birch_firewood: cleanNum(row[8]),
            avg_price: cleanNum(row[9]),
            vat_info: (row[10] || '').toString().trim() || null,
            comments: (row[11] || '').toString().trim() || null,
            source_url: (row[12] || '').toString().trim() || null
        };
        result.prices.push(rec);
    }
}

// ===== Sheet "Розрахунки Укр." =====
function parseUaDetailSheet(sheet, result) {
    const rows = getRows(sheet);
    if (!rows.length) return;

    let currentExchange = null;
    const species6 = ['дуб', 'береза', 'вільха', 'ялина', 'сосна', 'дрова', 'бук'];

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const c0 = (row[0] || '').toString().trim();
        const c0lower = c0.toLowerCase();
        const c6 = (row[6] || '').toString().trim();
        const c6lower = c6.toLowerCase();

        // Detect exchange sections
        if (c0lower === 'уеб' || c0 === 'УЕБ') { currentExchange = 'УЕБ'; continue; }
        if (c6lower === 'ууб' || c6 === 'УУБ') { currentExchange = 'УУБ'; continue; }
        if (c6lower === 'урб' || c6 === 'УРБ') { currentExchange = 'УРБ'; continue; }
        if (c0lower.includes('ціна реалізації')) { currentExchange = 'summary'; continue; }

        // Parse exchange data rows (left block: cols 0-4 for UEB, right block: cols 6-10 for UUB/URB)
        if (currentExchange === 'УЕБ') {
            if (species6.some(s => c0lower.startsWith(s)) && cleanNum(row[1]) !== null) {
                result.uaDetail.push({
                    period: result.meta.period,
                    exchange: 'УЕБ',
                    species: c0.replace(/\s+$/, ''),
                    volume_m3: cleanNum(row[1]),
                    total_uah: cleanNum(row[2]),
                    avg_price_uah: cleanNum(row[3]),
                    avg_price_eur: cleanNum(row[4])
                });
            }
        }

        // UUB and URB are in cols 6-10
        if (currentExchange === 'УУБ' || currentExchange === 'УРБ') {
            const sp = (row[6] || '').toString().trim();
            const spLower = sp.toLowerCase();
            if (species6.some(s => spLower.startsWith(s)) && cleanNum(row[7]) !== null) {
                result.uaDetail.push({
                    period: result.meta.period,
                    exchange: currentExchange,
                    species: sp.replace(/\s+$/, ''),
                    volume_m3: cleanNum(row[7]),
                    total_uah: cleanNum(row[8]),
                    avg_price_uah: cleanNum(row[9]),
                    avg_price_eur: cleanNum(row[10])
                });
            }
        }

        // Summary section (business timber prices per species)
        if (currentExchange === 'summary') {
            if (species6.some(s => c0lower.startsWith(s)) && (cleanNum(row[1]) !== null || cleanNum(row[2]) !== null)) {
                result.uaDetail.push({
                    period: result.meta.period,
                    exchange: 'summary',
                    species: c0.replace(/\s+$/, ''),
                    volume_m3: null,
                    total_uah: null,
                    avg_price_uah: cleanNum(row[1]),
                    avg_price_eur: cleanNum(row[2])
                });
            }
            // Firewood row in summary (cols 3-4)
            if (c0lower.includes('дрова') || c0lower.includes('дров')) {
                result.uaDetail.push({
                    period: result.meta.period,
                    exchange: 'summary',
                    species: 'Дрова',
                    volume_m3: null,
                    total_uah: null,
                    avg_price_uah: cleanNum(row[3]) || cleanNum(row[1]),
                    avg_price_eur: cleanNum(row[4]) || cleanNum(row[2])
                });
            }
        }
    }
}

// ===== Time series sheets =====
function parseHistorySheets(wb, result) {
    // Аркуш1: international time series (average price by country per month)
    const sheet1 = wb.Sheets['Аркуш1'] || findSheet(wb, ['аркуш1']);
    if (sheet1) {
        const rows = getRows(sheet1);
        if (rows.length > 1) {
            // Row 0: date serials in cols 1+
            const months = [];
            for (let c = 1; c < (rows[0] || []).length; c++) {
                const iso = dateToISO(rows[0][c]);
                if (iso) months.push({ col: c, date: iso });
            }

            // Rows 1-10: country rows
            for (let r = 1; r < Math.min(12, rows.length); r++) {
                const name = (rows[r][0] || '').toString().trim();
                if (!name) continue;
                for (const m of months) {
                    const val = cleanNum(rows[r][m.col]);
                    if (val !== null) {
                        result.history.push({
                            data_type: 'country_avg',
                            entity_name: name,
                            month_date: m.date,
                            price_eur: val
                        });
                    }
                }
            }
        }
    }

    // Аркуш3: Ukrainian species time series (rows 13+)
    const sheet3 = wb.Sheets['Аркуш3'] || findSheet(wb, ['аркуш3']);
    if (sheet3) {
        const rows = getRows(sheet3);
        // Find UA species section: row with "Україна" and date serials after it
        for (let r = 0; r < rows.length; r++) {
            const c0 = (rows[r][0] || '').toString().trim().toLowerCase();
            if (c0 === 'україна' && (rows[r][1] instanceof Date || (typeof rows[r][1] === 'number' && rows[r][1] > 40000))) {
                // This row has dates: rows[r][1..N]
                const months = [];
                for (let c = 1; c < rows[r].length; c++) {
                    const iso = dateToISO(rows[r][c]);
                    if (iso) months.push({ col: c, date: iso });
                }
                // Following rows are species
                for (let sr = r + 1; sr < Math.min(r + 10, rows.length); sr++) {
                    const name = (rows[sr][0] || '').toString().trim();
                    if (!name || KNOWN_COUNTRIES.includes(name.toLowerCase())) break;
                    for (const m of months) {
                        const val = cleanNum(rows[sr][m.col]);
                        if (val !== null) {
                            result.history.push({
                                data_type: 'ua_species',
                                entity_name: name,
                                month_date: m.date,
                                price_eur: val
                            });
                        }
                    }
                }
                break;
            }
        }
    }
}

// ===== EUR rates sheet =====
function parseEurRatesSheet(sheet, result) {
    const rows = getRows(sheet);
    for (let i = 2; i < rows.length; i++) { // skip header rows 0-1
        const row = rows[i];
        const dateStr = (row[0] || '').toString().trim();
        const rate = cleanNum(row[6]);
        if (!dateStr || rate === null) continue;

        // Parse date "01.12.2025" → "2025-12-01"
        let isoDate = null;
        const parts = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
        if (parts) {
            isoDate = `${parts[3]}-${parts[2]}-${parts[1]}`;
        }
        if (isoDate) {
            result.eurRates.push({ rate_date: isoDate, eur_uah: rate });
        }
    }
}

// ===== Main export =====
export function parseMarketPricesFile(wb) {
    const result = {
        prices: [],
        uaDetail: [],
        history: [],
        eurRates: [],
        meta: { period: '', eurRate: 0 }
    };

    // 1. Main prices sheet (try by name, then first sheet)
    const pricesSheet = findSheet(wb, ['ціни', 'prices']);
    if (pricesSheet) {
        parsePricesSheet(getRows(pricesSheet), result);
    } else {
        // Try first sheet
        const first = wb.Sheets[wb.SheetNames[0]];
        if (first) parsePricesSheet(getRows(first), result);
    }

    // 2. Ukrainian exchange detail
    const uaSheet = findSheet(wb, ['розрахунк']);
    if (uaSheet) parseUaDetailSheet(uaSheet, result);

    // 3. Time series
    parseHistorySheets(wb, result);

    // 4. EUR rates
    const eurSheet = findSheet(wb, ['курс']);
    if (eurSheet) parseEurRatesSheet(eurSheet, result);

    return result;
}
