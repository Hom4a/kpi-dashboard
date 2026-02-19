// ===== Modals: Drill-down, Targets, Fullscreen, Viewer Access, Data Management =====
import { $, fmt, toast, themeColor } from './utils.js';
import { allData, charts, targets, MO, setTargets } from './state.js';
import { kill, freshCanvas, getTargetAnnotation } from './charts-common.js';
import { sb, sbSignup } from './config.js';
import { getRecordCount, getUploadHistory } from './db-kpi.js';
import { getPricesCount, getInventoryCount } from './forest/db-forest.js';
import { getPlanFactCount, getZsuCount } from './harvesting/db-harvesting.js';
import { getMarketPricesCount } from './market/db-market.js';

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
    { id: 'market', label: 'Ринок' },
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

function generatePassword() {
    const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
    const lower = 'abcdefghjkmnpqrstuvwxyz';
    const digits = '23456789';
    const special = '!@#$%&*';
    const all = upper + lower + digits + special;
    let pwd = [
        upper[Math.floor(Math.random() * upper.length)],
        lower[Math.floor(Math.random() * lower.length)],
        digits[Math.floor(Math.random() * digits.length)],
        special[Math.floor(Math.random() * special.length)]
    ];
    for (let i = 4; i < 12; i++) pwd.push(all[Math.floor(Math.random() * all.length)]);
    for (let i = pwd.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pwd[i], pwd[j]] = [pwd[j], pwd[i]];
    }
    return pwd.join('');
}

function mapSignUpError(msg) {
    if (msg.includes('already registered') || msg.includes('already been registered')) return 'Цей email вже зареєстровано';
    if (msg.includes('password') && (msg.includes('short') || msg.includes('weak') || msg.includes('least'))) return 'Пароль занадто короткий або слабкий (мін. 6 символів)';
    if (msg.includes('valid email') || msg.includes('invalid')) return 'Невірний формат email';
    if (msg.includes('rate') || msg.includes('limit')) return 'Забагато запитів, зачекайте хвилину';
    return 'Помилка реєстрації: ' + msg;
}

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

        const addUserHTML = `<div style="margin-bottom:16px">
            <button class="btn btn-sm" onclick="toggleAddUserForm()" style="margin-bottom:12px">+ Додати користувача</button>
            <div id="addUserForm" class="glass" style="display:none;padding:16px;margin-bottom:12px;border-left:3px solid var(--primary)">
                <div style="font-size:13px;font-weight:600;color:var(--primary);margin-bottom:12px">Новий користувач</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                    <div><label style="font-size:10px;color:var(--text3);display:block;margin-bottom:2px">Email *</label>
                        <input type="email" class="de-input" id="newUserEmail" placeholder="user@example.com" style="width:100%"></div>
                    <div><label style="font-size:10px;color:var(--text3);display:block;margin-bottom:2px">Повне ім'я *</label>
                        <input type="text" class="de-input" id="newUserName" placeholder="Прізвище Ім'я" style="width:100%"></div>
                    <div><label style="font-size:10px;color:var(--text3);display:block;margin-bottom:2px">Пароль *</label>
                        <div style="display:flex;gap:6px"><input type="text" class="de-input" id="newUserPass" placeholder="Мін. 6 символів" style="flex:1">
                        <button class="btn btn-sm" onclick="generateNewUserPassword()" title="Згенерувати" style="padding:4px 8px;white-space:nowrap">&#127922;</button></div></div>
                    <div><label style="font-size:10px;color:var(--text3);display:block;margin-bottom:2px">Роль</label>
                        <select class="de-input" id="newUserRole" style="width:100%">
                            ${ALL_ROLES.map(r => `<option value="${r}"${r === 'viewer' ? ' selected' : ''}>${ROLE_LABELS[r]}</option>`).join('')}
                        </select></div>
                    <div><label style="font-size:10px;color:var(--text3);display:block;margin-bottom:2px">Рівень</label>
                        <select class="de-input" id="newUserOrgLevel" style="width:100%">
                            ${ORG_LEVELS.map(ol => `<option value="${ol.value}">${ol.label}</option>`).join('')}
                        </select></div>
                    <div><label style="font-size:10px;color:var(--text3);display:block;margin-bottom:2px">Орг. одиниця</label>
                        <select class="de-input" id="newUserOrgUnit" style="width:100%">
                            <option value="">—</option>
                            ${orgUnits.map(ou => `<option value="${ou.name}">${ou.name}</option>`).join('')}
                        </select></div>
                </div>
                <div id="newUserViewerPages" style="display:none;margin-top:10px">
                    <label style="font-size:10px;color:var(--text3);display:block;margin-bottom:4px">Доступні сторінки</label>
                    <div style="display:flex;gap:8px;flex-wrap:wrap">
                        ${ALL_PAGES.map(p => `<label style="font-size:11px;color:var(--text2);display:flex;align-items:center;gap:3px;cursor:pointer">
                            <input type="checkbox" class="new-user-page" data-page="${p.id}" checked> ${p.label}
                        </label>`).join('')}
                    </div>
                </div>
                <div style="display:flex;gap:10px;margin-top:14px;align-items:center">
                    <button class="btn" onclick="createUser()" id="btnCreateUser">Створити</button>
                    <button class="btn btn-sm" onclick="toggleAddUserForm()" style="color:var(--text3)">Скасувати</button>
                </div>
                <div id="createUserStatus" style="margin-top:8px;font-size:11px"></div>
            </div>
        </div>`;

        list.innerHTML = addUserHTML +
            `<div style="font-size:11px;color:var(--text3);margin-bottom:10px">${users.length} користувачів</div>` +
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

        // Show/hide viewer pages for new user form
        const newRoleSel = document.getElementById('newUserRole');
        if (newRoleSel) {
            newRoleSel.addEventListener('change', () => {
                const pDiv = document.getElementById('newUserViewerPages');
                if (pDiv) pDiv.style.display = newRoleSel.value === 'viewer' ? '' : 'none';
            });
        }
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

// ===== User Creation =====

export function toggleAddUserForm() {
    const form = document.getElementById('addUserForm');
    if (!form) return;
    const isVisible = form.style.display !== 'none';
    form.style.display = isVisible ? 'none' : '';
    if (!isVisible) {
        const statusEl = document.getElementById('createUserStatus');
        if (statusEl) statusEl.innerHTML = '';
        setTimeout(() => { const el = document.getElementById('newUserEmail'); if (el) el.focus(); }, 100);
    }
}

export function generateNewUserPassword() {
    const field = document.getElementById('newUserPass');
    if (field) { field.value = generatePassword(); field.type = 'text'; }
}

export async function createUser() {
    const email = document.getElementById('newUserEmail')?.value.trim();
    const fullName = document.getElementById('newUserName')?.value.trim();
    const password = document.getElementById('newUserPass')?.value;
    const role = document.getElementById('newUserRole')?.value || 'viewer';
    const orgLevel = document.getElementById('newUserOrgLevel')?.value || 'central';
    const orgUnit = document.getElementById('newUserOrgUnit')?.value || '';
    const statusEl = document.getElementById('createUserStatus');
    const btn = document.getElementById('btnCreateUser');

    if (!email || !fullName || !password) { toast('Заповніть всі обов\'язкові поля', true); return; }
    if (password.length < 6) { toast('Пароль має бути мін. 6 символів', true); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Невірний формат email', true); return; }

    let allowedPages = null;
    if (role === 'viewer') {
        allowedPages = [...document.querySelectorAll('.new-user-page:checked')].map(c => c.dataset.page);
        if (!allowedPages.length) allowedPages = ALL_PAGES.map(p => p.id);
    }

    btn.disabled = true;
    btn.textContent = 'Створення...';
    if (statusEl) statusEl.innerHTML = '';

    try {
        // Step 1: Create auth user via ephemeral client (won't affect admin session)
        const { data: signUpData, error: signUpError } = await sbSignup.auth.signUp({
            email, password,
            options: { data: { full_name: fullName } }
        });

        if (signUpError) { toast(mapSignUpError(signUpError.message), true); return; }
        if (!signUpData.user) { toast('Помилка: користувач не створений', true); return; }

        const userId = signUpData.user.id;

        // Step 2: Insert profile via main client (admin's RLS session)
        const { error: profileError } = await sb.from('profiles').insert({
            id: userId, email, full_name: fullName, role,
            org_level: orgLevel, org_unit: orgUnit,
            allowed_pages: allowedPages || ALL_PAGES.map(p => p.id)
        });

        if (profileError) {
            toast('Auth створено, але профіль не додано: ' + profileError.message, true);
            if (statusEl) statusEl.innerHTML = `<span style="color:var(--amber)">Auth OK, профіль потребує повторної спроби</span>`;
            return;
        }

        // Step 3: Success
        toast(`Користувач ${fullName} (${email}) створений як ${ROLE_LABELS[role]}`);

        // Show credentials for copying
        if (statusEl) {
            statusEl.innerHTML = `<div class="glass" style="padding:10px;background:var(--bg2);border-left:3px solid var(--green)">
                <div style="font-size:11px;color:var(--green);font-weight:600;margin-bottom:4px">Користувач створений!</div>
                <div style="font-size:12px;color:var(--text)">Email: <b>${email}</b></div>
                <div style="font-size:12px;color:var(--text)">Пароль: <b>${password}</b></div>
                <div style="font-size:10px;color:var(--text3);margin-top:4px">Збережіть або передайте ці дані користувачу</div>
            </div>`;
        }

        // Clear form fields
        document.getElementById('newUserEmail').value = '';
        document.getElementById('newUserName').value = '';
        document.getElementById('newUserPass').value = '';
        document.getElementById('newUserRole').value = 'viewer';
        document.getElementById('newUserOrgLevel').value = 'central';
        document.getElementById('newUserOrgUnit').value = '';

        // Refresh user list (delayed to show credentials first)
        setTimeout(() => openViewerAccess(), 2000);

    } catch (e) {
        toast('Помилка: ' + e.message, true);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Створити';
    }
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
        const [kpiCount, pricesCount, inventoryCount, pfCount, zsuCount, marketCount, kpiHistory] = await Promise.all([
            getRecordCount(), getPricesCount(), getInventoryCount(),
            getPlanFactCount(), getZsuCount(), getMarketPricesCount(), getUploadHistory('kpi')
        ]);
        const [pricesHistory, inventoryHistory, pfHistory, zsuHistory, marketHistory] = await Promise.all([
            getUploadHistory('prices'), getUploadHistory('inventory'),
            getUploadHistory('harvesting_plan_fact'), getUploadHistory('harvesting_zsu'),
            getUploadHistory('market_prices')
        ]);
        content.innerHTML = `<div style="display:flex;flex-direction:column;gap:12px">
            ${dataSection('KPI (Обсяги / Фінанси)', kpiCount, kpiHistory[0] || null, 'clearKpiData()', 'undoLastKpi()')}
            ${dataSection('Середньозважені ціни', pricesCount, pricesHistory[0] || null, 'clearPrices()')}
            ${dataSection('Залишки лісопродукції', inventoryCount, inventoryHistory[0] || null, 'clearInventory()')}
            ${dataSection('Ринкові ціни (міжнародні)', marketCount, marketHistory[0] || null, 'clearMarketData()', 'undoLastMarketUpload()')}
            ${dataSection('План-факт заготівлі', pfCount, pfHistory[0] || null, 'clearPlanFact()')}
            ${dataSection('Довідка ЗСУ', zsuCount, zsuHistory[0] || null, 'clearZsu()')}
        </div>`;
    } catch(e) {
        content.innerHTML = `<p style="color:var(--rose);font-size:12px">Помилка: ${e.message}</p>`;
    }
}

export function closeDataManage() { $('dataManageModal').classList.remove('on'); }
