// ===== Forest Dashboard Tables =====
import { $, fmt } from '../utils.js';
import { filteredPrices, filteredInventory } from './state-forest.js';

let pricesGroupBy = 'product';
let inventoryGroupBy = 'branch';

export function setPricesGroupBy(v) { pricesGroupBy = v; }
export function setInventoryGroupBy(v) { inventoryGroupBy = v; }
export function getPricesGroupBy() { return pricesGroupBy; }
export function getInventoryGroupBy() { return inventoryGroupBy; }

export function renderPricesTable() {
    const tbody = $('tblBodyPrices');
    if (!tbody) return;
    if (!filteredPrices.length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text3)">Немає даних</td></tr>'; return; }

    const groups = {};
    filteredPrices.forEach(r => {
        const key = r[pricesGroupBy] || 'Інше';
        if (!groups[key]) groups[key] = { vol: 0, val: 0, count: 0 };
        groups[key].vol += r.volume_m3;
        groups[key].val += r.total_value_uah;
        groups[key].count++;
    });

    const sorted = Object.entries(groups).sort((a, b) => b[1].val - a[1].val);
    tbody.innerHTML = sorted.map(([name, d]) => {
        const avgP = d.vol > 0 ? d.val / d.vol : 0;
        return `<tr>
            <td>${name}</td>
            <td style="text-align:right">${fmt(d.vol, 1)}</td>
            <td style="text-align:right">${fmt(avgP, 0)}</td>
            <td style="text-align:right">${fmt(d.val / 1000, 1)} тис</td>
            <td style="text-align:right">${d.count}</td>
        </tr>`;
    }).join('');
}

export function renderInventoryTable() {
    const tbody = $('tblBodyInventory');
    if (!tbody) return;
    if (!filteredInventory.length) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text3)">Немає даних</td></tr>'; return; }

    const groups = {};
    filteredInventory.forEach(r => {
        const key = r[inventoryGroupBy] || 'Інше';
        if (!groups[key]) groups[key] = { vol: 0, count: 0 };
        groups[key].vol += r.remaining_volume_m3;
        groups[key].count++;
    });

    const sorted = Object.entries(groups).sort((a, b) => b[1].vol - a[1].vol);
    tbody.innerHTML = sorted.map(([name, d]) => {
        return `<tr>
            <td>${name}</td>
            <td style="text-align:right">${fmt(d.vol, 1)}</td>
            <td style="text-align:right">${d.count}</td>
            <td style="text-align:right">${fmt(d.vol / d.count, 1)}</td>
        </tr>`;
    }).join('');
}
