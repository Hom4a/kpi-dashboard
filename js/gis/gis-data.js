// ===== GIS Data: Regional Office Boundaries & Dynamic Mapping =====
// GeoJSON polygons are static (geographic boundaries).
// Office→oblast mapping is loaded from DB via state-gis.js.
// Fallback constants are used when DB table is not yet created.

import { regionalOffices } from './state-gis.js';

// ===== Fallback constants (used when DB not available) =====
export const FALLBACK_OFFICES = {
    'Карпатська ЛО': { oblasts: ['Закарпатська', 'Івано-Франківська', 'Чернівецька', 'Львівська'], lat: 48.9, lng: 24.0 },
    'Південна ЛО': { oblasts: ['Одеська', 'Миколаївська', 'Херсонська'], lat: 47.0, lng: 32.5 },
    'Північна ЛО': { oblasts: ['Чернігівська'], lat: 51.5, lng: 31.3 },
    'Подільська ЛО': { oblasts: ['Вінницька', 'Хмельницька', 'Тернопільська'], lat: 49.2, lng: 27.5 },
    'Поліська ЛО': { oblasts: ['Волинська', 'Рівненська', 'Житомирська'], lat: 51.0, lng: 26.5 },
    'Слобожанська ЛО': { oblasts: ['Харківська', 'Сумська'], lat: 50.5, lng: 35.5 },
    'Столична ЛО': { oblasts: ['Київська'], lat: 50.4, lng: 30.5 },
    'Центральна ЛО': { oblasts: ['Черкаська', 'Кіровоградська', 'Полтавська'], lat: 49.0, lng: 33.0 },
    'Східна ЛО': { oblasts: ['Дніпропетровська', 'Запорізька', 'Донецька', 'Луганська'], lat: 48.0, lng: 36.0 }
};

// ===== Dynamic getters (read from state, fallback to constants) =====

/** Map of office name → [lat, lng] for label placement */
export function getOfficeCenters() {
    if (regionalOffices.length) {
        const map = {};
        for (const o of regionalOffices) {
            if (o.center_lat && o.center_lng) map[o.name] = [o.center_lat, o.center_lng];
        }
        return map;
    }
    // Fallback
    const map = {};
    for (const [name, d] of Object.entries(FALLBACK_OFFICES)) map[name] = [d.lat, d.lng];
    return map;
}

/** Map of oblast name → office name */
export function getOblastToOffice() {
    const map = {};
    if (regionalOffices.length) {
        for (const o of regionalOffices) {
            for (const ob of (o.oblasts || [])) map[ob] = o.name;
        }
    } else {
        for (const [name, d] of Object.entries(FALLBACK_OFFICES)) {
            for (const ob of d.oblasts) map[ob] = name;
        }
    }
    return map;
}

/** Map of branch name or alias → office name (for forest data matching) */
export function getBranchToOffice() {
    const map = {};
    if (regionalOffices.length) {
        for (const o of regionalOffices) {
            map[o.name] = o.name;
            for (const alias of (o.branch_aliases || [])) map[alias] = o.name;
        }
    } else {
        for (const name of Object.keys(FALLBACK_OFFICES)) map[name] = name;
    }
    return map;
}

/** Fuzzy match: strip ОУЛ/ЛО suffixes and compare stems */
export function fuzzyMatchBranch(branchName) {
    if (!branchName) return null;
    const branchMap = getBranchToOffice();
    if (branchMap[branchName]) return branchMap[branchName];
    const norm = branchName.replace(/\s*(ОУЛ|ЛО|обласне управління лісами)\s*$/i, '').trim().toLowerCase();
    for (const [alias, office] of Object.entries(branchMap)) {
        const normAlias = alias.replace(/\s*(ОУЛ|ЛО|обласне управління лісами)\s*$/i, '').trim().toLowerCase();
        if (normAlias === norm) return office;
        // Partial stem match (Поліськ → Поліська)
        if (norm.length > 3 && normAlias.length > 3) {
            const stem = norm.substring(0, Math.min(norm.length, normAlias.length) - 1);
            if (normAlias.startsWith(stem) || norm.startsWith(normAlias.substring(0, normAlias.length - 1))) return office;
        }
    }
    return null;
}

/** Get all oblasts for a given office name */
export function getOfficeOblasts(officeName) {
    if (regionalOffices.length) {
        const o = regionalOffices.find(r => r.name === officeName);
        return o ? (o.oblasts || []) : [];
    }
    return FALLBACK_OFFICES[officeName]?.oblasts || [];
}

// ===== Static GeoJSON — 9 regional office polygons =====
export const OFFICES_GEOJSON = {
    type: 'FeatureCollection',
    features: [
        {
            type: 'Feature',
            properties: { name: 'Карпатська ЛО' },
            geometry: {
                type: 'Polygon',
                coordinates: [[[22.15,48.1],[22.15,49.0],[22.5,49.6],[23.2,50.4],[24.0,50.2],[25.0,49.9],[25.5,49.4],[25.8,48.8],[26.0,48.1],[25.3,47.9],[24.5,47.7],[23.5,47.9],[22.15,48.1]]]
            }
        },
        {
            type: 'Feature',
            properties: { name: 'Подільська ЛО' },
            geometry: {
                type: 'Polygon',
                coordinates: [[[25.0,49.9],[25.5,50.4],[26.5,50.5],[27.5,50.8],[28.5,50.6],[29.0,50.0],[29.0,49.2],[28.5,48.4],[27.0,48.2],[26.0,48.1],[25.8,48.8],[25.5,49.4],[25.0,49.9]]]
            }
        },
        {
            type: 'Feature',
            properties: { name: 'Поліська ЛО' },
            geometry: {
                type: 'Polygon',
                coordinates: [[[23.6,50.5],[24.0,51.6],[25.5,51.9],[27.0,51.9],[28.5,51.8],[29.5,51.5],[30.0,51.0],[29.5,50.5],[28.5,50.6],[27.5,50.8],[26.5,50.5],[25.5,50.4],[24.0,50.2],[23.6,50.5]]]
            }
        },
        {
            type: 'Feature',
            properties: { name: 'Столична ЛО' },
            geometry: {
                type: 'Polygon',
                coordinates: [[[29.5,50.5],[30.0,51.0],[31.0,51.5],[32.0,51.3],[32.5,50.8],[32.0,50.0],[31.0,49.6],[30.0,49.8],[29.0,50.0],[29.5,50.5]]]
            }
        },
        {
            type: 'Feature',
            properties: { name: 'Північна ЛО' },
            geometry: {
                type: 'Polygon',
                coordinates: [[[31.0,51.5],[31.5,52.3],[32.5,52.4],[33.5,52.3],[34.5,52.0],[34.0,51.2],[33.5,50.8],[32.5,50.8],[32.0,51.3],[31.0,51.5]]]
            }
        },
        {
            type: 'Feature',
            properties: { name: 'Слобожанська ЛО' },
            geometry: {
                type: 'Polygon',
                coordinates: [[[34.0,51.2],[34.5,52.0],[35.5,52.0],[37.0,51.5],[38.0,51.0],[38.5,50.5],[38.0,49.5],[37.0,49.0],[36.0,49.2],[35.0,49.8],[34.0,50.2],[33.5,50.8],[34.0,51.2]]]
            }
        },
        {
            type: 'Feature',
            properties: { name: 'Центральна ЛО' },
            geometry: {
                type: 'Polygon',
                coordinates: [[[31.0,49.6],[32.0,50.0],[33.5,50.8],[34.0,50.2],[35.0,49.8],[35.5,49.0],[35.0,48.2],[34.0,48.0],[33.0,48.0],[32.0,48.3],[31.0,48.8],[30.0,49.0],[29.0,49.2],[29.0,50.0],[30.0,49.8],[31.0,49.6]]]
            }
        },
        {
            type: 'Feature',
            properties: { name: 'Південна ЛО' },
            geometry: {
                type: 'Polygon',
                coordinates: [[[29.0,47.0],[28.5,47.5],[28.5,48.4],[29.0,49.2],[30.0,49.0],[31.0,48.8],[32.0,48.3],[33.0,48.0],[34.0,48.0],[34.5,47.5],[34.0,46.5],[33.0,46.0],[31.5,46.2],[30.0,46.5],[29.0,47.0]]]
            }
        },
        {
            type: 'Feature',
            properties: { name: 'Східна ЛО' },
            geometry: {
                type: 'Polygon',
                coordinates: [[[35.0,48.2],[35.5,49.0],[36.0,49.2],[37.0,49.0],[38.0,49.5],[38.5,49.0],[39.5,48.5],[39.5,47.5],[38.5,47.0],[37.5,46.8],[36.5,47.0],[35.5,47.5],[34.5,47.5],[34.0,48.0],[35.0,48.2]]]
            }
        }
    ]
};
