// ===== Parse Harvesting Plan-Fact Excel =====

function cleanNumber(val) {
    if (val == null || val === '') return 0;
    if (typeof val === 'number') return val;
    const cleaned = val.toString().replace(/[\s\u00A0]/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
}

const KNOWN_OFFICES = ['карпатськ', 'південн', 'північн', 'подільськ', 'поліськ',
    'слобожанськ', 'столичн', 'центральн', 'східн'];

function isOfficeRow(row) {
    for (const cell of row) {
        const lower = (cell || '').toString().toLowerCase();
        if (KNOWN_OFFICES.some(o => lower.includes(o))) return true;
    }
    return false;
}

function findOfficeCell(row) {
    for (let i = 0; i < row.length; i++) {
        const lower = (row[i] || '').toString().toLowerCase();
        if (KNOWN_OFFICES.some(o => lower.includes(o))) return i;
    }
    return 0;
}

export function parsePlanFactFile(wb) {
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });

    // Find first data row (contains a known office name)
    let dataStartIdx = -1;
    let officeCol = 0;
    for (let i = 0; i < Math.min(20, rows.length); i++) {
        const row = rows[i] || [];
        if (isOfficeRow(row)) {
            dataStartIdx = i;
            officeCol = findOfficeCell(row);
            break;
        }
    }
    if (dataStartIdx < 0) return [];

    // Build column map from merged headers (rows 0..dataStartIdx-1)
    // The file has complex multi-level headers. We map by position relative to office column.
    // Typical structure: Office | Annual Plan (T,R,R) | 9-Month Plan (T,R,R) | Harvested (T,R,R) | %9mo (T,R,R) | %annual (T,R,R)
    // Try keyword-based mapping first, fall back to positional
    const colMap = buildColumnMap(rows, 0, dataStartIdx, officeCol);

    const records = [];
    for (let i = dataStartIdx; i < rows.length; i++) {
        const r = rows[i] || [];
        if (!r.length) continue;
        const officeName = (r[officeCol] || '').toString().trim();
        if (!officeName) continue;
        const lower = officeName.toLowerCase();
        // Stop at summary/section rows
        if (lower.includes('всього') || lower.includes('разом') || lower.includes('підсумок') || lower.includes('залишки')) break;
        // Must be a known office
        if (!KNOWN_OFFICES.some(o => lower.includes(o))) continue;

        const apr = cleanNumber(r[colMap.apr]);
        const apf = cleanNumber(r[colMap.apf]);
        const apt = cleanNumber(r[colMap.apt]) || (apr + apf);
        const npr = cleanNumber(r[colMap.npr]);
        const npf = cleanNumber(r[colMap.npf]);
        const npt = cleanNumber(r[colMap.npt]) || (npr + npf);
        const hr = cleanNumber(r[colMap.hr]);
        const hf = cleanNumber(r[colMap.hf]);
        const ht = cleanNumber(r[colMap.ht]) || (hr + hf);
        const p9t = cleanNumber(r[colMap.p9t]) || (npt > 0 ? ht / npt * 100 : 0);
        const p9r = cleanNumber(r[colMap.p9r]) || (npr > 0 ? hr / npr * 100 : 0);
        const p9f = cleanNumber(r[colMap.p9f]) || (npf > 0 ? hf / npf * 100 : 0);
        const pat = cleanNumber(r[colMap.pat]) || (apt > 0 ? ht / apt * 100 : 0);
        const par = cleanNumber(r[colMap.par]) || (apr > 0 ? hr / apr * 100 : 0);
        const paf = cleanNumber(r[colMap.paf]) || (apf > 0 ? hf / apf * 100 : 0);

        records.push({
            regional_office: officeName,
            annual_plan_total: apt, annual_plan_rgk: apr, annual_plan_rfiol: apf,
            nine_month_plan_total: npt, nine_month_plan_rgk: npr, nine_month_plan_rfiol: npf,
            harvested_total: ht, harvested_rgk: hr, harvested_rfiol: hf,
            pct_nine_month_total: p9t, pct_nine_month_rgk: p9r, pct_nine_month_rfiol: p9f,
            pct_annual_total: pat, pct_annual_rgk: par, pct_annual_rfiol: paf,
        });
    }
    return records;
}

function buildColumnMap(rows, headerStart, dataStart, officeCol) {
    // Merge multi-level headers for each column
    const numCols = Math.max(...rows.slice(headerStart, dataStart + 1).map(r => (r || []).length), 16);
    const merged = [];
    for (let col = 0; col < numCols; col++) {
        const parts = [];
        for (let row = headerStart; row < dataStart; row++) {
            const cell = ((rows[row] || [])[col] || '').toString().trim();
            if (cell && !parts.includes(cell)) parts.push(cell);
        }
        merged.push(parts.join(' ').toLowerCase());
    }

    // Try keyword-based column detection
    let annualStart = -1, nineMonthStart = -1, harvestedStart = -1, pct9Start = -1, pctAnnualStart = -1;

    merged.forEach((h, j) => {
        if (j <= officeCol) return;
        if ((h.includes('річн') && h.includes('план') || h.includes('річний обсяг')) && annualStart < 0) annualStart = j;
        else if (h.includes('9') && (h.includes('план') || h.includes('міс')) && !h.includes('%') && nineMonthStart < 0) nineMonthStart = j;
        else if ((h.includes('заготовлено') || h.includes('заготівл')) && !h.includes('%') && harvestedStart < 0) harvestedStart = j;
        else if (h.includes('%') && h.includes('9') && pct9Start < 0) pct9Start = j;
        else if (h.includes('%') && h.includes('річн') && pctAnnualStart < 0) pctAnnualStart = j;
    });

    // If keyword matching found groups, use them. Each group has 3 sub-columns.
    if (annualStart >= 0 && harvestedStart >= 0) {
        return {
            apt: annualStart, apr: annualStart + 1, apf: annualStart + 2,
            npt: nineMonthStart >= 0 ? nineMonthStart : annualStart + 3,
            npr: nineMonthStart >= 0 ? nineMonthStart + 1 : annualStart + 4,
            npf: nineMonthStart >= 0 ? nineMonthStart + 2 : annualStart + 5,
            ht: harvestedStart, hr: harvestedStart + 1, hf: harvestedStart + 2,
            p9t: pct9Start >= 0 ? pct9Start : harvestedStart + 3,
            p9r: pct9Start >= 0 ? pct9Start + 1 : harvestedStart + 4,
            p9f: pct9Start >= 0 ? pct9Start + 2 : harvestedStart + 5,
            pat: pctAnnualStart >= 0 ? pctAnnualStart : harvestedStart + 6,
            par: pctAnnualStart >= 0 ? pctAnnualStart + 1 : harvestedStart + 7,
            paf: pctAnnualStart >= 0 ? pctAnnualStart + 2 : harvestedStart + 8,
        };
    }

    // Fallback: positional mapping (office in col 0/1, data starts after)
    const d = officeCol + 1;
    return {
        apt: d, apr: d + 1, apf: d + 2,
        npt: d + 3, npr: d + 4, npf: d + 5,
        ht: d + 6, hr: d + 7, hf: d + 8,
        p9t: d + 9, p9r: d + 10, p9f: d + 11,
        pat: d + 12, par: d + 13, paf: d + 14,
    };
}
