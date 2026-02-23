// ===== Event Bus — replaces callback wiring between modules =====
const bus = new EventTarget();

export function emit(name, detail) {
    bus.dispatchEvent(new CustomEvent(name, { detail }));
}

export function on(name, fn) {
    bus.addEventListener(name, e => fn(e.detail));
}

export function once(name, fn) {
    bus.addEventListener(name, e => fn(e.detail), { once: true });
}

// Event names used across the app:
// 'auth:signed-in'       — user authenticated, load all data
// 'auth:signed-out'      — user logged out, clear state
// 'data:kpi-loaded'      — KPI records loaded from DB
// 'data:forest-loaded'   — Forest data loaded
// 'data:harvesting-loaded'— Harvesting data loaded
// 'data:market-loaded'   — Market data loaded
// 'data:all-loaded'      — All dashboards loaded (for executive)
// 'filter:changed'       — KPI filter changed, re-render
// 'upload:complete'       — File upload finished
// 'render:all'           — Trigger full re-render
