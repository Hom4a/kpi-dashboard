// ===== Indicators + Branches + Species Loader =====
// Preload з on-prem БД master-списків для monthly render:
//  • `indicators` — 54 показники (scalar/volprice/text/derived), formula metadata
//  • `salary_branches` — 20 рядків salary (Excel-порядок)
//  • `animal_species` — 6 видів
import { sb } from '../config.js';

let _indicators = [];
const _indById = new Map();
const _indByCode = new Map();

let _branches = [];
let _species = [];

// Monthly layout:
export const MONTHLY_TABLE_1_BLOCKS = ['M_FIN', 'M_REV', 'M_PROD', 'M_FOR'];
export const MONTHLY_TABLE_2_BLOCKS = ['M_TAX'];

export async function preloadIndicators() {
    const [indResp, brResp, spResp] = await Promise.all([
        sb.from('indicators')
            .select('id, code, canonical_name, block_id, unit, value_kind, ytd_formula, weight_by_id, derived_formula, is_header, is_subitem, parent_id, sort_order, active')
            .eq('active', true)
            .order('sort_order', { ascending: true }),
        sb.from('salary_branches')
            .select('id, code, canonical_name, branch_kind, sort_order')
            .eq('active', true)
            .order('sort_order', { ascending: true }),
        sb.from('animal_species')
            .select('id, code, canonical_name, sort_order')
            .order('sort_order', { ascending: true }),
    ]);
    if (indResp.error) throw new Error(`indicators: ${indResp.error.message}`);
    if (brResp.error)  throw new Error(`salary_branches: ${brResp.error.message}`);
    if (spResp.error)  throw new Error(`animal_species: ${spResp.error.message}`);

    _indicators = indResp.data || [];
    _indById.clear(); _indByCode.clear();
    for (const i of _indicators) {
        _indById.set(i.id, i);
        _indByCode.set(i.code, i);
    }
    // Resolve weight_by_id → code
    for (const i of _indicators) {
        i.weight_by_code = i.weight_by_id ? _indById.get(i.weight_by_id)?.code || null : null;
    }

    _branches = brResp.data || [];
    _species  = spResp.data || [];

    console.log(`[indicators-loader] ${_indicators.length} indicators, ${_branches.length} branches, ${_species.length} species`);
    return { indicators: _indicators, branches: _branches, species: _species };
}

export function getAllIndicators() { return _indicators; }
export function getIndicatorById(id) { return _indById.get(id); }
export function getIndicatorByCode(code) { return _indByCode.get(code); }

export function getIndicatorsByBlocks(blockIds) {
    const set = new Set(blockIds);
    return _indicators.filter(i => set.has(i.block_id));
}

export function getAllBranches()  { return _branches; }
export function getAllSpecies()   { return _species; }
