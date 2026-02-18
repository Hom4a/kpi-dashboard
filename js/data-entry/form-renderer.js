// ===== Dynamic Form Renderer =====
// Renders editable forms and data tables based on dataset_type.schema

import { $, toast, fmt } from '../utils.js';
import { validateRecord, computeFields, getDefaultRecord, formatFieldValue, saveDraft, loadDraft, clearDraft } from './form-utils.js';
import { saveSingleRecord, updateSingleRecord, deleteSingleRecord, loadRecordsForType } from './db-dynamic.js';

let _currentType = null;
let _editingRows = [];   // rows being entered (new records)
let _existingRecords = [];
let _onDataChanged = null;

export function setOnDataChanged(fn) { _onDataChanged = fn; }

export function renderForm(dsType, container) {
    _currentType = dsType;
    _editingRows = [];
    _existingRecords = [];

    const schema = dsType.schema || [];

    container.innerHTML = `
        <div class="de-form-header">
            <button class="btn btn-sm de-back-btn" id="deBackBtn">
                <svg viewBox="0 0 24 24" width="16" height="16"><polyline points="15 18 9 12 15 6"/></svg>
                Назад
            </button>
            <div class="de-form-title">
                <h3>${dsType.display_name}</h3>
                <small>${dsType.description || ''}</small>
            </div>
        </div>

        <div class="de-toolbar">
            <button class="btn btn-sm btn-primary" id="deAddRow">
                <svg viewBox="0 0 24 24" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Додати запис
            </button>
            <button class="btn btn-sm" id="deSaveAll" style="display:none">Зберегти все</button>
            <button class="btn btn-sm" id="deLoadDraft" style="display:none">Відновити чернетку</button>
            <span class="de-record-count" id="deRecordCount"></span>
        </div>

        <div id="deNewRecords" class="de-new-records"></div>

        <div class="de-existing-section">
            <h4 class="de-section-label">Існуючі записи <span id="deExistingCount"></span></h4>
            <div id="deExistingTable" class="de-existing-table"></div>
        </div>
    `;

    // Wire events
    container.querySelector('#deBackBtn').addEventListener('click', () => {
        if (_editingRows.length > 0) {
            saveDraft(dsType.id || dsType.name, _editingRows);
            toast('Чернетку збережено');
        }
        if (_onDataChanged) _onDataChanged('back');
    });

    container.querySelector('#deAddRow').addEventListener('click', () => addNewRow(schema, container));
    container.querySelector('#deSaveAll').addEventListener('click', () => saveAllRows(dsType, schema, container));

    // Check for draft
    const draft = loadDraft(dsType.id || dsType.name);
    if (draft && draft.records && draft.records.length > 0) {
        container.querySelector('#deLoadDraft').style.display = '';
        container.querySelector('#deLoadDraft').addEventListener('click', () => {
            _editingRows = draft.records;
            renderNewRows(schema, container);
            container.querySelector('#deLoadDraft').style.display = 'none';
            clearDraft(dsType.id || dsType.name);
            toast(`Відновлено ${_editingRows.length} записів з чернетки`);
        });
    }

    // Load existing records
    loadExisting(dsType, schema, container);
}

function addNewRow(schema, container) {
    const record = getDefaultRecord(schema);
    _editingRows.push(record);
    renderNewRows(schema, container);
    container.querySelector('#deSaveAll').style.display = '';
}

function renderNewRows(schema, container) {
    const wrap = container.querySelector('#deNewRecords');
    if (!_editingRows.length) {
        wrap.innerHTML = '';
        container.querySelector('#deSaveAll').style.display = 'none';
        return;
    }

    wrap.innerHTML = _editingRows.map((row, idx) => `
        <div class="de-row-card glass" data-idx="${idx}">
            <div class="de-row-header">
                <span class="de-row-num">#${idx + 1}</span>
                <button class="de-row-delete" data-idx="${idx}" title="Видалити">&times;</button>
            </div>
            <div class="de-fields">
                ${schema.filter(f => f.type !== 'computed').map(f => renderFieldInput(f, row, idx)).join('')}
                ${schema.filter(f => f.type === 'computed').map(f => `
                    <div class="de-field">
                        <label>${f.label}</label>
                        <input type="text" disabled value="${row[f.name] || ''}" class="de-input computed">
                    </div>
                `).join('')}
            </div>
            <div class="de-row-actions">
                <button class="btn btn-sm btn-primary de-save-single" data-idx="${idx}">Зберегти</button>
            </div>
        </div>
    `).join('');

    // Wire input events
    wrap.querySelectorAll('.de-input:not([disabled])').forEach(input => {
        input.addEventListener('change', e => {
            const idx = parseInt(e.target.closest('.de-row-card').dataset.idx);
            const name = e.target.dataset.field;
            let val = e.target.value;
            if (e.target.type === 'number') val = val === '' ? '' : Number(val);
            if (e.target.type === 'checkbox') val = e.target.checked;
            _editingRows[idx][name] = val;
            // Recompute
            _editingRows[idx] = computeFields(schema, _editingRows[idx]);
            // Update computed field displays
            const card = e.target.closest('.de-row-card');
            schema.filter(f => f.type === 'computed').forEach(f => {
                const el = card.querySelector(`input[data-field="${f.name}"]`);
                if (el) el.value = _editingRows[idx][f.name] || '';
            });
        });
    });

    // Wire delete buttons
    wrap.querySelectorAll('.de-row-delete').forEach(btn => {
        btn.addEventListener('click', e => {
            const idx = parseInt(e.target.dataset.idx);
            _editingRows.splice(idx, 1);
            renderNewRows(schema, container);
        });
    });

    // Wire save-single buttons
    wrap.querySelectorAll('.de-save-single').forEach(btn => {
        btn.addEventListener('click', async e => {
            const idx = parseInt(e.target.dataset.idx);
            await saveSingleRow(_currentType, schema, idx, container);
        });
    });
}

function renderFieldInput(field, record, rowIdx) {
    const val = record[field.name] !== undefined ? record[field.name] : '';
    const req = field.required ? ' required' : '';

    let input = '';
    switch (field.type) {
        case 'text':
            input = `<input type="text" class="de-input" data-field="${field.name}" value="${escHtml(val)}"${req}>`;
            break;
        case 'number':
            input = `<input type="number" class="de-input" data-field="${field.name}" value="${val}" step="any"${req}>`;
            break;
        case 'date':
            input = `<input type="date" class="de-input" data-field="${field.name}" value="${val}"${req}>`;
            break;
        case 'select':
            input = `<select class="de-input" data-field="${field.name}"${req}>
                <option value="">—</option>
                ${(field.options || []).map(o => `<option value="${escHtml(o)}"${val === o ? ' selected' : ''}>${escHtml(o)}</option>`).join('')}
            </select>`;
            break;
        case 'textarea':
            input = `<textarea class="de-input" data-field="${field.name}" rows="2"${req}>${escHtml(val)}</textarea>`;
            break;
        case 'checkbox':
            input = `<input type="checkbox" class="de-input de-checkbox" data-field="${field.name}"${val ? ' checked' : ''}>`;
            break;
        default:
            input = `<input type="text" class="de-input" data-field="${field.name}" value="${escHtml(val)}"${req}>`;
    }

    return `<div class="de-field${field.required ? ' de-required' : ''}">
        <label>${field.label}${field.required ? ' *' : ''}</label>
        ${input}
    </div>`;
}

async function saveSingleRow(dsType, schema, idx, container) {
    const row = _editingRows[idx];
    const errors = validateRecord(schema, row);
    if (errors.length) {
        toast(errors[0].message, true);
        return;
    }

    // Build clean record (only schema fields)
    const record = {};
    for (const f of schema) {
        if (row[f.name] !== undefined && row[f.name] !== '') {
            record[f.name] = f.type === 'number' ? Number(row[f.name]) : row[f.name];
        }
    }

    try {
        await saveSingleRecord(dsType, record);
        _editingRows.splice(idx, 1);
        renderNewRows(schema, container);
        await loadExisting(dsType, schema, container);
        toast('Запис збережено');
    } catch (e) {
        toast('Помилка: ' + e.message, true);
    }
}

async function saveAllRows(dsType, schema, container) {
    let saved = 0, failed = 0;
    // Save from last to first so indices don't shift
    for (let i = _editingRows.length - 1; i >= 0; i--) {
        const row = _editingRows[i];
        const errors = validateRecord(schema, row);
        if (errors.length) { failed++; continue; }

        const record = {};
        for (const f of schema) {
            if (row[f.name] !== undefined && row[f.name] !== '') {
                record[f.name] = f.type === 'number' ? Number(row[f.name]) : row[f.name];
            }
        }

        try {
            await saveSingleRecord(dsType, record);
            _editingRows.splice(i, 1);
            saved++;
        } catch (e) { failed++; }
    }

    renderNewRows(schema, container);
    await loadExisting(dsType, schema, container);
    clearDraft(dsType.id || dsType.name);

    if (failed > 0) {
        toast(`Збережено: ${saved}, помилок: ${failed}`, true);
    } else {
        toast(`Збережено ${saved} записів`);
    }
}

async function loadExisting(dsType, schema, container) {
    try {
        _existingRecords = await loadRecordsForType(dsType);
        const countEl = container.querySelector('#deExistingCount');
        if (countEl) countEl.textContent = `(${_existingRecords.length})`;
        const countInfoEl = container.querySelector('#deRecordCount');
        if (countInfoEl) countInfoEl.textContent = `Всього: ${_existingRecords.length} записів`;
        renderExistingTable(dsType, schema, container);
    } catch (e) {
        console.error('loadExisting error:', e);
    }
}

function renderExistingTable(dsType, schema, container) {
    const tableEl = container.querySelector('#deExistingTable');
    if (!_existingRecords.length) {
        tableEl.innerHTML = '<p class="de-empty-msg">Ще немає записів</p>';
        return;
    }

    // Show at most 8 fields in table columns
    const visibleFields = schema.slice(0, 8);

    // For system types, data is flat; for custom, it was flattened in loadRecordsForType
    const rows = _existingRecords.slice(0, 100); // Show first 100

    tableEl.innerHTML = `
        <div class="tbl-wrap">
            <table class="tbl de-tbl">
                <thead><tr>
                    ${visibleFields.map(f => `<th>${f.label}</th>`).join('')}
                    <th style="width:60px"></th>
                </tr></thead>
                <tbody>
                    ${rows.map((r, i) => `<tr data-idx="${i}">
                        ${visibleFields.map(f => `<td>${formatFieldValue(f, r[f.name])}</td>`).join('')}
                        <td><button class="de-delete-existing" data-idx="${i}" title="Видалити">
                            <svg viewBox="0 0 24 24" width="14" height="14"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                        </button></td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>
        ${_existingRecords.length > 100 ? `<p class="de-more-msg">Показано 100 з ${_existingRecords.length} записів</p>` : ''}
    `;

    // Wire delete
    tableEl.querySelectorAll('.de-delete-existing').forEach(btn => {
        btn.addEventListener('click', async e => {
            const idx = parseInt(e.target.closest('button').dataset.idx);
            const rec = _existingRecords[idx];
            if (!confirm('Видалити цей запис?')) return;

            const id = rec.id || rec._id;
            try {
                await deleteSingleRecord(dsType, id);
                await loadExisting(dsType, schema, container);
                toast('Запис видалено');
                if (_onDataChanged) _onDataChanged('deleted');
            } catch (err) {
                toast('Помилка: ' + err.message, true);
            }
        });
    });
}

function escHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
