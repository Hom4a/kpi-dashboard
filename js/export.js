// ===== Excel Export =====
import { allData } from './state.js';
import { toast } from './utils.js';

export function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(allData.map(r => ({
        'Дата': r.date, 'Показник': r.indicator, 'Тип': r.type, 'Значення': r.value, 'Од.': r.unit
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'KPI');
    XLSX.writeFile(wb, `KPI_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast('Excel експортовано');
}
