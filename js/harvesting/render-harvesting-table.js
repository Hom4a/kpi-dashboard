// ===== Harvesting Dashboard Tables =====
import { $, fmt } from '../utils.js';
import { filteredPlanFact, filteredZsu } from './state-harvesting.js';

export function renderPlanFactTable() {
    const tbody = $('tblBodyPlanFact');
    if (!tbody) return;
    if (!filteredPlanFact.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text3)">Немає даних</td></tr>';
        return;
    }
    tbody.innerHTML = [...filteredPlanFact]
        .sort((a, b) => (b.harvested_total || 0) - (a.harvested_total || 0))
        .map(r => {
            const pct9 = r.pct_nine_month_total || (r.nine_month_plan_total > 0 ? r.harvested_total / r.nine_month_plan_total * 100 : 0);
            const pctA = r.pct_annual_total || (r.annual_plan_total > 0 ? r.harvested_total / r.annual_plan_total * 100 : 0);
            return `<tr>
            <td>${r.regional_office}</td>
            <td style="text-align:right">${fmt(r.annual_plan_total, 0)}</td>
            <td style="text-align:right">${fmt(r.nine_month_plan_total, 0)}</td>
            <td style="text-align:right;font-weight:500">${fmt(r.harvested_total, 0)}</td>
            <td style="text-align:right"><span class="badge ${pct9 >= 100 ? 'up' : 'down'}">${fmt(pct9, 1)}%</span></td>
            <td style="text-align:right"><span class="badge ${pctA >= 50 ? 'up' : 'down'}">${fmt(pctA, 1)}%</span></td>
        </tr>`;
        }).join('');
}

export function renderZsuTable() {
    const tbody = $('tblBodyZsu');
    if (!tbody) return;
    if (!filteredZsu.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text3)">Немає даних</td></tr>';
        return;
    }
    tbody.innerHTML = filteredZsu.map(r => `<tr>
        <td>${r.regional_office}</td>
        <td style="text-align:right">${fmt(r.forest_products_declared_m3, 0)}</td>
        <td style="text-align:right">${fmt(r.forest_products_shipped_m3, 0)}</td>
        <td style="text-align:right">${fmt(r.forest_products_value_uah / 1000, 1)} тис</td>
        <td style="text-align:right">${fmt(r.lumber_declared_m3, 0)}</td>
        <td style="text-align:right">${fmt(r.lumber_shipped_m3, 0)}</td>
        <td style="text-align:right">${fmt(r.lumber_value_uah / 1000, 1)} тис</td>
    </tr>`).join('');
}
