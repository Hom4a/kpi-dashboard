// ===== GIS Admin: Manage Regional Offices =====
import { $, toast } from '../utils.js';
import { loadRegionalOffices, saveRegionalOffice, deleteRegionalOffice } from './db-gis.js';
import { setRegionalOffices } from './state-gis.js';
import { renderGisMap, resetGisMap } from './render-gis.js';

const ALL_OBLASTS = [
    'Вінницька', 'Волинська', 'Дніпропетровська', 'Донецька', 'Житомирська',
    'Закарпатська', 'Запорізька', 'Івано-Франківська', 'Київська', 'Кіровоградська',
    'Крим', 'Луганська', 'Львівська', 'Миколаївська', 'Одеська', 'Полтавська',
    'Рівненська', 'Сумська', 'Тернопільська', 'Харківська', 'Херсонська',
    'Хмельницька', 'Черкаська', 'Чернівецька', 'Чернігівська'
];

let _editState = [];
let _pendingDeletes = [];

export async function openGisAdmin() {
    $('gisAdminModal').classList.add('on');
    const list = $('gisAdminList');
    list.innerHTML = '<p style="color:var(--text3);font-size:12px;padding:12px">Завантаження...</p>';
    try {
        const offices = await loadRegionalOffices();
        _editState = offices.map(o => ({ ...o, oblasts: [...(o.oblasts || [])], branch_aliases: [...(o.branch_aliases || [])] }));
        _pendingDeletes = [];
        renderAdminCards();
    } catch (e) { toast('Помилка: ' + e.message, true); }
}

function renderAdminCards() {
    const list = $('gisAdminList');
    const assignedOblasts = new Map();
    _editState.forEach((o, idx) => (o.oblasts || []).forEach(ob => assignedOblasts.set(ob, idx)));

    list.innerHTML = _editState.map((o, idx) => `
        <div class="glass" style="padding:16px" data-office-idx="${idx}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                <input class="de-input ga-name" value="${esc(o.name)}" placeholder="Назва ЛО"
                    style="font-size:14px;font-weight:600;flex:1;max-width:300px">
                <button class="btn btn-sm btn-danger ga-remove-btn" data-idx="${idx}">Видалити</button>
            </div>
            <div style="margin-bottom:10px">
                <label style="font-size:10px;color:var(--text3);display:block;margin-bottom:4px">Області</label>
                <div class="ga-oblasts" style="display:flex;gap:6px;flex-wrap:wrap">
                    ${ALL_OBLASTS.map(ob => {
                        const checked = (o.oblasts || []).includes(ob);
                        const otherIdx = assignedOblasts.get(ob);
                        const other = !checked && otherIdx !== undefined && otherIdx !== idx;
                        return `<label style="font-size:11px;color:${other ? 'var(--text3)' : 'var(--text2)'};display:flex;align-items:center;gap:3px;cursor:pointer${other ? ';opacity:0.5' : ''}">
                            <input type="checkbox" data-oblast="${ob}" ${checked ? 'checked' : ''}> ${ob}
                        </label>`;
                    }).join('')}
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 2fr;gap:10px">
                <div>
                    <label style="font-size:10px;color:var(--text3);display:block;margin-bottom:2px">Широта (lat)</label>
                    <input type="number" step="0.1" class="de-input ga-lat" value="${o.center_lat || ''}" placeholder="49.0" style="width:100%">
                </div>
                <div>
                    <label style="font-size:10px;color:var(--text3);display:block;margin-bottom:2px">Довгота (lng)</label>
                    <input type="number" step="0.1" class="de-input ga-lng" value="${o.center_lng || ''}" placeholder="31.5" style="width:100%">
                </div>
                <div>
                    <label style="font-size:10px;color:var(--text3);display:block;margin-bottom:2px">Аліаси філій (через кому)</label>
                    <input class="de-input ga-aliases" value="${(o.branch_aliases || []).join(', ')}" placeholder="Карпатське ОУЛ" style="width:100%">
                </div>
            </div>
        </div>
    `).join('');

    // Bind remove buttons
    list.querySelectorAll('.ga-remove-btn').forEach(btn => {
        btn.addEventListener('click', () => removeOffice(parseInt(btn.dataset.idx)));
    });
}

export function addNewOffice() {
    _editState.push({
        id: null,
        name: '',
        oblasts: [],
        center_lat: null,
        center_lng: null,
        branch_aliases: [],
        sort_order: _editState.length + 1,
        is_active: true
    });
    renderAdminCards();
    // Scroll to new card
    const list = $('gisAdminList');
    if (list) list.lastElementChild?.scrollIntoView({ behavior: 'smooth' });
}

function removeOffice(idx) {
    const name = _editState[idx].name || 'Нове ЛО';
    if (!confirm(`Видалити "${name}"?`)) return;
    const removed = _editState.splice(idx, 1)[0];
    if (removed.id) _pendingDeletes.push(removed.id);
    renderAdminCards();
}

export async function saveGisAdmin() {
    // Collect from DOM
    const cards = document.querySelectorAll('#gisAdminList [data-office-idx]');
    cards.forEach((card, idx) => {
        if (idx >= _editState.length) return;
        _editState[idx].name = card.querySelector('.ga-name').value.trim();
        _editState[idx].oblasts = [...card.querySelectorAll('.ga-oblasts input:checked')].map(c => c.dataset.oblast);
        _editState[idx].center_lat = parseFloat(card.querySelector('.ga-lat').value) || null;
        _editState[idx].center_lng = parseFloat(card.querySelector('.ga-lng').value) || null;
        _editState[idx].branch_aliases = card.querySelector('.ga-aliases').value
            .split(',').map(s => s.trim()).filter(Boolean);
        _editState[idx].sort_order = idx + 1;
    });

    // Validate
    for (const o of _editState) {
        if (!o.name) { toast('Назва ЛО не може бути порожньою', true); return; }
    }

    const btn = document.querySelector('#gisAdminModal .btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Збереження...'; }

    try {
        for (const id of _pendingDeletes) {
            await deleteRegionalOffice(id);
        }
        _pendingDeletes = [];

        for (const o of _editState) {
            await saveRegionalOffice(o);
        }

        const fresh = await loadRegionalOffices();
        setRegionalOffices(fresh);
        closeGisAdmin();
        resetGisMap();
        renderGisMap();
        toast(`Збережено ${fresh.length} управлінь`);
    } catch (e) {
        toast('Помилка: ' + e.message, true);
    }

    if (btn) { btn.disabled = false; btn.textContent = 'Зберегти все'; }
}

export function closeGisAdmin() {
    $('gisAdminModal').classList.remove('on');
    _pendingDeletes = [];
}

function esc(text) {
    if (!text) return '';
    const d = document.createElement('div');
    d.textContent = String(text);
    return d.innerHTML;
}
