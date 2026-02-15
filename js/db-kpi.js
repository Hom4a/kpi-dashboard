// ===== KPI Database Operations (Smart Merge + Batch Tracking) =====
import { sb } from './config.js';

export async function saveRecords(records, fileName) {
    const { data: { user } } = await sb.auth.getUser();
    const batchId = crypto.randomUUID();

    // Smart merge: fetch existing IDs, insert only new records
    const existingIds = new Set();
    let from = 0;
    while (true) {
        const { data, error } = await sb.from('kpi_records').select('id').range(from, from + 4999);
        if (error) throw new Error(error.message);
        if (!data || !data.length) break;
        data.forEach(r => existingIds.add(r.id));
        if (data.length < 5000) break;
        from += 5000;
    }

    const rows = records.map(r => ({
        id: r.date + '|' + r.indicator, date: r.date, indicator: r.indicator,
        type: r.type, value: r.value, unit: r.unit || '',
        upload_batch_id: batchId,
        uploaded_by: user ? user.id : null, updated_at: new Date().toISOString()
    }));

    const newRows = rows.filter(r => !existingIds.has(r.id));
    const skippedCount = rows.length - newRows.length;

    if (newRows.length === 0) {
        return { added: 0, skipped: skippedCount };
    }

    for (let i = 0; i < newRows.length; i += 500) {
        const { error } = await sb.from('kpi_records').insert(newRows.slice(i, i + 500));
        if (error) throw new Error(error.message);
    }

    // Record upload history
    await sb.from('forest_upload_history').insert({
        data_type: 'kpi', batch_id: batchId,
        file_name: fileName || 'KPI upload',
        row_count: newRows.length,
        uploaded_by: user ? user.id : null
    });

    return { added: newRows.length, skipped: skippedCount };
}

export async function loadAllRecords() {
    const all = []; let from = 0;
    while (true) {
        const { data, error } = await sb.from('kpi_records').select('*').range(from, from + 999);
        if (error) throw new Error(error.message);
        if (!data || !data.length) break;
        all.push(...data);
        if (data.length < 1000) break;
        from += 1000;
    }
    return all;
}

export async function clearDB() {
    const { error } = await sb.from('kpi_records').delete().neq('id', '');
    if (error) throw new Error(error.message);
    // Also clean up KPI upload history
    await sb.from('forest_upload_history').delete().eq('data_type', 'kpi');
}

export async function getRecordCount() {
    const { count, error } = await sb.from('kpi_records').select('*', { count: 'exact', head: true });
    if (error) throw new Error(error.message);
    return count || 0;
}

export async function undoLastKpiUpload() {
    const { data: history, error: hErr } = await sb.from('forest_upload_history')
        .select('*')
        .eq('data_type', 'kpi')
        .order('uploaded_at', { ascending: false })
        .limit(1);
    if (hErr) throw new Error(hErr.message);
    if (!history || !history.length) throw new Error('Немає завантажень для скасування');

    const lastUpload = history[0];

    const { error: delErr } = await sb.from('kpi_records')
        .delete()
        .eq('upload_batch_id', lastUpload.batch_id);
    if (delErr) throw new Error(delErr.message);

    const { error: hDelErr } = await sb.from('forest_upload_history')
        .delete()
        .eq('id', lastUpload.id);
    if (hDelErr) throw new Error(hDelErr.message);

    return { removed: lastUpload.row_count, fileName: lastUpload.file_name };
}

export async function getUploadHistory(dataType) {
    const { data, error } = await sb.from('forest_upload_history')
        .select('*')
        .eq('data_type', dataType)
        .order('uploaded_at', { ascending: false })
        .limit(5);
    if (error) throw new Error(error.message);
    return data || [];
}
