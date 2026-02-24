// ===== Authentication =====
import { sb } from './config.js';
import { $, show, hide, showKpiSkeletons, withTimeout, toast } from './utils.js';
import { allData, filtered, charts, currentProfile, setAllData, setFiltered, setCharts, setCurrentProfile, getCachedProfile } from './state.js';
import { setupChartDefaults } from './charts-common.js';
import { startAutoRefresh, stopAutoRefresh } from './auto-refresh.js';
import { stopRealtime } from './realtime.js';

let _authInProgress = false;
let _authCompleted = false;
let _loadAndRenderFn = null;
let _hideButtonsFn = null;

export function setLoadAndRenderCallback(fn) { _loadAndRenderFn = fn; }
export function setHideButtonsCallback(fn) { _hideButtonsFn = fn; }

// ===== Role-based page access matrix =====
const PAGE_ACCESS = {
    volumes:     ['admin', 'director', 'analyst', 'editor', 'forester'],
    finance:     ['admin', 'director', 'analyst', 'editor', 'accountant'],
    forest:      ['admin', 'director', 'analyst', 'editor', 'accountant', 'forester', 'operator'],
    harvesting:  ['admin', 'director', 'analyst', 'editor', 'forester'],
    market:      ['admin', 'director', 'analyst', 'editor', 'forester'],
    executive:   ['admin', 'director', 'analyst'],
    'data-entry':['admin', 'editor', 'accountant', 'hr', 'forester', 'operator'],
    builder:     ['admin', 'analyst', 'editor'],
    'api-system':['admin', 'analyst'],
    gis:         ['admin', 'director', 'analyst', 'editor', 'forester'],
};

// Roles that can upload files
const UPLOAD_ROLES = ['admin', 'editor', 'accountant', 'hr', 'forester', 'operator'];

// Roles that see data management (clear/undo)
const DATA_MANAGE_ROLES = ['admin', 'editor'];

// Roles that see targets button
const TARGET_ROLES = ['admin', 'editor'];

// Role display names (Ukrainian)
const ROLE_LABELS = {
    admin: 'адмін', director: 'керівник', analyst: 'аналітик',
    editor: 'редактор', accountant: 'бухгалтер', hr: 'HR',
    forester: 'лісничий', operator: 'оператор', viewer: 'глядач'
};

/** Get pages visible for a given role + profile */
export function getVisiblePages(role, profile) {
    // Viewer uses allowed_pages from profile
    if (role === 'viewer' && profile && profile.allowed_pages) {
        return profile.allowed_pages;
    }
    // Other roles use PAGE_ACCESS matrix
    const pages = Object.entries(PAGE_ACCESS)
        .filter(([, roles]) => roles.includes(role))
        .map(([page]) => page);
    // Fallback: always show at least volumes if no pages matched
    return pages.length ? pages : ['volumes'];
}

export { PAGE_ACCESS, UPLOAD_ROLES, DATA_MANAGE_ROLES, TARGET_ROLES, ROLE_LABELS };

export async function getCurrentProfile() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.user) return null;
    const { data, error } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
    if (error) {
        console.warn('Profile fetch error:', error.message);
        return null;
    }
    return data;
}

export function showAuthScreen() {
    $('authScreen').classList.add('on');
    $('authError').textContent = '';
    $('authEmail').value = '';
    $('authPass').value = '';
    setTimeout(() => { const el = $('authEmail'); if (el) el.focus(); }, 100);
}

export function hideAuthScreen() { $('authScreen').classList.remove('on'); }

export function showAuthLoading(v) {
    const el = $('authLoadingOverlay');
    if (el) el.classList.toggle('on', v);
}

export async function handleLogin() {
    const email = $('authEmail').value.trim(), pass = $('authPass').value;
    if (!email || !pass) { $('authError').textContent = 'Введіть email та пароль'; return; }
    $('btnLogin').disabled = true; $('btnLogin').textContent = 'Вхід...'; $('authError').textContent = '';
    try {
        const { error } = await sb.auth.signInWithPassword({ email, password: pass });
        if (error) {
            $('authError').textContent = error.message === 'Invalid login credentials'
                ? 'Невірний email або пароль' : error.message;
        }
    } catch(e) { $('authError').textContent = "Помилка з'єднання"; }
    $('btnLogin').disabled = false; $('btnLogin').textContent = 'Увійти';
}

export async function handleLogout() {
    stopAutoRefresh();
    stopRealtime();
    _authCompleted = false;
    await sb.auth.signOut();
    setCurrentProfile(null); setAllData([]); setFiltered([]);
    Object.values(charts).forEach(c => { try { c.destroy(); } catch(e){} }); setCharts({});
    hide('dash'); show('empty'); $('userInfo').style.display = 'none';
    $('hdrSub').textContent = 'Завантажте файл для початку';
    if (_hideButtonsFn) _hideButtonsFn();
    showAuthScreen();
}

export function hideButtons() {
    ['btnUpload','btnFormatHelp','btnClear','btnExport','btnPrint','btnTargets','btnViewerAccess','btnDashboards','liveInfo'].forEach(id => {
        try { $(id).style.display = 'none'; } catch(e){}
    });
}

export async function showAppForUser(user) {
    if (_authInProgress || _authCompleted) return;
    _authInProgress = true;
    showAuthLoading(true);
    try {
        showKpiSkeletons('kpiGrid', 6);

        // Use cached profile immediately so UI doesn't flash as 'viewer'
        const cached = getCachedProfile();
        if (cached) setCurrentProfile(cached);

        // Fetch fresh profile from DB
        const freshProfile = await withTimeout(getCurrentProfile(), 8000, null);
        if (freshProfile) {
            setCurrentProfile(freshProfile);
        } else if (!cached) {
            // No cache and first fetch failed — retry once
            const retry = await withTimeout(getCurrentProfile(), 10000, null);
            setCurrentProfile(retry);
        }

        const p = currentProfile;
        const role = p ? p.role : 'viewer';
        const displayName = p && p.full_name ? p.full_name : user.email;
        $('userInfo').style.display = 'flex';
        $('userName').textContent = displayName;
        const badge = $('roleBadge');
        badge.textContent = ROLE_LABELS[role] || role;
        badge.className = 'role-badge ' + role;

        // Upload button — for roles that enter data
        const canUpload = UPLOAD_ROLES.includes(role);
        $('btnUpload').style.display = canUpload ? '' : 'none';
        const helpBtn = $('btnFormatHelp');
        if (helpBtn) helpBtn.style.display = canUpload ? '' : 'none';

        // Admin-only: viewer access
        const vaBtn = $('btnViewerAccess');
        if (vaBtn) vaBtn.style.display = role === 'admin' ? '' : 'none';

        // Nav visibility — role-based page access
        const allowedPages = getVisiblePages(role, p);
        console.log('Auth: role=' + role, 'source=' + (freshProfile ? 'fresh' : cached ? 'cache' : 'fallback'), 'pages=' + allowedPages.length);
        document.querySelectorAll('.nav-item[data-page]').forEach(n => {
            n.style.display = allowedPages.includes(n.dataset.page) ? '' : 'none';
        });
        document.querySelectorAll('.mobile-nav-item[data-page]').forEach(n => {
            n.style.display = allowedPages.includes(n.dataset.page) ? '' : 'none';
        });

        setupChartDefaults();
        // Always load all data sources (not just when KPI count > 0)
        if (_loadAndRenderFn) {
            try {
                await withTimeout(_loadAndRenderFn(), 20000, null);
            } catch(dataErr) {
                console.error('Data loading error (non-fatal):', dataErr);
            }
        }
        startAutoRefresh();
        _authCompleted = true;
        hideAuthScreen();
    } catch(e) {
        console.error('showAppForUser error:', e);
        // Only sign out if it's truly an auth error, not a data loading error
        if (e.message && (e.message.includes('JWT') || e.message.includes('token') || e.message.includes('session') || e.message.includes('refresh_token'))) {
            try { await sb.auth.signOut(); } catch(x) {}
            setCurrentProfile(null); setAllData([]); setFiltered([]);
            $('userInfo').style.display = 'none';
            showAuthScreen();
            $('authError').textContent = 'Сесія застаріла — увійдіть знову';
        } else {
            // Non-auth error: keep user logged in, just show warning
            console.error('Non-auth error during setup:', e);
            hideAuthScreen();
            _authCompleted = true;
        }
    } finally {
        _authInProgress = false;
        showAuthLoading(false);
    }
}

export function initAuthListener() {
    if (!sb) { toast('Supabase не ініціалізовано', true); showAuthScreen(); return; }
    sb.auth.onAuthStateChange(async (event, session) => {
        console.log('Auth event:', event);
        if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
            await showAppForUser(session.user);
        } else if (event === 'SIGNED_OUT') {
            _authCompleted = false;
            setCurrentProfile(null); setAllData([]); setFiltered([]);
            $('userInfo').style.display = 'none';
            hideButtons(); showAuthScreen();
        }
    });
    // Fallback: if onAuthStateChange doesn't fire within 3s, check manually
    setTimeout(async () => {
        if (_authInProgress || _authCompleted) return;
        try {
            const { data: { session } } = await sb.auth.getSession();
            if (session && !_authInProgress && !_authCompleted) await showAppForUser(session.user);
        } catch(e) {
            console.error('Fallback session check error:', e);
        }
    }, 3000);
}
