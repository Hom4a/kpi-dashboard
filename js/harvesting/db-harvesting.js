// ===== Harvesting Database Operations =====
import { sb } from '../config.js';

export async function savePlanFactData(records, fileName) {
    const { data: { user } } = await sb.auth.getUser();
    const batchId = crypto.randomUUID();
    const { error: delErr } = await sb.from('harvesting_plan_fact').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (delErr) throw new Error(delErr.message);
    const rows = records.map(r => ({ upload_batch_id: batchId, ...r, uploaded_by: user ? user.id : null }));
    for (let i = 0; i < rows.length; i += 500) {
        const { error } = await sb.from('harvesting_plan_fact').insert(rows.slice(i, i + 500));
        if (error) throw new Error(error.message);
    }
    await sb.from('forest_upload_history').insert({
        data_type: 'harvesting_plan_fact', batch_id: batchId,
        file_name: fileName, row_count: records.length,
        uploaded_by: user ? user.id : null
    });
    return { count: records.length };
}

export async function saveZsuData(records, fileName) {
    const { data: { user } } = await sb.auth.getUser();
    const batchId = crypto.randomUUID();
    const { error: delErr } = await sb.from('harvesting_zsu').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (delErr) throw new Error(delErr.message);
    const rows = records.map(r => ({ upload_batch_id: batchId, ...r, uploaded_by: user ? user.id : null }));
    for (let i = 0; i < rows.length; i += 500) {
        const { error } = await sb.from('harvesting_zsu').insert(rows.slice(i, i + 500));
        if (error) throw new Error(error.message);
    }
    await sb.from('forest_upload_history').insert({
        data_type: 'harvesting_zsu', batch_id: batchId,
        file_name: fileName, row_count: records.length,
        uploaded_by: user ? user.id : null
    });
    return { count: records.length };
}

export async function loadPlanFactData() {
    const all = []; let from = 0;
    while (true) {
        const { data, error } = await sb.from('harvesting_plan_fact').select('*').range(from, from + 999);
        if (error) throw new Error(error.message);
        if (!data || !data.length) break;
        all.push(...data);
        if (data.length < 1000) break;
        from += 1000;
    }
    return all;
}

export async function loadZsuData() {
    const all = []; let from = 0;
    while (true) {
        const { data, error } = await sb.from('harvesting_zsu').select('*').range(from, from + 999);
        if (error) throw new Error(error.message);
        if (!data || !data.length) break;
        all.push(...data);
        if (data.length < 1000) break;
        from += 1000;
    }
    return all;
}
