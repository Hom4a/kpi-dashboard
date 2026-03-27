// ===== Export Summary to Word (.docx) =====
import { summaryWeekly, summaryWeeklyNotes, summaryIndicators, summaryBlockComments } from './state-summary.js';
import { WEEKLY_BLOCKS, MONTHLY_BLOCKS } from './block-map.js';

const MO = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
const fN = v => v == null ? '—' : typeof v === 'number' ? v.toLocaleString('uk-UA', { maximumFractionDigits: 2 }) : String(v);

const SECTION_LABELS = {
    kpi: 'Ключові показники', forest_protection: 'Незаконні рубки', raids: 'Рейдова робота',
    mru_raids: 'Спільні рейди з МРУ', demining: 'Розмінування', certification: 'Сертифікація',
    land_self_forested: 'Самозалісені землі', land_reforestation: 'Лісорозведення',
    land_reserves: 'Землі запасу', harvesting: 'Заготівля', contracts: 'Договори',
    sales: 'Реалізація', finance: 'Фінансовий стан', personnel: 'Персонал',
    legal: 'Правові питання', procurement: 'Закупівлі', zsu: 'Допомога ЗСУ'
};

async function loadDocxLib() {
    if (window.docx) return window.docx;
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/docx@8/build/index.umd.min.js';
        s.onload = () => resolve(window.docx);
        s.onerror = () => reject(new Error('Failed to load docx library'));
        document.head.appendChild(s);
    });
}

function makeTextRun(text, opts = {}) {
    const { bold, color, size } = opts;
    return new docx.TextRun({ text, bold, color, size: size || 20, font: 'Calibri' });
}

function makeParagraph(text, opts = {}) {
    const { heading, bold, color, spacing, alignment } = opts;
    return new docx.Paragraph({
        children: [makeTextRun(text, { bold, color })],
        heading: heading || undefined,
        alignment: alignment || undefined,
        spacing: { after: spacing || 100 }
    });
}

function makeTableRow(cells, isHeader = false) {
    return new docx.TableRow({
        tableHeader: isHeader,
        children: cells.map(cell => new docx.TableCell({
            children: [new docx.Paragraph({
                children: [makeTextRun(typeof cell === 'object' ? cell.text : cell, {
                    bold: isHeader || (typeof cell === 'object' && cell.bold),
                    color: typeof cell === 'object' ? cell.color : undefined,
                    size: 18
                })],
                spacing: { after: 40 }
            })],
            shading: isHeader ? { fill: 'F0F0F0' } : undefined,
            verticalAlign: docx.VerticalAlign.CENTER
        }))
    });
}

// ===== Weekly Export =====

export async function exportWeeklyDocx(reportDate) {
    const lib = await loadDocxLib();
    if (!reportDate) {
        const dates = [...new Set(summaryWeekly.map(r => r.report_date))].sort().reverse();
        reportDate = dates[0];
    }
    if (!reportDate) return;

    const data = summaryWeekly.filter(r => r.report_date === reportDate);
    const notes = summaryWeeklyNotes.filter(n => n.report_date === reportDate);
    const comments = summaryBlockComments.filter(c => c.report_type === 'weekly' && c.report_date === reportDate);

    const d = new Date(reportDate);
    const dateStr = `${d.getDate()}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;

    const sections = [];

    // Title
    sections.push(makeParagraph('ДП «Ліси України»', { heading: docx.HeadingLevel.HEADING_1, bold: true, alignment: docx.AlignmentType.CENTER }));
    sections.push(makeParagraph('Щотижнева інформаційна довідка', { heading: docx.HeadingLevel.HEADING_2, alignment: docx.AlignmentType.CENTER }));
    sections.push(makeParagraph(`Станом на ${dateStr}`, { alignment: docx.AlignmentType.CENTER, spacing: 200 }));

    for (const block of WEEKLY_BLOCKS) {
        const blockData = data.filter(r => block.sections.includes(r.section));
        const blockNotes = block.noteTypes ? notes.filter(n => block.noteTypes.includes(n.note_type)) : [];
        const comment = comments.find(c => c.block_id === block.id);

        if (!blockData.length && !blockNotes.length && !block.isText) continue;

        sections.push(makeParagraph(`${block.roman}. ${block.name}`, { heading: docx.HeadingLevel.HEADING_3, bold: true, spacing: 200 }));

        // Notes
        if (block.isText && blockNotes.length) {
            for (const n of blockNotes) {
                const label = n.note_type === 'general' ? 'Загальна оцінка' : n.note_type === 'events' ? 'Ключові події' : n.note_type === 'positive' ? 'Позитивна динаміка' : n.note_type === 'negative' ? 'Негативна/ризикова' : 'Інше';
                sections.push(makeParagraph(`${label}:`, { bold: true }));
                sections.push(makeParagraph(n.content));
            }
        }

        // Tables
        for (const sec of block.sections) {
            const sData = data.filter(r => r.section === sec);
            if (!sData.length) continue;

            if (block.sections.length > 1) {
                sections.push(makeParagraph(SECTION_LABELS[sec] || sec, { bold: true, spacing: 80 }));
            }

            const hasCur = sData.some(r => r.value_current != null);
            const hasPrev = sData.some(r => r.value_previous != null);
            const hasYtd = sData.some(r => r.value_ytd != null);
            const hasDelta = hasCur && hasPrev;

            const header = ['Показник'];
            if (hasCur) header.push('За звітний тиждень');
            if (hasDelta) header.push('%Δ до попер.тиж.');
            if (hasPrev) header.push('Попередній тиждень');
            if (hasYtd) header.push('З поч. року');

            const rows = [makeTableRow(header, true)];
            for (const r of sData) {
                const cells = [r.indicator_name];
                if (hasCur) cells.push(r.value_text || fN(r.value_current));
                if (hasDelta) {
                    const cur = r.value_current, prev = r.value_previous;
                    if (cur != null && prev != null && prev !== 0) {
                        const pct = Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
                        cells.push({ text: `${pct >= 0 ? '+' : ''}${pct}%`, color: pct > 0 ? '2E7D32' : pct < 0 ? 'C62828' : '666666' });
                    } else if (cur != null && prev === 0) {
                        cells.push({ text: `${cur > 0 ? '+' : ''}${fN(cur)}`, color: 'E67E22' });
                    } else {
                        cells.push('—');
                    }
                }
                if (hasPrev) cells.push(fN(r.value_previous));
                if (hasYtd) cells.push(fN(r.value_ytd));
                rows.push(makeTableRow(cells));
            }

            sections.push(new docx.Table({
                rows,
                width: { size: 100, type: docx.WidthType.PERCENTAGE }
            }));
        }

        if (comment) {
            sections.push(makeParagraph(`Коментар: ${comment.content}`, { color: '666666', spacing: 80 }));
        }
    }

    const doc = new docx.Document({
        sections: [{ children: sections }]
    });

    const blob = await docx.Packer.toBlob(doc);
    downloadBlob(blob, `Щотижнева_довідка_${dateStr}.docx`);
}

// ===== Monthly Export =====

export async function exportMonthlyDocx(year, month) {
    const lib = await loadDocxLib();
    if (!year) year = new Date().getFullYear();
    if (!month) month = new Date().getMonth() + 1;

    const allYears = [...new Set(summaryIndicators.map(r => r.year))].sort();
    const showYears = allYears.slice(-5);
    const allData = summaryIndicators.filter(r => r.sub_type === 'value');

    const sections = [];

    sections.push(makeParagraph('ДП «Ліси України»', { heading: docx.HeadingLevel.HEADING_1, bold: true, alignment: docx.AlignmentType.CENTER }));
    sections.push(makeParagraph('Основні показники діяльності', { heading: docx.HeadingLevel.HEADING_2, alignment: docx.AlignmentType.CENTER }));
    sections.push(makeParagraph(`${MO[month - 1]} ${year} року`, { alignment: docx.AlignmentType.CENTER, spacing: 200 }));

    for (const block of MONTHLY_BLOCKS) {
        if (block.isText) continue;

        const names = [...new Set(allData.filter(r => block.groups.includes(r.indicator_group)).map(r => r.indicator_name))];
        if (!names.length) continue;

        sections.push(makeParagraph(block.name, { heading: docx.HeadingLevel.HEADING_3, bold: true, spacing: 200 }));

        const header = ['Показник', ...showYears.map(String), `${MO[month-1]} ${year}`, 'Δ%'];
        const rows = [makeTableRow(header, true)];

        for (const name of names) {
            const cells = [name];
            for (const y of showYears) {
                const ann = allData.find(r => r.indicator_name === name && r.year === y && r.month === 0);
                cells.push(ann?.value_numeric != null ? fN(ann.value_numeric) : '—');
            }
            const cur = allData.find(r => r.indicator_name === name && r.year === year && r.month === month);
            const prev = allData.find(r => r.indicator_name === name && r.year === year && r.month === month - 1);
            cells.push({ text: cur?.value_numeric != null ? fN(cur.value_numeric) : '—', bold: true });

            if (cur?.value_numeric != null && prev?.value_numeric != null && prev.value_numeric !== 0) {
                const pct = ((cur.value_numeric - prev.value_numeric) / Math.abs(prev.value_numeric) * 100);
                cells.push({ text: `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`, color: pct > 0 ? '2E7D32' : pct < 0 ? 'C62828' : '000000' });
            } else {
                cells.push('—');
            }
            rows.push(makeTableRow(cells));
        }

        sections.push(new docx.Table({
            rows,
            width: { size: 100, type: docx.WidthType.PERCENTAGE }
        }));
    }

    const doc = new docx.Document({
        sections: [{ children: sections }]
    });

    const blob = await docx.Packer.toBlob(doc);
    downloadBlob(blob, `Показники_${MO[month-1]}_${year}.docx`);
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
