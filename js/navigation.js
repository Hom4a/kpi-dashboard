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
    'data-entry': 'pageDataEntry',
    builder: 'pageBuilder',
    'api-system': 'pageApiSystem'
};

const pageIdMap = {};
for (const [k, v] of Object.entries(pageMap)) pageIdMap[v] = k;

// Filter bar visibility per page
const filterBarMap = {
    volumes: 'filterBar', finance: 'filterBar',
    forest: 'forestFilterBar', harvesting: 'harvestingFilterBar',
    market: 'marketFilterBar',
    executive: null, 'data-entry': null, builder: null, 'api-system': null
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

export function initSwipeGestures() {
    let startX = 0, startY = 0, swiping = false;

    document.addEventListener('touchstart', e => {
        if (window.innerWidth > 768) return;
        startX = e.touches[0].clientX; startY = e.touches[0].clientY; swiping = true;
    }, { passive: true });

    document.addEventListener('touchend', e => {
        if (!swiping || window.innerWidth > 768) return;
        swiping = false;
        const dx = e.changedTouches[0].clientX - startX;
        const dy = e.changedTouches[0].clientY - startY;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            const role = currentProfile ? currentProfile.role : 'viewer';
            const pages = getVisiblePages(role, currentProfile);
            const activeEl = document.querySelector('.page-section.active');
            let curIdx = 0;
            if (activeEl) {
                const curPage = pageIdMap[activeEl.id] || 'volumes';
                curIdx = pages.indexOf(curPage);
                if (curIdx < 0) curIdx = 0;
            }
            if (dx < 0 && curIdx < pages.length - 1) switchPage(pages[curIdx + 1]);
            else if (dx > 0 && curIdx > 0) switchPage(pages[curIdx - 1]);
        }
    }, { passive: true });
}
