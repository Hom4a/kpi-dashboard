// ===== Parse ZSU Withdrawals Excel =====

function cleanNumber(val) {
    if (val == null || val === '') return 0;
    if (typeof val === 'number') return val;
    const cleaned = val.toString().replace(/[\s\u00A0]/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
}

const KNOWN_OFFICES = ['карпатськ', 'південн', 'північн', 'подільськ', 'поліськ',
    'слобожанськ', 'столичн', 'центральн', 'східн'];

export function parseZsuFile(wb) {
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });

    // Find header row with product category keywords
    let headerIdx = -1;
    for (let i = 0; i < Math.min(10, rows.length); i++) {
        const joined = (rows[i] || []).map(c => (c || '').toString().toLowerCase()).join(' ');
        if (joined.includes('лісопродукці') || joined.includes('пиломатеріал') || joined.includes('заявлен') || joined.includes('відвантажен')) {
            headerIdx = i;
            break;
        }
    }

    // Detect office column and data columns
    // Known structure: Col B = office, C-E = forest products, F-H = lumber
    // But try to detect dynamically
    let officeCol = 1; // Default: column B
    let fpDeclared = 2, fpShipped = 3, fpValue = 4;
    let lDeclared = 5, lShipped = 6, lValue = 7;

    // Try to find office column from data rows
    for (let i = (headerIdx >= 0 ? headerIdx + 1 : 4); i < Math.min(rows.length, 15); i++) {
        const row = rows[i] || [];
        for (let j = 0; j < row.length; j++) {
            const lower = (row[j] || '').toString().toLowerCase();
            if (KNOWN_OFFICES.some(o => lower.includes(o))) {
                officeCol = j;
                fpDeclared = j + 1; fpShipped = j + 2; fpValue = j + 3;
                lDeclared = j + 4; lShipped = j + 5; lValue = j + 6;
                break;
            }
        }
        if (officeCol !== 1) break;
    }

    const records = [];
    const startRow = headerIdx >= 0 ? headerIdx + 1 : 5;
    for (let i = startRow; i < rows.length; i++) {
        const r = rows[i] || [];
        if (!r.length) continue;
        const officeName = (r[officeCol] || '').toString().trim();
        if (!officeName) continue;
        const lower = officeName.toLowerCase();
        // Skip totals and summary rows
        if (lower.includes('всього') || lower.includes('разом') || lower.includes('підсумок') || lower.includes('итого')) continue;
        // Must be a known office
        if (!KNOWN_OFFICES.some(o => lower.includes(o))) continue;

        records.push({
            regional_office: officeName,
            forest_products_declared_m3: cleanNumber(r[fpDeclared]),
            forest_products_shipped_m3: cleanNumber(r[fpShipped]),
            forest_products_value_uah: cleanNumber(r[fpValue]),
            lumber_declared_m3: cleanNumber(r[lDeclared]),
            lumber_shipped_m3: cleanNumber(r[lShipped]),
            lumber_value_uah: cleanNumber(r[lValue]),
        });
    }
    return records;
}
