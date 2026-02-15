// ===== Parse Forest Inventory Excel =====

export function parseInventoryFile(wb) {
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });

    // Find header row (look for "Філія" or "Надлісництво" in first 15 rows)
    let headerIdx = -1;
    let colMap = {};
    for (let i = 0; i < Math.min(15, rows.length); i++) {
        const row = (rows[i] || []).map(c => (c || '').toString().trim());
        const lower = row.map(c => c.toLowerCase());
        if (lower.some(c => c.includes('філі') || c.includes('надлісництв'))) {
            headerIdx = i;
            // Map only 11 meaningful columns from 185
            row.forEach((h, j) => {
                const l = h.toLowerCase();
                if (l.includes('філі')) colMap.branch = j;
                else if (l.includes('област')) colMap.region = j;
                else if (l.includes('надлісництв')) colMap.forest_unit = j;
                else if (l.includes('лісництв') && !l.includes('надлісництв')) colMap.forestry_div = j;
                else if (l.includes('склад')) colMap.warehouse = j;
                else if (l === 'продукція' || (l.includes('продукці') && !l.includes('найменуванн'))) {
                    if (!colMap.product && colMap.product !== 0) colMap.product = j;
                }
                else if (l.includes('найменуванн') || l.includes('назва продукц')) colMap.product_name = j;
                else if (l.includes('груп') && l.includes('пор')) colMap.wood_group = j;
                else if (l.includes('поро') && !l.includes('груп')) colMap.species = j;
                else if (l.includes('клас') || l.includes('якіст')) {
                    if (!colMap.quality_class && colMap.quality_class !== 0) colMap.quality_class = j;
                }
                else if (l.includes('залиш') || l.includes('кількіст') || l.includes('обсяг') || l.includes('об\'єм') || l.includes('об`єм')) {
                    if (!colMap.remaining_volume_m3 && colMap.remaining_volume_m3 !== 0) colMap.remaining_volume_m3 = j;
                }
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

        const vol = cleanNumber(r[colMap.remaining_volume_m3]);
        if (vol <= 0) continue; // Skip zero-volume rows

        records.push({
            branch,
            region: (r[colMap.region] || '').toString().trim(),
            forest_unit: (r[colMap.forest_unit] || '').toString().trim(),
            forestry_div: (r[colMap.forestry_div] || '').toString().trim(),
            warehouse: (r[colMap.warehouse] || '').toString().trim(),
            product: (r[colMap.product] || '').toString().trim(),
            product_name: (r[colMap.product_name] || '').toString().trim(),
            wood_group: (r[colMap.wood_group] || '').toString().trim(),
            species: (r[colMap.species] || '').toString().trim(),
            quality_class: (r[colMap.quality_class] || '').toString().trim(),
            remaining_volume_m3: vol
        });
    }
    return records;
}

function cleanNumber(val) {
    if (val == null || val === '') return 0;
    if (typeof val === 'number') return val;
    const cleaned = val.toString().replace(/[\s\u00A0]/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
}
