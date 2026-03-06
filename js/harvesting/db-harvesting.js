// ===== Harvesting Database Operations =====
import { sb } from '../config.js';

// ===== RPC-based aggregation (server-side, fast) =====
export async function fetchHarvestingSummary() {
    try {
        const { data, error } = await sb.rpc('get_harvesting_summary');
        if (error || !data) return null;
        return data;
    } catch { return null; }
}

export async function savePlanFactData(records, fileName) {
    const { data: { session } } = await sb.auth.getSession();
    const userId = session?.user?.id || null;
    const batchId = crypto.randomUUID();

    // Fetch existing composite keys (regional_office)
    const { data: existing } = await sb.from('harvesting_plan_fact').select('regional_office');
    const existingKeys = new Set((existing || []).map(r => r.regional_office));

    const rows = records.map(r => ({ upload_batch_id: batchId, ...r, uploaded_by: userId }));
    const newRows = rows.filter(r => !existingKeys.has(r.regional_office));
    const replacedKeys = rows.filter(r => existingKeys.has(r.regional_office)).map(r => r.regional_office);

    // Delete existing records that will be replaced
    if (replacedKeys.length) {
        await sb.from('harvesting_plan_fact').delete().in('regional_office', replacedKeys);
    }

    // Insert all records (new + replacements)
    for (let i = 0; i < rows.length; i += 500) {
        const { error } = await sb.from('harvesting_plan_fact').insert(rows.slice(i, i + 500));
        if (error) throw new Error(error.message);
    }
    await sb.from('forest_upload_history').insert({
        data_type: 'harvesting_plan_fact', batch_id: batchId,
        file_name: fileName, row_count: rows.length, uploaded_by: userId
    });
    return { added: newRows.length, replaced: replacedKeys.length };
}

export async function saveZsuData(records, fileName) {
    const { data: { session } } = await sb.auth.getSession();
    const userId = session?.user?.id || null;
    const batchId = crypto.randomUUID();

    // Fetch existing composite keys (regional_office)
    const { data: existing } = await sb.from('harvesting_zsu').select('regional_office');
    const existingKeys = new Set((existing || []).map(r => r.regional_office));

    const rows = records.map(r => ({ upload_batch_id: batchId, ...r, uploaded_by: userId }));
    const newRows = rows.filter(r => !existingKeys.has(r.regional_office));
    const replacedKeys = rows.filter(r => existingKeys.has(r.regional_office)).map(r => r.regional_office);

    // Delete existing records that will be replaced
    if (replacedKeys.length) {
        await sb.from('harvesting_zsu').delete().in('regional_office', replacedKeys);
    }

    // Insert all records (new + replacements)
    for (let i = 0; i < rows.length; i += 500) {
        const { error } = await sb.from('harvesting_zsu').insert(rows.slice(i, i + 500));
        if (error) throw new Error(error.message);
    }
    await sb.from('forest_upload_history').insert({
        data_type: 'harvesting_zsu', batch_id: batchId,
        file_name: fileName, row_count: rows.length, uploaded_by: userId
    });
    return { added: newRows.length, replaced: replacedKeys.length };
}

export async function loadPlanFactData() {
    const { paginatedLoad } = await import('../db-utils.js');
    return paginatedLoad('harvesting_plan_fact');
}

export async function loadZsuData() {
    const { paginatedLoad } = await import('../db-utils.js');
    return paginatedLoad('harvesting_zsu');
}

export async function clearPlanFactData() {
    const { error } = await sb.from('harvesting_plan_fact').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw new Error(error.message);
    await sb.from('forest_upload_history').delete().eq('data_type', 'harvesting_plan_fact');
}

export async function clearZsuData() {
    const { error } = await sb.from('harvesting_zsu').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw new Error(error.message);
    await sb.from('forest_upload_history').delete().eq('data_type', 'harvesting_zsu');
}

export async function getPlanFactCount() {
    const { count, error } = await sb.from('harvesting_plan_fact').select('*', { count: 'exact', head: true });
    if (error) throw new Error(error.message);
    return count || 0;
}

export async function getZsuCount() {
    const { count, error } = await sb.from('harvesting_zsu').select('*', { count: 'exact', head: true });
    if (error) throw new Error(error.message);
    return count || 0;
}
