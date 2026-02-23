// ===== PWA: Service Worker Registration + Install Prompt =====
import { emit } from './event-bus.js';

let _deferredPrompt = null;

export function registerSW() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js')
        .then(reg => {
            console.log('SW registered:', reg.scope);
            // Check for updates periodically
            setInterval(() => reg.update(), 60 * 60 * 1000); // hourly
        })
        .catch(err => console.warn('SW registration failed:', err));

    // Online/offline detection
    window.addEventListener('online', () => emit('pwa:online'));
    window.addEventListener('offline', () => emit('pwa:offline'));
}

export function initInstallPrompt() {
    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        _deferredPrompt = e;
        showInstallBanner();
    });

    window.addEventListener('appinstalled', () => {
        _deferredPrompt = null;
        hideInstallBanner();
    });
}

function showInstallBanner() {
    const banner = document.getElementById('pwaInstallBanner');
    if (!banner) return;
    banner.style.display = '';

    const installBtn = document.getElementById('pwaInstallBtn');
    const dismissBtn = document.getElementById('pwaInstallDismiss');

    if (installBtn) {
        installBtn.onclick = async () => {
            if (!_deferredPrompt) return;
            _deferredPrompt.prompt();
            const result = await _deferredPrompt.userChoice;
            if (result.outcome === 'accepted') {
                _deferredPrompt = null;
            }
            hideInstallBanner();
        };
    }

    if (dismissBtn) {
        dismissBtn.onclick = () => hideInstallBanner();
    }
}

function hideInstallBanner() {
    const banner = document.getElementById('pwaInstallBanner');
    if (banner) banner.style.display = 'none';
}
