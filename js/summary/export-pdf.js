// ===== Export Summary to PDF =====
// Uses jsPDF + html2canvas (already loaded via CDN)
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

function buildPrintHtml(title, subtitle, period, blocks) {
    let html = `<div style="font-family:Arial,sans-serif;color:#000;max-width:800px;margin:0 auto;padding:20px">
        <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:16px">
            <h1 style="font-size:16px;margin:0 0 4px">${title}</h1>
            <h2 style="font-size:14px;margin:0 0 4px;font-weight:normal">${subtitle}</h2>
            <div style="font-size:11px;color:#555">${period}</div>
        </div>`;

    for (const b of blocks) {
        html += b;
    }
    html += '</div>';
    return html;
}

function buildWeeklyBlockHtml(block, data, notes, comment) {
    let html = `<div style="margin-bottom:14px;page-break-inside:avoid">
        <div style="font-size:12px;font-weight:bold;border-bottom:1px solid #999;padding:4px 0;margin-bottom:6px">
            <span style="margin-right:6px">${block.roman}.</span>${block.name}
        </div>`;

    // Notes
    if (block.isText && notes.length) {
        for (const n of notes) {
            const label = n.note_type === 'general' ? 'Загальна оцінка' : n.note_type === 'events' ? 'Ключові події' : n.note_type === 'positive' ? 'Позитивна' : n.note_type === 'negative' ? 'Негативна' : 'Інше';
            html += `<div style="margin:4px 0;padding:4px 8px;border-left:2px solid #999;font-size:10px">
                <b>${label}:</b> ${n.content.replace(/\n/g, '<br>')}
            </div>`;
        }
    }

    // Tables
    for (const sec of block.sections) {
        const sData = data.filter(r => r.section === sec);
        if (!sData.length) continue;

        if (block.sections.length > 1) {
            html += `<div style="font-size:10px;font-weight:600;margin:6px 0 2px">${SECTION_LABELS[sec] || sec}</div>`;
        }

        const hasCur = sData.some(r => r.value_current != null);
        const hasPrev = sData.some(r => r.value_previous != null);
        const hasYtd = sData.some(r => r.value_ytd != null);
        const hasDelta = hasCur && hasPrev;

        const th = 'border:1px solid #ccc;padding:3px 5px;background:#f0f0f0';
        html += '<table style="width:100%;border-collapse:collapse;font-size:9px;margin:4px 0"><thead><tr>';
        html += `<th style="${th};text-align:left">Показник</th>`;
        if (hasCur) html += `<th style="${th}">За звітний тиждень</th>`;
        if (hasDelta) html += `<th style="${th}">%Δ до попер.тиж.</th>`;
        if (hasPrev) html += `<th style="${th}">Попередній тиждень</th>`;
        if (hasYtd) html += `<th style="${th}">З поч. року</th>`;
        html += '</tr></thead><tbody>';

        const td = 'border:1px solid #ccc;padding:3px 5px';
        for (const r of sData) {
            html += '<tr>';
            html += `<td style="${td}">${r.indicator_name}</td>`;
            if (hasCur) html += `<td style="${td};text-align:right">${r.value_text || fN(r.value_current)}</td>`;
            if (hasDelta) {
                const cur = r.value_current, prev = r.value_previous;
                let text = '—', color = '#999';
                if (cur != null && prev != null && prev !== 0) {
                    const pct = Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
                    text = `${pct >= 0 ? '+' : ''}${pct}%`;
                    color = pct > 0 ? '#2e7d32' : pct < 0 ? '#c62828' : '#666';
                } else if (cur != null && prev === 0) {
                    text = `${cur > 0 ? '+' : ''}${fN(cur)}`;
                    color = '#E67E22';
                }
                html += `<td style="${td};text-align:right;color:${color}">${text}</td>`;
            }
            if (hasPrev) html += `<td style="${td};text-align:right">${fN(r.value_previous)}</td>`;
            if (hasYtd) html += `<td style="${td};text-align:right">${fN(r.value_ytd)}</td>`;
            html += '</tr>';
        }
        html += '</tbody></table>';
    }

    if (comment) {
        html += `<div style="margin:4px 0;padding:4px 8px;background:#f5f5f5;border-radius:4px;font-size:9px;font-style:italic">Коментар: ${comment.content}</div>`;
    }

    html += '</div>';
    return html;
}

// ===== Weekly PDF =====

export async function exportWeeklyPdf(reportDate) {
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

    const blocks = [];
    for (const block of WEEKLY_BLOCKS) {
        const blockData = data.filter(r => block.sections.includes(r.section));
        const blockNotes = block.noteTypes ? notes.filter(n => block.noteTypes.includes(n.note_type)) : [];
        const comment = comments.find(c => c.block_id === block.id);
        if (!blockData.length && !blockNotes.length && !block.isText) continue;
        blocks.push(buildWeeklyBlockHtml(block, data, blockNotes, comment));
    }

    const fullHtml = buildPrintHtml('ДП «Ліси України»', 'Щотижнева інформаційна довідка', `Станом на ${dateStr}`, blocks);
    await renderToPdf(fullHtml, `Щотижнева_довідка_${dateStr}.pdf`);
}

// ===== Monthly PDF =====

export async function exportMonthlyPdf(year, month) {
    if (!year) year = new Date().getFullYear();
    if (!month) month = new Date().getMonth() + 1;

    const allYears = [...new Set(summaryIndicators.map(r => r.year))].sort();
    const showYears = allYears.slice(-5);
    const allData = summaryIndicators.filter(r => r.sub_type === 'value');

    const blocks = [];
    for (const block of MONTHLY_BLOCKS) {
        if (block.isText) continue;
        const names = [...new Set(allData.filter(r => block.groups.includes(r.indicator_group)).map(r => r.indicator_name))];
        if (!names.length) continue;

        let html = `<div style="margin-bottom:14px;page-break-inside:avoid">
            <div style="font-size:12px;font-weight:bold;border-bottom:1px solid #999;padding:4px 0;margin-bottom:6px">${block.name}</div>
            <table style="width:100%;border-collapse:collapse;font-size:9px;margin:4px 0"><thead><tr>
                <th style="border:1px solid #ccc;padding:3px 5px;background:#f0f0f0;text-align:left">Показник</th>
                ${showYears.map(y => `<th style="border:1px solid #ccc;padding:3px 5px;background:#f0f0f0">${y}</th>`).join('')}
                <th style="border:1px solid #ccc;padding:3px 5px;background:#f0f0f0">${MO[month-1]} ${year}</th>
                <th style="border:1px solid #ccc;padding:3px 5px;background:#f0f0f0">Δ%</th>
            </tr></thead><tbody>`;

        for (const name of names) {
            html += '<tr>';
            html += `<td style="border:1px solid #ccc;padding:3px 5px">${name}</td>`;
            for (const y of showYears) {
                const ann = allData.find(r => r.indicator_name === name && r.year === y && r.month === 0);
                html += `<td style="border:1px solid #ccc;padding:3px 5px;text-align:right">${ann?.value_numeric != null ? fN(ann.value_numeric) : '—'}</td>`;
            }
            const cur = allData.find(r => r.indicator_name === name && r.year === year && r.month === month);
            const prev = allData.find(r => r.indicator_name === name && r.year === year && r.month === month - 1);
            html += `<td style="border:1px solid #ccc;padding:3px 5px;text-align:right;font-weight:bold">${cur?.value_numeric != null ? fN(cur.value_numeric) : '—'}</td>`;

            if (cur?.value_numeric != null && prev?.value_numeric != null && prev.value_numeric !== 0) {
                const pct = ((cur.value_numeric - prev.value_numeric) / Math.abs(prev.value_numeric) * 100);
                const color = pct > 0 ? '#2e7d32' : pct < 0 ? '#c62828' : '#000';
                const r = Math.round(pct * 10) / 10;
                html += `<td style="border:1px solid #ccc;padding:3px 5px;text-align:right;color:${color};font-weight:bold">${r>=0?'+':''}${r}%</td>`;
            } else {
                html += '<td style="border:1px solid #ccc;padding:3px 5px;text-align:right;color:#999">—</td>';
            }
            html += '</tr>';
        }
        html += '</tbody></table></div>';
        blocks.push(html);
    }

    const fullHtml = buildPrintHtml('ДП «Ліси України»', 'Основні показники діяльності', `${MO[month-1]} ${year} року`, blocks);
    await renderToPdf(fullHtml, `Показники_${MO[month-1]}_${year}.pdf`);
}

// ===== html2canvas → jsPDF =====

async function renderToPdf(html, filename) {
    // Create temp container
    const temp = document.createElement('div');
    temp.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;background:#fff;padding:20px;z-index:9999';
    temp.innerHTML = html;
    document.body.appendChild(temp);

    try {
        const canvas = await html2canvas(temp, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
        const imgData = canvas.toDataURL('image/png');

        const pdf = new jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageW = 210;
        const pageH = 297;
        const margin = 10;
        const contentW = pageW - margin * 2;
        const imgW = canvas.width;
        const imgH = canvas.height;
        const ratio = contentW / (imgW / 2); // scale=2
        const scaledH = (imgH / 2) * ratio;

        // Split across pages
        let yOffset = 0;
        const pageContentH = pageH - margin * 2;

        while (yOffset < scaledH) {
            if (yOffset > 0) pdf.addPage();
            pdf.addImage(imgData, 'PNG', margin, margin - yOffset, contentW, scaledH);
            yOffset += pageContentH;
        }

        pdf.save(filename);
    } finally {
        document.body.removeChild(temp);
    }
}
