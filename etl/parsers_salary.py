"""Extract the «Середня з/п по лісових офісах» (per-branch salary) block.

Used by ``parser_annual_monthly`` (yearly Excel — wide-by-month). The
osnovni format has a different geometry (rows by year, region in
column C row 8) and is handled separately in 5.4.3.

Each branch row produces up to 13 ``SalaryValue`` emits:
  * 12 monthly snapshots (cols B..M, ``month=1..12``, ``base_meta``)
  * 1 annual average     (col N,    ``month=0``,    ``ytd_meta``)

``region_avg_uah`` is read once per branch from column O and
propagated to all 13 rows of that branch — repository layer treats
it as a per-period comparator, even though the source workbook
declares it once.

Edge-cases the production data exhibits (verified against
``raw_data/2025_рік.xlsx``):

  E1. Closed/pending branch cell (``"всі філії закриті"``,
      ``"до 18.04.2026"``) → ``safe_number`` returns ``val=None``,
      we skip that period entirely (variant B — no emit, no
      warning, since the branch genuinely had no payroll).
  E2. Empty mid-year cells → skip the period only; the rest of
      the branch row keeps emitting.
  E3. Two consecutive fully-empty rows terminate the section
      (mirrors ``extract_reference_block`` E3).
  E4. Footnote line (``"*тощо"``, ``"** у березні..."``) terminates;
      footnotes always come AFTER the data block in 2022-2025 files.
  E5. Defensive: a stray ``"Довідково:"`` header also terminates
      (should not happen because reference is extracted independently,
      but cheap safety check).
  E6. Workbook without a salary block (e.g. early formats) →
      ``([], ["no_salary_block_found"])`` — info-level warning,
      not a fatal error (consistent with reference E2).
  E7. Branch name verbatim (``'Філія "Карпатський лісовий офіс"'``):
      no trim of quotes, no normalisation, no casefold —
      repository alias-resolver layer maps to canonical
      ``salary_branches.code``.
"""
from __future__ import annotations

from typing import Any

from .models import SalaryValue
from .report_metadata import ReportMetadata
from .utils import safe_number

# Geometry stable since the 2022 file format introduction. If a future
# format moves columns, callers should hardcode-override here rather
# than auto-detect (auto-detect adds opaque failure modes).
_SALARY_HEADER_KEYWORD = "середня з/п по лісових офісах"  # casefold A-cell substring
_REGION_COL = 15   # column O — header "Середня з/п в регіоні"
_YTD_COL = 14      # column N — header "Середня за рік" (annual avg, NOT YTD-sum)

_MONTH_COL_START = 2   # column B
_MONTH_COL_END = 13    # column M


def _find_salary_header(ws: Any) -> int | None:
    """Return the 1-based row index of the salary block header, or None.

    Linear scan from row 1; the keyword is unique enough that one match
    is the answer (see geometry note in module docstring).
    """
    for row_idx in range(1, ws.max_row + 1):
        a = ws.cell(row_idx, 1).value
        if a is None:
            continue
        if _SALARY_HEADER_KEYWORD in str(a).strip().casefold():
            return row_idx
    return None


def extract_salary_block(
    ws: Any,
    *,
    month_map: dict[int, tuple[int, int]],
    ytd_year: int,
    source_file: str,
    base_meta: ReportMetadata,
    ytd_meta: ReportMetadata,
    start_row: int | None = None,
) -> tuple[list[SalaryValue], list[str]]:
    """Walk the salary-by-branch section of one worksheet.

    Args:
        ws: openpyxl worksheet (the single sheet to scan).
        month_map: ``{col_idx: (year, month)}`` from the main parser's
            ``_build_month_map``. We assume the salary section's date
            sub-header (row 69 in 2025 file) matches the main header —
            verified true in production data; if that ever breaks the
            caller should pass a separately-built map.
        ytd_year: year to attach to ``month=0`` (annual avg) emits.
        source_file: absolute or relative path stored on each emit for audit.
        base_meta: metadata for monthly emits (operational/priority=10
            in production yearly files).
        ytd_meta: metadata for the ``month=0`` annual-avg emit
            (accounting_ytd/priority=20 via ``ytd_override``).
        start_row: caller-provided header row index. When None we scan
            (E6: returns warning if not found).
    """
    rows: list[SalaryValue] = []
    warnings: list[str] = []

    header_row = start_row if start_row is not None else _find_salary_header(ws)
    if header_row is None:
        warnings.append("no_salary_block_found")
        return rows, warnings

    empty_streak = 0

    for row_idx in range(header_row + 1, ws.max_row + 1):
        a = ws.cell(row_idx, 1).value
        a_str = "" if a is None else str(a).strip()

        # E3 — two consecutive empty rows terminate.
        if a_str == "":
            empty_streak += 1
            if empty_streak >= 2:
                break
            continue
        empty_streak = 0

        # E4 — footnote line ends the section.
        if a_str.startswith("*"):
            break

        # E5 — defensive: reference header should not appear here, but
        # if it does we hand control back to the main parser.
        if a_str.casefold().startswith("довідково"):
            break

        branch_name = a_str  # E7 — verbatim, no normalise

        # Region is per-branch; propagated to all 13 emits. Empty in
        # 2025_рік.xlsx; older files / other formats may populate it.
        region_val, _, _ = safe_number(ws.cell(row_idx, _REGION_COL).value)

        for col, (year, month) in month_map.items():
            val, _warn, _raw = safe_number(ws.cell(row_idx, col).value)
            if val is None:
                # E1/E2 — closed branch, pending cell, or genuinely empty.
                # Variant B: skip period entirely, no warning (closed
                # branches are a real business state, not a parser fault).
                continue
            rows.append(
                SalaryValue(
                    branch_name=branch_name,
                    year=year,
                    month=month,
                    salary_uah=val,
                    region_avg_uah=region_val,
                    source_file=source_file,
                    source_row=row_idx,
                    vintage_date=base_meta.vintage_date,
                    report_type=base_meta.report_type,
                    source_priority=base_meta.source_priority,
                )
            )

        ytd_val, _warn, _raw = safe_number(ws.cell(row_idx, _YTD_COL).value)
        if ytd_val is not None:
            rows.append(
                SalaryValue(
                    branch_name=branch_name,
                    year=ytd_year,
                    month=0,
                    salary_uah=ytd_val,
                    region_avg_uah=region_val,
                    source_file=source_file,
                    source_row=row_idx,
                    vintage_date=ytd_meta.vintage_date,
                    report_type=ytd_meta.report_type,
                    source_priority=ytd_meta.source_priority,
                )
            )

    return rows, warnings


__all__ = ["extract_salary_block"]
