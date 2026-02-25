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
                const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true });
                const out = [];
                for (let i = 1; i < rows.length; i++) {
                    const r = rows[i]; if (!r || !r[0]) continue;
                    let date = typeof r[0] === 'string' ? new Date(r[0]) : r[0] instanceof Date ? r[0] : null;
                    if (!date || isNaN(date.getTime())) continue;
                    const pad = n => String(n).padStart(2, '0');
                    const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
                    const indicator = (r[1] || '').toString().trim();
                    const rawVal = r[2], unit = (r[3] || '').toString().trim();
                    let value;
                    if (typeof rawVal === 'number') {
                        value = rawVal;
                    } else if (rawVal instanceof Date) {
                        const XL = new Date(1899, 11, 30);
                        value = Math.round((rawVal.getTime() - XL.getTime()) / 864e5);
                    } else if (typeof rawVal === 'string') {
                        const cleaned = rawVal.replace(/[\s\u00A0]/g, '').replace(',', '.');
                        value = parseFloat(cleaned) || 0;
                    } else {
                        value = 0;
                    }
                    const type = classifyIndicator(indicator);
                    if (type !== 'unknown') out.push({ date: dateStr, indicator, type, value, unit });
                }
                resolve(out);
            } catch (err) { reject(err); }
        };
        reader.readAsArrayBuffer(file);
    });
}
