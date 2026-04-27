"""Infer revision metadata (``report_type``, ``vintage_date``, ``source_priority``)
from a file's name and structure.

Rules (business domain from Finance dept):
  - Yearly files ``2022_рік.xlsx`` .. ``2025_рік.xlsx``:
        base rows (cols B..M)    → operational, priority=10
        YTD col (N)              → accounting_ytd, priority=20  (via ``ytd_override``)
        vintage = 31 January of year+1
  - ``Основні_показники_{month}_{year}_остання.xlsx``:
        operational, priority=10, vintage = 10th of month+1
  - ``Основні_показники_{month}_{year}.xlsx`` (no suffix):
        operational, priority=10, vintage = 10th of month+1
  - ``Основні_показники_{month}_{year}_проміжний*.xlsx`` /
    ``Основні_показники_проміжний_{month}_{year}*.xlsx``:
        interim, priority=5
  - Unknown filename pattern → operational, priority=1, warning
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from .models import ReportType

MONTHS_UA_ORDER: dict[str, int] = {
    "січень": 1, "лютий": 2, "березень": 3, "квітень": 4, "травень": 5,
    "червень": 6, "липень": 7, "серпень": 8, "вересень": 9,
    "жовтень": 10, "листопад": 11, "грудень": 12,
}


@dataclass
class ReportMetadata:
    """Per-file revision metadata (plus optional YTD-column override)."""

    report_type: ReportType
    vintage_date: datetime
    source_priority: int
    ytd_override: "ReportMetadata | None" = None
    warnings: list[str] = field(default_factory=list)


def _tenth_of_next_month(year: int, month: int) -> datetime:
    """Finance cycle closes by 10th of the next month."""
    if month == 12:
        return datetime(year + 1, 1, 10)
    return datetime(year, month + 1, 10)


def _parse_year_from_name(stem: str) -> int | None:
    """Match ``2022_рік``, ``2024``, ``2025_рік`` in a filename stem."""
    m = re.search(r"\b(20\d{2})(?:[_\s]*рік)?\b", stem)
    return int(m.group(1)) if m else None


def _parse_month_year_from_osnovni(stem: str) -> tuple[int, int] | None:
    """Return (year, month) parsed from «Основні_показники_{month}_{year}…»."""
    low = stem.lower()
    month_idx: int | None = None
    for name, idx in MONTHS_UA_ORDER.items():
        if name in low:
            month_idx = idx
            break
    if month_idx is None:
        return None
    y_match = re.search(r"(20\d{2})", low)
    if not y_match:
        return None
    return int(y_match.group(1)), month_idx


def infer_report_metadata(path: str | Path) -> ReportMetadata:
    """Inspect a file name and return canonical revision metadata."""
    stem = Path(path).stem  # file name without extension
    low = stem.lower()

    # --- Osnovni показники variants ---
    if "основні" in low and "показник" in low:
        my = _parse_month_year_from_osnovni(stem)
        if my is None:
            return ReportMetadata(
                report_type="operational",
                vintage_date=datetime(2000, 1, 1),
                source_priority=1,
                warnings=[f"unknown_file_pattern: {Path(path).name}"],
            )
        year, month = my
        vintage = _tenth_of_next_month(year, month)
        # "проміжний" anywhere → interim (priority=5)
        if "проміжн" in low:
            return ReportMetadata(
                report_type="interim",
                vintage_date=vintage,
                source_priority=5,
            )
        # "остання" or no suffix → operational (priority=10)
        return ReportMetadata(
            report_type="operational",
            vintage_date=vintage,
            source_priority=10,
        )

    # --- Yearly «{YYYY} рік» files ---
    year = _parse_year_from_name(stem)
    if year is not None and ("рік" in low or re.fullmatch(r"\s*20\d{2}\s*", stem.strip())):
        vintage = datetime(year + 1, 1, 31)
        base = ReportMetadata(
            report_type="operational",
            vintage_date=vintage,
            source_priority=10,
        )
        base.ytd_override = ReportMetadata(
            report_type="accounting_ytd",
            vintage_date=vintage,
            source_priority=20,
        )
        return base

    return ReportMetadata(
        report_type="operational",
        vintage_date=datetime(2000, 1, 1),
        source_priority=1,
        warnings=[f"unknown_file_pattern: {Path(path).name}"],
    )
