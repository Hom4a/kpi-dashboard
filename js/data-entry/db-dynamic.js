// ===== Dynamic Data CRUD =====
import { sb } from '../config.js';

// ===== Dataset Types =====

export async function loadDatasetTypes() {
    const { data, error } = await sb.from('dataset_types').select('*').order('display_name');
    if (error) throw new Error(error.message);
    return data || [];
}

export async function saveDatasetType(type) {
    if (type.id) {
        const { data, error } = await sb.from('dataset_types')
            .update({ ...type, updated_at: new Date().toISOString() })
            .eq('id', type.id)
            .select()
            .single();
        if (error) throw new Error(error.message);
        return data;
    } else {
        const { data: { user } } = await sb.auth.getUser();
        const { data, error } = await sb.from('dataset_types')
            .insert({ ...type, created_by: user ? user.id : null })
            .select()
            .single();
        if (error) throw new Error(error.message);
        return data;
    }
}

export async function deleteDatasetType(id) {
    const { error } = await sb.from('dataset_types').delete().eq('id', id);
    if (error) throw new Error(error.message);
}

// ===== Custom Datasets (JSONB storage) =====

export async function loadCustomRecords(datasetTypeId) {
    const all = []; let from = 0;
    while (true) {
        const { data, error } = await sb.from('custom_datasets')
            .select('*')
            .eq('dataset_type_id', datasetTypeId)
            .order('created_at', { ascending: false })
            .range(from, from + 999);
        if (error) throw new Error(error.message);
        if (!data || !data.length) break;
        all.push(...data);
        if (data.length < 1000) break;
        from += 1000;
    }
    return all;
}

export async function saveCustomRecords(datasetTypeId, records) {
    const { data: { user } } = await sb.auth.getUser();
    const batchId = crypto.randomUUID();

    const rows = records.map(r => ({
        dataset_type_id: datasetTypeId,
        data: r,
        upload_batch_id: batchId,
        created_by: user ? user.id : null
    }));

    for (let i = 0; i < rows.length; i += 500) {
        const { error } = await sb.from('custom_datasets').insert(rows.slice(i, i + 500));
        if (error) throw new Error(error.message);
    }

    return { count: rows.length, batchId };
}

export async function updateCustomRecord(id, data) {
    const { error } = await sb.from('custom_datasets')
        .update({ data, updated_at: new Date().toISOString() })
        .eq('id', id);
    if (error) throw new Error(error.message);
}

export async function deleteCustomRecord(id) {
    const { error } = await sb.from('custom_datasets').delete().eq('id', id);
    if (error) throw new Error(error.message);
}

export async function clearCustomRecords(datasetTypeId) {
    const { error } = await sb.from('custom_datasets')
        .delete()
        .eq('dataset_type_id', datasetTypeId);
    if (error) throw new Error(error.message);
}

export async function getCustomRecordCount(datasetTypeId) {
    const { count, error } = await sb.from('custom_datasets')
        .select('*', { count: 'exact', head: true })
        .eq('dataset_type_id', datasetTypeId);
    if (error) throw new Error(error.message);
    return count || 0;
}

// ===== System table CRUD (for system dataset types with target_table) =====

export async function loadSystemRecords(tableName) {
    const all = []; let from = 0;
    while (true) {
        const { data, error } = await sb.from(tableName).select('*').range(from, from + 999);
        if (error) throw new Error(error.message);
        if (!data || !data.length) break;
        all.push(...data);
        if (data.length < 1000) break;
        from += 1000;
    }
    return all;
}

export async function saveSystemRecords(tableName, records) {
    const { data: { user } } = await sb.auth.getUser();
    const batchId = crypto.randomUUID();

    const rows = records.map(r => ({
        ...r,
        upload_batch_id: batchId,
        uploaded_by: user ? user.id : null
    }));

    for (let i = 0; i < rows.length; i += 500) {
        const { error } = await sb.from(tableName).insert(rows.slice(i, i + 500));
        if (error) throw new Error(error.message);
    }

    return { count: rows.length, batchId };
}

export async function saveSingleRecord(dsType, record) {
    const { data: { user } } = await sb.auth.getUser();

    if (dsType.is_system && dsType.target_table) {
        // Save directly to the system table
        const row = { ...record, uploaded_by: user ? user.id : null };
        const { data, error } = await sb.from(dsType.target_table)
            .insert(row)
            .select()
            .single();
        if (error) throw new Error(error.message);
        return data;
    } else {
        // Save to custom_datasets as JSONB
        const { data, error } = await sb.from('custom_datasets')
            .insert({
                dataset_type_id: dsType.id,
                data: record,
                created_by: user ? user.id : null
            })
            .select()
            .single();
        if (error) throw new Error(error.message);
        return data;
    }
}

export async function updateSingleRecord(dsType, id, record) {
    if (dsType.is_system && dsType.target_table) {
        const { error } = await sb.from(dsType.target_table)
            .update({ ...record, updated_at: new Date().toISOString() })
            .eq('id', id);
        if (error) throw new Error(error.message);
    } else {
        const { error } = await sb.from('custom_datasets')
            .update({ data: record, updated_at: new Date().toISOString() })
            .eq('id', id);
        if (error) throw new Error(error.message);
    }
}

export async function deleteSingleRecord(dsType, id) {
    const table = dsType.is_system && dsType.target_table ? dsType.target_table : 'custom_datasets';
    const { error } = await sb.from(table).delete().eq('id', id);
    if (error) throw new Error(error.message);
}

// ===== Load records for any dataset type =====

export async function loadRecordsForType(dsType) {
    if (dsType.is_system && dsType.target_table) {
        return await loadSystemRecords(dsType.target_table);
    } else {
        const raw = await loadCustomRecords(dsType.id);
        // Flatten: merge id + data JSONB into single objects
        return raw.map(r => ({ _id: r.id, _created_at: r.created_at, _created_by: r.created_by, ...r.data }));
    }
}

export async function getRecordCountForType(dsType) {
    if (dsType.is_system && dsType.target_table) {
        const { count, error } = await sb.from(dsType.target_table)
            .select('*', { count: 'exact', head: true });
        if (error) throw new Error(error.message);
        return count || 0;
    } else {
        return await getCustomRecordCount(dsType.id);
    }
}
