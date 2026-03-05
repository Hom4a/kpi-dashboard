// ===== Summary Export to Excel =====
import { summaryIndicators, summaryWeekly, summaryWeeklyNotes } from './state-summary.js';

const MO = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];

export function exportSummaryExcel() {
    if (!summaryIndicators.length && !summaryWeekly.length) return;
    const wb = XLSX.utils.book_new();

    // Sheet 1: Monthly indicators pivot
    if (summaryIndicators.length) {
        const years = [...new Set(summaryIndicators.map(r => r.year))].sort();
        for (const year of years) {
            const data = summaryIndicators.filter(r => r.year === year && r.month > 0);
            const indicators = [...new Set(data.map(r => `${r.indicator_name}|${r.sub_type}`))];

            const rows = [['Показник', ...MO, 'Рік']];
            for (const key of indicators) {
                const [name, subType] = key.split('|');
                const label = subType === 'volume' ? `${name} (обсяг)` :
                    subType === 'price' ? `${name} (ціна)` : name;
                const row = [label];
                for (let m = 1; m <= 12; m++) {
                    const rec = data.find(r => r.indicator_name === name && r.sub_type === subType && r.month === m);
                    row.push(rec?.value_text || (rec?.value_numeric ?? ''));
                }
                // Annual
                const annual = summaryIndicators.find(r =>
                    r.indicator_name === name && r.sub_type === subType && r.year === year && r.month === 0
                );
                row.push(annual?.value_numeric ?? '');
                rows.push(row);
            }
            const ws = XLSX.utils.aoa_to_sheet(rows);
            ws['!cols'] = [{ wch: 45 }, ...Array(13).fill({ wch: 14 })];
            XLSX.utils.book_append_sheet(wb, ws, String(year));
        }
    }

    // Sheet 2: Weekly briefing
    if (summaryWeekly.length) {
        const dates = [...new Set(summaryWeekly.map(r => r.report_date))].sort().reverse();
        const rows = [['Дата', 'Секція', 'Показник', 'За тиждень', 'Попередній', 'З поч. року', 'Δ']];
        for (const d of dates) {
            const recs = summaryWeekly.filter(r => r.report_date === d);
            for (const r of recs) {
                rows.push([r.report_date, r.section, r.indicator_name,
                    r.value_current ?? '', r.value_previous ?? '', r.value_ytd ?? '', r.value_delta ?? '']);
            }
        }
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 35 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Тижневі');
    }

    // Sheet 3: Notes
    if (summaryWeeklyNotes.length) {
        const rows = [['Дата', 'Тип', 'Зміст']];
        for (const n of summaryWeeklyNotes) {
            rows.push([n.report_date, n.note_type, n.content]);
        }
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 80 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Нотатки');
    }

    XLSX.writeFile(wb, `Зведення_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
