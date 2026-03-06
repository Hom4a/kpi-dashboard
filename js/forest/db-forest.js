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

// Smart merge: check for duplicates, then replace-all + batch-insert
export async function savePricesData(records, fileName) {
    const { data: { session } } = await sb.auth.getSession();
    const userId = session?.user?.id || null;
    const batchId = crypto.randomUUID();

    // Quick dedup check: count existing records
    const { count: existingCount } = await sb.from('forest_prices')
        .select('*', { count: 'exact', head: true });

    const rows = records.map(r => ({
        upload_batch_id: batchId,
        branch: r.branch, region: r.region, warehouse: r.warehouse,
        product: r.product, species: r.species, quality_class: r.quality_class,
        volume_m3: r.volume_m3, weighted_price_uah: r.weighted_price_uah, total_value_uah: r.total_value_uah,
        uploaded_by: userId
    }));

    // If same row count, check if data is identical (skip re-upload)
    if (existingCount === rows.length) {
        const { data: sample } = await sb.from('forest_prices')
            .select('branch,warehouse,product,species,quality_class')
            .limit(5);
        const sampleKeys = new Set((sample || []).map(r => `${r.branch}|${r.warehouse}|${r.product}|${r.species}|${r.quality_class}`));
        const allMatch = rows.slice(0, 5).every(r => sampleKeys.has(`${r.branch}|${r.warehouse}|${r.product}|${r.species}|${r.quality_class}`));
        if (allMatch && rows.length === existingCount) {
            return { added: 0, replaced: 0, skipped: rows.length };
        }
    }

    // Delete all existing records (single request instead of per-row loop)
    if (existingCount > 0) {
        await sb.from('forest_prices').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    }

    // Batch insert all records
    for (let i = 0; i < rows.length; i += 500) {
        const { error } = await sb.from('forest_prices').insert(rows.slice(i, i + 500));
        if (error) throw new Error(error.message);
    }

    await sb.from('forest_upload_history').insert({
        data_type: 'prices', batch_id: batchId,
        file_name: fileName, row_count: rows.length, uploaded_by: userId
    });

    return { added: rows.length, replaced: existingCount > 0 ? existingCount : 0 };
}

export async function saveInventoryData(records, fileName) {
    const { data: { session } } = await sb.auth.getSession();
    const userId = session?.user?.id || null;
    const batchId = crypto.randomUUID();

    // Quick dedup check
    const { count: existingCount } = await sb.from('forest_inventory')
        .select('*', { count: 'exact', head: true });

    const rows = records.map(r => ({
        upload_batch_id: batchId,
        branch: r.branch, region: r.region, forest_unit: r.forest_unit,
        forestry_div: r.forestry_div, warehouse: r.warehouse,
        product: r.product, product_name: r.product_name, wood_group: r.wood_group,
        species: r.species, quality_class: r.quality_class, remaining_volume_m3: r.remaining_volume_m3,
        uploaded_by: userId
    }));

    // If same row count, likely identical data
    if (existingCount === rows.length && rows.length > 0) {
        const { data: sample } = await sb.from('forest_inventory')
            .select('branch,forest_unit,species').limit(5);
        const sampleKeys = new Set((sample || []).map(r => `${r.branch}|${r.forest_unit}|${r.species}`));
        const allMatch = rows.slice(0, 5).every(r => sampleKeys.has(`${r.branch}|${r.forest_unit}|${r.species}`));
        if (allMatch) {
            return { added: 0, replaced: 0, skipped: rows.length };
        }
    }

    // Delete all existing records (single request instead of per-row loop)
    if (existingCount > 0) {
        await sb.from('forest_inventory').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    }

    // Batch insert all records
    for (let i = 0; i < rows.length; i += 500) {
        const { error } = await sb.from('forest_inventory').insert(rows.slice(i, i + 500));
        if (error) throw new Error(error.message);
    }

    await sb.from('forest_upload_history').insert({
        data_type: 'inventory', batch_id: batchId,
        file_name: fileName, row_count: rows.length, uploaded_by: userId
    });

    return { added: rows.length, replaced: existingCount > 0 ? existingCount : 0 };
}

export async function loadPricesData() {
    const { paginatedLoad } = await import('../db-utils.js');
    return paginatedLoad('forest_prices');
}

export async function loadInventoryData() {
    const { paginatedLoad } = await import('../db-utils.js');
    return paginatedLoad('forest_inventory');
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
