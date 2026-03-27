// ===== Summary Page Rendering — Redesigned =====
import { $, fmt, show, hide, themeColor } from '../utils.js';
import { charts } from '../state.js';
import { kill, freshCanvas, makeGrad } from '../charts-common.js';
import { summaryIndicators, summaryWeekly, summaryWeeklyNotes, summaryFilterState, setSummaryFilterState, summaryBlockComments } from './state-summary.js';
import { initCollapsible, drawEnhancedSparkline } from '../ui-helpers.js';
import { WEEKLY_BLOCKS, MONTHLY_BLOCKS } from './block-map.js';
import { saveBlockComment } from './db-summary.js';
import { openWeeklyIndicatorModal, openMonthlyIndicatorModal } from './infographic-modal.js';

const MO = ['Січ','Лют','Бер','Кві','Тра','Чер','Лип','Сер','Вер','Жов','Лис','Гру'];

const GROUP_COLORS = {
    finance: '#2196f3', revenue: '#4caf50', production: '#ff9800', forestry: '#9c27b0'
};

// ===== Main Render =====

let _activeTab = 'monthly';

export function renderSummaryDashboard() {
    if (!summaryIndicators.length && !summaryWeekly.length) {
        show('summaryEmptyState');
        hide('summaryContent');
        return;
    }
    hide('summaryEmptyState');
    $('summaryContent').style.display = '';

    initTabBar();

    const years = [...new Set(summaryIndicators.map(r => r.year))].sort();
    const selYear = summaryFilterState.year || (years.length ? years[years.length - 1] : new Date().getFullYear());
    const selGroup = summaryFilterState.group || 'all';

    // Monthly tab
    populateYearSelect(years, selYear);
    renderKpiCards(selYear);
    renderGroupTabs(selGroup);
    renderPivotTable(selYear, selGroup);
    setupTzToggle(selYear);
    renderYearlySummary(years);
    renderCharts(selYear);

    // Weekly tab
    renderWeeklyBriefing();

    initCollapsible('#pageSummary');
    updateDataDate(selYear);
}

function initTabBar() {
    const bar = $('summaryTabBar');
    if (!bar || bar.dataset.wired) return;
    bar.dataset.wired = '1';

    bar.querySelectorAll('.summary-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            bar.querySelectorAll('.summary-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _activeTab = btn.dataset.tab;
            const monthly = $('summaryMonthlyTab');
            const weekly = $('summaryWeeklyTab');
            if (monthly) monthly.style.display = _activeTab === 'monthly' ? '' : 'none';
            if (weekly) weekly.style.display = _activeTab === 'weekly' ? '' : 'none';
        });
    });
}

// ===== Data Date indicator =====
function updateDataDate(year) {
    const el = $('summaryDataDate');
    if (!el) return;
    const monthly = summaryIndicators.filter(r => r.year === year && r.month > 0);
    if (monthly.length) {
        const maxMonth = Math.max(...monthly.map(r => r.month));
        el.textContent = `Дані за ${MO[maxMonth - 1]} ${year}`;
    }
}

// ===== Year Selector =====

function populateYearSelect(years, selected) {
    const sel = $('summaryYearSelect');
    if (!sel) return;
    sel.innerHTML = years.map(y =>
        `<option value="${y}" ${y == selected ? 'selected' : ''}>${y}</option>`
    ).join('');
    sel.onchange = () => {
        setSummaryFilterState({ ...summaryFilterState, year: parseInt(sel.value) });
        renderSummaryDashboard();
    };
}

// ===== KPI Cards — Enhanced =====

function getLatestValue(indicatorPattern, group, year) {
    const matches = summaryIndicators.filter(r =>
        r.indicator_name.toLowerCase().includes(indicatorPattern.toLowerCase()) &&
        (!group || r.indicator_group === group) &&
        r.sub_type === 'value' &&
        r.value_numeric != null
    );
    const annual = matches.find(r => r.year === year && r.month === 0);
    if (annual) return { value: annual.value_numeric, year };
    const monthly = matches.filter(r => r.year === year && r.month > 0).sort((a, b) => b.month - a.month);
    if (monthly.length) return { value: monthly[0].value_numeric, month: monthly[0].month, year };
    return null;
}

function getSparkData(indicatorPattern, group, year) {
    return summaryIndicators
        .filter(r =>
            r.indicator_name.toLowerCase().includes(indicatorPattern.toLowerCase()) &&
            (!group || r.indicator_group === group) &&
            r.sub_type === 'value' && r.month > 0 && r.year === year && r.value_numeric != null
        )
        .sort((a, b) => a.month - b.month)
        .map(r => ({ value: r.value_numeric, month: r.month }));
}

function getYoyChange(indicatorPattern, group, year) {
    const cur = getLatestValue(indicatorPattern, group, year);
    const prev = getLatestValue(indicatorPattern, group, year - 1);
    if (cur && prev && prev.value !== 0) {
        return ((cur.value - prev.value) / Math.abs(prev.value) * 100);
    }
    return null;
}

const KPI_DEFS = [
    { label: 'Загальний дохід', pattern: 'загальна реалізація', group: 'revenue', unit: 'млн грн', color: 'neon-primary', icClass: 'ic-primary', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>' },
    { label: 'ФОП', pattern: 'фонд оплати праці', group: 'finance', unit: 'млн грн', color: 'neon-secondary', icClass: 'ic-secondary', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>' },
    { label: 'Чисельність', pattern: 'чисельність', group: 'finance', unit: '', color: 'neon-accent', icClass: 'ic-accent', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>' },
    { label: 'Середня зарплата', pattern: 'середня заробітна', group: 'finance', unit: 'грн', color: 'neon-amber', icClass: 'ic-amber', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>' },
    { label: 'Залишки коштів', pattern: 'залишок коштів', group: 'finance', unit: 'млн грн', color: 'neon-green', icClass: 'ic-green', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12V7H5a2 2 0 010-4h14v4"/><path d="M3 5v14a2 2 0 002 2h16v-5"/><path d="M18 12a2 2 0 000 4h4v-4h-4z"/></svg>' },
    { label: 'Заготівля', pattern: 'заготівля деревини', group: 'forestry', unit: 'тис. м³', color: 'neon-rose', icClass: 'ic-rose', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22V8M5 12l7-8 7 8"/><path d="M8 22h8M3 18l4-4M21 18l-4-4"/></svg>' },
];

function renderKpiCards(year) {
    const grid = $('kpiGridSummary');
    if (!grid) return;

    grid.innerHTML = KPI_DEFS.map((c, idx) => {
        const data = getLatestValue(c.pattern, c.group, year);
        const val = data ? data.value : null;
        const change = getYoyChange(c.pattern, c.group, year);
        const sparkData = getSparkData(c.pattern, c.group, year);
        const isPartial = data && data.month && data.month < 12;
        const fmtVal = val != null ? fmt(val, val > 100000 ? 0 : 1) : '—';

        // Spark min/max labels
        let sparkMinLabel = '', sparkMaxLabel = '';
        if (sparkData.length > 2) {
            let minIdx = 0, maxIdx = 0;
            sparkData.forEach((s, i) => {
                if (s.value < sparkData[minIdx].value) minIdx = i;
                if (s.value > sparkData[maxIdx].value) maxIdx = i;
            });
            sparkMinLabel = MO[sparkData[minIdx].month - 1];
            sparkMaxLabel = MO[sparkData[maxIdx].month - 1];
        }

        return `<div class="glass kpi-card kpi-enhanced kpi-card-summary ${c.color}" data-kpi-group="${c.group}" data-kpi-pattern="${c.pattern}">
            <div class="kpi-header">
                <div class="kpi-icon-circle ${c.icClass}">${c.icon}</div>
                <div class="kpi-label">${c.label}${isPartial ? ` <small style="opacity:.5">(${MO[data.month - 1]})</small>` : ''}</div>
            </div>
            <div class="kpi-row">
                <div class="kpi-countup">
                    <div class="kpi-value" data-target="${val || 0}">${fmtVal}<span class="kpi-unit">${c.unit}</span></div>
                    ${change != null ? `<div class="kpi-change ${change >= 0 ? 'up' : 'down'}">${change >= 0 ? '\u25B2' : '\u25BC'} ${Math.abs(change).toFixed(1)}%</div>` : ''}
                    <div class="kpi-sub">${year} рік</div>
                </div>
                ${sparkData.length > 2 ? `<div class="sparkline-wrap"><canvas width="90" height="32" data-spark-idx="${idx}"></canvas><div class="spark-labels"><span>${sparkMinLabel}</span><span>${sparkMaxLabel}</span></div></div>` : ''}
            </div>
        </div>`;
    }).join('');

    // Draw sparklines
    KPI_DEFS.forEach((c, idx) => {
        const canvas = grid.querySelector(`canvas[data-spark-idx="${idx}"]`);
        if (!canvas) return;
        const sparkData = getSparkData(c.pattern, c.group, year);
        if (sparkData.length > 2) drawEnhancedSparkline(canvas, sparkData.map(s => s.value), themeColor('--primary'));
    });

    // Click → scroll to pivot row
    grid.querySelectorAll('.kpi-enhanced.kpi-card-summary').forEach(card => {
        card.addEventListener('click', () => {
            const pattern = card.dataset.kpiPattern;
            const pivotTable = $('summaryIndicatorsTable');
            if (!pivotTable) return;
            const rows = pivotTable.querySelectorAll('tbody tr');
            for (const row of rows) {
                const nameCell = row.querySelector('.ind-name');
                if (nameCell && nameCell.textContent.toLowerCase().includes(pattern)) {
                    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    row.style.transition = 'background .3s';
                    row.style.background = 'rgba(74,157,111,.15)';
                    setTimeout(() => { row.style.background = ''; }, 1500);
                    break;
                }
            }
        });
    });
}

// drawEnhancedSparkline imported from ui-helpers.js

// ===== Weekly Briefing — Alert Style =====

function renderWeeklyBriefing() {
    const card = $('summaryWeeklyCard');
    if (!card) return;

    if (!summaryWeekly.length) { card.style.display = 'none'; return; }
    card.style.display = '';

    const dates = [...new Set(summaryWeekly.map(r => r.report_date))].sort().reverse();
    const latestDate = dates[0];
    const latestData = summaryWeekly.filter(r => r.report_date === latestDate);
    const kpiData = latestData.filter(r => r.section === 'kpi');

    // Format weekly title: "За період з [пн] по [нд], тиждень №N"
    const sub = $('summaryWeeklyDate');
    if (sub) {
        const d = new Date(latestDate);
        const day = d.getDay();
        const mon = new Date(d); mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
        const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
        const oneJan = new Date(d.getFullYear(), 0, 1);
        const weekNum = Math.ceil(((d - oneJan) / 86400000 + oneJan.getDay() + 1) / 7);
        sub.textContent = `За період з ${formatDate(mon.toISOString().slice(0,10))} по ${formatDate(sun.toISOString().slice(0,10))}, тиждень №${weekNum}`;
    }

    // Notes now rendered inside weekly blocks (Block I)
    const notesBlock = $('summaryNotesBlock');
    if (notesBlock) notesBlock.style.display = 'none';

    // KPI summary table hidden per TZ 3.2 — data shown in Block II only
    const summaryTable = $('summaryWeeklyTable');
    if (summaryTable) summaryTable.style.display = 'none';

    // Skip rendering hidden KPI table (optimization)
    const tbody = $('tblBodyWeekly');
    if (!tbody) return;

    tbody.innerHTML = kpiData.map(r => {
        const delta = calcDeltaPct(r.value_current, r.value_previous);
        return `<tr class="clickable-row" data-section="kpi" data-indicator="${r.indicator_name}" data-current="${r.value_current ?? ''}" data-prev="${r.value_previous ?? ''}" data-delta="${delta.pct ?? ''}" style="cursor:pointer">
            <td><b>${r.indicator_name}</b></td>
            <td>${fmtNum(r.value_current)}</td>
            <td><span class="summary-delta-badge ${delta.badgeCls}">${delta.display}</span></td>
            <td>${fmtNum(r.value_previous)}</td>
            <td>${fmtNum(r.value_ytd)}</td>
        </tr>`;
    }).join('');

    // Click on KPI row → infographic modal
    tbody.querySelectorAll('.clickable-row').forEach(row => {
        row.onclick = () => openWeeklyIndicatorModal(
            row.dataset.section, row.dataset.indicator,
            parseFloat(row.dataset.current) || null,
            parseFloat(row.dataset.prev) || null,
            parseFloat(row.dataset.delta) || null
        );
    });

    renderWeeklySectionTabs(latestData, latestDate);
}

function renderWeeklyNotes(notes) {
    const container = $('summaryNotesBlock');
    if (!container) return;
    if (!notes.length) { container.style.display = 'none'; return; }
    container.style.display = '';

    const typeConfig = {
        general: { label: 'Загальна оцінка', icon: '\u2139\uFE0F', cls: 'summary-alert-info' },
        events: { label: 'Ключові події', icon: '\uD83D\uDCC4', cls: 'summary-alert-neutral' },
        positive: { label: 'Позитивна динаміка', icon: '\u2705', cls: 'summary-alert-success' },
        negative: { label: 'Негативна / ризикова', icon: '\u26A0\uFE0F', cls: 'summary-alert-danger' },
        decisions: { label: 'Питання для рішення', icon: '\u2753', cls: 'summary-alert-warning' }
    };

    const generalNote = notes.find(n => n.note_type === 'general');
    const otherNotes = notes.filter(n => n.note_type !== 'general');

    let html = '';
    if (generalNote) {
        const cfg = typeConfig.general;
        html += `<div class="summary-alert-hero ${cfg.cls}">
            <div class="note-label">${cfg.icon} ${cfg.label}</div>
            <div class="note-text">${generalNote.content.replace(/\n/g, '<br>')}</div>
        </div>`;
    }
    if (otherNotes.length) {
        html += '<div class="summary-alerts-grid">';
        html += otherNotes.map(n => {
            const cfg = typeConfig[n.note_type] || { label: n.note_type, icon: '\uD83D\uDCCC', cls: 'summary-alert-neutral' };
            return `<div class="summary-alert ${cfg.cls}">
                <div>
                    <div class="note-label">${cfg.icon} ${cfg.label}</div>
                    <div class="note-text">${n.content.replace(/\n/g, '<br>')}</div>
                </div>
            </div>`;
        }).join('');
        html += '</div>';
    }
    container.innerHTML = html;
}

// ===== Weekly Blocks — 13+1 TZ Structure =====

const SECTION_LABELS = {
    kpi: 'КРІ', forest_protection: 'Незаконні рубки', raids: 'Рейдова робота',
    mru_raids: 'Спільні рейди з МРУ', demining: 'Розмінування', certification: 'Сертифікація',
    land_self_forested: 'Самозалісені землі', land_reforestation: 'Лісорозведення',
    land_reserves: 'Землі запасу', harvesting: 'Заготівля', contracts: 'Договори',
    sales: 'Реалізація', finance: 'Фінанси', personnel: 'Персонал',
    legal: 'Правові питання', procurement: 'Закупівлі', zsu: 'Допомога ЗСУ'
};

function renderWeeklySectionTabs(data, date) {
    const container = $('summaryWeeklySections');
    if (!container) return;

    const availSections = new Set(data.filter(r => r.section !== 'kpi').map(r => r.section));
    if (!availSections.size) { container.style.display = 'none'; return; }
    container.style.display = '';

    const latestNotes = summaryWeeklyNotes.filter(n => n.report_date === date);
    const comments = summaryBlockComments.filter(c => c.report_type === 'weekly' && c.report_date === date);

    let html = '';
    for (const block of WEEKLY_BLOCKS) {
        // Skip blocks with no data and no notes
        const blockData = data.filter(r => block.sections.includes(r.section));
        const blockNotes = block.noteTypes
            ? latestNotes.filter(n => block.noteTypes.includes(n.note_type))
            : [];
        const blockComment = comments.find(c => c.block_id === block.id);

        if (!blockData.length && !blockNotes.length && !block.isText) continue;

        const isCollapsed = !['I', 'II'].includes(block.id);

        html += `<div class="ws-block" data-block="${block.id}">
            <div class="ws-block-header" data-collapse-toggle="${block.id}">
                <span class="ws-block-roman">${block.roman}.</span>
                <span class="ws-block-name">${block.name}</span>
                <span class="ws-block-count">${blockData.length ? blockData.length : ''}</span>
                <span class="ws-block-chevron">${isCollapsed ? '\u25B6' : '\u25BC'}</span>
            </div>
            <div class="ws-block-body" id="wsBlock_${block.id}" style="${isCollapsed ? 'display:none' : ''}">`;

        // Text blocks (I, XIV) — show notes
        if (block.isText && block.noteTypes) {
            if (blockNotes.length) {
                html += renderBlockNotes(blockNotes);
            } else {
                html += '<div class="ws-block-empty">Немає текстових даних</div>';
            }
            // Sub-blocks (e.g., "Питання для рішення" structured table)
            if (block.subBlocks) {
                for (const sub of block.subBlocks) {
                    html += `<div class="ws-subsection-label">${sub.name}</div>`;
                    if (sub.isStructured) {
                        const subNotes = latestNotes.filter(n => n.note_type === sub.noteType);
                        html += renderStructuredDecisions(sub, subNotes, date);
                    }
                }
            }
        }

        // Pre-comment area (Block XI — two comments: before + after table)
        if (block.preComment) {
            const preComment = comments.find(c => c.block_id === block.id + '_pre');
            html += renderBlockCommentArea(block.id + '_pre', date, preComment);
        }

        // Data blocks — show tables per section
        if (block.sections.length) {
            for (const sec of block.sections) {
                const sData = data.filter(r => r.section === sec);
                if (!sData.length) continue;

                if (block.sections.length > 1) {
                    html += `<div class="ws-subsection-label">${SECTION_LABELS[sec] || sec}</div>`;
                }
                html += renderSectionTable(sData, block.columns);
            }
        }

        // Comment area
        html += renderBlockCommentArea(block.id, date, blockComment);

        html += `</div></div>`;
    }

    container.innerHTML = html;

    // Wire collapse toggles
    container.querySelectorAll('.ws-block-header[data-collapse-toggle]').forEach(hdr => {
        hdr.style.cursor = 'pointer';
        hdr.onclick = () => {
            const blockId = hdr.dataset.collapseToggle;
            const body = container.querySelector(`#wsBlock_${blockId}`);
            const chevron = hdr.querySelector('.ws-block-chevron');
            if (!body) return;
            const isHidden = body.style.display === 'none';
            body.style.display = isHidden ? '' : 'none';
            if (chevron) chevron.textContent = isHidden ? '\u25BC' : '\u25B6';
        };
    });

    // Wire clickable rows → infographic modal
    container.querySelectorAll('.clickable-row').forEach(row => {
        row.onclick = () => openWeeklyIndicatorModal(
            row.dataset.section, row.dataset.indicator,
            parseFloat(row.dataset.current) || null,
            parseFloat(row.dataset.prev) || null,
            parseFloat(row.dataset.delta) || null
        );
    });

    // Wire comment save buttons
    container.querySelectorAll('.ws-comment-save').forEach(btn => {
        btn.onclick = async () => {
            const blockId = btn.dataset.block;
            const textarea = container.querySelector(`#wsComment_${blockId}`);
            if (!textarea) return;
            const content = textarea.value.trim();
            if (!content) return;
            btn.disabled = true;
            btn.textContent = 'Збереження...';
            try {
                await saveBlockComment({ reportType: 'weekly', reportDate: date, blockId, content });
                btn.textContent = 'Збережено';
                setTimeout(() => { btn.textContent = 'Зберегти'; btn.disabled = false; }, 1500);
            } catch (e) {
                btn.textContent = 'Помилка';
                setTimeout(() => { btn.textContent = 'Зберегти'; btn.disabled = false; }, 2000);
            }
        };
    });
}

function renderBlockNotes(notes) {
    const typeConfig = {
        general: { label: 'Загальна оцінка', cls: 'summary-alert-info' },
        events: { label: 'Ключові події', cls: 'summary-alert-neutral' },
        positive: { label: 'Позитивна динаміка', cls: 'summary-alert-success' },
        negative: { label: 'Негативна / ризикова', cls: 'summary-alert-danger' },
        decisions: { label: 'Питання для рішення', cls: 'summary-alert-warning' },
        other: { label: 'Інша інформація', cls: 'summary-alert-neutral' }
    };
    return notes.map(n => {
        const cfg = typeConfig[n.note_type] || { label: n.note_type, cls: 'summary-alert-neutral' };
        return `<div class="summary-alert ${cfg.cls}"><div>
            <div class="note-label">${cfg.label}</div>
            <div class="note-text">${n.content.replace(/\n/g, '<br>')}</div>
        </div></div>`;
    }).join('');
}

// Column key → header label mapping
const COL_LABELS = {
    indicator: 'Показник', unit: 'од.вим.', current: 'За звітний тиждень',
    delta_pct: '%Δ до попер.тиж.', previous: 'Попередній тиждень',
    ytd: 'З поч. року', total: 'Весь період', value: 'Значення',
    delta_yoy_pct: '%Δ до попер.року', yoy: 'Аналог. період поп. року',
    area: 'Площа, тис. га', count: 'Надлісництва', area_mln: 'Площа, млн.га', share: 'Частка, %'
};

function renderSectionTable(sData, blockColumns) {
    const section = sData[0]?.section || '';

    // Use block-level column config if provided, else auto-detect
    let colKeys;
    if (blockColumns && blockColumns.length) {
        colKeys = blockColumns;
    } else {
        colKeys = ['indicator'];
        if (sData.some(r => r.value_current != null)) { colKeys.push('current'); colKeys.push('delta_pct'); }
        if (sData.some(r => r.value_previous != null)) colKeys.push('previous');
        if (sData.some(r => r.value_ytd != null)) colKeys.push('ytd');
    }

    const cols = colKeys.map(k => COL_LABELS[k] || k);

    return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${
        sData.map(r => {
            const delta = calcDeltaPct(r.value_current, r.value_previous);
            const cellMap = {
                indicator: r.indicator_name,
                unit: r.unit || '',
                current: r.value_text || fmtNum(r.value_current),
                delta_pct: `<span class="summary-delta-badge ${delta.badgeCls}">${delta.display}</span>`,
                previous: fmtNum(r.value_previous),
                ytd: fmtNum(r.value_ytd),
                total: fmtNum(r.value_total),
                value: r.value_text || fmtNum(r.value_current),
                delta_yoy_pct: r.value_yoy != null ? calcDeltaPct(r.value_ytd, r.value_yoy).display : '—',
                yoy: fmtNum(r.value_yoy),
                area: fmtNum(r.value_current),
                count: fmtNum(r.value_current),
                area_mln: fmtNum(r.value_current),
                share: r.value_delta != null ? fmtNum(r.value_delta) + '%' : '—'
            };
            const cells = colKeys.map(k => `<td>${cellMap[k] ?? '—'}</td>`).join('');
            return `<tr class="clickable-row" data-section="${section}" data-indicator="${r.indicator_name}" data-current="${r.value_current ?? ''}" data-prev="${r.value_previous ?? ''}" data-delta="${delta.pct ?? ''}" style="cursor:pointer">${cells}</tr>`;
        }).join('')
    }</tbody></table></div>`;
}

function renderStructuredDecisions(subBlock, notes, date) {
    const cols = subBlock.structuredColumns;
    let rows = '';
    if (notes.length) {
        // Parse structured content: each note line is a row, pipe-separated
        for (const n of notes) {
            const lines = n.content.split('\n').filter(l => l.trim());
            for (const line of lines) {
                const parts = line.split('|').map(s => s.trim());
                rows += `<tr>${cols.map((_, i) => `<td>${parts[i] || ''}</td>`).join('')}</tr>`;
            }
        }
    }
    if (!rows) {
        rows = `<tr>${cols.map(() => '<td></td>').join('')}</tr>`;
    }
    return `<div class="tbl-wrap"><table class="tbl">
        <thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
    </table></div>`;
}

function renderBlockCommentArea(blockId, date, existing) {
    const val = existing ? existing.content.replace(/"/g, '&quot;').replace(/</g, '&lt;') : '';
    return `<div class="ws-block-comment">
        <textarea id="wsComment_${blockId}" class="ws-comment-input" placeholder="Коментар до блоку..." rows="2">${val}</textarea>
        <button class="ws-comment-save btn-sm" data-block="${blockId}">Зберегти</button>
    </div>`;
}

// ===== Group Toggle Tabs =====

function renderGroupTabs(activeGroup) {
    const bar = $('tglSummaryGroup');
    if (!bar) return;
    bar.querySelectorAll('button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.g === activeGroup);
        btn.onclick = () => {
            setSummaryFilterState({ ...summaryFilterState, group: btn.dataset.g });
            renderSummaryDashboard();
        };
    });
}

// ===== Pivot Table — Enhanced =====

function renderPivotTable(year, group) {
    const head = $('summaryIndicatorsHead');
    const tbody = $('tblBodyIndicators');
    if (!head || !tbody) return;

    let data = summaryIndicators.filter(r => r.year === year && r.month > 0);
    if (group !== 'all') data = data.filter(r => r.indicator_group === group);

    const seen = new Set();
    const indicators = [];
    data.forEach(r => {
        const key = `${r.indicator_name}|${r.sub_type}`;
        if (!seen.has(key)) { seen.add(key); indicators.push({ name: r.indicator_name, sub_type: r.sub_type, group: r.indicator_group }); }
    });

    const volPriceNames = new Set();
    indicators.forEach(ind => { if (ind.sub_type === 'volume' || ind.sub_type === 'price') volPriceNames.add(ind.name); });

    const displayRows = [];
    const processedVP = new Set();
    let lastGroup = null;
    indicators.forEach(ind => {
        const grp = ind.group;
        // Insert group header when group changes (only when showing all)
        if (group === 'all' && grp !== lastGroup) {
            displayRows.push({ type: 'group-header', group: grp });
            lastGroup = grp;
        }
        if (volPriceNames.has(ind.name)) {
            if (processedVP.has(ind.name)) return;
            processedVP.add(ind.name);
            displayRows.push({ name: ind.name, type: 'volprice', group: grp });
        } else {
            displayRows.push({ name: ind.name, type: 'value', group: grp });
        }
    });

    const curMonth = new Date().getMonth();
    head.innerHTML = `<tr><th>Показник</th>${MO.map((m, i) => `<th class="pivot-month-col" data-col="${i}"${year === new Date().getFullYear() && i === curMonth ? ' class="month-current"' : ''}>${m}</th>`).join('')}<th>Рік</th></tr>`;

    // Fix: properly set month-current class
    head.innerHTML = `<tr><th>Показник</th>${MO.map((m, i) => {
        const isCurrent = year === new Date().getFullYear() && i === curMonth;
        return `<th data-col="${i}"${isCurrent ? ' class="month-current"' : ''}>${m}</th>`;
    }).join('')}<th>Рік</th></tr>`;

    // Previous year data for January comparison (Jan current year vs Dec prev year)
    const prevYearData = summaryIndicators.filter(r => r.year === year - 1 && r.month === 12);
    const GROUP_LABELS = { finance: 'Фінанси', revenue: 'Доходи', production: 'Продукція', forestry: 'Лісогосподарство' };

    // Helper: get previous month value for month-to-month delta
    function getPrevMonthVal(name, subType, m) {
        if (m > 1) {
            // Same year, previous month
            const prev = data.find(r => r.indicator_name === name && r.sub_type === subType && r.month === m - 1);
            return prev?.value_numeric ?? null;
        } else {
            // January → compare with December of previous year
            const prev = prevYearData.find(r => r.indicator_name === name && r.sub_type === subType);
            return prev?.value_numeric ?? null;
        }
    }

    // Helper: render delta badge (month-to-month)
    function pivotBadge(current, prev) {
        if (current == null || prev == null) return { cls: '', badge: '' };
        if (prev === 0) {
            if (current === 0) return { cls: '', badge: '' };
            const abs = current > 0 ? `+${fmtNum(current)}` : fmtNum(current);
            return { cls: 'cell-orange', badge: `<span class="pivot-badge-orange">${abs}</span>` };
        }
        const pct = Math.round(((current - prev) / Math.abs(prev)) * 1000) / 10;
        if (pct === 0) return { cls: '', badge: '' };
        const cls = pct > 0 ? 'cell-up' : 'cell-down';
        const badge = pct > 0
            ? `<span class="pivot-badge-up">+${pct}%</span>`
            : `<span class="pivot-badge-down">${pct}%</span>`;
        return { cls, badge };
    }

    tbody.innerHTML = displayRows.map(row => {
        if (row.type === 'group-header') {
            const color = GROUP_COLORS[row.group] || '#666';
            return `<tr class="pivot-group-header"><td colspan="14"><span class="pivot-group-dot" style="background:${color}"></span>${GROUP_LABELS[row.group] || row.group}</td></tr>`;
        }

        const cells = [];
        let yearTotal = 0, yearCount = 0;

        for (let m = 1; m <= 12; m++) {
            if (row.type === 'volprice') {
                const vol = data.find(r => r.indicator_name === row.name && r.sub_type === 'volume' && r.month === m);
                const price = data.find(r => r.indicator_name === row.name && r.sub_type === 'price' && r.month === m);
                if (vol || price) {
                    const vStr = vol && vol.value_numeric != null ? fmtNum(vol.value_numeric) : '\u2014';
                    const pStr = price && price.value_numeric != null ? fmtNum(price.value_numeric) : '\u2014';
                    // Delta badge for volume (month-to-month)
                    const prevVol = vol?.value_numeric != null ? getPrevMonthVal(row.name, 'volume', m) : null;
                    const { cls, badge } = pivotBadge(vol?.value_numeric, prevVol);
                    cells.push(`<td class="volprice-cell ${cls}" data-col="${m-1}"><span class="vp-vol">${vStr}</span><span class="vp-sep">/</span><span class="vp-price">${pStr}</span>${badge}</td>`);
                    if (vol && vol.value_numeric != null) { yearTotal += vol.value_numeric; yearCount++; }
                } else {
                    cells.push(`<td class="cell-empty" data-col="${m-1}">\u2014</td>`);
                }
            } else {
                const rec = data.find(r => r.indicator_name === row.name && r.sub_type === 'value' && r.month === m);
                if (rec) {
                    if (rec.value_text) {
                        cells.push(`<td class="cell-text" data-col="${m-1}">${rec.value_text}</td>`);
                    } else if (rec.value_numeric != null) {
                        const prevVal = getPrevMonthVal(row.name, 'value', m);
                        const { cls, badge } = pivotBadge(rec.value_numeric, prevVal);
                        cells.push(`<td class="${cls}" data-col="${m-1}">${fmtNum(rec.value_numeric)}${badge ? ' ' + badge : ''}</td>`);
                        yearTotal += rec.value_numeric; yearCount++;
                    } else {
                        cells.push(`<td class="cell-empty" data-col="${m-1}">\u2014</td>`);
                    }
                } else {
                    cells.push(`<td class="cell-empty" data-col="${m-1}">\u2014</td>`);
                }
            }
        }

        const annual = summaryIndicators.find(r =>
            r.indicator_name === row.name && r.year === year && r.month === 0 &&
            (row.type === 'volprice' ? r.sub_type === 'volume' : r.sub_type === 'value') &&
            r.value_numeric != null
        );
        const yearVal = annual ? annual.value_numeric : (yearCount > 0 ? yearTotal : null);
        const yearCell = yearVal != null ? `<td class="cell-year"><b>${fmtNum(yearVal)}</b></td>` : '<td>\u2014</td>';

        const groupCls = `group-${row.group}`;
        const dotColor = GROUP_COLORS[row.group] || '#666';
        return `<tr class="${groupCls}"><td class="ind-name"><span class="pivot-group-dot" style="background:${dotColor}"></span>${row.name}</td>${cells.join('')}${yearCell}</tr>`;
    }).join('');

    // Column hover highlight
    const table = $('summaryIndicatorsTable');
    if (table) {
        table.addEventListener('mouseover', e => {
            const td = e.target.closest('td[data-col]');
            if (!td) return;
            const col = td.dataset.col;
            table.querySelectorAll('td.col-highlight').forEach(c => c.classList.remove('col-highlight'));
            table.querySelectorAll(`td[data-col="${col}"]`).forEach(c => c.classList.add('col-highlight'));
        });
        table.addEventListener('mouseleave', () => {
            table.querySelectorAll('td.col-highlight').forEach(c => c.classList.remove('col-highlight'));
        });
    }

    // Fullscreen toggle
    const fsBtn = $('btnPivotFullscreen');
    if (fsBtn && !fsBtn._init) {
        fsBtn._init = true;
        fsBtn.onclick = () => {
            const card = $('summaryIndicatorsCard');
            if (card) card.classList.toggle('fullscreen');
        };
    }
}

// ===== TZ Report (always visible on monthly tab) =====

function setupTzToggle(year) {
    // Always render TZ monthly report
    renderMonthlyTzReport(year);
}

// ===== Monthly TZ Format — Years comparison =====

function renderMonthlyTzReport(year, month) {
    const container = $('summaryTzReport');
    if (!container) return;

    if (!month) month = new Date().getMonth() + 1;
    const allYears = [...new Set(summaryIndicators.map(r => r.year))].sort();
    const showYears = allYears.slice(-5); // last 5 years

    // Month selector
    const monthSel = container.querySelector('#tzMonthSelect');
    if (monthSel && !monthSel._init) {
        monthSel._init = true;
        monthSel.innerHTML = MO.map((m, i) =>
            `<option value="${i + 1}"${i + 1 === month ? ' selected' : ''}>${m}</option>`
        ).join('');
        monthSel.onchange = () => {
            renderMonthlyTzReport(year, parseInt(monthSel.value));
        };
    }

    const tbody = container.querySelector('#tblBodyTzMonthly');
    if (!tbody) return;

    const head = container.querySelector('#tzMonthlyHead');
    if (head) {
        head.innerHTML = `<tr>
            <th>Показник</th>
            ${showYears.map(y => `<th>${y} рік</th>`).join('')}
            <th>${MO[month - 1]} ${year}</th>
            <th>%Δ до попер.місяця</th>
        </tr>`;
    }

    // Build rows grouped by MONTHLY_BLOCKS
    // MONTHLY_BLOCKS imported from block-map.js
    const GROUP_LABELS_M = { finance: 'Фінансові показники', revenue: 'Доходи та реалізація', production: 'Виробництво', forestry: 'Лісове господарство' };

    const allData = summaryIndicators.filter(r => r.sub_type === 'value');
    const names = [...new Set(allData.map(r => r.indicator_name))];

    let html = '';
    for (const block of MONTHLY_BLOCKS) {
        if (block.isText) continue;

        const blockNames = names.filter(name => {
            const rec = allData.find(r => r.indicator_name === name);
            return rec && block.groups.includes(rec.indicator_group);
        });
        if (!blockNames.length) continue;

        html += `<tr class="pivot-group-header"><td colspan="${showYears.length + 3}">
            <span class="pivot-group-dot" style="background:${GROUP_COLORS[block.groups[0]] || '#666'}"></span>
            ${block.name}
        </td></tr>`;

        for (const name of blockNames) {
            let cells = `<td class="ind-name">${name}</td>`;

            // Year annual values
            for (const y of showYears) {
                const annual = allData.find(r => r.indicator_name === name && r.year === y && r.month === 0);
                cells += `<td>${annual?.value_numeric != null ? fmtNum(annual.value_numeric) : '—'}</td>`;
            }

            // Selected month value
            const monthRec = allData.find(r => r.indicator_name === name && r.year === year && r.month === month);
            const prevMonthRec = allData.find(r => r.indicator_name === name && r.year === year && r.month === month - 1);

            cells += `<td><b>${monthRec?.value_numeric != null ? fmtNum(monthRec.value_numeric) : '—'}</b></td>`;

            // Delta %
            let deltaCls = '', deltaText = '—';
            if (monthRec?.value_numeric != null && prevMonthRec?.value_numeric != null) {
                if (prevMonthRec.value_numeric === 0) {
                    deltaCls = 'cell-orange';
                    deltaText = `<span class="pivot-badge-orange">${monthRec.value_numeric > 0 ? '+' : ''}${fmtNum(monthRec.value_numeric)}</span>`;
                } else {
                    const pct = Math.round(((monthRec.value_numeric - prevMonthRec.value_numeric) / Math.abs(prevMonthRec.value_numeric)) * 1000) / 10;
                    if (pct > 0) {
                        deltaCls = 'cell-up';
                        deltaText = `<span class="pivot-badge-up">+${pct}%</span>`;
                    } else if (pct < 0) {
                        deltaCls = 'cell-down';
                        deltaText = `<span class="pivot-badge-down">${pct}%</span>`;
                    } else {
                        deltaText = '0%';
                    }
                }
            }
            cells += `<td class="${deltaCls}">${deltaText}</td>`;

            html += `<tr class="clickable-row" data-indicator="${name}" style="cursor:pointer">${cells}</tr>`;
        }
    }

    tbody.innerHTML = html;

    // Click → monthly infographic
    tbody.querySelectorAll('.clickable-row').forEach(row => {
        row.onclick = () => openMonthlyIndicatorModal(row.dataset.indicator, '');
    });
}

// MONTHLY_BLOCKS now imported from block-map.js (top-level import)

// ===== Yearly Summary — Enhanced =====

function renderYearlySummary(years) {
    const tbody = $('tblBodyYearly');
    if (!tbody) return;

    const keyIndicators = [
        { pattern: 'загальна реалізація', label: 'Загальний дохід, млн грн' },
        { pattern: 'фонд оплати праці', label: 'ФОП, млн грн' },
        { pattern: 'чисельність', label: 'Чисельність' },
        { pattern: 'середня заробітна', label: 'Середня зарплата, грн' },
        { pattern: 'залишок коштів', label: 'Залишки коштів, млн грн' },
        { pattern: 'дебіторськ', label: 'Дебіторка, млн грн' },
        { pattern: 'кредиторськ', label: 'Кредиторка, млн грн' },
        { pattern: 'заготівля деревини', label: 'Заготівля, тис м\u00B3' },
        { pattern: 'реалізація лісоматеріалів круглих, тис', label: 'Реалізація кругляку, тис м\u00B3' },
    ];

    const head = $('summaryYearlyHead');
    if (head) {
        head.innerHTML = `<tr><th>Показник</th>${years.map(y => `<th>${y}</th>`).join('')}<th>Тренд</th></tr>`;
    }

    tbody.innerHTML = keyIndicators.map(ki => {
        const vals = years.map(y => {
            const annual = summaryIndicators.find(r =>
                r.indicator_name.toLowerCase().includes(ki.pattern) &&
                r.sub_type === 'value' && r.year === y && r.month === 0 && r.value_numeric != null
            );
            if (annual) return annual.value_numeric;
            const monthly = summaryIndicators.filter(r =>
                r.indicator_name.toLowerCase().includes(ki.pattern) &&
                r.sub_type === 'value' && r.year === y && r.month > 0 && r.value_numeric != null
            ).sort((a, b) => b.month - a.month);
            return monthly.length ? monthly[0].value_numeric : null;
        });

        const numVals = vals.filter(v => v != null);
        let trendHtml = '\u2014';
        let rowClass = '';
        if (numVals.length >= 2) {
            const first = numVals[0], last = numVals[numVals.length - 1];
            if (first !== 0) {
                const pct = Math.round((last - first) / Math.abs(first) * 1000) / 10;
                if (pct > 5) {
                    trendHtml = `<span class="trend-badge trend-up">\u2197 +${pct}%</span>`;
                    rowClass = 'yearly-row-up';
                } else if (pct < -5) {
                    trendHtml = `<span class="trend-badge trend-down">\u2198 ${pct}%</span>`;
                    rowClass = 'yearly-row-down';
                } else {
                    trendHtml = `<span class="trend-badge trend-flat">\u2192 ${pct > 0 ? '+' : ''}${pct}%</span>`;
                    rowClass = 'yearly-row-flat';
                }
            }
        }

        // Mini sparkline canvas
        const sparkId = `yearSpark_${ki.pattern.replace(/\s/g, '_').substring(0, 20)}`;

        return `<tr class="${rowClass}">
            <td><canvas class="yearly-spark" width="60" height="20" data-yearly-spark="${sparkId}" data-vals="${vals.map(v => v ?? '').join(',')}"></canvas>${ki.label}</td>
            ${vals.map(v => `<td>${v != null ? fmtNum(v) : '\u2014'}</td>`).join('')}
            <td>${trendHtml}</td>
        </tr>`;
    }).join('');

    // Draw yearly mini-sparklines
    tbody.querySelectorAll('canvas[data-yearly-spark]').forEach(canvas => {
        const vals = canvas.dataset.vals.split(',').map(v => v === '' ? null : Number(v)).filter(v => v != null);
        if (vals.length > 1) drawMiniSparkline(canvas, vals);
    });
}

function drawMiniSparkline(canvas, data) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    let max = -Infinity, min = Infinity;
    data.forEach(v => { if (v > max) max = v; if (v < min) min = v; });
    const range = max - min || 1;
    const pts = data.map((v, i) => ({
        x: 2 + (i / (data.length - 1)) * (w - 4),
        y: h - 2 - ((v - min) / range) * (h - 4)
    }));
    // Determine trend color
    const trend = data[data.length - 1] >= data[0] ? '#4A9D6F' : '#E74C3C';
    ctx.strokeStyle = trend; ctx.lineWidth = 1.5; ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
    // End dot
    const last = pts[pts.length - 1];
    ctx.beginPath(); ctx.arc(last.x, last.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = trend; ctx.fill();
}

// ===== Charts — Enhanced =====

function renderCharts(year) {
    renderRevenueChart(year);
    renderPayrollChart(year);
    renderProductionChart(year);
    renderPriceChart(year);
}

function getMonthlyData(pattern, group, year, subType = 'value') {
    const data = new Array(12).fill(null);
    summaryIndicators
        .filter(r => r.indicator_name.toLowerCase().includes(pattern.toLowerCase()) &&
            (!group || r.indicator_group === group) &&
            r.sub_type === subType && r.year === year && r.month > 0 && r.value_numeric != null)
        .forEach(r => { data[r.month - 1] = r.value_numeric; });
    return data;
}

function renderRevenueChart(year) {
    kill('cSummaryRevenue');
    const canvas = freshCanvas('wrapSummaryRevenue', 'cSummaryRevenue');
    const ctx = canvas.getContext('2d');

    const cur = getMonthlyData('загальна реалізація', 'revenue', year);
    const prev = getMonthlyData('загальна реалізація', 'revenue', year - 1);

    // Chart stat: YTD total
    const ytd = cur.filter(v => v != null).reduce((s, v) => s + v, 0);
    const statEl = $('statRevenue');
    if (statEl && ytd > 0) statEl.textContent = `YTD: ${fmt(ytd, 1)} млн`;

    // Cumulative line
    const cumulative = [];
    let cumSum = 0;
    cur.forEach(v => { cumSum += (v || 0); cumulative.push(v != null ? cumSum : null); });

    charts._summaryRevenue = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: MO,
            datasets: [
                { label: `${year}`, data: cur, backgroundColor: makeGrad(ctx, 74, 157, 111), borderRadius: 4, order: 2 },
                { label: `${year - 1}`, data: prev, backgroundColor: 'rgba(150,150,150,0.25)', borderRadius: 4, order: 3 },
                { label: 'Кумулятивно', data: cumulative, type: 'line', borderColor: 'rgba(74,157,111,0.6)', borderDash: [5, 3], pointRadius: 0, tension: 0.3, yAxisID: 'y1', order: 1, fill: false }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: true, position: 'top' } },
            scales: {
                y: { beginAtZero: true },
                y1: { type: 'linear', position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, display: true }
            }
        }
    });
}

function renderPayrollChart(year) {
    kill('cSummaryPayroll');
    const canvas = freshCanvas('wrapSummaryPayroll', 'cSummaryPayroll');
    const ctx = canvas.getContext('2d');

    const salary = getMonthlyData('середня заробітна', 'finance', year);
    const count = getMonthlyData('чисельність', 'finance', year);

    // Chart stat
    const latestSalary = [...salary].reverse().find(v => v != null);
    const statEl = $('statPayroll');
    if (statEl && latestSalary) statEl.textContent = `${fmt(latestSalary, 0)} грн`;

    charts._summaryPayroll = new Chart(ctx, {
        type: 'line',
        data: {
            labels: MO,
            datasets: [
                {
                    label: 'Зарплата, грн', data: salary,
                    borderColor: themeColor('--primary'), yAxisID: 'y',
                    tension: 0.3, pointRadius: 3,
                    fill: true, backgroundColor: makeGrad(ctx, 74, 157, 111, 0.15)
                },
                {
                    label: 'Чисельність', data: count,
                    borderColor: themeColor('--secondary'), yAxisID: 'y1',
                    tension: 0.3, pointRadius: 3, borderDash: [5, 3], fill: false
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: true, position: 'top' } },
            scales: {
                y: { type: 'linear', position: 'left', beginAtZero: false },
                y1: { type: 'linear', position: 'right', beginAtZero: false, grid: { drawOnChartArea: false } }
            }
        }
    });
}

function renderProductionChart(year) {
    kill('cSummaryProduction');
    const canvas = freshCanvas('wrapSummaryProduction', 'cSummaryProduction');
    const ctx = canvas.getContext('2d');

    const species = [
        { pattern: 'сосна тис', label: 'Сосна', color: '#4CAF50' },
        { pattern: 'дуб тис', label: 'Дуб', color: '#FF9800' },
        { pattern: 'вільха', label: 'Вільха/Береза', color: '#2196F3' },
        { pattern: 'інші тис', label: 'Інші', color: '#9C27B0' },
    ];

    // Chart stat
    const totalProd = species.reduce((sum, s) => {
        return sum + getMonthlyData(s.pattern, 'production', year, 'volume').filter(v => v != null).reduce((a, b) => a + b, 0);
    }, 0);
    const statEl = $('statProduction');
    if (statEl && totalProd > 0) statEl.textContent = `${fmt(totalProd, 1)} тис м\u00B3`;

    charts._summaryProd = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: MO,
            datasets: species.map(s => ({
                label: s.label,
                data: getMonthlyData(s.pattern, 'production', year, 'volume'),
                backgroundColor: s.color + '99',
                borderRadius: 2
            }))
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: true, position: 'top' } },
            scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }
        }
    });
}

function renderPriceChart(year) {
    kill('cSummaryYoy');
    const canvas = freshCanvas('wrapSummaryYoy', 'cSummaryYoy');
    const ctx = canvas.getContext('2d');

    const species = [
        { pattern: 'сосна тис', label: 'Сосна', color: '#4CAF50' },
        { pattern: 'дуб тис', label: 'Дуб', color: '#FF9800' },
        { pattern: 'вільха', label: 'Вільха/Береза', color: '#2196F3' },
    ];

    charts._summaryPrice = new Chart(ctx, {
        type: 'line',
        data: {
            labels: MO,
            datasets: species.map((s, i) => ({
                label: s.label,
                data: getMonthlyData(s.pattern, 'production', year, 'price'),
                borderColor: s.color, tension: 0.3, pointRadius: 3,
                fill: i === 0,
                backgroundColor: i === 0 ? makeGrad(ctx, 76, 175, 80, 0.08) : undefined
            }))
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: true, position: 'top' } },
            scales: { y: { beginAtZero: false } }
        }
    });
}

// ===== Helpers =====

/**
 * Calculate %Δ between current and previous values
 * Returns { pct, display, badgeCls }
 */
function calcDeltaPct(current, prev) {
    if (current == null || prev == null) return { pct: null, display: '—', badgeCls: 'badge-flat' };
    if (prev === 0) {
        // Can't divide by 0 — show absolute change with orange badge
        if (current === 0) return { pct: 0, display: '0%', badgeCls: 'badge-flat' };
        return { pct: null, display: current > 0 ? `+${fmtNum(current)}` : fmtNum(current), badgeCls: 'badge-orange' };
    }
    const pct = ((current - prev) / Math.abs(prev)) * 100;
    const rounded = Math.round(pct * 10) / 10;
    const sign = rounded >= 0 ? '+' : '';
    return {
        pct: rounded,
        display: `${sign}${rounded}%`,
        badgeCls: rounded > 0 ? 'badge-up' : rounded < 0 ? 'badge-down' : 'badge-flat'
    };
}

function fmtNum(v) {
    if (v == null) return '\u2014';
    if (Math.abs(v) >= 1000) return v.toLocaleString('uk-UA', { maximumFractionDigits: 1 });
    if (Math.abs(v) >= 1) return v.toLocaleString('uk-UA', { maximumFractionDigits: 2 });
    return v.toLocaleString('uk-UA', { maximumFractionDigits: 4 });
}

function formatDate(d) {
    if (!d) return '';
    const p = String(d).split('-');
    if (p.length === 3) return `${p[2]}.${p[1]}.${p[0]}`;
    return d;
}
