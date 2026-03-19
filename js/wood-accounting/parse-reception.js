// ===== Parser: Приймання лісопродукції (ЕОД 1С) =====
import { normalizeOffice } from '../validation.js';

/**
 * Parse "Приймання лісопродукції (універсальний звіт)" Excel from ЕОД
 * @param {Object} wb - XLSX workbook
 * @returns {{ periodStart: string, periodEnd: string, rows: Array }}
 */
export function parseReception(wb) {
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    // Parse period from header area
    const dateRe = /(\d{2})\.(\d{2})\.(\d{4})/;
    let periodStart = '', periodEnd = '';
    for (let i = 0; i < Math.min(10, data.length); i++) {
        const line = (data[i] || []).join(' ');
        if (line.includes('Початок періоду')) {
            const m = line.match(dateRe);
            if (m) periodStart = `${m[3]}-${m[2]}-${m[1]}`;
        }
        if (line.includes('Кінець періоду')) {
            const m = line.match(dateRe);
            if (m) periodEnd = `${m[3]}-${m[2]}-${m[1]}`;
        }
    }

    // Find header row: "Лісгосп" must be in FIRST cell (not in filter text)
    let headerIdx = -1;
    for (let i = 0; i < Math.min(15, data.length); i++) {
        const firstCell = String(data[i]?.[0] || '').trim().toLowerCase();
        if (firstCell === 'лісгосп') { headerIdx = i; break; }
    }
    if (headerIdx < 0) throw new Error('Не знайдено заголовок "Лісгосп" у файлі приймання');

    // Map columns by scanning header row for product category names
    const headerRow = data[headerIdx] || [];
    const colMap = { firewood_np: -1, firewood_pv: -1, long_timber: -1, round_timber: -1, total: -1 };
    for (let idx = 0; idx < headerRow.length; idx++) {
        const h = String(headerRow[idx]).toLowerCase().trim();
        if (h.includes('дров') && h.includes('нп')) colMap.firewood_np = idx;
        else if (h.includes('дров') && h.includes('пв')) colMap.firewood_pv = idx;
        else if (h.includes('довгомір')) colMap.long_timber = idx;
        else if (h.includes('круглі') || h.includes('кругл')) colMap.round_timber = idx;
        else if (h === 'разом') colMap.total = idx;
    }

    // Parse data rows (skip header + "Об'єм" sub-header)
    const startRow = headerIdx + 2;
    const rows = [];

    for (let i = startRow; i < data.length; i++) {
        const row = data[i] || [];
        const rawName = String(row[0] || '').trim();
        if (!rawName || rawName.toLowerCase().includes('разом')) continue;

        const office = normalizeOffice(rawName);
        if (!office) continue;

        rows.push({
            regional_office: office,
            firewood_np_m3: parseNum(row[colMap.firewood_np]),
            firewood_pv_m3: parseNum(row[colMap.firewood_pv]),
            long_timber_m3: parseNum(row[colMap.long_timber]),
            round_timber_m3: parseNum(row[colMap.round_timber]),
            total_m3: parseNum(row[colMap.total])
        });
    }

    return { periodStart, periodEnd, rows };
}

function parseNum(v) {
    if (v == null || v === '') return 0;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
    return isNaN(n) ? 0 : Math.round(n * 1000) / 1000;
}
