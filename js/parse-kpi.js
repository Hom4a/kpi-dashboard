// ===== KPI File Parsing =====

export function classifyIndicator(name) {
    const s = name.toLowerCase();
    if (s.includes('реалізован') || s.includes('реалізов')) return 'realized';
    if (s.includes('заготівл') || s.includes('заготовл')) return 'harvested';
    if (s.includes('надходжен') && s.includes('грошов')) {
        if (s.includes('помісяч') || s.includes('місяч') || s.includes('агрегац')) return 'cash_monthly';
        return 'cash_daily';
    }
    return 'unknown';
}

export function parseKpiFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
                const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });
                const out = [];
                for (let i = 1; i < rows.length; i++) {
                    const r = rows[i]; if (!r || !r[0]) continue;
                    let date = typeof r[0] === 'string' ? new Date(r[0]) : r[0] instanceof Date ? r[0] : null;
                    if (!date || isNaN(date.getTime())) continue;
                    const dateStr = date.toISOString().slice(0, 10);
                    const indicator = (r[1] || '').toString().trim();
                    const rawVal = r[2], unit = (r[3] || '').toString().trim();
                    let value;
                    if (typeof rawVal === 'string') {
                        const td = new Date(rawVal);
                        if (!isNaN(td.getTime()) && rawVal.includes('-') && td.getFullYear() < 1950) {
                            const XL = new Date(1899, 11, 30); value = Math.round((td.getTime() - XL.getTime()) / 864e5);
                        } else value = parseFloat(rawVal.replace(/[^\d.\-]/g, '')) || 0;
                    } else if (rawVal instanceof Date) {
                        const XL = new Date(1899, 11, 30); value = Math.round((rawVal.getTime() - XL.getTime()) / 864e5);
                    } else value = typeof rawVal === 'number' ? rawVal : 0;
                    const type = classifyIndicator(indicator);
                    if (type !== 'unknown') out.push({ date: dateStr, indicator, type, value, unit });
                }
                resolve(out);
            } catch (err) { reject(err); }
        };
        reader.readAsArrayBuffer(file);
    });
}
