// ===== Summary Database Operations (on-prem only) =====
// Reads: через compat views v_summary_* (drop-in shape для render'а).
// Writes: нормалізовані таблиці напряму + RPC fn_upload_monthly_batch
// для monthly uploads (alias resolution + routing server-side).
import { sb } from '../config.js';

// Read-path (compat views, shape ідентичний старому summary_*):
const R = {
    monthly:  'v_summary_indicators',
    weekly:   'v_summary_weekly',
    notes:    'v_summary_weekly_notes',
    comments: 'v_summary_block_comments',
    history:  'v_summary_upload_history',
};

// Write-path (real tables):
const W = {
    weekly:   'weekly_indicator_values',
    notes:    'weekly_notes',
    comments: 'block_comments',
    history:  'upload_history',
};

// weekly_indicator_values має колонку section_id (не section)
const WEEKLY_SECTION_COL = 'section_id';

// ===== Monthly Indicators (Excel upload) =====

export async function saveSummaryIndicators(records, fileName) {
    const { data: { session } } = await sb.auth.getSession();
    const userId = session?.user?.id || null;
    const batchId = crypto.randomUUID();

    // RPC fn_upload_monthly_batch робить normalize + alias lookup + routing
    // по indicator_values / volprice / salary / animal / reference_text.
    const jsonRows = records.map(r => ({
        year: r.year,
        month: r.month,
        indicator_name: r.indicator_name,
        indicator_group: r.indicator_group,
        value_numeric: r.value_numeric,
        value_text: r.value_text || null,
        unit: r.unit || null,
    }));

    const { data, error } = await sb.rpc('fn_upload_monthly_batch', {
        p_rows: jsonRows,
        p_batch_id: batchId,
        p_source_file: fileName || null,
    });
    if (error) throw new Error(`fn_upload_monthly_batch: ${error.message}`);

    const resolved = (data?.indicator || 0) + (data?.volprice || 0)
                   + (data?.salary || 0) + (data?.animal || 0) + (data?.reference || 0);

    await sb.from(W.history).insert({
        data_type: 'monthly_indicators', batch_id: batchId,
        file_name: fileName, row_count: records.length, uploaded_by: userId
    });

    if (data?.unresolved > 0) {
        console.warn(`[upload] ${data.unresolved} нерозпізнаних назв → indicator_alias_unresolved`);
    }
    return {
        added: resolved, updated: 0, total: records.length,
        skipped: (data?.skipped_header || 0) + (data?.skipped_annual || 0),
        unresolved: data?.unresolved || 0,
        breakdown: data,
    };
}

export async function loadSummaryIndicators(year = null) {
    const { paginatedLoad } = await import('../db-utils.js');
    const filters = year ? [{ col: 'year', op: 'eq', val: year }] : [];
    return paginatedLoad(R.monthly, { filters });
}

// ===== Weekly Briefing =====

export async function saveSummaryWeekly(records, notes, reportDate, fileName) {
    const { data: { session } } = await sb.auth.getSession();
    const userId = session?.user?.id || null;
    const batchId = crypto.randomUUID();

    const { count: before } = await sb.from(W.weekly)
        .select('*', { count: 'exact', head: true })
        .eq('report_date', reportDate);

    let upsertCount = 0;
    if (records.length) {
        const dedup = new Map();
        for (const r of records) dedup.set(`${r.section}|${r.indicator_name}`, r);
        const unique = [...dedup.values()];
        upsertCount = unique.length;

        for (const r of unique) {
            const row = {
                upload_batch_id: batchId, report_date: reportDate,
                [WEEKLY_SECTION_COL]: r.section, indicator_name: r.indicator_name,
                value_current: r.value_current, value_previous: r.value_previous,
                value_ytd: r.value_ytd, value_delta: r.value_delta,
                value_yoy: r.value_yoy ?? null,
                value_text: r.value_text || null, unit: r.unit || null,
                uploaded_by: userId
            };
            const { data: existing } = await sb.from(W.weekly).select('id')
                .eq('report_date', reportDate)
                .eq(WEEKLY_SECTION_COL, r.section)
                .eq('indicator_name', r.indicator_name)
                .maybeSingle();
            if (existing) {
                await sb.from(W.weekly).update(row).eq('id', existing.id);
            } else {
                const { error } = await sb.from(W.weekly).insert(row);
                if (error) console.warn('Insert skip:', r.section, r.indicator_name, error.message);
            }
        }
    }

    let notesCount = 0;
    if (notes && notes.length) {
        const noteDedup = new Map();
        for (const n of notes) {
            if (n.content?.trim()) noteDedup.set(n.note_type, n);
        }
        for (const [, n] of noteDedup) {
            notesCount++;
            const { data: existing } = await sb.from(W.notes).select('id')
                .eq('report_date', reportDate).eq('note_type', n.note_type)
                .maybeSingle();
            const row = { report_date: reportDate, note_type: n.note_type, content: n.content.trim(), uploaded_by: userId };
            if (existing) {
                await sb.from(W.notes).update(row).eq('id', existing.id);
            } else {
                await sb.from(W.notes).insert(row);
            }
        }
    }

    const { count: after } = await sb.from(W.weekly)
        .select('*', { count: 'exact', head: true })
        .eq('report_date', reportDate);

    const added = (after || 0) - (before || 0);
    const updated = upsertCount - added;

    await sb.from(W.history).insert({
        data_type: 'weekly_briefing', batch_id: batchId,
        file_name: fileName || `weekly_${reportDate}`, row_count: upsertCount, uploaded_by: userId
    });

    return { added, updated, total: upsertCount, notes: notesCount };
}

export async function loadSummaryWeekly(limit = 0) {
    const { data: dates, error: dErr } = await sb.from(R.weekly)
        .select('report_date')
        .order('report_date', { ascending: false });
    if (dErr) throw new Error(dErr.message);
    let uniqueDates = [...new Set((dates || []).map(d => d.report_date))];
    if (limit > 0) uniqueDates = uniqueDates.slice(0, limit);
    if (!uniqueDates.length) return [];

    const all = [];
    for (const rd of uniqueDates) {
        const { data, error } = await sb.from(R.weekly)
            .select('*').eq('report_date', rd).order('created_at', { ascending: true });
        if (error) throw new Error(error.message);
        if (data) all.push(...data);
    }
    return all;
}

export async function loadSummaryWeeklyNotes(reportDate = null) {
    let q = sb.from(R.notes).select('*');
    if (reportDate) {
        q = q.eq('report_date', reportDate);
    } else {
        q = q.order('report_date', { ascending: false });
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data || [];
}

// ===== Counts =====

export async function getSummaryIndicatorCount() {
    const { count, error } = await sb.from(R.monthly).select('*', { count: 'exact', head: true });
    if (error) throw new Error(error.message);
    return count || 0;
}

export async function getSummaryWeeklyCount() {
    const { count, error } = await sb.from(R.weekly).select('*', { count: 'exact', head: true });
    if (error) throw new Error(error.message);
    return count || 0;
}

// ===== Clear (admin) =====

export async function clearSummaryIndicators() {
    // Truncate усіх 4 normalized monthly-таблиць
    for (const t of ['indicator_values', 'indicator_volprice_values', 'salary_values', 'animal_values', 'reference_text']) {
        const { error } = await sb.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (error) throw new Error(`clear ${t}: ${error.message}`);
    }
    await sb.from(W.history).delete().eq('data_type', 'monthly_indicators');
}

// ===== Block Comments =====

export async function loadBlockComments(reportType, reportDate, year, month) {
    let q = sb.from(R.comments).select('*').eq('report_type', reportType);
    if (reportType === 'weekly' && reportDate) q = q.eq('report_date', reportDate);
    if (reportType === 'monthly') { q = q.eq('report_year', year).eq('report_month', month); }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data || [];
}

export async function saveBlockComment({ reportType, reportDate, reportYear, reportMonth, blockId, content }) {
    const { data: { session } } = await sb.auth.getSession();

    let q = sb.from(W.comments).select('id')
        .eq('report_type', reportType).eq('block_id', blockId);
    if (reportType === 'weekly') q = q.eq('report_date', reportDate);
    if (reportType === 'monthly') q = q.eq('report_year', reportYear).eq('report_month', reportMonth);
    const { data: existing } = await q.maybeSingle();

    if (existing) {
        const { error } = await sb.from(W.comments)
            .update({ content, updated_at: new Date().toISOString() })
            .eq('id', existing.id);
        if (error) throw new Error(error.message);
    } else {
        const row = {
            report_type: reportType, block_id: blockId, content,
            created_by: session?.user?.id || null,
            updated_at: new Date().toISOString()
        };
        if (reportType === 'weekly') row.report_date = reportDate;
        if (reportType === 'monthly') { row.report_year = reportYear; row.report_month = reportMonth; }
        const { error } = await sb.from(W.comments).insert(row);
        if (error) throw new Error(error.message);
    }
}

export async function deleteBlockComment(id) {
    const { error } = await sb.from(W.comments).delete().eq('id', id);
    if (error) throw new Error(error.message);
}

// ===== Indicator History (infographic modal) =====

export async function loadWeeklyIndicatorHistory(section, indicatorName, limit = 20) {
    const { data, error } = await sb.from(R.weekly)
        .select('*')
        .eq('section', section)
        .eq('indicator_name', indicatorName)
        .order('report_date', { ascending: false })
        .limit(limit);
    if (error) throw new Error(error.message);
    return (data || []).reverse();
}

export async function loadMonthlyIndicatorHistory(indicatorName, subType, limit = 200) {
    // Fuzzy match (legacy fallback для infographic modal'я, яка передає canonical_name)
    let pattern;
    if (indicatorName.length <= 10) {
        pattern = '%' + indicatorName + '%';
    } else {
        const words = indicatorName.replace(/['''\u2019"()*]/g, '%').split(/[\s,]+/).filter(w => w.length > 2);
        pattern = '%' + words.slice(0, 3).join('%') + '%';
    }
    const { data, error } = await sb.from(R.monthly)
        .select('*')
        .ilike('indicator_name', pattern)
        .order('year', { ascending: true })
        .order('month', { ascending: true })
        .limit(limit);
    if (error) throw new Error(error.message);
    const seen = new Set();
    return (data || []).filter(r => {
        const key = `${r.year}-${r.month}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// ===== Clear (weekly) =====

export async function clearSummaryWeekly() {
    const { error } = await sb.from(W.weekly).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw new Error(error.message);
    await sb.from(W.notes).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await sb.from(W.history).delete().eq('data_type', 'weekly_briefing');
}

export async function deleteWeeklyByDate(reportDate) {
    const { error } = await sb.from(W.weekly).delete().eq('report_date', reportDate);
    if (error) throw new Error(error.message);
    await sb.from(W.notes).delete().eq('report_date', reportDate);
    await sb.from(W.comments).delete().eq('report_type', 'weekly').eq('report_date', reportDate);
}

export async function deleteMonthlyByMonth(year, month) {
    for (const t of ['indicator_values', 'indicator_volprice_values', 'salary_values']) {
        const { error } = await sb.from(t).delete().eq('period_year', year).eq('period_month', month);
        if (error) throw new Error(`delete ${t}: ${error.message}`);
    }
    await sb.from(W.comments).delete().eq('report_type', 'monthly').eq('report_date', `${year}-${String(month).padStart(2,'0')}-01`);
}
