// ===== Forest Dashboard Charts =====
import { themeColor, fmt } from '../utils.js';
import { kill, freshCanvas, makeGrad } from '../charts-common.js';
import { charts } from '../state.js';
import { filteredPrices, filteredInventory } from './state-forest.js';

function aggregateBy(data, key, valueKey) {
    const map = {};
    data.forEach(r => {
        const k = r[key] || 'Інше';
        if (!map[k]) map[k] = 0;
        map[k] += r[valueKey] || 0;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

function avgPriceBy(data, key) {
    const map = {};
    data.forEach(r => {
        const k = r[key] || 'Інше';
        if (!map[k]) map[k] = { vol: 0, val: 0 };
        map[k].vol += r.volume_m3 || 0;
        map[k].val += r.total_value_uah || 0;
    });
    return Object.entries(map).map(([k, d]) => [k, d.vol > 0 ? d.val / d.vol : 0]).sort((a, b) => b[1] - a[1]);
}

const COLORS = ['#4A9D6F', '#9CAF88', '#D4A574', '#fbbf24', '#22c55e', '#fb7185', '#60a5fa', '#a78bfa', '#f472b6', '#34d399', '#f97316', '#06b6d4'];

// 1. Prices by Product (horizontal bar)
export function renderPricesByProduct() {
    if (!filteredPrices.length) return;
    kill('pricesByProduct');
    const canvas = freshCanvas('wrapPricesByProduct', 'cPricesByProduct');
    const ctx = canvas.getContext('2d');
    const data = avgPriceBy(filteredPrices, 'product');
    const labels = data.map(d => d[0]);
    const vals = data.map(d => d[1]);
    charts['pricesByProduct'] = new Chart(ctx, {
        type: 'bar', data: { labels, datasets: [{ label: 'Ціна грн/м\u00B3', data: vals, backgroundColor: COLORS.slice(0, labels.length).map(c => c + '80'), borderRadius: 4, barPercentage: 0.7 }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            scales: { x: { beginAtZero: true, ticks: { callback: v => fmt(v, 0) } } },
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: i => ` ${fmt(i.parsed.x, 0)} грн/м\u00B3` } } }
        }
    });
}

// 2. Prices by Species Top-10 (horizontal bar)
export function renderPricesBySpecies() {
    if (!filteredPrices.length) return;
    kill('pricesBySpecies');
    const canvas = freshCanvas('wrapPricesBySpecies', 'cPricesBySpecies');
    const ctx = canvas.getContext('2d');
    const data = avgPriceBy(filteredPrices, 'species').slice(0, 10);
    const labels = data.map(d => d[0]);
    const vals = data.map(d => d[1]);
    const pc = themeColor('--primary');
    charts['pricesBySpecies'] = new Chart(ctx, {
        type: 'bar', data: { labels, datasets: [{ label: 'Ціна грн/м\u00B3', data: vals, backgroundColor: pc + '80', borderRadius: 4, barPercentage: 0.7 }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            scales: { x: { beginAtZero: true, ticks: { callback: v => fmt(v, 0) } } },
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: i => ` ${fmt(i.parsed.x, 0)} грн/м\u00B3` } } }
        }
    });
}

// 3. Prices by Region (bar)
export function renderPricesByRegion() {
    if (!filteredPrices.length) return;
    kill('pricesByRegion');
    const canvas = freshCanvas('wrapPricesByRegion', 'cPricesByRegion');
    const ctx = canvas.getContext('2d');
    const data = aggregateBy(filteredPrices, 'region', 'total_value_uah').slice(0, 15);
    const labels = data.map(d => d[0]);
    const vals = data.map(d => d[1]);
    const pc = themeColor('--secondary');
    charts['pricesByRegion'] = new Chart(ctx, {
        type: 'bar', data: { labels, datasets: [{ label: 'Вартість', data: vals, backgroundColor: pc + '80', borderRadius: 4, barPercentage: 0.7 }] },
        options: { responsive: true, maintainAspectRatio: false,
            scales: { x: { ticks: { maxRotation: 45 } }, y: { beginAtZero: true, ticks: { callback: v => v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3 | 0) + 'k' : v } } },
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: i => ` ${fmt(i.parsed.y, 0)} грн` } } }
        }
    });
}

// 4. Volumes by Warehouse (doughnut)
export function renderVolumesByWarehouse() {
    if (!filteredPrices.length) return;
    kill('volumesByWarehouse');
    const canvas = freshCanvas('wrapVolumesByWarehouse', 'cVolumesByWarehouse');
    const ctx = canvas.getContext('2d');
    const data = aggregateBy(filteredPrices, 'warehouse', 'volume_m3').slice(0, 10);
    const labels = data.map(d => d[0]);
    const vals = data.map(d => d[1]);
    charts['volumesByWarehouse'] = new Chart(ctx, {
        type: 'doughnut', data: { labels, datasets: [{ data: vals, backgroundColor: COLORS.slice(0, labels.length), borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '55%',
            plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 } } }, tooltip: { callbacks: { label: i => ` ${i.label}: ${fmt(i.parsed, 1)} м\u00B3` } } }
        }
    });
}

// 5. Inventory by Branch (horizontal bar)
export function renderInventoryByBranch() {
    if (!filteredInventory.length) return;
    kill('invByBranch');
    const canvas = freshCanvas('wrapInvByBranch', 'cInvByBranch');
    const ctx = canvas.getContext('2d');
    const data = aggregateBy(filteredInventory, 'branch', 'remaining_volume_m3').slice(0, 15);
    const labels = data.map(d => d[0]);
    const vals = data.map(d => d[1]);
    const pc = themeColor('--primary');
    charts['invByBranch'] = new Chart(ctx, {
        type: 'bar', data: { labels, datasets: [{ label: 'Залишки м\u00B3', data: vals, backgroundColor: pc + '80', borderRadius: 4, barPercentage: 0.7 }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            scales: { x: { beginAtZero: true, ticks: { callback: v => v >= 1000 ? (v / 1000 | 0) + 'k' : v } } },
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: i => ` ${fmt(i.parsed.x, 1)} м\u00B3` } } }
        }
    });
}

// 6. Inventory by Product (doughnut)
export function renderInventoryByProduct() {
    if (!filteredInventory.length) return;
    kill('invByProduct');
    const canvas = freshCanvas('wrapInvByProduct', 'cInvByProduct');
    const ctx = canvas.getContext('2d');
    const data = aggregateBy(filteredInventory, 'product', 'remaining_volume_m3').slice(0, 10);
    const labels = data.map(d => d[0]);
    const vals = data.map(d => d[1]);
    charts['invByProduct'] = new Chart(ctx, {
        type: 'doughnut', data: { labels, datasets: [{ data: vals, backgroundColor: COLORS.slice(0, labels.length), borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '55%',
            plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 } } }, tooltip: { callbacks: { label: i => ` ${i.label}: ${fmt(i.parsed, 1)} м\u00B3` } } }
        }
    });
}

// 7. Inventory by Species Top-10 (bar)
export function renderInventoryBySpecies() {
    if (!filteredInventory.length) return;
    kill('invBySpecies');
    const canvas = freshCanvas('wrapInvBySpecies', 'cInvBySpecies');
    const ctx = canvas.getContext('2d');
    const data = aggregateBy(filteredInventory, 'species', 'remaining_volume_m3').slice(0, 10);
    const labels = data.map(d => d[0]);
    const vals = data.map(d => d[1]);
    const pc = themeColor('--accent');
    charts['invBySpecies'] = new Chart(ctx, {
        type: 'bar', data: { labels, datasets: [{ label: 'Залишки м\u00B3', data: vals, backgroundColor: pc + '80', borderRadius: 4, barPercentage: 0.7 }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            scales: { x: { beginAtZero: true, ticks: { callback: v => v >= 1000 ? (v / 1000 | 0) + 'k' : v } } },
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: i => ` ${fmt(i.parsed.x, 1)} м\u00B3` } } }
        }
    });
}

// 8. Inventory by Wood Group (pie)
export function renderInventoryByWoodGroup() {
    if (!filteredInventory.length) return;
    kill('invByWoodGroup');
    const canvas = freshCanvas('wrapInvByWoodGroup', 'cInvByWoodGroup');
    const ctx = canvas.getContext('2d');
    const data = aggregateBy(filteredInventory, 'wood_group', 'remaining_volume_m3');
    const labels = data.map(d => d[0]);
    const vals = data.map(d => d[1]);
    charts['invByWoodGroup'] = new Chart(ctx, {
        type: 'pie', data: { labels, datasets: [{ data: vals, backgroundColor: COLORS.slice(0, labels.length), borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 } } }, tooltip: { callbacks: { label: i => ` ${i.label}: ${fmt(i.parsed, 1)} м\u00B3` } } }
        }
    });
}
