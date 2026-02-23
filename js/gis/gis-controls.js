// ===== GIS Map Controls: Legend, Colors, Region Details =====
import { fmt } from '../utils.js';

export function getRegionColor(pctPlan) {
    if (pctPlan >= 90) return '#22c55e';
    if (pctPlan >= 70) return '#fbbf24';
    return '#fb7185';
}

export function renderLegend(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = `
        <div style="display:flex;gap:12px;align-items:center;font-size:11px;color:var(--text2)">
            <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#22c55e;margin-right:4px;vertical-align:middle"></span>&gt;90%</span>
            <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#fbbf24;margin-right:4px;vertical-align:middle"></span>70-90%</span>
            <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#fb7185;margin-right:4px;vertical-align:middle"></span>&lt;70%</span>
        </div>
    `;
}

export function renderRegionDetail(containerId, regionData) {
    const el = document.getElementById(containerId);
    if (!el) return;

    if (!regionData) {
        el.innerHTML = '<p style="color:var(--text2)">Натисніть на регіон для перегляду деталей</p>';
        return;
    }

    el.innerHTML = `
        <div style="margin-bottom:12px;font-size:15px;font-weight:700;color:var(--text1)">${regionData.name}</div>
        <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
            <div class="glass kpi-card neon-primary">
                <div class="kpi-label">Виконання плану</div>
                <div class="kpi-value">${regionData.planPct.toFixed(1)}<span class="kpi-unit">%</span></div>
            </div>
            <div class="glass kpi-card neon-secondary">
                <div class="kpi-label">Заготовлено</div>
                <div class="kpi-value">${fmt(regionData.harvested / 1000, 1)}<span class="kpi-unit">тис.м³</span></div>
            </div>
            <div class="glass kpi-card neon-amber">
                <div class="kpi-label">Річний план</div>
                <div class="kpi-value">${fmt(regionData.annualPlan / 1000, 1)}<span class="kpi-unit">тис.м³</span></div>
            </div>
            <div class="glass kpi-card neon-rose">
                <div class="kpi-label">ЗСУ виконання</div>
                <div class="kpi-value">${regionData.zsuPct.toFixed(0)}<span class="kpi-unit">%</span></div>
            </div>
        </div>
    `;
}
