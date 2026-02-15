// ===== Forest Database Operations =====
import { sb } from '../config.js';

// DELETE ALL + batch INSERT (full replacement strategy)
export async function savePricesData(records, fileName) {
    const { data: { user } } = await sb.auth.getUser();
    const batchId = crypto.randomUUID();

    // Delete existing data
    const { error: delErr } = await sb.from('forest_prices').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (delErr) throw new Error(delErr.message);

    // Batch insert
    const rows = records.map(r => ({
        upload_batch_id: batchId,
        branch: r.branch, region: r.region, warehouse: r.warehouse,
        product: r.product, species: r.species, quality_class: r.quality_class,
        volume_m3: r.volume_m3, weighted_price_uah: r.weighted_price_uah, total_value_uah: r.total_value_uah,
        uploaded_by: user ? user.id : null
    }));

    for (let i = 0; i < rows.length; i += 500) {
        const { error } = await sb.from('forest_prices').insert(rows.slice(i, i + 500));
        if (error) throw new Error(error.message);
    }

    // Record upload history
    await sb.from('forest_upload_history').insert({
        data_type: 'prices', batch_id: batchId,
        file_name: fileName, row_count: records.length,
        uploaded_by: user ? user.id : null
    });

    return { count: records.length };
}

export async function saveInventoryData(records, fileName) {
    const { data: { user } } = await sb.auth.getUser();
    const batchId = crypto.randomUUID();

    // Delete existing data
    const { error: delErr } = await sb.from('forest_inventory').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (delErr) throw new Error(delErr.message);

    // Batch insert
    const rows = records.map(r => ({
        upload_batch_id: batchId,
        branch: r.branch, region: r.region, forest_unit: r.forest_unit,
        forestry_div: r.forestry_div, warehouse: r.warehouse,
        product: r.product, product_name: r.product_name, wood_group: r.wood_group,
        species: r.species, quality_class: r.quality_class, remaining_volume_m3: r.remaining_volume_m3,
        uploaded_by: user ? user.id : null
    }));

    for (let i = 0; i < rows.length; i += 500) {
        const { error } = await sb.from('forest_inventory').insert(rows.slice(i, i + 500));
        if (error) throw new Error(error.message);
    }

    // Record upload history
    await sb.from('forest_upload_history').insert({
        data_type: 'inventory', batch_id: batchId,
        file_name: fileName, row_count: records.length,
        uploaded_by: user ? user.id : null
    });

    return { count: records.length };
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
