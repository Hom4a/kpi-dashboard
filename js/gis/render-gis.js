// ===== GIS Map Renderer =====
// Interactive Leaflet map showing oblast-level polygons colored by regional office
import { fmt } from '../utils.js';
import { pricesData, inventoryData } from '../forest/state-forest.js';
import { planFactData, zsuData } from '../harvesting/state-harvesting.js';
import { OFFICES_GEOJSON, getOblastsGeoJSON, getOfficeCenters, getBranchToOffice, fuzzyMatchBranch, getOfficeOblasts } from './gis-data.js';
import { regionalOffices, setGisMetrics } from './state-gis.js';
import { getRegionColor, renderLegend, renderRegionDetail } from './gis-controls.js';
import { renderGisSummary } from './gis-summary.js';

let _map = null;
let _oblastLayer = null;
let _loBordersLayer = null;
let _labelMarkers = [];
let _selectedOffice = null;

export function renderGisMap() {
    const container = document.getElementById('gisMap');
    if (!container) return;

    const metrics = buildRegionMetrics();
    setGisMetrics(metrics);

    // Initialize map once
    if (!_map) {
        if (typeof L === 'undefined') {
            container.innerHTML = '<p style="padding:40px;text-align:center;color:var(--text2)">Leaflet.js не завантажено</p>';
            return;
        }

        _map = L.map('gisMap', {
            center: [49.0, 31.5],
            zoom: 6,
            zoomControl: true,
            attributionControl: false,
            minZoom: 5,
            maxZoom: 10
        });

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 12,
            attribution: '&copy; OpenStreetMap'
        }).addTo(_map);
    }

    // Remove previous layers
    if (_oblastLayer) { _map.removeLayer(_oblastLayer); _oblastLayer = null; }
    if (_loBordersLayer) { _map.removeLayer(_loBordersLayer); _loBordersLayer = null; }
    _labelMarkers.forEach(m => _map.removeLayer(m));
    _labelMarkers = [];
    _selectedOffice = null;

    // Layer 1: Oblast polygons (colored by parent ЛО)
    const oblastsGeo = getOblastsGeoJSON();
    _oblastLayer = L.geoJSON(oblastsGeo, {
        style: (feature) => {
            const officeName = feature.properties.office;
            const m = officeName ? metrics[officeName] : null;
            const pct = m ? m.planPct : 0;
            return {
                fillColor: officeName ? getRegionColor(pct) : '#444',
                fillOpacity: 0.4,
                weight: 1,
                color: 'rgba(255,255,255,0.2)',
                dashArray: ''
            };
        },
        onEachFeature: (feature, layer) => {
            const oblastName = feature.properties.name;
            const officeName = feature.properties.office;
            const m = officeName ? metrics[officeName] : null;

            // Tooltip: oblast name + ЛО + metrics
            let tooltipHtml = `<b>${oblastName} обл.</b>`;
            if (officeName) {
                tooltipHtml += `<br><i style="color:var(--primary)">${officeName}</i>`;
                if (m) {
                    if (m.annualPlan > 0) tooltipHtml += `<br>План: ${m.planPct.toFixed(1)}%`;
                    if (m.harvested > 0) tooltipHtml += `<br>Заготовлено: ${fmt(m.harvested / 1000, 1)} тис.м\u00B3`;
                    if (m.avgPrice > 0) tooltipHtml += `<br>Сер. ціна: ${fmt(m.avgPrice, 0)} грн/м\u00B3`;
                    if (m.inventory > 0) tooltipHtml += `<br>Залишки: ${fmt(m.inventory / 1000, 1)} тис.м\u00B3`;
                    if (m.zsuDeclared > 0) tooltipHtml += `<br>ЗСУ: ${m.zsuPct.toFixed(0)}%`;
                }
            } else {
                tooltipHtml += `<br><i style="color:var(--text3)">Не призначено ЛО</i>`;
            }

            layer.bindTooltip(tooltipHtml, { sticky: true, className: 'gis-tooltip' });

            // Click → drill-down for parent ЛО
            layer.on('click', () => {
                if (!officeName || !m) return;

                _selectedOffice = officeName;

                // Show detail
                const placeholder = document.getElementById('gisRegionPlaceholder');
                if (placeholder) placeholder.style.display = 'none';
                renderRegionDetail('gisRegionDetail', m);

                // Highlight all oblasts of this ЛО
                _oblastLayer.eachLayer(l => {
                    if (l.feature.properties.office === officeName) {
                        l.setStyle({ weight: 2, color: '#4A9D6F', fillOpacity: 0.65 });
                    } else {
                        _oblastLayer.resetStyle(l);
                    }
                });
            });

            layer.on('mouseover', () => {
                if (_selectedOffice !== officeName) {
                    layer.setStyle({ fillOpacity: 0.6, weight: 1.5 });
                }
            });
            layer.on('mouseout', () => {
                if (_selectedOffice !== officeName) {
                    _oblastLayer.resetStyle(layer);
                }
            });
        }
    }).addTo(_map);

    // Layer 2: ЛО borders overlay (thicker borders between regional offices)
    _loBordersLayer = L.geoJSON(OFFICES_GEOJSON, {
        style: {
            fill: false,
            weight: 2.5,
            color: 'rgba(255,255,255,0.45)',
            dashArray: '',
            interactive: false
        },
        interactive: false
    }).addTo(_map);

    // Layer 3: Office labels
    const officeCenters = getOfficeCenters();
    for (const [name, center] of Object.entries(officeCenters)) {
        const m = metrics[name];
        const pct = m && m.annualPlan > 0 ? m.planPct.toFixed(0) + '%' : '\u2014';
        const marker = L.marker(center, {
            icon: L.divIcon({
                className: 'gis-label',
                html: `<div style="text-align:center;color:#fff;font-size:11px;font-weight:600;text-shadow:0 1px 3px rgba(0,0,0,0.8)">${name.replace(' ЛО', '')}<br><span style="font-size:14px">${pct}</span></div>`,
                iconSize: [100, 30],
                iconAnchor: [50, 15]
            }),
            interactive: false
        }).addTo(_map);
        _labelMarkers.push(marker);
    }

    renderLegend('gisLegend');
    renderGisSummary(metrics);

    setTimeout(() => { if (_map) _map.invalidateSize(); }, 200);
}

function buildRegionMetrics() {
    const metrics = {};
    const branchMap = getBranchToOffice();

    // Initialize all known offices
    const offices = regionalOffices.length
        ? regionalOffices
        : OFFICES_GEOJSON.features.map(f => ({ name: f.properties.name }));

    for (const office of offices) {
        metrics[office.name] = {
            name: office.name,
            oblasts: getOfficeOblasts(office.name),
            planPct: 0, harvested: 0, annualPlan: 0, ninePlan: 0,
            zsuPct: 0, zsuDeclared: 0, zsuShipped: 0,
            avgPrice: 0, totalVolume: 0, totalValue: 0,
            inventory: 0,
            priceRecords: 0, inventoryRecords: 0
        };
    }

    // Harvesting plan-fact
    planFactData.forEach(r => {
        const name = r.regional_office;
        if (!name || !metrics[name]) return;
        metrics[name].annualPlan += (r.annual_plan_total || 0);
        metrics[name].harvested += (r.harvested_total || 0);
        metrics[name].ninePlan += (r.nine_month_plan_total || 0);
    });
    for (const m of Object.values(metrics)) {
        m.planPct = m.annualPlan > 0 ? (m.harvested / m.annualPlan) * 100 : 0;
    }

    // ZSU data
    zsuData.forEach(r => {
        const name = r.regional_office;
        if (!name || !metrics[name]) return;
        const declared = (r.forest_products_declared_m3 || 0) + (r.lumber_declared_m3 || 0);
        const shipped = (r.forest_products_shipped_m3 || 0) + (r.lumber_shipped_m3 || 0);
        metrics[name].zsuDeclared += declared;
        metrics[name].zsuShipped += shipped;
    });
    for (const m of Object.values(metrics)) {
        m.zsuPct = m.zsuDeclared > 0 ? (m.zsuShipped / m.zsuDeclared) * 100 : 0;
    }

    // Forest prices — map branch → office
    pricesData.forEach(r => {
        const office = branchMap[r.branch] || fuzzyMatchBranch(r.branch);
        if (!office || !metrics[office]) return;
        metrics[office].totalVolume += (r.volume_m3 || 0);
        metrics[office].totalValue += (r.total_value_uah || 0);
        metrics[office].priceRecords++;
    });
    for (const m of Object.values(metrics)) {
        m.avgPrice = m.totalVolume > 0 ? m.totalValue / m.totalVolume : 0;
    }

    // Forest inventory — map branch → office
    inventoryData.forEach(r => {
        const office = branchMap[r.branch] || fuzzyMatchBranch(r.branch);
        if (!office || !metrics[office]) return;
        metrics[office].inventory += (r.remaining_volume_m3 || 0);
        metrics[office].inventoryRecords++;
    });

    return metrics;
}

export function resetGisMap() {
    if (_map) {
        _map.remove();
        _map = null;
        _oblastLayer = null;
        _loBordersLayer = null;
        _labelMarkers = [];
        _selectedOffice = null;
    }
}
