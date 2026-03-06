// ===== Data Entry Main Module =====
// Shows list of available forms based on user role, routes to form renderer or type editor

import { $, toast, showLoader } from '../utils.js';
import { currentProfile } from '../state.js';
import { loadDatasetTypes } from './db-dynamic.js';
import { renderForm, setOnDataChanged } from './form-renderer.js';
import { renderTypeEditor, setOnTypeEditorDone } from './type-editor.js';
import { ICON_MAP } from './form-utils.js';
import { getRecordCountForType } from './db-dynamic.js';
import { renderWeeklyEntryForm } from '../summary/weekly-entry.js';
import { handleFile } from '../file-handler.js';
import { getSummaryWeeklyCount, getSummaryIndicatorCount } from '../summary/db-summary.js';

let _datasetTypes = [];
let _reloadCallbacks = [];

export function setDataEntryReloadCallback(fn) { _reloadCallbacks.push(fn); }

// Thematic groups for system forms
const THEME_GROUPS = [
    { id: 'finance', label: 'Фінанси та KPI', icon: 'bar-chart', types: ['kpi'] },
    { id: 'forest', label: 'Лісова продукція', icon: 'package', types: ['forest_prices', 'inventory'] },
    { id: 'harvesting', label: 'Заготівля та ринок', icon: 'target', types: ['harvesting_plan_fact', 'harvesting_zsu', 'market_prices'] },
    { id: 'summary', label: 'Зведення', icon: 'table', types: ['summary_indicators', 'summary_weekly'] },
];

// Hardcoded summary cards (not in dataset_types table)
const SUMMARY_CARDS = [
    {
        id: 'summary_indicators',
        name: 'summary_indicators',
        display_name: 'Основні показники',
        description: 'Завантаження xlsx-файлу',
        icon: 'table',
        is_upload_only: true,
        accept: '.xlsx,.xls',
        expected: 'summary_indicators'
    },
    {
        id: 'summary_weekly',
        name: 'summary_weekly',
        display_name: 'Тижнева довідка',
        description: 'Ручне введення або .docx',
        icon: 'edit',
        is_entry_form: true
    }
];

export async function initDataEntry() {
    const container = $('dataEntryContent');
    if (!container) return;

    container.innerHTML = '<p style="color:var(--text2);text-align:center;padding:40px">Завантаження форм...</p>';

    try {
        _datasetTypes = await loadDatasetTypes();
        renderFormList(container);
    } catch (e) {
        console.error('initDataEntry error:', e);
        container.innerHTML = `<p style="color:var(--text2);text-align:center;padding:40px">Помилка завантаження: ${e.message}</p>`;
    }
}

function renderFormList(container) {
    const role = currentProfile ? currentProfile.role : 'viewer';
    const isAdmin = role === 'admin';

    // Filter types by role
    const available = _datasetTypes.filter(dt =>
        dt.allowed_roles && dt.allowed_roles.includes(role)
    );

    // Build thematic groups HTML
    let groupsHTML = '';
    for (const group of THEME_GROUPS) {
        // Get system types for this group
        const groupTypes = group.types.map(name => {
            // Check dataset_types first
            const dt = available.find(t => t.name === name);
            if (dt) return { ...dt, _source: 'db' };
            // Check hardcoded summary cards
            const sc = SUMMARY_CARDS.find(c => c.name === name);
            if (sc) return { ...sc, _source: 'hardcoded' };
            return null;
        }).filter(Boolean);

        if (!groupTypes.length) continue;

        groupsHTML += `
            <div class="de-theme-group" data-group="${group.id}">
                <div class="de-theme-header">
                    <span class="de-theme-icon">${ICON_MAP[group.icon] || ''}</span>
                    <span class="de-theme-label">${group.label}</span>
                </div>
                <div class="de-cards-grid" data-group-grid="${group.id}"></div>
            </div>
        `;
    }

    // Custom types
    const customTypes = available.filter(dt => !dt.is_system);

    container.innerHTML = `
        <div class="de-list-header">
            <h3>Введення даних</h3>
            <p class="de-list-sub">Оберіть тип даних для введення або перегляду</p>
        </div>

        ${groupsHTML}

        ${customTypes.length ? `
            <div class="de-theme-group">
                <div class="de-theme-header">
                    <span class="de-theme-icon">${ICON_MAP['edit'] || ''}</span>
                    <span class="de-theme-label">Кастомні форми</span>
                </div>
                <div class="de-cards-grid" id="deCustomCards"></div>
            </div>
        ` : ''}

        ${!available.length && !SUMMARY_CARDS.length ? `
            <div class="de-empty">
                <p>Немає доступних форм для вашої ролі</p>
            </div>
        ` : ''}

        ${isAdmin ? `
            <div class="de-admin-section">
                <div class="de-theme-header" style="margin-top:24px">
                    <span class="de-theme-icon">${ICON_MAP['plus'] || ''}</span>
                    <span class="de-theme-label">Адміністрування</span>
                </div>
                <div class="de-cards-grid" id="deAdminCards">
                    <div class="de-card glass de-card-add" id="deAddType">
                        <div class="de-card-icon">${ICON_MAP['plus'] || '+'}</div>
                        <div class="de-card-info">
                            <div class="de-card-name">Створити новий тип</div>
                            <div class="de-card-desc">Додати нову форму введення</div>
                        </div>
                    </div>
                </div>
            </div>
        ` : ''}
    `;

    // Render cards for each thematic group
    for (const group of THEME_GROUPS) {
        const grid = container.querySelector(`[data-group-grid="${group.id}"]`);
        if (!grid) continue;

        const groupTypes = group.types.map(name => {
            const dt = available.find(t => t.name === name);
            if (dt) return { ...dt, _source: 'db' };
            const sc = SUMMARY_CARDS.find(c => c.name === name);
            if (sc) return { ...sc, _source: 'hardcoded' };
            return null;
        }).filter(Boolean);

        renderCards(grid, groupTypes, isAdmin);
    }

    // Render custom cards
    const custGrid = container.querySelector('#deCustomCards');
    if (custGrid) {
        renderCards(custGrid, customTypes.map(dt => ({ ...dt, _source: 'db' })), isAdmin);
    }

    // Admin: create new type
    const addBtn = container.querySelector('#deAddType');
    if (addBtn) {
        addBtn.addEventListener('click', () => openTypeEditor(null, container));
    }

    // Load record counts async
    loadCounts(available, container);
    loadSummaryCounts(container);
}

function renderCards(grid, types, allowEdit) {
    grid.innerHTML = types.map(dt => `
        <div class="de-card glass" data-type-id="${dt.id}" data-type-name="${dt.name}"${dt.is_upload_only ? ' data-upload-only="1"' : ''}${dt.is_entry_form ? ' data-entry-form="1"' : ''}>
            <div class="de-card-icon">${ICON_MAP[dt.icon] || ICON_MAP['table']}</div>
            <div class="de-card-info">
                <div class="de-card-name">${dt.display_name}</div>
                <div class="de-card-desc">${dt.description || ''}</div>
                <div class="de-card-count" data-count-type="${dt.id}">...</div>
            </div>
            ${allowEdit && dt._source === 'db' && !dt.is_system ? `<button class="de-card-edit" data-edit-id="${dt.id}" title="Редагувати схему">
                <svg viewBox="0 0 24 24" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>` : ''}
        </div>
    `).join('');

    // Wire click handlers
    grid.querySelectorAll('.de-card[data-type-id]').forEach(card => {
        card.addEventListener('click', e => {
            if (e.target.closest('.de-card-edit')) return;

            const name = card.dataset.typeName;

            // Upload-only card (summary_indicators) — trigger file input
            if (card.dataset.uploadOnly) {
                const sc = SUMMARY_CARDS.find(c => c.name === name);
                if (sc) {
                    const inp = document.createElement('input');
                    inp.type = 'file';
                    inp.accept = sc.accept || '.xlsx,.xls';
                    inp.onchange = async () => {
                        if (inp.files[0]) {
                            await handleFile(inp.files[0], sc.expected || null);
                        }
                    };
                    inp.click();
                }
                return;
            }

            // Weekly entry form
            if (card.dataset.entryForm) {
                const cont = $('dataEntryContent');
                renderWeeklyEntryForm(cont, () => renderFormList(cont));
                return;
            }

            // Regular form
            const id = card.dataset.typeId;
            const dt = _datasetTypes.find(t => t.id === id);
            if (dt) openForm(dt);
        });
    });

    // Wire edit buttons
    grid.querySelectorAll('.de-card-edit').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const id = btn.dataset.editId;
            const dt = _datasetTypes.find(t => t.id === id);
            if (dt) openTypeEditor(dt, document.querySelector('#dataEntryContent'));
        });
    });
}

async function loadCounts(types, container) {
    for (const dt of types) {
        try {
            const count = await getRecordCountForType(dt);
            const el = container.querySelector(`[data-count-type="${dt.id}"]`);
            if (el) el.textContent = `${count} записів`;
        } catch (e) {
            const el = container.querySelector(`[data-count-type="${dt.id}"]`);
            if (el) el.textContent = '—';
        }
    }
}

async function loadSummaryCounts(container) {
    // Load counts for hardcoded summary cards
    try {
        const indCount = await getSummaryIndicatorCount();
        const el = container.querySelector('[data-count-type="summary_indicators"]');
        if (el) el.textContent = `${indCount} записів`;
    } catch { /* ignore */ }
    try {
        const wkCount = await getSummaryWeeklyCount();
        const el = container.querySelector('[data-count-type="summary_weekly"]');
        if (el) el.textContent = `${wkCount} записів`;
    } catch { /* ignore */ }
}

function openForm(dsType) {
    const container = $('dataEntryContent');
    setOnDataChanged((action) => {
        if (action === 'back') {
            renderFormList(container);
            if (dsType.is_system && _reloadCallbacks.length) {
                _reloadCallbacks.forEach(fn => fn(dsType.target_table));
            }
        } else if (action === 'deleted') {
            if (dsType.is_system && _reloadCallbacks.length) {
                _reloadCallbacks.forEach(fn => fn(dsType.target_table));
            }
        }
    });
    renderForm(dsType, container);
}

function openTypeEditor(dsType, container) {
    setOnTypeEditorDone(async (action) => {
        if (action === 'saved' || action === 'back' || action === 'deleted') {
            try {
                _datasetTypes = await loadDatasetTypes();
            } catch (e) { /* ignore */ }
            renderFormList(container);
        }
    });
    renderTypeEditor(dsType, container);
}
