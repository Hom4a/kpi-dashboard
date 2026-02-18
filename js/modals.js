// ===== Modals: Drill-down, Targets, Fullscreen, Viewer Access, Data Management =====
import { $, fmt, toast, themeColor } from './utils.js';
import { allData, charts, targets, MO, setTargets } from './state.js';
import { kill, freshCanvas, getTargetAnnotation } from './charts-common.js';
import { sb } from './config.js';
import { getRecordCount, getUploadHistory } from './db-kpi.js';
import { getPricesCount, getInventoryCount } from './forest/db-forest.js';
import { getPlanFactCount, getZsuCount } from './harvesting/db-harvesting.js';

let _renderAllFn = null;
export function setRenderAllCallback(fn) { _renderAllFn = fn; }

export function showDrillDown(monthKey) {
    $('drillModal').classList.add('on');
    const [y, m] = monthKey.split('-');
    $('drillTitle').textContent = `${MO[+m - 1]} ${y} — Деталі по днях`;
    kill('drill');
    const canvas = freshCanvas('wrapDrill', 'cDrill');
    const ctx = canvas.getContext('2d');
    const data = allData.filter(r => r.date.startsWith(monthKey) && r.type === 'realized').sort((a, b) => a._date - b._date);
    const labels = data.map(r => r._date.getDate());
    const vals = data.map(r => r.value);
    const pc = themeColor('--primary');
    charts['drill'] = new Chart(ctx, {
        type: 'bar', data: { labels, datasets: [{ label: 'Реалізація', data: vals, backgroundColor: pc + '80', borderRadius: 4, barPercentage: 0.8 }]},
        options: { responsive: true, maintainAspectRatio: false,
            scales: { x: { type: 'category', title: { display: true, text: 'День місяця' } }, y: { beginAtZero: true, ticks: { callback: v => v >= 1000 ? (v/1000|0) + 'k' : v } } },
            plugins: { legend: { display: false }, annotation: getTargetAnnotation('daily_realized', 'Денний план'), tooltip: { callbacks: { label: i => ` ${fmt(i.parsed.y, 0)} м\u00B3` } } }
        }
    });
}

export function closeDrillDown() { $('drillModal').classList.remove('on'); kill('drill'); }

export function toggleFullscreen(cardId) {
    const card = $(cardId);
    card.classList.toggle('fullscreen');
    requestAnimationFrame(() => { Object.values(charts).forEach(c => { try { c.resize(); } catch(e){} }); });
}

export function openTargetModal() {
    $('targetModal').classList.add('on');
    $('tgtDaily').value = targets.daily_realized || '';
    $('tgtMonthly').value = targets.monthly_realized || '';
    $('tgtCashDaily').value = targets.cash_daily || '';
}

export function closeTargetModal() { $('targetModal').classList.remove('on'); }

export function openFormatHelp() { $('formatHelpModal').classList.add('on'); }
export function closeFormatHelp() { $('formatHelpModal').classList.remove('on'); }

export function saveTargets() {
    const newTargets = { ...targets };
    newTargets.daily_realized = parseFloat($('tgtDaily').value) || 0;
    newTargets.monthly_realized = parseFloat($('tgtMonthly').value) || 0;
    newTargets.cash_daily = parseFloat($('tgtCashDaily').value) || 0;
    setTargets(newTargets);
    closeTargetModal();
    if (_renderAllFn) _renderAllFn();
    toast('Цілі збережено');
}

// ===== User Management (Admin Panel) =====
const ALL_PAGES = [
    { id: 'volumes', label: 'Обсяги' },
    { id: 'finance', label: 'Фінанси' },
    { id: 'forest', label: 'Продукція' },
    { id: 'harvesting', label: 'Заготівля' },
    { id: 'executive', label: 'Керівний' },
    { id: 'data-entry', label: 'Введення' },
    { id: 'builder', label: 'Дашборди' }
];

const ALL_ROLES = ['admin', 'director', 'analyst', 'editor', 'accountant', 'hr', 'forester', 'operator', 'viewer'];
const ROLE_LABELS = {
    admin: 'Адмін', director: 'Керівник', analyst: 'Аналітик',
    editor: 'Редактор', accountant: 'Бухгалтер', hr: 'HR',
    forester: 'Лісничий', operator: 'Оператор', viewer: 'Глядач'
};
const ORG_LEVELS = [
    { value: 'central', label: 'Центральний' },
    { value: 'regional', label: 'Обласний' },
    { value: 'branch', label: 'Філія' },
    { value: 'forest_unit', label: 'Лісництво' }
];

export async function openViewerAccess() {
    $('viewerAccessModal').classList.add('on');
    const list = $('viewerAccessList');
    list.innerHTML = '<p style="color:var(--text3);font-size:12px">Завантаження...</p>';
    try {
        const { data: users, error } = await sb.from('profiles')
            .select('id, full_name, role, allowed_pages, org_level, org_unit')
            .order('role').order('full_name');
        if (error) { toast('Помилка: ' + error.message, true); return; }
        if (!users || !users.length) {
            list.innerHTML = '<p style="color:var(--text3);font-size:12px">Немає користувачів</p>';
            return;
        }

        // Load org_units for dropdown
        let orgUnits = [];
        try {
            const { data: ou } = await sb.from('org_units').select('id, name, level').order('name');
            orgUnits = ou || [];
        } catch(e) { /* org_units table may not exist yet */ }

        list.innerHTML = `<div style="font-size:11px;color:var(--text3);margin-bottom:10px">${users.length} користувачів</div>` +
            users.map(u => {
                const roleBadge = `<span class="role-badge ${u.role}" style="font-size:10px;padding:1px 6px">${ROLE_LABELS[u.role] || u.role}</span>`;
                const isViewer = u.role === 'viewer';
                return `<div class="glass" style="padding:14px;margin-bottom:8px" data-user-id="${u.id}">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
                        <div style="font-size:13px;font-weight:600;color:var(--text);flex:1">${u.full_name || u.id.slice(0, 8)}</div>
                        ${roleBadge}
                    </div>
                    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">
                        <div style="flex:1;min-width:120px">
                            <label style="font-size:10px;color:var(--text3);display:block;margin-bottom:2px">Роль</label>
                            <select class="de-input ua-role-select" data-field="role" style="font-size:12px;padding:4px 6px;width:100%">
                                ${ALL_ROLES.map(r => `<option value="${r}"${u.role === r ? ' selected' : ''}>${ROLE_LABELS[r]}</option>`).join('')}
                            </select>
                        </div>
                        <div style="flex:1;min-width:120px">
                            <label style="font-size:10px;color:var(--text3);display:block;margin-bottom:2px">Рівень</label>
                            <select class="de-input ua-org-level" data-field="org_level" style="font-size:12px;padding:4px 6px;width:100%">
                                ${ORG_LEVELS.map(ol => `<option value="${ol.value}"${(u.org_level || 'central') === ol.value ? ' selected' : ''}>${ol.label}</option>`).join('')}
                            </select>
                        </div>
                        <div style="flex:1;min-width:140px">
                            <label style="font-size:10px;color:var(--text3);display:block;margin-bottom:2px">Орг. одиниця</label>
                            <select class="de-input ua-org-unit" data-field="org_unit" style="font-size:12px;padding:4px 6px;width:100%">
                                <option value="">—</option>
                                ${orgUnits.map(ou => `<option value="${ou.name}"${u.org_unit === ou.name ? ' selected' : ''}>${ou.name}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    ${isViewer ? `<div style="margin-top:8px">
                        <label style="font-size:10px;color:var(--text3);display:block;margin-bottom:4px">Доступні сторінки</label>
                        <div class="ua-pages-wrap" style="display:flex;gap:8px;flex-wrap:wrap">
                            ${ALL_PAGES.map(p => `<label style="font-size:11px;color:var(--text2);display:flex;align-items:center;gap:3px;cursor:pointer">
                                <input type="checkbox" data-page="${p.id}" ${(u.allowed_pages || ALL_PAGES.map(x => x.id)).includes(p.id) ? 'checked' : ''}> ${p.label}
                            </label>`).join('')}
                        </div>
                    </div>` : ''}
                </div>`;
            }).join('');

        // Show/hide viewer pages on role change
        list.querySelectorAll('.ua-role-select').forEach(sel => {
            sel.addEventListener('change', () => {
                const card = sel.closest('[data-user-id]');
                const pagesWrap = card.querySelector('.ua-pages-wrap');
                if (sel.value === 'viewer') {
                    if (!pagesWrap) {
                        // Add pages checkboxes
                        const div = document.createElement('div');
                        div.style.cssText = 'margin-top:8px';
                        div.innerHTML = `<label style="font-size:10px;color:var(--text3);display:block;margin-bottom:4px">Доступні сторінки</label>
                            <div class="ua-pages-wrap" style="display:flex;gap:8px;flex-wrap:wrap">
                                ${ALL_PAGES.map(p => `<label style="font-size:11px;color:var(--text2);display:flex;align-items:center;gap:3px;cursor:pointer">
                                    <input type="checkbox" data-page="${p.id}" checked> ${p.label}
                                </label>`).join('')}
                            </div>`;
                        card.appendChild(div);
                    }
                } else if (pagesWrap) {
                    pagesWrap.closest('div[style*="margin-top"]')?.remove();
                }
            });
        });
    } catch(e) { toast('Помилка: ' + e.message, true); }
}

export function closeViewerAccess() { $('viewerAccessModal').classList.remove('on'); }

export async function saveViewerAccess() {
    const items = document.querySelectorAll('#viewerAccessList [data-user-id]');
    let saved = 0;
    for (const item of items) {
        const id = item.dataset.userId;
        const role = item.querySelector('.ua-role-select')?.value;
        const orgLevel = item.querySelector('.ua-org-level')?.value || 'central';
        const orgUnit = item.querySelector('.ua-org-unit')?.value || '';

        const update = { role, org_level: orgLevel, org_unit: orgUnit };

        // Save allowed_pages only for viewers
        if (role === 'viewer') {
            const checked = [...item.querySelectorAll('.ua-pages-wrap input[type=checkbox]:checked')].map(c => c.dataset.page);
            update.allowed_pages = checked;
        }

        const { error } = await sb.from('profiles').update(update).eq('id', id);
        if (error) { toast('Помилка: ' + error.message, true); return; }
        saved++;
    }
    closeViewerAccess();
    toast(`Збережено ${saved} користувачів`);
}

// ===== Data Management =====

function fmtDateTime(iso) {
    try { return new Date(iso).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch(e) { return iso; }
}

function dataSection(title, count, lastUpload, clearOnclick, undoOnclick) {
    return `<div class="glass" style="padding:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div>
                <div style="font-size:13px;font-weight:600;color:var(--primary)">${title}</div>
                <div style="font-size:11px;color:var(--text3)">${count} записів</div>
            </div>
        </div>
        ${lastUpload ? `<div style="font-size:11px;color:var(--text3);margin-bottom:8px">Останнє: ${lastUpload.file_name} (${lastUpload.row_count} зап., ${fmtDateTime(lastUpload.uploaded_at)})</div>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${undoOnclick && lastUpload ? `<button class="btn btn-sm" onclick="${undoOnclick}">Скасувати останнє</button>` : ''}
            ${count > 0 ? `<button class="btn btn-sm btn-danger" onclick="${clearOnclick}">Очистити все</button>` : ''}
            ${count === 0 && !lastUpload ? '<span style="font-size:11px;color:var(--text3)">Немає даних</span>' : ''}
        </div>
    </div>`;
}

export async function openDataManage() {
    $('dataManageModal').classList.add('on');
    const content = $('dataManageContent');
    content.innerHTML = '<p style="color:var(--text3);font-size:12px">Завантаження статистики...</p>';
    try {
        const [kpiCount, pricesCount, inventoryCount, pfCount, zsuCount, kpiHistory] = await Promise.all([
            getRecordCount(), getPricesCount(), getInventoryCount(),
            getPlanFactCount(), getZsuCount(), getUploadHistory('kpi')
        ]);
        const [pricesHistory, inventoryHistory, pfHistory, zsuHistory] = await Promise.all([
            getUploadHistory('prices'), getUploadHistory('inventory'),
            getUploadHistory('harvesting_plan_fact'), getUploadHistory('harvesting_zsu')
        ]);
        content.innerHTML = `<div style="display:flex;flex-direction:column;gap:12px">
            ${dataSection('KPI (Обсяги / Фінанси)', kpiCount, kpiHistory[0] || null, 'clearKpiData()', 'undoLastKpi()')}
            ${dataSection('Середньозважені ціни', pricesCount, pricesHistory[0] || null, 'clearPrices()')}
            ${dataSection('Залишки лісопродукції', inventoryCount, inventoryHistory[0] || null, 'clearInventory()')}
            ${dataSection('План-факт заготівлі', pfCount, pfHistory[0] || null, 'clearPlanFact()')}
            ${dataSection('Довідка ЗСУ', zsuCount, zsuHistory[0] || null, 'clearZsu()')}
        </div>`;
    } catch(e) {
        content.innerHTML = `<p style="color:var(--rose);font-size:12px">Помилка: ${e.message}</p>`;
    }
}

export function closeDataManage() { $('dataManageModal').classList.remove('on'); }
