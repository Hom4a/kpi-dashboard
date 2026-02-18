// ===== Market Prices — Database Layer =====
import { sb } from '../config.js';

const BATCH_SIZE = 500;

async function batchInsert(table, records, batchId, userId) {
    if (!records.length) return 0;
    const enriched = records.map(r => ({
        ...r,
        upload_batch_id: batchId,
        uploaded_by: userId
    }));
    let inserted = 0;
    for (let i = 0; i < enriched.length; i += BATCH_SIZE) {
        const chunk = enriched.slice(i, i + BATCH_SIZE);
        const { error } = await sb.from(table).insert(chunk);
        if (error) throw error;
        inserted += chunk.length;
    }
    return inserted;
}

export async function saveMarketData(parsedResult, fileName) {
    const { data: { user } } = await sb.auth.getUser();
    const userId = user ? user.id : null;
    const batchId = crypto.randomUUID();

    // Clear existing data
    await sb.from('market_prices').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await sb.from('market_prices_ua').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await sb.from('market_price_history').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await sb.from('eur_rates').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    let total = 0;
    total += await batchInsert('market_prices', parsedResult.prices, batchId, userId);
    total += await batchInsert('market_prices_ua', parsedResult.uaDetail, batchId, userId);
    total += await batchInsert('market_price_history', parsedResult.history, batchId, userId);
    total += await batchInsert('eur_rates', parsedResult.eurRates, batchId, userId);

    // Record upload history
    await sb.from('forest_upload_history').insert({
        data_type: 'market_prices',
        batch_id: batchId,
        file_name: fileName,
        row_count: total,
        uploaded_by: userId
    });

    return { count: total, meta: parsedResult.meta };
}

export async function loadMarketPrices() {
    const all = [];
    let from = 0;
    while (true) {
        const { data, error } = await sb.from('market_prices')
            .select('*').range(from, from + 999).order('row_type').order('country');
        if (error) throw error;
        if (!data || !data.length) break;
        all.push(...data);
        if (data.length < 1000) break;
        from += 1000;
    }
    return all;
}

export async function loadMarketUaDetail() {
    const { data, error } = await sb.from('market_prices_ua')
        .select('*').order('exchange').order('species');
    if (error) throw error;
    return data || [];
}

export async function loadMarketHistory() {
    const { data, error } = await sb.from('market_price_history')
        .select('*').order('data_type').order('entity_name').order('month_date');
    if (error) throw error;
    return data || [];
}

export async function loadEurRates() {
    const { data, error } = await sb.from('eur_rates')
        .select('*').order('rate_date');
    if (error) throw error;
    return data || [];
}

export async function getMarketPricesCount() {
    const { count, error } = await sb.from('market_prices').select('*', { count: 'exact', head: true });
    if (error) return 0;
    return count || 0;
}

export async function clearMarketData() {
    await sb.from('market_prices').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await sb.from('market_prices_ua').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await sb.from('market_price_history').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await sb.from('eur_rates').delete().neq('id', '00000000-0000-0000-0000-000000000000');
}
