// ===== Summary Database Operations =====
import { sb } from '../config.js';

const BATCH = 500;

// ===== Monthly Indicators (from xlsx) =====

export async function saveSummaryIndicators(records, fileName) {
    const { data: { session } } = await sb.auth.getSession();
    const userId = session?.user?.id || null;
    const batchId = crypto.randomUUID();

    const rows = records.map(r => ({
        upload_batch_id: batchId,
        year: r.year,
        month: r.month,
        indicator_group: r.indicator_group,
        indicator_name: r.indicator_name,
        sub_type: r.sub_type || 'value',
        value_numeric: r.value_numeric,
        value_text: r.value_text || null,
        unit: r.unit || null,
        uploaded_by: userId
    }));

    // Count existing before upsert to determine added vs updated
    const { count: before } = await sb.from('summary_indicators')
        .select('*', { count: 'exact', head: true });

    // Upsert works correctly because we have UNIQUE INDEX on (year, month, indicator_name, sub_type)
    for (let i = 0; i < rows.length; i += BATCH) {
        const { error } = await sb.from('summary_indicators')
            .upsert(rows.slice(i, i + BATCH), { onConflict: 'year,month,indicator_name,sub_type' });
        if (error) throw new Error(error.message);
    }

    const { count: after } = await sb.from('summary_indicators')
        .select('*', { count: 'exact', head: true });

    const added = (after || 0) - (before || 0);
    const updated = rows.length - added;

    await sb.from('summary_upload_history').insert({
        data_type: 'monthly_indicators', batch_id: batchId,
        file_name: fileName, row_count: rows.length, uploaded_by: userId
    });

    return { added, updated, total: rows.length };
}

export async function loadSummaryIndicators(year = null) {
    const { paginatedLoad } = await import('../db-utils.js');
    const filters = year ? [{ col: 'year', op: 'eq', val: year }] : [];
    return paginatedLoad('summary_indicators', { filters });
}

// ===== Weekly Briefing =====

export async function saveSummaryWeekly(records, notes, reportDate, fileName) {
    const { data: { session } } = await sb.auth.getSession();
    const userId = session?.user?.id || null;
    const batchId = crypto.randomUUID();

    // Count existing records for this date before upsert
    const { count: before } = await sb.from('summary_weekly')
        .select('*', { count: 'exact', head: true })
        .eq('report_date', reportDate);

    // Deduplicate records (keep last occurrence for same section+indicator)
    let upsertCount = 0;
    if (records.length) {
        const dedup = new Map();
        for (const r of records) {
            dedup.set(`${r.section}|${r.indicator_name}`, r);
        }
        const unique = [...dedup.values()];
        upsertCount = unique.length;

        // Insert/update one by one to avoid partial-index upsert issues
        for (const r of unique) {
            const row = {
                upload_batch_id: batchId, report_date: reportDate,
                section: r.section, indicator_name: r.indicator_name,
                value_current: r.value_current, value_previous: r.value_previous,
                value_ytd: r.value_ytd, value_delta: r.value_delta,
                value_text: r.value_text || null, unit: r.unit || null,
                uploaded_by: userId
            };
            const { data: existing } = await sb.from('summary_weekly').select('id')
                .eq('report_date', reportDate).eq('section', r.section).eq('indicator_name', r.indicator_name)
                .maybeSingle();
            if (existing) {
                await sb.from('summary_weekly').update(row).eq('id', existing.id);
            } else {
                const { error } = await sb.from('summary_weekly').insert(row);
                if (error) console.warn('Insert skip:', r.section, r.indicator_name, error.message);
            }
        }
    }

    // Save text notes (deduplicate by note_type, insert/update)
    let notesCount = 0;
    if (notes && notes.length) {
        const noteDedup = new Map();
        for (const n of notes) {
            if (n.content?.trim()) noteDedup.set(n.note_type, n);
        }
        for (const [, n] of noteDedup) {
            notesCount++;
            const { data: existing } = await sb.from('summary_weekly_notes').select('id')
                .eq('report_date', reportDate).eq('note_type', n.note_type)
                .maybeSingle();
            const row = { report_date: reportDate, note_type: n.note_type, content: n.content.trim(), uploaded_by: userId };
            if (existing) {
                await sb.from('summary_weekly_notes').update(row).eq('id', existing.id);
            } else {
                await sb.from('summary_weekly_notes').insert(row);
            }
        }
    }

    // Count after upsert to determine added vs updated
    const { count: after } = await sb.from('summary_weekly')
        .select('*', { count: 'exact', head: true })
        .eq('report_date', reportDate);

    const added = (after || 0) - (before || 0);
    const updated = upsertCount - added;

    await sb.from('summary_upload_history').insert({
        data_type: 'weekly_briefing', batch_id: batchId,
        file_name: fileName || `weekly_${reportDate}`, row_count: upsertCount, uploaded_by: userId
    });

    return { added, updated, total: upsertCount, notes: notesCount };
}

export async function loadSummaryWeekly(limit = 0) {
    // Load ALL weeks (no limit by default) for full accumulation
    const { data: dates, error: dErr } = await sb.from('summary_weekly')
        .select('report_date')
        .order('report_date', { ascending: false });
    if (dErr) throw new Error(dErr.message);
    let uniqueDates = [...new Set((dates || []).map(d => d.report_date))];
    if (limit > 0) uniqueDates = uniqueDates.slice(0, limit);
    if (!uniqueDates.length) return [];

    const all = [];
    for (const rd of uniqueDates) {
        const { data, error } = await sb.from('summary_weekly')
            .select('*').eq('report_date', rd).order('created_at', { ascending: true });
        if (error) throw new Error(error.message);
        if (data) all.push(...data);
    }
    return all;
}

export async function loadSummaryWeeklyNotes(reportDate = null) {
    let q = sb.from('summary_weekly_notes').select('*');
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
    const { count, error } = await sb.from('summary_indicators').select('*', { count: 'exact', head: true });
    if (error) throw new Error(error.message);
    return count || 0;
}

export async function getSummaryWeeklyCount() {
    const { count, error } = await sb.from('summary_weekly').select('*', { count: 'exact', head: true });
    if (error) throw new Error(error.message);
    return count || 0;
}

// ===== Clear =====

export async function clearSummaryIndicators() {
    const { error } = await sb.from('summary_indicators').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw new Error(error.message);
    await sb.from('summary_upload_history').delete().eq('data_type', 'monthly_indicators');
}

// ===== Block Comments =====

export async function loadBlockComments(reportType, reportDate, year, month) {
    let q = sb.from('summary_block_comments').select('*').eq('report_type', reportType);
    if (reportType === 'weekly' && reportDate) q = q.eq('report_date', reportDate);
    if (reportType === 'monthly') { q = q.eq('report_year', year).eq('report_month', month); }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data || [];
}

export async function saveBlockComment({ reportType, reportDate, reportYear, reportMonth, blockId, content }) {
    const { data: { session } } = await sb.auth.getSession();

    // Find existing comment (partial unique index doesn't work with Supabase upsert)
    let q = sb.from('summary_block_comments').select('id')
        .eq('report_type', reportType).eq('block_id', blockId);
    if (reportType === 'weekly') q = q.eq('report_date', reportDate);
    if (reportType === 'monthly') q = q.eq('report_year', reportYear).eq('report_month', reportMonth);
    const { data: existing } = await q.maybeSingle();

    if (existing) {
        const { error } = await sb.from('summary_block_comments')
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
        const { error } = await sb.from('summary_block_comments').insert(row);
        if (error) throw new Error(error.message);
    }
}

export async function deleteBlockComment(id) {
    const { error } = await sb.from('summary_block_comments').delete().eq('id', id);
    if (error) throw new Error(error.message);
}

// ===== Indicator History (for infographic modal) =====

export async function loadWeeklyIndicatorHistory(section, indicatorName, limit = 20) {
    const { data, error } = await sb.from('summary_weekly')
        .select('*')
        .eq('section', section)
        .eq('indicator_name', indicatorName)
        .order('report_date', { ascending: false })
        .limit(limit);
    if (error) throw new Error(error.message);
    return (data || []).reverse();
}

export async function loadMonthlyIndicatorHistory(indicatorName, subType, limit = 200) {
    // Fuzzy match: use first significant words to avoid over-specific patterns
    // Short names (≤10 chars) → use as-is; longer → first 3 words with length > 2
    let pattern;
    if (indicatorName.length <= 10) {
        pattern = '%' + indicatorName + '%';
    } else {
        const words = indicatorName.replace(/['''\u2019"()*]/g, '%').split(/[\s,]+/).filter(w => w.length > 2);
        // Use first 2 words for better matching of name variants
        pattern = '%' + words.slice(0, 2).join('%') + '%';
    }
    let q = sb.from('summary_indicators')
        .select('*')
        .ilike('indicator_name', pattern)
        .order('year', { ascending: true })
        .order('month', { ascending: true })
        .limit(limit);
    if (subType) q = q.eq('sub_type', subType);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    // Deduplicate by (year, month) — keep first (prefer sub_type='value')
    const seen = new Set();
    return (data || []).filter(r => {
        const key = `${r.year}-${r.month}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// ===== Clear =====

export async function clearSummaryWeekly() {
    const { error } = await sb.from('summary_weekly').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw new Error(error.message);
    await sb.from('summary_weekly_notes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await sb.from('summary_upload_history').delete().eq('data_type', 'weekly_briefing');
}

export async function deleteWeeklyByDate(reportDate) {
    const { error } = await sb.from('summary_weekly').delete().eq('report_date', reportDate);
    if (error) throw new Error(error.message);
    await sb.from('summary_weekly_notes').delete().eq('report_date', reportDate);
    await sb.from('summary_block_comments').delete().eq('report_type', 'weekly').eq('report_date', reportDate);
}

export async function deleteMonthlyByMonth(year, month) {
    const { error } = await sb.from('summary_indicators').delete().eq('year', year).eq('month', month);
    if (error) throw new Error(error.message);
    await sb.from('summary_block_comments').delete().eq('report_type', 'monthly').eq('report_date', `${year}-${String(month).padStart(2,'0')}-01`);
}
