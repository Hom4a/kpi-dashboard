// ===== Dashboard List — CRUD + list UI =====
import { sb } from '../config.js';
import { $, toast } from '../utils.js';
import { openBuilder, openDashboardView, setOnBuilderDone } from './builder.js';

let _dashboards = [];
let _container = null;

// ===== DB operations =====

export async function loadDashboards() {
    const { data, error } = await sb.from('dashboard_configs')
        .select('*')
        .order('updated_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
}

export async function saveDashboard(dashboard) {
    const { data: { user } } = await sb.auth.getUser();

    if (dashboard.id) {
        const { data, error } = await sb.from('dashboard_configs')
            .update({
                name: dashboard.name,
                description: dashboard.description,
                config: dashboard.config,
                is_public: dashboard.is_public,
                is_template: dashboard.is_template,
                updated_at: new Date().toISOString()
            })
            .eq('id', dashboard.id)
            .select()
            .single();
        if (error) throw new Error(error.message);
        return data;
    } else {
        const { data, error } = await sb.from('dashboard_configs')
            .insert({
                name: dashboard.name,
                description: dashboard.description || '',
                config: dashboard.config,
                is_public: dashboard.is_public || false,
                is_template: dashboard.is_template || false,
                created_by: user ? user.id : null
            })
            .select()
            .single();
        if (error) throw new Error(error.message);
        return data;
    }
}

export async function deleteDashboard(id) {
    const { error } = await sb.from('dashboard_configs').delete().eq('id', id);
    if (error) throw new Error(error.message);
}

export async function cloneDashboard(dashboard) {
    const { data: { user } } = await sb.auth.getUser();
    const { data, error } = await sb.from('dashboard_configs')
        .insert({
            name: dashboard.name + ' (копія)',
            description: dashboard.description || '',
            config: dashboard.config,
            is_public: false,
            is_template: false,
            created_by: user ? user.id : null
        })
        .select()
        .single();
    if (error) throw new Error(error.message);
    return data;
}

// ===== UI =====

export async function initDashboardList(container) {
    _container = container;
    container.innerHTML = '<p style="color:var(--text2);text-align:center;padding:40px">Завантаження дашбордів...</p>';

    try {
        _dashboards = await loadDashboards();
        renderList(container);
    } catch (e) {
        console.error('initDashboardList error:', e);
        container.innerHTML = `<p style="color:var(--text2);text-align:center;padding:40px">Помилка: ${e.message}</p>`;
    }
}

function renderList(container) {
    const myDashboards = _dashboards.filter(d => !d.is_template);
    const templates = _dashboards.filter(d => d.is_template);

    container.innerHTML = `
        <div class="de-list-header">
            <h3>Мої дашборди</h3>
            <p class="de-list-sub">Створюйте та налаштовуйте власні дашборди</p>
        </div>

        <div class="wb-list-toolbar">
            <button class="btn btn-sm btn-primary" id="wbCreateNew">
                <svg viewBox="0 0 24 24" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Створити новий
            </button>
        </div>

        ${myDashboards.length ? `
            <div class="de-cards-grid wb-dash-grid" id="wbMyDashboards"></div>
        ` : `
            <div class="de-empty" style="padding:30px">
                <p>Ще немає дашбордів. Створіть перший!</p>
            </div>
        `}

        ${templates.length ? `
            <div class="de-section-label" style="margin-top:24px">Шаблони</div>
            <div class="de-cards-grid wb-dash-grid" id="wbTemplates"></div>
        ` : ''}
    `;

    // Render my dashboards
    const myGrid = container.querySelector('#wbMyDashboards');
    if (myGrid) renderDashboardCards(myGrid, myDashboards, true);

    // Render templates
    const tplGrid = container.querySelector('#wbTemplates');
    if (tplGrid) renderDashboardCards(tplGrid, templates, false);

    // Create new
    container.querySelector('#wbCreateNew').addEventListener('click', () => {
        openBuilderWithCallback(null, container);
    });
}

function renderDashboardCards(grid, dashboards, allowManage) {
    grid.innerHTML = dashboards.map(d => {
        const widgetCount = d.config?.widgets?.length || 0;
        const updated = d.updated_at ? new Date(d.updated_at).toLocaleDateString('uk-UA') : '';
        return `
            <div class="de-card glass wb-dash-card" data-dash-id="${d.id}">
                <div class="wb-dash-preview">
                    ${renderMiniGrid(d.config?.widgets || [])}
                </div>
                <div class="de-card-info">
                    <div class="de-card-name">${esc(d.name)}</div>
                    <div class="de-card-desc">${widgetCount} віджетів${updated ? ' • ' + updated : ''}</div>
                    ${d.is_public ? '<span class="wb-public-badge">Публічний</span>' : ''}
                </div>
                <div class="wb-dash-actions">
                    <button class="btn btn-sm wb-dash-view" data-id="${d.id}" title="Переглянути">👁</button>
                    ${allowManage ? `
                        <button class="btn btn-sm wb-dash-edit" data-id="${d.id}" title="Редагувати">✏️</button>
                        <button class="btn btn-sm wb-dash-clone" data-id="${d.id}" title="Клонувати">📋</button>
                        <button class="btn btn-sm wb-dash-delete" data-id="${d.id}" title="Видалити">🗑</button>
                    ` : `
                        <button class="btn btn-sm wb-dash-clone" data-id="${d.id}" title="Використати шаблон">📋</button>
                    `}
                </div>
            </div>
        `;
    }).join('');

    // Wire actions
    grid.querySelectorAll('.wb-dash-view').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const d = _dashboards.find(x => x.id === btn.dataset.id);
            if (d) openViewWithCallback(d, grid.closest('#builderContent'));
        });
    });

    grid.querySelectorAll('.wb-dash-edit').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const d = _dashboards.find(x => x.id === btn.dataset.id);
            if (d) openBuilderWithCallback(d, grid.closest('#builderContent'));
        });
    });

    grid.querySelectorAll('.wb-dash-clone').forEach(btn => {
        btn.addEventListener('click', async e => {
            e.stopPropagation();
            const d = _dashboards.find(x => x.id === btn.dataset.id);
            if (!d) return;
            try {
                await cloneDashboard(d);
                _dashboards = await loadDashboards();
                renderList(_container);
                toast('Дашборд клоновано');
            } catch (err) { toast('Помилка: ' + err.message, true); }
        });
    });

    grid.querySelectorAll('.wb-dash-delete').forEach(btn => {
        btn.addEventListener('click', async e => {
            e.stopPropagation();
            if (!confirm('Видалити цей дашборд?')) return;
            try {
                await deleteDashboard(btn.dataset.id);
                _dashboards = await loadDashboards();
                renderList(_container);
                toast('Дашборд видалено');
            } catch (err) { toast('Помилка: ' + err.message, true); }
        });
    });

    // Card click = view
    grid.querySelectorAll('.wb-dash-card').forEach(card => {
        card.addEventListener('click', e => {
            if (e.target.closest('button')) return;
            const d = _dashboards.find(x => x.id === card.dataset.dashId);
            if (d) openViewWithCallback(d, _container);
        });
    });
}

function openBuilderWithCallback(dashboard, container) {
    setOnBuilderDone(async (action) => {
        if (action === 'back') {
            try { _dashboards = await loadDashboards(); } catch (e) {}
            renderList(container);
        }
    });
    openBuilder(dashboard, container);
}

function openViewWithCallback(dashboard, container) {
    setOnBuilderDone(async (action) => {
        if (action === 'back') {
            renderList(container);
        }
    });
    openDashboardView(dashboard, container);
}

// Mini grid preview for dashboard cards
function renderMiniGrid(widgets) {
    if (!widgets.length) return '<div class="wb-mini-empty">Порожній</div>';
    return `<svg viewBox="0 0 120 80" class="wb-mini-svg">
        ${widgets.slice(0, 8).map(w => {
            const x = (w.x || 0) * 10;
            const y = (w.y || 0) * 10;
            const width = Math.min((w.w || 3) * 10, 120 - x);
            const height = Math.min((w.h || 2) * 10, 80 - y);
            return `<rect x="${x}" y="${y}" width="${width - 1}" height="${height - 1}" rx="1" fill="var(--primary)" opacity="0.3"/>`;
        }).join('')}
    </svg>`;
}

function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
