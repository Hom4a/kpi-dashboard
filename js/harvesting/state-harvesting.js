// ===== Harvesting Dashboard State =====
export let planFactData = [];
export let zsuData = [];
export let filteredPlanFact = [];
export let filteredZsu = [];
export let harvestingFilterState = { office: '' };

export function setPlanFactData(v) { planFactData = v; }
export function setZsuData(v) { zsuData = v; }
export function setFilteredPlanFact(v) { filteredPlanFact = v; }
export function setFilteredZsu(v) { filteredZsu = v; }
export function setHarvestingFilterState(v) { harvestingFilterState = v; }
