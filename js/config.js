// ===== Supabase Configuration (on-prem only) =====
// On-prem self-hosted Supabase: dashboards.e-forest.gov.ua
// Коли фронтенд подається з того самого origin — використовуємо same-origin URL
// (без CORS). Інакше (наприклад вітовий dev server) — абсолютний URL.
const ONPREM_HOSTNAME = 'dashboards.e-forest.gov.ua';
const ONPREM_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc2ODYyMDkxLCJleHAiOjE5MzQ1NDIwOTF9.f-ORHRuqU77BcSzzAjyZe0oeJVrIhUXe4bfFR4IWIlc';

const _hostname = (typeof window !== 'undefined' && window.location)
    ? window.location.hostname
    : '';

export const SUPABASE_URL = (_hostname === ONPREM_HOSTNAME)
    ? window.location.origin
    : `https://${ONPREM_HOSTNAME}`;

export const SUPABASE_ANON_KEY = ONPREM_ANON;

if (typeof console !== 'undefined') {
    console.log(`[config] URL=${SUPABASE_URL}`);
}

let sb = null;
try { sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); }
catch(e) { console.error('Supabase init failed:', e); }

export { sb };
