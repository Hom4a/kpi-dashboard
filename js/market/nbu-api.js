// ===== NBU Exchange Rate API Integration =====
// Fetches EUR/UAH rate from National Bank of Ukraine API
// API docs: https://bank.gov.ua/ua/open-data/api-dev

const NBU_API = 'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange';

/**
 * Fetch EUR/UAH rate for a specific date (or today if no date given)
 * @param {string} [dateStr] - Date in YYYY-MM-DD format
 * @returns {Promise<{rate: number, date: string}|null>}
 */
export async function fetchNbuRate(dateStr) {
    try {
        let url = `${NBU_API}?valcode=EUR&json`;
        if (dateStr) {
            // NBU expects YYYYMMDD format
            const d = dateStr.replace(/-/g, '');
            url = `${NBU_API}?valcode=EUR&date=${d}&json`;
        }
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5000);
        const resp = await fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
        if (!resp.ok) return null;
        const data = await resp.json();
        if (!Array.isArray(data) || !data.length) return null;
        const rec = data[0];
        // Parse NBU date "DD.MM.YYYY" → "YYYY-MM-DD"
        const parts = rec.exchangedate.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
        const isoDate = parts ? `${parts[3]}-${parts[2]}-${parts[1]}` : dateStr || new Date().toISOString().slice(0, 10);
        return { rate: rec.rate, date: isoDate };
    } catch (e) {
        console.warn('NBU API fetch failed:', e.message);
        return null;
    }
}

/**
 * Fetch EUR/UAH rates for a date range
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {Promise<Array<{rate: number, date: string}>>}
 */
export async function fetchNbuRateRange(startDate, endDate) {
    const results = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    // NBU API doesn't support range, so fetch day by day (max 31 days)
    const maxDays = Math.min(Math.ceil((end - start) / 86400000) + 1, 31);
    const promises = [];
    for (let i = 0; i < maxDays; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const ds = d.toISOString().slice(0, 10);
        promises.push(fetchNbuRate(ds));
    }
    const all = await Promise.all(promises);
    for (const r of all) {
        if (r) results.push(r);
    }
    return results;
}
