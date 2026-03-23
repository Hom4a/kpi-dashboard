// ===== Indicator Infographic Modal =====
// Click on any indicator → modal with chart + period comparison
import { $ } from '../utils.js';
import { kill, freshCanvas, makeGrad } from '../charts-common.js';
import { charts } from '../state.js';
import { loadWeeklyIndicatorHistory, loadMonthlyIndicatorHistory } from './db-summary.js';

const MODAL_ID = 'indicatorModal';
let _chart = null;

export function initIndicatorModal() {
    let overlay = $(MODAL_ID);
    if (overlay) return;

    const div = document.createElement('div');
    div.className = 'modal-overlay';
    div.id = MODAL_ID;
    div.innerHTML = `<div class="modal" style="max-width:700px;width:95vw">
        <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <h3 id="infModalTitle" style="margin:0;font-size:16px;color:var(--text1)"></h3>
            <button id="infModalClose" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text2)">&times;</button>
        </div>
        <div id="infModalMeta" style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap"></div>
        <div id="infModalPeriod" style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap"></div>
        <div style="position:relative;height:280px">
            <canvas id="infModalChart"></canvas>
        </div>
    </div>`;
    document.body.appendChild(div);

    div.addEventListener('click', e => { if (e.target === div) closeModal(); });
    $('infModalClose').onclick = closeModal;
}

function closeModal() {
    const overlay = $(MODAL_ID);
    if (overlay) overlay.classList.remove('on');
    if (_chart) { _chart.destroy(); _chart = null; }
}

export async function openWeeklyIndicatorModal(section, indicatorName, currentVal, prevVal, delta) {
    initIndicatorModal();
    const overlay = $(MODAL_ID);
    overlay.classList.add('on');

    $('infModalTitle').textContent = indicatorName;
    renderMeta(currentVal, prevVal, delta);
    renderPeriodButtons('weekly', section, indicatorName);

    await loadAndDrawWeekly(section, indicatorName, 'line');
}

export async function openMonthlyIndicatorModal(indicatorName, group) {
    initIndicatorModal();
    const overlay = $(MODAL_ID);
    overlay.classList.add('on');

    $('infModalTitle').textContent = indicatorName;
    $('infModalMeta').innerHTML = '';
    renderPeriodButtons('monthly', indicatorName, group);

    await loadAndDrawMonthly(indicatorName, 'value', 'bar');
}

function renderMeta(current, prev, delta) {
    const meta = $('infModalMeta');
    if (!meta) return;

    const fN = v => v == null ? '—' : typeof v === 'number'
        ? v.toLocaleString('uk-UA', { maximumFractionDigits: 2 }) : v;

    let deltaHtml = '';
    if (delta != null) {
        const cls = delta > 0 ? 'color:#4A9D6F' : delta < 0 ? 'color:#E74C3C' : 'color:#E67E22';
        deltaHtml = `<div class="inf-meta-card">
            <div class="inf-meta-label">Зміна</div>
            <div class="inf-meta-value" style="${cls}">${delta >= 0 ? '+' : ''}${fN(delta)}</div>
        </div>`;
    }

    meta.innerHTML = `
        <div class="inf-meta-card">
            <div class="inf-meta-label">Поточне</div>
            <div class="inf-meta-value">${fN(current)}</div>
        </div>
        <div class="inf-meta-card">
            <div class="inf-meta-label">Попереднє</div>
            <div class="inf-meta-value">${fN(prev)}</div>
        </div>
        ${deltaHtml}
    `;
}

function renderPeriodButtons(type, key1, key2) {
    const container = $('infModalPeriod');
    if (!container) return;

    const buttons = type === 'weekly'
        ? [
            { label: 'Останні 8 тижнів', mode: 'w8' },
            { label: 'Останні 20 тижнів', mode: 'w20' },
            { label: 'Весь період', mode: 'wall' }
        ]
        : [
            { label: 'По місяцях', mode: 'months' },
            { label: 'По роках', mode: 'years' }
        ];

    container.innerHTML = buttons.map((b, i) =>
        `<button class="inf-period-btn${i === 0 ? ' active' : ''}" data-mode="${b.mode}">${b.label}</button>`
    ).join('');

    container.querySelectorAll('.inf-period-btn').forEach(btn => {
        btn.onclick = async () => {
            container.querySelectorAll('.inf-period-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (type === 'weekly') {
                const limit = btn.dataset.mode === 'w8' ? 8 : btn.dataset.mode === 'w20' ? 20 : 52;
                await loadAndDrawWeekly(key1, key2, 'line', limit);
            } else {
                await loadAndDrawMonthly(key1, 'value', btn.dataset.mode === 'years' ? 'bar' : 'line');
            }
        };
    });
}

async function loadAndDrawWeekly(section, indicatorName, chartType, limit = 8) {
    try {
        const history = await loadWeeklyIndicatorHistory(section, indicatorName, limit);
        if (!history.length) return;

        const labels = history.map(r => {
            const d = new Date(r.report_date);
            return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
        });
        const values = history.map(r => r.value_current);
        drawChart(labels, values, indicatorName, chartType);
    } catch (e) {
        console.error('infographic weekly error:', e);
    }
}

async function loadAndDrawMonthly(indicatorName, subType, chartType) {
    try {
        const history = await loadMonthlyIndicatorHistory(indicatorName, subType);
        if (!history.length) return;

        const MO = ['Січ','Лют','Бер','Кві','Тра','Чер','Лип','Сер','Вер','Жов','Лис','Гру'];
        const labels = history.map(r => `${MO[r.month - 1]} ${r.year}`);
        const values = history.map(r => r.value_numeric);
        drawChart(labels, values, indicatorName, chartType);
    } catch (e) {
        console.error('infographic monthly error:', e);
    }
}

function drawChart(labels, values, label, type) {
    if (_chart) { _chart.destroy(); _chart = null; }

    const canvas = $('infModalChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 0, 280);
    gradient.addColorStop(0, 'rgba(74,157,111,.3)');
    gradient.addColorStop(1, 'rgba(74,157,111,.02)');

    _chart = new Chart(ctx, {
        type: type === 'bar' ? 'bar' : 'line',
        data: {
            labels,
            datasets: [{
                label,
                data: values,
                borderColor: '#4A9D6F',
                backgroundColor: type === 'bar' ? 'rgba(74,157,111,.6)' : gradient,
                borderWidth: 2,
                fill: type !== 'bar',
                tension: .3,
                pointRadius: 3,
                pointBackgroundColor: '#4A9D6F'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15,20,25,.9)',
                    titleColor: '#fff',
                    bodyColor: '#9ca3af',
                    borderColor: 'rgba(74,157,111,.3)',
                    borderWidth: 1,
                    cornerRadius: 8,
                    padding: 10
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#6b7280', maxRotation: 45 } },
                y: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { font: { size: 10 }, color: '#6b7280' } }
            }
        }
    });
}
