// ===== Dashboard Builder — Gridstack integration =====
import { $, toast, showLoader } from '../utils.js';
import { WIDGET_TYPES, WIDGET_CATEGORIES } from './widget-catalog.js';
import { renderWidget, destroyWidgetChart } from './widget-renderer.js';
import { renderConfigPanel, setOnConfigChanged } from './widget-config-panel.js';
import { saveDashboard } from './dashboard-list.js';

let _grid = null;
let _widgets = [];      // { id, type, x, y, w, h, config }
let _selectedWidgetId = null;
let _currentDashboard = null;  // { id, name, description, ... }
let _onBuilderDone = null;

export function setOnBuilderDone(fn) { _onBuilderDone = fn; }

export function openBuilder(dashboard, container) {
    _currentDashboard = dashboard;
    _widgets = [];
    _selectedWidgetId = null;

    // Load widgets from existing config
    if (dashboard && dashboard.config && dashboard.config.widgets) {
        _widgets = dashboard.config.widgets.map(w => ({ ...w }));
    }

    renderBuilderUI(container);
    initGrid(container);
    renderAllWidgets();

    // Wire config panel callback
    setOnConfigChanged((widget, action) => {
        if (action === 'delete') {
            removeWidget(widget.id, container);
        } else {
            // Re-render the changed widget
            const el = container.querySelector(`.grid-stack-item[data-widget-id="${widget.id}"]`);
            if (el) renderWidget(el.querySelector('.wb-widget-body'), widget);
        }
    });
}

function renderBuilderUI(container) {
    const d = _currentDashboard || {};

    container.innerHTML = `
        <div class="wb-layout">
            <div class="wb-sidebar-left" id="wbCatalog">
                <div class="wb-sidebar-title">Віджети</div>
                ${WIDGET_CATEGORIES.map(cat => `
                    <div class="wb-cat-label">${cat.label}</div>
                    ${Object.values(WIDGET_TYPES).filter(w => w.category === cat.id).map(w => `
                        <div class="wb-catalog-item" data-widget-type="${w.type}" draggable="true">
                            <span class="wb-cat-icon">${w.icon}</span>
                            <span>${w.label}</span>
                        </div>
                    `).join('')}
                `).join('')}
            </div>

            <div class="wb-main">
                <div class="wb-toolbar">
                    <button class="btn btn-sm" id="wbBack">
                        <svg viewBox="0 0 24 24" width="14" height="14"><polyline points="15 18 9 12 15 6"/></svg>
                        Назад
                    </button>
                    <input type="text" class="de-input wb-name-input" id="wbName" value="${esc(d.name || 'Новий дашборд')}" placeholder="Назва дашборду">
                    <button class="btn btn-sm btn-primary" id="wbSave">Зберегти</button>
                    <button class="btn btn-sm" id="wbPreview">Перегляд</button>
                </div>
                <div class="wb-grid-area">
                    <div class="grid-stack" id="wbGrid"></div>
                </div>
            </div>

            <div class="wb-sidebar-right" id="wbConfigPanel">
                <div class="wb-cfg-empty"><p>Оберіть віджет для налаштування</p></div>
            </div>
        </div>
    `;

    // Wire toolbar
    container.querySelector('#wbBack').addEventListener('click', () => {
        if (_onBuilderDone) _onBuilderDone('back');
    });
    container.querySelector('#wbSave').addEventListener('click', () => handleSave(container));
    container.querySelector('#wbPreview').addEventListener('click', () => togglePreview(container));

    // Wire catalog drag
    container.querySelectorAll('.wb-catalog-item').forEach(item => {
        item.addEventListener('dragstart', e => {
            e.dataTransfer.setData('text/plain', item.dataset.widgetType);
        });
        item.addEventListener('click', () => {
            addWidget(item.dataset.widgetType, container);
        });
    });
}

function initGrid(container) {
    if (_grid) {
        try { _grid.destroy(false); } catch (e) {}
    }

    _grid = GridStack.init({
        column: 12,
        cellHeight: 80,
        margin: 8,
        animate: true,
        float: true,
        removable: false,
        acceptWidgets: true
    }, container.querySelector('#wbGrid'));

    // Handle drop from catalog
    _grid.on('dropped', (event, previousNode, newNode) => {
        // newNode contains position info
        if (newNode && newNode.el) {
            const type = newNode.el.getAttribute('data-widget-type');
            if (type) {
                _grid.removeWidget(newNode.el);
                addWidget(type, container, newNode.x, newNode.y);
            }
        }
    });

    // Handle resize/move — update widget positions
    _grid.on('change', (event, items) => {
        if (!items) return;
        for (const item of items) {
            const wid = item.el?.dataset?.widgetId;
            const w = _widgets.find(x => x.id === wid);
            if (w) {
                w.x = item.x; w.y = item.y;
                w.w = item.w; w.h = item.h;
            }
        }
    });

    // Handle resize — re-render charts
    _grid.on('resizestop', (event, el) => {
        const wid = el.dataset?.widgetId;
        const w = _widgets.find(x => x.id === wid);
        if (w) {
            destroyWidgetChart(el);
            renderWidget(el.querySelector('.wb-widget-body'), w);
        }
    });
}

function addWidget(type, container, x, y) {
    const def = WIDGET_TYPES[type];
    if (!def) return;

    const id = 'w_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const widget = {
        id, type,
        x: x || 0, y: y || 0,
        w: def.defaultSize.w, h: def.defaultSize.h,
        config: { ...def.defaultConfig }
    };
    _widgets.push(widget);

    const el = createWidgetElement(widget);
    _grid.addWidget(el, {
        x: widget.x, y: widget.y,
        w: widget.w, h: widget.h,
        minW: def.minSize.w, minH: def.minSize.h
    });

    renderWidget(el.querySelector('.wb-widget-body'), widget);
    selectWidget(widget.id, container);
}

function removeWidget(widgetId, container) {
    const idx = _widgets.findIndex(w => w.id === widgetId);
    if (idx >= 0) _widgets.splice(idx, 1);

    const el = container.querySelector(`.grid-stack-item[data-widget-id="${widgetId}"]`);
    if (el) {
        destroyWidgetChart(el);
        _grid.removeWidget(el);
    }

    if (_selectedWidgetId === widgetId) {
        _selectedWidgetId = null;
        renderConfigPanel(container.querySelector('#wbConfigPanel'), null);
    }
}

function createWidgetElement(widget) {
    const el = document.createElement('div');
    el.classList.add('grid-stack-item');
    el.dataset.widgetId = widget.id;

    el.innerHTML = `
        <div class="grid-stack-item-content wb-widget glass">
            <div class="wb-widget-header">
                <span class="wb-widget-title">${esc(widget.config.title || WIDGET_TYPES[widget.type]?.label || '')}</span>
            </div>
            <div class="wb-widget-body"></div>
        </div>
    `;

    // Click to select
    el.addEventListener('click', e => {
        if (e.target.closest('.wb-cfg-close')) return;
        selectWidget(widget.id, el.closest('.wb-layout')?.parentElement || document.querySelector('#builderContent'));
    });

    return el;
}

function selectWidget(widgetId, container) {
    _selectedWidgetId = widgetId;
    // Highlight
    container.querySelectorAll('.grid-stack-item').forEach(el => el.classList.toggle('wb-selected', el.dataset.widgetId === widgetId));

    const widget = _widgets.find(w => w.id === widgetId);
    renderConfigPanel(container.querySelector('#wbConfigPanel'), widget);
}

function renderAllWidgets() {
    for (const w of _widgets) {
        const def = WIDGET_TYPES[w.type];
        const el = createWidgetElement(w);
        _grid.addWidget(el, {
            x: w.x, y: w.y, w: w.w, h: w.h,
            minW: def ? def.minSize.w : 2,
            minH: def ? def.minSize.h : 2
        });
        renderWidget(el.querySelector('.wb-widget-body'), w);
    }
}

async function handleSave(container) {
    const name = container.querySelector('#wbName')?.value?.trim() || 'Новий дашборд';

    // Sync positions from grid
    const gridItems = _grid.getGridItems();
    for (const el of gridItems) {
        const wid = el.dataset?.widgetId;
        const node = el.gridstackNode;
        const w = _widgets.find(x => x.id === wid);
        if (w && node) {
            w.x = node.x; w.y = node.y;
            w.w = node.w; w.h = node.h;
        }
    }

    const config = {
        columns: 12,
        cellHeight: 80,
        widgets: _widgets
    };

    try {
        showLoader(true);
        const saved = await saveDashboard({
            id: _currentDashboard?.id || null,
            name,
            description: _currentDashboard?.description || '',
            config,
            is_public: _currentDashboard?.is_public || false,
            is_template: _currentDashboard?.is_template || false
        });
        _currentDashboard = saved;
        toast('Дашборд збережено');
    } catch (e) {
        toast('Помилка: ' + e.message, true);
    }
    showLoader(false);
}

function togglePreview(container) {
    const layout = container.querySelector('.wb-layout');
    if (layout) layout.classList.toggle('wb-preview-mode');
    if (_grid) _grid.setStatic(layout.classList.contains('wb-preview-mode'));
}

// Open dashboard in view-only mode
export function openDashboardView(dashboard, container) {
    _currentDashboard = dashboard;
    const widgets = dashboard.config?.widgets || [];

    container.innerHTML = `
        <div class="wb-view-header">
            <button class="btn btn-sm" id="wbViewBack">
                <svg viewBox="0 0 24 24" width="14" height="14"><polyline points="15 18 9 12 15 6"/></svg>
                Назад
            </button>
            <h3>${esc(dashboard.name)}</h3>
            <span class="wb-view-desc">${esc(dashboard.description || '')}</span>
        </div>
        <div class="grid-stack wb-view-grid" id="wbViewGrid"></div>
    `;

    container.querySelector('#wbViewBack').addEventListener('click', () => {
        if (_onBuilderDone) _onBuilderDone('back');
    });

    const viewGrid = GridStack.init({
        column: 12, cellHeight: 80, margin: 8,
        staticGrid: true, animate: false
    }, container.querySelector('#wbViewGrid'));

    for (const w of widgets) {
        const el = document.createElement('div');
        el.classList.add('grid-stack-item');
        el.innerHTML = `
            <div class="grid-stack-item-content wb-widget glass">
                <div class="wb-widget-header"><span class="wb-widget-title">${esc(w.config?.title || '')}</span></div>
                <div class="wb-widget-body"></div>
            </div>
        `;
        viewGrid.addWidget(el, { x: w.x, y: w.y, w: w.w, h: w.h });
        renderWidget(el.querySelector('.wb-widget-body'), w);
    }
}

function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
