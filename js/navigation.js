// ===== Page Navigation =====
import { $, toast } from './utils.js';
import { charts, currentProfile } from './state.js';

export function switchPage(page) {
    document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
    const pageMap = { volumes: 'pageVolumes', finance: 'pageFinance', forest: 'pageForest' };
    const el = document.getElementById(pageMap[page]);
    if (el) el.classList.add('active');

    document.querySelectorAll('.nav-item[data-page]').forEach(n =>
        n.classList.toggle('active', n.dataset.page === page)
    );
    updateMobileNav(page);

    // Show/hide the correct filter bar
    const kpiFilter = $('filterBar');
    const forestFilter = $('forestFilterBar');
    if (page === 'forest') {
        if (kpiFilter) kpiFilter.style.display = 'none';
        if (forestFilter) forestFilter.style.display = '';
    } else {
        if (kpiFilter) kpiFilter.style.display = '';
        if (forestFilter) forestFilter.style.display = 'none';
    }

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
    if (role === 'admin' || role === 'editor') { $('fileDrop').click(); }
    else { toast('Немає прав для завантаження', true); }
}

export function initSwipeGestures() {
    let startX = 0, startY = 0, swiping = false;
    const pages = ['volumes', 'finance', 'forest'];

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
            const activeEl = document.querySelector('.page-section.active');
            let curIdx = 0;
            if (activeEl) {
                if (activeEl.id === 'pageVolumes') curIdx = 0;
                else if (activeEl.id === 'pageFinance') curIdx = 1;
                else if (activeEl.id === 'pageForest') curIdx = 2;
            }
            if (dx < 0 && curIdx < pages.length - 1) switchPage(pages[curIdx + 1]);
            else if (dx > 0 && curIdx > 0) switchPage(pages[curIdx - 1]);
        }
    }, { passive: true });
}
