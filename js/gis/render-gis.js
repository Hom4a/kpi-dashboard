// ===== GIS Map Renderer =====
// Interactive Leaflet map showing harvesting plan execution by regional office
import { fmt } from '../utils.js';
import { planFactData, zsuData } from '../harvesting/state-harvesting.js';
import { OFFICES_GEOJSON, OFFICE_CENTERS } from './gis-data.js';
import { getRegionColor, renderLegend, renderRegionDetail } from './gis-controls.js';

let _map = null;
let _geoLayer = null;
let _initialized = false;

export function renderGisMap() {
    const container = document.getElementById('gisMap');
    if (!container) return;

    // Build metrics from harvesting state
    const metrics = buildRegionMetrics();

    // Initialize map once
    if (!_map) {
        // Check if Leaflet is loaded
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

        // Dark tile layer matching dashboard theme
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 12,
            attribution: '&copy; OpenStreetMap'
        }).addTo(_map);

        _initialized = true;
    }

    // Remove previous layer
    if (_geoLayer) {
        _map.removeLayer(_geoLayer);
        _geoLayer = null;
    }

    // Add GeoJSON layer
    _geoLayer = L.geoJSON(OFFICES_GEOJSON, {
        style: (feature) => {
            const name = feature.properties.name;
            const m = metrics[name];
            const pct = m ? m.planPct : 0;
            return {
                fillColor: getRegionColor(pct),
                fillOpacity: 0.45,
                weight: 1.5,
                color: 'rgba(255,255,255,0.4)',
                dashArray: ''
            };
        },
        onEachFeature: (feature, layer) => {
            const name = feature.properties.name;
            const m = metrics[name];

            // Tooltip
            const tooltipHtml = m
                ? `<b>${name}</b><br>План: ${m.planPct.toFixed(1)}%<br>Заготовлено: ${fmt(m.harvested / 1000, 1)} тис.м³`
                : `<b>${name}</b><br>Немає даних`;

            layer.bindTooltip(tooltipHtml, {
                sticky: true,
                className: 'gis-tooltip'
            });

            // Click → details
            layer.on('click', () => {
                renderRegionDetail('gisRegionDetail', m);
                if (_geoLayer) _geoLayer.resetStyle();
                layer.setStyle({ weight: 3, color: '#4A9D6F', fillOpacity: 0.7 });
            });

            // Hover
            layer.on('mouseover', () => {
                layer.setStyle({ fillOpacity: 0.7, weight: 2 });
            });
            layer.on('mouseout', () => {
                if (_geoLayer) _geoLayer.resetStyle(layer);
            });
        }
    }).addTo(_map);

    // Add office labels
    for (const [name, center] of Object.entries(OFFICE_CENTERS)) {
        const m = metrics[name];
        const pct = m ? m.planPct.toFixed(0) + '%' : '—';
        L.marker(center, {
            icon: L.divIcon({
                className: 'gis-label',
                html: `<div style="text-align:center;color:#fff;font-size:11px;font-weight:600;text-shadow:0 1px 3px rgba(0,0,0,0.8)">${name.replace(' ЛО', '')}<br><span style="font-size:14px">${pct}</span></div>`,
                iconSize: [100, 30],
                iconAnchor: [50, 15]
            })
        }).addTo(_map);
    }

    renderLegend('gisLegend');

    // Fix map size when container becomes visible
    setTimeout(() => {
        if (_map) _map.invalidateSize();
    }, 200);
}

function buildRegionMetrics() {
    const metrics = {};

    // Plan-Fact data
    planFactData.forEach(r => {
        const name = r.regional_office;
        if (!name) return;
        if (!metrics[name]) {
            metrics[name] = {
                name,
                planPct: 0,
                harvested: 0,
                annualPlan: 0,
                ninePlan: 0,
                zsuPct: 0
            };
        }
        metrics[name].annualPlan += (r.annual_plan_total || 0);
        metrics[name].harvested += (r.harvested_total || 0);
        metrics[name].ninePlan += (r.nine_month_plan_total || 0);
    });

    // Calculate plan %
    for (const m of Object.values(metrics)) {
        m.planPct = m.annualPlan > 0 ? (m.harvested / m.annualPlan) * 100 : 0;
    }

    // ZSU data
    zsuData.forEach(r => {
        const name = r.regional_office;
        if (!name) return;
        if (!metrics[name]) {
            metrics[name] = { name, planPct: 0, harvested: 0, annualPlan: 0, ninePlan: 0, zsuPct: 0 };
        }
        const declared = (r.forest_products_declared_m3 || 0) + (r.lumber_declared_m3 || 0);
        const shipped = (r.forest_products_shipped_m3 || 0) + (r.lumber_shipped_m3 || 0);
        metrics[name].zsuPct = declared > 0 ? (shipped / declared) * 100 : 0;
    });

    return metrics;
}

export function resetGisMap() {
    _initialized = false;
    if (_map) {
        _map.remove();
        _map = null;
        _geoLayer = null;
    }
}
