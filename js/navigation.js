// ===== Page Navigation =====
import { $, toast } from './utils.js';
import { charts, currentProfile } from './state.js';
import { getVisiblePages, UPLOAD_ROLES } from './auth.js';

const pageMap = {
    volumes: 'pageVolumes',
    finance: 'pageFinance',
    forest: 'pageForest',
    harvesting: 'pageHarvesting',
    market: 'pageMarket',
    executive: 'pageExecutive',
    summary: 'pageSummary',
    'data-entry': 'pageDataEntry',
    builder: 'pageBuilder',
    'api-system': 'pageApiSystem',
    gis: 'pageGis',
    'wood-accounting': 'pageWoodAccounting'
};

const pageIdMap = {};
for (const [k, v] of Object.entries(pageMap)) pageIdMap[v] = k;

// Filter bar visibility per page
const filterBarMap = {
    volumes: 'filterBar', finance: 'filterBar',
    forest: 'forestFilterBar', harvesting: 'harvestingFilterBar',
    market: 'marketFilterBar',
    executive: null, summary: null, 'data-entry': null, builder: null, 'api-system': null, gis: null, 'wood-accounting': null
};

const ALL_FILTER_BARS = ['filterBar', 'forestFilterBar', 'harvestingFilterBar', 'marketFilterBar'];

export function switchPage(page) {
    const role = currentProfile ? currentProfile.role : 'viewer';
    const visible = getVisiblePages(role, currentProfile);
    if (!visible.includes(page)) {
        toast('У вас немає доступу до цієї сторінки', true);
        return;
    }

    document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(pageMap[page]);
    if (el) el.classList.add('active');

    document.querySelectorAll('.nav-item[data-page]').forEach(n =>
        n.classList.toggle('active', n.dataset.page === page)
    );
    updateMobileNav(page);

    // Show/hide filter bars
    const activeBar = filterBarMap[page] || null;
    ALL_FILTER_BARS.forEach(id => {
        const bar = $(id);
        if (bar) bar.style.display = (id === activeBar) ? '' : 'none';
    });

    requestAnimationFrame(() => {
        Object.values(charts).forEach(c => { try { c.resize(); } catch(e){} });
    });

    // Lazy data load: ensure data is loaded for this page
    if (window._ensureDataLoaded) {
        window._ensureDataLoaded(page);
    }

    // Invalidate Leaflet map when GIS page becomes visible
    if (page === 'gis') {
        import('./gis/render-gis.js').then(m => {
            setTimeout(() => m.renderGisMap(), 150);
        });
    }
}

export function updateMobileNav(page) {
    document.querySelectorAll('.mobile-nav-item[data-page]').forEach(n =>
        n.classList.toggle('active', n.dataset.page === page)
    );
}

export function openMobileUpload() {
    const role = currentProfile ? currentProfile.role : 'viewer';
    if (UPLOAD_ROLES.includes(role)) { $('fileDrop').click(); }
    else { toast('Немає прав для завантаження', true); }
}

// Swipe gesture removed (conflicted з horizontal-scroll tables на mobile).
// Replaced з hamburger menu via toggleMobileMenu(). Stub kept for backward
// compat у app.js import чи майбутніх hooks.
export function initSwipeGestures() { /* noop — see toggleMobileMenu */ }

/**
 * Toggle mobile drawer overlay (hamburger menu).
 * On open: filter items by role-based getVisiblePages + sync active state.
 */
export function toggleMobileMenu() {
    const drawer = document.getElementById('mobileDrawer');
    if (!drawer) return;
    const willOpen = !drawer.classList.contains('open');
    if (willOpen) {
        // Filter visible items per current user's role
        const role = currentProfile ? currentProfile.role : 'viewer';
        const visible = new Set(getVisiblePages(role, currentProfile));
        const activePage = pageIdMap[document.querySelector('.page-section.active')?.id] || null;
        drawer.querySelectorAll('.mobile-drawer-item').forEach(btn => {
            const page = btn.dataset.page;
            if (page) {
                btn.style.display = visible.has(page) ? '' : 'none';
                btn.classList.toggle('active', page === activePage);
            }
            // Items без data-page (наприклад "Завантажити файл") — show always для editors+
        });
        // Hide upload item якщо user не має upload role
        const uploadBtn = drawer.querySelector('.mobile-drawer-item:not([data-page])');
        if (uploadBtn) {
            uploadBtn.style.display = UPLOAD_ROLES.includes(role) ? '' : 'none';
        }
    }
    drawer.classList.toggle('open');
}
