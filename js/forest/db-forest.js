// ===== Forest Database Operations =====
import { sb } from '../config.js';

// ===== RPC-based aggregation (server-side, fast) =====
export async function fetchForestSummary(branch = null, product = null, species = null) {
    try {
        const params = {};
        if (branch) params.p_branch = branch;
        if (product) params.p_product = product;
        if (species) params.p_species = species;
        const { data, error } = await sb.rpc('get_forest_summary', params);
        if (error || !data) return null;
        return data;
    } catch { return null; }
}

// Smart merge: fetch existing keys, insert only new records
export async function savePricesData(records, fileName) {
    const { data: { session } } = await sb.auth.getSession();
    const userId = session?.user?.id || null;
    const batchId = crypto.randomUUID();

    // Fetch existing composite keys
    const existingKeys = new Set();
    let from = 0;
    while (true) {
        const { data, error } = await sb.from('forest_prices')
            .select('branch,warehouse,product,species,quality_class')
            .range(from, from + 4999);
        if (error) throw new Error(error.message);
        if (!data || !data.length) break;
        data.forEach(r => existingKeys.add(`${r.branch}|${r.warehouse}|${r.product}|${r.species}|${r.quality_class}`));
        if (data.length < 5000) break;
        from += 5000;
    }

    const rows = records.map(r => ({
        upload_batch_id: batchId,
        branch: r.branch, region: r.region, warehouse: r.warehouse,
        product: r.product, species: r.species, quality_class: r.quality_class,
        volume_m3: r.volume_m3, weighted_price_uah: r.weighted_price_uah, total_value_uah: r.total_value_uah,
        uploaded_by: userId
    }));

    const newCount = rows.filter(r => !existingKeys.has(`${r.branch}|${r.warehouse}|${r.product}|${r.species}|${r.quality_class}`)).length;
    const updatedCount = rows.length - newCount;

    for (let i = 0; i < rows.length; i += 500) {
        const { error } = await sb.from('forest_prices').upsert(rows.slice(i, i + 500));
        if (error) throw new Error(error.message);
    }

    await sb.from('forest_upload_history').insert({
        data_type: 'prices', batch_id: batchId,
        file_name: fileName, row_count: rows.length, uploaded_by: userId
    });

    return { added: newCount, updated: updatedCount };
}

export async function saveInventoryData(records, fileName) {
    const { data: { session } } = await sb.auth.getSession();
    const userId = session?.user?.id || null;
    const batchId = crypto.randomUUID();

    // Fetch existing composite keys
    const existingKeys = new Set();
    let from = 0;
    while (true) {
        const { data, error } = await sb.from('forest_inventory')
            .select('branch,forest_unit,forestry_div,warehouse,product,species,quality_class')
            .range(from, from + 4999);
        if (error) throw new Error(error.message);
        if (!data || !data.length) break;
        data.forEach(r => existingKeys.add(
            `${r.branch}|${r.forest_unit}|${r.forestry_div}|${r.warehouse}|${r.product}|${r.species}|${r.quality_class}`
        ));
        if (data.length < 5000) break;
        from += 5000;
    }

    const rows = records.map(r => ({
        upload_batch_id: batchId,
        branch: r.branch, region: r.region, forest_unit: r.forest_unit,
        forestry_div: r.forestry_div, warehouse: r.warehouse,
        product: r.product, product_name: r.product_name, wood_group: r.wood_group,
        species: r.species, quality_class: r.quality_class, remaining_volume_m3: r.remaining_volume_m3,
        uploaded_by: userId
    }));

    const newCount = rows.filter(r => !existingKeys.has(
        `${r.branch}|${r.forest_unit}|${r.forestry_div}|${r.warehouse}|${r.product}|${r.species}|${r.quality_class}`
    )).length;
    const updatedCount = rows.length - newCount;

    for (let i = 0; i < rows.length; i += 500) {
        const { error } = await sb.from('forest_inventory').upsert(rows.slice(i, i + 500));
        if (error) throw new Error(error.message);
    }

    await sb.from('forest_upload_history').insert({
        data_type: 'inventory', batch_id: batchId,
        file_name: fileName, row_count: rows.length, uploaded_by: userId
    });

    return { added: newCount, updated: updatedCount };
}

export async function loadPricesData() {
    const all = []; let from = 0;
    while (true) {
        const { data, error } = await sb.from('forest_prices').select('*').range(from, from + 999);
        if (error) throw new Error(error.message);
        if (!data || !data.length) break;
        all.push(...data);
        if (data.length < 1000) break;
        from += 1000;
    }
    return all;
}

export async function loadInventoryData() {
    const all = []; let from = 0;
    while (true) {
        const { data, error } = await sb.from('forest_inventory').select('*').range(from, from + 999);
        if (error) throw new Error(error.message);
        if (!data || !data.length) break;
        all.push(...data);
        if (data.length < 1000) break;
        from += 1000;
    }
    return all;
}

export async function getPricesCount() {
    const { count, error } = await sb.from('forest_prices').select('*', { count: 'exact', head: true });
    if (error) throw new Error(error.message);
    return count || 0;
}

export async function getInventoryCount() {
    const { count, error } = await sb.from('forest_inventory').select('*', { count: 'exact', head: true });
    if (error) throw new Error(error.message);
    return count || 0;
}

export async function clearPricesData() {
    const { error } = await sb.from('forest_prices').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw new Error(error.message);
    await sb.from('forest_upload_history').delete().eq('data_type', 'prices');
}

export async function clearInventoryData() {
    const { error } = await sb.from('forest_inventory').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw new Error(error.message);
    await sb.from('forest_upload_history').delete().eq('data_type', 'inventory');
}
