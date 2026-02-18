// ===== Market Dashboard State =====

export let marketPrices = [];
export let marketUaDetail = [];
export let marketHistory = [];
export let eurRates = [];
export let filteredMarketPrices = [];
export let marketMeta = { period: '', eurRate: 0 };
export let marketFilterState = { country: '', woodType: 'all' };

export function setMarketPrices(v) { marketPrices = v; }
export function setMarketUaDetail(v) { marketUaDetail = v; }
export function setMarketHistory(v) { marketHistory = v; }
export function setEurRates(v) { eurRates = v; }
export function setFilteredMarketPrices(v) { filteredMarketPrices = v; }
export function setMarketMeta(v) { marketMeta = v; }
export function setMarketFilterState(v) { marketFilterState = v; }
