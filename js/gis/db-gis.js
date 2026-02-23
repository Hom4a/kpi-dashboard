// ===== GIS Database — Regional Offices CRUD =====
import { sb } from '../config.js';

export async function loadRegionalOffices() {
    const { data, error } = await sb
        .from('regional_offices')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
    if (error) throw new Error(error.message);
    return data || [];
}

export async function saveRegionalOffice(office) {
    const payload = {
        name: office.name,
        oblasts: office.oblasts,
        center_lat: office.center_lat,
        center_lng: office.center_lng,
        branch_aliases: office.branch_aliases,
        sort_order: office.sort_order,
        is_active: office.is_active !== false,
        updated_at: new Date().toISOString()
    };
    if (office.id) payload.id = office.id;

    const { data, error } = await sb
        .from('regional_offices')
        .upsert(payload, { onConflict: 'id' })
        .select()
        .single();
    if (error) throw new Error(error.message);
    return data;
}

export async function deleteRegionalOffice(id) {
    const { error } = await sb
        .from('regional_offices')
        .delete()
        .eq('id', id);
    if (error) throw new Error(error.message);
}
