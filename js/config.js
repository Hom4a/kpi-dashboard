// ===== Supabase Configuration =====
// Use Vite env vars in build mode, fallback to hardcoded for raw ES module mode
const _env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
export const SUPABASE_URL = _env.VITE_SUPABASE_URL || 'https://qfggalnkosrpfaosrqhj.supabase.co';
export const SUPABASE_ANON_KEY = _env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_0NmTVR4yOdPWXHjaO4MTjg_Xo-QrYTc';

let sb = null;
try { sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); }
catch(e) { console.error('Supabase init failed:', e); }

export { sb };
