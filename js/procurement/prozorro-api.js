// ===== ProZorro Public Procurement API Client =====
// Fetches tenders/contracts for a specific organization by EDRPOU code
// API: https://public-api.prozorro.gov.ua/api/2.5

const API_BASE = 'https://public-api.prozorro.gov.ua/api/2.5';
const DEFAULT_EDRPOU = '44768034';
const MAX_PAGES = 20; // Max pages to scan (20 × 1000 = 20,000 tenders)
const PAGE_SIZE = 1000;

/**
 * Search ProZorro for tenders by procuring entity EDRPOU.
 * Scans recent tenders (newest first) and returns matching ones.
 * @param {object} [opts]
 * @param {string} [opts.edrpou] - EDRPOU code to search for
 * @param {string} [opts.since] - ISO date string to limit search depth (e.g., '2026-01-01')
 * @param {number} [opts.maxPages] - Max API pages to scan
 * @param {function} [opts.onProgress] - Callback(scanned, found) for progress updates
 * @returns {Promise<Array<object>>} - Array of matching tender summaries
 */
export async function searchTenders(opts = {}) {
    const edrpou = opts.edrpou || DEFAULT_EDRPOU;
    const sinceDate = opts.since ? new Date(opts.since) : new Date(new Date().getFullYear(), 0, 1);
    const maxPages = opts.maxPages || MAX_PAGES;
    const onProgress = opts.onProgress || (() => {});

    const found = [];
    let nextUrl = `${API_BASE}/tenders?descending=1&limit=${PAGE_SIZE}&opt_fields=procuringEntity,status,tenderID,value,title,dateCreated`;
    let scanned = 0;

    for (let page = 0; page < maxPages; page++) {
        try {
            const resp = await fetch(nextUrl, { signal: AbortSignal.timeout(10000) });
            if (!resp.ok) {
                if (resp.status === 429) {
                    // Rate limited — wait and retry
                    await new Promise(r => setTimeout(r, 2000));
                    continue;
                }
                break;
            }
            const json = await resp.json();
            const items = json.data || [];
            if (!items.length) break;

            // Check date cutoff
            const oldestDate = new Date(items[items.length - 1].dateModified || items[items.length - 1].dateCreated);
            if (oldestDate < sinceDate) {
                // Filter this batch and stop
                for (const t of items) {
                    const tDate = new Date(t.dateModified || t.dateCreated);
                    if (tDate < sinceDate) continue;
                    if (matchesEdrpou(t, edrpou)) found.push(extractTender(t));
                }
                scanned += items.length;
                onProgress(scanned, found.length);
                break;
            }

            // Filter matching tenders
            for (const t of items) {
                if (matchesEdrpou(t, edrpou)) found.push(extractTender(t));
            }

            scanned += items.length;
            onProgress(scanned, found.length);

            // Get next page URL
            if (json.next_page && json.next_page.uri) {
                nextUrl = json.next_page.uri;
            } else {
                break;
            }
        } catch (e) {
            console.warn('ProZorro API error:', e.message);
            break;
        }
    }

    return found;
}

/**
 * Fetch full details for a specific tender
 * @param {string} tenderId
 * @returns {Promise<object|null>}
 */
export async function fetchTenderDetail(tenderId) {
    try {
        const resp = await fetch(`${API_BASE}/tenders/${tenderId}`, { signal: AbortSignal.timeout(10000) });
        if (!resp.ok) return null;
        const json = await resp.json();
        return json.data || null;
    } catch {
        return null;
    }
}

/**
 * Get aggregated procurement KPIs from fetched tenders
 * @param {Array} tenders - Array from searchTenders()
 * @returns {object} - { proceduresCount, totalAmount, contractsCount, contractsAmount }
 */
export function aggregateProcurementKPIs(tenders) {
    const proceduresCount = tenders.length;
    const totalAmount = tenders.reduce((s, t) => s + (t.amount || 0), 0);
    const completed = tenders.filter(t =>
        t.status === 'complete' || t.status === 'active.awarded' || t.status === 'active.qualification'
    );
    const contractsCount = completed.length;
    const contractsAmount = completed.reduce((s, t) => s + (t.amount || 0), 0);
    return { proceduresCount, totalAmount, contractsCount, contractsAmount };
}

// --- Internal helpers ---

function matchesEdrpou(tender, edrpou) {
    const pe = tender.procuringEntity;
    if (!pe || !pe.identifier) return false;
    return pe.identifier.id === edrpou;
}

function extractTender(t) {
    const pe = t.procuringEntity || {};
    return {
        id: t.id,
        tenderID: t.tenderID || '',
        title: t.title || pe.name || '',
        status: t.status || '',
        amount: t.value ? (t.value.amount || 0) : 0,
        currency: t.value ? (t.value.currency || 'UAH') : 'UAH',
        dateCreated: t.dateCreated || t.dateModified || '',
        dateModified: t.dateModified || '',
        procuringEntity: pe.name || ''
    };
}

export { DEFAULT_EDRPOU };
