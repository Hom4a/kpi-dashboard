// ===== Wood Accounting Database Operations =====
import { sb } from '../config.js';

export async function saveReceptionData(parsed, fileName) {
    const { data: { session } } = await sb.auth.getSession();
    const userId = session?.user?.id || null;
    const batchId = crypto.randomUUID();

    const { periodStart, periodEnd, rows } = parsed;

    // Duplicate check: same period
    const { count } = await sb.from('wood_reception')
        .select('*', { count: 'exact', head: true })
        .eq('period_start', periodStart)
        .eq('period_end', periodEnd);

    if (count > 0) {
        // Replace existing data for this period
        await sb.from('wood_reception')
            .delete()
            .eq('period_start', periodStart)
            .eq('period_end', periodEnd);
    }

    const dbRows = rows.map(r => ({
        period_start: periodStart, period_end: periodEnd,
        regional_office: r.regional_office,
        firewood_np_m3: r.firewood_np_m3, firewood_pv_m3: r.firewood_pv_m3,
        long_timber_m3: r.long_timber_m3, round_timber_m3: r.round_timber_m3,
        total_m3: r.total_m3,
        upload_batch_id: batchId, uploaded_by: userId
    }));

    const { error } = await sb.from('wood_reception').insert(dbRows);
    if (error) throw new Error(error.message);

    await sb.from('wood_upload_history').insert({
        data_type: 'reception', batch_id: batchId, file_name: fileName,
        period_start: periodStart, period_end: periodEnd,
        row_count: rows.length, uploaded_by: userId
    });

    return { added: rows.length, replaced: count > 0 ? count : 0 };
}

export async function saveSalesData(parsed, fileName) {
    const { data: { session } } = await sb.auth.getSession();
    const userId = session?.user?.id || null;
    const batchId = crypto.randomUUID();

    const { periodStart, periodEnd, rows } = parsed;

    const { count } = await sb.from('wood_sales')
        .select('*', { count: 'exact', head: true })
        .eq('period_start', periodStart)
        .eq('period_end', periodEnd);

    if (count > 0) {
        await sb.from('wood_sales')
            .delete()
            .eq('period_start', periodStart)
            .eq('period_end', periodEnd);
    }

    const dbRows = rows.map(r => ({
        period_start: periodStart, period_end: periodEnd,
        regional_office: r.regional_office,
        volume_m3: r.volume_m3, avg_price_uah: r.avg_price_uah,
        amount_excl_vat: r.amount_excl_vat,
        upload_batch_id: batchId, uploaded_by: userId
    }));

    const { error } = await sb.from('wood_sales').insert(dbRows);
    if (error) throw new Error(error.message);

    await sb.from('wood_upload_history').insert({
        data_type: 'sales', batch_id: batchId, file_name: fileName,
        period_start: periodStart, period_end: periodEnd,
        row_count: rows.length, uploaded_by: userId
    });

    return { added: rows.length, replaced: count > 0 ? count : 0 };
}

export async function loadReceptionData() {
    const { data, error } = await sb.from('wood_reception')
        .select('*').order('period_end', { ascending: false });
    return error ? [] : (data || []);
}

export async function loadSalesData() {
    const { data, error } = await sb.from('wood_sales')
        .select('*').order('period_end', { ascending: false });
    return error ? [] : (data || []);
}

export async function clearReceptionData() {
    await sb.from('wood_reception').delete().neq('id', '00000000-0000-0000-0000-000000000000');
}

export async function clearSalesData() {
    await sb.from('wood_sales').delete().neq('id', '00000000-0000-0000-0000-000000000000');
}
