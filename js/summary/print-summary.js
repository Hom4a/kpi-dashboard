// ===== Print Summary Reports (A4 format) =====
import { summaryWeekly, summaryWeeklyNotes, summaryIndicators, summaryBlockComments } from './state-summary.js';
import { WEEKLY_BLOCKS, MONTHLY_BLOCKS } from './block-map.js';

const MO = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
const fN = v => v == null ? '—' : typeof v === 'number' ? v.toLocaleString('uk-UA', { maximumFractionDigits: 2 }) : v;

const SECTION_LABELS = {
    kpi: 'Ключові показники', forest_protection: 'Незаконні рубки', raids: 'Рейдова робота',
    mru_raids: 'Спільні рейди з МРУ', demining: 'Розмінування', certification: 'Сертифікація',
    land_self_forested: '7.1. Самозалісені землі', land_reforestation: '7.2. Землі під лісорозведення',
    land_reserves: '7.3. Землі запасу лісогосподарського призначення',
    harvesting: 'Заготівля', contracts: '9.1. Укладені договори',
    sales: '9.2. Реалізація деревини', finance: 'Фінансовий стан', personnel: 'Персонал',
    legal: 'Правові питання', procurement: 'Закупівлі', zsu: 'Допомога ЗСУ'
};

function deltaPctBadge(current, prev) {
    if (current == null || prev == null) return '—';
    if (prev === 0) {
        if (current === 0) return '0%';
        return `<span class="print-badge-orange">${current > 0 ? '+' : ''}${fN(current)}</span>`;
    }
    const pct = ((current - prev) / Math.abs(prev)) * 100;
    const rounded = Math.round(pct * 10) / 10;
    const cls = rounded > 0 ? 'print-badge-up' : rounded < 0 ? 'print-badge-down' : '';
    return `<span class="${cls}">${rounded >= 0 ? '+' : ''}${rounded}%</span>`;
}

// ===== Weekly Print =====

export function printWeeklyReport(reportDate) {
    if (!reportDate) {
        const dates = [...new Set(summaryWeekly.map(r => r.report_date))].sort().reverse();
        reportDate = dates[0];
    }
    if (!reportDate) return;

    const data = summaryWeekly.filter(r => r.report_date === reportDate);
    const notes = summaryWeeklyNotes.filter(n => n.report_date === reportDate);
    const comments = summaryBlockComments.filter(c => c.report_type === 'weekly' && c.report_date === reportDate);

    const d = new Date(reportDate);
    const day = d.getDay();
    const mon = new Date(d); mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const fmtD = dt => `${dt.getDate()}.${String(dt.getMonth()+1).padStart(2,'0')}.${dt.getFullYear()}`;
    const oneJan = new Date(d.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((d - oneJan) / 86400000 + oneJan.getDay() + 1) / 7);

    let html = `<div class="print-header">
        <h1>ДП «Ліси України»</h1>
        <h2>Щотижнева інформаційна довідка</h2>
        <div class="print-period">За період з ${fmtD(mon)} по ${fmtD(sun)}, тиждень №${weekNum}</div>
    </div>`;

    for (const block of WEEKLY_BLOCKS) {
        const blockData = data.filter(r => block.sections.includes(r.section));
        const blockNotes = block.noteTypes ? notes.filter(n => block.noteTypes.includes(n.note_type)) : [];
        const comment = comments.find(c => c.block_id === block.id);

        if (!blockData.length && !blockNotes.length && !block.isText) continue;

        html += `<div class="print-block">
            <div class="print-block-header"><span class="roman">${block.roman}.</span> ${block.name}</div>`;

        // Notes — Block I: structured 4-section layout
        if (block.isText && block.id === 'I') {
            const noteMap = {};
            for (const n of blockNotes) noteMap[n.note_type] = n;
            const allDecisions = notes.filter(n => n.note_type === 'decisions');
            const SECS = [
                { type: 'general', label: '1. Загальна оцінка тижня' },
                { type: 'events', label: '2. Ключові події тижня' },
            ];
            for (const sec of SECS) {
                html += `<div class="print-note"><div class="print-note-label">${sec.label}</div><div>${noteMap[sec.type]?.content?.replace(/\n/g, '<br>') || '—'}</div></div>`;
            }
            html += `<div class="print-note-label" style="margin-top:6px"><b>3. Основна динаміка показників</b></div>`;
            html += `<div class="print-note"><div class="print-note-label">Позитивна</div><div>${noteMap['positive']?.content?.replace(/\n/g, '<br>') || '—'}</div></div>`;
            html += `<div class="print-note"><div class="print-note-label">Негативна / ризикова</div><div>${noteMap['negative']?.content?.replace(/\n/g, '<br>') || '—'}</div></div>`;
            html += `<div class="print-note-label" style="margin-top:6px"><b>4. Питання, що потребують управлінського рішення</b></div>`;
            html += `<div class="print-note"><div>${allDecisions[0]?.content?.replace(/\n/g, '<br>') || '—'}</div></div>`;
        } else if (block.isText && blockNotes.length) {
            html += blockNotes.map(n => `<div class="print-note">
                <div class="print-note-label">${n.note_type === 'general' ? 'Загальна оцінка' : n.note_type === 'events' ? 'Ключові події' : n.note_type === 'positive' ? 'Позитивна динаміка' : n.note_type === 'negative' ? 'Негативна/ризикова' : n.note_type === 'decisions' ? 'Питання для рішення' : 'Інше'}</div>
                <div>${n.content.replace(/\n/g, '<br>')}</div>
            </div>`).join('');
        }

        // Data tables
        for (const sec of block.sections) {
            const sData = data.filter(r => r.section === sec);
            if (!sData.length) continue;

            if (block.sections.length > 1) {
                html += `<div class="print-subsection">${SECTION_LABELS[sec] || sec}</div>`;
            }

            const hasCurrent = sData.some(r => r.value_current != null);
            const hasPrev = sData.some(r => r.value_previous != null);
            const hasYtd = sData.some(r => r.value_ytd != null);
            const hasDelta = hasCurrent && hasPrev;

            let cols = ['Показник'];
            if (hasCurrent) cols.push('За звітний тиждень');
            if (hasDelta) cols.push('%Δ до попер.тиж.');
            if (hasPrev) cols.push('Попередній тиждень');
            if (hasYtd) cols.push('З поч. року');

            html += `<table><thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>`;
            for (const r of sData) {
                html += '<tr>';
                html += `<td>${r.indicator_name}</td>`;
                if (hasCurrent) html += `<td>${r.value_text || fN(r.value_current)}</td>`;
                if (hasDelta) html += `<td>${deltaPctBadge(r.value_current, r.value_previous)}</td>`;
                if (hasPrev) html += `<td>${fN(r.value_previous)}</td>`;
                if (hasYtd) html += `<td>${fN(r.value_ytd)}</td>`;
                html += '</tr>';
            }
            html += '</tbody></table>';
        }

        if (comment) {
            html += `<div class="print-comment">Коментар: ${comment.content.replace(/\n/g, '<br>')}</div>`;
        }

        html += '</div>';
    }

    doPrint(html);
}

// ===== Monthly Print =====

export function printMonthlyReport(year, month) {
    if (!year) year = new Date().getFullYear();
    if (!month) month = new Date().getMonth() + 1;

    const allYears = [...new Set(summaryIndicators.map(r => r.year))].sort();
    const showYears = allYears.slice(-5);
    const allData = summaryIndicators.filter(r => r.sub_type === 'value');

    let html = `<div class="print-header">
        <h1>ДП «Ліси України»</h1>
        <h2>Основні показники діяльності</h2>
        <div class="print-period">${MO[month - 1]} ${year} року</div>
    </div>`;

    for (const block of MONTHLY_BLOCKS) {
        if (block.isText) continue;

        const names = [...new Set(allData.filter(r => block.groups.includes(r.indicator_group)).map(r => r.indicator_name))];
        if (!names.length) continue;

        html += `<div class="print-block">
            <div class="print-block-header">${block.name}</div>
            <table><thead><tr><th>Показник</th>${showYears.map(y=>`<th>${y}</th>`).join('')}<th>${MO[month-1]} ${year}</th><th>%Δ до попер.місяця</th></tr></thead><tbody>`;

        for (const name of names) {
            html += '<tr>';
            html += `<td>${name}</td>`;

            for (const y of showYears) {
                const ann = allData.find(r => r.indicator_name === name && r.year === y && r.month === 0);
                html += `<td>${ann?.value_numeric != null ? fN(ann.value_numeric) : '—'}</td>`;
            }

            const cur = allData.find(r => r.indicator_name === name && r.year === year && r.month === month);
            const prev = allData.find(r => r.indicator_name === name && r.year === year && r.month === month - 1);

            html += `<td><b>${cur?.value_numeric != null ? fN(cur.value_numeric) : '—'}</b></td>`;

            // Delta
            if (cur?.value_numeric != null && prev?.value_numeric != null && prev.value_numeric !== 0) {
                const pct = ((cur.value_numeric - prev.value_numeric) / Math.abs(prev.value_numeric) * 100);
                const cls = pct > 0 ? 'print-badge-up' : pct < 0 ? 'print-badge-down' : '';
                const r = Math.round(pct * 10) / 10;
                html += `<td><span class="${cls}">${r >= 0 ? '+' : ''}${r}%</span></td>`;
            } else if (cur?.value_numeric != null && prev?.value_numeric === 0) {
                html += `<td><span class="print-badge-orange">${cur.value_numeric > 0 ? '+' : ''}${fN(cur.value_numeric)}</span></td>`;
            } else {
                html += '<td>—</td>';
            }
            html += '</tr>';
        }
        html += '</tbody></table></div>';
    }

    doPrint(html, true); // landscape for monthly
}

// ===== Print Helper =====

function doPrint(contentHtml, landscape = false) {
    let container = document.getElementById('printContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'printContainer';
        container.style.display = 'none';
        document.body.appendChild(container);
    }
    container.innerHTML = contentHtml;
    container.style.display = 'block';
    container.classList.toggle('print-landscape', landscape);

    // Hide main content
    document.querySelectorAll('body > *:not(#printContainer)').forEach(el => {
        el.dataset.printHidden = el.style.display;
        el.style.display = 'none';
    });

    window.print();

    // Restore
    container.style.display = 'none';
    container.classList.remove('print-landscape');
    document.querySelectorAll('body > *:not(#printContainer)').forEach(el => {
        el.style.display = el.dataset.printHidden || '';
        delete el.dataset.printHidden;
    });
}
