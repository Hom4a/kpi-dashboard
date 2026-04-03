// ===== Summary State =====

export let summaryIndicators = [];
export let summaryWeekly = [];
export let summaryWeeklyNotes = [];
export let summaryFilterState = { year: '', group: 'all' };

export function setSummaryIndicators(v) { summaryIndicators = v; }
export function setSummaryWeekly(v) { summaryWeekly = v; }
export function setSummaryWeeklyNotes(v) { summaryWeeklyNotes = v; }
export function setSummaryFilterState(v) { summaryFilterState = v; }

export let summaryBlockComments = [];
export function setSummaryBlockComments(v) { summaryBlockComments = v; }

export let selectedWeeklyDate = null;
export function setSelectedWeeklyDate(v) { selectedWeeklyDate = v; }
