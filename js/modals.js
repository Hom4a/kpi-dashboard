// ===== Modals: Drill-down, Targets, Fullscreen, Viewer Access, Data Management =====
import { $, fmt, toast, themeColor } from './utils.js';
import { allData, charts, targets, MO, setTargets } from './state.js';
import { kill, freshCanvas, getTargetAnnotation } from './charts-common.js';
import { sb, SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { getRecordCount, getUploadHistory } from './db-kpi.js';
import { getPricesCount, getInventoryCount } from './forest/db-forest.js';
import { getPlanFactCount, getZsuCount } from './harvesting/db-harvesting.js';
import { getMarketPricesCount } from './market/db-market.js';
import { getSummaryIndicatorCount, getSummaryWeeklyCount, deleteWeeklyByDate, deleteMonthlyByMonth, loadSummaryWeekly } from './summary/db-summary.js';
import { summaryIndicators, summaryWeekly, setSelectedWeeklyDate } from './summary/state-summary.js';
import { PAGE_ACCESS, ROLE_LABELS } from './auth.js';

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
    { id: 'summary', label: 'Зведення' },
    { id: 'gis', label: 'Карта' },
    { id: 'data-entry', label: 'Введення' },
    { id: 'builder', label: 'Дашборди' }
];

// ALL_ROLES + ROLE_LABELS — single source of truth у auth.js (post-D.0 cleanup
// matches sql/23 CHECK 6 roles). ALL_ROLES derived from imported ROLE_LABELS keys.
const ALL_ROLES = Object.keys(ROLE_LABELS);
const ORG_LEVELS = [
    { value: 'central', label: 'Центральний' },
    { value: 'regional', label: 'Обласний' },
    { value: 'branch', label: 'Філія' },
    { value: 'forest_unit', label: 'Лісництво' }
];

const ROLE_DESCRIPTIONS = {
    admin:    { desc: 'Повні права', pages: 'Усі сторінки', caps: ['усі дії', 'управління користувачами'] },
    director: { desc: 'Перегляд керівних звітів', pages: 'Обсяги, Фінанси, Продукція, Заготівля, Ринок, Керівний, Карта, Зведення', caps: ['перегляд', 'PDF звіти'] },
    analyst:  { desc: 'Аналіз даних усіх розділів', pages: 'Обсяги, Фінанси, Продукція, Заготівля, Ринок, Керівний, Карта, Зведення, Конструктор, API, Дашборди', caps: ['перегляд', 'дашборди', 'конструктор'] },
    editor:   { desc: 'Введення та керування даними', pages: 'Обсяги, Фінанси, Продукція, Заготівля, Ринок, Карта, Введення, Дашборди', caps: ['завантаження', 'керування даними', 'цілі', 'конструктор'] },
    manager:  { desc: 'Перегляд усіх дашбордів + журнал дій', pages: 'Обсяги, Фінанси, Продукція, Заготівля, Ринок, Керівний, Карта, Зведення, Дашборди', caps: ['перегляд'] },
    viewer:   { desc: 'Лише обмежений перегляд', pages: 'Обмежений набір (allowed_pages)', caps: ['перегляд'] },
};

const PAGE_DESCRIPTIONS = {
    volumes:     { desc: 'Реалізація та заготівля деревини: денна/місячна динаміка', data: 'KPI файл (дата, показник, значення)' },
    finance:     { desc: 'Грошові надходження, залишок каси, динаміка доходів', data: 'KPI файл (ті самі дані)' },
    forest:      { desc: 'Середньозважені ціни та залишки лісопродукції по філіях', data: 'Excel цін + Excel залишків' },
    harvesting:  { desc: 'Виконання плану заготівлі по регіонах', data: 'Excel план-факт + Excel довідка ЗСУ' },
    market:      { desc: 'Міжнародне порівняння цін на деревину', data: 'Excel міжнародних цін' },
    executive:   { desc: 'Агрегований дашборд для керівництва: scorecard, тренди', data: 'Всі вищезазначені джерела' },
    summary:     { desc: 'Зведення: основні показники діяльності та тижнева довідка', data: 'Excel показників + Word довідка' },
    gis:         { desc: 'Інтерактивна карта лісових офісів з регіональною аналітикою', data: 'Агреговані дані по областях' },
    'data-entry':{ desc: 'Сторінка завантаження файлів та введення даних', data: '—' },
    builder:     { desc: 'Конструктор кастомних дашбордів з віджетами', data: 'Використовує існуючі дані' }
};

const CAP_ICONS = {
    'перегляд': '\u{1F441}', 'завантаження': '\u2B06', 'керування даними': '\u270E',
    'цілі': '\u{1F3AF}', 'користувачі': '\u{1F465}', 'конструктор': '\u{1F4CA}'
};

function renderRoleDesc(role) {
    const rd = ROLE_DESCRIPTIONS[role];
    if (!rd) return '';
    const icons = rd.caps.map(c => `${CAP_ICONS[c] || ''} ${c}`).join('  ');
    return `<div style="font-size:11px;color:var(--text2);line-height:1.5">${rd.desc}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px"><b>Сторінки:</b> ${rd.pages}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:1px"><b>Можливості:</b> ${icons}</div>`;
}

function generatePassword() {
    const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
    const lower = 'abcdefghjkmnpqrstuvwxyz';
    const digits = '23456789';
    const special = '!@#$%&*';
    const all = upper + lower + digits + special;
    const rnd = new Uint8Array(14);
    crypto.getRandomValues(rnd);
    let pwd = [
        upper[rnd[0] % upper.length],
        lower[rnd[1] % lower.length],
        digits[rnd[2] % digits.length],
        special[rnd[3] % special.length]
    ];
    for (let i = 4; i < 14; i++) pwd.push(all[rnd[i] % all.length]);
    // Fisher-Yates shuffle with crypto randomness
    const shuffleBytes = new Uint8Array(pwd.length);
    crypto.getRandomValues(shuffleBytes);
    for (let i = pwd.length - 1; i > 0; i--) {
        const j = shuffleBytes[i] % (i + 1);
        [pwd[i], pwd[j]] = [pwd[j], pwd[i]];
    }
    return pwd.join('');
}

/** Escape HTML to prevent XSS when inserting user data into innerHTML */
function esc(text) {
    if (!text) return '';
    const d = document.createElement('div');
    d.textContent = String(text);
    return d.innerHTML;
}

function mapSignUpError(msg) {
    if (msg.includes('already registered') || msg.includes('already been registered')) return 'Цей email вже зареєстровано';
    if (msg.includes('password') && (msg.includes('short') || msg.includes('weak') || msg.includes('least'))) return 'Пароль занадто короткий або слабкий (мін. 6 символів)';
    if (msg.includes('valid email') || msg.includes('invalid')) return 'Невірний формат email';
    if (msg.includes('rate') || msg.includes('limit')) return 'Забагато запитів, зачекайте хвилину';
    return 'Помилка реєстрації: ' + msg;
}

// ===== Phase 2 admin actions: shared Edge Function caller =====
async function callAdminEdgeFunction(name, body) {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
        throw new Error('Сесія прострочена. Увійдіть знову.');
    }
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(body),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok || result.error) {
        throw new Error(result.detail || result.error || `HTTP ${res.status}`);
    }
    return result;
}

export async function openViewerAccess() {
    $('viewerAccessModal').classList.add('on');
    const list = $('viewerAccessList');
    list.innerHTML = '<p style="color:var(--text3);font-size:12px">Завантаження...</p>';
    try {
        const { data: users, error } = await sb.from('profiles')
            .select('id, email, full_name, role, allowed_pages, org_level, org_unit, mfa_required')
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

        const rolesRefHTML = `<div id="rolesRefPanel" style="display:none;margin-top:8px;margin-bottom:12px">
            <div class="glass" style="padding:14px">
                <div style="font-size:12px;font-weight:600;color:var(--primary);margin-bottom:10px">Ролі та їхні права</div>
                <div style="display:grid;grid-template-columns:auto 1fr auto;gap:4px 12px;font-size:11px;align-items:baseline">
                    <div style="font-weight:600;color:var(--text2);border-bottom:1px solid var(--border);padding-bottom:4px">Роль</div>
                    <div style="font-weight:600;color:var(--text2);border-bottom:1px solid var(--border);padding-bottom:4px">Сторінки</div>
                    <div style="font-weight:600;color:var(--text2);border-bottom:1px solid var(--border);padding-bottom:4px">Можливості</div>
                    ${ALL_ROLES.map(r => {
                        const rd = ROLE_DESCRIPTIONS[r];
                        if (!rd) return '';
                        const icons = rd.caps.map(c => CAP_ICONS[c] || '').join(' ');
                        return `<div style="color:var(--text);font-weight:500">${ROLE_LABELS[r]}</div>
                            <div style="color:var(--text3)">${rd.pages}</div>
                            <div title="${rd.caps.join(', ')}">${icons}</div>`;
                    }).join('')}
                </div>
                <div style="margin-top:10px;font-size:10px;color:var(--text3);line-height:1.6;border-top:1px solid var(--border);padding-top:8px">
                    \u{1F441} перегляд &nbsp; \u2B06 завантаження &nbsp; \u270E керування даними &nbsp; \u{1F3AF} цілі &nbsp; \u{1F465} користувачі &nbsp; \u{1F4CA} конструктор
                </div>
            </div>
        </div>`;

        const pagesRefHTML = `<div id="pagesRefPanel" style="display:none;margin-top:8px;margin-bottom:12px">
            <div class="glass" style="padding:14px">
                <div style="font-size:12px;font-weight:600;color:var(--primary);margin-bottom:10px">Дашборди та необхідні дані</div>
                ${ALL_PAGES.map(p => {
                    const pd = PAGE_DESCRIPTIONS[p.id];
                    if (!pd) return '';
                    return `<div style="margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border)">
                        <div style="font-size:12px;font-weight:600;color:var(--text)">${p.label}</div>
                        <div style="font-size:11px;color:var(--text2);margin-top:2px">${pd.desc}</div>
                        <div style="font-size:10px;color:var(--text3);margin-top:2px">Дані: ${pd.data}</div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;

        const addUserHTML = `<div style="margin-bottom:16px">
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
                <button class="btn btn-sm" onclick="toggleAddUserForm()">+ Додати користувача</button>
                <button class="btn btn-sm" style="color:var(--text2);border-color:var(--border)" onclick="var p=document.getElementById('rolesRefPanel');p.style.display=p.style.display==='none'?'':'none'">&#9432; Довідка по ролях</button>
                <button class="btn btn-sm" style="color:var(--text2);border-color:var(--border)" onclick="var p=document.getElementById('pagesRefPanel');p.style.display=p.style.display==='none'?'':'none'">&#9432; Довідка по дашбордах</button>
            </div>
            ${rolesRefHTML}
            ${pagesRefHTML}
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
                    <div id="newUserRoleDesc" style="grid-column:1/-1;padding:6px 10px;background:rgba(74,157,111,0.05);border-left:2px solid rgba(74,157,111,0.3);border-radius:6px">
                        ${renderRoleDesc('viewer')}
                    </div>
                </div>
                <div id="newUserViewerPages" style="margin-top:10px">
                    <label style="font-size:10px;color:var(--text3);display:block;margin-bottom:4px">Доступні сторінки</label>
                    <div style="display:flex;gap:8px;flex-wrap:wrap">
                        ${ALL_PAGES.map(p => `<label style="font-size:11px;color:var(--text2);display:flex;align-items:center;gap:3px;cursor:pointer" title="${PAGE_DESCRIPTIONS[p.id]?.desc || ''} | Дані: ${PAGE_DESCRIPTIONS[p.id]?.data || ''}">
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
                        <div style="font-size:13px;font-weight:600;color:var(--text);flex:1">${esc(u.full_name || u.id.slice(0, 8))}</div>
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
                    <div class="ua-role-desc" style="margin-top:8px;padding:6px 10px;background:rgba(74,157,111,0.05);border-left:2px solid rgba(74,157,111,0.3);border-radius:6px">
                        ${renderRoleDesc(u.role)}
                    </div>
                    <div style="margin-top:8px">
                        <label style="font-size:10px;color:var(--text3);display:block;margin-bottom:4px">Доступні сторінки</label>
                        <div class="ua-pages-wrap" style="display:flex;gap:8px;flex-wrap:wrap">
                            ${(() => {
                                const defaultPages = Object.entries(PAGE_ACCESS)
                                    .filter(([, roles]) => roles.includes(u.role))
                                    .map(([page]) => page);
                                const userPages = u.allowed_pages || defaultPages;
                                return ALL_PAGES.map(p => `<label style="font-size:11px;color:var(--text2);display:flex;align-items:center;gap:3px;cursor:pointer" title="${PAGE_DESCRIPTIONS[p.id]?.desc || ''} | Дані: ${PAGE_DESCRIPTIONS[p.id]?.data || ''}">
                                    <input type="checkbox" data-page="${p.id}" ${userPages.includes(p.id) ? 'checked' : ''}> ${p.label}
                                </label>`).join('');
                            })()}
                        </div>
                    </div>
                    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
                        <button class="btn btn-sm" data-action="save-${u.id}" onclick="saveUserRow('${u.id}')">💾 Зберегти</button>
                        <button class="btn btn-sm" data-action="reset-${u.id}" onclick="resetUserPassword('${u.id}','${esc(u.email||'')}')">🔄 Новий пароль</button>
                        <button class="btn btn-sm" data-action="ban-${u.id}" onclick="toggleUserDisabled('${u.id}','${esc(u.email||'')}',false)">🚫 Заблок.</button>
                        <button class="btn btn-sm" data-action="unban-${u.id}" onclick="toggleUserDisabled('${u.id}','${esc(u.email||'')}',true)">✓ Розблок.</button>
                        <button class="btn btn-sm" data-action="mfa-${u.id}" onclick="toggleUserMfaRequired('${u.id}','${esc(u.email||'')}',${!u.mfa_required})">${u.mfa_required ? '⚪ MFA off' : '🛡 MFA on'}</button>
                        <button class="btn btn-sm" data-action="resetmfa-${u.id}" onclick="resetUserMfaFactor('${u.id}','${esc(u.email||'')}')">🔓 Скинути MFA</button>
                        <button class="btn btn-sm btn-danger" data-action="delete-${u.id}" onclick="deleteUserRow('${u.id}','${esc(u.email||'')}')">🗑 Видалити</button>
                    </div>
                </div>`;
            }).join('');

        // Update page checkboxes + role description on role change
        list.querySelectorAll('.ua-role-select').forEach(sel => {
            sel.addEventListener('change', () => {
                const card = sel.closest('[data-user-id]');
                // Update role description
                const descDiv = card.querySelector('.ua-role-desc');
                if (descDiv) descDiv.innerHTML = renderRoleDesc(sel.value);
                // Reset page checkboxes to new role's defaults
                const newDefaults = Object.entries(PAGE_ACCESS)
                    .filter(([, roles]) => roles.includes(sel.value))
                    .map(([page]) => page);
                card.querySelectorAll('.ua-pages-wrap input[type=checkbox]').forEach(cb => {
                    cb.checked = newDefaults.includes(cb.dataset.page);
                });
            });
        });

        // Show/hide viewer pages + update role description for new user form
        const newRoleSel = document.getElementById('newUserRole');
        if (newRoleSel) {
            newRoleSel.addEventListener('change', () => {
                const pDiv = document.getElementById('newUserViewerPages');
                if (pDiv) pDiv.style.display = newRoleSel.value === 'viewer' ? '' : 'none';
                const descDiv = document.getElementById('newUserRoleDesc');
                if (descDiv) descDiv.innerHTML = renderRoleDesc(newRoleSel.value);
            });
        }
    } catch(e) { toast('Помилка: ' + e.message, true); }
}

export function closeViewerAccess() { $('viewerAccessModal').classList.remove('on'); }

// ===== Phase 2 admin actions: per-user-row handlers =====
// Replace previous mass-save (saveViewerAccess) — use per-row Save button +
// dedicated buttons for password reset / disable-enable / MFA toggle / delete.
// Each handler delegates до Edge Function (set-role / disable-user / etc.)
// for service_role-mediated mutation з ≥2 admins guard.

export async function saveUserRow(userId) {
    const card = document.querySelector(`#viewerAccessList [data-user-id="${userId}"]`);
    if (!card) return;

    const newRole = card.querySelector('.ua-role-select')?.value;
    const newOrgLevel = card.querySelector('.ua-org-level')?.value || 'central';
    const newOrgUnit = card.querySelector('.ua-org-unit')?.value || '';
    const allowedPages = [...card.querySelectorAll('.ua-pages-wrap input[type=checkbox]:checked')].map(c => c.dataset.page);

    const btn = card.querySelector(`[data-action="save-${userId}"]`);
    if (btn) { btn.disabled = true; btn.dataset.origText = btn.textContent; btn.textContent = 'Зачекайте...'; }

    try {
        // Step 1: role change via Edge Function (≥2 admins guard)
        await callAdminEdgeFunction('set-role', { target_id: userId, new_role: newRole });
        // Step 2: org/pages direct UPDATE via RLS ('Admins update all' policy)
        const { error } = await sb.from('profiles')
            .update({ org_level: newOrgLevel, org_unit: newOrgUnit, allowed_pages: allowedPages })
            .eq('id', userId);
        if (error) throw new Error(error.message);
        toast('Зміни збережено', false);
        setTimeout(() => openViewerAccess(), 500);
    } catch (e) {
        toast('Помилка: ' + e.message, true);
        if (btn) { btn.disabled = false; btn.textContent = btn.dataset.origText || '💾 Зберегти'; }
    }
}

export async function resetUserPassword(userId, email) {
    if (!confirm(`Згенерувати новий тимчасовий пароль для ${email}?`)) return;

    const btn = document.querySelector(`[data-action="reset-${userId}"]`);
    if (btn) { btn.disabled = true; btn.dataset.origText = btn.textContent; btn.textContent = 'Зачекайте...'; }

    try {
        const result = await callAdminEdgeFunction('reset-password', { target_id: userId });
        // Display temp password у dedicated UI block (matches createUser pattern)
        const card = document.querySelector(`#viewerAccessList [data-user-id="${userId}"]`);
        if (card) {
            const block = document.createElement('div');
            block.className = 'glass';
            block.style.cssText = 'padding:10px;background:var(--bg2);border-left:3px solid var(--green);margin-top:8px';
            block.innerHTML = `
                <div style="font-size:11px;color:var(--green);font-weight:600;margin-bottom:4px">Новий пароль згенеровано!</div>
                <div style="font-size:12px;color:var(--text)">Email: <b>${esc(email)}</b></div>
                <div style="font-size:12px;color:var(--text)">Пароль: <b>${esc(result.temp_password)}</b></div>
                <div style="font-size:10px;color:var(--text3);margin-top:4px">Передайте ці дані користувачу. Список оновиться через 30с.</div>
            `;
            card.appendChild(block);
        }
        toast(`Пароль скинуто для ${email}`, false);
        setTimeout(() => openViewerAccess(), 30000);  // 30s — admin копіює temp pwd
    } catch (e) {
        toast('Помилка: ' + e.message, true);
        if (btn) { btn.disabled = false; btn.textContent = btn.dataset.origText || '🔄 Новий пароль'; }
    }
}

export async function toggleUserDisabled(userId, email, enable) {
    const action = enable ? 'розблокувати' : 'заблокувати';
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${email}?`)) return;

    const actionKey = enable ? 'unban' : 'ban';
    const btn = document.querySelector(`[data-action="${actionKey}-${userId}"]`);
    if (btn) { btn.disabled = true; btn.dataset.origText = btn.textContent; btn.textContent = 'Зачекайте...'; }

    try {
        await callAdminEdgeFunction('disable-user', { target_id: userId, enable });
        toast(`Користувача ${enable ? 'розблоковано' : 'заблоковано'}: ${email}`, false);
        setTimeout(() => openViewerAccess(), 500);
    } catch (e) {
        toast('Помилка: ' + e.message, true);
        if (btn) { btn.disabled = false; btn.textContent = btn.dataset.origText || (enable ? '✓ Розблок.' : '🚫 Заблок.'); }
    }
}

export async function toggleUserMfaRequired(userId, email, required) {
    const verb = required ? 'Зробити MFA обовʼязковим' : 'Скасувати обовʼязковість MFA';
    if (!confirm(`${verb} для ${email}?`)) return;

    const btn = document.querySelector(`[data-action="mfa-${userId}"]`);
    if (btn) { btn.disabled = true; btn.dataset.origText = btn.textContent; btn.textContent = 'Зачекайте...'; }

    try {
        await callAdminEdgeFunction('set-mfa-required', { target_id: userId, required });
        toast(`MFA ${required ? 'увімкнено' : 'вимкнено'} для ${email}`, false);
        setTimeout(() => openViewerAccess(), 500);
    } catch (e) {
        toast('Помилка: ' + e.message, true);
        if (btn) { btn.disabled = false; btn.textContent = btn.dataset.origText || '🛡 MFA on'; }
    }
}

export async function resetUserMfaFactor(userId, email) {
    if (!confirm(`Скинути MFA для ${email}?\n\nКористувач буде змушений наново налаштувати двофакторну автентифікацію при наступному вході (якщо MFA обовʼязковий).`)) return;

    const btn = document.querySelector(`[data-action="resetmfa-${userId}"]`);
    if (btn) { btn.disabled = true; btn.dataset.origText = btn.textContent; btn.textContent = 'Зачекайте...'; }

    try {
        const res = await callAdminEdgeFunction('reset-mfa-factor', { target_id: userId });
        const n = res?.factors_deleted ?? 0;
        toast(n > 0 ? `MFA скинуто для ${email} (видалено ${n} factor${n === 1 ? '' : 'ів'})` : `${email}: жодного MFA factor не було`, false);
        setTimeout(() => openViewerAccess(), 500);
    } catch (e) {
        toast('Помилка: ' + e.message, true);
        if (btn) { btn.disabled = false; btn.textContent = btn.dataset.origText || '🔓 Скинути MFA'; }
    }
}

export async function deleteUserRow(userId, email) {
    const REQUIRED_CONFIRM = 'УДАЛИТИ';
    const userInput = window.prompt(
        `Це видалить користувача ${email} БЕЗ можливості відновлення.\n\n` +
        `Введіть слово "${REQUIRED_CONFIRM}" (без лапок) щоб підтвердити:`
    );
    if (userInput !== REQUIRED_CONFIRM) {
        toast('Скасовано. Користувача не видалено.', false);
        return;
    }

    const btn = document.querySelector(`[data-action="delete-${userId}"]`);
    if (btn) { btn.disabled = true; btn.dataset.origText = btn.textContent; btn.textContent = 'Зачекайте...'; }

    try {
        await callAdminEdgeFunction('delete-user', { target_id: userId });
        toast(`Користувача ${email} видалено`, false);
        setTimeout(() => openViewerAccess(), 500);
    } catch (e) {
        const isFkConflict = e.message && /foreign key|violates|reference/i.test(e.message);
        const msg = isFkConflict
            ? 'Не можна видалити: користувач має історичні дані. Заблокуйте замість видалення.'
            : 'Помилка: ' + e.message;
        toast(msg, true);
        if (btn) { btn.disabled = false; btn.textContent = btn.dataset.origText || '🗑 Видалити'; }
    }
}

// ===== Self-service password change (Phase 2.5 G.1) =====
// Modal #changePasswordModal у index.html. Verifies current password
// via re-signin (signInWithPassword) перш ніж auth.updateUser({ password }).

export function openChangePassword() {
    const m = document.getElementById('changePasswordModal');
    if (!m) return;
    document.getElementById('cpwCurrent').value = '';
    document.getElementById('cpwNew').value = '';
    document.getElementById('cpwConfirm').value = '';
    document.getElementById('cpwStatus').innerHTML = '';
    const btn = document.getElementById('cpwSubmit');
    if (btn) { btn.disabled = false; btn.textContent = 'Змінити пароль'; }
    m.classList.add('on');
    setTimeout(() => document.getElementById('cpwCurrent')?.focus(), 100);
}

export function closeChangePassword() {
    const m = document.getElementById('changePasswordModal');
    if (m) m.classList.remove('on');
}

export function generateMyPassword() {
    const pwd = generatePassword();   // 14-char crypto-safe (existing helper)
    const newInput = document.getElementById('cpwNew');
    const confirmInput = document.getElementById('cpwConfirm');
    if (!newInput || !confirmInput) return;
    newInput.value = pwd;
    confirmInput.value = pwd;
    // Briefly reveal so user can copy/note before saving
    newInput.type = 'text';
    confirmInput.type = 'text';
    setTimeout(() => {
        newInput.type = 'password';
        confirmInput.type = 'password';
    }, 5000);
    document.getElementById('cpwStatus').innerHTML =
        '<span style="color:var(--green)">Згенеровано. Збережіть у менеджер паролів — поля приховаються через 5с.</span>';
}

export async function submitChangePassword() {
    const currentPwd = document.getElementById('cpwCurrent').value;
    const newPwd = document.getElementById('cpwNew').value;
    const confirmPwd = document.getElementById('cpwConfirm').value;
    const statusEl = document.getElementById('cpwStatus');
    const btn = document.getElementById('cpwSubmit');

    // Client-side validation
    if (!currentPwd || !newPwd || !confirmPwd) {
        statusEl.innerHTML = '<span style="color:var(--rose)">Заповніть усі поля</span>';
        return;
    }
    if (newPwd.length < 8) {
        statusEl.innerHTML = '<span style="color:var(--rose)">Новий пароль має бути мін. 8 символів</span>';
        return;
    }
    if (newPwd !== confirmPwd) {
        statusEl.innerHTML = '<span style="color:var(--rose)">Новий пароль і підтвердження не співпадають</span>';
        return;
    }
    if (newPwd === currentPwd) {
        statusEl.innerHTML = '<span style="color:var(--rose)">Новий пароль має відрізнятися від поточного</span>';
        return;
    }

    btn.disabled = true;
    const origText = btn.textContent;
    btn.textContent = 'Зачекайте...';
    statusEl.innerHTML = '';

    try {
        // Step 1: get current session user (для email)
        const { data: { user } } = await sb.auth.getUser();
        if (!user || !user.email) {
            throw new Error('Сесія недійсна. Перезайдіть і спробуйте знову.');
        }

        // Step 2: verify current password via re-signin
        // (Supabase auth.updateUser does NOT verify current password natively;
        // re-signin is the manual check.)
        const { error: signInError } = await sb.auth.signInWithPassword({
            email: user.email,
            password: currentPwd,
        });
        if (signInError) {
            throw new Error('Поточний пароль невірний');
        }

        // Step 3: update to new password
        const { error: updateError } = await sb.auth.updateUser({ password: newPwd });
        if (updateError) {
            throw new Error(updateError.message || 'Не вдалося оновити пароль');
        }

        toast('Пароль змінено');
        closeChangePassword();
    } catch (e) {
        statusEl.innerHTML = `<span style="color:var(--rose)">${esc(e.message)}</span>`;
        btn.disabled = false;
        btn.textContent = origText;
    }
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
    if (fullName.length > 100) { toast('Ім\'я занадто довге (макс. 100 символів)', true); return; }
    if (!/^[\p{L}\s''\-\.]+$/u.test(fullName)) { toast('Ім\'я може містити лише букви, пробіли та дефіс', true); return; }

    let allowedPages = null;
    if (role === 'viewer') {
        allowedPages = [...document.querySelectorAll('.new-user-page:checked')].map(c => c.dataset.page);
        if (!allowedPages.length) allowedPages = ALL_PAGES.map(p => p.id);
    }

    btn.disabled = true;
    btn.textContent = 'Створення...';
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--text3)">Створення користувача...</span>';

    try {
        // Call Edge Function (uses service_role key server-side, no email confirmation needed)
        const { data: { session } } = await sb.auth.getSession();
        const res = await fetch(`${SUPABASE_URL}/functions/v1/create-user`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
                'apikey': SUPABASE_ANON_KEY
            },
            body: JSON.stringify({
                email, password, full_name: fullName, role,
                org_level: orgLevel, org_unit: orgUnit,
                allowed_pages: allowedPages || ALL_PAGES.map(p => p.id)
            })
        });

        const result = await res.json();

        if (!res.ok || result.error) {
            const msg = mapSignUpError(result.error || `HTTP ${res.status}`);
            toast(msg, true);
            if (statusEl) statusEl.innerHTML = `<span style="color:var(--rose)">${esc(msg)}</span>`;
            return;
        }

        // Success
        toast(`Користувач ${esc(fullName)} (${esc(email)}) створений як ${ROLE_LABELS[role]}`);

        // Show credentials for copying
        if (statusEl) {
            statusEl.innerHTML = `<div class="glass" style="padding:10px;background:var(--bg2);border-left:3px solid var(--green)">
                <div style="font-size:11px;color:var(--green);font-weight:600;margin-bottom:4px">Користувач створений!</div>
                <div style="font-size:12px;color:var(--text)">Email: <b>${esc(email)}</b></div>
                <div style="font-size:12px;color:var(--text)">Пароль: <b>${esc(password)}</b></div>
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
        if (statusEl) statusEl.innerHTML = `<span style="color:var(--rose)">${esc(e.message)}</span>`;
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

const MO_SHORT = ['Січ','Лют','Бер','Кві','Тра','Чер','Лип','Сер','Вер','Жов','Лис','Гру'];

function getWeekInfoDM(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    const day = d.getDay();
    const monday = new Date(d); monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    const thu = new Date(monday); thu.setDate(monday.getDate() + 3);
    const jan1 = new Date(thu.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((thu - jan1) / 86400000 + 1) / 7);
    const fD = dt => `${String(dt.getDate()).padStart(2,'0')}.${String(dt.getMonth()+1).padStart(2,'0')}`;
    return { monday, sunday, weekNum, label: `Тиждень №${weekNum} (${fD(monday)} — ${fD(sunday)}.${sunday.getFullYear()})` };
}

function weeklyListSection() {
    const dates = [...new Set(summaryWeekly.map(r => r.report_date))].sort().reverse();
    if (!dates.length) return '';
    return `<div class="glass" style="padding:16px">
        <div style="font-size:13px;font-weight:600;color:var(--primary);margin-bottom:8px">Тижневі звіти (по тижнях)</div>
        <div style="display:flex;flex-direction:column;gap:4px">
            ${dates.map(d => {
                const { label } = getWeekInfoDM(d);
                const count = summaryWeekly.filter(r => r.report_date === d).length;
                return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-radius:6px;background:var(--bg2);font-size:12px">
                    <span style="color:var(--text)">${label} <span style="color:var(--text3)">(${count} зап.)</span></span>
                    <button class="btn btn-sm btn-danger" style="padding:2px 8px;font-size:10px" onclick="window._deleteWeek('${d}')">Видалити</button>
                </div>`;
            }).join('')}
        </div>
    </div>`;
}

function monthlyListSection() {
    const months = [...new Set(summaryIndicators.filter(r => r.month > 0).map(r => `${r.year}-${r.month}`))].sort().reverse();
    if (!months.length) return '';
    return `<div class="glass" style="padding:16px">
        <div style="font-size:13px;font-weight:600;color:var(--primary);margin-bottom:8px">Місячні дані (по місяцях)</div>
        <div style="display:flex;flex-direction:column;gap:4px">
            ${months.map(ym => {
                const [y, m] = ym.split('-').map(Number);
                const count = summaryIndicators.filter(r => r.year === y && r.month === m).length;
                return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-radius:6px;background:var(--bg2);font-size:12px">
                    <span style="color:var(--text)">${MO_SHORT[m-1]} ${y} <span style="color:var(--text3)">(${count} зап.)</span></span>
                    <button class="btn btn-sm btn-danger" style="padding:2px 8px;font-size:10px" onclick="window._deleteMonth(${y},${m})">Видалити</button>
                </div>`;
            }).join('')}
        </div>
    </div>`;
}

// Wire global handlers
window._deleteWeek = async (reportDate) => {
    const { label } = getWeekInfoDM(reportDate);
    if (!confirm(`Видалити ${label}?`)) return;
    try {
        await deleteWeeklyByDate(reportDate);
        summaryWeekly.splice(0, summaryWeekly.length, ...summaryWeekly.filter(r => r.report_date !== reportDate));
        setSelectedWeeklyDate(null);
        toast(`${label} видалено`);
        openDataManage(); // refresh
        if (_renderAllFn) _renderAllFn();
    } catch (e) { toast('Помилка: ' + e.message, true); }
};

window._deleteMonth = async (year, month) => {
    if (!confirm(`Видалити дані за ${MO_SHORT[month-1]} ${year}?`)) return;
    try {
        await deleteMonthlyByMonth(year, month);
        summaryIndicators.splice(0, summaryIndicators.length, ...summaryIndicators.filter(r => !(r.year === year && r.month === month)));
        toast(`${MO_SHORT[month-1]} ${year} видалено`);
        openDataManage(); // refresh
        if (_renderAllFn) _renderAllFn();
    } catch (e) { toast('Помилка: ' + e.message, true); }
};

export async function openDataManage() {
    $('dataManageModal').classList.add('on');
    const content = $('dataManageContent');
    content.innerHTML = '<p style="color:var(--text3);font-size:12px">Завантаження статистики...</p>';
    try {
        const [kpiCount, pricesCount, inventoryCount, pfCount, zsuCount, marketCount, summaryIndCount, summaryWeekCount, kpiHistory] = await Promise.all([
            getRecordCount(), getPricesCount(), getInventoryCount(),
            getPlanFactCount(), getZsuCount(), getMarketPricesCount(),
            getSummaryIndicatorCount(), getSummaryWeeklyCount(), getUploadHistory('kpi')
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
            ${dataSection('Зведені показники (xlsx)', summaryIndCount, null, 'clearSummaryIndicators()')}
            ${dataSection('Щотижневі довідки', summaryWeekCount, null, 'clearSummaryWeekly()')}
            ${weeklyListSection()}
            ${monthlyListSection()}
        </div>`;
    } catch(e) {
        content.innerHTML = `<p style="color:var(--rose);font-size:12px">Помилка: ${e.message}</p>`;
    }
}

export function closeDataManage() { $('dataManageModal').classList.remove('on'); }
