// ===== Market Dashboard State =====

export let marketPrices = [];       // all periods
export let marketUaDetail = [];     // all periods
export let marketHistory = [];
export let eurRates = [];
export let filteredMarketPrices = [];
export let marketMeta = { period: '', eurRate: 0 };
export let marketFilterState = { country: '', woodType: 'all', period: '' };
export let allPeriods = [];         // sorted desc: ['грудень 2025', 'листопад 2025']

export function setMarketPrices(v) { marketPrices = v; }
export function setMarketUaDetail(v) { marketUaDetail = v; }
export function setMarketHistory(v) { marketHistory = v; }
export function setEurRates(v) { eurRates = v; }
export function setFilteredMarketPrices(v) { filteredMarketPrices = v; }
export function setMarketMeta(v) { marketMeta = v; }
export function setMarketFilterState(v) { marketFilterState = v; }
export function setAllPeriods(v) { allPeriods = v; }
