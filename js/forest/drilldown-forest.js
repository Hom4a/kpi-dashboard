// ===== Forest Drilldown: Geographic Hierarchy =====
import { $, fmt, themeColor } from '../utils.js';
import { kill, freshCanvas } from '../charts-common.js';
import { charts } from '../state.js';
import { filteredPrices, filteredInventory } from './state-forest.js';

export function showForestDrillDown(level, filterValue, dataType) {
    const modal = $('drillModal');
    modal.classList.add('on');

    const data = dataType === 'prices' ? filteredPrices : filteredInventory;
    const valueKey = dataType === 'prices' ? 'volume_m3' : 'remaining_volume_m3';
    let filtered, groupKey, title;

    if (level === 'branch') {
        filtered = data.filter(r => r.branch === filterValue);
        groupKey = 'region';
        title = `${filterValue} — по областях`;
    } else if (level === 'region') {
        filtered = data.filter(r => r.region === filterValue);
        groupKey = 'forest_unit';
        title = `${filterValue} — по надлісництвах`;
    } else if (level === 'forest_unit') {
        filtered = data.filter(r => r.forest_unit === filterValue);
        groupKey = 'forestry_div';
        title = `${filterValue} — по лісництвах`;
    } else {
        return;
    }

    $('drillTitle').textContent = title;
    kill('drill');
    const canvas = freshCanvas('wrapDrill', 'cDrill');
    const ctx = canvas.getContext('2d');

    const groups = {};
    filtered.forEach(r => {
        const key = r[groupKey] || 'Інше';
        groups[key] = (groups[key] || 0) + r[valueKey];
    });

    const sorted = Object.entries(groups).sort((a, b) => b[1] - a[1]);
    const labels = sorted.map(d => d[0]);
    const vals = sorted.map(d => d[1]);
    const pc = themeColor('--primary');

    charts['drill'] = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: dataType === 'prices' ? 'Обсяг м\u00B3' : 'Залишок м\u00B3', data: vals, backgroundColor: pc + '80', borderRadius: 4, barPercentage: 0.7 }] },
        options: { indexAxis: labels.length > 8 ? 'y' : 'x', responsive: true, maintainAspectRatio: false,
            scales: labels.length > 8
                ? { x: { beginAtZero: true, ticks: { callback: v => v >= 1000 ? (v / 1000 | 0) + 'k' : v } } }
                : { x: { ticks: { maxRotation: 45 } }, y: { beginAtZero: true, ticks: { callback: v => v >= 1000 ? (v / 1000 | 0) + 'k' : v } } },
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: i => ` ${fmt(labels.length > 8 ? i.parsed.x : i.parsed.y, 1)} м\u00B3` } } }
        }
    });
}
