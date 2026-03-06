// ===== ProZorro Public Procurement API Client =====
// Fetches tenders/contracts for a specific organization by EDRPOU code
// API: https://public-api.prozorro.gov.ua/api/2.5
//
// Strategy: The public API is a feed (no EDRPOU filter). We scan pages
// descending by date, filter client-side by procuringEntity.identifier.id,
// then fetch full details for each match (feed doesn't include value/title).

const API_BASE = 'https://public-api.prozorro.gov.ua/api/2.5';
const DEFAULT_EDRPOU = '44768034';
const MAX_PAGES = 200; // 200 × 1000 = 200K tenders (~2.8 days at 72K/day)
const PAGE_SIZE = 1000;
const CONCURRENT_DETAILS = 5; // Parallel detail fetches

/**
 * Cross-browser fetch with timeout (AbortSignal.timeout() not supported everywhere)
 */
function fetchWithTimeout(url, ms = 15000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

/**
 * Search ProZorro for tenders by procuring entity EDRPOU.
 * Phase 1: Scan feed to find matching tender IDs.
 * Phase 2: Fetch full details for each match (title, value, etc.).
 */
export async function searchTenders(opts = {}) {
    const edrpou = opts.edrpou || DEFAULT_EDRPOU;
    const sinceDate = opts.since ? new Date(opts.since) : new Date(new Date().getFullYear(), 0, 1);
    const maxPages = opts.maxPages || MAX_PAGES;
    const onProgress = opts.onProgress || (() => {});

    // Phase 1: Scan feed for matching tender IDs
    const matchedIds = [];
    let nextUrl = `${API_BASE}/tenders?descending=1&limit=${PAGE_SIZE}&opt_fields=procuringEntity`;
    let scanned = 0;
    let retryCount = 0;

    for (let page = 0; page < maxPages; page++) {
        try {
            const resp = await fetchWithTimeout(nextUrl, 15000);
            if (!resp.ok) {
                if (resp.status === 429) {
                    retryCount++;
                    const delay = Math.min(2000 * Math.pow(2, retryCount - 1), 16000);
                    console.warn(`ProZorro: rate limited, waiting ${delay}ms (retry ${retryCount})`);
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }
                console.warn(`ProZorro: HTTP ${resp.status} on page ${page}`);
                break;
            }
            retryCount = 0; // Reset on success
            const json = await resp.json();
            const items = json.data || [];
            if (!items.length) break;

            // Check date cutoff
            const oldestDate = new Date(items[items.length - 1].dateModified);
            if (oldestDate < sinceDate) {
                for (const t of items) {
                    if (new Date(t.dateModified) < sinceDate) continue;
                    if (matchesEdrpou(t, edrpou)) matchedIds.push(t.id);
                }
                scanned += items.length;
                onProgress(scanned, matchedIds.length);
                console.log(`ProZorro: reached date cutoff at page ${page}, scanned ${scanned}, found ${matchedIds.length}`);
                break;
            }

            // Filter matching tenders
            for (const t of items) {
                if (matchesEdrpou(t, edrpou)) matchedIds.push(t.id);
            }

            scanned += items.length;
            if (page % 10 === 0) {
                onProgress(scanned, matchedIds.length);
                console.log(`ProZorro: page ${page}, scanned ${scanned}, found ${matchedIds.length}`);
            }

            // Get next page URL
            if (json.next_page && json.next_page.uri) {
                nextUrl = json.next_page.uri;
            } else {
                break;
            }
        } catch (e) {
            console.warn('ProZorro feed scan error:', e.message, '(page', page, ')');
            if (e.name === 'AbortError') {
                // Timeout — retry once
                retryCount++;
                if (retryCount <= 3) continue;
            }
            break;
        }
    }

    console.log(`ProZorro scan complete: scanned ${scanned}, found ${matchedIds.length} matches`);
    if (!matchedIds.length) return [];

    // Phase 2: Fetch full details for each match (parallel, batched)
    console.log(`ProZorro: fetching details for ${matchedIds.length} tenders...`);
    const results = [];
    for (let i = 0; i < matchedIds.length; i += CONCURRENT_DETAILS) {
        const batch = matchedIds.slice(i, i + CONCURRENT_DETAILS);
        const details = await Promise.all(batch.map(id => fetchTenderDetail(id)));
        for (const d of details) {
            if (d) results.push(extractTender(d));
        }
    }

    return results;
}

/**
 * Fetch full details for a specific tender
 */
export async function fetchTenderDetail(tenderId) {
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const resp = await fetchWithTimeout(`${API_BASE}/tenders/${tenderId}`, 10000);
            if (!resp.ok) {
                if (resp.status === 429) {
                    await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
                    continue;
                }
                console.warn(`ProZorro detail: HTTP ${resp.status} for ${tenderId}`);
                return null;
            }
            const json = await resp.json();
            return json.data || null;
        } catch (e) {
            console.warn(`ProZorro detail error (attempt ${attempt + 1}):`, e.message);
            if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
        }
    }
    return null;
}

/**
 * Get aggregated procurement KPIs from fetched tenders
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
        title: t.title || '',
        status: t.status || '',
        amount: t.value ? (t.value.amount || 0) : 0,
        currency: t.value ? (t.value.currency || 'UAH') : 'UAH',
        dateCreated: t.dateCreated || t.dateModified || '',
        dateModified: t.dateModified || '',
        procuringEntity: pe.name || '',
        procurementMethodType: t.procurementMethodType || ''
    };
}

export { DEFAULT_EDRPOU };
