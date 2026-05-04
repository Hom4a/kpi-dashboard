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

// Finance metrics from M_FIN block that Excel layout shows again
// inside the tax/finance block (rows 63-67 in 2025_рік.xlsx). Stored
// once in DB (M_FIN, sort 50-90) — frontend cross-renders them at
// the bottom of Table 2 to mimic Excel reading order.
//
// Order matches Excel rows 63-67.
export const TAX_BLOCK_FIN_CROSSRENDER_CODES = [
    'budget_overdue_mln',  // Excel row 63
    'pf_overdue_mln',      // row 64
    'receivables_mln',     // row 65
    'payables_mln',        // row 66
    'cash_balance_mln',    // row 67
];

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

/**
 * Returns the indicator list for the monthly Table 2 ("Податки та збори").
 * Includes actual M_TAX indicators (10 rows, sort 400-490) plus 5 M_FIN
 * crossrendered finance metrics at the bottom — replicating the Excel
 * layout where rows 63-67 repeat the fin block under the tax header.
 */
export function getTaxBlockIndicators() {
    const taxBlock = getIndicatorsByBlocks(['M_TAX']);
    const crossrenderSet = new Set(TAX_BLOCK_FIN_CROSSRENDER_CODES);
    // Filter and reorder to match TAX_BLOCK_FIN_CROSSRENDER_CODES sequence.
    const finByCode = new Map(
        _indicators
            .filter(i => crossrenderSet.has(i.code))
            .map(i => [i.code, i])
    );
    const orderedFin = TAX_BLOCK_FIN_CROSSRENDER_CODES
        .map(code => finByCode.get(code))
        .filter(i => i !== undefined);
    return [...taxBlock, ...orderedFin];
}

export function getAllBranches()  { return _branches; }
export function getAllSpecies()   { return _species; }
