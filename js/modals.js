// ===== Modals: Drill-down, Targets, Fullscreen, Viewer Access =====
import { $, fmt, toast, themeColor } from './utils.js';
import { allData, charts, targets, MO, setTargets } from './state.js';
import { kill, freshCanvas, getTargetAnnotation } from './charts-common.js';
import { sb } from './config.js';

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

// ===== Viewer Access Management =====
const ALL_PAGES = [
    { id: 'volumes', label: 'Обсяги' },
    { id: 'finance', label: 'Фінанси' },
    { id: 'forest', label: 'Продукція' },
    { id: 'harvesting', label: 'Заготівля' }
];

export async function openViewerAccess() {
    $('viewerAccessModal').classList.add('on');
    const list = $('viewerAccessList');
    list.innerHTML = '<p style="color:var(--text3);font-size:12px">Завантаження...</p>';
    try {
        const { data: viewers, error } = await sb.from('profiles').select('id, full_name, role, allowed_pages').eq('role', 'viewer');
        if (error) { toast('Помилка: ' + error.message, true); return; }
        if (!viewers || !viewers.length) {
            list.innerHTML = '<p style="color:var(--text3);font-size:12px">Немає користувачів з роллю "viewer"</p>';
            return;
        }
        list.innerHTML = viewers.map(v => {
            const allowed = v.allowed_pages || ALL_PAGES.map(p => p.id);
            return `<div class="glass" style="padding:14px" data-viewer-id="${v.id}">
                <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:8px">${v.full_name || v.id}</div>
                <div style="display:flex;gap:12px;flex-wrap:wrap">
                    ${ALL_PAGES.map(p => `<label style="font-size:12px;color:var(--text2);display:flex;align-items:center;gap:4px;cursor:pointer">
                        <input type="checkbox" data-page="${p.id}" ${allowed.includes(p.id) ? 'checked' : ''}> ${p.label}
                    </label>`).join('')}
                </div>
            </div>`;
        }).join('');
    } catch(e) { toast('Помилка: ' + e.message, true); }
}

export function closeViewerAccess() { $('viewerAccessModal').classList.remove('on'); }

export async function saveViewerAccess() {
    const items = document.querySelectorAll('#viewerAccessList [data-viewer-id]');
    for (const item of items) {
        const id = item.dataset.viewerId;
        const checked = [...item.querySelectorAll('input[type=checkbox]:checked')].map(c => c.dataset.page);
        const { error } = await sb.from('profiles').update({ allowed_pages: checked }).eq('id', id);
        if (error) { toast('Помилка: ' + error.message, true); return; }
    }
    closeViewerAccess();
    toast('Доступ збережено');
}
