// ===== Dataset Type Editor (Admin Only) =====
// UI for creating/editing dataset_types — the form constructor

import { $, toast } from '../utils.js';
import { saveDatasetType, deleteDatasetType } from './db-dynamic.js';
import { ICON_MAP } from './form-utils.js';

let _onDone = null;
let _editingType = null;
let _fields = [];

export function setOnTypeEditorDone(fn) { _onDone = fn; }

const FIELD_TYPES = [
    { value: 'text', label: 'Текст' },
    { value: 'number', label: 'Число' },
    { value: 'date', label: 'Дата' },
    { value: 'select', label: 'Список' },
    { value: 'textarea', label: 'Багаторядковий' },
    { value: 'checkbox', label: 'Так/Ні' },
    { value: 'computed', label: 'Обчислюване' }
];

const ICON_OPTIONS = ['table', 'bar-chart', 'dollar-sign', 'package', 'target', 'shield', 'users', 'clock', 'credit-card', 'edit'];

const ALL_ROLES = ['admin', 'director', 'analyst', 'editor', 'accountant', 'hr', 'forester', 'operator'];

export function renderTypeEditor(dsType, container) {
    _editingType = dsType;
    _fields = dsType && dsType.schema ? JSON.parse(JSON.stringify(dsType.schema)) : [];

    const isNew = !dsType;
    const isSystem = dsType && dsType.is_system;

    container.innerHTML = `
        <div class="de-form-header">
            <button class="btn btn-sm de-back-btn" id="teBackBtn">
                <svg viewBox="0 0 24 24" width="16" height="16"><polyline points="15 18 9 12 15 6"/></svg>
                Назад
            </button>
            <div class="de-form-title">
                <h3>${isNew ? 'Новий тип даних' : 'Редагувати: ' + dsType.display_name}</h3>
                ${isSystem ? '<small style="color:var(--amber)">Системний тип — обмежене редагування</small>' : ''}
            </div>
        </div>

        <div class="te-form glass">
            <div class="te-row">
                <div class="de-field" style="flex:1">
                    <label>Внутрішня назва (латиницею)</label>
                    <input type="text" class="de-input" id="teName" value="${esc(dsType?.name || '')}" ${isSystem ? 'disabled' : ''} placeholder="my_dataset">
                </div>
                <div class="de-field" style="flex:2">
                    <label>Відображувана назва</label>
                    <input type="text" class="de-input" id="teDisplayName" value="${esc(dsType?.display_name || '')}" placeholder="Мій набір даних">
                </div>
            </div>
            <div class="te-row">
                <div class="de-field" style="flex:2">
                    <label>Опис</label>
                    <input type="text" class="de-input" id="teDesc" value="${esc(dsType?.description || '')}" placeholder="Короткий опис">
                </div>
                <div class="de-field" style="flex:1">
                    <label>Іконка</label>
                    <select class="de-input" id="teIcon">
                        ${ICON_OPTIONS.map(i => `<option value="${i}"${(dsType?.icon || 'table') === i ? ' selected' : ''}>${i}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="de-field">
                <label>Доступ для ролей</label>
                <div class="te-roles" id="teRoles">
                    ${ALL_ROLES.map(r => `
                        <label class="te-role-check">
                            <input type="checkbox" value="${r}" ${(dsType?.allowed_roles || ['admin', 'editor']).includes(r) ? 'checked' : ''}>
                            <span>${r}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
        </div>

        <div class="te-fields-section">
            <div class="te-fields-header">
                <h4>Поля</h4>
                <button class="btn btn-sm btn-primary" id="teAddField">
                    <svg viewBox="0 0 24 24" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Додати поле
                </button>
            </div>
            <div id="teFieldsList" class="te-fields-list"></div>
        </div>

        <div class="te-actions">
            <button class="btn btn-primary" id="teSave">${isNew ? 'Створити' : 'Зберегти'}</button>
            ${!isNew && !isSystem ? `<button class="btn btn-danger btn-sm" id="teDelete">Видалити тип</button>` : ''}
        </div>
    `;

    renderFieldsList(container);

    // Wire events
    container.querySelector('#teBackBtn').addEventListener('click', () => { if (_onDone) _onDone('back'); });
    container.querySelector('#teAddField').addEventListener('click', () => {
        _fields.push({ name: '', label: '', type: 'text', required: false });
        renderFieldsList(container);
    });
    container.querySelector('#teSave').addEventListener('click', () => handleSave(container));

    const delBtn = container.querySelector('#teDelete');
    if (delBtn) delBtn.addEventListener('click', () => handleDelete(container));
}

function renderFieldsList(container) {
    const list = container.querySelector('#teFieldsList');
    if (!_fields.length) {
        list.innerHTML = '<p class="de-empty-msg">Додайте поля для форми</p>';
        return;
    }

    list.innerHTML = _fields.map((f, i) => `
        <div class="te-field-row glass" data-idx="${i}">
            <div class="te-field-drag" title="Перетягніть">⋮⋮</div>
            <div class="te-field-inputs">
                <input type="text" class="de-input te-fname" data-idx="${i}" data-prop="name" value="${esc(f.name)}" placeholder="field_name" style="width:120px">
                <input type="text" class="de-input te-flabel" data-idx="${i}" data-prop="label" value="${esc(f.label)}" placeholder="Назва поля" style="flex:1">
                <select class="de-input te-ftype" data-idx="${i}" data-prop="type" style="width:120px">
                    ${FIELD_TYPES.map(t => `<option value="${t.value}"${f.type === t.value ? ' selected' : ''}>${t.label}</option>`).join('')}
                </select>
                <label class="te-freq" title="Обов'язкове">
                    <input type="checkbox" data-idx="${i}" data-prop="required" ${f.required ? 'checked' : ''}>
                    <span>Обов.</span>
                </label>
            </div>
            ${f.type === 'select' ? `
                <div class="te-field-options">
                    <label style="font-size:11px;color:var(--text3)">Опції (через кому):</label>
                    <input type="text" class="de-input te-foptions" data-idx="${i}" value="${esc((f.options || []).join(', '))}" placeholder="опція1, опція2, опція3">
                </div>
            ` : ''}
            ${f.type === 'computed' ? `
                <div class="te-field-options">
                    <label style="font-size:11px;color:var(--text3)">Формула:</label>
                    <input type="text" class="de-input te-fformula" data-idx="${i}" value="${esc(f.formula || '')}" placeholder="field_a * field_b">
                </div>
            ` : ''}
            <button class="te-field-delete" data-idx="${i}" title="Видалити">&times;</button>
        </div>
    `).join('');

    // Wire field input changes
    list.querySelectorAll('.te-fname, .te-flabel').forEach(el => {
        el.addEventListener('change', e => {
            const idx = parseInt(e.target.dataset.idx);
            _fields[idx][e.target.dataset.prop] = e.target.value.trim();
        });
    });

    list.querySelectorAll('.te-ftype').forEach(el => {
        el.addEventListener('change', e => {
            const idx = parseInt(e.target.dataset.idx);
            _fields[idx].type = e.target.value;
            renderFieldsList(container); // Re-render to show/hide options
        });
    });

    list.querySelectorAll('.te-freq input').forEach(el => {
        el.addEventListener('change', e => {
            const idx = parseInt(e.target.dataset.idx);
            _fields[idx].required = e.target.checked;
        });
    });

    list.querySelectorAll('.te-foptions').forEach(el => {
        el.addEventListener('change', e => {
            const idx = parseInt(e.target.dataset.idx);
            _fields[idx].options = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
        });
    });

    list.querySelectorAll('.te-fformula').forEach(el => {
        el.addEventListener('change', e => {
            const idx = parseInt(e.target.dataset.idx);
            _fields[idx].formula = e.target.value.trim();
        });
    });

    // Wire delete
    list.querySelectorAll('.te-field-delete').forEach(btn => {
        btn.addEventListener('click', e => {
            const idx = parseInt(e.target.dataset.idx);
            _fields.splice(idx, 1);
            renderFieldsList(container);
        });
    });
}

async function handleSave(container) {
    const name = container.querySelector('#teName').value.trim();
    const displayName = container.querySelector('#teDisplayName').value.trim();
    const desc = container.querySelector('#teDesc').value.trim();
    const icon = container.querySelector('#teIcon').value;

    if (!name || !displayName) {
        toast('Назва обов\'язкова', true);
        return;
    }
    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
        toast('Внутрішня назва: тільки латиниця, цифри, _ (починати з літери)', true);
        return;
    }
    if (!_fields.length) {
        toast('Додайте хоча б одне поле', true);
        return;
    }
    // Validate fields
    for (const f of _fields) {
        if (!f.name || !f.label) {
            toast('Заповніть назву та підпис для всіх полів', true);
            return;
        }
    }

    const roles = [];
    container.querySelectorAll('#teRoles input:checked').forEach(cb => roles.push(cb.value));
    if (!roles.length) roles.push('admin');

    const typeData = {
        name, display_name: displayName, description: desc,
        icon, allowed_roles: roles, schema: _fields
    };

    if (_editingType && _editingType.id) {
        typeData.id = _editingType.id;
    }

    try {
        await saveDatasetType(typeData);
        toast(_editingType ? 'Тип оновлено' : 'Тип створено');
        if (_onDone) _onDone('saved');
    } catch (e) {
        toast('Помилка: ' + e.message, true);
    }
}

async function handleDelete(container) {
    if (!_editingType || !_editingType.id) return;
    if (!confirm(`Видалити тип "${_editingType.display_name}" та всі його дані?`)) return;

    try {
        await deleteDatasetType(_editingType.id);
        toast('Тип видалено');
        if (_onDone) _onDone('deleted');
    } catch (e) {
        toast('Помилка: ' + e.message, true);
    }
}

function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
