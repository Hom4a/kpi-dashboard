// ===== Parser: Реалізація лісопродукції (ЕОД 1С) =====
import { normalizeOffice } from '../validation.js';

/**
 * Parse "Реалізація лісопродукції (універсальний звіт)" Excel from ЕОД
 * @param {Object} wb - XLSX workbook
 * @returns {{ periodStart: string, periodEnd: string, rows: Array }}
 */
export function parseSales(wb) {
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    // Parse period
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

    // Find header row: "Лісгосп" must be in FIRST cell
    let headerIdx = -1;
    for (let i = 0; i < Math.min(15, data.length); i++) {
        const firstCell = String(data[i]?.[0] || '').trim().toLowerCase();
        if (firstCell === 'лісгосп') { headerIdx = i; break; }
    }
    if (headerIdx < 0) throw new Error('Не знайдено заголовок "Лісгосп" у файлі реалізації');

    // Map columns from sub-header row (Об'єм | Ціна | Сума без ПДВ)
    const subRow = data[headerIdx + 1] || [];
    let colVolume = -1, colPrice = -1, colAmount = -1;
    for (let idx = 0; idx < subRow.length; idx++) {
        const h = String(subRow[idx]).toLowerCase().trim();
        if ((h.includes("об'єм") || h.includes('обєм')) && colVolume < 0) colVolume = idx;
        else if (h.includes('ціна') && colPrice < 0) colPrice = idx;
        else if (h.includes('сума') && colAmount < 0) colAmount = idx;
    }

    // Parse data rows
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
            volume_m3: parseNum(row[colVolume]),
            avg_price_uah: parseNum(row[colPrice]),
            amount_excl_vat: parseNum(row[colAmount])
        });
    }

    return { periodStart, periodEnd, rows };
}

function parseNum(v) {
    if (v == null || v === '') return 0;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
    return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}
