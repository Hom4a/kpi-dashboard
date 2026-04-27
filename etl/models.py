"""Canonical data models returned by parsers.

Each fact row carries revision metadata:
  - ``vintage_date``     — when the number was "frozen" in its source document
  - ``report_type``      — the authoritative kind (operational/accounting_ytd/…)
  - ``source_priority``  — higher wins when multiple sources report the same fact

Business rule: a finance operation cycle closes around the 10th of the next
month; later reports routinely revise earlier figures (reversals, corrections).
Canonical views resolve these into a single "winning" value per metric+period.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ReportType = Literal[
    "operational",
    "accounting_ytd",
    "official_annual",
    "audit",
    "interim",
]


class AnnualValue(BaseModel):
    """Annual or YTD scalar value for a metric (one year, one column).

    A fact may carry numeric, textual, or both forms — text values arise from
    pending markers ("до 18.04.2026"), narrative cells, and similar non-numeric
    annotations that the source treats as a deliberate value, not missing data.
    """

    metric_code: str
    year: int
    value: float | None = None
    value_text: str | None = None
    is_ytd: bool = False
    source_file: str
    source_row: int
    vintage_date: datetime
    report_type: ReportType
    source_priority: int


class MonthlyValue(BaseModel):
    """Monthly scalar value for a metric (year + month)."""

    metric_code: str
    year: int
    month: int = Field(ge=1, le=12)
    value: float | None = None
    value_text: str | None = None
    source_file: str
    source_row: int
    vintage_date: datetime
    report_type: ReportType
    source_priority: int


class SpeciesAnnual(BaseModel):
    """Annual composite (volume/price) for a timber species."""

    species: str
    year: int
    volume_km3: float | None = None
    avg_price_grn: float | None = None
    source_file: str
    source_row: int
    vintage_date: datetime
    report_type: ReportType
    source_priority: int


class SpeciesMonthly(BaseModel):
    """Monthly composite (volume/price) for a timber species."""

    species: str
    year: int
    month: int = Field(ge=1, le=12)
    volume_km3: float | None = None
    avg_price_grn: float | None = None
    source_file: str
    source_row: int
    vintage_date: datetime
    report_type: ReportType
    source_priority: int


class ParseResult(BaseModel):
    """Output of any parser: typed rows + diagnostics."""

    annual: list[AnnualValue] = Field(default_factory=list)
    monthly: list[MonthlyValue] = Field(default_factory=list)
    species_annual: list[SpeciesAnnual] = Field(default_factory=list)
    species_monthly: list[SpeciesMonthly] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
