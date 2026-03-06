// ===== Volumes Page Rendering =====
import { $, fmt, fmtDate, themeColor } from './utils.js';
import { filtered, allData, charts, tblTab, MO, WD } from './state.js';
import { kill, freshCanvas, makeGrad, getTargetAnnotation, drawSparkline } from './charts-common.js';
import { showDrillDown } from './modals.js';
import { kpiCard, drawEnhancedSparkline, ICONS } from './ui-helpers.js';

export function renderKPIs() {
    const real = filtered.filter(r => r.type === 'realized');
    const harv = filtered.filter(r => r.type === 'harvested');
    const sumR = real.reduce((s, r) => s + r.value, 0);
    const sumH = harv.reduce((s, r) => s + r.value, 0);
    const avgR = real.length ? sumR / real.length : 0;
    const maxR = real.length ? real.reduce((m, r) => r.value > m ? r.value : m, -Infinity) : 0;
    const maxRDate = real.length ? real.reduce((a, b) => b.value > a.value ? b : a, real[0]).date : '';
    const lastData = filtered.length ? filtered[filtered.length - 1]._date : new Date();
    const cm = lastData.getMonth(), cy = lastData.getFullYear();
    const pm = cm === 0 ? 11 : cm - 1, py = cm === 0 ? cy - 1 : cy;
    const curMDays = real.filter(r => r._date.getMonth() === cm && r._date.getFullYear() === cy);
    const curM = curMDays.reduce((s, r) => s + r.value, 0);
    const prevM = real.filter(r => r._date.getMonth() === pm && r._date.getFullYear() === py).reduce((s, r) => s + r.value, 0);
    const mom = prevM > 0 ? ((curM - prevM) / prevM * 100) : 0;
    const today = new Date();
    const isPartialMonth = (cy === today.getFullYear() && cm === today.getMonth() && today.getDate() < 28);
    const work = real.filter(r => r.value > 1000).length;
    const last30 = real.slice(-30).map(r => r.value);
    const last30h = harv.slice(-30).map(r => r.value);

    // Data date
    const dateSub = $('volumesDataDate');
    if (dateSub && filtered.length) dateSub.textContent = `Дані за ${fmtDate(filtered[filtered.length - 1].date)}`;

    $('kpiGrid').innerHTML = [
        kpiCard({ label: 'Реалізація', value: fmt(sumR / 1000, 1), unit: 'тис.м\u00B3', cls: 'neon-primary', icClass: 'ic-primary', icon: ICONS.truck, sub: 'За обраний період', sparkId: 'volSpk0' }),
        kpiCard({ label: 'Заготівля', value: fmt(sumH / 1000, 1), unit: 'тис.м\u00B3', cls: 'neon-secondary', icClass: 'ic-secondary', icon: ICONS.tree, sub: 'За обраний період', sparkId: 'volSpk1' }),
        kpiCard({ label: 'Середнє/день', value: fmt(avgR, 0), unit: 'м\u00B3', cls: 'neon-accent', icClass: 'ic-accent', icon: ICONS.chartLine, sub: 'Реалізація' }),
        kpiCard({ label: 'Макс за день', value: fmt(maxR, 0), unit: 'м\u00B3', cls: 'neon-amber', icClass: 'ic-amber', icon: ICONS.zap, sub: maxRDate ? fmtDate(maxRDate) : '' }),
        kpiCard({ label: MO[cm] + ' ' + cy + (isPartialMonth ? ` (${curMDays.length} дн)` : ''), value: fmt(curM / 1000, 1), unit: 'тис.м\u00B3', cls: 'neon-green', icClass: 'ic-green', icon: ICONS.calendar, change: isPartialMonth ? null : mom, sub: isPartialMonth ? `Неповний місяць (${curMDays.length} днів)` : `vs ${MO[pm]}: ${fmt(prevM / 1000, 1)} тис.м\u00B3` }),
        kpiCard({ label: 'Робочі дні', value: fmt(work), unit: 'днів', cls: 'neon-rose', icClass: 'ic-rose', icon: ICONS.briefcase, sub: `${fmt(real.length - work)} вихідних` }),
    ].join('');

    // Draw sparklines
    const spk0 = document.querySelector('[data-spark-id="volSpk0"]');
    const spk1 = document.querySelector('[data-spark-id="volSpk1"]');
    if (spk0 && last30.length) drawEnhancedSparkline(spk0, last30, themeColor('--primary'));
    if (spk1 && last30h.length) drawEnhancedSparkline(spk1, last30h, themeColor('--secondary'));

    // Stats bar
    const types = [...new Set(allData.map(r => r.type))];
    const typeNames = { realized: 'Реалізація', harvested: 'Заготівля', cash_daily: 'Гроші(дні)', cash_monthly: 'Гроші(міс)' };
    $('statsBar').innerHTML = `<div class="stat">Всього: <b>${allData.length}</b> записів</div>` +
        types.map(t => `<div class="stat">${typeNames[t] || t}: <b>${allData.filter(r => r.type === t).length}</b></div>`).join('');
}

export function renderInsights() {
    const real = filtered.filter(r => r.type === 'realized');
    if (!real.length) { $('insightsBar').innerHTML = ''; return; }
    const insights = [];
    const lastD = filtered[filtered.length - 1]._date;
    const cm2 = lastD.getMonth(), cy2 = lastD.getFullYear();
    const pm2 = cm2 === 0 ? 11 : cm2 - 1, py2 = cm2 === 0 ? cy2 - 1 : cy2;
    const curMDays2 = real.filter(r => r._date.getMonth() === cm2 && r._date.getFullYear() === cy2);
    const curM2 = curMDays2.reduce((s, r) => s + r.value, 0);
    const prevM2 = real.filter(r => r._date.getMonth() === pm2 && r._date.getFullYear() === py2).reduce((s, r) => s + r.value, 0);
    const td = new Date();
    const partial = (cy2 === td.getFullYear() && cm2 === td.getMonth() && td.getDate() < 28);
    if (prevM2 > 0 && !partial) {
        const ch = ((curM2 - prevM2) / prevM2 * 100).toFixed(1);
        insights.push(`Реалізація ${ch >= 0 ? 'зросла' : 'знизилась'} на ${Math.abs(ch)}% порівняно з минулим місяцем`);
    } else if (partial) {
        insights.push(`${MO[cm2]}: дані за ${curMDays2.length} днів (місяць ще не завершено)`);
    }
    const maxR = real.reduce((a, b) => b.value > a.value ? b : a, real[0]);
    insights.push(`Максимум за день: ${fmt(maxR.value)} м\u00B3 (${fmtDate(maxR.date)})`);
    const wd = real.filter(r => { const d = r._date.getDay(); return d > 0 && d < 6; });
    const we = real.filter(r => { const d = r._date.getDay(); return d === 0 || d === 6; });
    const avgWd = wd.length ? wd.reduce((s, r) => s + r.value, 0) / wd.length : 0;
    const avgWe = we.length ? we.reduce((s, r) => s + r.value, 0) / we.length : 0;
    insights.push(`Середнє у будні: ${fmt(avgWd)} м\u00B3, у вихідні: ${fmt(avgWe)} м\u00B3`);

    $('insightsBar').innerHTML = insights.map(t =>
        `<div class="insight-chip"><svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>${t}</div>`
    ).join('');
}

export function renderMainChart() {
    kill('main');
    const canvas = freshCanvas('wrapMain', 'cMain');
    const ctx = canvas.getContext('2d');
    const real = filtered.filter(r => r.type === 'realized');
    const harv = filtered.filter(r => r.type === 'harvested');
    const pc = themeColor('--primary'), sc = themeColor('--secondary');
    const annotation = getTargetAnnotation('daily_realized', 'Денний план');
    charts['main'] = new Chart(ctx, {
        type: 'line',
        data: { datasets: [
            { label: "Реалізований об'єм", data: real.map(r => ({ x: r._date, y: r.value })), borderColor: pc, backgroundColor: makeGrad(ctx, 74, 157, 111), borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 5, fill: true, tension: 0.35 },
            { label: "Обсяг заготівлі", data: harv.map(r => ({ x: r._date, y: r.value })), borderColor: sc, backgroundColor: makeGrad(ctx, 156, 175, 136), borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 5, fill: true, tension: 0.35 }
        ]},
        options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
            scales: { x: { type: 'time', time: { unit: filtered.length > 365 ? 'month' : 'week', displayFormats: { week: 'dd.MM', month: 'MMM yyyy' }}, ticks: { maxTicksLimit: 15 }},
                y: { beginAtZero: true, ticks: { callback: v => v >= 1000 ? (v/1000|0) + 'k' : v }}},
            plugins: { annotation, tooltip: { callbacks: { label: i => ` ${i.dataset.label}: ${fmt(i.parsed.y, 1)} м\u00B3` }}}
        }
    });
}

export function setMainMode(mode) {
    if (!charts['main']) return;
    charts['main'].data.datasets[0].hidden = mode === 'harvested';
    if (charts['main'].data.datasets[1]) charts['main'].data.datasets[1].hidden = mode === 'realized';
    charts['main'].update();
}

export function renderMonthlyChart() {
    kill('monthly');
    const canvas = freshCanvas('wrapMonthly', 'cMonthly');
    const ctx = canvas.getContext('2d');
    const mon = {};
    filtered.forEach(r => {
        if (r.type !== 'realized' && r.type !== 'harvested') return;
        const k = r.date.slice(0, 7);
        if (!mon[k]) mon[k] = { realized: 0, harvested: 0 };
        mon[k][r.type] += r.value;
    });
    const keys = Object.keys(mon).sort();
    if (!keys.length) return;
    const labels = keys.map(k => { const [y, m] = k.split('-'); return MO[+m - 1].slice(0, 3) + ' ' + y.slice(2); });
    const pc = themeColor('--primary'), sc = themeColor('--secondary');
    const annotation = getTargetAnnotation('monthly_realized', 'Місячний план');
    charts['monthly'] = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [
            { label: 'Реалізація', data: keys.map(k => mon[k].realized), backgroundColor: pc + '80', hoverBackgroundColor: pc + 'B3', borderRadius: 4, barPercentage: 0.7, categoryPercentage: 0.8 },
            { label: 'Заготівля', data: keys.map(k => mon[k].harvested), backgroundColor: sc + '80', hoverBackgroundColor: sc + 'B3', borderRadius: 4, barPercentage: 0.7, categoryPercentage: 0.8 }
        ]},
        options: { responsive: true, maintainAspectRatio: false,
            scales: { x: { type: 'category', ticks: { maxRotation: 45 } }, y: { type: 'linear', beginAtZero: true, ticks: { callback: v => v >= 1000 ? (v/1000|0) + 'k' : v } } },
            plugins: { annotation, tooltip: { callbacks: { label: i => ` ${i.dataset.label}: ${fmt(i.parsed.y, 0)} м\u00B3` } } },
            onClick: (event, elements) => {
                if (elements.length) showDrillDown(keys[elements[0].index]);
            }
        }
    });
}

export function renderCumChart() {
    kill('cum');
    const canvas = freshCanvas('wrapCum', 'cCum');
    const ctx = canvas.getContext('2d');
    const yrs = [...new Set(filtered.map(r => r._date.getFullYear()))].sort();
    const colors = [themeColor('--primary'), themeColor('--secondary'), themeColor('--amber'), themeColor('--rose')];
    const ds = yrs.map((yr, i) => {
        const d = filtered.filter(r => r._date.getFullYear() === yr && r.type === 'realized').sort((a, b) => a._date - b._date);
        let cum = 0;
        return { label: '' + yr, data: d.map(r => { cum += r.value; const soy = new Date(yr, 0, 1); return { x: Math.floor((r._date - soy) / 864e5), y: cum }; }),
            borderColor: colors[i % 4], backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0.2 };
    });
    charts['cum'] = new Chart(ctx, {
        type: 'line', data: { datasets: ds },
        options: { responsive: true, maintainAspectRatio: false,
            scales: { x: { type: 'linear', title: { display: true, text: 'День року', color: themeColor('--text3') },
                ticks: { callback: v => { const d = new Date(2024, 0, 1); d.setDate(d.getDate() + v); return d.getDate() + '.' + String(d.getMonth() + 1).padStart(2, '0'); }, maxTicksLimit: 12 }},
                y: { beginAtZero: true, ticks: { callback: v => v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3 | 0) + 'k' : v }}},
            plugins: { tooltip: { callbacks: { label: i => ` ${i.dataset.label}: ${fmt(i.parsed.y, 0)} м\u00B3` }}}
        }
    });
}

export function renderYoyChart() {
    kill('yoy');
    const canvas = freshCanvas('wrapYoy', 'cYoy');
    const ctx = canvas.getContext('2d');
    const yrs = [...new Set(allData.map(r => r._date.getFullYear()))].sort();
    const colors = [themeColor('--primary'), themeColor('--secondary'), themeColor('--amber'), themeColor('--rose')];
    const labels = MO.map(m => m.slice(0, 3));
    const ds = yrs.map((yr, i) => {
        const mt = new Array(12).fill(0);
        allData.filter(r => r._date.getFullYear() === yr && r.type === 'realized').forEach(r => mt[r._date.getMonth()] += r.value);
        return { label: '' + yr, data: mt, backgroundColor: colors[i % 4] + '66', borderColor: colors[i % 4], borderWidth: 1, borderRadius: 3, barPercentage: 0.8, categoryPercentage: 0.9 };
    });
    charts['yoy'] = new Chart(ctx, {
        type: 'bar', data: { labels, datasets: ds },
        options: { responsive: true, maintainAspectRatio: false,
            scales: { x: { type: 'category' }, y: { type: 'linear', beginAtZero: true, ticks: { callback: v => v >= 1000 ? (v/1000|0) + 'k' : v } } },
            plugins: { legend: { display: true }, tooltip: { callbacks: { label: i => ` ${i.dataset.label}: ${fmt(i.parsed.y, 0)} м\u00B3` } } }
        }
    });
}

export function renderWdChart() {
    kill('wd');
    const canvas = freshCanvas('wrapWd', 'cWd');
    const ctx = canvas.getContext('2d');
    const sums = Array(7).fill(0), cnt = Array(7).fill(0);
    filtered.filter(r => r.type === 'realized').forEach(r => { const d = r._date.getDay(); sums[d] += r.value; cnt[d]++; });
    const avg = sums.map((s, i) => cnt[i] ? s / cnt[i] : 0);
    const ord = [1, 2, 3, 4, 5, 6, 0];
    const vals = ord.map(i => avg[i]), labels = ord.map(i => WD[i]);
    const mx = vals.reduce((a, b) => a > b ? a : b, 0);
    const pc = themeColor('--primary'), rc = themeColor('--rose');
    const colors = vals.map(v => v === mx ? pc + 'B3' : v < mx * 0.15 ? rc + '66' : pc + '40');
    charts['wd'] = new Chart(ctx, {
        type: 'bar', data: { labels, datasets: [{ label: 'Середнє', data: vals, backgroundColor: colors, borderRadius: 6, barPercentage: 0.6 }]},
        options: { responsive: true, maintainAspectRatio: false,
            scales: { x: { type: 'category' }, y: { type: 'linear', beginAtZero: true, ticks: { callback: v => v >= 1000 ? (v/1000|0) + 'k' : v } } },
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: i => ` Середнє: ${fmt(i.parsed.y, 0)} м\u00B3` } } }
        }
    });
}

export function renderTable() {
    const data = allData.filter(r => r.type === tblTab).sort((a, b) => a._date - b._date);
    $('tblBody').innerHTML = buildTableRows(data, tblTab.startsWith('cash'));
}

export function buildTableRows(data, isGrn) {
    const mon = {};
    data.forEach(r => {
        const k = r.date.slice(0, 7);
        if (!mon[k]) mon[k] = { vals: [], total: 0, max: 0, work: 0 };
        mon[k].vals.push(r.value); mon[k].total += r.value;
        if (r.value > mon[k].max) mon[k].max = r.value;
        if (r.value > (isGrn ? 0 : 1000)) mon[k].work++;
    });
    const keys = Object.keys(mon).sort();
    return keys.map((k, i) => {
        const m = mon[k], avg = m.vals.length ? m.total / m.vals.length : 0;
        const prev = i > 0 ? mon[keys[i - 1]].total : 0;
        const ch = prev > 0 ? ((m.total - prev) / prev * 100) : 0;
        const [y, mo] = k.split('-');
        return `<tr><td>${MO[+mo - 1]} ${y}</td><td style="text-align:right;font-weight:500">${isGrn ? fmt(m.total / 1e3, 1) + ' тис' : fmt(m.total, 0)}</td><td style="text-align:right">${fmt(avg, 0)}</td><td style="text-align:right">${fmt(m.max, 0)}</td><td style="text-align:right">${m.work}/${m.vals.length}</td><td style="text-align:right">${i > 0 ? `<span class="badge ${ch >= 0 ? 'up' : 'down'}">${ch >= 0 ? '\u25B2' : '\u25BC'} ${Math.abs(ch).toFixed(1)}%</span>` : '—'}</td></tr>`;
    }).join('');
}
