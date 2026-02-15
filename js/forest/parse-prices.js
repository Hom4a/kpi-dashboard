// ===== Parse Forest Prices Excel =====

export function parsePricesFile(wb) {
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });

    // Find header row (look for "Філія" in first 15 rows)
    let headerIdx = -1;
    let colMap = {};
    for (let i = 0; i < Math.min(15, rows.length); i++) {
        const row = (rows[i] || []).map(c => (c || '').toString().trim());
        const lower = row.map(c => c.toLowerCase());
        if (lower.some(c => c.includes('філія') || c.includes('філіа'))) {
            headerIdx = i;
            // Map columns by header names
            row.forEach((h, j) => {
                const l = h.toLowerCase();
                if (l.includes('філі')) colMap.branch = j;
                else if (l.includes('област')) colMap.region = j;
                else if (l.includes('склад')) colMap.warehouse = j;
                else if (l.includes('продукці')) colMap.product = j;
                else if (l.includes('поро')) colMap.species = j;
                else if (l.includes('клас') || l.includes('якіст')) colMap.quality_class = j;
                else if (l.includes('об\'єм') || l.includes('обсяг') || l.includes('об`єм') || l.includes('кількість')) {
                    if (!colMap.volume_m3 && colMap.volume_m3 !== 0) colMap.volume_m3 = j;
                }
                else if (l.includes('ціна') || l.includes('середньозважен')) colMap.weighted_price_uah = j;
                else if (l.includes('вартіст')) colMap.total_value_uah = j;
            });
            break;
        }
    }

    if (headerIdx < 0) return [];

    const records = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r.length) continue;
        const branch = (r[colMap.branch] || '').toString().trim();
        if (!branch) continue;
        // Skip summary/total rows
        if (branch.toLowerCase().includes('всього') || branch.toLowerCase().includes('разом') || branch.toLowerCase().includes('підсумок')) continue;

        records.push({
            branch,
            region: (r[colMap.region] || '').toString().trim(),
            warehouse: (r[colMap.warehouse] || '').toString().trim(),
            product: (r[colMap.product] || '').toString().trim(),
            species: (r[colMap.species] || '').toString().trim(),
            quality_class: (r[colMap.quality_class] || '').toString().trim(),
            volume_m3: cleanNumber(r[colMap.volume_m3]),
            weighted_price_uah: cleanNumber(r[colMap.weighted_price_uah]),
            total_value_uah: cleanNumber(r[colMap.total_value_uah])
        });
    }
    return records;
}

function cleanNumber(val) {
    if (val == null || val === '') return 0;
    if (typeof val === 'number') return val;
    // Remove thousand separators (spaces, non-breaking spaces), replace comma with dot
    const cleaned = val.toString().replace(/[\s\u00A0]/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
}
