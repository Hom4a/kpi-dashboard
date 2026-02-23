// ===== Audit Viewer — Audit Log with Filters and Diff =====
import { sb } from '../config.js';

let _currentPage = 0;
const PAGE_SIZE = 25;
let _filterTable = null;
let _filterAction = null;

export function renderAuditTab(container) {
    container.innerHTML = `
        <div class="api-audit">
            <div class="api-audit-filters">
                <select id="auditFilterTable" class="api-select">
                    <option value="">Всі таблиці</option>
                    <option value="kpi_records">KPI записи</option>
                    <option value="forest_prices">Ціни</option>
                    <option value="forest_inventory">Залишки</option>
                    <option value="harvesting_plan_fact">План-факт</option>
                    <option value="harvesting_zsu">ЗСУ</option>
                    <option value="market_prices">Ринок</option>
                    <option value="market_prices_ua">Ринок UA</option>
                    <option value="profiles">Профілі</option>
                </select>
                <select id="auditFilterAction" class="api-select">
                    <option value="">Всі дії</option>
                    <option value="INSERT">INSERT</option>
                    <option value="UPDATE">UPDATE</option>
                    <option value="DELETE">DELETE</option>
                </select>
                <button class="btn btn-sm" id="auditRefreshBtn">Оновити</button>
                <span id="auditTotalCount" class="api-audit-count"></span>
            </div>
            <div id="auditTimeline" class="api-audit-timeline">
                <div class="api-loading">Завантаження аудит-логу...</div>
            </div>
            <div class="api-audit-pager">
                <button class="btn btn-sm" id="auditPrevBtn" disabled>← Попередня</button>
                <span id="auditPageInfo"></span>
                <button class="btn btn-sm" id="auditNextBtn">Наступна →</button>
            </div>
        </div>
    `;

    document.getElementById('auditFilterTable').addEventListener('change', e => {
        _filterTable = e.target.value || null;
        _currentPage = 0;
        loadAuditLog();
    });
    document.getElementById('auditFilterAction').addEventListener('change', e => {
        _filterAction = e.target.value || null;
        _currentPage = 0;
        loadAuditLog();
    });
    document.getElementById('auditRefreshBtn').addEventListener('click', () => loadAuditLog());
    document.getElementById('auditPrevBtn').addEventListener('click', () => {
        if (_currentPage > 0) { _currentPage--; loadAuditLog(); }
    });
    document.getElementById('auditNextBtn').addEventListener('click', () => {
        _currentPage++;
        loadAuditLog();
    });

    loadAuditLog();
}

async function loadAuditLog() {
    const timeline = document.getElementById('auditTimeline');
    if (!timeline) return;

    timeline.innerHTML = '<div class="api-loading">Завантаження...</div>';

    try {
        const params = {
            p_limit: PAGE_SIZE,
            p_offset: _currentPage * PAGE_SIZE
        };
        if (_filterTable) params.p_table_name = _filterTable;
        if (_filterAction) params.p_action = _filterAction;

        const { data, error } = await sb.rpc('get_audit_log', params);
        if (error) throw error;

        const total = data.total || 0;
        const records = data.records || [];

        document.getElementById('auditTotalCount').textContent = `${total} записів`;
        document.getElementById('auditPageInfo').textContent =
            `${_currentPage * PAGE_SIZE + 1}–${Math.min((_currentPage + 1) * PAGE_SIZE, total)} з ${total}`;
        document.getElementById('auditPrevBtn').disabled = _currentPage === 0;
        document.getElementById('auditNextBtn').disabled = (_currentPage + 1) * PAGE_SIZE >= total;

        if (!records.length) {
            timeline.innerHTML = '<div class="api-empty">Немає записів аудиту. Завантажте дані для створення записів.</div>';
            return;
        }

        timeline.innerHTML = records.map(r => renderAuditEntry(r)).join('');

        // Bind diff toggle
        timeline.querySelectorAll('.api-audit-toggle-diff').forEach(btn => {
            btn.addEventListener('click', () => {
                const diff = btn.nextElementSibling;
                if (diff) diff.classList.toggle('hidden');
                btn.textContent = diff && diff.classList.contains('hidden') ? 'Показати зміни' : 'Сховати зміни';
            });
        });
    } catch (e) {
        timeline.innerHTML = `<div class="api-error">Помилка: ${e.message}. Виконайте SQL з sql/rpc-functions.sql.</div>`;
    }
}

function renderAuditEntry(r) {
    const actionColors = { INSERT: 'api-action-insert', UPDATE: 'api-action-update', DELETE: 'api-action-delete' };
    const actionIcons = { INSERT: '+', UPDATE: '~', DELETE: '−' };
    const date = new Date(r.created_at);
    const timeStr = date.toLocaleString('uk-UA');

    const hasDiff = r.action === 'UPDATE' && r.old_data && r.new_data;
    const hasData = r.action === 'INSERT' ? r.new_data : r.action === 'DELETE' ? r.old_data : null;

    let diffHtml = '';
    if (hasDiff) {
        diffHtml = `
            <button class="api-audit-toggle-diff btn btn-sm">Показати зміни</button>
            <div class="api-audit-diff hidden">${renderDiff(r.old_data, r.new_data)}</div>
        `;
    } else if (hasData) {
        const fields = Object.entries(hasData).filter(([k]) => !['id', 'upload_batch_id', 'uploaded_by', 'updated_at', 'created_at'].includes(k));
        if (fields.length > 0 && fields.length <= 8) {
            diffHtml = `<div class="api-audit-data">${fields.map(([k, v]) => `<span class="api-data-field"><b>${k}</b>: ${v}</span>`).join(' ')}</div>`;
        }
    }

    return `
        <div class="api-audit-entry">
            <div class="api-audit-row">
                <span class="api-audit-action ${actionColors[r.action] || ''}">${actionIcons[r.action] || '?'} ${r.action}</span>
                <span class="api-audit-table">${r.table_name}</span>
                <span class="api-audit-user">${r.user_name || 'system'} <span class="api-audit-role">${r.user_role || ''}</span></span>
                <span class="api-audit-time">${timeStr}</span>
            </div>
            ${diffHtml}
        </div>
    `;
}

function renderDiff(oldData, newData) {
    const allKeys = [...new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})])];
    const skipKeys = ['id', 'upload_batch_id', 'uploaded_by', 'updated_at', 'created_at'];

    const changes = allKeys.filter(k => !skipKeys.includes(k) && JSON.stringify(oldData[k]) !== JSON.stringify(newData[k]));

    if (!changes.length) return '<div class="api-no-changes">Без змін (тільки службові поля)</div>';

    return `<table class="api-diff-table">
        <thead><tr><th>Поле</th><th>Було</th><th>Стало</th></tr></thead>
        <tbody>${changes.map(k => `
            <tr>
                <td class="api-diff-key">${k}</td>
                <td class="api-diff-old">${formatValue(oldData[k])}</td>
                <td class="api-diff-new">${formatValue(newData[k])}</td>
            </tr>
        `).join('')}</tbody>
    </table>`;
}

function formatValue(v) {
    if (v === null || v === undefined) return '<em>null</em>';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
}
