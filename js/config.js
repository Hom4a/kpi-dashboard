// ===== Supabase Configuration =====
export const SUPABASE_URL = 'https://qfggalnkosrpfaosrqhj.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_0NmTVR4yOdPWXHjaO4MTjg_Xo-QrYTc';

let sb = null;
try { sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); }
catch(e) { console.error('Supabase init failed:', e); }

// Ephemeral client for admin signUp — does NOT persist session, won't log out admin
let sbSignup = null;
try {
    sbSignup = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
} catch(e) { console.error('Supabase signup client init failed:', e); }

export { sb, sbSignup };
