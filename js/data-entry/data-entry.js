// ===== Data Entry Main Module =====
// Shows list of available forms based on user role, routes to form renderer or type editor

import { $, toast, showLoader } from '../utils.js';
import { currentProfile } from '../state.js';
import { loadDatasetTypes } from './db-dynamic.js';
import { renderForm, setOnDataChanged } from './form-renderer.js';
import { renderTypeEditor, setOnTypeEditorDone } from './type-editor.js';
import { ICON_MAP } from './form-utils.js';
import { getRecordCountForType } from './db-dynamic.js';

let _datasetTypes = [];
let _reloadCallbacks = [];

export function setDataEntryReloadCallback(fn) { _reloadCallbacks.push(fn); }

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

    // Separate system and custom types
    const systemTypes = available.filter(dt => dt.is_system);
    const customTypes = available.filter(dt => !dt.is_system);

    container.innerHTML = `
        <div class="de-list-header">
            <h3>Введення даних</h3>
            <p class="de-list-sub">Оберіть тип даних для введення або перегляду</p>
        </div>

        ${systemTypes.length ? `
            <div class="de-section-label">Системні форми</div>
            <div class="de-cards-grid" id="deSystemCards"></div>
        ` : ''}

        ${customTypes.length ? `
            <div class="de-section-label" style="margin-top:24px">Кастомні форми</div>
            <div class="de-cards-grid" id="deCustomCards"></div>
        ` : ''}

        ${!available.length ? `
            <div class="de-empty">
                <p>Немає доступних форм для вашої ролі</p>
            </div>
        ` : ''}

        ${isAdmin ? `
            <div class="de-admin-section">
                <div class="de-section-label" style="margin-top:24px">Адміністрування</div>
                <div class="de-cards-grid" id="deAdminCards">
                    <div class="de-card glass de-card-add" id="deAddType">
                        <div class="de-card-icon">${ICON_MAP['plus'] || '+'}</div>
                        <div class="de-card-info">
                            <div class="de-card-name">Створити новий тип</div>
                            <div class="de-card-desc">Додати нову форму введення</div>
                        </div>
                    </div>
                </div>
                ${_datasetTypes.filter(dt => !dt.is_system).length ? `
                    <div class="de-section-label" style="margin-top:16px;font-size:12px;color:var(--text3)">Натисніть на кастомну форму, щоб редагувати її схему</div>
                ` : ''}
            </div>
        ` : ''}
    `;

    // Render system cards
    const sysGrid = container.querySelector('#deSystemCards');
    if (sysGrid) {
        renderCards(sysGrid, systemTypes, false);
    }

    // Render custom cards
    const custGrid = container.querySelector('#deCustomCards');
    if (custGrid) {
        renderCards(custGrid, customTypes, isAdmin);
    }

    // Admin: create new type
    const addBtn = container.querySelector('#deAddType');
    if (addBtn) {
        addBtn.addEventListener('click', () => openTypeEditor(null, container));
    }

    // Load record counts async
    loadCounts(available, container);
}

function renderCards(grid, types, allowEdit) {
    grid.innerHTML = types.map(dt => `
        <div class="de-card glass" data-type-id="${dt.id}" data-type-name="${dt.name}">
            <div class="de-card-icon">${ICON_MAP[dt.icon] || ICON_MAP['table']}</div>
            <div class="de-card-info">
                <div class="de-card-name">${dt.display_name}</div>
                <div class="de-card-desc">${dt.description || ''}</div>
                <div class="de-card-count" data-count-type="${dt.id}">...</div>
            </div>
            ${allowEdit ? `<button class="de-card-edit" data-edit-id="${dt.id}" title="Редагувати схему">
                <svg viewBox="0 0 24 24" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>` : ''}
        </div>
    `).join('');

    // Wire click to open form
    grid.querySelectorAll('.de-card[data-type-id]').forEach(card => {
        card.addEventListener('click', e => {
            // Don't open form if clicking edit button
            if (e.target.closest('.de-card-edit')) return;
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

function openForm(dsType) {
    const container = $('dataEntryContent');
    setOnDataChanged((action) => {
        if (action === 'back') {
            renderFormList(container);
            // Trigger data reload for system types
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
