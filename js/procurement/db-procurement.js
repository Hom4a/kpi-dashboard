// ===== Procurement Database Operations =====
import { sb } from '../config.js';

/**
 * Save fetched tenders to cache (upsert by tender_id)
 * @param {Array} tenders - Array from searchTenders()
 * @param {string} edrpou
 * @returns {Promise<{added: number, updated: number}>}
 */
export async function saveTendersCache(tenders, edrpou) {
    if (!tenders.length) return { added: 0, updated: 0 };

    const rows = tenders.map(t => ({
        tender_id: t.id,
        tender_number: t.tenderID,
        title: t.title,
        status: t.status,
        amount: t.amount,
        currency: t.currency,
        date_created: t.dateCreated || null,
        date_modified: t.dateModified || null,
        procuring_entity: t.procuringEntity,
        procurement_method: t.procurementMethodType || '',
        edrpou,
        fetched_at: new Date().toISOString()
    }));

    // Count existing before upsert
    const { count: before } = await sb.from('prozorro_tenders')
        .select('*', { count: 'exact', head: true })
        .eq('edrpou', edrpou);

    // Batch upsert (500 per batch)
    for (let i = 0; i < rows.length; i += 500) {
        const { error } = await sb.from('prozorro_tenders')
            .upsert(rows.slice(i, i + 500), { onConflict: 'tender_id' });
        if (error) throw new Error(error.message);
    }

    const { count: after } = await sb.from('prozorro_tenders')
        .select('*', { count: 'exact', head: true })
        .eq('edrpou', edrpou);

    return { added: (after - before), updated: rows.length - (after - before) };
}

/**
 * Log a sync event
 */
export async function logSync(edrpou, tendersFound, pagesScanned, durationMs) {
    await sb.from('prozorro_sync_log').insert({
        edrpou,
        tenders_found: tendersFound,
        pages_scanned: pagesScanned,
        sync_duration_ms: durationMs
    });
}

/**
 * Load cached tenders for an EDRPOU
 * @param {string} edrpou
 * @param {object} [opts]
 * @param {number} [opts.year] - Filter by year of date_created
 * @returns {Promise<Array>}
 */
export async function loadCachedTenders(edrpou, opts = {}) {
    let q = sb.from('prozorro_tenders')
        .select('*')
        .eq('edrpou', edrpou)
        .order('date_created', { ascending: false });

    if (opts.year) {
        q = q.gte('date_created', `${opts.year}-01-01`)
            .lt('date_created', `${opts.year + 1}-01-01`);
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data || [];
}

/**
 * Get last sync info
 * @param {string} edrpou
 * @returns {Promise<{syncedAt: string, tendersFound: number}|null>}
 */
export async function getLastSync(edrpou) {
    const { data, error } = await sb.from('prozorro_sync_log')
        .select('synced_at, tenders_found')
        .eq('edrpou', edrpou)
        .order('synced_at', { ascending: false })
        .limit(1)
        .single();
    if (error || !data) return null;
    return { syncedAt: data.synced_at, tendersFound: data.tenders_found };
}

/**
 * Aggregate KPIs from cached tenders
 * @param {Array} tenders - from loadCachedTenders()
 * @returns {object}
 */
export function aggregateCachedKPIs(tenders) {
    const proceduresCount = tenders.length;
    const totalAmount = tenders.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    const completed = tenders.filter(t =>
        t.status === 'complete' || t.status === 'active.awarded' || t.status === 'active.qualification'
    );
    const contractsCount = completed.length;
    const contractsAmount = completed.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    return { proceduresCount, totalAmount, contractsCount, contractsAmount };
}
