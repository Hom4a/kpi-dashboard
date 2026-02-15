// ===== Forest Dashboard State =====

export let pricesData = [];
export let inventoryData = [];
export let filteredPrices = [];
export let filteredInventory = [];
export let forestFilterState = {
    branch: '', region: '', product: '', species: '', warehouse: '', quality: ''
};

export function setPricesData(v) { pricesData = v; }
export function setInventoryData(v) { inventoryData = v; }
export function setFilteredPrices(v) { filteredPrices = v; }
export function setFilteredInventory(v) { filteredInventory = v; }
export function setForestFilterState(v) { forestFilterState = v; }
