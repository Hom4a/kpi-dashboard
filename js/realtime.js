// ===== Supabase Realtime Subscriptions =====
// Replaces polling with live database change notifications
// Fallback: auto-refresh.js continues 5-min polling if Realtime fails

import { sb } from './config.js';
import { emit } from './event-bus.js';

let _channel = null;
let _connected = false;
let _fallback = false;
const _debounce = {};

const MONITORED_TABLES = [
    'kpi_records',
    'forest_prices',
    'forest_inventory',
    'harvesting_plan_fact',
    'harvesting_zsu',
    'market_prices'
];

const TABLE_EVENT_MAP = {
    kpi_records: 'data:kpi-loaded',
    forest_prices: 'data:forest-loaded',
    forest_inventory: 'data:forest-loaded',
    harvesting_plan_fact: 'data:harvesting-loaded',
    harvesting_zsu: 'data:harvesting-loaded',
    market_prices: 'data:market-loaded'
};

export function startRealtime(reloadCallbacks) {
    if (!sb || _channel) return;

    try {
        _channel = sb.channel('dashboard-changes');

        MONITORED_TABLES.forEach(table => {
            _channel.on(
                'postgres_changes',
                { event: '*', schema: 'public', table },
                (payload) => {
                    console.log('Realtime:', table, payload.eventType);
                    const eventName = TABLE_EVENT_MAP[table];
                    if (eventName) emit(eventName, { table, payload });

                    // Debounced reload (2s) to batch rapid changes
                    if (reloadCallbacks[table]) {
                        debouncedReload(table, reloadCallbacks[table]);
                    }
                }
            );
        });

        _channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                _connected = true;
                _fallback = false;
                emit('realtime:connected');
                updateIndicator(true);
                console.log('Realtime connected');
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                _connected = false;
                _fallback = true;
                emit('realtime:disconnected');
                updateIndicator(false);
                console.warn('Realtime disconnected, fallback to polling');
            }
        });
    } catch (e) {
        console.error('Realtime setup failed:', e);
        _fallback = true;
    }
}

export function stopRealtime() {
    if (_channel) {
        sb.removeChannel(_channel);
        _channel = null;
    }
    _connected = false;
    updateIndicator(false);
}

export function isRealtimeConnected() { return _connected; }
export function shouldFallbackPolling() { return _fallback; }

function debouncedReload(table, callback) {
    if (_debounce[table]) clearTimeout(_debounce[table]);
    _debounce[table] = setTimeout(() => {
        delete _debounce[table];
        callback();
    }, 2000);
}

function updateIndicator(connected) {
    const el = document.getElementById('liveInfo');
    const lbl = document.getElementById('liveLbl');
    if (el) el.style.display = '';
    if (lbl) lbl.textContent = connected ? 'Live' : 'Polling';
    const dot = el?.querySelector('.live-dot');
    if (dot) dot.style.background = connected ? '#22c55e' : '#fbbf24';
}
