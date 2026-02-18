// ===== Widget Renderer — renders widget content based on config =====
import { fmt, themeColor } from '../utils.js';
import { queryData } from './data-source.js';
import { COLOR_OPTIONS } from './widget-catalog.js';

// Render a single widget into its container element
export async function renderWidget(widgetEl, widgetConfig) {
    const body = widgetEl.querySelector('.wb-widget-body') || widgetEl;
    body.innerHTML = '<div class="wb-loading"><div class="spinner"></div></div>';

    try {
        switch (widgetConfig.type) {
            case 'kpi_card': await renderKpiCard(body, widgetConfig.config); break;
            case 'line_chart': await renderLineChart(body, widgetConfig.config); break;
            case 'bar_chart': await renderBarChart(body, widgetConfig.config); break;
            case 'pie_chart': await renderPieChart(body, widgetConfig.config); break;
            case 'table_widget': await renderTableWidget(body, widgetConfig.config); break;
            case 'text_widget': renderTextWidget(body, widgetConfig.config); break;
            case 'gauge': await renderGauge(body, widgetConfig.config); break;
            case 'alert_list': await renderAlertList(body, widgetConfig.config); break;
            default: body.innerHTML = '<p style="color:var(--text3);text-align:center">Невідомий тип віджету</p>';
        }
    } catch (e) {
        console.error('Widget render error:', e);
        body.innerHTML = `<p style="color:#E74C3C;text-align:center;font-size:12px">Помилка: ${e.message}</p>`;
    }
}

// Destroy chart instance stored on element
export function destroyWidgetChart(widgetEl) {
    if (widgetEl._chartInstance) {
        try { widgetEl._chartInstance.destroy(); } catch (e) {}
        widgetEl._chartInstance = null;
    }
}

function getColor(name) {
    const c = COLOR_OPTIONS.find(o => o.value === name);
    return c ? c.css : (name || 'var(--primary)');
}

function formatValue(value, format) {
    if (value == null || isNaN(value)) return '—';
    switch (format) {
        case 'volume_k': return fmt(value / 1000, 1) + ' тис.м³';
        case 'money_m': return fmt(value / 1000000, 1) + ' млн грн';
        case 'percent': return fmt(value, 1) + '%';
        case 'price': return fmt(value, 0) + ' грн/м³';
        default: return fmt(value, 0);
    }
}

// ===== KPI Card =====
async function renderKpiCard(el, cfg) {
    const rows = await queryData({
        source: cfg.data_source,
        filters: cfg.filters,
        groupBy: null, aggregation: null, metricField: null
    });

    let value = 0;
    const vals = rows.map(r => Number(r[cfg.metric_field])).filter(v => !isNaN(v));
    switch (cfg.aggregation) {
        case 'sum': value = vals.reduce((a, b) => a + b, 0); break;
        case 'avg': value = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0; break;
        case 'count': value = rows.length; break;
        case 'max': value = vals.length ? Math.max(...vals) : 0; break;
        case 'min': value = vals.length ? Math.min(...vals) : 0; break;
        default: value = vals.reduce((a, b) => a + b, 0);
    }

    const color = getColor(cfg.color);
    el.innerHTML = `
        <div class="wb-kpi" style="border-left:3px solid ${color}">
            <div class="wb-kpi-label">${cfg.title || 'KPI'}</div>
            <div class="wb-kpi-value" style="color:${color}">${formatValue(value, cfg.format)}</div>
            <div class="wb-kpi-sub">${rows.length} записів</div>
        </div>
    `;
}

// ===== Line Chart =====
async function renderLineChart(el, cfg) {
    const rows = await queryData({
        source: cfg.data_source,
        filters: cfg.filters
    });

    if (!rows.length) { el.innerHTML = noDataMsg(); return; }

    // Group by x_field, aggregate y_field
    const grouped = {};
    rows.forEach(r => {
        const x = r[cfg.x_field] || '';
        if (!grouped[x]) grouped[x] = [];
        grouped[x].push(Number(r[cfg.y_field]) || 0);
    });

    const labels = Object.keys(grouped).sort();
    const data = labels.map(k => {
        const vals = grouped[k];
        return cfg.aggregation === 'avg' ? vals.reduce((a, b) => a + b, 0) / vals.length
            : vals.reduce((a, b) => a + b, 0);
    });

    const color = getColor(cfg.color || 'green');
    const canvas = createCanvas(el);
    const ctx = canvas.getContext('2d');

    el._chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels.map(l => shortLabel(l)),
            datasets: [{ label: cfg.title, data, borderColor: color, backgroundColor: cfg.fill ? color + '33' : 'transparent', fill: !!cfg.fill, tension: 0.3 }]
        },
        options: chartOpts(cfg.title)
    });
}

// ===== Bar Chart =====
async function renderBarChart(el, cfg) {
    const rows = await queryData({
        source: cfg.data_source,
        filters: cfg.filters,
        groupBy: cfg.x_field,
        aggregation: cfg.aggregation || 'sum',
        metricField: cfg.y_field
    });

    if (!rows.length) { el.innerHTML = noDataMsg(); return; }

    const labels = rows.map(r => r[cfg.x_field] || '');
    const data = rows.map(r => r[cfg.y_field] || 0);
    const color = getColor(cfg.color || 'green');
    const canvas = createCanvas(el);
    const ctx = canvas.getContext('2d');

    el._chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.map(l => shortLabel(l)),
            datasets: [{ label: cfg.title, data, backgroundColor: color + 'CC', borderRadius: 4 }]
        },
        options: { ...chartOpts(cfg.title), indexAxis: cfg.horizontal ? 'y' : 'x' }
    });
}

// ===== Pie / Doughnut =====
async function renderPieChart(el, cfg) {
    const rows = await queryData({
        source: cfg.data_source,
        filters: cfg.filters,
        groupBy: cfg.group_by,
        aggregation: cfg.aggregation || 'sum',
        metricField: cfg.metric_field
    });

    if (!rows.length) { el.innerHTML = noDataMsg(); return; }

    const sorted = rows.sort((a, b) => (b[cfg.metric_field] || 0) - (a[cfg.metric_field] || 0)).slice(0, 10);
    const labels = sorted.map(r => r[cfg.group_by] || '');
    const data = sorted.map(r => r[cfg.metric_field] || 0);
    const colors = generateColors(labels.length);
    const canvas = createCanvas(el);
    const ctx = canvas.getContext('2d');

    el._chartInstance = new Chart(ctx, {
        type: cfg.doughnut ? 'doughnut' : 'pie',
        data: {
            labels,
            datasets: [{ data, backgroundColor: colors }]
        },
        options: { plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } } }, maintainAspectRatio: false }
    });
}

// ===== Table Widget =====
async function renderTableWidget(el, cfg) {
    let rows;
    if (cfg.group_by && cfg.aggregation && cfg.metric_field) {
        rows = await queryData({
            source: cfg.data_source, filters: cfg.filters,
            groupBy: cfg.group_by, aggregation: cfg.aggregation, metricField: cfg.metric_field,
            limit: cfg.limit || 50
        });
    } else {
        rows = await queryData({ source: cfg.data_source, filters: cfg.filters, limit: cfg.limit || 50 });
    }

    if (!rows.length) { el.innerHTML = noDataMsg(); return; }

    const cols = cfg.columns && cfg.columns.length ? cfg.columns : Object.keys(rows[0]).filter(k => !k.startsWith('_') && k !== 'id' && k !== 'upload_batch_id' && k !== 'uploaded_by' && k !== 'created_at' && k !== 'updated_at').slice(0, 8);

    el.innerHTML = `
        <div class="tbl-wrap" style="max-height:100%;overflow:auto">
            <table class="tbl" style="font-size:11px">
                <thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
                <tbody>${rows.map(r => `<tr>${cols.map(c => `<td>${fmtCell(r[c])}</td>`).join('')}</tr>`).join('')}</tbody>
            </table>
        </div>
    `;
}

// ===== Text Widget =====
function renderTextWidget(el, cfg) {
    el.innerHTML = `<div class="wb-text" style="text-align:${cfg.align || 'left'};padding:12px">${cfg.content || ''}</div>`;
}

// ===== Gauge =====
async function renderGauge(el, cfg) {
    const rows = await queryData({ source: cfg.data_source, filters: cfg.filters });
    if (!rows.length) { el.innerHTML = noDataMsg(); return; }

    const actual = rows.reduce((s, r) => s + (Number(r[cfg.value_field]) || 0), 0);
    const target = rows.reduce((s, r) => s + (Number(r[cfg.target_field]) || 0), 0);
    const pct = target > 0 ? (actual / target * 100) : 0;
    const color = pct >= 100 ? '#4A9D6F' : pct >= 80 ? '#F5A623' : '#E74C3C';

    el.innerHTML = `
        <div class="wb-gauge">
            <svg viewBox="0 0 100 60" width="100%" height="auto">
                <path d="M10 55 A 40 40 0 0 1 90 55" fill="none" stroke="var(--border)" stroke-width="8" stroke-linecap="round"/>
                <path d="M10 55 A 40 40 0 0 1 90 55" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round"
                      stroke-dasharray="${Math.min(pct, 100) * 1.26} 126"/>
            </svg>
            <div class="wb-gauge-value" style="color:${color}">${pct.toFixed(1)}%</div>
            <div class="wb-gauge-label">${cfg.title}</div>
        </div>
    `;
}

// ===== Alert List =====
async function renderAlertList(el, cfg) {
    const rows = await queryData({ source: cfg.data_source, filters: cfg.filters });
    if (!rows.length) { el.innerHTML = noDataMsg(); return; }

    const threshold = cfg.threshold || 80;
    const alerts = rows.filter(r => {
        const val = Number(r[cfg.condition_field]);
        return !isNaN(val) && val < threshold;
    }).sort((a, b) => (Number(a[cfg.condition_field]) || 0) - (Number(b[cfg.condition_field]) || 0));

    if (!alerts.length) {
        el.innerHTML = '<div style="padding:16px;text-align:center;color:var(--primary);font-size:13px">Все в нормі ✓</div>';
        return;
    }

    el.innerHTML = `<div class="wb-alerts">${alerts.map(a => {
        const val = Number(a[cfg.condition_field]) || 0;
        const cls = val < threshold * 0.6 ? 'exec-alert-danger' : 'exec-alert-warning';
        return `<div class="exec-alert ${cls}" style="font-size:12px;padding:6px 10px">
            <span>${a[cfg.label_field] || '—'}</span>
            <span style="margin-left:auto;font-weight:600">${fmt(val, 1)}%</span>
        </div>`;
    }).join('')}</div>`;
}

// ===== Helpers =====
function createCanvas(el) {
    el.innerHTML = '<canvas></canvas>';
    return el.querySelector('canvas');
}

function noDataMsg() {
    return '<p style="color:var(--text3);text-align:center;padding:20px;font-size:12px">Немає даних</p>';
}

function chartOpts(title) {
    return {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, title: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { font: { size: 10 } } }, x: { ticks: { font: { size: 10 }, maxRotation: 45 } } }
    };
}

function shortLabel(s) {
    if (!s) return '';
    if (s.length > 18) return s.slice(0, 16) + '…';
    return s;
}

function fmtCell(v) {
    if (v == null) return '—';
    if (typeof v === 'number') return v.toLocaleString('uk-UA');
    return String(v);
}

function generateColors(count) {
    const base = ['#4A9D6F', '#3498DB', '#F5A623', '#E74C3C', '#9B59B6', '#1ABC9C', '#E67E22', '#34495E', '#27AE60', '#2C3E50'];
    const result = [];
    for (let i = 0; i < count; i++) result.push(base[i % base.length] + 'CC');
    return result;
}
