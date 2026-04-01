// ===== Lazy Library Loader =====
// Loads CDN libraries on demand instead of blocking page load

const _loaded = {};

function loadScript(name, url) {
    if (_loaded[name]) return _loaded[name];
    if (name === 'xlsx' && typeof XLSX !== 'undefined') return Promise.resolve();
    if (name === 'jspdf' && typeof jspdf !== 'undefined') return Promise.resolve();
    if (name === 'html2canvas' && typeof html2canvas !== 'undefined') return Promise.resolve();
    if (name === 'leaflet' && typeof L !== 'undefined') return Promise.resolve();
    if (name === 'gridstack' && typeof GridStack !== 'undefined') return Promise.resolve();

    _loaded[name] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = url;
        s.onload = resolve;
        s.onerror = () => reject(new Error(`Failed to load ${name}`));
        document.head.appendChild(s);
    });
    return _loaded[name];
}

export const loadXLSX = () => loadScript('xlsx', 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
export const loadJsPDF = () => loadScript('jspdf', 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js');
export const loadHtml2Canvas = () => loadScript('html2canvas', 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
export const loadLeaflet = () => loadScript('leaflet', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
export const loadGridStack = () => loadScript('gridstack', 'https://cdn.jsdelivr.net/npm/gridstack@10/dist/gridstack-all.js');
