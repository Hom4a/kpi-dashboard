// ===== API Monitor — Health Dashboard, Record Counts, Alerts =====
import { sb } from '../config.js';

const RPC_FUNCTIONS = [
    { name: 'get_executive_metrics', label: 'Executive Metrics', params: {} },
    { name: 'get_record_counts', label: 'Record Counts', params: {} },
    { name: 'get_kpi_summary', label: 'KPI Summary', params: {} },
    { name: 'get_forest_summary', label: 'Forest Summary', params: {} },
    { name: 'get_harvesting_summary', label: 'Harvesting Summary', params: {} },
    { name: 'get_market_comparison', label: 'Market Comparison', params: {} },
    { name: 'get_system_health', label: 'System Health', params: {} },
    { name: 'get_anomalies', label: 'Anomalies', params: {} },
    { name: 'get_audit_log', label: 'Audit Log', params: { p_limit: 5, p_offset: 0 } }
];

export async function renderMonitorTab(container) {
    container.innerHTML = `
        <div class="api-monitor">
            <div class="api-section">
                <h3>Здоров'я системи</h3>
                <div id="apiHealthGrid" class="api-health-grid">
                    <div class="api-loading">Завантаження...</div>
                </div>
            </div>
            <div class="api-section">
                <h3>Стан RPC-функцій</h3>
                <div id="apiRpcStatus" class="api-rpc-grid">
                    <div class="api-loading">Перевірка функцій...</div>
                </div>
            </div>
            <div class="api-section">
                <h3>Останні завантаження</h3>
                <div id="apiLastUploads" class="api-uploads-list">
                    <div class="api-loading">Завантаження...</div>
                </div>
            </div>
            <div class="api-section">
                <h3>Системні алерти</h3>
                <div id="apiAlerts" class="api-alerts-list">
                    <div class="api-loading">Перевірка...</div>
                </div>
            </div>
        </div>
    `;

    // Load data in parallel
    loadSystemHealth();
    checkRpcFunctions();
}

async function loadSystemHealth() {
    try {
        const { data, error } = await sb.rpc('get_system_health');
        if (error) throw error;

        renderHealthGrid(data.tables);
        renderLastUploads(data.lastUploads || []);
        renderAlerts(data.alerts || []);
    } catch (e) {
        const grid = document.getElementById('apiHealthGrid');
        if (grid) grid.innerHTML = `<div class="api-error">Помилка: ${e.message}. Виконайте SQL з sql/rpc-functions.sql в Supabase.</div>`;
    }
}

function renderHealthGrid(tables) {
    const grid = document.getElementById('apiHealthGrid');
    if (!grid || !tables) return;

    const tableLabels = {
        kpi_records: { label: 'KPI записи', icon: '📊' },
        forest_prices: { label: 'Ціни', icon: '🌲' },
        forest_inventory: { label: 'Залишки', icon: '📦' },
        harvesting_plan_fact: { label: 'План-факт', icon: '🪓' },
        harvesting_zsu: { label: 'ЗСУ', icon: '🛡️' },
        market_prices: { label: 'Ринок (країни)', icon: '🌍' },
        market_prices_ua: { label: 'Ринок (UA)', icon: '🇺🇦' },
        market_price_history: { label: 'Історія цін', icon: '📈' },
        eur_rates: { label: 'Курси EUR', icon: '💶' },
        audit_log: { label: 'Аудит-лог', icon: '📋' },
        profiles: { label: 'Користувачі', icon: '👥' },
        dashboard_configs: { label: 'Дашборди', icon: '🎨' }
    };

    grid.innerHTML = Object.entries(tables).map(([key, count]) => {
        const info = tableLabels[key] || { label: key, icon: '📁' };
        const status = count > 0 ? 'ok' : 'empty';
        return `
            <div class="api-health-card api-health-${status}">
                <div class="api-health-icon">${info.icon}</div>
                <div class="api-health-info">
                    <div class="api-health-label">${info.label}</div>
                    <div class="api-health-count">${Number(count).toLocaleString('uk-UA')}</div>
                </div>
                <div class="api-health-dot api-dot-${status}"></div>
            </div>
        `;
    }).join('');
}

function renderLastUploads(uploads) {
    const el = document.getElementById('apiLastUploads');
    if (!el) return;
    if (!uploads.length) {
        el.innerHTML = '<div class="api-empty">Немає завантажень</div>';
        return;
    }

    const typeLabels = { kpi: 'KPI', prices: 'Ціни', inventory: 'Залишки', harvesting_plan_fact: 'План-факт', harvesting_zsu: 'ЗСУ', market_prices: 'Ринок' };

    el.innerHTML = `<table class="api-table">
        <thead><tr><th>Тип</th><th>Файл</th><th>Записів</th><th>Час</th><th>Давність</th></tr></thead>
        <tbody>${uploads.map(u => {
            const hoursAgo = Math.round(u.hours_ago || 0);
            const ago = hoursAgo < 1 ? '<1 год' : hoursAgo < 24 ? `${hoursAgo} год` : `${Math.round(hoursAgo / 24)} дн`;
            const freshness = hoursAgo < 24 ? 'fresh' : hoursAgo < 168 ? 'normal' : 'stale';
            return `<tr>
                <td><span class="api-badge">${typeLabels[u.data_type] || u.data_type}</span></td>
                <td>${u.file_name || '—'}</td>
                <td>${u.row_count}</td>
                <td>${new Date(u.uploaded_at).toLocaleString('uk-UA')}</td>
                <td><span class="api-freshness api-freshness-${freshness}">${ago}</span></td>
            </tr>`;
        }).join('')}</tbody>
    </table>`;
}

function renderAlerts(alerts) {
    const el = document.getElementById('apiAlerts');
    if (!el) return;
    if (!alerts.length) {
        el.innerHTML = '<div class="api-success">Система в нормі — критичних алертів немає</div>';
        return;
    }

    el.innerHTML = alerts.map(a => {
        const icon = a.severity === 'warning' ? '⚠️' : 'ℹ️';
        return `<div class="api-alert api-alert-${a.severity}">${icon} ${a.message} <span class="api-alert-source">(${a.source})</span></div>`;
    }).join('');
}

async function checkRpcFunctions() {
    const container = document.getElementById('apiRpcStatus');
    if (!container) return;

    const results = [];
    for (const fn of RPC_FUNCTIONS) {
        const start = performance.now();
        try {
            const { data, error } = await sb.rpc(fn.name, fn.params);
            const ms = Math.round(performance.now() - start);
            results.push({
                name: fn.name, label: fn.label,
                status: error ? 'error' : 'ok',
                ms, error: error ? error.message : null
            });
        } catch (e) {
            results.push({
                name: fn.name, label: fn.label,
                status: 'error', ms: 0,
                error: e.message
            });
        }
    }

    container.innerHTML = results.map(r => `
        <div class="api-rpc-card api-rpc-${r.status}">
            <div class="api-rpc-dot api-dot-${r.status}"></div>
            <div class="api-rpc-info">
                <div class="api-rpc-name">${r.name}()</div>
                <div class="api-rpc-label">${r.label}</div>
            </div>
            <div class="api-rpc-ms">${r.status === 'ok' ? r.ms + 'ms' : '✗'}</div>
        </div>
    `).join('');
}
